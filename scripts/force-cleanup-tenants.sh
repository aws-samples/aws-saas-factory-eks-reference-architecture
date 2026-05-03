#!/bin/bash
# Best-effort cleanup of orphan tenant resources left behind by failed
# deletion flows. Rescue tool for when cleanup.sh / destroy-all.sh have
# already been tried and left DELETE_FAILED stacks + orphan UserPools.
#
# What it does:
#   1. Retry delete-stack on every TenantStack-* in DELETE_FAILED state.
#   2. Wait for each to finish.
#   3. Any stack still stuck — call delete-stack again with
#      --deletion-mode FORCE_DELETE_STACK (equivalent to the CloudFormation
#      console's "Force delete this entire stack" option). This removes the
#      stack from CloudFormation regardless of resource deletion errors.
#      NOTE: this may leave actual AWS resources orphaned. They have to be
#      cleaned up separately. This script handles the common orphan case
#      (per-tenant Cognito UserPools) in step 4.
#   4. Delete orphan per-tenant Cognito UserPools (Name ending with
#      -UserPool).
#   5. Print summary of remaining stacks and user pools.
#
# Does NOT touch:
#   - The system ControlPlane UserPool (CognitoAuth...).
#   - Shared stacks (EKSSaaSCluster, Services, etc).
#   - Kubernetes namespaces directly.
#
# Safe to re-run.

set -u
set -o pipefail

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
list_failed_tenant_stacks() {
  aws cloudformation list-stacks \
    --stack-status-filter DELETE_FAILED \
    --query "StackSummaries[?starts_with(StackName,'TenantStack-')].StackName" \
    --output text | tr '\t' '\n' | awk 'NF'
}

list_any_tenant_stacks() {
  aws cloudformation list-stacks \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE DELETE_FAILED DELETE_IN_PROGRESS \
    --query "StackSummaries[?starts_with(StackName,'TenantStack-')].StackName" \
    --output text | tr '\t' '\n' | awk 'NF'
}

wait_for_stack_deletions() {
  # $1: newline-separated list of stack names.
  local names="$1"
  local name pids=()
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    # Run each wait in background so multiple stacks can finish in parallel.
    aws cloudformation wait stack-delete-complete --stack-name "$name" 2>/dev/null &
    pids+=($!)
  done <<< "$names"
  # Wait for all waiters to finish. Ignore individual failures; we re-check
  # status afterward.
  local pid
  for pid in "${pids[@]}"; do
    wait "$pid" || true
  done
}

# ---------------------------------------------------------------------------
# Step 1: Plain retry of DELETE_FAILED stacks
# ---------------------------------------------------------------------------
log "Listing DELETE_FAILED tenant stacks..."
FAILED_STACKS=$(list_failed_tenant_stacks)

if [[ -z "$FAILED_STACKS" ]]; then
  log "  (none)"
else
  while IFS= read -r STACK; do
    [[ -z "$STACK" ]] && continue
    log "  delete-stack (standard) for $STACK"
    aws cloudformation delete-stack --stack-name "$STACK" 2>&1 | sed 's/^/    /'
  done <<< "$FAILED_STACKS"

  log "Waiting for plain deletions to finish (may take several minutes)..."
  wait_for_stack_deletions "$FAILED_STACKS"
fi

# ---------------------------------------------------------------------------
# Step 2: Anything still DELETE_FAILED — force delete
# ---------------------------------------------------------------------------
log "Re-checking for stuck stacks..."
STUCK_STACKS=$(list_failed_tenant_stacks)

if [[ -z "$STUCK_STACKS" ]]; then
  log "  (none — all previously-failed stacks resolved)"
else
  log "Stacks still DELETE_FAILED — escalating to FORCE_DELETE_STACK:"
  while IFS= read -r STACK; do
    [[ -z "$STACK" ]] && continue
    log "  force delete-stack for $STACK"
    # FORCE_DELETE_STACK tells CloudFormation to remove the stack even when
    # constituent resources fail to delete. Orphan resources are the
    # caller's problem afterwards.
    if ! aws cloudformation delete-stack \
           --stack-name "$STACK" \
           --deletion-mode FORCE_DELETE_STACK 2>&1 | sed 's/^/    /'; then
      warn "  force delete failed to submit for $STACK — does your AWS CLI support --deletion-mode?"
    fi
  done <<< "$STUCK_STACKS"

  log "Waiting for force deletions to finish..."
  wait_for_stack_deletions "$STUCK_STACKS"
fi

# ---------------------------------------------------------------------------
# Step 3: Report anything still failed (should be empty after force delete)
# ---------------------------------------------------------------------------
STILL_FAILED=$(list_failed_tenant_stacks)
if [[ -n "$STILL_FAILED" ]]; then
  log "Stacks still DELETE_FAILED after force delete:"
  while IFS= read -r STACK; do
    [[ -z "$STACK" ]] && continue
    echo ""
    echo "===== $STACK ====="
    aws cloudformation describe-stack-events --stack-name "$STACK" \
      --query 'StackEvents[?ResourceStatus==`DELETE_FAILED`].{Logical:LogicalResourceId,Type:ResourceType,Reason:ResourceStatusReason}' \
      --output table 2>/dev/null | head -30 || echo "  (could not read events)"
  done <<< "$STILL_FAILED"
else
  log "  No stacks remain in DELETE_FAILED."
fi

# ---------------------------------------------------------------------------
# Step 4: Orphan per-tenant Cognito UserPools
# ---------------------------------------------------------------------------
log "Scanning for orphan tenant UserPools..."
ORPHAN_POOLS=$(aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?ends_with(Name, '-UserPool')].Id" \
  --output text | tr '\t' '\n' | awk 'NF')

if [[ -z "$ORPHAN_POOLS" ]]; then
  log "  (none)"
else
  while IFS= read -r POOL_ID; do
    [[ -z "$POOL_ID" ]] && continue
    POOL_NAME=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_ID" \
      --query 'UserPool.Name' --output text 2>/dev/null)
    POOL_DOMAIN=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_ID" \
      --query 'UserPool.Domain' --output text 2>/dev/null)
    log "  deleting UserPool $POOL_ID ($POOL_NAME)"
    if [[ -n "$POOL_DOMAIN" && "$POOL_DOMAIN" != "None" ]]; then
      aws cognito-idp delete-user-pool-domain \
        --user-pool-id "$POOL_ID" --domain "$POOL_DOMAIN" 2>&1 | sed 's/^/    /' || true
    fi
    aws cognito-idp delete-user-pool --user-pool-id "$POOL_ID" 2>&1 | sed 's/^/    /' || true
  done <<< "$ORPHAN_POOLS"
fi

# ---------------------------------------------------------------------------
# Step 5: Summary
# ---------------------------------------------------------------------------
echo
echo "========================================================================"
echo "Summary"
echo "========================================================================"
echo "Tenant stacks remaining:"
REMAINING=$(list_any_tenant_stacks)
if [[ -z "$REMAINING" ]]; then
  echo "  (none)"
else
  aws cloudformation list-stacks \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE DELETE_FAILED DELETE_IN_PROGRESS \
    --query "StackSummaries[?starts_with(StackName,'TenantStack-')].{Name:StackName,Status:StackStatus}" \
    --output table
fi

echo "User pools remaining:"
aws cognito-idp list-user-pools --max-results 60 \
  --query 'UserPools[].{Id:Id,Name:Name}' --output table

#!/bin/bash -e

# Deprovision an EKS tenant.
#
# Invoked by SBT DeprovisioningScriptJob (configured in
# lib/app-plane-stack.ts) which passes tenantId and tier as environment
# variables derived from the Offboarding EventBridge event payload. See
# `environmentStringVariablesFromIncomingEvent` in that file.
#
# Mirrors scripts/provisioning.sh: that script triggers
# TenantOnboardingProject on create; this one triggers TenantDeletionProject
# on delete. TenantDeletionProject runs `cdk destroy TenantStack-$TENANT_ID`
# plus (since the kubectl-delete-namespace pre_build was added in
# lib/constructs/tenant-onboarding.ts) a `kubectl delete namespace` cleanup
# so orphan Deployment/Service/VirtualService workloads go away.

aws codebuild start-build --project-name TenantDeletionProject \
  --environment-variables-override \
  name=TENANT_ID,value=$tenantId,type=PLAINTEXT

STACK_NAME="TenantStack-$tenantId"

# Wait for the stack to transition into a terminal state. Note:
# `stack-delete-complete` returns success both when the stack finishes
# deleting and when it has already been deleted (does not exist).
echo "Waiting for $STACK_NAME to reach DELETE_COMPLETE..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" || {
  # If the wait fails we still want to surface the terminal status instead
  # of leaving the caller confused.
  LAST_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "MISSING")
  echo "Stack status after wait: $LAST_STATUS"
}

# Export variables consumed by SBT's DeprovisioningScriptJob (see
# environmentVariablesToOutgoingEvent in lib/app-plane-stack.ts).
export tenantStatus="Deleted"

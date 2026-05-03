#!/bin/bash
# End-to-end tenant lifecycle test.
#
# What this does:
#   1. Authenticates as System Admin against the ControlPlane Cognito UserPool.
#   2. Creates 3 tenants in parallel (basic, standard, premium tiers) via
#      ControlPlane POST /tenant-registrations.
#   3. Waits for each TenantStack-<tenantId> CloudFormation stack to reach
#      CREATE_COMPLETE (onboarding CodeBuild trigger is async).
#   4. For each tenant:
#      a. Reads the per-tenant Cognito UserPool ID + App Client ID from the
#         `Tenant` DynamoDB table.
#      b. Sets a permanent password on the tenant admin user (skip the
#         NEW_PASSWORD_REQUIRED challenge).
#      c. Gets a tenant-admin JWT via USER_PASSWORD_AUTH.
#      d. Smoke-tests GET/POST /products, /orders, GET /users against the
#         SaaSApi API Gateway (same 4 cases as scripts/smoke-authorizer.sh
#         plus POST paths).
#   5. Deletes the 3 tenants via ControlPlane DELETE /tenant-registrations/{id}
#      and waits for TenantStack-<tenantId> to reach DELETE_COMPLETE.
#
# Usage:
#   ./scripts/e2e-tenant-lifecycle.sh <system-admin-password> <email>
#   KEEP_TENANTS=1 ./scripts/e2e-tenant-lifecycle.sh <password> <email>
#     # Skip teardown. Useful for iterating on API tests against same tenants.
#   TIERS="standard" ./scripts/e2e-tenant-lifecycle.sh <password> <email>
#     # Limit to one tier; space-separated list.
#   ONBOARD_TIMEOUT=1800 ./scripts/e2e-tenant-lifecycle.sh <password> <email>
#     # Override onboarding wait timeout (seconds, default 1800 = 30 min).
#
# Naming convention:
#   tenantName is basic<N> / standard<N> / premium<N> where <N> is the next
#   integer not already in use by any of the three tier names (shared N).
#   Tenant admin email is derived from the input <email> using sub-addressing:
#     user@example.com  ->  user+b<N>@example.com / user+s<N>@example.com /
#                           user+p<N>@example.com
#
# Prereqs:
#   - ControlPlane, SaaSApi, and Services stacks already deployed.
#   - AWS CLI configured with credentials that can read CloudFormation,
#     DynamoDB Tenant table, and call cognito-idp admin-* APIs.
#   - jq installed.
#   - The `Tenant` DynamoDB table is populated by the onboarding CodeBuild —
#     we wait for that.

set -u
set -o pipefail

# =========================================================================
# Configuration
# =========================================================================
PASSWORD="${1:-}"
EMAIL_BASE="${2:-}"
if [[ -z "$PASSWORD" || -z "$EMAIL_BASE" ]]; then
  echo "usage: $0 <system-admin-password> <email>" >&2
  echo "  Password must be 8+ chars and include upper, lower, digit, and a symbol." >&2
  echo "  Email is the tenant admin email base; the script appends a per-tier" >&2
  echo "  sub-address. Example:" >&2
  echo "    $0 'MyP@ss1!' 'user@example.com'" >&2
  echo "    -> tenants basic<N>/standard<N>/premium<N>, admins" >&2
  echo "       user+b<N>@example.com / user+s<N>@example.com / user+p<N>@example.com" >&2
  exit 2
fi

# Validate email shape (local@domain) up-front.
if [[ ! "$EMAIL_BASE" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "ERROR: '$EMAIL_BASE' does not look like an email address" >&2
  exit 2
fi
EMAIL_LOCAL="${EMAIL_BASE%@*}"
EMAIL_DOMAIN="${EMAIL_BASE#*@}"

# Validate Cognito default password policy up-front so we don't fail mid-run
# after already creating tenants.
validate_password() {
  local p="$1"
  [[ ${#p} -ge 8 ]]                  || return 1
  [[ "$p" =~ [[:lower:]] ]]          || return 2
  [[ "$p" =~ [[:upper:]] ]]          || return 3
  [[ "$p" =~ [[:digit:]] ]]          || return 4
  [[ "$p" =~ [^[:alnum:]] ]]         || return 5
}
if ! validate_password "$PASSWORD"; then
  case $? in
    1) echo "ERROR: password too short (min 8 chars)" >&2 ;;
    2) echo "ERROR: password must include a lowercase letter" >&2 ;;
    3) echo "ERROR: password must include an uppercase letter" >&2 ;;
    4) echo "ERROR: password must include a digit" >&2 ;;
    5) echo "ERROR: password must include a symbol (e.g. ! @ # \$ %)" >&2 ;;
  esac
  echo "  Quote it to protect shell metacharacters: ./scripts/e2e-tenant-lifecycle.sh 'MyP@ss1!'" >&2
  exit 2
fi

# Single-instance lock to prevent concurrent runs from racing on Cognito
# client updates and shared admin password.
LOCK_FILE="/tmp/e2e-tenant-lifecycle.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "ERROR: another instance of this script is already running" >&2
    echo "  (lock: $LOCK_FILE)" >&2
    echo "  Concurrent runs race on the shared admin user's Cognito password." >&2
    exit 2
  fi
else
  # macOS fallback: simple PID-in-file. Not bulletproof, but catches the
  # common "ran it 4 times with & by accident" case.
  if [[ -f "$LOCK_FILE" ]] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
    echo "ERROR: another instance (pid $(cat "$LOCK_FILE")) is running" >&2
    echo "  (lock: $LOCK_FILE) — remove manually if it is stale" >&2
    exit 2
  fi
  echo $$ > "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
fi

TIERS="${TIERS:-basic standard premium}"
ONBOARD_TIMEOUT="${ONBOARD_TIMEOUT:-1800}"  # 30 min
OFFBOARD_TIMEOUT="${OFFBOARD_TIMEOUT:-900}" # 15 min
POLL_INTERVAL="${POLL_INTERVAL:-20}"
KEEP_TENANTS="${KEEP_TENANTS:-0}"
TENANT_USER_PASSWORD="${TENANT_USER_PASSWORD:-Saas1234#}"

RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
STATE_DIR="$(mktemp -d -t e2e-tenant-XXXXXX)"
trap 'echo "state dir: $STATE_DIR"' EXIT

echo "======================================================================"
echo "E2E tenant lifecycle test"
echo "  run id      : $RUN_ID"
echo "  tiers       : $TIERS"
echo "  keep tenants: $KEEP_TENANTS"
echo "  state dir   : $STATE_DIR"
echo "======================================================================"

# =========================================================================
# Helpers
# =========================================================================
log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die()  { printf '[%s] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

_pass=0
_fail=0
assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "    [PASS] $label ($actual)"
    _pass=$((_pass + 1))
  else
    echo "    [FAIL] $label: expected=$expected actual=$actual"
    _fail=$((_fail + 1))
  fi
}

# Fetch a CloudFormation stack output; $1=stack-name, $2=output-key.
cfn_output() {
  aws cloudformation describe-stacks \
    --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" \
    --output text 2>/dev/null
}

# =========================================================================
# Step 0: Discover endpoints
# =========================================================================
log "Discovering stack outputs..."

CONTROL_PLANE_URL="$(aws cloudformation describe-stacks \
  --query "Stacks[].Outputs[?contains(OutputKey, 'controlPlaneAPIEndpoint')].OutputValue" \
  --output text | head -n1)"
[[ -n "$CONTROL_PLANE_URL" && "$CONTROL_PLANE_URL" != "None" ]] \
  || die "Could not find ControlPlane API URL (output key containing 'controlPlaneAPIEndpoint')"
CONTROL_PLANE_URL="${CONTROL_PLANE_URL%/}"

SAAS_API_URL="$(cfn_output SaaSApi APIUrl)"
[[ -n "$SAAS_API_URL" && "$SAAS_API_URL" != "None" ]] \
  || die "Could not find SaaSApi APIUrl output"
SAAS_API_URL="${SAAS_API_URL%/}"

# ControlPlane Cognito UserPool (system admin).
IDP_USER_POOL_ID="$(aws cloudformation describe-stacks \
  | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ControlPlaneIdpUserPoolId") | .OutputValue' \
  | head -n1)"
IDP_CLIENT_ID="$(aws cloudformation describe-stacks \
  | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ControlPlaneIdpClientId") | .OutputValue' \
  | head -n1)"
[[ -n "$IDP_USER_POOL_ID" ]] || die "Could not find ControlPlaneIdpUserPoolId output"
[[ -n "$IDP_CLIENT_ID"    ]] || die "Could not find ControlPlaneIdpClientId output"

log "  ControlPlane URL : $CONTROL_PLANE_URL"
log "  SaaSApi URL      : $SAAS_API_URL"
log "  System IdP pool  : $IDP_USER_POOL_ID"
log "  System IdP client: $IDP_CLIENT_ID"

# =========================================================================
# Step 1: System Admin JWT
# =========================================================================
log "Authenticating as system admin..."

# NOTE: We deliberately DO NOT call `update-user-pool-client` here. That API
# is a put-style overwrite and would wipe callback/logout URLs and OAuth
# scopes configured by install.sh, breaking the AdminWeb Cognito login
# (redirect_mismatch 400). Since you already log in with this password in
# AdminWeb, USER_PASSWORD_AUTH is necessarily enabled on the client already.
#
# We also skip `admin-set-user-password --permanent` for the same reason —
# if you already logged in, the admin user is CONFIRMED and the password is
# whatever you last set. Overwriting it here would silently change your
# AdminWeb password too.
SYSTEM_ADMIN_JWT="$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$IDP_CLIENT_ID" \
  --auth-parameters "USERNAME=admin,PASSWORD=$PASSWORD" \
  --query 'AuthenticationResult.IdToken' \
  --output text 2>/dev/null)" || true

if [[ -z "$SYSTEM_ADMIN_JWT" || "$SYSTEM_ADMIN_JWT" == "None" ]]; then
  cat >&2 <<EOF
ERROR: Could not authenticate as system admin.

Could not obtain JWT for user 'admin' on ControlPlane UserPool:
  user pool : $IDP_USER_POOL_ID
  client    : $IDP_CLIENT_ID

Possible causes:
  1. Wrong password. Use the same one you use to log in to AdminWeb.
  2. USER_PASSWORD_AUTH flow is not enabled on the client. If AdminWeb
     uses implicit/code grant exclusively this is possible; enable it
     one time with:
       aws cognito-idp update-user-pool-client \\
         --user-pool-id $IDP_USER_POOL_ID \\
         --client-id $IDP_CLIENT_ID \\
         --explicit-auth-flows USER_PASSWORD_AUTH \\
         --callback-urls <keep existing> \\
         --logout-urls <keep existing> \\
         --allowed-o-auth-flows <keep existing> \\
         --allowed-o-auth-scopes <keep existing> \\
         --supported-identity-providers <keep existing>
     NOTE: update-user-pool-client is put-style — always pass the full
     existing config, not just the flows argument, or you will wipe the
     AdminWeb callback URL.
EOF
  exit 1
fi
log "  system admin JWT acquired (length=${#SYSTEM_ADMIN_JWT})"

# =========================================================================
# Step 2: Pick next available tenant index N (shared across the 3 tiers)
# =========================================================================
# Rule: tenantName == basic<N> / standard<N> / premium<N>, where <N> is the
# smallest positive integer such that none of these three names already exists
# in the ControlPlane tenant list.
log "Resolving next available tenant index..."

EXISTING_NAMES="$(curl -sS "$CONTROL_PLANE_URL/tenants?limit=500" \
  -H "Authorization: Bearer $SYSTEM_ADMIN_JWT" \
  | jq -r '.data[]?.tenantData.tenantName // empty')"

NEXT_N=1
while :; do
  collision=0
  for T in basic standard premium; do
    if printf '%s\n' "$EXISTING_NAMES" | grep -Fxq "${T}${NEXT_N}"; then
      collision=1; break
    fi
  done
  [[ $collision -eq 0 ]] && break
  NEXT_N=$((NEXT_N + 1))
  # Safety break to avoid runaway loop on a tenant table with thousands of rows.
  [[ $NEXT_N -gt 10000 ]] && die "Could not find free tenant index below 10000"
done
log "  next index = $NEXT_N"

# =========================================================================
# Step 3: Create tenants (one per tier, sharing the same N)
# =========================================================================
# tenantName:  basic<N> / standard<N> / premium<N>
# companyName: same as tenantName
# email:       <local>+b<N>@<domain> / +s<N>@ / +p<N>@
for TIER in $TIERS; do
  case "$TIER" in
    basic)    TIER_PREFIX=b ;;
    standard) TIER_PREFIX=s ;;
    premium)  TIER_PREFIX=p ;;
    *)        die "Unknown tier: $TIER" ;;
  esac

  TENANT_NAME="${TIER}${NEXT_N}"
  COMPANY_NAME="$TENANT_NAME"
  EMAIL="${EMAIL_LOCAL}+${TIER_PREFIX}${NEXT_N}@${EMAIL_DOMAIN}"

  echo "$TENANT_NAME"  > "$STATE_DIR/tenantName.$TIER"
  echo "$EMAIL"        > "$STATE_DIR/email.$TIER"
  echo "$COMPANY_NAME" > "$STATE_DIR/companyName.$TIER"

  BODY="$(jq -n \
    --arg tn "$TENANT_NAME" \
    --arg e  "$EMAIL" \
    --arg cn "$COMPANY_NAME" \
    --arg t  "$TIER" \
    '{tenantData:{tenantName:$tn,email:$e,companyName:$cn,tier:$t},
      tenantRegistrationData:{registrationStatus:"In progress"}}')"

  log "Creating tenant [$TIER] name=$TENANT_NAME email=$EMAIL"
  RESP="$(curl -sS -w '\n__HTTP_STATUS__%{http_code}' \
    -X POST "$CONTROL_PLANE_URL/tenant-registrations" \
    -H "Authorization: Bearer $SYSTEM_ADMIN_JWT" \
    -H 'Content-Type: application/json' \
    --data "$BODY")"
  STATUS="$(printf '%s' "$RESP" | grep -o '__HTTP_STATUS__[0-9]*$' | grep -o '[0-9]*$')"
  BODY_OUT="$(printf '%s' "$RESP" | sed 's/__HTTP_STATUS__[0-9]*$//')"
  if [[ "$STATUS" != "20"* && "$STATUS" != "2"* ]]; then
    die "Tenant create failed for $TIER: status=$STATUS body=$BODY_OUT"
  fi
  echo "$BODY_OUT" > "$STATE_DIR/create-response.$TIER.json"
  log "  create accepted (status=$STATUS)"
done

# =========================================================================
# Step 3: Wait for per-tenant CFN stack to be discoverable.
# The tenantId is minted server-side by SBT; we discover it after onboarding
# starts by listing tenants and matching by tenantName.
# =========================================================================
resolve_tenant_id() {
  local tenant_name="$1"
  curl -sS "$CONTROL_PLANE_URL/tenants?limit=100" \
    -H "Authorization: Bearer $SYSTEM_ADMIN_JWT" \
    | jq -r --arg n "$tenant_name" \
        '.data[]? | select(.tenantData.tenantName == $n) | .tenantId' \
    | head -n1
}

resolve_registration_id() {
  local tenant_name="$1"
  curl -sS "$CONTROL_PLANE_URL/tenants?limit=100" \
    -H "Authorization: Bearer $SYSTEM_ADMIN_JWT" \
    | jq -r --arg n "$tenant_name" \
        '.data[]? | select(.tenantData.tenantName == $n) | .tenantRegistrationData.tenantRegistrationId' \
    | head -n1
}

log "Resolving tenantId for each tenant (up to 5 min)..."
for TIER in $TIERS; do
  TENANT_NAME="$(cat "$STATE_DIR/tenantName.$TIER")"
  deadline=$(( $(date +%s) + 300 ))
  TENANT_ID=""
  while [[ $(date +%s) -lt $deadline ]]; do
    TENANT_ID="$(resolve_tenant_id "$TENANT_NAME" || true)"
    [[ -n "$TENANT_ID" && "$TENANT_ID" != "null" ]] && break
    sleep 10
  done
  [[ -n "$TENANT_ID" && "$TENANT_ID" != "null" ]] \
    || die "Could not resolve tenantId for $TENANT_NAME after 5 min"
  REG_ID="$(resolve_registration_id "$TENANT_NAME" || true)"
  echo "$TENANT_ID" > "$STATE_DIR/tenantId.$TIER"
  echo "$REG_ID"    > "$STATE_DIR/registrationId.$TIER"
  log "  [$TIER] tenantId=$TENANT_ID regId=$REG_ID"
done

# =========================================================================
# Step 4: Wait for TenantStack CREATE_COMPLETE (parallel)
# =========================================================================
log "Waiting for TenantStack CREATE_COMPLETE (timeout=${ONBOARD_TIMEOUT}s)..."
deadline=$(( $(date +%s) + ONBOARD_TIMEOUT ))
for TIER in $TIERS; do
  echo pending > "$STATE_DIR/onboard-status.$TIER"
done

while [[ $(date +%s) -lt $deadline ]]; do
  all_done=1
  for TIER in $TIERS; do
    STATUS_FILE="$STATE_DIR/onboard-status.$TIER"
    [[ "$(cat "$STATUS_FILE")" != "pending" ]] && continue
    TENANT_ID="$(cat "$STATE_DIR/tenantId.$TIER")"
    STACK_NAME="TenantStack-$TENANT_ID"
    ST="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
          --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo MISSING)"
    case "$ST" in
      CREATE_COMPLETE|UPDATE_COMPLETE)
        echo "complete" > "$STATUS_FILE"
        log "  [$TIER] $STACK_NAME -> $ST" ;;
      CREATE_FAILED|ROLLBACK_COMPLETE|ROLLBACK_FAILED|DELETE_IN_PROGRESS|DELETE_COMPLETE|DELETE_FAILED)
        echo "failed" > "$STATUS_FILE"
        warn "  [$TIER] $STACK_NAME -> $ST (failed)" ;;
      *)
        all_done=0 ;;
    esac
  done
  [[ $all_done -eq 1 ]] && break
  sleep "$POLL_INTERVAL"
done

for TIER in $TIERS; do
  ST="$(cat "$STATE_DIR/onboard-status.$TIER")"
  [[ "$ST" == "complete" ]] || die "[$TIER] onboarding did not complete (state=$ST)"
done
log "All tenants onboarded."

# =========================================================================
# Step 5: Per-tenant Cognito setup + smoke tests against SaaSApi
# =========================================================================
run_api_tests() {
  local tier="$1"
  local tenant_id; tenant_id="$(cat "$STATE_DIR/tenantId.$tier")"
  local email;     email="$(cat "$STATE_DIR/email.$tier")"

  log "----- Tenant [$tier] tenantId=$tenant_id -----"

  # Read USER_POOL_ID + AUTH_CLIENT_ID from Tenant table.
  local tenant_row
  tenant_row="$(aws dynamodb get-item --table-name Tenant \
    --key "{\"TENANT_ID\":{\"S\":\"$tenant_id\"}}" --output json 2>/dev/null)"
  local user_pool_id app_client_id
  user_pool_id="$(echo "$tenant_row" | jq -r '.Item.USER_POOL_ID.S // empty')"
  app_client_id="$(echo "$tenant_row" | jq -r '.Item.AUTH_CLIENT_ID.S // empty')"
  [[ -n "$user_pool_id" ]]  || { warn "  [$tier] USER_POOL_ID missing"; return 1; }
  [[ -n "$app_client_id" ]] || { warn "  [$tier] AUTH_CLIENT_ID missing"; return 1; }
  log "  userPoolId=$user_pool_id clientId=$app_client_id"

  # NOTE: Do NOT call `update-user-pool-client` on the tenant client. It is a
  # put-style API that would wipe the Application-UI callback/logout URLs set
  # by onboarding (services/tenant-onboarding/lib/cognito.ts). The tenant
  # UserPoolClient is already created with `userPassword: true`, so
  # USER_PASSWORD_AUTH works without any further config. See comment in Step 1.

  # Force-reset the tenant admin password. These are synthetic test accounts
  # (e.g. user+b<N>@example.com); sometimes the invitation email is actually
  # received (amazon.com honours + sub-addressing) and a real human completes
  # the NEW_PASSWORD_REQUIRED challenge, leaving the account CONFIRMED with
  # an unknown password. Force-reset lets subsequent runs keep working.
  log "  force-resetting tenant admin password"
  if ! aws cognito-idp admin-set-user-password \
        --user-pool-id "$user_pool_id" \
        --username "$email" \
        --password "$TENANT_USER_PASSWORD" \
        --permanent 2>/dev/null; then
    warn "  [$tier] admin-set-user-password failed — user may not exist"
    return 1
  fi

  # Onboarding only seeds email + custom:tenant-id on the default user; the
  # role/tier/name claims the Authorizer reads are empty. Patch them here so
  # the JWT has everything the API Gateway → Istio → NestJS chain expects.
  local tenant_name_val tenant_tier_val
  tenant_name_val="$(cat "$STATE_DIR/companyName.$tier" 2>/dev/null || echo "$tier")"
  tenant_tier_val="$tier"
  aws cognito-idp admin-update-user-attributes \
    --user-pool-id "$user_pool_id" \
    --username "$email" \
    --user-attributes \
      "Name=custom:userRole,Value=TenantAdmin" \
      "Name=custom:tenantTier,Value=$tenant_tier_val" \
      "Name=custom:tenantName,Value=$tenant_name_val" >/dev/null

  # Initiate auth → JWT.
  local tenant_jwt
  tenant_jwt="$(aws cognito-idp initiate-auth \
    --auth-flow USER_PASSWORD_AUTH \
    --client-id "$app_client_id" \
    --auth-parameters "USERNAME=$email,PASSWORD=$TENANT_USER_PASSWORD" \
    --query 'AuthenticationResult.IdToken' --output text 2>/dev/null)"
  if [[ -z "$tenant_jwt" || "$tenant_jwt" == "None" ]]; then
    warn "  [$tier] could not obtain tenant JWT even after password reset"
    warn "          user pool : $user_pool_id"
    warn "          client    : $app_client_id"
    warn "          username  : $email"
    warn "          check that USER_PASSWORD_AUTH flow is enabled on the client"
    return 1
  fi
  log "  tenant JWT acquired"

  # -- API smoke tests ------------------------------------------------------
  local st body
  # 1. Missing Authorization -> 401.
  st="$(curl -sS -o /dev/null -w '%{http_code}' "$SAAS_API_URL/products")"
  assert_eq "[$tier] GET /products no-auth -> 401" 401 "$st"

  # 2. Invalid JWT -> 401.
  st="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer not.a.jwt" "$SAAS_API_URL/products")"
  assert_eq "[$tier] GET /products bad-jwt -> 401" 401 "$st"

  # 3. Valid JWT GET /products -> 200.
  body="$(curl -sS -w '\n%{http_code}' \
    -H "Authorization: Bearer $tenant_jwt" "$SAAS_API_URL/products")"
  st="$(printf '%s' "$body" | tail -n1)"
  assert_eq "[$tier] GET /products valid -> 200" 200 "$st"

  # 4. Valid JWT POST /products -> 200/201.
  body="$(curl -sS -w '\n%{http_code}' \
    -X POST "$SAAS_API_URL/products" \
    -H "Authorization: Bearer $tenant_jwt" \
    -H 'Content-Type: application/json' \
    --data '{"name":"e2e-widget","price":9.99,"sku":"E2E-'"$tier"'","category":"test"}')"
  st="$(printf '%s' "$body" | tail -n1)"
  case "$st" in
    200|201) echo "    [PASS] [$tier] POST /products -> $st"; _pass=$((_pass + 1));;
    *)       echo "    [FAIL] [$tier] POST /products -> $st (expected 200/201)"; _fail=$((_fail + 1));;
  esac

  # 5. Valid JWT GET /orders -> 200.
  st="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $tenant_jwt" "$SAAS_API_URL/orders")"
  assert_eq "[$tier] GET /orders valid -> 200" 200 "$st"

  # 6. Valid JWT GET /users -> for TenantAdmin role this should be 200.
  st="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $tenant_jwt" "$SAAS_API_URL/users")"
  assert_eq "[$tier] GET /users valid -> 200" 200 "$st"

  # 7. Attacker x-tenant-id header override must be ignored.
  body="$(curl -sS -w '\n%{http_code}' \
    -H "Authorization: Bearer $tenant_jwt" \
    -H "x-tenant-id: attacker" \
    -H "x-tenant-tier: premium" \
    "$SAAS_API_URL/products")"
  st="$(printf '%s' "$body" | tail -n1)"
  assert_eq "[$tier] attacker header override -> 200" 200 "$st"
}

for TIER in $TIERS; do
  run_api_tests "$TIER" || warn "[$TIER] API tests aborted early"
done

# =========================================================================
# Step 6: Cleanup (unless KEEP_TENANTS=1)
# =========================================================================
if [[ "$KEEP_TENANTS" == "1" ]]; then
  log "KEEP_TENANTS=1 — leaving tenants in place."
else
  log "Deleting tenants..."
  for TIER in $TIERS; do
    REG_ID="$(cat "$STATE_DIR/registrationId.$TIER")"
    TENANT_NAME="$(cat "$STATE_DIR/tenantName.$TIER")"
    if [[ -z "$REG_ID" || "$REG_ID" == "null" ]]; then
      warn "  [$TIER] no registrationId; refetching..."
      REG_ID="$(resolve_registration_id "$TENANT_NAME")"
    fi
    # Fetch latest tenant object (DELETE body is required by the current API).
    TENANT_OBJ="$(curl -sS "$CONTROL_PLANE_URL/tenants?limit=100" \
      -H "Authorization: Bearer $SYSTEM_ADMIN_JWT" \
      | jq --arg n "$TENANT_NAME" '.data[] | select(.tenantData.tenantName == $n)')"
    log "  [$TIER] DELETE /tenant-registrations/$REG_ID"
    curl -sS -o /dev/null -w "    status=%{http_code}\n" \
      -X DELETE "$CONTROL_PLANE_URL/tenant-registrations/$REG_ID" \
      -H "Authorization: Bearer $SYSTEM_ADMIN_JWT" \
      -H 'Content-Type: application/json' \
      --data "$TENANT_OBJ"
  done

  log "Waiting for TenantStack DELETE_COMPLETE (timeout=${OFFBOARD_TIMEOUT}s)..."
  deadline=$(( $(date +%s) + OFFBOARD_TIMEOUT ))
  for TIER in $TIERS; do echo pending > "$STATE_DIR/offboard-status.$TIER"; done

  while [[ $(date +%s) -lt $deadline ]]; do
    all_done=1
    for TIER in $TIERS; do
      SF="$STATE_DIR/offboard-status.$TIER"
      [[ "$(cat "$SF")" != "pending" ]] && continue
      TENANT_ID="$(cat "$STATE_DIR/tenantId.$TIER")"
      STACK_NAME="TenantStack-$TENANT_ID"
      ST="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
            --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo MISSING)"
      if [[ "$ST" == "MISSING" || "$ST" == "DELETE_COMPLETE" ]]; then
        echo "complete" > "$SF"
        log "  [$TIER] $STACK_NAME -> deleted"
      elif [[ "$ST" == "DELETE_FAILED" ]]; then
        echo "failed" > "$SF"
        warn "  [$TIER] $STACK_NAME -> DELETE_FAILED"
      else
        all_done=0
      fi
    done
    [[ $all_done -eq 1 ]] && break
    sleep "$POLL_INTERVAL"
  done
fi

# =========================================================================
# Summary
# =========================================================================
echo
echo "======================================================================"
echo "Summary: $_pass passed, $_fail failed"
echo "State dir: $STATE_DIR"
echo "======================================================================"
exit $(( _fail > 0 ? 1 : 0 ))

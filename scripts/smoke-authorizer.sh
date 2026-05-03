#!/bin/bash
# Smoke test for API Gateway + TenantAuthorizer (api-gateway-lambda-authorizer spec)
#
# Usage:
#   ./scripts/smoke-authorizer.sh <JWT>
#   ./scripts/smoke-authorizer.sh <JWT> <API_URL>
#
# If API_URL is omitted, it is fetched from CloudFormation output `SaaSApi.APIUrl`.
# The JWT must be a valid token from a logged-in tenant user (copy from browser
# DevTools > Network > any authenticated request > Authorization header, drop the
# "Bearer " prefix).
#
# Exits non-zero on any failed assertion. All 4 cases run regardless of intermediate
# failures so you can see a full summary at the end.

set -u

JWT="${1:-}"
API_URL="${2:-}"
PATH_SUFFIX="${PATH_SUFFIX:-products}"   # override to e.g. orders or users

if [[ -z "$JWT" ]]; then
  echo "usage: $0 <JWT> [API_URL]"
  echo "  JWT      valid bearer token for a logged-in tenant user"
  echo "  API_URL  optional; defaults to CloudFormation stack SaaSApi output APIUrl"
  exit 2
fi

if [[ -z "$API_URL" ]]; then
  echo "Fetching API URL from CloudFormation (SaaSApi stack)..."
  API_URL=$(aws cloudformation describe-stacks \
    --stack-name SaaSApi \
    --query "Stacks[0].Outputs[?OutputKey=='APIUrl'].OutputValue" \
    --output text 2>/dev/null)
  if [[ -z "$API_URL" || "$API_URL" == "None" ]]; then
    echo "ERROR: could not fetch APIUrl from SaaSApi stack outputs." >&2
    exit 2
  fi
fi

# Normalize trailing slash.
API_URL="${API_URL%/}"
TARGET="${API_URL}/${PATH_SUFFIX}"

echo "===================================================================="
echo "Smoke test: ${TARGET}"
echo "===================================================================="

# Counters.
PASS=0
FAIL=0

# Helper. $1=label, $2=expected-status, $3+=curl flags.
run_case() {
  local label="$1"
  local expected="$2"
  shift 2
  local tmp_body
  tmp_body="$(mktemp)"
  local actual
  actual="$(curl -sS -o "$tmp_body" -w '%{http_code}' "$@" "$TARGET")"
  local body
  body="$(cat "$tmp_body")"
  rm -f "$tmp_body"
  if [[ "$actual" == "$expected" ]]; then
    echo "  [PASS] $label -> $actual"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label -> $actual (expected $expected)"
    echo "         body: ${body:0:200}"
    FAIL=$((FAIL + 1))
  fi
  # Print body preview for case 3 (valid JWT) even on pass so operator can eyeball.
  if [[ "$label" == "Case 3"* && "$actual" == "200" ]]; then
    echo "         body preview: ${body:0:200}"
  fi
  # For case 4 we want to compare with case 3, so echo the body to a side-channel file.
  if [[ "$label" == "Case 4"* ]]; then
    echo "$body" > /tmp/.smoke-case4-body
  fi
  if [[ "$label" == "Case 3"* && "$actual" == "200" ]]; then
    echo "$body" > /tmp/.smoke-case3-body
  fi
}

# -----------------------------------------------------------------------------
# Case 1: no Authorization header -> 401
# -----------------------------------------------------------------------------
run_case "Case 1 [no auth header -> 401]" 401

# -----------------------------------------------------------------------------
# Case 2: corrupted JWT -> 401
# -----------------------------------------------------------------------------
run_case "Case 2 [invalid JWT -> 401]" 401 \
  -H "Authorization: Bearer not.a.real.jwt"

# -----------------------------------------------------------------------------
# Case 3: valid JWT -> 200
# -----------------------------------------------------------------------------
run_case "Case 3 [valid JWT -> 200]" 200 \
  -H "Authorization: Bearer ${JWT}"

# -----------------------------------------------------------------------------
# Case 4: valid JWT + attacker-injected x-tenant-id header -> 200, body unchanged
# -----------------------------------------------------------------------------
run_case "Case 4 [attacker x-tenant-id override ignored -> 200]" 200 \
  -H "Authorization: Bearer ${JWT}" \
  -H "x-tenant-id: attacker-tenant-id" \
  -H "x-tenant-tier: premium" \
  -H "x-tenant-name: HackerCo" \
  -H "x-tenant-user-role: TenantAdmin"

# Compare case 3 vs case 4 bodies — should be byte-identical.
if [[ -s /tmp/.smoke-case3-body && -s /tmp/.smoke-case4-body ]]; then
  if diff -q /tmp/.smoke-case3-body /tmp/.smoke-case4-body >/dev/null; then
    echo "  [PASS] Case 4 body identical to Case 3 (static override working)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Case 4 body DIFFERS from Case 3 — attacker header may have leaked"
    echo "         diff preview:"
    diff /tmp/.smoke-case3-body /tmp/.smoke-case4-body | head -20 | sed 's/^/           /'
    FAIL=$((FAIL + 1))
  fi
fi
rm -f /tmp/.smoke-case3-body /tmp/.smoke-case4-body

echo "===================================================================="
echo "Summary: ${PASS} passed, ${FAIL} failed"
echo "===================================================================="
exit $((FAIL > 0 ? 1 : 0))

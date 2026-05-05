#!/bin/bash
# Static assertions against the synthesized SaaSApi CloudFormation template.
#
# Runs `cdk synth SaaSApi` first, then greps the generated
# cdk.out/SaaSApi.template.json for the invariants the feature
# `spec-driven-api-gateway` relies on:
#
#   - No unresolved `{{...}}` placeholders in the inlined Swagger body.
#   - No `integration.request.header.Authorization` mapping anywhere (the
#     bearer token must pass through byte-identical to the backend).
#   - At least one occurrence of each `context.authorizer.*` source we inject.
#   - The access-log format includes `tenantId` and `userRole` but not the
#     raw JWT or any `Authorization` field.
#   - A `lambda:InvokeFunction` permission targets the authorizer scoped to
#     `/authorizers/*` on the new API.
#
# Exit 0 on pass, 1 on fail.

set -u

TEMPLATE="cdk.out/SaaSApi.template.json"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "synthesizing SaaSApi stack..."
  npx cdk synth SaaSApi >/dev/null 2>&1 || {
    echo "ERROR: cdk synth failed" >&2
    exit 1
  }
fi

fail=0
pass=0

assert_count() {
  local label="$1" expected_min="$2" pattern="$3"
  local actual
  actual="$(grep -c "$pattern" "$TEMPLATE")"
  if [[ "$actual" -ge "$expected_min" ]]; then
    echo "  [PASS] $label (count=$actual >= $expected_min)"
    pass=$((pass + 1))
  else
    echo "  [FAIL] $label (count=$actual < $expected_min)"
    fail=$((fail + 1))
  fi
}

assert_absent() {
  local label="$1" pattern="$2"
  local actual
  actual="$(grep -c "$pattern" "$TEMPLATE")"
  if [[ "$actual" -eq 0 ]]; then
    echo "  [PASS] $label (not present)"
    pass=$((pass + 1))
  else
    echo "  [FAIL] $label (found $actual occurrence(s))"
    fail=$((fail + 1))
  fi
}

echo "checking $TEMPLATE ..."

# Placeholders all resolved.
assert_absent "no unresolved {{...}} placeholders" '{{'

# Authorization never mapped at integration layer.
assert_absent \
  "no integration.request.header.Authorization mapping" \
  "integration.request.header.Authorization"

# Each of the four tenant context keys referenced at least 13 times
# (13 non-OPTIONS methods * 1 reference per method, minimum).
assert_count "x-tenant-id injection"        13 "context.authorizer.tenantId"
assert_count "x-tenant-tier injection"      13 "context.authorizer.tenantTier"
assert_count "x-tenant-name injection"      13 "context.authorizer.tenantName"
assert_count "x-tenant-user-role injection" 13 "context.authorizer.userRole"

# Access log format keeps tenantId + userRole, excludes raw JWT.
assert_count "access log includes tenantId" 1 'tenantId.*context.authorizer.tenantId'
assert_count "access log includes userRole" 1 'userRole.*context.authorizer.userRole'
assert_absent "access log does not include Authorization field" 'authorization.*Bearer'
assert_absent "access log does not include raw JWT field"        'jwtToken'

# Exactly one RestApi resource.
assert_count "AWS::ApiGateway::RestApi present" 1 '"Type": "AWS::ApiGateway::RestApi"'

# Stage name remains 'prod' (no rename).
assert_count "Stage name is 'prod'" 1 '"StageName": "prod"'

# Lambda invoke permission scoped to /authorizers/*.
assert_count "Lambda invoke permission for authorizers/*" 1 "authorizers/\\*"

# OPTIONS mock integrations present (6 paths).
assert_count "OPTIONS mock integration present" 6 '"type": "mock"'

# securityDefinitions reference got inlined.
assert_count "authorizer security definition present" 1 "sharedApigatewayTenantApiAuthorizer"

echo "---"
echo "Result: $pass passed, $fail failed"
exit $(( fail > 0 ? 1 : 0 ))

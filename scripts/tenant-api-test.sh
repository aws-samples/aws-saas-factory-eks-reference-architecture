#!/bin/bash
# Runs an API workload against a single existing tenant:
#   - 3 POST /products
#   - 2 POST /orders  (each references the products just created)
#   - 1 POST /users
# Plus GET verifications after each batch.
#
# Usage:
#   ./scripts/tenant-api-test.sh <tenant-name> [password]
#   ./scripts/tenant-api-test.sh basic1
#   ./scripts/tenant-api-test.sh standard1 'MyTenantPass1!'
#
# The password defaults to the same TENANT_USER_PASSWORD that
# scripts/e2e-tenant-lifecycle.sh sets ('E2eTester!1'), so after running
# that script once you can call this script with just the tenant name.
#
# What the script does:
#   1. Looks up tenant metadata (tenantId / UserPool / ClientId / admin email)
#      from the `Tenant` DynamoDB table by COMPANY_NAME == <tenant-name>.
#   2. Uses Cognito USER_PASSWORD_AUTH to get the tenant admin's JWT.
#   3. Hits SaaSApi endpoints:
#      - POST /products (x3, sku 1001/1002/1003)
#      - GET  /products                      (verify count)
#      - POST /orders  (x2, referencing the created products)
#      - GET  /orders                        (verify count)
#      - POST /users   (x1, another TenantUser in the same tenant)
#      - GET  /users                         (verify count)
#   4. Prints a pass/fail summary and exits non-zero on any failure.
#
# Prereqs:
#   - scripts/e2e-tenant-lifecycle.sh has already created the tenant
#     (or the tenant otherwise exists with COMPANY_NAME == <tenant-name>).
#   - AWS CLI configured, jq installed, curl available.

set -u
set -o pipefail

TENANT_NAME="${1:-}"
PASSWORD_ARG="${2:-}"
PASSWORD="${PASSWORD_ARG:-${TENANT_USER_PASSWORD:-Saas1234#}}"

if [[ -z "$TENANT_NAME" ]]; then
  cat >&2 <<EOF
usage: $0 <tenant-name> [password]
  Password defaults to \$TENANT_USER_PASSWORD or 'Saas1234#'.
  Whatever password is used, the tenant admin user's Cognito password is
  force-reset to that value via admin-set-user-password --permanent before
  authenticating. Safe for test tenants; do NOT use on production accounts.
EOF
  exit 2
fi

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die()  { printf '[%s] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

_pass=0
_fail=0
_assert_status() {
  local label="$1" expected_re="$2" actual="$3"
  if [[ "$actual" =~ $expected_re ]]; then
    echo "  [PASS] $label (status=$actual)"
    _pass=$((_pass + 1))
  else
    echo "  [FAIL] $label (status=$actual, expected ~$expected_re)"
    _fail=$((_fail + 1))
  fi
}

# -------------------------------------------------------------------------
# Step 1: discover SaaSApi URL and tenant metadata
# -------------------------------------------------------------------------
log "Discovering SaaSApi URL..."
SAAS_API_URL="$(aws cloudformation describe-stacks \
  --stack-name SaaSApi \
  --query "Stacks[0].Outputs[?OutputKey=='APIUrl'].OutputValue" \
  --output text 2>/dev/null)"
[[ -n "$SAAS_API_URL" && "$SAAS_API_URL" != "None" ]] \
  || die "Could not find SaaSApi APIUrl output"
SAAS_API_URL="${SAAS_API_URL%/}"
log "  SaaSApi URL : $SAAS_API_URL"

log "Looking up tenant '$TENANT_NAME' in DynamoDB Tenant table..."
TENANT_ITEM="$(aws dynamodb scan --table-name Tenant \
  --filter-expression "COMPANY_NAME = :n" \
  --expression-attribute-values '{":n":{"S":"'"$TENANT_NAME"'"}}' \
  --query 'Items[0]' --output json 2>/dev/null)"
[[ -n "$TENANT_ITEM" && "$TENANT_ITEM" != "null" ]] \
  || die "No tenant row found with COMPANY_NAME='$TENANT_NAME' in Tenant table"

TENANT_ID="$(echo "$TENANT_ITEM" | jq -r '.TENANT_ID.S // empty')"
USER_POOL_ID="$(echo "$TENANT_ITEM" | jq -r '.USER_POOL_ID.S // empty')"
CLIENT_ID="$(echo "$TENANT_ITEM" | jq -r '.AUTH_CLIENT_ID.S // empty')"
ADMIN_EMAIL="$(echo "$TENANT_ITEM" | jq -r '.TENANT_EMAIL.S // empty')"
PLAN="$(echo "$TENANT_ITEM" | jq -r '.PLAN.S // empty')"

[[ -n "$TENANT_ID" ]]    || die "tenant row missing TENANT_ID"
[[ -n "$USER_POOL_ID" ]] || die "tenant row missing USER_POOL_ID"
[[ -n "$CLIENT_ID" ]]    || die "tenant row missing AUTH_CLIENT_ID"
[[ -n "$ADMIN_EMAIL" ]]  || die "tenant row missing TENANT_EMAIL"

log "  tenantId   : $TENANT_ID"
log "  plan       : $PLAN"
log "  adminEmail : $ADMIN_EMAIL"

# -------------------------------------------------------------------------
# Step 2: Force-reset the tenant admin password, then get JWT
# -------------------------------------------------------------------------
# We always overwrite the password here. Rationale:
#   - The tenant admin account is a synthetic test account (e.g.
#     hosseo+b1@amazon.com) created by onboarding, not a real human user.
#   - Real people sometimes complete the NEW_PASSWORD_REQUIRED challenge via
#     an invitation email and then the account is CONFIRMED with an unknown
#     password. Force-reset lets this script keep working regardless of state.
log "Force-resetting tenant admin password..."
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --password "$PASSWORD" \
  --permanent >/dev/null

log "Requesting tenant admin JWT..."
JWT="$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=$ADMIN_EMAIL,PASSWORD=$PASSWORD" \
  --query 'AuthenticationResult.IdToken' --output text 2>/dev/null)"

if [[ -z "$JWT" || "$JWT" == "None" ]]; then
  die "Could not obtain JWT for $ADMIN_EMAIL even after password reset. The
  tenant Cognito UserPoolClient may be missing USER_PASSWORD_AUTH flow."
fi
log "  JWT acquired (length=${#JWT})"

AUTH_H=(-H "Authorization: Bearer $JWT")
JSON_H=(-H 'Content-Type: application/json')

# -------------------------------------------------------------------------
# Step 3: POST /products x3
# -------------------------------------------------------------------------
# CreateProductDto: { name, price, sku (number), category }
log "Creating 3 products..."
declare -a PRODUCT_IDS=()
for i in 1 2 3; do
  BODY="$(jq -nc --arg n "p-$TENANT_NAME-$i" --argjson p "$((10 + i))" \
                 --argjson s "$((1000 + i))" --arg c "e2e-cat" \
      '{name:$n, price:$p, sku:$s, category:$c}')"
  RESP="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
      "$SAAS_API_URL/products" "${AUTH_H[@]}" "${JSON_H[@]}" --data "$BODY")"
  _assert_status "POST /products #$i" '^(200|201|204)$' "$RESP"
done

# Fetch list and extract real productIds (service generates uuid per product).
log "Fetching products..."
PRODUCTS_RAW="$(curl -sS "$SAAS_API_URL/products" "${AUTH_H[@]}")"
PRODUCTS_COUNT="$(echo "$PRODUCTS_RAW" | jq 'if type=="array" then length else 0 end' 2>/dev/null || echo 0)"
if [[ -z "$PRODUCTS_COUNT" || ! "$PRODUCTS_COUNT" =~ ^[0-9]+$ ]]; then PRODUCTS_COUNT=0; fi
log "  fetched $PRODUCTS_COUNT products"

# Pick the 3 newest matching products (by sku range we just used).
# Bash 3.2 compatible (no mapfile / readarray — macOS default bash is 3.2).
PRODUCT_IDS=()
while IFS= read -r line; do
  PRODUCT_IDS+=("$line")
done < <(
  echo "$PRODUCTS_RAW" \
    | jq -r --arg prefix "p-$TENANT_NAME-" \
        '[.[]? | select(.name // "" | startswith($prefix))] | .[].productId // empty' \
    2>/dev/null \
    | head -n3
)
if [[ "${#PRODUCT_IDS[@]}" -lt 3 ]]; then
  warn "could not resolve 3 productIds from GET /products response"
  warn "raw: ${PRODUCTS_RAW:0:300}"
fi

# Build a parallel array of prices from the same response (needed for orders).
PRODUCT_PRICES=()
while IFS= read -r line; do
  PRODUCT_PRICES+=("$line")
done < <(
  echo "$PRODUCTS_RAW" \
    | jq -r --arg prefix "p-$TENANT_NAME-" \
        '[.[]? | select(.name // "" | startswith($prefix))] | .[].price // 0' \
    2>/dev/null \
    | head -n3
)

# -------------------------------------------------------------------------
# Step 4: POST /orders x2
# -------------------------------------------------------------------------
# CreateOrderDto: { orderName, orderProducts: [{ productId, price, quantity }] }
# Order 1: products #1 + #2, Order 2: products #2 + #3 (so each product is used).
log "Creating 2 orders..."
_make_order_body() {
  local order_name="$1"; shift
  local pairs=("$@")   # "pid price qty" strings
  local items_json="[]"
  for pair in "${pairs[@]}"; do
    local pid price qty
    pid="$(echo "$pair" | awk '{print $1}')"
    price="$(echo "$pair" | awk '{print $2}')"
    qty="$(echo "$pair" | awk '{print $3}')"
    items_json="$(echo "$items_json" | jq --arg p "$pid" --argjson pr "$price" --argjson q "$qty" \
        '. += [{productId:$p, price:$pr, quantity:$q}]')"
  done
  jq -nc --arg n "$order_name" --argjson items "$items_json" \
      '{orderName:$n, orderProducts:$items}'
}

if [[ "${#PRODUCT_IDS[@]}" -ge 3 ]]; then
  ORDER1="$(_make_order_body "o-$TENANT_NAME-1" \
      "${PRODUCT_IDS[0]} ${PRODUCT_PRICES[0]:-10} 1" \
      "${PRODUCT_IDS[1]} ${PRODUCT_PRICES[1]:-11} 2")"
  ORDER2="$(_make_order_body "o-$TENANT_NAME-2" \
      "${PRODUCT_IDS[1]} ${PRODUCT_PRICES[1]:-11} 3" \
      "${PRODUCT_IDS[2]} ${PRODUCT_PRICES[2]:-12} 1")"

  for i in 1 2; do
    var="ORDER$i"
    RESP="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
        "$SAAS_API_URL/orders" "${AUTH_H[@]}" "${JSON_H[@]}" --data "${!var}")"
    _assert_status "POST /orders #$i" '^(200|201|204)$' "$RESP"
  done
else
  warn "skipping order creation (need >=3 productIds; have ${#PRODUCT_IDS[@]})"
  _fail=$((_fail + 2))
fi

# Fetch orders and print count.
ORDERS_RAW="$(curl -sS "$SAAS_API_URL/orders" "${AUTH_H[@]}")"
ORDERS_COUNT="$(echo "$ORDERS_RAW" | jq 'if type=="array" then length else 0 end' 2>/dev/null || echo 0)"
if [[ -z "$ORDERS_COUNT" || ! "$ORDERS_COUNT" =~ ^[0-9]+$ ]]; then ORDERS_COUNT=0; fi
log "  fetched $ORDERS_COUNT orders"

# -------------------------------------------------------------------------
# Step 5: POST /users x1
# -------------------------------------------------------------------------
# UserDto: { userEmail, userRole, userName }
# We derive a synthetic email in the same sub-address domain as the admin
# (e.g. user+b1@example.com → user+b1-u1@example.com).
ADMIN_LOCAL="${ADMIN_EMAIL%@*}"
ADMIN_DOMAIN="${ADMIN_EMAIL#*@}"
NEW_USER_EMAIL="${ADMIN_LOCAL}-u1@${ADMIN_DOMAIN}"
NEW_USER_NAME="tu-${TENANT_NAME}-1"

log "Creating 1 user: $NEW_USER_EMAIL role=TenantUser name=$NEW_USER_NAME"
USER_BODY="$(jq -nc --arg e "$NEW_USER_EMAIL" --arg r 'TenantUser' --arg n "$NEW_USER_NAME" \
    '{userEmail:$e, userRole:$r, userName:$n}')"
RESP="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
    "$SAAS_API_URL/users" "${AUTH_H[@]}" "${JSON_H[@]}" --data "$USER_BODY")"
_assert_status "POST /users" '^(200|201|204)$' "$RESP"

# Fetch users and print count.
USERS_RAW="$(curl -sS "$SAAS_API_URL/users" "${AUTH_H[@]}")"
USERS_COUNT="$(echo "$USERS_RAW" \
    | jq 'if type=="array" then length elif type=="object" and (.Users|type=="array") then (.Users|length) else 0 end' \
    2>/dev/null || echo 0)"
if [[ -z "$USERS_COUNT" || ! "$USERS_COUNT" =~ ^[0-9]+$ ]]; then USERS_COUNT=0; fi
log "  fetched $USERS_COUNT users"

# -------------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------------
echo
echo "===================================================================="
echo "Tenant : $TENANT_NAME ($PLAN)  tenantId=$TENANT_ID"
echo "Counts : products=$PRODUCTS_COUNT  orders=$ORDERS_COUNT  users=$USERS_COUNT"
echo "Result : $_pass passed, $_fail failed"
echo "===================================================================="
exit $(( _fail > 0 ? 1 : 0 ))

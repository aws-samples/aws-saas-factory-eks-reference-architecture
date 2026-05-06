#!/bin/bash -e

export AWS_PAGER=''
# AWS CLI auto-fetches URL params starting with http(s):// by default.
# Disable it so callback/logout URLs are passed as literal strings.
aws configure set cli_follow_urlparam false
export CDK_PARAM_SYSTEM_ADMIN_EMAIL="$1"
CLOUD_9_INSTALL="$2"

if [[ -z "$CDK_PARAM_SYSTEM_ADMIN_EMAIL" ]]; then
  echo "Please provide system admin email"
  exit 1
fi

# ---- DB type selection for the Product microservice ----------------------
# Prompts the operator once, at install time, for the Product backend. The
# selection is persisted to /tmp/db_type.env (the DB_Type_File) and threaded
# into the rest of the install via $CDK_USE_DB. MySQL is intentionally not
# offered (phase 1 supports DynamoDB and PostgreSQL only).
# See .kiro/specs/product-db-selection/requirements.md §1 and design.md §2.
select_db_type() {
  echo "Select the database type for the Product microservice:"
  echo "  1) DynamoDB"
  echo "  2) PostgreSQL"
  read -p "Enter [1 or 2, default 1]: " choice
  case "$choice" in
    2) DB_TYPE=postgresql ;;
    *) DB_TYPE=dynamodb ;;
  esac
  echo "export DB_TYPE=$DB_TYPE" > /tmp/db_type.env
  echo "Selected DB_TYPE: $DB_TYPE"
}

if [[ -z "$CLOUD_9_INSTALL" ]]; then
  echo "Setting region..."
  REGION=$(aws configure get region)
else
  echo "Setting region from instance metdata"
  TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
  REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/placement/availability-zone | sed 's/\(.*\)[a-z]/\1/')
fi

# export CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME="aws-saas-factory-ref-solution-eks-saas-sbt"
# if ! aws codecommit get-repository --repository-name $CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME; then
#   CREATE_REPO=$(aws codecommit create-repository --repository-name $CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME --repository-description "eks saas reference architecture repository")
#   echo "$CREATE_REPO"
# fi

# REPO_URL="codecommit::${REGION}://$CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME"
# if ! git remote add cc "$REPO_URL"; then
#   echo "Setting url to remote cc"
#   git remote set-url cc "$REPO_URL"
# fi
# git push cc "$(git branch --show-current)":main -f --no-verify
# export CDK_PARAM_COMMIT_ID=$(git log --format="%H" -n 1)

# ---- Invoke DB selection prompt before any npm/cdk/AWS work --------------
# Requirement 1.7: prompt must run BEFORE npm install / cdk bootstrap /
# cdk deploy so a mis-selection aborts with zero AWS side effects.
# Requirement 1.8: re-invocations always re-prompt — the function is called
# unconditionally, regardless of whether /tmp/db_type.env already exists.
select_db_type
source /tmp/db_type.env
export CDK_USE_DB="$DB_TYPE"

# ---- One-way-door guard (Requirement 8.1, 8.2) ---------------------------
# If a prior successful install wrote /eks-saas-ref/cdk-use-db to SSM and
# the operator selected a different DB type this run, abort before any
# CDK work. First install (parameter absent) is silent.
EXISTING=$(aws ssm get-parameter --name /eks-saas-ref/cdk-use-db --query 'Parameter.Value' --output text 2>/dev/null || true)
if [ -n "$EXISTING" ] && [ "$EXISTING" != "$CDK_USE_DB" ]; then
  cat <<'EOF' >&2
ERROR: Product-microservice DB type switch detected.

  This EKS SaaS reference install was previously deployed with a different
  CDK_USE_DB value than the one just selected. The current deployment
  records its DB type in SSM at:

      /eks-saas-ref/cdk-use-db

  The parameter is written by the Services stack on first successful
  deploy and owned by its lifecycle. Switching the Product backend
  (DynamoDB <-> PostgreSQL) after install is a one-way door: there is
  no data migration path, and Aurora / RDS-Proxy resources only exist
  under the PostgreSQL branch.

  To switch DB types, run:

      scripts/cleanup.sh

  first (this destroys every stack, including the SSM parameter), then
  re-run scripts/install.sh and select the new DB type from the prompt.

  Aborting before any CDK or npm work so no AWS side effects occur.
EOF
  exit 1
fi

npm install

export CDK_PARAM_CONTROL_PLANE_SOURCE='sbt-control-plane-api'
export CDK_PARAM_ONBOARDING_DETAIL_TYPE='Onboarding'
export CDK_PARAM_PROVISIONING_DETAIL_TYPE=$CDK_PARAM_ONBOARDING_DETAIL_TYPE
export CDK_PARAM_APPLICATION_NAME_PLANE_SOURCE="sbt-application-plane-api"
export CDK_PARAM_OFFBOARDING_DETAIL_TYPE='Offboarding'
export CDK_PARAM_DEPROVISIONING_DETAIL_TYPE=$CDK_PARAM_OFFBOARDING_DETAIL_TYPE

npx cdk bootstrap
npm run deploy --email=$CDK_PARAM_SYSTEM_ADMIN_EMAIL

STACKS=$(aws cloudformation describe-stacks)

USERPOOLID=$(echo $STACKS |  jq -r '.Stacks[]?.Outputs[]? | select (.OutputKey=="ControlPlaneIdpUserPoolId") | .OutputValue')
echo $USERPOOLID
CLIENTID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select (.OutputKey=="ControlPlaneIdpClientId") | .OutputValue')
echo $CLIENTID
ADMIN_SITE_URL=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select (.OutputKey=="AdminSiteUrl") | .OutputValue')
echo $ADMIN_SITE_URL
APPLICATION_SITE_URL=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select (.OutputKey=="ApplicationSiteUrl") | .OutputValue')
echo $APPLICATION_SITE_URL
API_ID=$( aws apigatewayv2 get-apis --query "Items[?Name=='controlPlaneAPI'].ApiId | [0]" --output text)
echo $API_ID

aws cognito-idp update-user-pool-client \
  --user-pool-id $USERPOOLID \
  --client-id $CLIENTID \
  --allowed-o-auth-flows-user-pool-client \
  --callback-urls "$ADMIN_SITE_URL" \
  --logout-urls "$ADMIN_SITE_URL/signout" \
  --supported-identity-providers "COGNITO" \
  --allowed-o-auth-flows "code" "implicit" \
  --allowed-o-auth-scopes "phone" "email" "openid" "profile" "tenant/tenant_read" "tenant/tenant_write" "user/user_read" "user/user_write" 

aws apigatewayv2 update-api \
  --api-id $API_ID \
  --cors-configuration AllowOrigins="$ADMIN_SITE_URL,$APPLICATION_SITE_URL",AllowMethods="*",AllowHeaders="*"

echo "Log into the admin site here: $ADMIN_SITE_URL"  
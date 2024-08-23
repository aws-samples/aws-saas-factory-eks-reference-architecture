#!/bin/bash -e

export AWS_PAGER=''
export CDK_PARAM_SYSTEM_ADMIN_EMAIL="$1"
CLOUD_9_INSTALL="$2"

if [[ -z "$CDK_PARAM_SYSTEM_ADMIN_EMAIL" ]]; then
  echo "Please provide system admin email"
  exit 1
fi

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
  --callback-urls "$ADMIN_SITE_URL" \
  --logout-urls "$ADMIN_SITE_URL/signout" \
  --supported-identity-providers "COGNITO" \
  --allowed-o-auth-flows "code" "implicit" \
  --allowed-o-auth-scopes "phone" "email" "openid" "profile" "tenant/tenant_read" "tenant/tenant_write" "user/user_read" "user/user_write" 

aws apigatewayv2 update-api \
  --api-id $API_ID \
  --cors-configuration AllowOrigins="$ADMIN_SITE_URL,$APPLICATION_SITE_URL",AllowMethods="*",AllowHeaders="*"

echo "Log into the admin site here: $ADMIN_SITE_URL"  
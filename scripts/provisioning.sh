#!/bin/bash -e

# Install/update the AWS CLI.
# sudo yum remove awscli

# curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
# unzip awscliv2.zip
# sudo ./aws/install

# Provision EKS tenant.
aws codebuild start-build --project-name TenantOnboardingProject --environment-variables-override \
name=TENANT_ID,value=$tenantId,type=PLAINTEXT \
name=PLAN,value=$tier,type=PLAINTEXT \
name=COMPANY_NAME,value=$tenantName,type=PLAINTEXT \
name=ADMIN_EMAIL,value=$email,type=PLAINTEXT

STACK_NAME="TenantStack-$tenantId"

echo Waiting
aws cloudformation wait stack-exists --stack-name $STACK_NAME
echo Waiting
aws cloudformation wait stack-exists --stack-name $STACK_NAME

aws cloudformation wait stack-create-complete --stack-name $STACK_NAME
STACKS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME)
echo "Stacks: $STACKS"
SAAS_TENANT_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='TenantId'].OutputValue" --output text)
echo "TenantId: $SAAS_TENANT_ID"
SAAS_APP_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='ClientId'].OutputValue" --output text)
echo "ClientId: $SAAS_APP_CLIENT_ID"
SAAS_AUTH_SERVER=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='AuthServer'].OutputValue" --output text)
echo "AuthServer: $SAAS_AUTH_SERVER"
SAAS_REDIRECT_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='RedirectUri'].OutputValue" --output text)
echo "RedirectUri: $SAAS_REDIRECT_URL"


#Export variables
export tenantStatus="Complete"
export tenantConfig=$(jq --arg SAAS_TENANT_ID "$SAAS_TENANT_ID" \
  --arg SAAS_APP_CLIENT_ID "$SAAS_APP_CLIENT_ID" \
  --arg SAAS_AUTH_SERVER "$SAAS_AUTH_SERVER" \
  --arg SAAS_REDIRECT_URL "$SAAS_REDIRECT_URL" \
  -n '{"tenantId":$SAAS_TENANT_ID,"appClientId":$SAAS_APP_CLIENT_ID,"authServer":$SAAS_AUTH_SERVER,"redirectUrl":$SAAS_REDIRECT_URL}')
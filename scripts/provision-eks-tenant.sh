#!/bin/bash -e

# Install/update the AWS CLI.
sudo yum remove awscli

curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

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

SAAS_APP_USERPOOL_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='userPoolId'].OutputValue" --output text)
SAAS_APP_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='appClientId'].OutputValue" --output text)

#Export variables
export tenantStatus="Complete"
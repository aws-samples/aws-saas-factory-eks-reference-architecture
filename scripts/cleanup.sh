#!/bin/bash -e
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

# Clean up script to destroy, tenant stacks, user pools, and EKS reference architecture.
# usage:
# ./cleanup.sh

export CDK_PARAM_SYSTEM_ADMIN_EMAIL="NA"
export CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME="aws-saas-factory-ref-solution-eks-saas-sbt"
export CDK_PARAM_COMMIT_ID="NA"
export CDK_PARAM_REG_API_GATEWAY_URL="NA"
export CDK_PARAM_EVENT_BUS_ARN=arn:aws:service:::resource
export CDK_PARAM_CONTROL_PLANE_SOURCE="NA"
export CDK_PARAM_ONBOARDING_DETAIL_TYPE="NA"
export CDK_PARAM_PROVISIONING_DETAIL_TYPE="NA"
export CDK_PARAM_PROVISIONING_EVENT_SOURCE="NA"
export CDK_PARAM_APPLICATION_NAME_PLANE_SOURCE="NA"
export CDK_PARAM_OFFBOARDING_DETAIL_TYPE="NA"
export CDK_PARAM_DEPROVISIONING_DETAIL_TYPE="NA"

cd ../server

# Get tenant root stacks and user pool ids.
# TODO: Use a more unique identifier to query tenant stacks.
response=$(aws cloudformation describe-stacks | jq '[.Stacks[] | select(.ParentId == null) | select(.StackName | test("^TenantStack-*"))]')
tenant_stacks=$(echo $response | jq -r '.[] | .StackName')
user_pool_ids=$(echo $response | jq -r '.[] | [.Outputs[] | select(.OutputKey == "userPoolId")] | last | .OutputValue')

# Delete tenant stacks.
for i in $tenant_stacks; do
  echo "Deleting tenant stack: $i"
  aws cloudformation delete-stack --stack-name "$i"
done

# Delete tenant user pools.
for i in $user_pool_ids; do
  pool_domain=$(aws cognito-idp describe-user-pool --user-pool-id "$i" | jq -r '.UserPool.Domain')
  echo "Deleting pool domain $pool_domain..."
  aws cognito-idp delete-user-pool-domain \
    --user-pool-id "$i" \
    --domain "$pool_domain"

  echo "Deleting user pool: $i"
  aws cognito-idp delete-user-pool --user-pool-id "$i"
done

# Delete SaaS Control Plane user pool.
next_token=""
while true; do
    if [[ "${next_token}" == "" ]]; then
        response=$( aws cognito-idp list-user-pools --max-results 1)
    else
        # using next-token instead of starting-token. See: https://github.com/aws/aws-cli/issues/7661
        response=$( aws cognito-idp list-user-pools --max-results 1 --next-token "$next_token")
    fi

    pool_ids=$(echo "$response" | jq -r '.UserPools[] | select(.Name | test("^SaaSControlPlaneUserPool$")) |.Id')
    for i in $pool_ids; do
        echo "$(date) deleting user pool with name $i..."
        echo "getting pool domain..."
        pool_domain=$(aws cognito-idp describe-user-pool --user-pool-id "$i" | jq -r '.UserPool.Domain')

        echo "deleting pool domain $pool_domain..."
        if [[ "$pool_domain" != "null" ]]; then
          aws cognito-idp delete-user-pool-domain \
              --user-pool-id "$i" \
              --domain "$pool_domain"
        fi
        echo "deleting pool $i..."
        aws cognito-idp delete-user-pool --user-pool-id "$i"
    done

    next_token=$(echo "$response" | jq -r '.NextToken')
    if [[ "${next_token}" == "null" ]]; then
        # no more results left. Exit loop...
        break
    fi
done

# Delete CodeCommit repo.
echo "Deleting CodeCommit repository: $CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME"
if aws codecommit get-repository --repository-name $CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME; then
  DELETE_REPO=$(aws codecommit delete-repository --repository-name $CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME)
  echo "$DELETE_REPO"
fi

# Destroy the EKS reference arch stacks.
echo "Destroying EKS reference architecture..."
npx cdk destroy --all --force

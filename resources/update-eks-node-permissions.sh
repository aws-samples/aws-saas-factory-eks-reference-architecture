#!/bin/bash

: "${EKS_CLUSTER_NAME:=$1}"

USAGE_PROMPT="Use: $0 <CLUSTERNAME>\n
Example: $0 test-cluster"

if [[ -z ${EKS_CLUSTER_NAME} ]]; then
  echo "Stack Name was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi

NODE_INSTANCE_ROLE_NAME=$(aws cloudformation describe-stack-resources --stack-name eksctl-${EKS_CLUSTER_NAME}-nodegroup-nodegroup --query "StackResources[?LogicalResourceId=='NodeInstanceRole'].PhysicalResourceId" --output text)
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)
EKS_REF_ROOT_DIR=$(pwd)

cd resources
echo "Attaching an inline policy to the existing Node Instance Role that gives our nodes more AWS Permissions"
aws iam create-policy --policy-name eks-saas-inline-policy --policy-document file://eks-node-instance-policy.json
aws iam attach-role-policy --role-name $NODE_INSTANCE_ROLE_NAME --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/eks-saas-inline-policy

echo "Creating a new role which will be used by our CodeBuild project to describe our EKS Instances"
TRUST="{ \"Version\": \"2012-10-17\", \"Statement\": [ { \"Effect\": \"Allow\", \"Principal\": { \"AWS\": \"arn:aws:iam::${AWS_ACCOUNT_ID}:root\" }, \"Action\": \"sts:AssumeRole\" } ] }"
echo '{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Action": "eks:Describe*", "Resource": "*" }, { "Effect": "Allow", "Action": "iam:*", "Resource": "*" }, { "Effect": "Allow", "Action": "cloudformation:*", "Resource": "*" }, { "Effect": "Allow", "Action": "dynamodb:*", "Resource": "*" } ] }' > /tmp/iam-role-policy
aws iam create-role --role-name EksSaasCodeBuildRole --assume-role-policy-document "$TRUST" --output text --query 'Role.Arn'
aws iam put-role-policy --role-name EksSaasCodeBuildRole --policy-name eks-saas-code-build-policy --policy-document file:///tmp/iam-role-policy

echo "Updating the AWS Auth config map with the CodeBuild role"
ROLE="    - rolearn: arn:aws:iam::$ACCOUNT_ID:role/EksSaasCodeBuildRole\n      username: build\n      groups:\n        - system:masters"
kubectl get -n kube-system configmap/aws-auth -o yaml | awk "/mapRoles: \|/{print;print \"$ROLE\";next}1" > /tmp/aws-auth-patch.yml
kubectl patch configmap/aws-auth -n kube-system --patch "$(cat /tmp/aws-auth-patch.yml)"


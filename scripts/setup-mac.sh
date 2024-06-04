#!/bin/bash

export ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)
export AWS_REGION=$(aws configure get region)
export AWS_DEFAULT_REGION=$AWS_REGION
export AWS_ACCOUNT=$ACCOUNT_ID
aws configure set default.region ${AWS_REGION}
aws configure get default.region

echo $ACCOUNT_ID
echo $AWS_REGION
echo $AWS_ACCOUNT
#aws sts get-caller-identity --query Arn | grep eks-ref-arch-admin -q && echo "IAM role valid. You can continue setting up the EKS Cluster." || echo "IAM role NOT valid. Do not proceed with creating the EKS Cluster or you won't be able to authenticate. Ensure you assigned the role to your EC2 instance as detailed in the README.md of the eks-saas repo"

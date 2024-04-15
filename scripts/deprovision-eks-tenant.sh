#!/bin/bash -e

# Install/update the AWS CLI.
sudo yum remove awscli

curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# De-provision EKS tenant.
aws codebuild start-build --project-name TenantDeletionProject --environment-variables-override \
name=TENANT_ID,value=$tenantId,type=PLAINTEXT

# Create JSON response of output parameters.
export tenantStatus="Deleted"
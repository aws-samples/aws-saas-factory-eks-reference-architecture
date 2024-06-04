#!/bin/bash

# Define repository name and domain name
REPO_NAME="sbt-repository"
DOMAIN_NAME="sbt-domain"
NAMESPACE="sbt"
AWS_ACCOUNT_ID="196307545247"
REGION="us-west-2"

# update .npmrc file to use code-artifact for @sbt/* packages
aws codeartifact login --tool npm \
    --repository "$REPO_NAME" \
    --domain "$DOMAIN_NAME" \
    --domain-owner "$AWS_ACCOUNT_ID" \
    --namespace "$NAMESPACE" \
    --region "$REGION"

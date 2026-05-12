#!/bin/bash
set -euo pipefail

# 현재 환경에서 역할 이름과 리전 자동 추출
ROLE_ARN=$(aws sts get-caller-identity --query 'Arn' --output text)
ROLE_NAME=$(echo "$ROLE_ARN" | awk -F'/' '{print $2}')
REGION=${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || echo "us-east-1")}

echo "Role: $ROLE_NAME"
echo "Region: $REGION"

aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name CDKBootstrapPolicy \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:*","iam:*","ssm:*","ecr:*"],"Resource":"*"}]}'

aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name ApiGatewayAccess \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["apigateway:*"],"Resource":"*"}]}'

aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name CognitoAccess \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["cognito-idp:*","cognito-identity:*"],"Resource":"*"}]}'

aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name EKSAccess \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["eks:*"],"Resource":"*"}]}'

aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name RDSLambdaAccess \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["rds:*","lambda:*"],"Resource":"*"}]}'

aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name DynamoDBAccess \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["dynamodb:*"],"Resource":"*"}]}'

aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name CodeBuildAccess \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["codebuild:*"],"Resource":"*"}]}'

echo "Done. All policies attached to $ROLE_NAME"

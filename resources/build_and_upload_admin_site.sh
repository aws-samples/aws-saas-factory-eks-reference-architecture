#!/bin/sh
USAGE_PROMPT="Use: $0 <STACKNAME> <BUCKET> <DOMAIN_NAME>\n
Example: $0 test-stack my-bucket-1334321 mydomain.com"


if [ "X$1" = "X" ]; then
    echo "StackName not provided"
    echo -e $USAGE_PROMPT
    exit 2
fi

if [ "X$2" = "X" ]; then
    echo "Bucket not provided"
    echo -e $USAGE_PROMPT
    exit 2
fi

if [ "X$3" = "X" ]; then
  echo "DomainName not provided"
  echo -e $USAGE_PROMPT
  exit 2
fi

STACK_NAME=$1
S3_BUCKET=$2
CUSTOM_DOMAIN=$3

aws s3 ls s3://$S3_BUCKET
echo "aws s3 ls s3://$S3_BUCKET"
if [ $? -ne 0 ]; then
    echo "Error! S3 Bucket: $S3_BUCKET not readable"
    exit 1
fi

APPCLIENTID=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-AdminOAuthClientId'].Value" --output text)
AUTHSERVERURL=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-AdminOAuthProviderUrl'].Value" --output text)
AUTHCUSTOMDOMAIN=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-AdminOAuthCustomDomain'].Value" --output text)

CURRENT_DIR=$(pwd)
echo "Current Dir: $CURRENT_DIR"

cd clients/Admin

echo "Configuring environment for Admin Client"

cat << EoF > ./src/environments/environment.prod.ts
export const environment = {
  production: true,
  clientId: '$APPCLIENTID',
  issuer: '$AUTHSERVERURL',
  customDomain: '$AUTHCUSTOMDOMAIN',
  apiUrl: 'https://api.$CUSTOM_DOMAIN',
  domain: '$CUSTOM_DOMAIN'
};
EoF
cat << EoF > ./src/environments/environment.ts
export const environment = {
  production: true,
  clientId: '$APPCLIENTID',
  issuer: '$AUTHSERVERURL',
  customDomain: '$AUTHCUSTOMDOMAIN',
  apiUrl: 'https://api.$CUSTOM_DOMAIN',
  domain: '$CUSTOM_DOMAIN'
};
EoF

npm install --force && npm run build

echo "aws s3 sync --delete --cache-control no-store dist s3://$S3_BUCKET"
aws s3 sync --delete --cache-control no-store dist s3://$S3_BUCKET


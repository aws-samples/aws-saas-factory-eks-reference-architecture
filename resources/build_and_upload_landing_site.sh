#!/bin/sh

if [ "X$1" = "X" ]; then
    echo "usage: $0 S3_BUCKET CUSTOM_DOMAIN"
    exit 2
fi

if [ "X$2" = "X" ]; then
    echo "usage: $0 S3_BUCKET CUSTOM_DOMAIN"
    exit 2
fi


S3_BUCKET=$1
CUSTOM_DOMAIN=$2
# aws s3 ls s3://$S3_BUCKET
echo "aws s3 ls s3://$S3_BUCKET"
if [ $? -ne 0 ]; then
    echo "Error! S3 Bucket: $S3_BUCKET not readable"
    exit 1
fi

CURRENT_DIR=$(pwd)
echo "Current Dir: $CURRENT_DIR"

cd clients/Landing

echo "Configuring environment for Landing Page"
cat << EoF > ./src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.$CUSTOM_DOMAIN',
  domain: '$CUSTOM_DOMAIN'
};
EoF
cat << EoF > ./src/environments/environment.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.$CUSTOM_DOMAIN',
  domain: '$CUSTOM_DOMAIN'
};
EoF

npm install && npm run build

echo "aws s3 sync --delete --cache-control no-store dist s3://$S3_BUCKET"
aws s3 sync --delete --cache-control no-store dist s3://$S3_BUCKET


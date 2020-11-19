#!/bin/bash

if [ "X$1" = "X" ]; then
    echo "usage: $0 artifact_bucket_name"
    exit 1
fi

S3_BUCKET=$1
aws s3 ls s3://$S3_BUCKET
if [ $? -ne 0 ]; then
    echo "Error! S3 Bucket: $S3_BUCKET not readable"
    exit 1
fi

# Zip up the lambda function 
CURRENT_DIR=$(pwd)
echo $CURRENT_DIR
rm resources/cfn-cross-region.zip 2>/dev/null
cd functions/source/CfnCrossRegion
zip -r $CURRENT_DIR/resources/cfn-cross-region.zip ./*
cd $CURRENT_DIR
aws s3 cp resources/cfn-cross-region.zip s3://$S3_BUCKET

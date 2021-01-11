#!/usr/bin/env bash
. ~/.bash_profile

#set -x
: "${ADMIN_EMAIL:=$1}"
: "${STACK_NAME:=$2}"
: "${DOMAINNAME:=$3}"
: "${HOSTEDZONEID:=$4}"

USAGE_PROMPT="Use: $0 <ADMINEMAIL> <STACKNAME> <DOMAINNAME> <HOSTEDZONEID>\n
Example: $0 user@email.com test-stack mydomain.com Z01111111111111111111"

if [[ -z ${ADMIN_EMAIL} ]]; then
  echo "Admin Email was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi

if [[ -z ${STACK_NAME} ]]; then
  echo "Stack Name was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi

if [[ -z ${DOMAINNAME} ]]; then
  echo "Domain Name was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi

if [[ -z ${HOSTEDZONEID} ]]; then
  echo "Hosted Zone ID was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi


EKS_REF_ROOT_DIR=$(pwd)

#This name is set in the eks-cluster-config.yaml that's generated in deploy-cluster.sh
EKS_CLUSTER_NAME=eks-saas

if [ "X$AWS_REGION" = "X" ]; then
  echo -e "AWS_REGION not set, check your aws profile or set AWS_DEFAULT_REGION"
  exit 2
fi
echo "AWS Region = $AWS_REGION"
export AWS_DEFAULT_REGION=$AWS_REGION

#Find existing bucket, if there is one

echo "Generating random bucket name with prefix sb-artifacts"
BUCKET_ID=$(dd if=/dev/random bs=8 count=1 2>/dev/null | od -An -tx1 | tr -d ' \t\n')
BUCKET_NAME=eks-ref-artifacts-${BUCKET_ID}
echo $BUCKET_NAME > bucket-name.txt
echo "EKSRefARchBucket: $BUCKET_NAME"
aws s3 mb s3://$BUCKET_NAME
if [ $? -ne 0 ]; then
  echo "Error creating S3 Bucket: $BUCKET_NAME"
  exit 2
fi

S3_BUCKET=s3://$BUCKET_NAME

#This gets rid of CLI Output being piped to Less by default in AWS CLI v2
export AWS_PAGER=""

echo "Copy templates folder to $S3_BUCKET"
echo "WORKING DIRECTORY: $PWD";
echo "EKS_REF_ROOT_DIR: $EKS_REF_ROOT_DIR"
cd resources/templates
for yml in $(ls eks-ref-*.yaml); do
    aws s3 cp $yml s3://$BUCKET_NAME
done

echo "Build and copy Lambda files to $S3_BUCKET"
cd "${EKS_REF_ROOT_DIR}"
echo "WORKING DIRECTORY: $PWD";
echo "EKS_REF_ROOT_DIR: $EKS_REF_ROOT_DIR"
sh ./resources/build_and_copy_lambdas.sh $BUCKET_NAME
if [ $? -ne 0 ]; then
    echo "Error! build_copy_lambdas.sh not successful"
    exit 1
fi

echo "Deploying eks-ref-arch stack"
CREATE_STACK_CMD="aws cloudformation deploy --stack-name ${STACK_NAME} \
--template-file ./resources/templates/root-stack.yaml \
--capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_NAMED_IAM \
--parameter-overrides AdminEmailAddress=$ADMIN_EMAIL \
                      EKSRefArchBucket=$BUCKET_NAME \
                      DomainName=${DOMAINNAME} \
                      HostedZoneId=${HOSTEDZONEID}"
cd "${EKS_REF_ROOT_DIR}"
echo $CREATE_STACK_CMD
eval $CREATE_STACK_CMD

if [ $? -ne 0 ]; then
    echo "Error! Cloudformation failed for stack ${STACK_NAME} see AWS CloudFormation console for details."
    echo "If it's still deploying, this may have been a timeout error. Once finished, manually run the build and upload website script"
    echo "chmod +x resources/build_and_upload_websites.sh"
    echo "./resources/build_and_upload_websites.sh ${STACK_NAME}"
    exit 2
fi

echo "Building and uploading websites"
sh ./resources/build_and_upload_websites.sh $STACK_NAME  $DOMAINNAME

echo "Building and uploading docker service images"
sh ./resources/build_and_upload_sharedsvcs.sh $STACK_NAME

echo "Installing Nginx Controller and External DNS in your Kubernetes Cluster"
sh ./resources/eks-shared-services-deployment.sh $STACK_NAME $DOMAINNAME

echo "Customizing the tenant provisioning stack with information from this install"
sh ./resources/update_tenant_provisioning_stack.sh $STACK_NAME $BUCKET_NAME $DOMAINNAME $HOSTEDZONEID $EKS_CLUSTER_NAME

echo "Updating the IAM Policies on the EKS Instance Nodes"
sh ./resources/update-eks-node-permissions.sh $EKS_CLUSTER_NAME

echo "Updating the codecommit repo"
sh ./resources/update-codecommit.sh $STACK_NAME

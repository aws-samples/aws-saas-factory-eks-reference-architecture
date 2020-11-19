#!/usr/bin/env bash
#set -x
: "${STACK_NAME:=$1}"
: "${ARTIFACT_BUCKET:=$2}"
: "${DOMAINNAME:=$3}"
: "${HOSTEDZONEID:=$4}"
: "${EKS_CLUSTER_NAME:=$5}"

USAGE_PROMPT="Use: $0 <STACKNAME> <BUCKET> <DOMAIN_NAME> <HOSTEDZONEID> <EKS_CLUSTER_NAME>\n
Example: $0 test-stack my-bucket-1334321 mydomain.com Z01111111111111111111 my-cluster"

if [[ -z ${STACK_NAME} ]]; then
  echo "Stack Name was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi

if [[ -z ${ARTIFACT_BUCKET} ]]; then
  echo "Bucket was not provided."
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
if [[ -z ${EKS_CLUSTER_NAME} ]]; then
  echo "EKS Cluster Name was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi


# Lookup info required for the tenant provisioning stack
EKS_VPC_ID=$(aws eks describe-cluster --name $EKS_CLUSTER_NAME | jq -r .cluster.resourcesVpcConfig.vpcId)
# THIS MUST BE A PRIVATE SUBNET ****
EKS_SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$EKS_VPC_ID" --query 'Subnets[?MapPublicIpOnLaunch==`false`].SubnetId | [0]' --output text)
EKS_SECURITY_GROUP_ID=$(aws cloudformation describe-stacks --stack-name eksctl-${EKS_CLUSTER_NAME}-cluster --query "Stacks[0].Outputs[?OutputKey=='SharedNodeSecurityGroup'].OutputValue" --output text)

echo $EKS_VPC_ID
echo $EKS_SUBNET_ID
echo $EKS_SECURITY_GROUP_ID

# Replace placeholders within the tenant stack template with values from our environment
sed 's,EKS_CLUSTER_PLACEHOLDER,'$EKS_CLUSTER_NAME',g' resources/templates/tenant-stack-master.yaml > resources/templates/tenant-stack.yaml
sed -i 's,EKS_VPC_ID,'$EKS_VPC_ID',g' resources/templates/tenant-stack.yaml
sed -i 's,EKS_SUBNET_ID,'$EKS_SUBNET_ID',g' resources/templates/tenant-stack.yaml
sed -i 's,EKS_SECURITY_GROUP_ID,'$EKS_SECURITY_GROUP_ID',g' resources/templates/tenant-stack.yaml

# Copy the customized tenant stack to the bucket where the other templates live
aws s3 cp resources/templates/tenant-stack.yaml s3://${ARTIFACT_BUCKET}

rm resources/templates/tenant-stack.yaml

TENANT_METADATA_TABLE=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-OnboardingMetadataTable'].Value" --output text)
APP_CLOUDFRONT_ID=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-AppCloudFrontId'].Value" --output text)
PROVISION_TEMPLATE="https://${ARTIFACT_BUCKET}.s3.amazonaws.com/tenant-stack.yaml"

# Retrieve the order-service and product-service repository names
PRODUCT_SERVICE_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-ProductECR'].Value" --output text)
ORDER_SERVICE_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-OrderECR'].Value" --output text)

echo $PRODUCT_SERVICE_ECR
echo $ORDER_SERVICE_ECR

# Record this metadata in the dynamo table that was made in root-stack
aws dynamodb put-item \
--table-name ${TENANT_METADATA_TABLE} \
--item "{\"DOMAIN_NAME\": {\"S\": \"$DOMAINNAME\"}, \"HOSTED_ZONE_ID\": {\"S\": \"$HOSTEDZONEID\"}, \"APP_CLOUDFRONT_ID\": {\"S\": \"$APP_CLOUDFRONT_ID\"}, \"S3_ENDPOINT\": {\"S\": \"$PROVISION_TEMPLATE\"}, \"PRODUCT_SERVICE_ECR\": {\"S\": \"$PRODUCT_SERVICE_ECR\"}, \"ORDER_SERVICE_ECR\": {\"S\": \"$ORDER_SERVICE_ECR\"}}" \
--return-consumed-capacity TOTAL        
      

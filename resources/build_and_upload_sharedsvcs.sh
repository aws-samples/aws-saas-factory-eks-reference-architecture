#!/bin/bash
if [ "X$1" = "X" ]; then
    echo "usage: $0 STACK_NAME"
    exit 1
fi

STACK_NAME=$1


export AWS_REGION=$(aws configure list | grep region | awk '{print $2}')
if [ "X$AWS_REGION" = "X" ]; then
  echo -e "AWS_REGION not set, check your aws profile or set AWS_DEFAULT_REGION"
  exit 2
fi
echo "AWS Region = $AWS_REGION"
export AWS_DEFAULT_REGION=$AWS_REGION
export ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)

TENANT_MGMT_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-TenantManagementECR'].Value" --output text)
TENANT_REG_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-TenantRegistrationECR'].Value" --output text)
USER_MGMT_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-UserManagementECR'].Value" --output text)
SAAS_APP_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-SaasAppECR'].Value" --output text)
PRODUCT_SERVICE_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-ProductECR'].Value" --output text)
ORDER_SERVICE_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-OrderECR'].Value" --output text)

aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

echo "Build Tenant Management Service"
(cd services/shared-services/tenant-management-service &&
docker build -t tenant-management-service .)

echo "Tag and push Tenant Management Service to its ECR repository"
docker tag tenant-management-service:latest $TENANT_MGMT_ECR:latest
docker push $TENANT_MGMT_ECR:latest


echo "Build Tenant Registration Service"
(cd services/shared-services/tenant-registration-service &&
docker build -t tenant-registration-service .)

echo "Tag and push Tenant Registration Service to its ECR repository"
docker tag tenant-registration-service $TENANT_REG_ECR:latest
docker push $TENANT_REG_ECR:latest

echo "Build User Management Service"
(cd services/shared-services/user-management-service &&
docker build -t user-management-service .)

echo "Tag and push User Management Service to its ECR repository"
docker tag user-management-service $USER_MGMT_ECR:latest
docker push $USER_MGMT_ECR:latest

echo "Build the Product Service"
(cd services/application-services/product-service &&
docker build -t product-service .)

echo "Tag and push Product Service to its ECR repository"
docker tag product-service $PRODUCT_SERVICE_ECR:latest
docker push $PRODUCT_SERVICE_ECR:latest

echo "Build the Order Service"
(cd services/application-services/order-service &&
docker build -t order-service .)

echo "Tag and push Order Service to its ECR repository"
docker tag order-service $ORDER_SERVICE_ECR:latest
docker push $ORDER_SERVICE_ECR:latest
#!/bin/bash
: "${STACK_NAME:=$1}"
: "${DOMAIN_NAME:=$2}"


USAGE_PROMPT="Use: $0 <STACKNAME> <DOMAINNAME>\n
Example: $0 test-stack mydomain.com"

if [[ -z ${STACK_NAME} ]]; then
  echo "Stack Name was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi  

if [[ -z ${DOMAIN_NAME} ]]; then
  echo "Domain Name was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi  

EKS_REF_ROOT_DIR=$(pwd)
export AWS_DEFAULT_REGION=$AWS_REGION

TENANT_MGMT_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-TenantManagementECR'].Value" --output text)
TENANT_REG_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-TenantRegistrationECR'].Value" --output text)
USER_MGMT_ECR=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-UserManagementECR'].Value" --output text)

echo "Install Nginx controller"
cd resources/templates
ACM_CERT=$(aws acm list-certificates  --query "CertificateSummaryList[?DomainName=='*.$DOMAIN_NAME'].CertificateArn" --output text)
sed -i -e 's,ACM_CERT,'$ACM_CERT',g' nginx-ingress-config.yaml

helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install nginx-eks-saas --values nginx-ingress-config.yaml ingress-nginx/ingress-nginx

echo "Helm external-dns installation"
sed -i -e 's,DOMAIN_NAME,'$DOMAIN_NAME',g' external-dns-config.yaml

helm repo add "bitnami" "https://charts.bitnami.com/bitnami"
helm install extdns --values external-dns-config.yaml bitnami/external-dns

echo "Waiting for the NLB to be created. This will be converted to an if exists condition check"
sleep 180

echo "Shared services deployment started"
sed 's,TENANT_MGMT_ECR,'$TENANT_MGMT_ECR',g' deployment-master.yaml > deployment.yaml
sed -i 's,TENANT_REG_ECR,'$TENANT_REG_ECR',g' deployment.yaml
sed -i 's,USER_MGMT_ECR,'$USER_MGMT_ECR',g' deployment.yaml
sed -i 's,DOMAIN_NAME,'$DOMAIN_NAME',g' deployment.yaml
kubectl delete -f deployment.yaml
kubectl apply -f deployment.yaml

echo "Shared services deployment complete!!"
rm deployment.yaml

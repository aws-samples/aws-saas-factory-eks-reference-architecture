#!/bin/bash -e


export CDK_PARAM_SYSTEM_ADMIN_EMAIL="$1"
CLOUD_9_INSTALL="$2"

if [[ -z "$CDK_PARAM_SYSTEM_ADMIN_EMAIL" ]]; then
  echo "Please provide system admin email"
  exit 1
fi

if [[ -z "$CLOUD_9_INSTALL" ]]; then
  echo "Setting region..."
  REGION=$(aws configure get region)
else
  echo "Setting region from instance metdata"
  TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
  REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/placement/availability-zone | sed 's/\(.*\)[a-z]/\1/')
fi

export CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME="aws-saas-factory-ref-solution-eks-saas-sbt"
if ! aws codecommit get-repository --repository-name $CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME; then
  CREATE_REPO=$(aws codecommit create-repository --repository-name $CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME --repository-description "eks saas reference architecture repository")
  echo "$CREATE_REPO"
fi

REPO_URL="codecommit::${REGION}://$CDK_PARAM_CODE_COMMIT_REPOSITORY_NAME"
if ! git remote add cc "$REPO_URL"; then
  echo "Setting url to remote cc"
  git remote set-url cc "$REPO_URL"
fi
git push cc "$(git branch --show-current)":main -f --no-verify
export CDK_PARAM_COMMIT_ID=$(git log --format="%H" -n 1)
# cd ../

# if [[ ! -d "saas-control-plane" ]]; then
#     git clone git@ssh.gitlab.aws.dev:saas-factory/saas-control-plane.git
# fi

# cd saas-control-plane
# npm install

# npx cdk bootstrap
# npx cdk deploy --all --require-approval never

# Preprovision pooled infrastructure
cd ../server
npm install

export CDK_PARAM_CONTROL_PLANE_SOURCE='sbt-control-plane-api'
export CDK_PARAM_ONBOARDING_DETAIL_TYPE='Onboarding'
export CDK_PARAM_PROVISIONING_DETAIL_TYPE=$CDK_PARAM_ONBOARDING_DETAIL_TYPE
export CDK_PARAM_APPLICATION_NAME_PLANE_SOURCE="sbt-application-plane-api"
export CDK_PARAM_OFFBOARDING_DETAIL_TYPE='Offboarding'
export CDK_PARAM_DEPROVISIONING_DETAIL_TYPE=$CDK_PARAM_OFFBOARDING_DETAIL_TYPE

npx cdk bootstrap
npx cdk deploy --all --no-rollback --require-approval never --concurrency 10 --asset-parallelism true

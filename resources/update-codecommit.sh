#!/usr/bin/env bash
#set -x
: "${STACK_NAME:=$1}"
USAGE_PROMPT="Use: $0 <STACKNAME> \n
Example: $0 test-stack"

if [[ -z ${STACK_NAME} ]]; then
  echo "Stack Name was not provided."
  echo -e $USAGE_PROMPT
  exit 2
fi

CLONE_URL=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-CodeCommitCloneUrl'].Value" --output text)

git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true

pip install git-remote-codecommit

git clone ${CLONE_URL}
cp -a buildspec.yml eks-tenant-saas-app-service/
cp -a services eks-tenant-saas-app-service/
cp -a resources eks-tenant-saas-app-service/
cd eks-tenant-saas-app-service/
git add .
git commit -am "EKS SaaS Reference Architecture Commit"
git push origin master
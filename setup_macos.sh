#!/bin/bash
echo "Installing kubectl"
sudo curl --silent --location -o /usr/local/bin/kubectl \
  https://amazon-eks.s3.us-west-2.amazonaws.com/1.21.2/2021-07-05/bin/linux/amd64/kubectl

sudo chmod +x /usr/local/bin/kubectl

echo "Upgrading AWS CLI"
sudo pip install --upgrade awscli && hash -r

echo "Installing helper tools"
sudo brew install jq gettext bash-completion moreutils

export ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)
export AWS_REGION=$(aws configure get default.region)
export AWS_DEFAULT_REGION=$AWS_REGION
test -n "$AWS_REGION" && echo AWS_REGION is "$AWS_REGION" || echo AWS_REGION is not set
echo "export ACCOUNT_ID=${ACCOUNT_ID}" | tee -a ~/.bash_profile
echo "export AWS_REGION=${AWS_REGION}" | tee -a ~/.bash_profile
echo "export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION}" | tee -a ~/.bash_profile
aws configure set default.region ${AWS_REGION}
aws configure get default.region

echo "Installing eksctl"
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp

sudo mv -v /tmp/eksctl /usr/local/bin

echo "Installing bash completion for eksctl"
eksctl completion bash >> ~/.bash_completion
. /opt/homebrew/etc/bash_completion
. ~/.bash_completion

echo "Installing helm"
curl -sSL https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash

echo 'yq() {
  docker run --rm -i -v "${PWD}":/workdir mikefarah/yq yq "$@"
}' | tee -a ~/.bashrc && source ~/.bashrc

for command in kubectl jq envsubst aws
  do
    which $command &>/dev/null && echo "$command in path" || echo "$command NOT FOUND"
  done

kubectl completion bash >>  ~/.bash_completion
. /opt/homebrew/etc/bash_completion
. ~/.bash_completion

# aws sts get-caller-identity --query Arn | grep eks-ref-arch-admin -q && echo "IAM role valid. You can continue setting up the EKS Cluster." || echo "IAM role NOT valid. Do not proceed with creating the EKS Cluster or you won't be able to authenticate. Ensure you assigned the role to your EC2 instance as detailed in the README.md of the eks-saas repo"

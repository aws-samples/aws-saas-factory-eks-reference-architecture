#!/bin/bash
echo "Installing kubectl"
sudo curl --silent --location -o /usr/local/bin/kubectl \
  https://amazon-eks.s3.us-west-2.amazonaws.com/1.21.2/2021-07-05/bin/linux/amd64/kubectl

sudo chmod +x /usr/local/bin/kubectl

echo "Upgrading AWS CLI"
sudo pip install --upgrade awscli && hash -r

echo "Installing helper tools"
sudo yum -y install jq gettext bash-completion moreutils

export ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)
export AWS_REGION=$(curl -s 169.254.169.254/latest/dynamic/instance-identity/document | jq -r '.region')
export AWS_DEFAULT_REGION=$AWS_REGION
test -n "$AWS_REGION" && echo AWS_REGION is "$AWS_REGION" || echo AWS_REGION is not set
echo "export ACCOUNT_ID=${ACCOUNT_ID}" | tee -a ~/.bash_profile
echo "export AWS_REGION=${AWS_REGION}" | tee -a ~/.bash_profile
echo "export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION}" | tee -a ~/.bash_profile
aws configure set default.region ${AWS_REGION}
aws configure get default.region

echo Resizing Cloud9 instance EBS Volume
sh resources/resize-cloud9-ebs-vol.sh

echo "Installing eksctl"
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp

sudo mv -v /tmp/eksctl /usr/local/bin

echo "Installing bash completion for eksctl"
eksctl completion bash >> ~/.bash_completion
. /etc/profile.d/bash_completion.sh
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
. /etc/profile.d/bash_completion.sh
. ~/.bash_completion

echo 'export ALB_INGRESS_VERSION="v1.1.8"' >>  ~/.bash_profile
.  ~/.bash_profile

rm -vf ${HOME}/.aws/credentials

echo "Installing Node and Angular"
nvm install 12.16
nvm use 12.16
npm install -g @angular/cli@9.1.0

echo "Generating a new key. Hit ENTER three times when prompted to accept the defaults"
ssh-keygen

aws ec2 import-key-pair --key-name "eks-saas" --public-key-material file://~/.ssh/id_rsa.pub

aws kms create-alias --alias-name alias/eks-ref-arch --target-key-id $(aws kms create-key --query KeyMetadata.Arn --output text)

export MASTER_ARN=$(aws kms describe-key --key-id alias/eks-ref-arch --query KeyMetadata.Arn --output text)

echo "export MASTER_ARN=${MASTER_ARN}" | tee -a ~/.bash_profile

aws sts get-caller-identity --query Arn | grep eks-ref-arch-admin -q && echo "IAM role valid. You can continue setting up the EKS Cluster." || echo "IAM role NOT valid. Do not proceed with creating the EKS Cluster or you won't be able to authenticate. Ensure you assigned the role to your EC2 instance as detailed in the README.md of the eks-saas repo"


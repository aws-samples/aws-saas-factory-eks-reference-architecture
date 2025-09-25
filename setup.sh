#!/bin/bash
echo "Installing kubectl"
sudo curl --silent --location -o /usr/local/bin/kubectl \
 "https://dl.k8s.io/release/v1.29.2/bin/linux/amd64/kubectl"

sudo chmod +x /usr/local/bin/kubectl

echo "Upgrading AWS CLI"
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install --update

# Check OS type
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
fi

# Package installation function
echo "Installing helper tools"
install_packages() {
    case $OS in
        "ubuntu"|"debian")
            echo "Detected Ubuntu/Debian - using apt"
            sudo apt update
            sudo apt install -y jq gettext bash-completion moreutils
            ;;
        "amzn"|"rhel"|"centos")
            echo "Detected Amazon Linux/RHEL/CentOS - using yum"
            sudo yum update -y
            sudo yum install -y jq gettext bash-completion moreutils
            ;;
        *)
            echo "Unsupported OS: $OS"
            exit 1
            ;;
    esac
}
# Run script
install_packages

export ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)
TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"` 
export AWS_REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
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

aws sts get-caller-identity --query Arn | grep eks-ref-arch-admin -q && echo "IAM role valid. You can continue setting up the EKS Cluster." || echo "IAM role NOT valid. Do not proceed with creating the EKS Cluster or you won't be able to authenticate. Ensure you assigned the role to your EC2 instance as detailed in the README.md of the eks-saas repo"


# SBT Lambda function must be built for ARM64 since v0.8.0 
# Setup multi-architecture build environment

# Make the script executable
chmod +x ./scripts/setup_multiarch.sh

# Run the setup_multiarch.sh script
echo "Running setup_multiarch.sh to configure ARM64 emulation..."
./scripts/setup_multiarch.sh

# Create a symlink in /usr/local/bin for global access
sudo ln -sf $(pwd)/scripts/setup_multiarch.sh /usr/local/bin/setup_multiarch

echo "ARM64 emulation setup complete!"
echo "You can run 'setup_multiarch' command anytime to refresh the configuration"
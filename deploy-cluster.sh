#!/bin/bash
. ~/.bash_profile

if [ "X$AWS_REGION" = "X" ]; then
  echo -e "AWS_REGION not set, check your aws profile or set AWS_DEFAULT_REGION"
  exit 2
fi

if [ "X$MASTER_ARN" = "X" ]; then
  echo -e "MASTER_ARN not set, did you run setup.sh?"
  exit 2
fi

cat << EOF > eks-cluster-config.yaml
---
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: eks-saas
  region: ${AWS_REGION}
  version: "1.21"

availabilityZones: ["${AWS_REGION}a", "${AWS_REGION}b", "${AWS_REGION}c"]

managedNodeGroups:
- name: nodegroup
  desiredCapacity: 3
  ssh:
    allow: true
    publicKeyName: eks-saas

# To enable all of the control plane logs, uncomment below:
# cloudWatch:
#  clusterLogging:
#    enableTypes: ["*"]

secretsEncryption:
  keyARN: ${MASTER_ARN}
EOF

eksctl create cluster -f eks-cluster-config.yaml
#!/bin/bash
# Destroy all CDK stacks in dependency order
# Run with: nohup bash destroy-all.sh > destroy-all.log 2>&1 &

set -e
REGION="ap-northeast-2"
LOG_PREFIX="[DESTROY]"

log() {
  echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log "=== Starting full infrastructure teardown ==="

# 1. Delete tenant stacks first (they depend on EKS cluster)
TENANT_STACKS=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --region $REGION \
  --query 'StackSummaries[?starts_with(StackName, `TenantStack-`) && !contains(StackName, `Nested`)].StackName' \
  --output text)

for STACK in $TENANT_STACKS; do
  # Skip nested stacks (they get deleted with parent)
  if [[ "$STACK" == *"Nested"* ]] || [[ "$STACK" == *"-TenantStack"* ]]; then
    log "Skipping nested stack: $STACK"
    continue
  fi
  log "Deleting tenant stack: $STACK"
  aws cloudformation delete-stack --stack-name "$STACK" --region $REGION
  aws cloudformation wait stack-delete-complete --stack-name "$STACK" --region $REGION
  log "Deleted: $STACK"
done

log "=== All tenant stacks deleted ==="

# 2. Delete Services stack (CodeBuild projects, ECR repos)
log "Deleting Services stack..."
npx cdk destroy Services --force --region $REGION 2>&1
log "Deleted: Services"

# 3. Delete StaticSites stack (CloudFront, S3, CodePipeline)
log "Deleting StaticSites stack..."
npx cdk destroy StaticSites --force --region $REGION 2>&1
log "Deleted: StaticSites"

# 4. Delete ApplicationPlane stack
log "Deleting ApplicationPlane stack..."
npx cdk destroy ApplicationPlane --force --region $REGION 2>&1
log "Deleted: ApplicationPlane"

# 5. Delete SaaSApi stack
log "Deleting SaaSApi stack..."
npx cdk destroy SaaSApi --force --region $REGION 2>&1
log "Deleted: SaaSApi"

# 6. Delete ControlPlane stack
log "Deleting ControlPlane stack..."
npx cdk destroy ControlPlane --force --region $REGION 2>&1
log "Deleted: ControlPlane"

# 7. Delete CommonResources stack
log "Deleting CommonResources stack..."
npx cdk destroy CommonResources --force --region $REGION 2>&1
log "Deleted: CommonResources"

# 8. Delete EKSSaaSCluster stack (takes longest - VPC, EKS, Istio)
log "Deleting EKSSaaSCluster stack (this will take a while)..."
npx cdk destroy EKSSaaSCluster --force --region $REGION 2>&1
log "Deleted: EKSSaaSCluster"

log "=== All stacks destroyed successfully ==="

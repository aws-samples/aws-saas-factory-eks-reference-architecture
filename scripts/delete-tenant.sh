#!/bin/bash -e
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

# This is a helper script to run basic queries against the control plane.
# usage:
# run-basic-queries.sh <control plane stack name> <admin user password> <email username> <email domain>

CONTROL_PLANE_STACK_NAME="$1"
ADMIN_USER_PASSWORD="$2"
EMAIL_USERNAME="$3"
EMAIL_DOMAIN="$4"
TENANT_ID="$5"

source scripts/generate-credentials.sh "$ADMIN_USER_PASSWORD"

CONTROL_PLANE_API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "$CONTROL_PLANE_STACK_NAME" \
    --query "Stacks[0].Outputs[?contains(OutputKey,'controlPlaneAPIEndpoint')].OutputValue" \
    --output text)

# generate data to use in new tenant request
TENANT_NAME="tenant$TENANT_ID"
TENANT_ID="$TENANT_ID"
TENANT_EMAIL="${EMAIL_USERNAME}+${TENANT_NAME}@${EMAIL_DOMAIN}"
DATA=$(jq --null-input \
    --arg tenantName "$TENANT_NAME" \
    --arg tenantEmail "$TENANT_EMAIL" \
    --arg tenantId "$TENANT_ID" \
    '{
  "tenantName": $tenantName,
  "email": $tenantEmail,
  "tier": "basic",
  "tenantId": $tenantId,
  "tenantStatus": "In progress"
}')

echo "deleting tenant..."
curl --request DELETE \
    --url "${CONTROL_PLANE_API_ENDPOINT}tenants/${TENANT_ID}" \
    --header "Authorization: Bearer ${ID_TOKEN}" \
    --header 'content-type: application/json' \
    --data "$DATA" \
    --silent | jq
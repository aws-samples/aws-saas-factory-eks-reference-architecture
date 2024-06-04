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

source scripts/generate-credentials.sh "$ADMIN_USER_PASSWORD"

CONTROL_PLANE_API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "$CONTROL_PLANE_STACK_NAME" \
    --query "Stacks[0].Outputs[?contains(OutputKey,'controlPlaneAPIEndpoint')].OutputValue" \
    --output text)

echo "retrieving ALL tenants..."
curl --request GET \
    --url "${CONTROL_PLANE_API_ENDPOINT}tenants" \
    --header "Authorization: Bearer ${ID_TOKEN}" \
    --silent | jq

#echo "deleting tenant..."
#curl --request DELETE \
#    --url "${CONTROL_PLANE_API_ENDPOINT}tenants/${TENANT_ID}" \
#    --header "Authorization: Bearer ${ID_TOKEN}" \
#    --header 'content-type: application/json' \
#    --data "$DATA" \
#    --silent | jq
#!/bin/bash
set +e

names=("ProductService" "ProductServiceTenantDeploy" "OrderService" "OrderServiceTenantDeploy" "UserService" "UserServiceTenantDeploy" "TenantOnboardingProject" "TenantDeletionProject")

for synth in /tmp/synth-dynamodb.json /tmp/synth-postgresql.json; do
  echo "### Synth: $synth ###"
  for n in "${names[@]}"; do
    val=$(jq -r --arg n "$n" '.Resources | to_entries[] | select(.value.Type == "AWS::CodeBuild::Project" and .value.Properties.Name == $n) | .value.Properties.Environment.EnvironmentVariables[] | select(.Name == "CDK_USE_DB") | .Value' "$synth")
    if [ -z "$val" ]; then
      echo "  $n CDK_USE_DB: <absent>"
    else
      echo "  $n CDK_USE_DB: $val"
    fi
  done
  echo ""
done

echo "### pre_build for ProductService (Initial, dynamodb synth) ###"
jq -c '.Resources | to_entries[] | select(.value.Type == "AWS::CodeBuild::Project" and .value.Properties.Name == "ProductService") | .value.Properties.Source.BuildSpec | fromjson | .phases.pre_build.commands' /tmp/synth-dynamodb.json

echo ""
echo "### pre_build for ProductServiceTenantDeploy (postgresql synth) ###"
jq -c '.Resources | to_entries[] | select(.value.Type == "AWS::CodeBuild::Project" and .value.Properties.Name == "ProductServiceTenantDeploy") | .value.Properties.Source.BuildSpec | fromjson | .phases.pre_build.commands' /tmp/synth-postgresql.json

echo ""
echo "### pre_build for OrderService (Initial, dynamodb synth) — must NOT contain SRC= ###"
jq -c '.Resources | to_entries[] | select(.value.Type == "AWS::CodeBuild::Project" and .value.Properties.Name == "OrderService") | .value.Properties.Source.BuildSpec | fromjson | .phases.pre_build.commands' /tmp/synth-dynamodb.json

echo ""
echo "### pre_build for OrderServiceTenantDeploy (dynamodb synth) — must NOT contain SRC= ###"
jq -c '.Resources | to_entries[] | select(.value.Type == "AWS::CodeBuild::Project" and .value.Properties.Name == "OrderServiceTenantDeploy") | .value.Properties.Source.BuildSpec | fromjson | .phases.pre_build.commands' /tmp/synth-dynamodb.json

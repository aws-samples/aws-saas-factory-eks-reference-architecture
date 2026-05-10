import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { SourceBucket } from './source-bucket';

export interface ApplicationServiceProps {
  readonly name: string;
  readonly assetDirectory: string; // Path to services/application-services/
  readonly ecrImageName: string;
  readonly eksClusterName: string;
  readonly codebuildKubectlRole: iam.IRole;
  readonly serviceUrlPrefix: string;
  readonly dockerfileName: string; // e.g. Dockerfile.product
  /**
   * Service-specific env vars declared in `services-template.json` /
   * `services.json` under the `environment` map. ECS parity (sbt-04).
   *
   * Supported placeholders inside the VALUES (substituted at CodeBuild
   * pre_build time, NOT at CDK synth time):
   *   · `<APP_SITE_URL>` → StaticSites `ApplicationSiteUrl` output
   *     (the Application SPA CloudFront origin, no trailing slash)
   *
   * Typical SSR usage:
   *   `"environment": { "CDN_URL": "<APP_SITE_URL>/<service-name>" }`
   *
   * API-only services simply omit this map.
   */
  readonly environment?: Record<string, string>;
  /**
   * When true, this service's CodeBuild projects (Initial + TenantDeploy) get:
   *   (a) a `CDK_USE_DB` environment variable whose value defaults to
   *       `process.env.CDK_USE_DB ?? 'dynamodb'`.
   *   (b) a `pre_build` step that copies the selected
   *       product_<dynamodb|postgresql>/ source tree into
   *       application/microservices/product/ so the downstream
   *       `docker build -f application/$DOCKERFILE_NAME` call is
   *       byte-identical across backends.
   *   (c) a Kustomize-overlay-aware build phase that runs
   *       `kubectl apply -k kubernetes/products/overlays/$CDK_USE_DB`
   *       and — on the postgresql branch — resolves SharedDbStack's
   *       `SharedDb-*` CfnOutput exports via `aws cloudformation
   *       describe-stacks` and `sed`-substitutes them into
   *       `overlays/postgresql/env-postgresql.yaml` immediately
   *       before `kubectl apply`.
   *
   * Product-only — see Requirement 2.4 (OrderService / UserService MUST
   * NOT declare CDK_USE_DB). Defaults to `false`.
   */
  readonly productDbSwitching?: boolean;
}

export class ApplicationService extends Construct {
  readonly codeRepositoryUrl: string;

  constructor(scope: Construct, id: string, props: ApplicationServiceProps) {
    super(scope, id);

    // -------------------------------------------------------------------
    // Product-only DB-backend selection (Req 2.1/2.8 + Phase 5 overlays)
    // -------------------------------------------------------------------
    // `productDbSwitching` gates ALL Phase-2/Phase-5 additions. When
    // false (Order / User), the CodeBuild projects below behave exactly
    // as they did before this feature.
    const dbSelectionPreBuild = props.productDbSwitching
      ? [
          // Single shell block (multi-line string) — runs AFTER the two
          // `docker login` lines in the initial-build project's pre_build.
          // The `docker build` in the build phase reads from
          // application/microservices/product/, which this block populates.
          [
            'if [ "$CDK_USE_DB" = "postgresql" ]; then',
            '  SRC=application/microservices/product_postgresql',
            'else',
            '  SRC=application/microservices/product_dynamodb',
            'fi',
            'if [ ! -d "$SRC" ]; then',
            '  echo "ERROR: $SRC does not exist on the CodeBuild workdir" >&2',
            '  exit 1',
            'fi',
            'rm -rf application/microservices/product',
            'cp -r "$SRC" application/microservices/product',
          ].join('\n'),
        ]
      : [];
    const dbSelectionEnv: Record<string, codebuild.BuildEnvironmentVariable> =
      props.productDbSwitching
        ? { CDK_USE_DB: { value: process.env.CDK_USE_DB ?? 'dynamodb' } }
        : {};

    // ------------------------------------------------------------------
    // Service-specific env vars (ECS parity: services-template.json
    // `environment` map). Serialised at synth-time into a Kustomize-ready
    // YAML snippet and handed to CodeBuild as `EXTRA_ENV_YAML`. The
    // buildspec performs two steps:
    //
    //   1. Substitute `<APP_SITE_URL>` inside the YAML snippet with the
    //      value resolved from the StaticSites stack's
    //      `ApplicationSiteUrl` output (best-effort — empty string if
    //      StaticSites is not deployed yet).
    //   2. Replace the `# KUSTOMIZE_EXTRA_ENV_ANCHOR` line inside the
    //      relevant manifest (base/service.yaml for product, flat
    //      service.yaml for order/user) with the substituted YAML.
    //
    // Services declare their own env in `services-template.json`:
    //   "environment": { "CDN_URL": "<APP_SITE_URL>/<service-name>" }
    // Services with no `environment` map still get the anchor rendered
    // as an empty line — harmless for Kustomize.
    // ------------------------------------------------------------------
    const extraEnvYaml = this.renderExtraEnvYaml(props.environment);
    const extraEnvEnv: Record<string, codebuild.BuildEnvironmentVariable> = {
      EXTRA_ENV_YAML: { value: extraEnvYaml },
    };

    const extraEnvResolvePreBuild = [
      [
        // Resolve <APP_SITE_URL> placeholder inside EXTRA_ENV_YAML using
        // StaticSites' `ApplicationSiteUrl` output. Best-effort: empty
        // if StaticSites hasn't been deployed yet (first install), in
        // which case SSR services fall back to their in-pod static
        // serving.
        'APPLICATION_SITE_URL=$(aws cloudformation describe-stacks --stack-name StaticSites --query "Stacks[0].Outputs[?OutputKey==\'ApplicationSiteUrl\'].OutputValue" --output text --region $AWS_REGION 2>/dev/null || echo "")',
        'if [ "$APPLICATION_SITE_URL" = "None" ]; then APPLICATION_SITE_URL=""; fi',
        // Strip trailing slash so values like `<APP_SITE_URL>/<service>`
        // don't end up as `https://d1234.cloudfront.net//<service>`.
        'APPLICATION_SITE_URL="${APPLICATION_SITE_URL%/}"',
        // Write EXTRA_ENV_YAML to file first, then use sed to replace
        // the placeholder. Bash parameter expansion (`${var//pat/rep}`)
        // breaks when the variable value contains double-quotes that
        // collide with the assignment's outer quoting (exit status 2).
        'printf "%s\\n" "$EXTRA_ENV_YAML" > /tmp/extra-env.yaml',
        'sed -i "s|<APP_SITE_URL>|${APPLICATION_SITE_URL}|g" /tmp/extra-env.yaml',
        'EXTRA_ENV_YAML=$(cat /tmp/extra-env.yaml)',
        'export EXTRA_ENV_YAML APPLICATION_SITE_URL',
      ].join('\n'),
    ];

    // sed-in-place helper that splices the resolved extra env YAML into
    // the manifest line marked with `# KUSTOMIZE_EXTRA_ENV_ANCHOR`.
    // Manifest files without that anchor are left untouched (the
    // `/ANCHOR/{ r...; d }` range simply matches no lines).
    const extraEnvSplice = (manifestPath: string): string =>
      `sed -i -e '/# KUSTOMIZE_EXTRA_ENV_ANCHOR/ { r /tmp/extra-env.yaml' -e 'd' -e '}' ${manifestPath}`;

    // -------------------------------------------------------------------
    // Post-build deploy loop — Phase 5 dual-layout aware.
    // -------------------------------------------------------------------
    // Product (productDbSwitching=true): runs against the base/overlays
    // kustomize layout. `sed`-substitutes KUSTOMIZE_* placeholders into
    // `base/service.yaml`, `base/patches/svc-acc-patch-template.yaml`,
    // and (on the postgresql branch) `overlays/postgresql/env-postgresql.yaml`,
    // then `kubectl apply -k overlays/$CDK_USE_DB`.
    //
    // Order / User (productDbSwitching=false): unchanged flat layout —
    // `sed`-substitutes into `service.yaml` and `kubectl apply -k` the
    // service dir directly. This path is byte-identical to the
    // pre-Phase-5 buildspec.
    // Wrap the whole loop in `bash -euo pipefail -c` so CodeBuild receives
    // it as a single argv element. Without this wrapper, CodeBuild's
    // command-string boundary can mangle embedded newlines (the `do\n ...`
    // lines have been observed collapsing into `do && \TENANT_DATA=...`
    // on some runners). `-e` aborts on first error — replaces the
    // chain-of-`&&` pattern this file used to rely on.
    const productLoopBody = [
      // Loop over every tenant namespace; TENANT_DATA / TENANT_PLAN /
      // ABAC_ROLE / USER_POOL_ID / ORDER_TABLE / TAG_KEYS_MAPPING are
      // resolved exactly once per tenant.
      'for res in $(kubectl get ns -l saas/tenant=true -o jsonpath=\'{.items[*].metadata.name}\'); do',
      '  TENANT_DATA=$(aws dynamodb get-item --table-name Tenant --key \'{"TENANT_ID":{"S":"\'$res\'"}}\' --output json --region $AWS_REGION 2>/dev/null)',
      '  TENANT_PLAN=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'PLAN\',{}).get(\'S\',\'standard\'))" 2>/dev/null || echo "standard")',
      '  ABAC_ROLE=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'ABAC_ROLE_ARN\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "")',
      '  USER_POOL_ID=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'USER_POOL_ID\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "")',
      '  TENANT_NAME=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'COMPANY_NAME\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "")',
      '  if [ "$TENANT_PLAN" = "basic" ]; then ORDER_TABLE="Order"; else ORDER_TABLE="Order-$res"; fi',
      '  TAG_KEYS_MAPPING=\'{"tenant":"custom:tenant-id"}\'',
      // Overlay selection — Basic+postgresql and Std/Prem+postgresql
      // share the same `overlays/postgresql/`. Tier branching happens
      // at app runtime inside ProductsService based on TENANT_NAME
      // (empty string → basic_pool_db / basic_pool_user). CodeBuild
      // only picks the DB backend:
      //   (dynamodb,   *)  -> overlays/dynamodb
      //   (postgresql, *)  -> overlays/postgresql
      '  if [ "$CDK_USE_DB" = "dynamodb" ]; then',
      '    TENANT_DB=dynamodb',
      '  else',
      '    TENANT_DB=postgresql',
      '  fi',
      '  cp kubernetes/products/base/service.yaml kubernetes/products/base/service.yaml.orig',
      '  cp kubernetes/products/base/patches/svc-acc-patch-template.yaml kubernetes/products/base/patches/svc-acc-patch.yaml',
      '  echo "  value: $res-service-account" >> kubernetes/products/base/patches/svc-acc-patch.yaml',
      '  sed -i "s|KUSTOMIZE_TENANT_ID|$res|g" kubernetes/products/base/service.yaml',
      '  OVERLAY=kubernetes/products/overlays/$TENANT_DB',
      // `env-$TENANT_DB.yaml` resolves to env-dynamodb.yaml /
      // env-postgresql.yaml — Basic+postgresql and Std/Prem+postgresql
      // share the same overlay, so the postgresql-basic overlay no
      // longer exists.
      '  cp $OVERLAY/env-$TENANT_DB.yaml $OVERLAY/env-$TENANT_DB.yaml.orig',
      '  sed -i "s|KUSTOMIZE_AWS_REGION|$AWS_REGION|g" $OVERLAY/env-$TENANT_DB.yaml',
      '  sed -i "s|KUSTOMIZE_TENANT_TIER|$TENANT_PLAN|g" $OVERLAY/env-$TENANT_DB.yaml',
      '  case "$TENANT_DB" in',
      '    dynamodb)',
      '      sed -i "s|KUSTOMIZE_IAM_ROLE_ARN|$ABAC_ROLE|g" $OVERLAY/env-dynamodb.yaml',
      '      sed -i "s|KUSTOMIZE_TAG_KEYS_MAPPING|$TAG_KEYS_MAPPING|g" $OVERLAY/env-dynamodb.yaml',
      '      ;;',
      '    postgresql)',
      // Basic substitutes TENANT_NAME with an empty string → the app
      // branches into pool mode. Standard/Premium inject
      // Tenant.COMPANY_NAME as-is.
      '      if [ "$TENANT_PLAN" = "basic" ]; then',
      '        EFFECTIVE_TENANT_NAME=""',
      '      else',
      '        EFFECTIVE_TENANT_NAME="$TENANT_NAME"',
      '      fi',
      '      sed -i "s|KUSTOMIZE_SHARED_DB_SESSION_ROLE_ARN|$SHARED_DB_SESSION_ROLE_ARN|g" $OVERLAY/env-postgresql.yaml',
      '      sed -i "s|KUSTOMIZE_SHARED_DB_PROXY_ENDPOINT|$SHARED_DB_PROXY_ENDPOINT|g" $OVERLAY/env-postgresql.yaml',
      '      sed -i "s|KUSTOMIZE_SHARED_DB_CLUSTER_ENDPOINT_RESOURCE|$SHARED_DB_CLUSTER_ENDPOINT_RESOURCE|g" $OVERLAY/env-postgresql.yaml',
      '      sed -i "s|KUSTOMIZE_TENANT_NAME|$EFFECTIVE_TENANT_NAME|g" $OVERLAY/env-postgresql.yaml',
      '      ;;',
      '  esac',
      // ECS parity: splice services-template.json `environment` map
      // into whichever env yaml this overlay uses.
      '  ' + extraEnvSplice('$OVERLAY/env-$TENANT_DB.yaml'),
      '  echo "images:" >> $OVERLAY/kustomization.yaml.tenant',
      '  echo "- name: KUSTOMIZE_IMAGE" >> $OVERLAY/kustomization.yaml.tenant',
      '  echo "  newName: $ECR_REPO_URI" >> $OVERLAY/kustomization.yaml.tenant',
      '  echo "  newTag: v1" >> $OVERLAY/kustomization.yaml.tenant',
      '  cp $OVERLAY/kustomization.yaml $OVERLAY/kustomization.yaml.orig',
      '  cat $OVERLAY/kustomization.yaml.tenant >> $OVERLAY/kustomization.yaml',
      '  rm $OVERLAY/kustomization.yaml.tenant',
      '  kubectl apply -k $OVERLAY -n $res',
      '  mv kubernetes/products/base/service.yaml.orig kubernetes/products/base/service.yaml',
      '  rm kubernetes/products/base/patches/svc-acc-patch.yaml',
      '  mv $OVERLAY/env-$TENANT_DB.yaml.orig $OVERLAY/env-$TENANT_DB.yaml',
      '  mv $OVERLAY/kustomization.yaml.orig $OVERLAY/kustomization.yaml',
      'done',
    ].join('\n');

    // Base64-encode the loop body so real newlines survive the round trip
    // through CDK → buildspec (JSON) → CodeBuild agent → `sh -c` → bash.
    //
    // Prior approach used `bash -euo pipefail -c ${JSON.stringify(...)}`,
    // which emitted the body with `\n` escape sequences. Those arrive at
    // bash as literal two-char `\n` (bash `-c` string, no ANSI-C quoting),
    // and unquoted `\n` in a bash script is the escape of `n` → single
    // character `n`. That merges tokens across "lines": `fi\n  cp ...`
    // becomes `fin  cp ...`, so the `if` block is never closed and bash
    // aborts with `syntax error: unexpected end of file` (exit 2). The
    // legacy flat-layout loop avoids this because it uses JS line-
    // continuation (`\` at EOL inside a single-quoted string) so it was
    // already a single physical line of shell.
    //
    // Base64 has no whitespace-sensitive characters, so the payload is
    // opaque to every intermediate layer. `base64 -d | bash -euo pipefail`
    // restores the original newlines at execution time.
    const productLoopBodyB64 = Buffer.from(productLoopBody, 'utf8').toString('base64');
    const productInitialPostBuildLoop = `echo ${productLoopBodyB64} | base64 -d | bash -euo pipefail`;

    // Phase 5.6 — resolve SharedDbStack exports once per CodeBuild run
    // when CDK_USE_DB=postgresql. Runs for EVERY service (not gated by
    // productDbSwitching) so any service that declares PG-backed env
    // placeholders (KUSTOMIZE_SHARED_DB_*) picks the values up through
    // the same sed substitution mechanism. Services that don't use PG
    // simply don't reference the exports — no harm done.
    //
    // Export names match the ECS sister reference exactly:
    //   STSRoleArn, RdsProxyEndpoint, DbProxyArn, DbProxyName.
    const sharedDbResolvePreBuild = [
      [
        'if [ "${CDK_USE_DB:-dynamodb}" = "postgresql" ]; then',
        '  SHARED_DB_SESSION_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name SharedDb --query "Stacks[0].Outputs[?OutputKey==\'STSRoleArn\'].OutputValue" --output text --region $AWS_REGION)',
        '  SHARED_DB_PROXY_ENDPOINT=$(aws cloudformation describe-stacks --stack-name SharedDb --query "Stacks[0].Outputs[?OutputKey==\'RdsProxyEndpoint\'].OutputValue" --output text --region $AWS_REGION)',
        // rds-db:connect IAM auth requires the proxy RESOURCE ID
        // (prx-xxxxxxxxx), NOT the user-facing proxy name. Extract
        // it from the proxy ARN ("...:db-proxy:prx-xxxxxxxxx").
        '  PROXY_RESOURCE_ID=$(aws cloudformation describe-stacks --stack-name SharedDb --query "Stacks[0].Outputs[?OutputKey==\'DbProxyArn\'].OutputValue" --output text --region $AWS_REGION | sed -n "s|.*:db-proxy:\\(prx-[a-z0-9]*\\)|\\1|p")',
        // Trailing slash is intentional — runtime appends user_<tenantName>.
        '  SHARED_DB_CLUSTER_ENDPOINT_RESOURCE="arn:aws:rds-db:${AWS_REGION}:${AWS_ACCOUNT}:dbuser:${PROXY_RESOURCE_ID}/"',
        '  export SHARED_DB_SESSION_ROLE_ARN SHARED_DB_PROXY_ENDPOINT SHARED_DB_CLUSTER_ENDPOINT_RESOURCE',
        'fi',
      ].join('\n'),
    ];

    // CDK_USE_DB must be set on every CodeBuild project (not just
    // `productDbSwitching`) so the sharedDbResolvePreBuild block above
    // can key off it. Services that don't do DB-source-switching still
    // receive CDK_USE_DB but only read it in the pre_build SharedDb
    // resolve — their build/post_build phases ignore it.
    const cdkUseDbEnv: Record<string, codebuild.BuildEnvironmentVariable> = {
      CDK_USE_DB: { value: process.env.CDK_USE_DB ?? 'dynamodb' },
    };

    // Legacy flat-layout post_build loop — orders / users / flat SSR
    // services all go through here. Previously limited to DynamoDB
    // only; now also handles PostgreSQL-backed flat services by
    // running the SHARED_DB_* + TENANT_NAME sed substitutions when
    // CDK_USE_DB=postgresql. When CDK_USE_DB=dynamodb the PG sed lines
    // simply match nothing and are no-ops (services without those
    // placeholders in their service.yaml stay untouched).
    //
    // Layout contract for flat services:
    //   kubernetes/<prefix>/
    //     service.yaml       — Deployment + Service + VS with KUSTOMIZE_*
    //                          placeholders and # KUSTOMIZE_EXTRA_ENV_ANCHOR
    //     kustomization.yaml — references service.yaml + JSON6902 SA patch
    //     patches/svc-acc-patch-template.yaml
    //
    // TENANT_NAME rule mirrors the product loop:
    //   · Basic  → empty string (runtime branches to basic_pool_*)
    //   · Std/Prem → Tenant.COMPANY_NAME
    const legacyInitialPostBuildLoop =
      'for res in `kubectl get ns -l saas/tenant=true -o jsonpath=\'{.items[*].metadata.name}\'`; do \
                TENANT_DATA=$(aws dynamodb get-item --table-name Tenant --key \'{"TENANT_ID":{"S":"\'$res\'"}}\' --output json --region $AWS_REGION 2>/dev/null) && \
                TENANT_PLAN=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'PLAN\',{}).get(\'S\',\'standard\'))" 2>/dev/null || echo "standard") && \
                ABAC_ROLE=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'ABAC_ROLE_ARN\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "") && \
                USER_POOL_ID=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'USER_POOL_ID\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "") && \
                TENANT_NAME=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'COMPANY_NAME\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "") && \
                if [ "$TENANT_PLAN" = "basic" ]; then ORDER_TABLE="Order"; else ORDER_TABLE="Order-$res"; fi && \
                if [ "$TENANT_PLAN" = "basic" ]; then EFFECTIVE_TENANT_NAME=""; else EFFECTIVE_TENANT_NAME="$TENANT_NAME"; fi && \
                TAG_KEYS_MAPPING=\'{"tenant":"custom:tenant-id"}\' && \
                cp kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch-template.yaml kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml && \
                echo "  value: $res-service-account" >> kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml && \
                sed -i "s|KUSTOMIZE_ORDER_TABLE_NAME|$ORDER_TABLE|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_AWS_REGION|$AWS_REGION|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_TENANT_TIER|$TENANT_PLAN|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_IAM_ROLE_ARN|$ABAC_ROLE|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_TAG_KEYS_MAPPING|$TAG_KEYS_MAPPING|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_COGNITO_USER_POOL_ID|$USER_POOL_ID|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_TENANT_ID|$res|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_SHARED_DB_SESSION_ROLE_ARN|${SHARED_DB_SESSION_ROLE_ARN:-}|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_SHARED_DB_PROXY_ENDPOINT|${SHARED_DB_PROXY_ENDPOINT:-}|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_SHARED_DB_CLUSTER_ENDPOINT_RESOURCE|${SHARED_DB_CLUSTER_ENDPOINT_RESOURCE:-}|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_TENANT_NAME|$EFFECTIVE_TENANT_NAME|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i -e "/# KUSTOMIZE_EXTRA_ENV_ANCHOR/ { r /tmp/extra-env.yaml" -e "d" -e "}" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                kubectl apply -k kubernetes/$SERVICE_URL_PREFIX/ -n $res && \
                cp kubernetes/$SERVICE_URL_PREFIX/service.yaml.orig kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                rm kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml; done';

    const initialPostBuildCommands = props.productDbSwitching
      ? [
          'aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME',
          productInitialPostBuildLoop,
        ]
      : [
          'aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME',
          'echo "  newName: $ECR_REPO_URI" >> kubernetes/$SERVICE_URL_PREFIX/kustomization.yaml',
          'echo "  newTag: v1" >> kubernetes/$SERVICE_URL_PREFIX/kustomization.yaml',
          'cp kubernetes/$SERVICE_URL_PREFIX/service.yaml kubernetes/$SERVICE_URL_PREFIX/service.yaml.orig',
          legacyInitialPostBuildLoop,
        ];

    const containerRepo = new ecr.Repository(this, `${id}ECR`, {
      repositoryName: props.ecrImageName,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const containerRepoUri = containerRepo.repositoryUri;

    new cr.AwsCustomResource(this, 'ECRRepoDeletion', {
      onDelete: {
        service: 'ECR',
        action: 'deleteRepository',
        parameters: {
          repositoryName: containerRepo.repositoryName,
          force: true,
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [containerRepo.repositoryArn] }),
    });

    // Source bucket packages the entire services/application-services/ directory
    // CodeBuild accesses both application/ (Docker) and kubernetes/ (manifests)
    const sourceBucket = new SourceBucket(this, `${props.name}SourceBucket`, {
      assetDirectory: props.assetDirectory,
      name: props.name,
    });

    // =========================================================
    // Initial build: Docker build + deploy to all tenant namespaces
    // =========================================================
    const project = new codebuild.Project(this, `${id}EKSDeployProject`, {
      projectName: `${props.name}`,
      source: sourceBucket.source,
      role: props.codebuildKubectlRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      environmentVariables: {
        CLUSTER_NAME: { value: `${props.eksClusterName}` },
        ECR_REPO_URI: { value: containerRepoUri },
        AWS_REGION: { value: Stack.of(this).region },
        AWS_ACCOUNT: { value: Stack.of(this).account },
        SERVICE_IMAGE_NAME: { value: props.ecrImageName },
        SERVICE_URL_PREFIX: { value: props.serviceUrlPrefix },
        DOCKERFILE_NAME: { value: props.dockerfileName },
        // CDK_USE_DB is injected into every service so the shared
        // SharedDb exports pre_build can gate on it. Product-only
        // DB-source-switching is still controlled by dbSelectionPreBuild.
        ...cdkUseDbEnv,
        // Req 2.1/2.8: Product-only DB-backend selection (empty spread when off).
        ...dbSelectionEnv,
        // ECS parity: services-template.json `environment` map.
        ...extraEnvEnv,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'KUBECTL_VERSION=$(curl -L -s https://api.github.com/repos/kubernetes/kubernetes/releases/latest | grep \'"tag_name":\' | cut -d\'"\' -f4)',
              'curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"',
              'chmod +x ./kubectl',
            ],
          },
          pre_build: {
            commands: [
              'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO_URI',
              'aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws',
              // Req 2.1/2.8: Product-only DB-backend selection.
              ...dbSelectionPreBuild,
              // Req 5.6: resolve SharedDb exports once when CDK_USE_DB=postgresql.
              ...sharedDbResolvePreBuild,
              // ECS parity: resolve <APP_SITE_URL> placeholder in EXTRA_ENV_YAML.
              ...extraEnvResolvePreBuild,
            ],
          },
          build: {
            commands: [
              // Docker build from application/ directory using service-specific Dockerfile
              'docker build -t $SERVICE_IMAGE_NAME:v1 -f application/$DOCKERFILE_NAME application/',
              'docker tag $SERVICE_IMAGE_NAME:v1 $ECR_REPO_URI:latest',
              'docker tag $SERVICE_IMAGE_NAME:v1 $ECR_REPO_URI:v1',
              'docker push $ECR_REPO_URI:latest',
              'docker push $ECR_REPO_URI:v1',
            ],
          },
          post_build: {
            commands: initialPostBuildCommands,
          },
        },
      }),
    });

    containerRepo.grantPullPush(project.role!);

    const buildTriggerResource = new cr.AwsCustomResource(this, 'ApplicationSvcIntialBuild', {
      onCreate: {
        service: 'CodeBuild',
        action: 'startBuild',
        parameters: { projectName: project.projectName },
        physicalResourceId: cr.PhysicalResourceId.of(`InitialAppSvcDeploy-${props.name}`),
        outputPaths: ['build.id', 'build.buildNumber'],
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [project.projectArn] }),
    });
    buildTriggerResource.node.addDependency(project);

    // =========================================================
    // Tenant deploy: deploys to a specific tenant namespace
    // =========================================================
    const tenantBuildCommands = props.productDbSwitching
      ? [
          'aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME',
          // Product per-tenant deploy — Kustomize overlay path.
          // Base service.yaml placeholders:
          'sed -i "s|KUSTOMIZE_TENANT_ID|$TENANT_ID|g" kubernetes/products/base/service.yaml',
          // ServiceAccount JSON6902 patch:
          'cp kubernetes/products/base/patches/svc-acc-patch-template.yaml kubernetes/products/base/patches/svc-acc-patch.yaml',
          'echo "  value: $TENANT_ID-service-account" >> kubernetes/products/base/patches/svc-acc-patch.yaml',
          // Overlay-specific placeholders. The entire `if/then/else/fi`
          // block MUST be one shell command, because CodeBuild runs every
          // array element as its own shell invocation — splitting
          // `if ...; then` across elements produces a syntax error at
          // parse time and aborts the BUILD phase before any kubectl
          // apply runs (which manifests end-to-end as 404 on /products
          // because the Product Deployment never lands in the tenant
          // namespace).
          [
            // Overlay selection — Basic+postgresql and Std/Prem+postgresql
            // share the same `overlays/postgresql/`. Tier branching
            // happens at app runtime inside ProductsService based on
            // TENANT_NAME presence:
            //   (dynamodb,   *)  -> overlays/dynamodb
            //   (postgresql, *)  -> overlays/postgresql
            'if [ "$CDK_USE_DB" = "dynamodb" ]; then',
            '  TENANT_DB=dynamodb',
            'else',
            '  TENANT_DB=postgresql',
            'fi',
            'OVERLAY=kubernetes/products/overlays/$TENANT_DB',
            'sed -i "s|KUSTOMIZE_AWS_REGION|$AWS_REGION|g" $OVERLAY/env-$TENANT_DB.yaml',
            'sed -i "s|KUSTOMIZE_TENANT_TIER|$TENANT_PLAN|g" $OVERLAY/env-$TENANT_DB.yaml',
            'case "$TENANT_DB" in',
            '  dynamodb)',
            '    sed -i "s|KUSTOMIZE_IAM_ROLE_ARN|$ABAC_ROLE|g" $OVERLAY/env-dynamodb.yaml',
            '    sed -i "s|KUSTOMIZE_TAG_KEYS_MAPPING|$TAG_KEYS_MAPPING|g" $OVERLAY/env-dynamodb.yaml',
            '    ;;',
            '  postgresql)',
            // Basic substitutes TENANT_NAME with an empty string → the
            // app branches into pool mode. Standard/Premium inject
            // Tenant.COMPANY_NAME as-is.
            '    if [ "$TENANT_PLAN" = "basic" ]; then',
            '      EFFECTIVE_TENANT_NAME=""',
            '    else',
            '      EFFECTIVE_TENANT_NAME="$TENANT_NAME"',
            '    fi',
            '    sed -i "s|KUSTOMIZE_SHARED_DB_SESSION_ROLE_ARN|$SHARED_DB_SESSION_ROLE_ARN|g" $OVERLAY/env-postgresql.yaml',
            '    sed -i "s|KUSTOMIZE_SHARED_DB_PROXY_ENDPOINT|$SHARED_DB_PROXY_ENDPOINT|g" $OVERLAY/env-postgresql.yaml',
            '    sed -i "s|KUSTOMIZE_SHARED_DB_CLUSTER_ENDPOINT_RESOURCE|$SHARED_DB_CLUSTER_ENDPOINT_RESOURCE|g" $OVERLAY/env-postgresql.yaml',
            '    sed -i "s|KUSTOMIZE_TENANT_NAME|$EFFECTIVE_TENANT_NAME|g" $OVERLAY/env-postgresql.yaml',
            '    ;;',
            'esac',
            // ECS parity: splice services-template.json `environment` map.
            extraEnvSplice('$OVERLAY/env-$TENANT_DB.yaml'),
            // Image replacement via the overlay's kustomization.yaml.
            'echo "images:" >> $OVERLAY/kustomization.yaml',
            'echo "- name: KUSTOMIZE_IMAGE" >> $OVERLAY/kustomization.yaml',
            'echo "  newName: $ECR_REPO_URI" >> $OVERLAY/kustomization.yaml',
            'echo "  newTag: latest" >> $OVERLAY/kustomization.yaml',
            // Phase 5.8 — apply the selected overlay.
            'kubectl apply -k $OVERLAY -n $TENANT_ID',
          ].join('\n'),
        ]
      : [
          'aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME',
          'echo "  newName: $ECR_REPO_URI" >> kubernetes/$SERVICE_URL_PREFIX/kustomization.yaml',
          'echo "  newTag: latest" >> kubernetes/$SERVICE_URL_PREFIX/kustomization.yaml',
          // Patch ServiceAccount name
          'cp kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch-template.yaml kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml',
          'echo "  value: $TENANT_ID-service-account" >> kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml',
          // Replace environment variable placeholders
          'sed -i "s|KUSTOMIZE_ORDER_TABLE_NAME|$ORDER_TABLE|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          'sed -i "s|KUSTOMIZE_AWS_REGION|$AWS_REGION|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          'sed -i "s|KUSTOMIZE_TENANT_TIER|$TENANT_PLAN|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          'sed -i "s|KUSTOMIZE_IAM_ROLE_ARN|$ABAC_ROLE|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          'sed -i "s|KUSTOMIZE_TAG_KEYS_MAPPING|$TAG_KEYS_MAPPING|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          'sed -i "s|KUSTOMIZE_COGNITO_USER_POOL_ID|$USER_POOL_ID|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          'sed -i "s|KUSTOMIZE_TENANT_ID|$TENANT_ID|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          // PG-aware substitutions — Basic+PG+RLS and Std/Prem share
          // the same env var set. Only TENANT_NAME varies by tier:
          //   · Basic  → empty string (app branches to basic_pool_db / basic_pool_user)
          //   · Std/Prem → Tenant.COMPANY_NAME
          // Services whose CDK_USE_DB != postgresql don't have the
          // KUSTOMIZE_SHARED_DB_* placeholders in their service.yaml,
          // so the sed lines are a no-op for them. DynamoDB-only
          // services (orders/users) are unaffected.
          'if [ "$TENANT_PLAN" = "basic" ]; then EFFECTIVE_TENANT_NAME=""; else EFFECTIVE_TENANT_NAME="$TENANT_NAME"; fi',
          'sed -i "s|KUSTOMIZE_SHARED_DB_SESSION_ROLE_ARN|${SHARED_DB_SESSION_ROLE_ARN:-}|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          'sed -i "s|KUSTOMIZE_SHARED_DB_PROXY_ENDPOINT|${SHARED_DB_PROXY_ENDPOINT:-}|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          'sed -i "s|KUSTOMIZE_SHARED_DB_CLUSTER_ENDPOINT_RESOURCE|${SHARED_DB_CLUSTER_ENDPOINT_RESOURCE:-}|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          'sed -i "s|KUSTOMIZE_TENANT_NAME|$EFFECTIVE_TENANT_NAME|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
          // ECS parity: splice services-template.json `environment` map.
          extraEnvSplice('kubernetes/$SERVICE_URL_PREFIX/service.yaml'),
          // Apply to tenant namespace
          'kubectl apply -k kubernetes/$SERVICE_URL_PREFIX/ -n $TENANT_ID',
        ];

    const tenantDeployProject = new codebuild.Project(this, `${id}EKSTenantDeployProject`, {
      projectName: `${props.name}TenantDeploy`,
      role: props.codebuildKubectlRole,
      source: sourceBucket.source,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        CLUSTER_NAME: { value: `${props.eksClusterName}` },
        ECR_REPO_URI: { value: containerRepoUri },
        AWS_REGION: { value: Stack.of(this).region },
        AWS_ACCOUNT: { value: Stack.of(this).account },
        SERVICE_IMAGE_NAME: { value: props.ecrImageName },
        SERVICE_URL_PREFIX: { value: props.serviceUrlPrefix },
        TENANT_ID: { value: '' },
        // See sibling InitialBuild project above for why CDK_USE_DB is
        // injected unconditionally (SharedDb exports pre_build gate).
        ...cdkUseDbEnv,
        // Req 2.2/2.9: Product-only DB-backend selection (empty spread when off).
        ...dbSelectionEnv,
        // ECS parity: services-template.json `environment` map.
        ...extraEnvEnv,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'KUBECTL_VERSION=$(curl -L -s https://api.github.com/repos/kubernetes/kubernetes/releases/latest | grep \'"tag_name":\' | cut -d\'"\' -f4)',
              'curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"',
              'chmod +x ./kubectl',
            ],
          },
          pre_build: {
            commands: [
              // Req 2.2/2.9: Product-only DB-backend selection.
              ...dbSelectionPreBuild,
              'TENANT_DATA=$(aws dynamodb get-item --table-name Tenant --key \'{"TENANT_ID":{"S":"\'$TENANT_ID\'"}}\' --output json --region $AWS_REGION 2>/dev/null)',
              'TENANT_PLAN=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'PLAN\',{}).get(\'S\',\'standard\'))" 2>/dev/null || echo "standard")',
              'ABAC_ROLE=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'ABAC_ROLE_ARN\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "")',
              'USER_POOL_ID=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'USER_POOL_ID\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "")',
              // Req 5.7: TENANT_NAME is Tenant.COMPANY_NAME (used in overlays/postgresql/env-postgresql.yaml).
              'TENANT_NAME=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'COMPANY_NAME\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "")',
              'if [ "$TENANT_PLAN" = "basic" ]; then ORDER_TABLE="Order"; else ORDER_TABLE="Order-$TENANT_ID"; fi',
              'TAG_KEYS_MAPPING=\'{"tenant":"custom:tenant-id"}\'',
              'echo "Tenant: $TENANT_ID, Plan: $TENANT_PLAN, OrderTable: $ORDER_TABLE, ABACRole: $ABAC_ROLE, TenantName: $TENANT_NAME"',
              // Req 5.6: resolve SharedDb exports once when CDK_USE_DB=postgresql.
              ...sharedDbResolvePreBuild,
              // ECS parity: resolve <APP_SITE_URL> placeholder in EXTRA_ENV_YAML.
              ...extraEnvResolvePreBuild,
            ],
          },
          build: {
            commands: tenantBuildCommands,
          },
          post_build: {
            commands: [],
          },
        },
      }),
    });

    containerRepo.grantPull(tenantDeployProject.role!);
  }

  /**
   * Render the `environment` map from services-template.json as a YAML
   * snippet that can be spliced into a K8s Deployment container's
   * `env:` list. Two-space indent matches the manifest (`env:` items
   * are at `spec.template.spec.containers[].env[]`, 10-space indented).
   *
   * `<APP_SITE_URL>` stays as a literal placeholder — the CodeBuild
   * pre_build step substitutes it with the StaticSites stack's
   * `ApplicationSiteUrl` output at runtime.
   *
   * Returns an empty string when no env map is supplied, which makes
   * the sed splice a no-op.
   */
  private renderExtraEnvYaml(env?: Record<string, string>): string {
    if (!env || Object.keys(env).length === 0) return '';
    return Object.entries(env)
      .map(([name, value]) => [
        `            - name: ${name}`,
        `              value: ${JSON.stringify(value)}`,
      ].join('\n'))
      .join('\n');
  }
}

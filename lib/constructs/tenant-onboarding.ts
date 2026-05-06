import * as cdk from 'aws-cdk-lib';
import { Arn, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as aws_s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SourceBucket } from './source-bucket';

export interface TenantOnboardingProps {
  readonly onboardingProjectName: string;
  readonly deletionProjectName: string;
  readonly assetDirectory: string;

  readonly eksClusterName: string;
  readonly codebuildKubectlRole: iam.IRole;
  readonly eksClusterOIDCProviderArn: string;

  readonly applicationServiceBuildProjectNames: string[];

  readonly appSiteDistributionId: string;
  readonly appSiteCloudFrontDomain: string;
  readonly appSiteCustomDomain?: string;
  readonly appSiteHostedZoneId?: string;
}

export class TenantOnboarding extends Construct {
  readonly repositoryUrl: string;

  constructor(scope: Construct, id: string, props: TenantOnboardingProps) {
    super(scope, id);

    this.addTenantOnboardingPermissions(props.codebuildKubectlRole, props);

    const sourceBucket = new SourceBucket(this, `${id}SourceBucket`, {
      name: 'TenantOnboarding',
      assetDirectory: props.assetDirectory,
      excludes: ['node_modules', '.cdk.staging', 'cdk.out'],
    });

    const onboardingCfnParams: { [key: string]: string } = {
      TenantId: '$TENANT_ID',
      CompanyName: '"$COMPANY_NAME"',
      TenantAdminEmail: '"$ADMIN_EMAIL"',
      AppDistributionId: `"${props.appSiteDistributionId}"`,
      DistributionDomain: `"${props.appSiteCloudFrontDomain}"`,
      EKSClusterName: `"${props.eksClusterName}"`,
      KubectlRoleArn: `"${props.codebuildKubectlRole.roleArn}"`,
      OIDCProviderArn: `"${props.eksClusterOIDCProviderArn}"`,
    };

    const cfnParamString = Object.entries(onboardingCfnParams)
      .map((x) => `--parameters ${x[0]}=${x[1]}`)
      .join(' ');

    const onboardingProject = new codebuild.Project(this, `TenantOnboardingProject`, {
      projectName: `${props.onboardingProjectName}`,
      source: sourceBucket.source,
      role: props.codebuildKubectlRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        TENANT_ID: {
          value: '',
        },
        COMPANY_NAME: {
          value: '',
        },
        ADMIN_EMAIL: {
          value: '',
        },
        PLAN: {
          value: '',
        },
        AWS_ACCOUNT: {
          value: Stack.of(this).account,
        },
        AWS_REGION: {
          value: Stack.of(this).region,
        },
        APP_SITE_CUSTOM_DOMAIN: {
          value: props.appSiteCustomDomain ?? '',
        },
        APP_SITE_HOSTED_ZONE: {
          value: props.appSiteHostedZoneId ?? '',
        },
        // Req 2.5: the per-tenant `cdk deploy TenantStack-$TENANT_ID` call
        // synthesises inside this CodeBuild run, so it must see the same
        // `process.env.CDK_USE_DB` the top-level synth saw — otherwise the
        // per-tenant Schema_Provisioner_Lambda CustomResource branch would
        // evaluate inconsistently with the core stack's Shared_Db_Stack.
        CDK_USE_DB: {
          value: process.env.CDK_USE_DB ?? 'dynamodb',
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '22',
            },
            commands: ['npm i'],
          },
          pre_build: {
            commands: [],
          },
          build: {
            commands: [
              `npm run cdk deploy TenantStack-$TENANT_ID -- --require-approval=never ${cfnParamString}`,
            ],
          },
          post_build: {
            commands: props.applicationServiceBuildProjectNames.map(
              (x) =>
                `aws codebuild start-build --project-name ${x}TenantDeploy --environment-variables-override name=TENANT_ID,value=\"$TENANT_ID\",type=PLAINTEXT`
            ),
          },
        },
      }),
    });

    const tenantDeletionProject = new codebuild.Project(this, 'TenantDeletionProject', {
      projectName: props.deletionProjectName,
      role: props.codebuildKubectlRole,
      source: sourceBucket.source,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        TENANT_ID: {
          value: '',
        },
        // PLAN (basic / standard / premium) is required by the TenantStack
        // synth code — see services/tenant-onboarding/lib/tenant-onboarding-stack.ts
        // which branches on `props.plan.toLowerCase() === 'basic'` to decide
        // whether an ABAC role / per-tenant Order table was created. The same
        // branches must evaluate the same way on destroy so CDK reconstructs
        // the correct resource set; pass PLAN in both directions.
        PLAN: {
          value: '',
        },
        AWS_ACCOUNT: {
          value: Stack.of(this).account,
        },
        AWS_REGION: {
          value: Stack.of(this).region,
        },
        EKS_CLUSTER_NAME: {
          value: props.eksClusterName,
        },
        // Req 2.6: the per-tenant `cdk destroy TenantStack-$TENANT_ID` call
        // synthesises inside this CodeBuild run, so it must see the same
        // `process.env.CDK_USE_DB` that the original onboarding synth saw
        // in order to reconstruct the same resource graph it is tearing
        // down (mirrors Req 2.5 on the deletion side).
        CDK_USE_DB: {
          value: process.env.CDK_USE_DB ?? 'dynamodb',
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '22',
            },
            commands: [
              'npm i',
              // kubectl installed so the pre_build phase can talk to the cluster.
              // CodeBuild STANDARD_7_0 does not ship kubectl by default.
              // `-f` makes curl return non-zero on HTTP errors so a 404 or
              // redirect-to-html doesn't silently write garbage to the target
              // path (which later fails with "Syntax error: newline
              // unexpected" when shell tries to exec it).
              'curl -fsSL -o /usr/local/bin/kubectl https://dl.k8s.io/release/v1.29.2/bin/linux/amd64/kubectl',
              'chmod +x /usr/local/bin/kubectl',
            ],
          },
          pre_build: {
            // Delete the tenant namespace *before* `cdk destroy` runs. The
            // TenantStack's CDK-managed manifests (Namespace, RequestAuth,
            // AuthorizationPolicy, ServiceAccount) would be deleted by CFN
            // anyway, but the *TenantDeploy CodeBuild projects also install
            // service-level resources (Deployment, VirtualService, SA patches)
            // into the same namespace that CFN does NOT know about. Without
            // this pre-step CFN happily deletes its own manifests but the
            // ownerless Deployments keep the namespace pinned in Terminating
            // state, which (a) looks like `cdk destroy` is broken from the
            // outside and (b) blocks a future onboarding that reuses the
            // same tenantId.
            //
            // `kubectl delete namespace` cascades into everything in the
            // namespace — NestJS Deployments/Services, Envoy sidecars,
            // VirtualServices, SAs, the CDK-managed manifests — so we don't
            // need separate `kubectl delete` lines for each kind.
            commands: [
              // CodeBuild already runs *as* codebuildKubectlRole, which is
              // mapped to system:masters in aws-auth. Use the ambient
              // identity — do NOT pass --role-arn. The role's trust policy
              // does not list itself as a trusted principal, so assuming
              // itself would fail with AccessDenied.
              'aws eks update-kubeconfig --name "$EKS_CLUSTER_NAME" --region "$AWS_REGION"',
              // --ignore-not-found so re-running the deletion after a partial
              // teardown is idempotent.
              // --wait=true (default) so CodeBuild blocks until the API
              // server finishes removing the namespace; otherwise `cdk
              // destroy` races the KubernetesManifest custom resources and
              // we're back to square one.
              'kubectl delete namespace "$TENANT_ID" --ignore-not-found --wait=true --timeout=5m',
            ],
          },
          build: {
            commands: [
              `npm run cdk destroy TenantStack-$TENANT_ID -- --require-approval=never -f`,
            ],
          },
          post_build: {
            commands: [],
          },
        },
      }),
    });
  }

  private addTenantOnboardingPermissions(projectRole: iam.IRole, props: TenantOnboardingProps) {
    // TODO: reduce the permission

    projectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['route53:*'],
        resources: [
          `arn:${Stack.of(this).partition}:route53:::hostedzone/${props.appSiteHostedZoneId!}`,
        ],
        effect: iam.Effect.ALLOW,
      })
    );
    projectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'route53domains:*',
          'cognito-identity:*',
          'cognito-idp:*',
          'cognito-sync:*',
          'iam:*',
          's3:*',
          'cloudformation:*',
          'codebuild:StartBuild',
        ],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      })
    );
    projectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudfront:AssociateAlias',
          'cloudfront:GetDistribution',
          'cloudfront:GetDistributionConfig',
          'cloudfront:UpdateDistribution',
        ],
        resources: [
          Arn.format(
            {
              service: 'cloudfront',
              resource: 'distribution',
              resourceName: props.appSiteDistributionId,
            },
            Stack.of(this)
          ),
        ],
        effect: iam.Effect.ALLOW,
      })
    );
    projectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:PutItem', 'dynamodb:DeleteItem'],
        resources: [
          Arn.format(
            { service: 'dynamodb', resource: 'table', resourceName: 'Tenant' },
            Stack.of(this)
          ),
        ],
        effect: iam.Effect.ALLOW,
      })
    );
    // Allow reading tenant info for CodeBuild env var injection
    projectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem'],
        resources: [
          Arn.format(
            { service: 'dynamodb', resource: 'table', resourceName: 'Tenant' },
            Stack.of(this)
          ),
        ],
        effect: iam.Effect.ALLOW,
      })
    );
    projectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:CreateTable', 'dynamodb:DeleteTable'],
        resources: [
          Arn.format(
            { service: 'dynamodb', resource: 'table', resourceName: 'Order-*' },
            Stack.of(this)
          ),
        ],
        effect: iam.Effect.ALLOW,
      })
    );
    projectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          Arn.format(
            { service: 'ssm', resource: 'parameter', resourceName: 'cdk-bootstrap/*' },
            Stack.of(this)
          ),
        ],
      })
    );
  }
}

/**
 * SharedDbStack — synthesised only when `CDK_USE_DB === 'postgresql'`.
 *
 * Direct port of the ECS sister reference
 * `refer/saas-ecs/server/lib/shared-infra/rds-cluster.ts`. Configuration
 * (engine version, ACU range, writer + reader layout, three-security-group
 * topology, per-tenant proxy-auth secret namespace, Lambda runtime and
 * permissions, and `CfnOutput` export names) is identical to that file.
 *
 * Two deviations from the ECS reference — both structurally unavoidable
 * for this EKS project:
 *
 *   1. `RemovalPolicy.DESTROY` + `deletionProtection: false` on the
 *      cluster. The rest of this project's stateful resources
 *      (e.g. per-tenant Order tables in
 *      `services/tenant-onboarding/lib/tenant-onboarding-stack.ts`) use
 *      the same policy so `scripts/cleanup.sh` leaves nothing behind.
 *   2. `STSRole` is assumed by an account principal narrowed with an
 *      `ArnLike aws:PrincipalArn = *-service-account-Role-*` condition
 *      rather than by `ecs-tasks.amazonaws.com`. EKS has no task role;
 *      the IRSA role attached to each tenant namespace's ServiceAccount
 *      plays the same part.
 */

import * as cdk from 'aws-cdk-lib';
import { Aws, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaPython from '@aws-cdk/aws-lambda-python-alpha';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';

export interface SharedDbStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  /**
   * Optional — the shared Lambda layer this project exposes for reusable
   * Python deps. Matches ECS reference `props.lambdaEcsSaaSLayers`. If
   * the EKS project does not yet expose such a layer, leave undefined
   * and `psycopg2-binary` is pulled in via the Lambda's own
   * `requirements.txt`.
   */
  readonly lambdaEcsSaaSLayers?: lambda.LayerVersion;
}

export class SharedDbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SharedDbStackProps) {
    super(scope, id, props);

    const region = Stack.of(this).region;
    const account = Stack.of(this).account;

    // ------------------------------------------------------------------
    // Pre-create the `AWSServiceRoleForRDS` service-linked role.
    //
    // Fresh accounts don't have this role until *any* RDS-adjacent
    // resource requests it, and the first request can race with the
    // resource that needs it (seen on RDS Proxy creation:
    //   "RDS is not authorized to assume service-linked role
    //   arn:aws:iam::<acct>:role/aws-service-role/rds.amazonaws.com/
    //   AWSServiceRoleForRDS ... Status Code: 403").
    //
    // We create it explicitly via `iam:CreateServiceLinkedRole` and make
    // cluster + proxy depend on it. `ignoreErrorCodesMatching:
    // "InvalidInput"` handles reruns where the role already exists.
    // ------------------------------------------------------------------
    const rdsSlrCreate = new cr.AwsCustomResource(this, 'EnsureRdsServiceLinkedRole', {
      onCreate: {
        service: 'IAM',
        action: 'createServiceLinkedRole',
        parameters: {
          AWSServiceName: 'rds.amazonaws.com',
          Description: 'Service-linked role for Amazon RDS',
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${id}-rds-slr`),
        // IAM returns InvalidInput if the SLR already exists for the
        // account. Treat that as success so re-runs (or accounts where
        // another stack already created it) don't fail.
        ignoreErrorCodesMatching: 'InvalidInput',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:CreateServiceLinkedRole'],
          resources: [
            `arn:${Aws.PARTITION}:iam::${account}:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS`,
          ],
        }),
      ]),
      installLatestAwsSdk: false,
    });

    // ------------------------------------------------------------------
    // Master credential. ECS reference uses `secretsmanager.Secret` with
    // `generateSecretString` rather than `rds.DatabaseSecret` so it can
    // pin `excludePunctuation: true` — RDS Proxy rejects several
    // punctuation characters in IAM-auth tokens. Encryption uses the
    // account-default `aws/secretsmanager` managed key (no explicit
    // `encryptionKey` — matches the ECS reference).
    // ------------------------------------------------------------------
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: `DBsecret-${id}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password',
      },
    });

    // ------------------------------------------------------------------
    // Security groups (ECS reference's 3-SG layout, 1:1):
    //
    //   securityGroup       — general traffic SG, attached to the proxy.
    //                         Permits 5432 ingress from anywhere inside
    //                         the VPC (anyIpv4 in the ref; refine per
    //                         deployment if you need a tighter boundary).
    //   rdsSecurityGroup    — cluster SG. `allowAllOutbound: false`.
    //                         Ingress from `proxySecurityGroup:5432`
    //                         (added below) and from the Lambda SG
    //                         (added via CfnSecurityGroupIngress further
    //                         down).
    //   proxySecurityGroup  — proxy-internal SG. `allowAllOutbound:
    //                         false`. Egress to `rdsSecurityGroup:5432`.
    // ------------------------------------------------------------------
    const securityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL traffic',
    );

    const rdsSecurityGroup = new ec2.SecurityGroup(this, 'RDSSecurityGroup', {
      vpc: props.vpc,
      description: 'RDS Security Group',
      allowAllOutbound: false,
    });

    // ------------------------------------------------------------------
    // Aurora PostgreSQL Serverless v2 cluster.
    //
    // Engine version, ACU range, writer + reader1 layout, Performance
    // Insights on the reader, and `defaultDatabaseName` are the ECS
    // reference values verbatim. Only the `removalPolicy` +
    // `deletionProtection` differ.
    // ------------------------------------------------------------------
    const cluster = new rds.DatabaseCluster(this, 'SbtRDSCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      serverlessV2MinCapacity: 6.5,
      serverlessV2MaxCapacity: 32,
      vpc: props.vpc,
      securityGroups: [rdsSecurityGroup],
      defaultDatabaseName: 'sbtsaasdb',
      credentials: rds.Credentials.fromSecret(dbSecret, 'postgres'),
      writer: rds.ClusterInstance.serverlessV2('writer'),
      readers: [
        rds.ClusterInstance.serverlessV2('reader1', {
          scaleWithWriter: true,
          enablePerformanceInsights: true,
          performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
        }),
      ],
      storageEncrypted: true,
      iamAuthentication: true,
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
    });
    // Ensure the `AWSServiceRoleForRDS` service-linked role exists before
    // the cluster is created. Without this, fresh accounts hit a 403 race
    // on RDS Proxy creation.
    cluster.node.addDependency(rdsSlrCreate);

    // ------------------------------------------------------------------
    // RDS Proxy.
    //
    // Proxy SG is distinct from the cluster SG (ECS parity). The proxy's
    // IAM role (`dbSecretsRole`) is given read access to the master
    // secret AND to the per-tenant
    // `rds_proxy_multitenant/proxy_secret_for_user*` secret namespace,
    // which the Schema_Provisioner_Lambda populates at onboarding time.
    // ------------------------------------------------------------------
    const proxySecurityGroup = new ec2.SecurityGroup(this, 'ProxySecurityGroup', {
      vpc: props.vpc,
      description: 'RDS Proxy Security Group',
      allowAllOutbound: false,
    });
    proxySecurityGroup.addEgressRule(
      rdsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow db outbound traffic',
    );
    rdsSecurityGroup.addIngressRule(
      proxySecurityGroup,
      ec2.Port.tcp(5432),
      'Proxy to RDS ingress rule',
    );

    const dbSecretsRole = new iam.Role(this, 'DBSecretsRole', {
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'),
    });
    new iam.ManagedPolicy(this, 'SecretsManagerServiceAccessPolicy', {
      description: 'Allows RDS Proxy to retrieve secrets from Secrets Manager',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            dbSecret.secretArn,
            `arn:${Aws.PARTITION}:secretsmanager:${region}:${account}:secret:rds_proxy_multitenant/proxy_secret_for_user*`,
          ],
        }),
      ],
      roles: [dbSecretsRole],
    });

    const rdsProxy = new rds.DatabaseProxy(this, 'SbtRDSProxy', {
      dbProxyName: 'prod-pg-dbProxy',
      proxyTarget: rds.ProxyTarget.fromCluster(cluster),
      secrets: [dbSecret],
      role: dbSecretsRole,
      vpc: props.vpc,
      iamAuth: true,
      securityGroups: [securityGroup],
      requireTLS: true,
    });
    // Explicit dependency on the SLR custom resource — `cluster` depends
    // on it already, but the proxy is the resource that originally
    // surfaced the 403, so we pin it here as well for defence-in-depth.
    rdsProxy.node.addDependency(rdsSlrCreate);

    // ------------------------------------------------------------------
    // Schema_Provisioner_Lambda.
    //
    // ECS reference's `PostgreSqlDatabase` function — Python 3.10 via
    // `@aws-cdk/aws-lambda-python-alpha.PythonFunction`, 15-minute
    // timeout, VPC-attached with its own SG, master-secret read+write,
    // `rds_proxy_multitenant/proxy_secret_for_user*` create/delete/tag/
    // describe, `rds:ModifyDBProxy` + `rds:DescribeDBProxies`.
    //
    // `entry` directory path must exist on disk at synth time. Contents
    // are ported from
    // `refer/saas-ecs/server/lib/shared-infra/postgresql-database/`
    // (separate task — this stack only wires it in).
    // ------------------------------------------------------------------
    const lambdaRole = new iam.Role(this, 'LambdaAddUsersRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [dbSecret.secretArn],
      }),
    );
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'secretsmanager:CreateSecret',
          'secretsmanager:DeleteSecret',
          'secretsmanager:TagResource',
          'secretsmanager:DescribeSecret',
        ],
        resources: [
          `arn:aws:secretsmanager:${region}:${account}:secret:rds_proxy_multitenant/proxy_secret_for_user*`,
        ],
      }),
    );
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds:ModifyDBProxy'],
        resources: [rdsProxy.dbProxyArn],
      }),
    );
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds:DescribeDBProxies'],
        resources: [`arn:aws:rds:${region}:${account}:db-proxy:*`],
      }),
    );

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.vpc,
      description: 'Lambda Security Group',
      allowAllOutbound: true,
    });
    lambdaSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow outbound HTTPS traffic',
    );
    lambdaSecurityGroup.addEgressRule(
      ec2.SecurityGroup.fromSecurityGroupId(this, 'LambdaSGOutToDB', rdsSecurityGroup.securityGroupId),
      ec2.Port.tcp(5432),
      'Allow DB outbound traffic',
    );

    // L1 ingress attachment on RDS SG from Lambda SG. ECS reference uses
    // `CfnSecurityGroupIngress` specifically (not `.addIngressRule`) to
    // avoid a circular reference that `addIngressRule` would create
    // between the two SGs via the peering metadata.
    new ec2.CfnSecurityGroupIngress(this, 'LambdaToRDSIngress', {
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      groupId: rdsSecurityGroup.securityGroupId,
      sourceSecurityGroupId: lambdaSecurityGroup.securityGroupId,
    });

    const schemeLambdaProps: lambdaPython.PythonFunctionProps = {
      entry: path.join(__dirname, 'lambda', 'postgresql-database'),
      handler: 'lambda_handler',
      index: 'postgresql_database.py',
      runtime: lambda.Runtime.PYTHON_3_10,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        DB_NAME: 'sbtsaasdb',
        DB_SECRET_ARN: dbSecret.secretArn,
        DB_RESOURCE_ARN: `arn:aws:rds:${region}:${account}:cluster:${cluster.clusterIdentifier}`,
        DB_PROXY_ARN: rdsProxy.dbProxyArn,
        DB_PROXY_NAME: rdsProxy.dbProxyName,
        DB_PROXY_ENDPOINT: rdsProxy.endpoint,
        DB_ENDPOINT: cluster.clusterEndpoint.hostname,
        REGION: region,
      },
      vpc: cluster.vpc,
      securityGroups: [lambdaSecurityGroup],
      role: lambdaRole,
      timeout: Duration.minutes(15),
      // ECS reference attaches a shared ECS-SaaS Lambda layer. Passed
      // through only when the caller provides one; otherwise the function
      // relies solely on its own `requirements.txt`.
      ...(props.lambdaEcsSaaSLayers ? { layers: [props.lambdaEcsSaaSLayers] } : {}),
    };
    const schemeLambda = new lambdaPython.PythonFunction(this, 'PostgreSqlDatabase', schemeLambdaProps);

    dbSecret.grantRead(schemeLambda);
    dbSecret.grantWrite(schemeLambda);

    // ------------------------------------------------------------------
    // STSRole — the single shared role per-tenant IRSA roles assume to
    // narrow `rds-db:connect` to their own dbuser. ECS reference trusts
    // `ecs-tasks.amazonaws.com` + a per-tenant TaskRole; EKS substitutes
    // that with `AccountPrincipal` + `ArnLike aws:PrincipalArn` on the
    // IRSA role naming convention.
    // ------------------------------------------------------------------
    const stsRolePermissions = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['rds-db:connect'],
          resources: [`arn:aws:rds-db:${region}:${account}:dbuser:*`],
        }),
      ],
    });

    const stsRole = new iam.Role(this, 'STSRole', {
      assumedBy: new iam.AccountPrincipal(account),
      inlinePolicies: { STSRolePermissions: stsRolePermissions },
      description:
        'Shared role tenants assume to get rds-db:connect narrowed to their own dbuser',
    });
    stsRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        principals: [new iam.AccountPrincipal(account)],
        conditions: {
          ArnLike: {
            // The ArnLike conditions must cover BOTH role-name patterns
            // that assume this role:
            //   - `*-service-account-Role-*` — the Basic pool
            //     ServiceAccount role (explicitly named via
            //     `cluster.addServiceAccount('service-account', ...)` in
            //     `lib/basic-pool-stack.ts`).
            //   - `TenantStack-*-EKSClusterTenantServiceAc-*` — the
            //     per-tenant ServiceAccount role created by
            //     `cluster.addServiceAccount('TenantServiceAccount', ...)`
            //     in `services/tenant-onboarding/lib/tenant-onboarding-stack.ts`.
            //     CDK names this role from the logical ID rather than
            //     the SA name, so it never contains the `service-account`
            //     substring.
            'aws:PrincipalArn': [
              `arn:aws:iam::${account}:role/*-service-account-Role-*`,
              `arn:aws:iam::${account}:role/TenantStack-*-EKSClusterTenantServiceAc-*`,
            ],
          },
        },
      }),
    );

    // ------------------------------------------------------------------
    // CfnOutput exports — names are identical to the ECS reference so
    // `TenantOnboardingStack` and `product_postgresql` runtime consume
    // exactly the same `Fn::ImportValue` keys.
    // ------------------------------------------------------------------
    new cdk.CfnOutput(this, 'STSRoleArn', {
      value: stsRole.roleArn,
      exportName: 'STSRoleArn',
    });
    new cdk.CfnOutput(this, 'SchemeLambdaArn', {
      value: schemeLambda.functionArn,
      exportName: 'SchemeLambdaArn',
    });
    new cdk.CfnOutput(this, 'DbProxyArn', {
      value: rdsProxy.dbProxyArn,
      exportName: 'DbProxyArn',
    });
    new cdk.CfnOutput(this, 'DbProxyName', {
      value: rdsProxy.dbProxyName,
      exportName: 'DbProxyName',
    });
    new cdk.CfnOutput(this, 'RdsProxyEndpoint', {
      value: rdsProxy.endpoint,
      exportName: 'RdsProxyEndpoint',
    });
    new cdk.CfnOutput(this, 'SecretArn', {
      value: dbSecret.secretArn,
      exportName: 'SecretArn',
    });
    new cdk.CfnOutput(this, 'SecurityGroupId', {
      value: securityGroup.securityGroupId,
      exportName: 'SecurityGroupId',
    });
  }
}

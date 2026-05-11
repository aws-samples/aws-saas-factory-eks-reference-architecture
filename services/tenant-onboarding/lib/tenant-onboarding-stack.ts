import { Arn, CfnOutput, CfnParameter, CustomResource, Fn, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as alias from 'aws-cdk-lib/aws-route53-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { KubectlV35Layer } from '@aws-cdk/lambda-layer-kubectl-v35';
import { Cognito } from './cognito';
import * as cognito from 'aws-cdk-lib/aws-cognito';

const TENANT_TABLE = 'Tenant';

export interface TenantOnboardingStackProps extends StackProps {
  readonly plan: string;
  readonly tenantid: string;
  readonly customDomain?: string;
  readonly hostedZoneId?: string;
}

export class TenantOnboardingStack extends Stack {
  constructor(scope: Construct, id: string, props: TenantOnboardingStackProps) {
    super(scope, id, props);

    const tenantId = new CfnParameter(this, 'TenantId', {});
    const companyName = new CfnParameter(this, 'CompanyName', {});
    const tenantAdminEmail = new CfnParameter(this, 'TenantAdminEmail', {});
    const appDistributionId = new CfnParameter(this, 'AppDistributionId', {});
    const distributionDomain = new CfnParameter(this, 'DistributionDomain', {});
    const eksClusterName = new CfnParameter(this, 'EKSClusterName', {});
    const eksKubectlRoleArn = new CfnParameter(this, 'KubectlRoleArn', {});
    const eksClusterOIDCProviderArn = new CfnParameter(this, 'OIDCProviderArn', {});

    const usingCustomDomain = props.customDomain && props.customDomain.length > 0;
    if (usingCustomDomain && !props.hostedZoneId) {
      throw new Error(
        `Hosted Zone must be specified for the custom domain '${props.customDomain}'`
      );
    }

    const appSiteBaseUrl = usingCustomDomain
      ? `https://${props.tenantid}.${props.customDomain!}`
      : `https://${distributionDomain.valueAsString}`;

    const getNamedUrlForCognito = (pathName?: string) => {
      if (usingCustomDomain) {
        if (pathName) {
          return `${appSiteBaseUrl}/${pathName}`;
        } else {
          return appSiteBaseUrl;
        }
      }

      return `https://${distributionDomain.valueAsString}`;
    };

    const provider = eks.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'OIDCProvider',
      eksClusterOIDCProviderArn.valueAsString
    );

    const cluster = eks.Cluster.fromClusterAttributes(this, 'EKSCluster', {
      clusterName: eksClusterName.valueAsString,
      kubectlRoleArn: eksKubectlRoleArn.valueAsString,
      openIdConnectProvider: provider,
      kubectlLayer: new KubectlV35Layer(this, 'KubectlLayer'),
    });

    // create kubernetes resource
    //this.createKubernetesResources(cluster, props.tenantid, props.plan);

    // create app site distribution
    if (usingCustomDomain) {
      // add alias to existing distribution
      const tenantAppDomain = `${props.tenantid}.${props.customDomain}`;

      const hostedZone = route53.PublicHostedZone.fromHostedZoneAttributes(
        this,
        'PublicHostedZone',
        {
          hostedZoneId: props.hostedZoneId!,
          zoneName: props.customDomain!,
        }
      );

      const distribution = cloudfront.Distribution.fromDistributionAttributes(
        this,
        'CloudFrontDistribution',
        {
          distributionId: appDistributionId.valueAsString,
          domainName: distributionDomain.valueAsString,
        }
      );

      new route53.ARecord(this, `AliasRecord`, {
        zone: hostedZone,
        recordName: tenantAppDomain,
        target: route53.RecordTarget.fromAlias(new alias.CloudFrontTarget(distribution)),
      });
    } else {
      // no distribution. app-domain/tenant is the url.
    }

    // create cognito resources
    const tenantCognito = new Cognito(this, 'CognitoResources', {
      adminUserEmailAddress: tenantAdminEmail.valueAsString,
      userPoolName: `${props.tenantid}-UserPool`,
      tenantId: props.tenantid,
      callbackUrl: getNamedUrlForCognito(),
      signoutUrl: getNamedUrlForCognito(),
      inviteEmailSubject: `[${companyName.valueAsString}] Your temporary password`,
      inviteEmailBody: `Welcome to ${companyName.valueAsString}!\n\nLogin at ${appSiteBaseUrl}?tenant=${companyName.valueAsString}\n\nUsername:\n{username}\n\nTemporary password:\n{####}\n\nPlease change your password after first login.`,
      customAttributes: {
        'tenant-id': { value: props.tenantid, mutable: false },
        // Inject tenantName + tenantTier at admin-create time so the JWT
        // carries them. Istio's RequestAuthentication projects them into
        // `x-tenant-name` / `x-tenant-tier` headers, which product_postgresql
        // uses to build `user_<tenantName>` for RDS Proxy IAM auth.
        'tenantName': { value: companyName.valueAsString, mutable: true },
        'tenantTier': { value: props.plan, mutable: true },
      },
      extraCustomAttributes: {
        'userRole': new cognito.StringAttribute({ mutable: true }),
        // tenantTier + tenantName already declared via `customAttributes`
        // above — no need to re-declare as extra attributes.
      },
    });

    new CfnOutput(this, 'tenantId', {
      key: 'TenantId',
      value: tenantId.valueAsString,
    });

    new CfnOutput(this, 'clientId', {
      key: 'ClientId',
      value: tenantCognito.appClientId,
    });

    new CfnOutput(this, 'authServer', {
      key: 'AuthServer',
      value: tenantCognito.authServerUrl,
    });

    new CfnOutput(this, 'redirectUri', {
      key: 'RedirectUri',
      value: getNamedUrlForCognito(),
    })

    // create tenant entry in dynamodb
    const tableArn = Arn.format(
      {
        service: 'dynamodb',
        resource: 'table',
        resourceName: TENANT_TABLE,
      },
      this
    );

    // =========================================================================
    // Order table: per-tenant for Standard/Premium, shared for Basic
    // =========================================================================
    const isBasicTier = props.plan.toLowerCase() === 'basic';

    // =========================================================================
    // PostgreSQL eligibility gate (Requirement 5.1, 5.2, 5.3, 14.1, 14.2)
    // =========================================================================
    // `CDK_USE_DB` is threaded through the TenantOnboardingProject /
    // TenantDeletionProject CodeBuild environment (see
    // lib/constructs/tenant-onboarding.ts) so the value that was selected
    // at install time is observable here. Basic tier stays on DynamoDB +
    // ABAC regardless of CDK_USE_DB (Q1 / Requirement 14.1) — only
    // Standard / Premium tenants get the per-tenant schema + IAM-auth
    // database user under the shared Aurora cluster.
    const useDb = (process.env.CDK_USE_DB ?? 'dynamodb').toLowerCase();
    const pgEligible = useDb === 'postgresql' && !isBasicTier;

    // Standard/Premium: per-tenant order table
    // Basic: uses shared "Order" table with leading key isolation (ABAC)
    let orderTableArn: string;
    if (!isBasicTier) {
      const orderTable = new dynamodb.Table(this, 'OrderTable', {
        tableName: `Order-${props.tenantid}`,
        partitionKey: {
          name: 'tenantId',
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: 'orderId',
          type: dynamodb.AttributeType.STRING,
        },
        readCapacity: 5,
        writeCapacity: 5,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      orderTableArn = orderTable.tableArn;
    } else {
      orderTableArn = Arn.format(
        { service: 'dynamodb', resource: 'table', resourceName: 'Order' },
        this
      );
    }

    // =========================================================================
    // ABAC role for Basic tier (STS AssumeRole with tag-based isolation)
    // =========================================================================
    // Basic tier pods use IRSA ServiceAccount to AssumeRole into this ABAC role.
    // The ABAC role has DynamoDB access scoped by leading key = tenantId.
    // Standard/Premium tiers use IRSA directly (no AssumeRole needed).
    // =========================================================================
    let abacRoleArn = '';
    let abacRole: iam.Role | undefined;
    if (isBasicTier) {
      const productTableArn = Arn.format(
        { service: 'dynamodb', resource: 'table', resourceName: 'Product' },
        this
      );

      abacRole = new iam.Role(this, 'TenantABACRole', {
        roleName: `${props.tenantid}-abac-role`,
        assumedBy: new iam.ServicePrincipal('sts.amazonaws.com'),
        inlinePolicies: {
          DynamoDBTenantAccess: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'dynamodb:GetItem',
                  'dynamodb:BatchGetItem',
                  'dynamodb:Query',
                  'dynamodb:PutItem',
                  'dynamodb:UpdateItem',
                  'dynamodb:DeleteItem',
                  'dynamodb:BatchWriteItem',
                  'dynamodb:Scan',
                ],
                resources: [productTableArn, orderTableArn],
                conditions: {
                  'ForAllValues:StringEquals': {
                    'dynamodb:LeadingKeys': ['${aws:PrincipalTag/tenant}'],
                  },
                },
              }),
            ],
          }),
        },
      });

      abacRoleArn = abacRole.roleArn;
    }

    // DynamoDB Tenant entry (must be after isBasicTier/abacRoleArn are defined)
    const tenantEntry = new cr.AwsCustomResource(this, 'TenantEntryResource', {
      onCreate: {
        service: 'DynamoDB',
        action: 'putItem',
        parameters: {
          TableName: TENANT_TABLE,
          Item: {
            TENANT_ID: { S: props.tenantid },
            COMPANY_NAME: { S: companyName.valueAsString },
            TENANT_EMAIL: { S: tenantAdminEmail.valueAsString },
            PLAN: { S: props.plan },
            AUTH_SERVER: { S: tenantCognito.authServerUrl },
            AUTH_CLIENT_ID: { S: tenantCognito.appClientId },
            USER_POOL_ID: { S: tenantCognito.userPoolId },
            AUTH_REDIRECT_URI: { S: getNamedUrlForCognito() },
            COGNITO_DOMAIN: {
              S: `https://${tenantCognito.appClientId}.auth.${this.region}.amazoncognito.com`,
            },
            AUTH_USE_SR: { BOOL: true },
            AUTH_SR_REDIRECT_URI: { S: getNamedUrlForCognito('silentrefresh') },
            AUTH_SR_TIMEOUT: { N: '5000' },
            AUTH_TIMEOUT_FACTOR: { N: '0.25' },
            AUTH_SESSION_CHECKS_ENABLED: { BOOL: true },
            AUTH_SHOW_DEBUG_INFO: { BOOL: true },
            AUTH_CLEAR_HASH_AFTER_LOGIN: { BOOL: false },
            ...(isBasicTier ? { ABAC_ROLE_ARN: { S: abacRoleArn } } : {}),
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of(`TenantEntry-${props.tenantid}`),
      },
      onDelete: {
        service: 'DynamoDB',
        action: 'deleteItem',
        parameters: {
          TableName: TENANT_TABLE,
          Key: {
            TENANT_ID: { S: props.tenantid },
          },
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [tableArn] }),
    });

    //Create Tenant namespace (with Istio sidecar injection)
    // =========================================================================
    // The istio-injection: enabled label enables automatic Envoy sidecar
    // injection for all Pods in this namespace.
    // =========================================================================
    const ns = cluster.addManifest('tenant-namespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: props.tenantid,
        labels: {
          name: props.tenantid,
          'saas/tenant': 'true',
          'istio-injection': 'enabled',
        },
      },
    });

    // =========================================================================
    // Istio RequestAuthentication (JWT validation + tenantId extraction)
    // =========================================================================
    // This resource registers the tenant's Cognito UserPool as an issuer to:
    //   1. Validate JWT token authenticity
    //   2. Extract the custom:tenant-id claim into the x-tenant-id header
    //
    // Each tenant has a separate Cognito UserPool, so a RequestAuthentication
    // is created per tenant namespace.
    //
    // issuer: Cognito UserPool OIDC issuer URL
    //   e.g.: https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_xxxxx
    // jwksUri: Cognito JWKS endpoint (can be auto-derived but set explicitly)
    // outputClaimToHeaders: JWT claim -> HTTP header mapping
    //   custom:tenant-id -> x-tenant-id
    // =========================================================================
    const requestAuth = cluster.addManifest('tenant-request-auth', {
      apiVersion: 'security.istio.io/v1',
      kind: 'RequestAuthentication',
      metadata: {
        name: `${props.tenantid}-jwt-auth`,
        namespace: props.tenantid,
      },
      spec: {
        jwtRules: [
          {
            issuer: tenantCognito.authServerUrl,
            jwksUri: `${tenantCognito.authServerUrl}/.well-known/jwks.json`,
            forwardOriginalToken: true,
            // Allow JWT from query param (SSO entry: ?_jwt=<token>)
            fromParams: ['_jwt'],
            // Allow JWT from cookie (SSR page requests: authToken cookie)
            fromCookies: ['authToken'],
            // Explicit Authorization header (default disabled when fromParams/fromCookies set)
            fromHeaders: [{ name: 'Authorization', prefix: 'Bearer ' }],
            // Forward custom:tenant-id claim from JWT to x-tenant-id header
            outputClaimToHeaders: [
              {
                header: 'x-tenant-id',
                claim: 'custom:tenant-id',
              },
              {
                header: 'x-tenant-tier',
                claim: 'custom:tenantTier',
              },
              {
                header: 'x-tenant-name',
                claim: 'custom:tenantName',
              },
            ],
          },
        ],
      },
    });
    requestAuth.node.addDependency(ns);

    // =========================================================================
    // Istio AuthorizationPolicy (enforce JWT requirement)
    // =========================================================================
    // RequestAuthentication alone still allows requests without a JWT.
    // (If a JWT is present it gets validated, but missing JWTs pass through)
    //
    // Adding an AuthorizationPolicy ensures:
    //   - Only requests with a valid JWT requestPrincipal are allowed
    //   - Requests without a JWT receive 403 Forbidden
    //
    // requestPrincipals: ["*"] = allow all requests with a valid JWT
    // =========================================================================
    const authPolicy = cluster.addManifest('tenant-auth-policy', {
      apiVersion: 'security.istio.io/v1',
      kind: 'AuthorizationPolicy',
      metadata: {
        name: `${props.tenantid}-require-jwt`,
        namespace: props.tenantid,
      },
      spec: {
        action: 'ALLOW',
        rules: [
          {
            from: [
              {
                source: {
                  requestPrincipals: ['*'],
                },
              },
            ],
          },
        ],
      },
    });
    authPolicy.node.addDependency(ns);

    // create service account for tenant
    const tenantServiceAccount = cluster.addServiceAccount(`TenantServiceAccount`, {
      name: `${props.tenantid}-service-account`,
      namespace: props.tenantid,
    });

    // =========================================================================
    // ServiceAccount permissions based on tier
    // =========================================================================
    if (isBasicTier) {
      // Basic: IRSA needs sts:AssumeRole + sts:TagSession to assume ABAC role
      tenantServiceAccount.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole', 'sts:TagSession'],
          resources: [abacRoleArn],
        })
      );

      // Add IRSA ServiceAccount role to ABAC role trust policy
      abacRole!.assumeRolePolicy?.addStatements(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.ArnPrincipal(tenantServiceAccount.role.roleArn)],
          actions: ['sts:AssumeRole', 'sts:TagSession'],
          conditions: {
            StringLike: {
              'aws:RequestTag/tenant': '*',
            },
          },
        })
      );
    } else {
      // Standard/Premium: direct DynamoDB access via IRSA
      tenantServiceAccount.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: [
            'dynamodb:GetItem',
            'dynamodb:BatchGetItem',
            'dynamodb:Query',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:Scan',
          ],
          resources: [orderTableArn],
          effect: iam.Effect.ALLOW,
        })
      );
      tenantServiceAccount.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: [
            'dynamodb:GetItem',
            'dynamodb:BatchGetItem',
            'dynamodb:Query',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:Scan',
          ],
          resources: [
            Arn.format({ service: 'dynamodb', resource: 'table', resourceName: 'Product' }, this),
          ],
          effect: iam.Effect.ALLOW,
        })
      );
    }

    // Cognito Admin permissions for User service (manage users in tenant's User Pool)
    const userPoolArn = Arn.format(
      { service: 'cognito-idp', resource: 'userpool', resourceName: tenantCognito.userPoolId },
      this
    );
    tenantServiceAccount.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminUpdateUserAttributes',
          'cognito-idp:AdminDeleteUser',
          'cognito-idp:AdminAddUserToGroup',
          'cognito-idp:ListUsersInGroup',
          'cognito-idp:GetGroup',
          'cognito-idp:CreateGroup',
        ],
        resources: [userPoolArn],
      })
    );

    tenantServiceAccount.node.addDependency(ns);

    // Basic + PostgreSQL: IRSA needs sts:AssumeRole into SharedDb STSRole
    // for RDS Proxy IAM auth (basic_pool_user connection).
    if (useDb === 'postgresql' && isBasicTier) {
      tenantServiceAccount.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [Fn.importValue('STSRoleArn')],
        })
      );
    }

    // =========================================================================
    // PostgreSQL per-tenant schema + IAM user (Standard/Premium only)
    // =========================================================================
    // When `CDK_USE_DB=postgresql` at synth time AND the tenant is not Basic,
    // invoke the SharedDbStack's Schema_Provisioner_Lambda via a CFN
    // CustomResource so the tenant's database, role, and Proxy Auth are in
    // place before the Product Pod rolls out. Basic tier keeps its existing
    // DynamoDB + ABAC path untouched (Q1 confirmed).
    //
    // `pgEligible` is already computed above alongside `useDb`.
    // =========================================================================
    if (pgEligible) {
      // Grant IRSA role permission to AssumeRole into the shared STSRole.
      // The session policy issued at runtime in product_postgresql narrows
      // the effective permission to the tenant's own user_<tenantName>
      // dbuser resource.
      tenantServiceAccount.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [Fn.importValue('STSRoleArn')],
        })
      );

      // Fire the Schema_Provisioner_Lambda. On Create → create schema,
      // role, per-tenant proxy auth. On Delete → the reverse. Idempotent
      // on both sides (handler swallows duplicate / missing errors).
      const tenantSchema = new CustomResource(this, 'TenantSchema', {
        serviceToken: Fn.importValue('SchemeLambdaArn'),
        properties: {
          tenantName: companyName.valueAsString,
        },
      });

      // Ensure the IRSA role is ready before the schema custom resource
      // runs. For delete, the implicit reverse order (child deletes first)
      // gives us schema-then-IRSA teardown, which is what we want so the
      // DELETE step can still emit `sts:AssumeRole` tokens if needed.
      tenantSchema.node.addDependency(tenantServiceAccount);
    }

  }

  private createKubernetesResources(cluster: eks.ICluster, tenantId: string, plan: string) {
    // tenant namespace
    /* const ns = {
            "apiVersion": "v1",
            "kind": "Namespace",
            "metadata": {
                "name": tenantId,
                "labels": {
                    "name": tenantId,
                    "saas/tenant": "true"
                }
            }
        } as Record<string, any>;
        */
    //Deploy the manifests separately to avoid race conditions - Ranjith Raman 12/7/22
    // network policy
    //const networkPolicy = YAML.load(fs.readFileSync(path.join(__dirname, "..", "resources", "network-policy.yaml"), "utf8")) as Record<string, any>;
    //networkPolicy["metadata"]["namespace"] = tenantId;
    //networkPolicy["metadata"]["name"] = `${tenantId}-policy-deny-other-namespace`;
    // const manifestsToDeploy = [ns, networkPolicy];
    // const manifestsToDeploy = [ns];
    // plan may not be defined from when deleting a tenant
    /* if (plan) {
            // default request spec
            const defaultRequest = YAML.load(fs.readFileSync(path.join(__dirname, "..", "resources", "default-request.yaml"), "utf8")) as Record<string, any>;
            defaultRequest["metadata"]["namespace"] = tenantId;
            manifestsToDeploy.push(defaultRequest);

            // quota
            const quota = YAML.load(fs.readFileSync(path.join(__dirname, "..", "resources", "quota", `${plan}.yaml`), "utf8")) as Record<string, any>;
            quota["metadata"]["namespace"] = tenantId;
            manifestsToDeploy.push(quota);
        }
        

        cluster.addManifest('tenant-namespace', {
            "apiVersion": "v1",
            "kind": "Namespace",
            "metadata": {
                "name": tenantId,
                "labels": {
                    "name": tenantId,
                    "saas/tenant": "true"
                }
            }
        });
        

       new eks.KubernetesManifest(this, "KubernetesResources", {
            cluster: cluster,
            manifest: manifestsToDeploy,
            overwrite: true,
        });
        */
  }
}

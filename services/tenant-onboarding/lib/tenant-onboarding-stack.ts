import { Arn, CfnOutput, CfnParameter, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as alias from 'aws-cdk-lib/aws-route53-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Cognito } from './cognito';

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
      : `https://${distributionDomain.valueAsString}/#/${props.tenantid}`;

    const getNamedUrlForCognito = (pathName?: string) => {
      if (usingCustomDomain) {
        if (pathName) {
          return `${appSiteBaseUrl}/${pathName}`;
        } else {
          return appSiteBaseUrl;
        }
      }

      const path = pathName ? `%26path=${pathName!}` : '';

      return `https://${distributionDomain.valueAsString}/?tenantId=${props.tenantid}${path}`;
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
    });

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



    // create cognito resources
    const cognito = new Cognito(this, 'CognitoResources', {
      adminUserEmailAddress: tenantAdminEmail.valueAsString,
      userPoolName: `${props.tenantid}-UserPool`,
      callbackUrl: getNamedUrlForCognito(),
      signoutUrl: getNamedUrlForCognito('logoff'),
      inviteEmailSubject: `Login for ${companyName.valueAsString}`,
      inviteEmailBody: `Your username is {username} and temporary password is {####}. Please login here: ${appSiteBaseUrl}`,
      customAttributes: {
        'tenant-id': { value: props.tenantid, mutable: false },
      },
    });

    // create tenant entry in dynamodb
    const tableArn = Arn.format(
      {
        service: 'dynamodb',
        resource: 'table',
        resourceName: TENANT_TABLE,
      },
      this
    );

    // create order table
    const orderTable = new dynamodb.Table(this, 'OrderTable', {
      tableName: `Order-${props.tenantid}`,
      partitionKey: {
        name: 'OrderId',
        type: dynamodb.AttributeType.STRING,
      },
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    //Create Tenant namespace
    const ns = cluster.addManifest('tenant-namespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: props.tenantid,
        labels: {
          name: props.tenantid,
          'saas/tenant': 'true',
        },
      },
    });

    // create service account for tenant
    const tenantServiceAccount = cluster.addServiceAccount(`TenantServiceAccount`, {
      name: `${props.tenantid}-service-account`,
      namespace: props.tenantid,
    });

    // permission for order and product tables
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
        resources: [orderTable.tableArn],
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
        conditions: {
          'ForAllValues:StringEquals': {
            'dynamodb:LeadingKeys': [props.tenantid],
          },
        },
        effect: iam.Effect.ALLOW,
      })
    );

    new CfnOutput(this, 'TenantId', { value: props.tenantid });
    new CfnOutput(this, 'AuthServer', { value: cognito.authServerUrl });
    new CfnOutput(this, 'ClientId', { value: cognito.appClientId });
    new CfnOutput(this, 'RedirectUri', { value: getNamedUrlForCognito() });

    tenantServiceAccount.node.addDependency(ns);
  }
}

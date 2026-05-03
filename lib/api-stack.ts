import { Arn, CfnOutput, Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { TenantAuthorizer } from './constructs/tenant-authorizer';

export interface ApiStackProps extends StackProps {
  readonly internalNLBDomain: string;
  readonly vpc: ec2.Vpc;
  readonly ingressControllerName: string;
  readonly eksClusterName: string;

  readonly customDomain?: string;
  readonly hostedZoneId?: string;
}

export class ApiStack extends Stack {
  readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const useCustomDomain = props.customDomain ? true : false;

    const publicHostedZone = useCustomDomain
      ? route53.PublicHostedZone.fromHostedZoneAttributes(this, 'CustomDomainPublicHostedZone', {
          hostedZoneId: props.hostedZoneId!,
          zoneName: `api.${props.customDomain!}`,
        })
      : undefined;

    const apiCertificate = useCustomDomain
      ? new acm.DnsValidatedCertificate(this, 'ApiCertificate', {
          domainName: `api.${props.customDomain!}`,
          hostedZone: publicHostedZone!,
          region: 'us-east-1',
        })
      : undefined;

    const nlbSubdomain = Fn.select(0, Fn.split('.', props.internalNLBDomain));
    const nlbSubdomainParts = Fn.split('-', nlbSubdomain);
    const nlbName = Fn.select(0, nlbSubdomainParts);
    const nlbId = Fn.select(1, nlbSubdomainParts);
    const nlbArn = Arn.format(
      {
        service: 'elasticloadbalancing',
        resource: 'loadbalancer',
        resourceName: `net/${nlbName}/${nlbId}`,
      },
      this
    );

    const nlb = elb.NetworkLoadBalancer.fromNetworkLoadBalancerAttributes(this, 'SaaSInternalNLB', {
      loadBalancerArn: nlbArn,
      loadBalancerDnsName: props.internalNLBDomain,
      vpc: props.vpc,
    });

    const vpcLink = new apigw.VpcLink(this, 'eks-saas-vpc-link', {
      description:
        'VPCLink to connect the API Gateway with the private NLB sitting in front of the EKS cluster',
      targets: [nlb],
      vpcLinkName: 'eks-saas-vpc-link',
    });

    const domainNameProps = useCustomDomain
      ? ({
          domainName: `api.${props.customDomain!}`,
          certificate: apiCertificate,
        } as apigw.DomainNameProps)
      : undefined;

    // Access log group. Format deliberately excludes the Authorization header
    // and any JWT content (Requirement 9.5).
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const api = new apigw.RestApi(this, 'EKSSaaSAPI', {
      restApiName: 'EKSSaaSAPI',
      endpointTypes: [apigw.EndpointType.REGIONAL],
      domainName: domainNameProps,
      deployOptions: {
        tracingEnabled: true,
        accessLogDestination: new apigw.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigw.AccessLogFormat.custom(
          JSON.stringify({
            requestId: '$context.requestId',
            sourceIp: '$context.identity.sourceIp',
            method: '$context.httpMethod',
            path: '$context.resourcePath',
            status: '$context.status',
            tenantId: '$context.authorizer.tenantId',
            userRole: '$context.authorizer.userRole',
            integrationLatency: '$context.integration.latency',
            responseLatency: '$context.responseLatency',
          })
        ),
      },
      defaultMethodOptions: {
        // Keep NONE here so CORS preflight (OPTIONS) stays unauthenticated.
        // The proxy ANY method below overrides this to CUSTOM.
        authorizationType: apigw.AuthorizationType.NONE,
      },
    });

    // Tenant Authorizer: validates the Cognito JWT and exposes tenant claims
    // as authorizer context consumed by the integration-request static
    // overrides below. See .kiro/specs/api-gateway-lambda-authorizer/design.md.
    const tenantAuthorizer = new TenantAuthorizer(this, 'TenantAuthorizer', {
      resultsCacheTtl: Duration.seconds(300),
    });

    const proxy = api.root.addProxy({
      anyMethod: false,
    });

    proxy.addMethod(
      'ANY',
      new apigw.Integration({
        type: apigw.IntegrationType.HTTP_PROXY,
        options: {
          connectionType: apigw.ConnectionType.VPC_LINK,
          vpcLink: vpcLink,
          requestParameters: {
            'integration.request.path.proxy': 'method.request.path.proxy',
            // Static overrides — client-sent x-tenant-* headers are ignored;
            // values are authoritatively sourced from the authorizer context.
            // Intentionally NO mapping for `Authorization` so the original
            // bearer token passes through to downstream (TVM consumes it).
            'integration.request.header.x-tenant-id':
              'context.authorizer.tenantId',
            'integration.request.header.x-tenant-tier':
              'context.authorizer.tenantTier',
            'integration.request.header.x-tenant-name':
              'context.authorizer.tenantName',
            'integration.request.header.x-tenant-user-role':
              'context.authorizer.userRole',
          },
        },
        integrationHttpMethod: 'ANY',
        uri: `http://${nlb.loadBalancerDnsName}/{proxy}`,
      }),
      {
        requestParameters: {
          'method.request.path.proxy': true,
        },
        authorizer: tenantAuthorizer.authorizer,
        authorizationType: apigw.AuthorizationType.CUSTOM,
      }
    );
    proxy.addCorsPreflight({
      allowOrigins: apigw.Cors.ALL_ORIGINS,
      allowMethods: apigw.Cors.ALL_METHODS,
    });

    if (useCustomDomain) {
      new route53.ARecord(this, 'CustomDomainAliasRecord', {
        zone: publicHostedZone!,
        target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
        recordName: `api.${props.customDomain!}`,
      });
    }

    this.apiUrl = useCustomDomain ? `https://api.${props.customDomain!}` : api.url;

    new CfnOutput(this, 'APIUrl', {
      value: this.apiUrl,
    });
  }
}

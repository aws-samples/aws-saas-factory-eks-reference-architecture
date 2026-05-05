import * as path from 'path';
import * as fs from 'fs';
import { Arn, CfnOutput, Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
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

/**
 * API Gateway for the EKS SaaS reference.
 *
 * The API surface is **data-driven from `lib/tenant-api.json`** (Swagger 2.0).
 * At CDK synth time this stack loads the Swagger document, substitutes
 * placeholders (`{{region}}`, `{{authorizer_function}}`, etc.) with live
 * values, and instantiates an `apigw.SpecRestApi`. Adding a new microservice
 * route is therefore a pure data change — edit `lib/tenant-api.json`, rerun
 * `cdk deploy`, no TypeScript modification needed.
 *
 * See `.kiro/specs/spec-driven-api-gateway/design.md` for the full rationale,
 * the list of placeholder tokens, and the ECS-sister-reference parity matrix.
 *
 * The previous `RestApi` + `root.addProxy('{proxy+}')` + `proxy.addMethod`
 * implementation has been removed. The `TenantAuthorizer` construct from the
 * previous feature is unchanged and attached to every non-OPTIONS method via
 * the Swagger `securityDefinitions.sharedApigatewayTenantApiAuthorizer` block.
 */
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

    // Access log group. Format deliberately excludes the Authorization header
    // and any JWT content (preserved from previous feature).
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // Tenant Authorizer (unchanged from api-gateway-lambda-authorizer feature).
    // The Swagger document references this Lambda by function name via the
    // `{{authorizer_function}}` placeholder.
    const tenantAuthorizer = new TenantAuthorizer(this, 'TenantAuthorizer', {
      resultsCacheTtl: Duration.seconds(300),
    });

    // --- Swagger load + placeholder substitution -----------------------------
    // Keep the placeholder set and substitution loop structurally identical to
    // refer/saas-ecs/server/lib/shared-infra/api-gateway.ts so the sbt-boost
    // steering can reason about both references with a single rule.
    const swaggerFilePath = path.join(__dirname, 'tenant-api.json');
    let swaggerBody = fs.readFileSync(swaggerFilePath, 'utf-8');

    const replacements: { [key: string]: string } = {
      '{{version}}':             '1.0.0',
      '{{API_TITLE}}':           'EksTenantAPI',
      '{{stage}}':               'prod',
      '{{connection_id}}':       vpcLink.vpcLinkId,
      '{{integration_uri}}':     `http://${nlb.loadBalancerDnsName}`,
      // NOTE: `{{integration_target}}` was intentionally dropped. It is an
      // ECS-sister-reference artifact used with VPC Link v2 for ALB targets.
      // This project uses classic (v1) VPC Link + NLB, where API Gateway
      // derives the integration target from `connectionId` alone; supplying
      // `integrationTarget` causes
      //   "ConnectionId <id> is not valid for IntegrationTarget"
      // on import. See `lib/tenant-api.json` — no occurrence remains there.
      '{{region}}':              Stack.of(this).region,
      '{{account_id}}':          Stack.of(this).account,
      '{{authorizer_function}}': tenantAuthorizer.lambdaFunction.functionName,
    };
    for (const [placeholder, replacement] of Object.entries(replacements)) {
      // Escape regex special chars in the placeholder (all current tokens are
      // of the form {{name}} which already has regex-meta chars, so escaping
      // is essential).
      const escaped = placeholder.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      swaggerBody = swaggerBody.replace(new RegExp(escaped, 'g'), replacement);
    }

    const domainNameProps = useCustomDomain
      ? ({
          domainName: `api.${props.customDomain!}`,
          certificate: apiCertificate,
        } as apigw.DomainNameProps)
      : undefined;

    const api = new apigw.SpecRestApi(this, 'EKSSaaSAPI', {
      restApiName: 'EKSSaaSAPI',
      apiDefinition: apigw.ApiDefinition.fromInline(JSON.parse(swaggerBody)),
      endpointTypes: [apigw.EndpointType.REGIONAL],
      domainName: domainNameProps,
      cloudWatchRole: true,
      deployOptions: {
        stageName: 'prod',
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
    });

    // SpecRestApi does not automatically grant lambda:InvokeFunction on the
    // authorizer. Port the explicit permission the ECS reference adds.
    tenantAuthorizer.lambdaFunction.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${Stack.of(this).account}:${api.restApiId}/authorizers/*`,
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

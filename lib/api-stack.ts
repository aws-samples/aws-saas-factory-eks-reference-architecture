import { Arn, CfnOutput, Fn, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

export interface ApiStackProps extends StackProps {
    readonly internalNLBDomain: string
    readonly vpc: ec2.Vpc
    readonly ingressControllerName: string
    readonly eksClusterName: string

    readonly customDomain?: string
    readonly hostedZoneId?: string
};

export class ApiStack extends Stack {

    readonly apiUrl: string

    constructor(scope: Construct, id: string, props: ApiStackProps) {
        super(scope, id, props);

        const useCustomDomain = props.customDomain ? true : false;

        const publicHostedZone = useCustomDomain ?
            route53.PublicHostedZone.fromHostedZoneAttributes(this, 'CustomDomainPublicHostedZone', {
                hostedZoneId: props.hostedZoneId!,
                zoneName: `api.${props.customDomain!}`
            }) :
            undefined;

        const apiCertificate = useCustomDomain ?
            new acm.DnsValidatedCertificate(this, 'ApiCertificate', {
                domainName: `api.${props.customDomain!}`,
                hostedZone: publicHostedZone!,
                region: 'us-east-1',
            }) :
            undefined;

        const nlbSubdomain = Fn.select(0, Fn.split(".", props.internalNLBDomain));
        const nlbSubdomainParts = Fn.split("-", nlbSubdomain);
        const nlbName = Fn.select(0, nlbSubdomainParts);
        const nlbId = Fn.select(1, nlbSubdomainParts);
        const nlbArn = Arn.format({
            service: "elasticloadbalancing",
            resource: "loadbalancer",
            resourceName: `net/${nlbName}/${nlbId}`,
        }, this);


        const nlb = elb.NetworkLoadBalancer.fromNetworkLoadBalancerAttributes(this, "SaaSInternalNLB", {
            loadBalancerArn: nlbArn,
            loadBalancerDnsName: props.internalNLBDomain,
            vpc: props.vpc,
        });

        // const nlbHttpListener = elb.NetworkListener.fromLookup(this, "NLBListenerPort80", {
        //     listenerPort: 80,
        //     listenerProtocol: elb.Protocol.TCP,
        //     loadBalancerTags: {
        //         "kubernetes.io/service-name": `${props.ingressControllerName}-ingress-nginx-controller`,
        //         [`kubernetes.io/cluster/${props.eksClusterName}`]: "owned"
        //     },
        // });

        // const vpcLinkSecurityGroup = new ec2.SecurityGroup(this, "vpc-link-sg", {
        //     vpc: props.vpc,
        //     allowAllOutbound: false,
        //     securityGroupName: "vpc-link-sg"
        // });
        // vpcLinkSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

        // const vpcLink = new apigwv2.CfnVpcLink(this, "saas-vpc-link", {
        //     name: "eks-saas-vpc-link",
        //     subnetIds: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }).subnetIds,
        //     securityGroupIds: [vpcLinkSecurityGroup.securityGroupId],
        // });

        const vpcLink = new apigw.VpcLink(this, "eks-saas-vpc-link", {
            description: "VPCLink to connect the API Gateway with the private NLB sitting in front of the EKS cluster",
            targets: [nlb],
            vpcLinkName: "eks-saas-vpc-link",
        });

        // const api = new apigwv2.CfnApi(this, "HttpProxyApi", {
        //     name: "SaaSApi",
        //     protocolType: "HTTP",
        //     corsConfiguration: {
        //         allowMethods: apigw.Cors.ALL_METHODS,
        //         allowOrigins: apigw.Cors.ALL_ORIGINS
        //     },
        // });

        // const integration = new apigwv2.CfnIntegration(this, "HttpProxyIntegration", {
        //     apiId: api.ref,
        //     integrationType: "HTTP_PROXY",
        //     connectionId: vpcLink.ref,
        //     connectionType: "VPC_LINK",
        //     integrationMethod: "ANY",
        //     integrationUri: nlbHttpListener.listenerArn,
        //     payloadFormatVersion: "1.0",
        // });

        const domainNameProps = useCustomDomain ?
            { domainName: `api.${props.customDomain!}`, certificate: apiCertificate } as apigw.DomainNameProps :
            undefined;

        const api = new apigw.RestApi(this, "EKSSaaSAPI", {
            restApiName: "EKSSaaSAPI",
            endpointTypes: [apigw.EndpointType.REGIONAL],
            domainName: domainNameProps,
            deployOptions: {
                tracingEnabled: true,
            },
            defaultMethodOptions: {
                authorizationType: apigw.AuthorizationType.NONE,
            },
            
        });
        const proxy = api.root.addProxy({
            anyMethod: false,
        });

        proxy.addMethod(
            "ANY",
            new apigw.Integration({
                type: apigw.IntegrationType.HTTP_PROXY,
                options: {
                    connectionType: apigw.ConnectionType.VPC_LINK,
                    vpcLink: vpcLink,
                    requestParameters: {
                        "integration.request.path.proxy": "method.request.path.proxy"
                    },
                },
                integrationHttpMethod: "ANY",
                uri: `http://${nlb.loadBalancerDnsName}/{proxy}`,
            }),
            {
                requestParameters: {
                    "method.request.path.proxy": true
                },
                authorizationType: apigw.AuthorizationType.NONE,
            }
        );
        proxy.addCorsPreflight({
            allowOrigins: apigw.Cors.ALL_ORIGINS,
            allowMethods: apigw.Cors.ALL_METHODS,
        });

        if (useCustomDomain) {
            

            const domain = new apigwv2.CfnDomainName(this, "SaaSApiCustomDomain", {
                domainName: `api.${props.customDomain!}`,
                domainNameConfigurations: [
                    {
                        certificateArn: apiCertificate!.certificateArn,
                        certificateName: "saas-api-cert",
                        endpointType: apigw.EndpointType.REGIONAL,
                        securityPolicy: apigw.SecurityPolicy.TLS_1_2
                    }
                ]
            });

            new route53.ARecord(this, 'CustomDomainAliasRecord', {
                zone: publicHostedZone!,
                target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(
                    domain.domainName,
                    props.hostedZoneId!
                )),
                recordName: `api.${props.customDomain!}`
            });
        }

        this.apiUrl = useCustomDomain ? `https://api.${props.customDomain!}` : api.url;

        new CfnOutput(this, "APIUrl", {
            value: this.apiUrl
        });
    }
}
import { KubectlV35Layer } from '@aws-cdk/lambda-layer-kubectl-v35';
import { Arn, CfnJson, CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface EKSClusterStackProps extends StackProps {
  readonly clusterName: string;
  readonly tenantOnboardingProjectName: string;
  readonly tenantDeletionProjectName: string;
  readonly ingressControllerName: string;
  readonly sharedServiceAccountName: string;

  readonly kubecostToken?: string;

  readonly customDomain?: string;
  readonly hostedZoneId?: string;
}

export class EKSClusterStack extends Stack {
  readonly codebuildKubectlRoleArn: string;
  readonly vpc: ec2.Vpc;
  readonly openIdConnectProviderArn: string;
  readonly nlbDomain: string;

  constructor(scope: Construct, id: string, props: EKSClusterStackProps) {
    super(scope, id, props);

    const useCustomDomain = props.customDomain ? true : false;

    if (useCustomDomain && !props.hostedZoneId) {
      throw new Error(`HostedZoneId must be specified when using custom domain.`);
    }

    this.vpc = new ec2.Vpc(this, 'EKSVpc', {
      ipAddresses: ec2.IpAddresses.cidr('192.168.0.0/16'),
      maxAzs: 2,
      vpcName: 'EKS SaaS Vpc',
    });

    const ctrlPlaneSecurityGroup = new ec2.SecurityGroup(this, 'ControlPlaneSecurityGroup', {
      vpc: this.vpc,
      allowAllOutbound: false,
      securityGroupName: 'eks-saas-ctrl-plane-security-group',
      description: 'EKS SaaS control plane security group with recommended traffic rules',
    });
    const nodeSecurityGroup = new ec2.SecurityGroup(this, 'NodeSecurityGroup', {
      vpc: this.vpc,
      allowAllOutbound: true,
      securityGroupName: 'eks-saas-mng-node-security-group',
      description:
        'EKS SaaS node group security group with recommended traffic rules + NLB target group health check access',
    });

    ctrlPlaneSecurityGroup.addIngressRule(nodeSecurityGroup, ec2.Port.tcp(443));
    ctrlPlaneSecurityGroup.addEgressRule(nodeSecurityGroup, ec2.Port.tcp(443)); // needed for istiod webhook
    ctrlPlaneSecurityGroup.addEgressRule(nodeSecurityGroup, ec2.Port.tcpRange(1025, 65535));
    // Istio istiod webhook (15017) and xDS (15012) ports
    ctrlPlaneSecurityGroup.addEgressRule(nodeSecurityGroup, ec2.Port.tcp(15017), 'Istio webhook');
    ctrlPlaneSecurityGroup.addEgressRule(nodeSecurityGroup, ec2.Port.tcp(15012), 'Istio xDS');

    nodeSecurityGroup.addIngressRule(nodeSecurityGroup, ec2.Port.allTraffic());
    nodeSecurityGroup.addIngressRule(ctrlPlaneSecurityGroup, ec2.Port.tcp(443));
    nodeSecurityGroup.addIngressRule(ctrlPlaneSecurityGroup, ec2.Port.tcpRange(1025, 65535));
    // Istio sidecar-to-sidecar communication and istiod connectivity
    nodeSecurityGroup.addIngressRule(nodeSecurityGroup, ec2.Port.tcp(15012), 'Istio xDS');
    nodeSecurityGroup.addIngressRule(nodeSecurityGroup, ec2.Port.tcp(15017), 'Istio webhook');
    nodeSecurityGroup.addIngressRule(ctrlPlaneSecurityGroup, ec2.Port.tcp(15017), 'Istio webhook from control plane');

    nodeSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcpRange(1025, 65535),
      'Needed for the NLB target group health checks'
    );

    const clusterAdmin = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.AccountRootPrincipal(),
    });

    const cluster = new eks.Cluster(this, 'SaaSCluster', {
      clusterName: props.clusterName,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV35Layer(this, 'kubectl'),
      mastersRole: clusterAdmin,
      securityGroup: ctrlPlaneSecurityGroup,
      version: eks.KubernetesVersion.of('1.35'),
      vpc: this.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    const vpcCniSvcAccountRole = new iam.Role(this, 'VpcCniSvcAccountRole', {
      assumedBy: new iam.OpenIdConnectPrincipal(cluster.openIdConnectProvider).withConditions({
        StringEquals: new CfnJson(this, 'VpcCniSvcAccountRoleCondition', {
          value: {
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]:
              'sts.amazonaws.com',
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]:
              'system:serviceaccount:kube-system:aws-node',
          },
        }),
      }),
    });
    vpcCniSvcAccountRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy')
    );

    const vpcCniPlugin = new eks.CfnAddon(this, 'VpcCniPlugin', {
      addonName: 'vpc-cni',
      addonVersion: 'v1.21.1-eksbuild.3',
      clusterName: props.clusterName,
      resolveConflicts: 'OVERWRITE',
      serviceAccountRoleArn: vpcCniSvcAccountRole.roleArn,
    });

    const nodeRole = new iam.Role(this, 'EKSNodeRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    this.addNodeIAMRolePolicies(nodeRole);

    const nodeLaunchTemplate = new ec2.LaunchTemplate(this, 'saas-mng-lt', {
      securityGroup: nodeSecurityGroup,
    });

    const nodegroup = cluster.addNodegroupCapacity('saas-mng', {
      nodegroupName: 'saas-managed-nodegroup-al2023',
      amiType: eks.NodegroupAmiType.AL2023_X86_64_STANDARD,
      capacityType: eks.CapacityType.ON_DEMAND,
      nodeRole: nodeRole,
      // Capacity sized for multi-tenant workloads. Each onboarded tenant adds
      // ~3 service Pods (order/product/user) plus Istio sidecars. Two nodes
      // barely fit the system Pods (CoreDNS, istiod, ingress-gateway, etc).
      // A Cluster Autoscaler / Karpenter rollout is tracked as a follow-up;
      // until then these static bounds avoid `Insufficient cpu/memory`
      // Pending Pods for small numbers of tenants.
      minSize: 2,
      desiredSize: 3,
      maxSize: 8,
      instanceTypes: [new ec2.InstanceType('m5.large')],
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      launchTemplateSpec: {
        id: nodeLaunchTemplate.launchTemplateId!,
      },
    });
    nodegroup.node.addDependency(vpcCniPlugin);

    const kubeProxyAddon = new eks.CfnAddon(this, 'KubeProxyAddon', {
      addonName: 'kube-proxy',
      addonVersion: 'v1.35.0-eksbuild.2',
      clusterName: props.clusterName,
      resolveConflicts: 'OVERWRITE',
    });
    kubeProxyAddon.node.addDependency(nodegroup);

    const coreDnsAddon = new eks.CfnAddon(this, 'CoreDnsAddon', {
      addonName: 'coredns',
      addonVersion: 'v1.13.2-eksbuild.1',
      clusterName: props.clusterName,
      resolveConflicts: 'OVERWRITE',
    });
    coreDnsAddon.node.addDependency(nodegroup);

    const codebuildKubectlRole = new iam.Role(this, 'CodebuildKubectlRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('codebuild.amazonaws.com'),
        new iam.AccountRootPrincipal()
      ),
    });
    codebuildKubectlRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['eks:DescribeCluster'],
        resources: [cluster.clusterArn],
        effect: iam.Effect.ALLOW,
      })
    );

    codebuildKubectlRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecr-public:GetAuthorizationToken'],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      })
    );

    codebuildKubectlRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:GetServiceBearerToken'],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      })
    );
    cluster.awsAuth.addMastersRole(codebuildKubectlRole);

    this.codebuildKubectlRoleArn = codebuildKubectlRole.roleArn;
    this.openIdConnectProviderArn = cluster.openIdConnectProvider.openIdConnectProviderArn;

    this.addSharedServicesPermissions(cluster, props);

    // =========================================================================
    // Install Istio Service Mesh (replaces Nginx Ingress)
    // =========================================================================
    // Istio consists of 3 Helm charts:
    //   1) istio-base: Installs Istio CRDs (Gateway, VirtualService, RequestAuthentication, etc.)
    //   2) istiod: Control plane (manages Envoy sidecars, applies traffic policies)
    //   3) gateway: Istio Ingress Gateway (receives external traffic, creates NLB)
    //
    // Previous Nginx Ingress flow:
    //   API GW -> NLB -> Nginx Ingress -> per-tenant Ingress(minion) -> Service
    //
    // New Istio flow:
    //   API GW -> NLB -> Istio Ingress Gateway -> Gateway -> VirtualService -> Service
    //   + RequestAuthentication for JWT validation & tenantId extraction
    // =========================================================================

    const istioNamespace = 'istio-system';

    // 1) istio-base: Install CRDs
    const istioBase = cluster.addHelmChart('IstioBase', {
      chart: 'base',
      repository: 'https://istio-release.storage.googleapis.com/charts',
      release: 'istio-base',
      namespace: istioNamespace,
      createNamespace: true,
      version: '1.29.0',
      values: {
        defaultRevision: 'default',
      },
    });
    istioBase.node.addDependency(nodegroup);

    // 2) istiod: Control plane
    const istiod = cluster.addHelmChart('Istiod', {
      chart: 'istiod',
      repository: 'https://istio-release.storage.googleapis.com/charts',
      release: 'istiod',
      namespace: istioNamespace,
      version: '1.29.0',
      values: {
        meshConfig: {
          // Enable access logging (for debugging)
          accessLogFile: '/dev/stdout',
          // Outbound traffic policy: ALLOW_ANY (default, allows external calls)
          outboundTrafficPolicy: {
            mode: 'ALLOW_ANY',
          },
        },
      },
    });
    istiod.node.addDependency(istioBase);

    // 3) Istio Ingress Gateway: External traffic entry point (creates NLB)
    //    Replaces the role of the previous Nginx Ingress Controller
    const istioGateway = cluster.addHelmChart('IstioIngressGateway', {
      chart: 'gateway',
      repository: 'https://istio-release.storage.googleapis.com/charts',
      release: 'istio-ingressgateway',
      namespace: istioNamespace,
      version: '1.29.0',
      values: {
        service: {
          type: 'LoadBalancer',
          annotations: {
            'service.beta.kubernetes.io/aws-load-balancer-type': 'nlb',
            'service.beta.kubernetes.io/aws-load-balancer-backend-protocol': 'tcp',
            'service.beta.kubernetes.io/aws-load-balancer-connection-idle-timeout': '3600',
          },
        },
      },
    });
    istioGateway.node.addDependency(istiod);

    // NLB domain: LoadBalancer address of the Istio Ingress Gateway Service
    this.nlbDomain = cluster.getServiceLoadBalancerAddress(
      'istio-ingressgateway',
      { namespace: istioNamespace }
    );

    // =========================================================================
    // Istio Gateway resource (replaces the previous Master Mergable Ingress)
    // =========================================================================
    // The Gateway binds to the Istio Ingress Gateway to receive external traffic.
    // Accepts HTTP port 80 traffic from all hosts (*).
    // API Gateway -> NLB -> Istio Ingress Gateway -> this Gateway -> VirtualService
    // =========================================================================
    const istioGatewayManifest = new eks.KubernetesManifest(this, 'IstioGatewayResource', {
      cluster: cluster,
      overwrite: true,
      manifest: [
        {
          apiVersion: 'networking.istio.io/v1',
          kind: 'Gateway',
          metadata: {
            name: 'saas-gateway',
            namespace: istioNamespace,
          },
          spec: {
            selector: {
              istio: 'ingressgateway',
            },
            servers: [
              {
                port: {
                  number: 80,
                  name: 'http',
                  protocol: 'HTTP',
                },
                hosts: ['*'],
              },
            ],
          },
        },
      ],
    });
    istioGatewayManifest.node.addDependency(istioGateway);
  }

  private addNodeIAMRolePolicies(eksNodeRole: iam.Role): void {
    eksNodeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy')
    );
    eksNodeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly')
    );
    eksNodeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );
  }

  private addSharedServicesPermissions(cluster: eks.Cluster, props: EKSClusterStackProps) {
    const sharedServiceAccount = cluster.addServiceAccount('SaaSServiceAccount', {
      name: props.sharedServiceAccountName,
      namespace: 'default',
    });

    sharedServiceAccount.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:BatchGetItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:BatchWriteItem',
        ],
        resources: [
          Arn.format({ service: 'dynamodb', resource: 'table', resourceName: 'Tenant' }, this),
        ],
        effect: iam.Effect.ALLOW,
      })
    );
    sharedServiceAccount.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['codebuild:StartBuild'],
        resources: [
          Arn.format(
            {
              service: 'codebuild',
              resource: 'project',
              resourceName: props.tenantOnboardingProjectName,
            },
            this
          ),
          Arn.format(
            {
              service: 'codebuild',
              resource: 'project',
              resourceName: props.tenantDeletionProjectName,
            },
            this
          ),
        ],
        effect: iam.Effect.ALLOW,
      })
    );
    sharedServiceAccount.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:ListUsers'],
        resources: [
          Arn.format({ service: 'cognito-idp', resource: 'userpool', resourceName: '*' }, this),
        ],
        effect: iam.Effect.ALLOW,
      })
    );
  }
}

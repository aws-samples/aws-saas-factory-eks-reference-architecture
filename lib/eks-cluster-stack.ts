import { Arn, CfnJson, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

import * as YAML from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface EKSClusterStackProps extends StackProps {
    readonly clusterName: string
    readonly tenantOnboardingProjectName: string
    readonly tenantDeletionProjectName: string
    readonly ingressControllerName: string
    readonly sharedServiceAccountName: string

    readonly kubecostToken?: string

    readonly customDomain?: string
    readonly hostedZoneId?: string
}

export class EKSClusterStack extends Stack {

    readonly codebuildKubectlRoleArn: string;
    readonly vpc: ec2.Vpc;
    readonly openIdConnectProviderArn: string;
    readonly nlbDomain: string;

    constructor(scope: Construct, id: string, props: EKSClusterStackProps) {
        super(scope, id, props);

        const ingressControllerReleaseName = 'controller';

        const useCustomDomain = props.customDomain ? true : false;

        if (useCustomDomain && !props.hostedZoneId) {
            throw new Error(`HostedZoneId must be specified when using custom domain.`)
        }

        this.vpc = new ec2.Vpc(this, "EKSVpc", {
            cidr: "192.168.0.0/16",
            maxAzs: 2,
            vpcName: "EKS SaaS Vpc",
        });

        const ctrlPlaneSecurityGroup = new ec2.SecurityGroup(this, "ControlPlaneSecurityGroup", {
            vpc: this.vpc,
            allowAllOutbound: false,
            securityGroupName: "eks-saas-ctrl-plane-security-group",
            description: "EKS SaaS control plane security group with recommended traffic rules"
        });
        const nodeSecurityGroup = new ec2.SecurityGroup(this, "NodeSecurityGroup", {
            vpc: this.vpc,
            allowAllOutbound: true,
            securityGroupName: "eks-saas-mng-node-security-group",
            description: "EKS SaaS node group security group with recommended traffic rules + NLB target group health check access"
        });

        ctrlPlaneSecurityGroup.addIngressRule(nodeSecurityGroup, ec2.Port.tcp(443));
        ctrlPlaneSecurityGroup.addEgressRule(nodeSecurityGroup, ec2.Port.tcp(443)); // needed for nginx-ingress admission controller
        ctrlPlaneSecurityGroup.addEgressRule(nodeSecurityGroup, ec2.Port.tcpRange(1025, 65535));

        nodeSecurityGroup.addIngressRule(nodeSecurityGroup, ec2.Port.allTraffic());
        nodeSecurityGroup.addIngressRule(ctrlPlaneSecurityGroup, ec2.Port.tcp(443));
        nodeSecurityGroup.addIngressRule(ctrlPlaneSecurityGroup, ec2.Port.tcpRange(1025, 65535));

        nodeSecurityGroup.addIngressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcpRange(1025, 65535), "Needed for the NLB target group health checks");

        const clusterAdmin = new iam.Role(this, 'AdminRole', {
            assumedBy: new iam.AccountRootPrincipal(),
          });

        const cluster = new eks.Cluster(this, "SaaSCluster", {
            version: eks.KubernetesVersion.V1_27,
            mastersRole: clusterAdmin,
            clusterName: props.clusterName,
            defaultCapacity: 0,
            vpc: this.vpc,
            vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }],
            securityGroup: ctrlPlaneSecurityGroup,
        });

        const vpcCniSvcAccountRole = new iam.Role(this, 'VpcCniSvcAccountRole', {
            assumedBy: new iam.OpenIdConnectPrincipal(cluster.openIdConnectProvider).withConditions({
                StringEquals: new CfnJson(this, 'VpcCniSvcAccountRoleCondition', {
                    value: {
                        [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: "sts.amazonaws.com",
                        [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]: "system:serviceaccount:kube-system:aws-node"
                    },
                }),
            }),
        });
        vpcCniSvcAccountRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy"));

        const vpcCniPlugin = new eks.CfnAddon(this, "VpcCniPlugin", {
            addonName: "vpc-cni",
            clusterName: props.clusterName,
            resolveConflicts: "OVERWRITE",
            serviceAccountRoleArn: vpcCniSvcAccountRole.roleArn
        });


        const nodeRole = new iam.Role(this, "EKSNodeRole", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com")
        });
        this.addNodeIAMRolePolicies(nodeRole);


        const nodeLaunchTemplate = new ec2.LaunchTemplate(this, "saas-mng-lt", {
            securityGroup: nodeSecurityGroup,
        });

        const nodegroup = cluster.addNodegroupCapacity("saas-mng", {
            nodegroupName: "saas-managed-nodegroup",
            amiType: eks.NodegroupAmiType.AL2_X86_64,
            capacityType: eks.CapacityType.ON_DEMAND,
            nodeRole: nodeRole,
            minSize: 1,
            desiredSize: 2,
            maxSize: 4,
            instanceTypes: [new ec2.InstanceType("m5.large")],
            subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
            launchTemplateSpec: {
                id: nodeLaunchTemplate.launchTemplateId!
            },
        });
        nodegroup.node.addDependency(vpcCniPlugin);

        const codebuildKubectlRole = new iam.Role(this, "CodebuildKubectlRole", {
            assumedBy: new iam.CompositePrincipal(
                new iam.ServicePrincipal("codebuild.amazonaws.com"),
                new iam.AccountRootPrincipal(),
            )
        });
        codebuildKubectlRole.addToPolicy(new iam.PolicyStatement({
            actions: ["eks:DescribeCluster"],
            resources: [cluster.clusterArn],
            effect: iam.Effect.ALLOW
        }));

        codebuildKubectlRole.addToPolicy(new iam.PolicyStatement({
            actions: ["ecr-public:GetAuthorizationToken"],
            resources: ['*'],
            effect: iam.Effect.ALLOW
        }));

        codebuildKubectlRole.addToPolicy(new iam.PolicyStatement({
            actions: ["sts:GetServiceBearerToken"],
            resources: ['*'],
            effect: iam.Effect.ALLOW
        }));
        cluster.awsAuth.addMastersRole(codebuildKubectlRole);

        this.codebuildKubectlRoleArn = codebuildKubectlRole.roleArn;
        this.openIdConnectProviderArn = cluster.openIdConnectProvider.openIdConnectProviderArn;

        this.addSharedServicesPermissions(cluster, props);


        // add nginx-ingress        
        const nginxValues = fs.readFileSync(path.join(__dirname, "..", "resources", "nginx-ingress-config.yaml"), "utf8")
        const nginxValuesAsRecord = YAML.load(nginxValues) as Record<string, any>;


        const nginxChart = cluster.addHelmChart('IngressController', {
            chart: 'nginx-ingress',
            repository: 'https://helm.nginx.com/stable',
            release: ingressControllerReleaseName,
            values: {
              controller: {
                publishService: {
                  enabled: true,
                },
                service: {
                  annotations: {
                    'service.beta.kubernetes.io/aws-load-balancer-type': 'nlb',
                    'service.beta.kubernetes.io/aws-load-balancer-backend-protocol': 'http',
                    'service.beta.kubernetes.io/aws-load-balancer-ssl-ports': '443',
                    'service.beta.kubernetes.io/aws-load-balancer-connection-idle-timeout': '3600',
                  },
                  targetPorts: {
                    https: 'http',
                  },
                },
              },
            },
          });

        nginxChart.node.addDependency(nodegroup);

        /*this.nlbDomain = cluster.getServiceLoadBalancerAddress(`${props.ingressControllerName}-nginx-ingress`, {
            namespace: "default",
        });*/

         this.nlbDomain = new eks.KubernetesObjectValue(this, 'elbAddress', {
            cluster,
            objectType: 'Service',
            objectName: `${ingressControllerReleaseName}-nginx-ingress-controller`,
            jsonPath: '.status.loadBalancer.ingress[0].hostname',
          }).value;

        // add primary mergable ingress (for host collision)
        new eks.KubernetesManifest(this, "PrimarySameHostMergableIngress", {
            cluster: cluster,
            overwrite: true,
            manifest: [{
                "apiVersion": "networking.k8s.io/v1",
                "kind": "Ingress",
                "metadata": {
                    "name": "default-primary-mergable-ingress",
                    "namespace": "default",
                    "annotations": {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.org/mergeable-ingress-type": "master"
                    }
                },
                "spec": {
                    "rules": [
                        {
                            "host": this.nlbDomain,
                        }
                    ]
                }
            }]
        });

       /* if (props.kubecostToken) {
            this.installKubecost(cluster, nodegroup, props.kubecostToken!, this.nlbDomain);
        } */
    }

    private addNodeIAMRolePolicies(eksNodeRole: iam.Role): void {
        eksNodeRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy"));
        eksNodeRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryReadOnly"));
        eksNodeRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));
    }

    private addSharedServicesPermissions(cluster: eks.Cluster, props: EKSClusterStackProps) {
        const sharedServiceAccount = cluster.addServiceAccount("SaaSServiceAccount", {
            name: props.sharedServiceAccountName,
            namespace: "default",
        });

        sharedServiceAccount.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "dynamodb:GetItem",
                "dynamodb:BatchGetItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:BatchWriteItem"
            ],
            resources: [
                Arn.format({ service: "dynamodb", resource: "table", resourceName: "Tenant" }, this),
            ],
            effect: iam.Effect.ALLOW
        }));
        sharedServiceAccount.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ["codebuild:StartBuild"],
            resources: [
                Arn.format({ service: "codebuild", resource: "project", resourceName: props.tenantOnboardingProjectName }, this),
                Arn.format({ service: "codebuild", resource: "project", resourceName: props.tenantDeletionProjectName }, this),
            ],
            effect: iam.Effect.ALLOW
        }));
        sharedServiceAccount.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "cognito-idp:ListUsers"
            ],
            resources: [
                Arn.format({ service: "cognito-idp", resource: "userpool", resourceName: "*" }, this),
            ],
            effect: iam.Effect.ALLOW
        }));
    }
}

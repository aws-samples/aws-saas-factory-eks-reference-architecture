import { Arn, CfnParameter, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cr from 'aws-cdk-lib/custom-resources';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as alias from 'aws-cdk-lib/aws-route53-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as fs from 'fs';
import * as YAML from 'js-yaml';
import { Cognito } from "./cognito";

const TENANT_TABLE = "Tenant";

export interface TenantOnboardingStackProps extends StackProps {
    readonly plan: string
    readonly tenantid: string
    readonly customDomain?: string
    readonly hostedZoneId?: string
}

export class TenantOnboardingStack extends Stack {
    constructor(scope: Construct, id: string, props: TenantOnboardingStackProps) {
        super(scope, id, props);

        const tenantId = new CfnParameter(this, "TenantId", {});
        const companyName = new CfnParameter(this, "CompanyName", {});
        const tenantAdminEmail = new CfnParameter(this, "TenantAdminEmail", {});
        const appDistributionId = new CfnParameter(this, "AppDistributionId", {});
        const distributionDomain = new CfnParameter(this, "DistributionDomain", {});
        const eksClusterName = new CfnParameter(this, "EKSClusterName", {});
        const eksKubectlRoleArn = new CfnParameter(this, "KubectlRoleArn", {});
        const eksClusterOIDCProviderArn = new CfnParameter(this, "OIDCProviderArn", {});


        const usingCustomDomain = props.customDomain && props.customDomain.length > 0;
        if (usingCustomDomain && !props.hostedZoneId) {
            throw new Error(`Hosted Zone must be specified for the custom domain '${props.customDomain}'`);
        }

        const appSiteBaseUrl = usingCustomDomain ?
            `https://${props.tenantid}.${props.customDomain!}` :
            `https://${distributionDomain.valueAsString}/#/${props.tenantid}`;


        const getNamedUrlForCognito = (pathName?: string) => {
            if (usingCustomDomain) {
                if (pathName) {
                    return `${appSiteBaseUrl}/${pathName}`;
                }
                else {
                    return appSiteBaseUrl;
                }
            }

            const path = pathName ? `%26path=${pathName!}` : "";

            return `https://${distributionDomain.valueAsString}/?tenantId=${props.tenantid}${path}`;
        }


        const provider = eks.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, "OIDCProvider", eksClusterOIDCProviderArn.valueAsString);

        const cluster = eks.Cluster.fromClusterAttributes(this, "EKSCluster", {
            clusterName: eksClusterName.valueAsString,
            kubectlRoleArn: eksKubectlRoleArn.valueAsString,
            openIdConnectProvider: provider,
        });

        // create kubernetes resource
        //this.createKubernetesResources(cluster, props.tenantid, props.plan);


        // create app site distribution 
        if (usingCustomDomain) {
            // add alias to existing distribution
            const tenantAppDomain = `${props.tenantid}.${props.customDomain}`;

            const hostedZone = route53.PublicHostedZone.fromHostedZoneAttributes(this, 'PublicHostedZone', {
                hostedZoneId: props.hostedZoneId!,
                zoneName: props.customDomain!
            });

            const distribution = cloudfront.Distribution.fromDistributionAttributes(this, "CloudFrontDistribution", {
                distributionId: appDistributionId.valueAsString,
                domainName: distributionDomain.valueAsString
            });

            new route53.ARecord(this, `AliasRecord`, {
                zone: hostedZone,
                recordName: tenantAppDomain,
                target: route53.RecordTarget.fromAlias(new alias.CloudFrontTarget(distribution))
            });

            // new route53.TxtRecord(this, `TxtRecord`,{
            //     zone: hostedZone,
            //     recordName: tenantAppDomain,
            //     values: ['Tenant app TXT record']
            // });

            // const distributionArn = Arn.format({
            //     service: "cloudfront",
            //     resource: "distribution",
            //     region: "",
            //     resourceName: appDistributionId.valueAsString,
            // }, this);

            // new cr.AwsCustomResource(this, 'CloudFrontCustomDomain', {
            //     onCreate: {
            //         service: 'CloudFront',
            //         action: 'associateAlias',
            //         parameters: {
            //             Alias: tenantAppDomain,
            //             TargetDistributionId: appDistributionId.valueAsString,
            //         },
            //         physicalResourceId: cr.PhysicalResourceId.of(`CloudFrontCustomDomain-${props.tenantid}`),
            //     },
            //     onUpdate: {
            //         service: 'CloudFront',
            //         action: 'updateDistribution',
            //         parameters: {
            //             Alias: tenantAppDomain,
            //             TargetDistributionId: appDistributionId.valueAsString,
            //         },
            //         physicalResourceId: cr.PhysicalResourceId.of(`CloudFrontCustomDomain-${props.tenantid}`),
            //     },
            //     // TODO: implement removal of alias later. not a blocker.
            //     //policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [distributionArn] }),
            //     policy: cr.AwsCustomResourcePolicy.fromStatements([
            //         new iam.PolicyStatement({
            //             actions: ["cloudfront:AssociateAlias", "cloudfront:UpdateDistribution"],
            //             effect: iam.Effect.ALLOW,
            //             resources: [distributionArn],
            //         })
            //     ])
            // });
        } else {
            // no distribution. app-domain/tenant is the url.
        }

        // create cognito resources
        const cognito = new Cognito(this, "CognitoResources", {
            adminUserEmailAddress: tenantAdminEmail.valueAsString,
            userPoolName: `${props.tenantid}-UserPool`,
            callbackUrl: getNamedUrlForCognito(),
            signoutUrl: getNamedUrlForCognito("logoff"),
            inviteEmailSubject: `Login for ${companyName.valueAsString}`,
            inviteEmailBody: `Your username is {username} and temporary password is {####}. Please login here: ${appSiteBaseUrl}`,
            customAttributes: {
                "tenant-id": { value: props.tenantid, mutable: false },
            }
        });

        // create tenant entry in dynamodb
        const tableArn = Arn.format({
            service: "dynamodb",
            resource: "table",
            resourceName: TENANT_TABLE
        }, this);

        // TODO: make sure silent referesh works with or without custom domain
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
                        AUTH_SERVER: { S: cognito.authServerUrl },
                        AUTH_CLIENT_ID: { S: cognito.appClientId },
                        AUTH_REDIRECT_URI: { S: getNamedUrlForCognito() },
                        COGNITO_DOMAIN: { S: `https://${cognito.appClientId}.auth.${this.region}.amazoncognito.com` },
                        AUTH_USE_SR: { BOOL: true },
                        AUTH_SR_REDIRECT_URI: { S: getNamedUrlForCognito("silentrefresh") },
                        AUTH_SR_TIMEOUT: { N: "5000" },
                        AUTH_TIMEOUT_FACTOR: { N: "0.25" },
                        AUTH_SESSION_CHECKS_ENABLED: { BOOL: true },
                        AUTH_SHOW_DEBUG_INFO: { BOOL: true },
                        AUTH_CLEAR_HASH_AFTER_LOGIN: { BOOL: false }
                    }
                },
                physicalResourceId: cr.PhysicalResourceId.of(`TenantEntry-${props.tenantid}`),
            },
            onDelete: {
                service: 'DynamoDB',
                action: 'deleteItem',
                parameters: {
                    TableName: TENANT_TABLE,
                    Key: {
                        TENANT_ID: { S: props.tenantid }
                    }
                },
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [tableArn] }),
        });


        // create order table
        const orderTable = new dynamodb.Table(this, 'OrderTable', {
            tableName: `Order-${props.tenantid}`,
            partitionKey: {
                name: "OrderId",
                type: dynamodb.AttributeType.STRING
            },
            readCapacity: 5,
            writeCapacity: 5,
            removalPolicy: RemovalPolicy.DESTROY
        });

        //Create Tenant namespace
        const ns = cluster.addManifest('tenant-namespace', {
            "apiVersion": "v1",
            "kind": "Namespace",
            "metadata": {
                "name": props.tenantid,
                "labels": {
                    "name": props.tenantid,
                    "saas/tenant": "true"
                }
            }
        });

        // create service account for tenant
        const tenantServiceAccount = cluster.addServiceAccount(`TenantServiceAccount`, {
            name: `${props.tenantid}-service-account`,
            namespace: props.tenantid
        });

        // permission for order and product tables
        tenantServiceAccount.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "dynamodb:GetItem",
                "dynamodb:BatchGetItem",
                "dynamodb:Query",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:BatchWriteItem",
                "dynamodb:Scan"
            ],
            resources: [
                orderTable.tableArn
            ],
            effect: iam.Effect.ALLOW
        }));
        tenantServiceAccount.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "dynamodb:GetItem",
                "dynamodb:BatchGetItem",
                "dynamodb:Query",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:BatchWriteItem",
                "dynamodb:Scan"
            ],
            resources: [
                Arn.format({ service: "dynamodb", resource: "table", resourceName: "Product" }, this)
            ],
            conditions: {
                "ForAllValues:StringEquals": {
                    "dynamodb:LeadingKeys": [
                        props.tenantid
                    ]
                }
            },
            effect: iam.Effect.ALLOW
        }));

        tenantServiceAccount.node.addDependency(ns);
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
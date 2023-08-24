import { Construct } from "constructs";
import { Arn, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface TenantOnboardingProps {
    readonly onboardingProjectName: string
    readonly deletionProjectName: string
    readonly assetDirectory: string

    readonly eksClusterName: string
    readonly codebuildKubectlRole: iam.IRole
    readonly eksClusterOIDCProviderArn: string

    readonly applicationServiceBuildProjectNames: string[]

    readonly appSiteDistributionId: string
    readonly appSiteCloudFrontDomain: string
    readonly appSiteCustomDomain?: string
    readonly appSiteHostedZoneId?: string

    readonly defaultBranchName?: string
}

export class TenantOnboarding extends Construct {

    readonly repositoryUrl: string;

    constructor(scope: Construct, id: string, props: TenantOnboardingProps) {
        super(scope, id);

        const defaultBranchName = props.defaultBranchName ?? "main";

        this.addTenantOnboardingPermissions(props.codebuildKubectlRole, props);

        const sourceRepo = new codecommit.Repository(this, `${id}Repository`, {
            repositoryName: "TenantOnboarding",
            description: `Repository for tenant onboarding`,
            code: codecommit.Code.fromDirectory(props.assetDirectory, defaultBranchName),
        });
        sourceRepo.applyRemovalPolicy(RemovalPolicy.DESTROY);
        this.repositoryUrl = sourceRepo.repositoryCloneUrlHttp;

        const onboardingCfnParams: { [key: string]: string } = {
            "TenantId": "$TENANT_ID",
            "CompanyName": '"$COMPANY_NAME"',
            "TenantAdminEmail": '"$ADMIN_EMAIL"',
            "AppDistributionId": `"${props.appSiteDistributionId}"`,
            "DistributionDomain": `"${props.appSiteCloudFrontDomain}"`,
            "EKSClusterName": `"${props.eksClusterName}"`,
            "KubectlRoleArn": `"${props.codebuildKubectlRole.roleArn}"`,
            "OIDCProviderArn": `"${props.eksClusterOIDCProviderArn}"`,
        };

        const cfnParamString = Object.entries(onboardingCfnParams).map(x => `--parameters ${x[0]}=${x[1]}`).join(" ");

        const onboardingProject = new codebuild.Project(this, `TenantOnboardingProject`, {
            projectName: `${props.onboardingProjectName}`,
            source: codebuild.Source.codeCommit({ repository: sourceRepo }),
            role: props.codebuildKubectlRole,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
            },
            environmentVariables: {
                TENANT_ID: {
                    value: ""
                },
                COMPANY_NAME: {
                    value: ""
                },
                ADMIN_EMAIL: {
                    value: ""
                },
                PLAN: {
                    value: ""
                },
                AWS_ACCOUNT: {
                    value: Stack.of(this).account
                },
                AWS_REGION: {
                    value: Stack.of(this).region
                },
                APP_SITE_CUSTOM_DOMAIN: {
                    value: props.appSiteCustomDomain ?? ""
                },
                APP_SITE_HOSTED_ZONE: {
                    value: props.appSiteHostedZoneId ?? ""
                },
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            "npm i",
                        ]
                    },
                    pre_build: {
                        commands: [
                        ],
                    },
                    build: {
                        commands: [
                            "npm run cdk bootstrap",
                            `npm run cdk deploy TenantStack-$TENANT_ID -- --require-approval=never ${cfnParamString}`
                        ],
                    },
                    post_build: {
                        commands: props.applicationServiceBuildProjectNames.map(
                            x => `aws codebuild start-build --project-name ${x}TenantDeploy --environment-variables-override name=TENANT_ID,value=\"$TENANT_ID\",type=PLAINTEXT`)
                    },
                },
            }),
        });
        sourceRepo.grantPull(onboardingProject.role!);


        const tenantDeletionProject = new codebuild.Project(this, 'TenantDeletionProject', {
            projectName: props.deletionProjectName,
            role: props.codebuildKubectlRole,
            source: codebuild.Source.codeCommit({ repository: sourceRepo }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
            },
            environmentVariables: {
                TENANT_ID: {
                    value: ""
                },
                AWS_ACCOUNT: {
                    value: Stack.of(this).account
                },
                AWS_REGION: {
                    value: Stack.of(this).region
                }
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            "npm i",
                        ]
                    },
                    pre_build: {
                        commands: [
                        ],
                    },
                    build: {
                        commands: [
                            "npm run cdk bootstrap",
                            `npm run cdk destroy TenantStack-$TENANT_ID -- --require-approval=never -f`,
                        ],
                    },
                    post_build: {
                        commands: [
                        ]
                    },
                },
            }),
        });
        sourceRepo.grantPull(tenantDeletionProject.role!);
    }


    private addTenantOnboardingPermissions(projectRole: iam.IRole, props: TenantOnboardingProps) {
        // TODO: reduce the permission 

        projectRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "route53:*"
            ],
            resources: [
                `arn:${Stack.of(this).partition}:route53:::hostedzone/${props.appSiteHostedZoneId!}`
            ],
            effect: iam.Effect.ALLOW
        }));
        projectRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "route53domains:*",
                "cognito-identity:*",
                "cognito-idp:*",
                "cognito-sync:*",
                "iam:*",
                "s3:*",
                "cloudformation:*",
                "codebuild:StartBuild",
            ],
            resources: [
                "*"
            ],
            effect: iam.Effect.ALLOW
        }));
        projectRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "cloudfront:AssociateAlias",
                "cloudfront:GetDistribution",
                "cloudfront:GetDistributionConfig",
                "cloudfront:UpdateDistribution",
            ],
            resources: [
                Arn.format({ service: "cloudfront", resource: "distribution", resourceName: props.appSiteDistributionId }, Stack.of(this))
            ],
            effect: iam.Effect.ALLOW
        }));
        projectRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "dynamodb:PutItem",
                "dynamodb:DeleteItem",
            ],
            resources: [
                Arn.format({ service: "dynamodb", resource: "table", resourceName: "Tenant" }, Stack.of(this))
            ],
            effect: iam.Effect.ALLOW
        }));
        projectRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "dynamodb:CreateTable",
                "dynamodb:DeleteTable",
            ],
            resources: [
                Arn.format({ service: "dynamodb", resource: "table", resourceName: "Order-*" }, Stack.of(this))
            ],
            effect: iam.Effect.ALLOW
        }));
        projectRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "ssm:GetParameter"
            ],
            resources: [
                Arn.format({ service: "ssm", resource: "parameter", resourceName: "cdk-bootstrap/*"}, Stack.of(this))
            ]
        }))
    }
}
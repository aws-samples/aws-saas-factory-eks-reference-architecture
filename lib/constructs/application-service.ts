import { Construct } from "constructs";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';

export interface ApplicationServiceProps {
    readonly name: string
    readonly assetDirectory: string
    readonly ecrImageName: string
    readonly eksClusterName: string
    readonly codebuildKubectlRole: iam.IRole
    readonly internalApiDomain: string
    readonly serviceUrlPrefix: string;
    
    readonly defaultBranchName?: string
}

export class ApplicationService extends Construct {

    readonly codeRepositoryUrl: string;

    constructor(scope: Construct, id: string, props: ApplicationServiceProps) {
        super(scope, id);

        const defaultBranchName = props.defaultBranchName ?? "main";

        const sourceRepo = new codecommit.Repository(this, `${id}Repository`, {
            repositoryName: props.name,
            description: `Repository with code for ${props.name}`,
            code: codecommit.Code.fromDirectory(props.assetDirectory, defaultBranchName)
        });
        this.codeRepositoryUrl = sourceRepo.repositoryCloneUrlHttp;

        const containerRepo = new ecr.Repository(this, `${id}ECR`, {
            repositoryName: props.ecrImageName,
            imageScanOnPush: true,
            imageTagMutability: ecr.TagMutability.MUTABLE,
            removalPolicy: RemovalPolicy.DESTROY
        });
        new cr.AwsCustomResource(this, "ECRRepoDeletion", {
            onDelete: {
                service: 'ECR',
                action: 'deleteRepository',
                parameters: {
                    repositoryName: containerRepo.repositoryName,
                    force: true
                },
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [containerRepo.repositoryArn] }),
        });

        const project = new codebuild.Project(this, `${id}EKSDeployProject`, {
            projectName: `${props.name}`,
            source: codebuild.Source.codeCommit({ repository: sourceRepo }),
            role: props.codebuildKubectlRole,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
                privileged: true
            },
            environmentVariables: {
                CLUSTER_NAME: {
                    value: `${props.eksClusterName}`,
                },
                ECR_REPO_URI: {
                    value: `${containerRepo.repositoryUri}`,
                },
                AWS_REGION: {
                    value: Stack.of(this).region
                },
                AWS_ACCOUNT: {
                    value: Stack.of(this).account
                },
                SEVICE_IMAGE_NAME: {
                    value: props.ecrImageName
                },
                SERVICE_URL_PREFIX: {
                    value: props.serviceUrlPrefix
                }
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            `export API_HOST=$(echo '${props.internalApiDomain || ""}' | awk '{print tolower($0)}')`,
                            'export IMAGE_TAG=$CODEBUILD_RESOLVED_SOURCE_VERSION',
                            'echo $IMAGE_TAG',
                            'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"',
                            'chmod +x ./kubectl',
                        ]
                    },
                    pre_build: {
                        commands: [
                            'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO_URI',
                            'aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws',
                        ],
                    },
                    build: {
                        commands: [
                            "docker build -t $SEVICE_IMAGE_NAME:$IMAGE_TAG .",
                            "docker tag $SEVICE_IMAGE_NAME:$IMAGE_TAG $ECR_REPO_URI:latest",
                            "docker tag $SEVICE_IMAGE_NAME:$IMAGE_TAG $ECR_REPO_URI:$IMAGE_TAG",
                            "docker push $ECR_REPO_URI:latest",
                            "docker push $ECR_REPO_URI:$IMAGE_TAG",
                        ],
                    },
                    post_build: {
                        commands: [
                            "aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME",
                            'echo "  newName: $ECR_REPO_URI" >> kubernetes/kustomization.yaml',
                            'echo "  newTag: $IMAGE_TAG" >> kubernetes/kustomization.yaml',
                            'echo "  value: $API_HOST" >> kubernetes/host-patch.yaml',
                            "for res in `kubectl get ns -l saas/tenant=true -o jsonpath='{.items[*].metadata.name}'`; do \
                            cp kubernetes/svc-acc-patch-template.yaml kubernetes/svc-acc-patch.yaml && \
                            cp kubernetes/path-patch-template.yaml kubernetes/path-patch.yaml && \
                            echo \"  value: $res-service-account\" >> kubernetes/svc-acc-patch.yaml && \
                            echo \"  value: /$res/$SERVICE_URL_PREFIX\" >> kubernetes/path-patch.yaml && \
                            kubectl apply -k kubernetes/ -n $res && \
                            rm kubernetes/path-patch.yaml && rm kubernetes/svc-acc-patch.yaml; done"
                        ]
                    },
                },
            }),
        });

        sourceRepo.onCommit('OnCommit', {
            target: new targets.CodeBuildProject(project),
            branches: [
                defaultBranchName
            ]
        });

        sourceRepo.grantPull(project.role!);
        containerRepo.grantPullPush(project.role!);

        // to trigger the initial build when the repo is created
        const buildTriggerResource = new cr.AwsCustomResource(this, "ApplicationSvcIntialBuild", {
            onCreate: {
                service: "CodeBuild",
                action: "startBuild",
                parameters: {
                    projectName: project.projectName,
                },
                physicalResourceId: cr.PhysicalResourceId.of(`InitialAppSvcDeploy-${props.name}`),
                outputPaths: ["build.id", "build.buildNumber"]
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [project.projectArn] }),
        });
        buildTriggerResource.node.addDependency(project);


        // deployment project to tenant namespace on tenant onboarding
        const tenantDeployProject = new codebuild.Project(this, `${id}EKSTenantDeployProject`, {
            projectName: `${props.name}TenantDeploy`,
            source: codebuild.Source.codeCommit({ repository: sourceRepo }),
            role: props.codebuildKubectlRole,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
            },
            environmentVariables: {
                CLUSTER_NAME: {
                    value: `${props.eksClusterName}`,
                },
                ECR_REPO_URI: {
                    value: `${containerRepo.repositoryUri}`,
                },
                AWS_REGION: {
                    value: Stack.of(this).region
                },
                AWS_ACCOUNT: {
                    value: Stack.of(this).account
                },
                SEVICE_IMAGE_NAME: {
                    value: props.ecrImageName
                },
                SERVICE_URL_PREFIX: {
                    value: props.serviceUrlPrefix
                },
                TENANT_ID: {
                    value: ""
                }
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            `export API_HOST=$(echo '${props.internalApiDomain || ""}' | awk '{print tolower($0)}')`,
                            'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"',
                            'chmod +x ./kubectl',
                        ]
                    },
                    pre_build: {
                        commands: [
                        ],
                    },
                    build: {
                        commands: [
                            "aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME",
                            'echo "  newName: $ECR_REPO_URI" >> kubernetes/kustomization.yaml',
                            'echo "  newTag: latest" >> kubernetes/kustomization.yaml',
                            'echo "  value: $API_HOST" >> kubernetes/host-patch.yaml',
                            'cp kubernetes/path-patch-template.yaml kubernetes/path-patch.yaml',
                            "echo \"  value: /$TENANT_ID/$SERVICE_URL_PREFIX\" >> kubernetes/path-patch.yaml",
                            'cp kubernetes/svc-acc-patch-template.yaml kubernetes/svc-acc-patch.yaml',
                            `echo "  value: $TENANT_ID-service-account" >> kubernetes/svc-acc-patch.yaml`,
                            "kubectl apply -k kubernetes/ -n $TENANT_ID",
                        ],
                    },
                    post_build: {
                        commands: [
                        ]
                    },
                },
            }),
        });

        sourceRepo.grantPull(tenantDeployProject.role!);
        containerRepo.grantPull(tenantDeployProject.role!);
    }
}
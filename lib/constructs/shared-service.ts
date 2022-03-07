import { Construct } from "constructs";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface SharedServiceProps {
    readonly name: string
    readonly assetDirectory: string
    readonly ecrImageName: string
    readonly eksClusterName: string
    readonly apiHost: string
    readonly codebuildKubectlRole: iam.IRole

    readonly defaultBranchName?: string
}

export class SharedService extends Construct {
    readonly codeRepositoryUrl: string

    constructor(scope: Construct, id: string, props: SharedServiceProps) {
        super(scope, id);

        const defaultBranchName = props.defaultBranchName ?? "main";

        const sourceRepo = new codecommit.Repository(this, `${id}Repository`, {
            repositoryName: props.name,
            description: `Repository with code for ${props.name}`,
            code: codecommit.Code.fromDirectory(props.assetDirectory, defaultBranchName)
        });
        sourceRepo.applyRemovalPolicy(RemovalPolicy.DESTROY);
        this.codeRepositoryUrl = sourceRepo.repositoryCloneUrlHttp;

        const containerRepo = new ecr.Repository(this, `${id}ECR`, {
            repositoryName: props.ecrImageName,
            imageScanOnPush: true,
            imageTagMutability: ecr.TagMutability.MUTABLE,
            removalPolicy: RemovalPolicy.RETAIN,
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
                SEVICE_IMAGE_NAME: {
                    value: props.ecrImageName
                }
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            `export API_HOST=$(echo '${props.apiHost || ""}' | awk '{print tolower($0)}')`,
                            'export IMAGE_TAG=$CODEBUILD_RESOLVED_SOURCE_VERSION',
                            'echo $IMAGE_TAG',
                            'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"',
                            'chmod +x ./kubectl',
                        ]
                    },
                    pre_build: {
                        commands: [
                            'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO_URI',
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
                            'echo "  value: $API_HOST" >> kubernetes/host-patch.yaml',
                            'echo "  newName: $ECR_REPO_URI" >> kubernetes/kustomization.yaml',
                            'echo "  newTag: $IMAGE_TAG" >> kubernetes/kustomization.yaml',
                            "kubectl apply -k kubernetes/"
                        ]
                    },
                },
            }),
        });

        const projectTarget = new targets.CodeBuildProject(project);

        sourceRepo.onCommit("OnCommit", {
            target: projectTarget,
            branches: [
                defaultBranchName
            ]
        });
        // to trigger the initial build when the repo is created
        sourceRepo.onReferenceCreated("OnCreated", {
            target: projectTarget,
        }).addEventPattern({ detail: { referenceName: [defaultBranchName] } });

        sourceRepo.grantPull(project.role!);
        containerRepo.grantPullPush(project.role!);
    }
}
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { SourceBucket } from './source-bucket';

export interface ApplicationServiceProps {
  readonly name: string;
  readonly assetDirectory: string; // Path to service source code
  readonly ecrImageName: string;
  readonly eksClusterName: string;
  readonly codebuildKubectlRole: iam.IRole;
  readonly internalApiDomain: string;
  readonly serviceUrlPrefix: string;
}

export class ApplicationService extends Construct {
  readonly codeRepositoryUrl: string;

  constructor(scope: Construct, id: string, props: ApplicationServiceProps) {
    super(scope, id);

    // Create ECR repository for the service
    const containerRepo = new ecr.Repository(this, `${id}ECR`, {
      repositoryName: props.ecrImageName,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const containerRepoUri = containerRepo.repositoryUri;
    
    // Add custom resource to handle ECR repository deletion
    new cr.AwsCustomResource(this, 'ECRRepoDeletion', {
      onDelete: {
        service: 'ECR',
        action: 'deleteRepository',
        parameters: {
          repositoryName: containerRepo.repositoryName,
          force: true,
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [containerRepo.repositoryArn] }),
    });
    
    // Create source bucket for the service
    const sourceBucket = new SourceBucket(this, `${props.name}SourceBucket`, {
      assetDirectory: props.assetDirectory,
      name: props.name,
    });

    // Create build project for the service
    const project = new codebuild.Project(this, `${id}EKSDeployProject`, {
        projectName: `${props.name}`,
        source: sourceBucket.source,
        role: props.codebuildKubectlRole,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          privileged: true,
        },
        environmentVariables: {
          CLUSTER_NAME: {
            value: `${props.eksClusterName}`,
          },
          ECR_REPO_URI: {
            value: containerRepoUri,
          },
          AWS_REGION: {
            value: Stack.of(this).region,
          },
          AWS_ACCOUNT: {
            value: Stack.of(this).account,
          },
          SERVICE_IMAGE_NAME: {
            value: props.ecrImageName,
          },
          SERVICE_URL_PREFIX: {
            value: props.serviceUrlPrefix,
          },
        },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              `export API_HOST=$(echo '${
                props.internalApiDomain || ''
              }' | awk '{print tolower($0)}')`,
              'KUBECTL_VERSION=$(curl -L -s https://api.github.com/repos/kubernetes/kubernetes/releases/latest | grep \'"tag_name":\' | cut -d\'"\' -f4)',
              'curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"',
              'chmod +x ./kubectl',
            ],
          },
          pre_build: {
            commands: [
              'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO_URI',
              'aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws',
            ],
          },
          build: {
            commands: [
              'docker build -t $SERVICE_IMAGE_NAME:v1 .',
              'docker tag $SERVICE_IMAGE_NAME:v1 $ECR_REPO_URI:latest',
              'docker tag $SERVICE_IMAGE_NAME:v1 $ECR_REPO_URI:v1',
              'docker push $ECR_REPO_URI:latest',
              'docker push $ECR_REPO_URI:v1',
            ],
          },
          post_build: {
            commands: [
              'aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME',
              'echo "  newName: $ECR_REPO_URI" >> kubernetes/kustomization.yaml',
              'echo "  newTag: v1" >> kubernetes/kustomization.yaml',
              'echo "  value: $API_HOST" >> kubernetes/host-patch.yaml',
              'for res in `kubectl get ns -l saas/tenant=true -o jsonpath=\'{.items[*].metadata.name}\'`; do \
                            cp kubernetes/svc-acc-patch-template.yaml kubernetes/svc-acc-patch.yaml && \
                            cp kubernetes/path-patch-template.yaml kubernetes/path-patch.yaml && \
                            echo "  value: $res-service-account" >> kubernetes/svc-acc-patch.yaml && \
                            echo "  value: /$res/$SERVICE_URL_PREFIX" >> kubernetes/path-patch.yaml && \
                            kubectl apply -k kubernetes/ -n $res && \
                            rm kubernetes/path-patch.yaml && rm kubernetes/svc-acc-patch.yaml; done',
            ],
          },
        },
      }),
    });

    // Grant permissions to the build project
    containerRepo.grantPullPush(project.role!);

    // Trigger the initial build when the repo is created
    const buildTriggerResource = new cr.AwsCustomResource(this, 'ApplicationSvcIntialBuild', {
        onCreate: {
          service: 'CodeBuild',
          action: 'startBuild',
          parameters: {
            projectName: project.projectName,
          },
          physicalResourceId: cr.PhysicalResourceId.of(`InitialAppSvcDeploy-${props.name}`),
          outputPaths: ['build.id', 'build.buildNumber'],
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [project.projectArn] }),
      });
    buildTriggerResource.node.addDependency(project);

    // Deployment project to tenant namespace on tenant onboarding
    const tenantDeployProject = new codebuild.Project(this, `${id}EKSTenantDeployProject`, {
      projectName: `${props.name}TenantDeploy`,
      role: props.codebuildKubectlRole,
      source: sourceBucket.source,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        CLUSTER_NAME: {
          value: `${props.eksClusterName}`,
        },
        ECR_REPO_URI: {
          value: containerRepoUri,
        },
        AWS_REGION: {
          value: Stack.of(this).region,
        },
        AWS_ACCOUNT: {
          value: Stack.of(this).account,
        },
        SERVICE_IMAGE_NAME: {
          value: props.ecrImageName,
        },
        SERVICE_URL_PREFIX: {
          value: props.serviceUrlPrefix,
        },
        TENANT_ID: {
          value: '',
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              `export API_HOST=$(echo '${
                props.internalApiDomain || ''
              }' | awk '{print tolower($0)}')`,
              'KUBECTL_VERSION=$(curl -L -s https://api.github.com/repos/kubernetes/kubernetes/releases/latest | grep \'"tag_name":\' | cut -d\'"\' -f4)',
              'curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"',
              'chmod +x ./kubectl',
            ],
          },
          pre_build: {
            commands: [],
          },
          build: {
            commands: [
              'aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME',
              'echo "  newName: $ECR_REPO_URI" >> kubernetes/kustomization.yaml',
              'echo "  newTag: latest" >> kubernetes/kustomization.yaml',
              'echo "  value: $API_HOST" >> kubernetes/host-patch.yaml',
              'cp kubernetes/path-patch-template.yaml kubernetes/path-patch.yaml',
              'echo "  value: /$TENANT_ID/$SERVICE_URL_PREFIX" >> kubernetes/path-patch.yaml',
              'cp kubernetes/svc-acc-patch-template.yaml kubernetes/svc-acc-patch.yaml',
              `echo "  value: $TENANT_ID-service-account" >> kubernetes/svc-acc-patch.yaml`,
              'kubectl apply -k kubernetes/ -n $TENANT_ID',
            ],
          },
          post_build: {
            commands: [],
          },
        },
      }),
    });

    // Grant pull permissions to the tenant deploy project
    containerRepo.grantPull(tenantDeployProject.role!);
  }
}

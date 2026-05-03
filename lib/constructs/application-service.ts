import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { SourceBucket } from './source-bucket';

export interface ApplicationServiceProps {
  readonly name: string;
  readonly assetDirectory: string; // Path to services/application-services/
  readonly ecrImageName: string;
  readonly eksClusterName: string;
  readonly codebuildKubectlRole: iam.IRole;
  readonly serviceUrlPrefix: string;
  readonly dockerfileName: string; // e.g. Dockerfile.product
}

export class ApplicationService extends Construct {
  readonly codeRepositoryUrl: string;

  constructor(scope: Construct, id: string, props: ApplicationServiceProps) {
    super(scope, id);

    const containerRepo = new ecr.Repository(this, `${id}ECR`, {
      repositoryName: props.ecrImageName,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const containerRepoUri = containerRepo.repositoryUri;

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

    // Source bucket packages the entire services/application-services/ directory
    // CodeBuild accesses both application/ (Docker) and kubernetes/ (manifests)
    const sourceBucket = new SourceBucket(this, `${props.name}SourceBucket`, {
      assetDirectory: props.assetDirectory,
      name: props.name,
    });

    // =========================================================
    // Initial build: Docker build + deploy to all tenant namespaces
    // =========================================================
    const project = new codebuild.Project(this, `${id}EKSDeployProject`, {
      projectName: `${props.name}`,
      source: sourceBucket.source,
      role: props.codebuildKubectlRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      environmentVariables: {
        CLUSTER_NAME: { value: `${props.eksClusterName}` },
        ECR_REPO_URI: { value: containerRepoUri },
        AWS_REGION: { value: Stack.of(this).region },
        AWS_ACCOUNT: { value: Stack.of(this).account },
        SERVICE_IMAGE_NAME: { value: props.ecrImageName },
        SERVICE_URL_PREFIX: { value: props.serviceUrlPrefix },
        DOCKERFILE_NAME: { value: props.dockerfileName },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
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
              // Docker build from application/ directory using service-specific Dockerfile
              'docker build -t $SERVICE_IMAGE_NAME:v1 -f application/$DOCKERFILE_NAME application/',
              'docker tag $SERVICE_IMAGE_NAME:v1 $ECR_REPO_URI:latest',
              'docker tag $SERVICE_IMAGE_NAME:v1 $ECR_REPO_URI:v1',
              'docker push $ECR_REPO_URI:latest',
              'docker push $ECR_REPO_URI:v1',
            ],
          },
          post_build: {
            commands: [
              'aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME',
              // Append image info to kustomization
              'echo "  newName: $ECR_REPO_URI" >> kubernetes/$SERVICE_URL_PREFIX/kustomization.yaml',
              'echo "  newTag: v1" >> kubernetes/$SERVICE_URL_PREFIX/kustomization.yaml',
              // Save original service.yaml before sed modifications
              'cp kubernetes/$SERVICE_URL_PREFIX/service.yaml kubernetes/$SERVICE_URL_PREFIX/service.yaml.orig',
              // Deploy to all existing tenant namespaces
              'for res in `kubectl get ns -l saas/tenant=true -o jsonpath=\'{.items[*].metadata.name}\'`; do \
                TENANT_DATA=$(aws dynamodb get-item --table-name Tenant --key \'{"TENANT_ID":{"S":"\'$res\'"}}\' --output json --region $AWS_REGION 2>/dev/null) && \
                TENANT_PLAN=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'PLAN\',{}).get(\'S\',\'standard\'))" 2>/dev/null || echo "standard") && \
                ABAC_ROLE=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'ABAC_ROLE_ARN\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "") && \
                USER_POOL_ID=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'USER_POOL_ID\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "") && \
                if [ "$TENANT_PLAN" = "basic" ]; then ORDER_TABLE="Order"; else ORDER_TABLE="Order-$res"; fi && \
                TAG_KEYS_MAPPING=\'{"tenant":"custom:tenant-id"}\' && \
                cp kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch-template.yaml kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml && \
                echo "  value: $res-service-account" >> kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml && \
                sed -i "s|KUSTOMIZE_ORDER_TABLE_NAME|$ORDER_TABLE|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_AWS_REGION|$AWS_REGION|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_TENANT_TIER|$TENANT_PLAN|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_IAM_ROLE_ARN|$ABAC_ROLE|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_TAG_KEYS_MAPPING|$TAG_KEYS_MAPPING|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_COGNITO_USER_POOL_ID|$USER_POOL_ID|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                sed -i "s|KUSTOMIZE_TENANT_ID|$res|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                kubectl apply -k kubernetes/$SERVICE_URL_PREFIX/ -n $res && \
                cp kubernetes/$SERVICE_URL_PREFIX/service.yaml.orig kubernetes/$SERVICE_URL_PREFIX/service.yaml && \
                rm kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml; done',
            ],
          },
        },
      }),
    });

    containerRepo.grantPullPush(project.role!);

    const buildTriggerResource = new cr.AwsCustomResource(this, 'ApplicationSvcIntialBuild', {
      onCreate: {
        service: 'CodeBuild',
        action: 'startBuild',
        parameters: { projectName: project.projectName },
        physicalResourceId: cr.PhysicalResourceId.of(`InitialAppSvcDeploy-${props.name}`),
        outputPaths: ['build.id', 'build.buildNumber'],
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [project.projectArn] }),
    });
    buildTriggerResource.node.addDependency(project);

    // =========================================================
    // Tenant deploy: deploys to a specific tenant namespace
    // =========================================================
    const tenantDeployProject = new codebuild.Project(this, `${id}EKSTenantDeployProject`, {
      projectName: `${props.name}TenantDeploy`,
      role: props.codebuildKubectlRole,
      source: sourceBucket.source,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        CLUSTER_NAME: { value: `${props.eksClusterName}` },
        ECR_REPO_URI: { value: containerRepoUri },
        AWS_REGION: { value: Stack.of(this).region },
        AWS_ACCOUNT: { value: Stack.of(this).account },
        SERVICE_IMAGE_NAME: { value: props.ecrImageName },
        SERVICE_URL_PREFIX: { value: props.serviceUrlPrefix },
        TENANT_ID: { value: '' },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'KUBECTL_VERSION=$(curl -L -s https://api.github.com/repos/kubernetes/kubernetes/releases/latest | grep \'"tag_name":\' | cut -d\'"\' -f4)',
              'curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"',
              'chmod +x ./kubectl',
            ],
          },
          pre_build: {
            commands: [
              'TENANT_DATA=$(aws dynamodb get-item --table-name Tenant --key \'{"TENANT_ID":{"S":"\'$TENANT_ID\'"}}\' --output json --region $AWS_REGION 2>/dev/null)',
              'TENANT_PLAN=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'PLAN\',{}).get(\'S\',\'standard\'))" 2>/dev/null || echo "standard")',
              'ABAC_ROLE=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'ABAC_ROLE_ARN\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "")',
              'USER_POOL_ID=$(echo $TENANT_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\'Item\',{}).get(\'USER_POOL_ID\',{}).get(\'S\',\'\'))" 2>/dev/null || echo "")',
              'if [ "$TENANT_PLAN" = "basic" ]; then ORDER_TABLE="Order"; else ORDER_TABLE="Order-$TENANT_ID"; fi',
              'TAG_KEYS_MAPPING=\'{"tenant":"custom:tenant-id"}\'',
              'echo "Tenant: $TENANT_ID, Plan: $TENANT_PLAN, OrderTable: $ORDER_TABLE, ABACRole: $ABAC_ROLE"',
            ],
          },
          build: {
            commands: [
              'aws eks --region $AWS_REGION update-kubeconfig --name $CLUSTER_NAME',
              'echo "  newName: $ECR_REPO_URI" >> kubernetes/$SERVICE_URL_PREFIX/kustomization.yaml',
              'echo "  newTag: latest" >> kubernetes/$SERVICE_URL_PREFIX/kustomization.yaml',
              // Patch ServiceAccount name
              'cp kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch-template.yaml kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml',
              'echo "  value: $TENANT_ID-service-account" >> kubernetes/$SERVICE_URL_PREFIX/patches/svc-acc-patch.yaml',
              // Replace environment variable placeholders
              'sed -i "s|KUSTOMIZE_ORDER_TABLE_NAME|$ORDER_TABLE|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
              'sed -i "s|KUSTOMIZE_AWS_REGION|$AWS_REGION|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
              'sed -i "s|KUSTOMIZE_TENANT_TIER|$TENANT_PLAN|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
              'sed -i "s|KUSTOMIZE_IAM_ROLE_ARN|$ABAC_ROLE|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
              'sed -i "s|KUSTOMIZE_TAG_KEYS_MAPPING|$TAG_KEYS_MAPPING|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
              'sed -i "s|KUSTOMIZE_COGNITO_USER_POOL_ID|$USER_POOL_ID|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
              'sed -i "s|KUSTOMIZE_TENANT_ID|$TENANT_ID|g" kubernetes/$SERVICE_URL_PREFIX/service.yaml',
              // Apply to tenant namespace
              'kubectl apply -k kubernetes/$SERVICE_URL_PREFIX/ -n $TENANT_ID',
            ],
          },
          post_build: {
            commands: [],
          },
        },
      }),
    });

    containerRepo.grantPull(tenantDeployProject.role!);
  }
}

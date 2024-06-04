import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { ApplicationService } from './constructs/application-service';
import { TenantOnboarding } from './constructs/tenant-onboarding';

export interface ServicesStackProps extends StackProps {
  readonly eksClusterOIDCProviderArn: string;
  readonly internalNLBApiDomain: string;
  readonly eksClusterName: string;
  readonly codebuildKubectlRoleArn: string;
  readonly appSiteDistributionId: string;
  readonly appSiteCloudFrontDomain: string;
  readonly sharedServiceAccountName: string;
  readonly appHostedZoneId?: string;
  readonly customDomain?: string;
  readonly defaultBranchName: string;
}

export class ServicesStack extends Stack {
  constructor(scope: Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);

    const role = iam.Role.fromRoleArn(this, 'CodebuildKubectlRole', props.codebuildKubectlRoleArn);

    // application services
    const productSvc = new ApplicationService(this, 'ProductService', {
      internalApiDomain: props.internalNLBApiDomain,
      eksClusterName: props.eksClusterName,
      codebuildKubectlRole: role,
      name: 'ProductService',
      ecrImageName: 'product-svc',
      serviceUrlPrefix: 'products',
      assetDirectory: path.join(
        __dirname,
        '..',
        'services',
        'application-services',
        'product-service'
      ),
    });
    new CfnOutput(this, 'ProductServiceRepository', {
      value: productSvc.codeRepositoryUrl,
    });

    const orderSvc = new ApplicationService(this, 'OrderService', {
      internalApiDomain: props.internalNLBApiDomain,
      eksClusterName: props.eksClusterName,
      codebuildKubectlRole: role,
      name: 'OrderService',
      ecrImageName: 'order-svc',
      serviceUrlPrefix: 'orders',
      assetDirectory: path.join(
        __dirname,
        '..',
        'services',
        'application-services',
        'order-service'
      ),
    });
    new CfnOutput(this, 'OrderServiceRepository', {
      value: orderSvc.codeRepositoryUrl,
    });

    const onboardingSvc = new TenantOnboarding(this, 'TenantOnboarding', {
      appSiteCloudFrontDomain: props.appSiteCloudFrontDomain,
      appSiteDistributionId: props.appSiteDistributionId,
      codebuildKubectlRole: role,
      eksClusterOIDCProviderArn: props.eksClusterOIDCProviderArn,
      eksClusterName: props.eksClusterName,
      applicationServiceBuildProjectNames: ['ProductService', 'OrderService'],
      onboardingProjectName: 'TenantOnboardingProject',
      deletionProjectName: 'TenantDeletionProject',
      appSiteHostedZoneId: props.appHostedZoneId,
      appSiteCustomDomain: props.customDomain ? `app.${props.customDomain!}` : undefined,
      assetDirectory: path.join(__dirname, '..', 'services', 'tenant-onboarding'),
      defaultBranchName: props.defaultBranchName,
    });

    new CfnOutput(this, 'TenantOnboardingRepository', {
      value: onboardingSvc.repositoryUrl,
    });
  }
}

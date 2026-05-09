import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import * as fs from 'fs';
import { ApplicationService } from './constructs/application-service';
import { TenantOnboarding } from './constructs/tenant-onboarding';

/**
 * Service definition interface for JSON configuration
 */
interface ServiceDefinition {
  name: string;
  ecrImageName: string;
  serviceUrlPrefix: string;
  assetDirectory: string;
  dockerfileName: string;
  /**
   * Optional map of service-specific env vars (ECS parity: sbt-04
   * `environment` map). Values support the `<APP_SITE_URL>` placeholder
   * which is resolved at CodeBuild pre_build time from the StaticSites
   * stack's `ApplicationSiteUrl` output.
   */
  environment?: Record<string, string>;
}

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
}

export class ServicesStack extends Stack {
  constructor(scope: Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);

    const role = iam.Role.fromRoleArn(this, 'CodebuildKubectlRole', props.codebuildKubectlRoleArn);

    // Load service definitions from services.json
    const serviceDefinitions: ServiceDefinition[] = [];
    const servicesJsonPath = path.join(__dirname, '..', 'services.json');
    const templatePath = path.join(__dirname, '..', 'services-template.json');
    
    // Determine which file to use
    let configPath = fs.existsSync(servicesJsonPath) ? servicesJsonPath : templatePath;
    
    // If neither file exists, use default services
    if (!fs.existsSync(configPath)) {
      // Default services if no configuration file is found
      const appServicesDir = path.join(__dirname, '..', 'services', 'application-services');

      serviceDefinitions.push({
        name: 'ProductService',
        ecrImageName: 'product-svc',
        serviceUrlPrefix: 'products',
        assetDirectory: appServicesDir,
        dockerfileName: 'Dockerfile.product',
      });
      
      serviceDefinitions.push({
        name: 'OrderService',
        ecrImageName: 'order-svc',
        serviceUrlPrefix: 'orders',
        assetDirectory: appServicesDir,
        dockerfileName: 'Dockerfile.order',
      });
    } else {
      // Read and process the configuration file
      const fileContent = fs.readFileSync(configPath, 'utf8');
      
      // Replace AWS account and region placeholders
      const processedContent = fileContent
        .replace(/\$\{AWS_ACCOUNT\}/g, Stack.of(this).account)
        .replace(/\$\{AWS_REGION\}/g, Stack.of(this).region);
      
      try {
        const config = JSON.parse(processedContent);
        if (config.services && Array.isArray(config.services)) {
          config.services.forEach((service: any) => {
            serviceDefinitions.push({
              name: service.name,
              ecrImageName: service.ecrImageName,
              serviceUrlPrefix: service.serviceUrlPrefix,
              assetDirectory: path.join(__dirname, '..', service.assetDirectory),
              dockerfileName: service.dockerfileName || `Dockerfile.${service.serviceUrlPrefix}`,
              environment: service.environment,
            });
          });
        }
      } catch (error) {
        console.error(`Error parsing service configuration: ${error}`);
      }
    }
    
    // Create services from the collected definitions
    serviceDefinitions.forEach(service => {
      new ApplicationService(this, service.name, {
        eksClusterName: props.eksClusterName,
        codebuildKubectlRole: role,
        name: service.name,
        ecrImageName: service.ecrImageName,
        serviceUrlPrefix: service.serviceUrlPrefix,
        assetDirectory: service.assetDirectory,
        dockerfileName: service.dockerfileName,
        // Req 2.4: only ProductService receives CDK_USE_DB + the per-backend
        // pre_build `cp -r` step. OrderService / UserService keep their
        // existing buildspec byte-identical (their backends are fixed).
        productDbSwitching: service.name === 'ProductService',
        environment: service.environment,
      });
    });

    // ================================================================
    // TenantOnboarding wires each service's per-tenant deploy CodeBuild
    // into the SBT ApplicationPlane event flow. The service name list
    // drives the `${ServiceName}TenantDeploy` loop inside
    // `TenantOnboardingProject`.
    // ================================================================
    const serviceNames = serviceDefinitions.map((service) => service.name);

    new TenantOnboarding(this, 'TenantOnboarding', {
      appSiteCloudFrontDomain: props.appSiteCloudFrontDomain,
      appSiteDistributionId: props.appSiteDistributionId,
      codebuildKubectlRole: role,
      eksClusterOIDCProviderArn: props.eksClusterOIDCProviderArn,
      eksClusterName: props.eksClusterName,
      applicationServiceBuildProjectNames: serviceNames,
      onboardingProjectName: 'TenantOnboardingProject',
      deletionProjectName: 'TenantDeletionProject',
      appSiteHostedZoneId: props.appHostedZoneId,
      appSiteCustomDomain: props.customDomain ? `app.${props.customDomain!}` : undefined,
      assetDirectory: path.join(__dirname, '..', 'services', 'tenant-onboarding'),
    });

    // Req 8.3 — one-way-door guard for scripts/install.sh. The script
    // reads this SSM parameter on subsequent runs and aborts if the
    // operator selects a DB_TYPE different from what was recorded here.
    // Owned by the Services stack so `cdk destroy` / scripts/cleanup.sh
    // removes it automatically and the next install re-prompts without
    // short-circuiting on a stale value.
    new ssm.StringParameter(this, 'CdkUseDbParam', {
      parameterName: '/eks-saas-ref/cdk-use-db',
      stringValue: process.env.CDK_USE_DB ?? 'dynamodb',
      description:
        'One-way-door guard for install.sh — written by Services stack on first '
        + 'deploy; cleanup.sh removes it so next install re-prompts.',
    });
  }
}

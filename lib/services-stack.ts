import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
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
      serviceDefinitions.push({
        name: 'ProductService',
        ecrImageName: 'product-svc',
        serviceUrlPrefix: 'products',
        assetDirectory: path.join(__dirname, '..', 'services', 'application-services', 'product-service')
      });
      
      serviceDefinitions.push({
        name: 'OrderService',
        ecrImageName: 'order-svc',
        serviceUrlPrefix: 'orders',
        assetDirectory: path.join(__dirname, '..', 'services', 'application-services', 'order-service')
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
              assetDirectory: path.join(__dirname, '..', service.assetDirectory)
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
        internalApiDomain: props.internalNLBApiDomain,
        eksClusterName: props.eksClusterName,
        codebuildKubectlRole: role,
        name: service.name,
        ecrImageName: service.ecrImageName,
        serviceUrlPrefix: service.serviceUrlPrefix,
        assetDirectory: service.assetDirectory
      });
    });

    // Get service names for tenant onboarding from the collected definitions
    const serviceNames = serviceDefinitions.map(service => service.name);
    
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
  }
}

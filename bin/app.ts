#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EKSClusterStack } from '../lib/eks-cluster-stack';
import { StaticSitesStack } from '../lib/static-sites-stack';
import { ServicesStack } from '../lib/services-stack';
import { CommonResourcesStack } from '../lib/common-resources-stack';
import { ApiStack } from '../lib/api-stack';
import { ControlPlaneStack } from '../lib/control-plane-stack';
import { AppPlaneStack } from '../lib/app-plane-stack';
import { SharedDbStack } from '../lib/shared-db-stack';

const env = {
  account: process.env.AWS_ACCOUNT,
  region: process.env.AWS_REGION,
};

const clusterName = 'EKSSaaS';
const ingressControllerName = 'controller';
const tenantOnboardingProjectName = 'TenantOnboardingProject';
const tenantDeletionProjectName = 'TenantDeletionProject';
const sharedServiceAccountName = 'shared-service-account';

const customDomain =
  process.env.npm_config_domain && process.env.npm_config_domain.length > 0
    ? process.env.npm_config_domain
    : undefined;
const hostedZoneId =
  process.env.npm_config_hostedzone && process.env.npm_config_hostedzone.length > 0
    ? process.env.npm_config_hostedzone
    : undefined;
const saasAdminEmail = process.env.npm_config_email!;
const kubecostToken =
  process.env.npm_config_kubecosttoken && process.env.npm_config_kubecosttoken.length > 0
    ? process.env.npm_config_kubecosttoken
    : undefined;

const app = new cdk.App();

const clusterStack = new EKSClusterStack(app, 'EKSSaaSCluster', {
  env,
  clusterName: clusterName,
  ingressControllerName: ingressControllerName,
  tenantOnboardingProjectName: tenantOnboardingProjectName,
  tenantDeletionProjectName: tenantDeletionProjectName,
  sharedServiceAccountName: sharedServiceAccountName,
  kubecostToken: kubecostToken,
  customDomain: customDomain,
  hostedZoneId: hostedZoneId,
});

const controlPlaneStack = new ControlPlaneStack(app, 'ControlPlane', {
  env,
  systemAdminEmail: saasAdminEmail,
});

new AppPlaneStack(app, 'ApplicationPlane', {
  env,
  eventBusArn: controlPlaneStack.eventBusArn,
});

const apiStack = new ApiStack(app, 'SaaSApi', {
  env,
  eksClusterName: clusterName,
  ingressControllerName: ingressControllerName,
  internalNLBDomain: clusterStack.nlbDomain,
  vpc: clusterStack.vpc,
  customDomain: customDomain,
  hostedZoneId: hostedZoneId,
});

const sitesStack = new StaticSitesStack(app, 'StaticSites', {
  env,
  apiUrl: apiStack.apiUrl,
  controlPlaneUrl: controlPlaneStack.controlPlaneUrl,
  authorizationServer: controlPlaneStack.authorizationServer,
  wellKnownEndpointUrl: controlPlaneStack.wellKnownEndpointUrl,
  clientId: controlPlaneStack.clientId,
  hostedZoneId: hostedZoneId,
  customBaseDomain: customDomain,
  usingKubeCost: !!kubecostToken,
});

const commonResource = new CommonResourcesStack(app, 'CommonResources', {
  env,
});

// SharedDbStack is synthesised ONLY when CDK_USE_DB=postgresql. On the
// default DynamoDB path no Aurora / RDS Proxy / schema-provisioner Lambda
// resources appear in the synth output at all (Req 4.1).
const useDb = (process.env.CDK_USE_DB ?? 'dynamodb').toLowerCase();
let sharedDbStack: SharedDbStack | undefined;
if (useDb === 'postgresql') {
  sharedDbStack = new SharedDbStack(app, 'SharedDb', {
    env,
    vpc: clusterStack.vpc,
  });
}

const svcStack = new ServicesStack(app, 'Services', {
  env,
  internalNLBApiDomain: clusterStack.nlbDomain,
  eksClusterName: clusterName,
  eksClusterOIDCProviderArn: clusterStack.openIdConnectProviderArn,
  codebuildKubectlRoleArn: clusterStack.codebuildKubectlRoleArn,
  appSiteDistributionId: sitesStack.applicationSiteDistribution.distributionId,
  appSiteCloudFrontDomain: sitesStack.applicationSiteDistribution.distributionDomainName,
  sharedServiceAccountName: sharedServiceAccountName,
  appHostedZoneId: hostedZoneId,
  customDomain: customDomain,
});

// Ensure SharedDbStack deploys before any tenant onboarding CodeBuild
// project runs — otherwise the per-tenant `cdk deploy TenantStack-*`
// call would fail to resolve the `SharedDb-*` Fn::ImportValue lookups
// (Req 4.2, 5.8).
if (sharedDbStack) {
  svcStack.addDependency(sharedDbStack);
}

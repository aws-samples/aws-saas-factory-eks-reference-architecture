#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EKSClusterStack } from '../lib/eks-cluster-stack';
import { StaticSitesStack } from '../lib/static-sites-stack';
import { ServicesStack } from '../lib/services-stack';
import { CommonResourcesStack } from '../lib/common-resources-stack';

const env = {
    account: process.env.AWS_ACCOUNT,
    region: process.env.AWS_REGION
};

const clusterName = "EKSSaaS";
const tenantOnboardingProjectName = "TenantOnboardingProject";
const tenantDeletionProjectName = "TenantDeletionProject";

const customDomain = process.env.npm_config_domain && process.env.npm_config_domain.length > 0 ? process.env.npm_config_domain : undefined;
const hostedZoneId = process.env.npm_config_hostedzone && process.env.npm_config_hostedzone.length > 0 ? process.env.npm_config_hostedzone : undefined;
const saasAdminEmail = process.env.npm_config_email!;

const app = new cdk.App();

const clusterStack = new EKSClusterStack(app, 'EKSSaaSCluster', {
    env,
    clusterName: clusterName,
    tenantOnboardingProjectName: tenantOnboardingProjectName,
    tenantDeletionProjectName: tenantDeletionProjectName,
    customDomain: customDomain,
    hostedZoneId: hostedZoneId
});

const sitesStack = new StaticSitesStack(app, 'StaticSites', {
    env,
    apiDomain: clusterStack.apiDomain,
    saasAdminEmail: saasAdminEmail,
    hostedZoneId: hostedZoneId,
    customBaseDomain: customDomain,
});

new CommonResourcesStack(app, 'CommonResources', {
    env,
    seedData: {
        appCloudFrontId: sitesStack.applicationSiteDistribution.distributionId,
        appSiteDomain: customDomain ? `app.${customDomain!}` : sitesStack.applicationSiteDistribution.domainName,
        appHostedZoneId: hostedZoneId,
    }
})

const svcStack = new ServicesStack(app, 'Services', {
    env,
    apiHost: clusterStack.apiDomain,
    eksClusterName: clusterName,
    eksClusterOIDCProviderArn: clusterStack.openIdConnectProviderArn,
    codebuildKubectlRoleArn: clusterStack.codebuildKubectlRoleArn,
    appSiteDistributionId: sitesStack.applicationSiteDistribution.distributionId,
    appSiteCloudFrontDomain: sitesStack.applicationSiteDistribution.distributionDomainName,
    appHostedZoneId: hostedZoneId,
    customDomain: customDomain,
});
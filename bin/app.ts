#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EKSClusterStack } from '../lib/eks-cluster-stack';
import { StaticSitesStack } from '../lib/static-sites-stack';
import { ServicesStack } from '../lib/services-stack';
import { CommonResourcesStack } from '../lib/common-resources-stack';
import { ApiStack } from '../lib/api-stack';

const env = {
    account: process.env.AWS_ACCOUNT,
    region: process.env.AWS_REGION
};

const clusterName = "EKSSaaS";
const ingressControllerName = "saasnginxingressctrl";
const tenantOnboardingProjectName = "TenantOnboardingProject";
const tenantDeletionProjectName = "TenantDeletionProject";
const sharedServiceAccountName = "shared-service-account";

const customDomain = process.env.npm_config_domain && process.env.npm_config_domain.length > 0 ? process.env.npm_config_domain : undefined;
const hostedZoneId = process.env.npm_config_hostedzone && process.env.npm_config_hostedzone.length > 0 ? process.env.npm_config_hostedzone : undefined;
const saasAdminEmail = process.env.npm_config_email!;
const kubecostToken = process.env.npm_config_kubecosttoken && process.env.npm_config_kubecosttoken.length > 0 ? process.env.npm_config_kubecosttoken : undefined;

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
    hostedZoneId: hostedZoneId
});

const apiStack = new ApiStack(app, 'SaaSApi', {
    env,
    eksClusterName: clusterName,
    ingressControllerName: ingressControllerName,
    internalNLBDomain: clusterStack.nlbDomain,
    vpc: clusterStack.vpc,
    customDomain: customDomain,
    hostedZoneId: hostedZoneId
});

const sitesStack = new StaticSitesStack(app, 'StaticSites', {
    env,
    apiUrl: apiStack.apiUrl,
    saasAdminEmail: saasAdminEmail,
    hostedZoneId: hostedZoneId,
    customBaseDomain: customDomain,
    usingKubeCost: !!kubecostToken,
});

const commonResource = new CommonResourcesStack(app, 'CommonResources', {
    env,
});

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
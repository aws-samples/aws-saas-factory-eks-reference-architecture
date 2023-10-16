#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TenantOnboardingStack } from '../lib/tenant-onboarding-stack';

const env = {
  account: process.env.AWS_ACCOUNT,
  region: process.env.AWS_REGION
};

const appCustomDomain = process.env.APP_SITE_CUSTOM_DOMAIN && process.env.APP_SITE_CUSTOM_DOMAIN.length > 0 ? process.env.APP_SITE_CUSTOM_DOMAIN : undefined;
const appHostedZoneId = process.env.APP_SITE_HOSTED_ZONE && process.env.APP_SITE_HOSTED_ZONE.length > 0 ? process.env.APP_SITE_HOSTED_ZONE : undefined;


const app = new cdk.App();

new TenantOnboardingStack(app, `TenantStack-${process.env.TENANT_ID}`, {
  env,
  plan: process.env.PLAN!,
  tenantid: process.env.TENANT_ID!,
  customDomain: appCustomDomain,
  hostedZoneId: appHostedZoneId,
});
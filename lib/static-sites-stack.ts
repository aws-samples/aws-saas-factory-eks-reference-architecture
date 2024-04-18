import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { StaticSite } from './constructs/static-site';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';

export interface StaticSitesStackProps extends StackProps {
  readonly apiUrl: string;
  readonly controlPlaneUrl: string;
  // readonly saasAdminEmail: string;

  readonly usingKubeCost: boolean;
  readonly clientId?: string;
  readonly authorizationServer?: string;
  readonly wellKnownEndpointUrl?: string;
  readonly customBaseDomain?: string;
  readonly hostedZoneId?: string;
  readonly defaultBranchName: string;
}

export class StaticSitesStack extends Stack {
  readonly applicationSiteDistribution: Distribution;

  constructor(scope: Construct, id: string, props: StaticSitesStackProps) {
    super(scope, id, props);

    const useCustomDomain = props.customBaseDomain ? true : false;
    if (useCustomDomain && !props.hostedZoneId) {
      throw new Error(
        'HostedZoneId must be specified when using a custom domain for static sites.'
      );
    }

    const hostedZone = useCustomDomain
      ? route53.PublicHostedZone.fromHostedZoneAttributes(this, 'PublicHostedZone', {
          hostedZoneId: props.hostedZoneId!,
          zoneName: props.customBaseDomain!,
        })
      : undefined;

    // Admin site
    const adminSite = new StaticSite(this, 'AdminSite', {
      name: 'AdminSite',
      project: 'Admin',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients'),
      allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
      siteConfigurationGenerator: (siteDomain) => ({
        production: true,
        clientId: props.clientId!,
        authServer: props.authorizationServer!,
        wellKnownEndpointUrl: props.wellKnownEndpointUrl!,
        apiUrl: props.controlPlaneUrl,
        domain: siteDomain,
        usingCustomDomain: useCustomDomain,
        usingKubeCost: props.usingKubeCost,
        kubecostUI: props.usingKubeCost ? `${props.apiUrl}/kubecost` : '',
      }),
      customDomain: useCustomDomain ? `admin.${props.customBaseDomain!}` : undefined,
      hostedZone: hostedZone,
      defaultBranchName: props.defaultBranchName,
    });
    new CfnOutput(this, `AdminSiteRepository`, {
      value: adminSite.repositoryUrl,
    });
    new CfnOutput(this, `AdminSiteUrl`, {
      value: `https://${adminSite.siteDomain}`,
    });

    // Application site
    const applicationSite = new StaticSite(this, 'ApplicationSite', {
      name: 'ApplicationSite',
      project: 'Application',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients'),
      allowedMethods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
      siteConfigurationGenerator: (siteDomain) => ({
        production: true,
        apiUrl: props.apiUrl,
        controlPlaneUrl: props.controlPlaneUrl,
        domain: siteDomain,
        usingCustomDomain: useCustomDomain,
      }),
      customDomain: useCustomDomain ? `app.${props.customBaseDomain!}` : undefined,
      certDomain: useCustomDomain ? `*.app.${props.customBaseDomain!}` : undefined,
      hostedZone: hostedZone,
      defaultBranchName: props.defaultBranchName,
    });

    this.applicationSiteDistribution = applicationSite.cloudfrontDistribution;
    new CfnOutput(this, `ApplicationSiteRepository`, {
      value: applicationSite.repositoryUrl,
    });
  }
}

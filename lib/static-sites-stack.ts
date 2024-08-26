import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import * as path from 'path';
import { StaticSite } from './constructs/static-site';
import { SourceBucket } from './constructs/source-bucket';

export interface StaticSitesStackProps extends StackProps {
  readonly apiUrl: string;
  readonly controlPlaneUrl: string;

  readonly usingKubeCost: boolean;
  readonly clientId?: string;
  readonly authorizationServer?: string;
  readonly wellKnownEndpointUrl?: string;
  readonly customBaseDomain?: string;
  readonly hostedZoneId?: string;
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

    const sourceBucket = new SourceBucket(this, 'static-sites-source', {
      name: 'static-sites-source',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients'),
      excludes: ['node_modules', '.vscode', 'dist', '.angular'],
    });

    // Admin site
    const adminSite = new StaticSite(this, 'AdminSite', {
      name: 'AdminSite',
      sourceBucket,
      project: 'Admin',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients'),
      allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
      siteConfigurationGenerator: (siteDomain) => ({
        apiUrl: props.controlPlaneUrl,
        authServer: props.authorizationServer!,
        clientId: props.clientId!,
        domain: siteDomain,
        kubecostUI: props.usingKubeCost ? `${props.apiUrl}/kubecost` : '',
        production: true,
        usingCustomDomain: useCustomDomain,
        usingKubeCost: props.usingKubeCost,
        wellKnownEndpointUrl: props.wellKnownEndpointUrl!,
      }),
      customDomain: useCustomDomain ? `admin.${props.customBaseDomain!}` : undefined,
      hostedZone: hostedZone,
    });
    new CfnOutput(this, `AdminSiteUrl`, {
      value: `https://${adminSite.siteDomain}`,
    });

    // Application site
    const applicationSite = new StaticSite(this, 'ApplicationSite', {
      name: 'ApplicationSite',
      sourceBucket,
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
    });

    this.applicationSiteDistribution = applicationSite.cloudfrontDistribution;
    new CfnOutput(this, 'ApplicationSiteUrl', {
      value: `https://${applicationSite.siteDomain}`,
    });
  }
}

import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { CloudFrontWebDistribution } from 'aws-cdk-lib/aws-cloudfront';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import * as path from 'path';
import { S3Site } from './constructs/s3-site';

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
  readonly applicationSiteDistribution: CloudFrontWebDistribution;

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
    const adminSite = new S3Site(this, 'AdminSite', {
      project: 'Admin',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients'),
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
    const applicationSite = new S3Site(this, 'ApplicationSite', {
      project: 'Application',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients'),
      siteConfigurationGenerator: (siteDomain) => ({
        apiUrl: props.apiUrl,
        controlPlaneUrl: props.controlPlaneUrl,
        domain: siteDomain,
        production: true,
        usingCustomDomain: useCustomDomain,
      }),
      customDomain: useCustomDomain ? `app.${props.customBaseDomain!}` : undefined,
      certDomain: useCustomDomain ? `*.app.${props.customBaseDomain!}` : undefined,
      hostedZone: hostedZone,
    });

    this.applicationSiteDistribution = applicationSite.webDistribution;
    new CfnOutput(this, 'ApplicationSiteUrl', {
      value: `https://${applicationSite.siteDomain}`,
    });
  }
}

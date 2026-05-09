import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import * as fs from 'fs';
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

    const adminSourceBucket = new SourceBucket(this, 'admin-source', {
      name: 'admin-source',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients', 'AdminWeb'),
      excludes: ['node_modules', '.vscode', 'build'],
    });

    const appSourceBucket = new SourceBucket(this, 'app-source', {
      name: 'app-source',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients', 'Application'),
      excludes: ['node_modules', '.vscode', 'build'],
    });

    // Admin site
    const adminSite = new StaticSite(this, 'AdminSite', {
      name: 'AdminSite',
      sourceBucket: adminSourceBucket,
      project: 'Admin',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients', 'AdminWeb'),
      allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
      siteConfigurationGenerator: (siteDomain) => ({
        controlPlaneUrl: props.controlPlaneUrl,
        issuer: props.authorizationServer!,
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
    //
    // `environment.services` is sourced from services-template.json (or
    // services.json if the operator maintains a local override). The CDK
    // parses it at synth time and the static-sites buildspec bakes the
    // names into `src/config/environment.ts`. The Application Dashboard
    // uses this array to render an SSO "Open" button per service — adding
    // a service is a single-line edit in services-template.json.
    //
    // If neither file exists, `services` becomes an empty array and the
    // Dashboard renders its fallback "No registered services" message.
    const serviceNames = this.resolveRegisteredServiceNames();

    const applicationSite = new StaticSite(this, 'ApplicationSite', {
      name: 'ApplicationSite',
      sourceBucket: appSourceBucket,
      project: 'Application',
      assetDirectory: path.join(path.dirname(__filename), '..', 'clients', 'Application'),
      allowedMethods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
      siteConfigurationGenerator: (siteDomain) => ({
        production: true,
        apiUrl: props.apiUrl,
        controlPlaneUrl: props.controlPlaneUrl,
        domain: siteDomain,
        usingCustomDomain: useCustomDomain,
        services: serviceNames,
      }),
      customDomain: useCustomDomain ? `app.${props.customBaseDomain!}` : undefined,
      certDomain: useCustomDomain ? `*.app.${props.customBaseDomain!}` : undefined,
      hostedZone: hostedZone,
    });

    this.applicationSiteDistribution = applicationSite.cloudfrontDistribution;
    new CfnOutput(this, 'ApplicationSiteUrl', {
      value: `https://${applicationSite.siteDomain}`,
    });

    // Static assets for SSR backends (if any) are uploaded under a
    // per-service prefix on this same S3 + CloudFront pair by
    // `scripts/upload-static.sh`. Consumers read these outputs to
    // resolve bucket / distribution / domain without hard-coding names.
    new CfnOutput(this, 'ApplicationSiteBucketName', {
      value: applicationSite.siteBucket.bucketName,
      description: 'Application SPA + SSR static assets S3 bucket. Used by upload-static.sh.',
      exportName: 'ApplicationSiteBucketName',
    });
    new CfnOutput(this, 'ApplicationSiteDistributionId', {
      value: applicationSite.cloudfrontDistribution.distributionId,
      description: 'Application CloudFront distribution id. Used by upload-static.sh for cache invalidation.',
      exportName: 'ApplicationSiteDistributionId',
    });
    new CfnOutput(this, 'ApplicationSiteDomain', {
      value: applicationSite.siteDomain,
      description: 'CloudFront domain (or custom domain) serving Application SPA + SSR static assets.',
      exportName: 'ApplicationSiteDomain',
    });
  }

  /**
   * Read `services-template.json` (or the operator's local `services.json`
   * override) and return the list of service names. Matches the resolution
   * order used by `lib/services-stack.ts` so both stacks see the same
   * service registry at synth time.
   *
   * Returns an empty array if neither file is present — the Application
   * Dashboard then renders the "no registered services" fallback.
   */
  private resolveRegisteredServiceNames(): string[] {
    const repoRoot = path.join(path.dirname(__filename), '..');
    const candidates = [
      path.join(repoRoot, 'services.json'),
      path.join(repoRoot, 'services-template.json'),
    ];

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const raw = fs.readFileSync(candidate, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed?.services || !Array.isArray(parsed.services)) continue;
        return parsed.services
          .map((svc: any) => svc?.serviceUrlPrefix ?? svc?.name)
          .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0);
      } catch (err) {
        console.warn(`[StaticSitesStack] Failed to parse ${candidate}:`, err);
      }
    }
    return [];
  }
}

import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as alias from 'aws-cdk-lib/aws-route53-targets';

export interface StaticSiteProps {
  readonly name: string;
  readonly project: string;
  readonly assetDirectory: string;
  readonly allowedMethods: string[];
  readonly siteConfigurationGenerator: (
    siteDomain: string
  ) => Record<string, string | number | boolean>;

  readonly customDomain?: string;
  readonly certDomain?: string;
  readonly hostedZone?: route53.IHostedZone;
  readonly defaultBranchName?: string;
  readonly cognitoProps?: {
    adminUserEmail: string;
    emailSubjectGenerator?: (siteName: string) => string;
    emailBodyGenerator?: (siteDomain: string) => string;
  };
}

const defaultEmailSubjectGenerator = (siteName: string) => `${siteName} User Created`;
const defaultEmailBodyGenerator = (siteDomain: string) =>
  `Your username is {username} and temporary password is {####}. Please login here: https://${siteDomain}`;

export class StaticSite extends Construct {
  readonly repositoryUrl: string;
  readonly siteDomain: string;
  readonly cloudfrontDistribution: cloudfront.Distribution;
  readonly siteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StaticSiteProps) {
    super(scope, id);

    const defaultBranchName = props.defaultBranchName ?? 'main';
    const useCustomDomain = props.customDomain ? true : false;

    if (useCustomDomain && !props.hostedZone) {
      throw new Error(`HostedZone cannot be empty for the custom domain '${props.customDomain}'`);
    }

    const repository = new codecommit.Repository(this, `${id}Repository`, {
      repositoryName: props.name,
      description: `Repository with code for ${props.name}`,
      code: codecommit.Code.fromDirectory(props.assetDirectory, defaultBranchName),
    });
    repository.applyRemovalPolicy(RemovalPolicy.DESTROY);
    this.repositoryUrl = repository.repositoryCloneUrlHttp;

    const { distribution, appBucket } = this.createStaticSite(
      id,
      props.allowedMethods,
      useCustomDomain,
      props.customDomain,
      props.certDomain,
      props.hostedZone
    );
    this.cloudfrontDistribution = distribution;
    this.siteBucket = appBucket;
    this.siteDomain = useCustomDomain ? props.customDomain! : distribution.domainName;

    const siteConfig = props.siteConfigurationGenerator(this.siteDomain);

    this.createCICDForStaticSite(
      id,
      props.project,
      repository,
      defaultBranchName,
      distribution.distributionId,
      siteConfig,
      appBucket
    );
  }

  private createStaticSite(
    id: string,
    allowedMethods: string[],
    useCustomDomain: boolean,
    customDomain?: string,
    certDomain?: string,
    hostedZone?: route53.IHostedZone
  ) {
    const oai = new cloudfront.OriginAccessIdentity(this, `${id}OriginAccessIdentity`, {
      comment: 'Special CloudFront user to fetch S3 contents',
    });

    let siteCertificate = undefined;
    let domainNamesToUse = undefined;

    if (useCustomDomain) {
      siteCertificate = new acm.DnsValidatedCertificate(this, `${id}Certificate`, {
        domainName: certDomain ?? customDomain!,
        hostedZone: hostedZone!,
        region: 'us-east-1',
      });

      domainNamesToUse = new Array<string>(certDomain ?? customDomain!);
    }

    const appBucket = new s3.Bucket(this, `${id}Bucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    appBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        resources: [appBucket.arnForObjects('*')],
        actions: ['s3:GetObject'],
        principals: [
          new iam.CanonicalUserPrincipal(oai.cloudFrontOriginAccessIdentityS3CanonicalUserId),
        ],
      })
    );

    const distribution = new cloudfront.Distribution(this, `${id}Distribution`, {
      defaultBehavior: {
        origin: new origins.S3Origin(appBucket, {
          originAccessIdentity: oai,
        }),
        allowedMethods: { methods: allowedMethods },
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,

        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      certificate: siteCertificate,
      defaultRootObject: 'index.html',
      domainNames: domainNamesToUse,
      enabled: true,
      errorResponses: [
        // Needed to support angular routing
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      httpVersion: cloudfront.HttpVersion.HTTP2,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2018,
    });

    if (useCustomDomain) {
      new route53.ARecord(this, `${id}AliasRecord`, {
        zone: hostedZone!,
        recordName: certDomain ?? customDomain!,
        target: route53.RecordTarget.fromAlias(new alias.CloudFrontTarget(distribution)),
      });
    }

    return { distribution, appBucket };
  }

  private createCICDForStaticSite(
    id: string,
    project: string,
    repo: codecommit.Repository,
    branchName: string,
    cloudfrontDistributionId: string,
    siteConfig: Record<string, string | number | boolean>,
    bucket: s3.Bucket
  ) {
    const pipeline = new codepipeline.Pipeline(this, `${id}CodePipeline`, {
      pipelineType: codepipeline.PipelineType.V2,
      crossAccountKeys: false,
      artifactBucket: new s3.Bucket(this, `${id}CodePipelineBucket`, {
        autoDeleteObjects: true,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    const sourceArtifact = new codepipeline.Artifact();

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new actions.CodeCommitSourceAction({
          actionName: 'Checkout',
          repository: repo,
          output: sourceArtifact,
          branch: branchName,
        }),
      ],
    });

    const buildProject = new codebuild.PipelineProject(this, `${id}AngularBuildProject`, {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: ['npm install'],
          },
          build: {
            commands: [
              `echo 'export const environment = ${JSON.stringify(
                siteConfig
              )}' > ./projects/${project.toLowerCase()}/src/environments/environment.development.ts`,
              `echo 'export const environment = ${JSON.stringify(
                siteConfig
              )}' > ./projects/${project.toLowerCase()}/src/environments/environment.ts`,
              `npm run build ${project}`,
            ],
          },
        },
        artifacts: {
          files: ['**/*'],
          'base-directory': `dist/${project.toLowerCase()}/browser`,
        },
      }),

      environmentVariables: {},
    });

    const buildOutput = new codepipeline.Artifact();

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new actions.CodeBuildAction({
          actionName: 'CompileNgSite',
          input: sourceArtifact,
          project: buildProject,
          outputs: [buildOutput],
        }),
      ],
    });

    const invalidateBuildProject = new codebuild.PipelineProject(this, `${id}InvalidateProject`, {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/*"',
            ],
          },
        },
      }),
      environmentVariables: {
        CLOUDFRONT_ID: { value: cloudfrontDistributionId },
      },
    });

    const distributionArn = `arn:aws:cloudfront::${
      Stack.of(this).account
    }:distribution/${cloudfrontDistributionId}`;
    invalidateBuildProject.addToRolePolicy(
      new iam.PolicyStatement({
        resources: [distributionArn],
        actions: ['cloudfront:CreateInvalidation'],
      })
    );

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new actions.S3DeployAction({
          actionName: 'CopyToS3',
          bucket: bucket,
          input: buildOutput,
          cacheControl: [actions.CacheControl.fromString('no-store')],
          runOrder: 1,
        }),
        new actions.CodeBuildAction({
          actionName: 'InvalidateCloudFront',
          input: buildOutput,
          project: invalidateBuildProject,
          runOrder: 2,
        }),
      ],
    });

    pipeline.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['codebuild:StartBuild'],
        resources: [buildProject.projectArn, invalidateBuildProject.projectArn],
        effect: iam.Effect.ALLOW,
      })
    );
  }
}

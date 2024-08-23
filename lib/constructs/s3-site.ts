import * as aws_s3 from 'aws-cdk-lib/aws-s3';
import * as aws_iam from 'aws-cdk-lib/aws-iam';
import * as aws_cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cdk from 'aws-cdk-lib';
import { CfnDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as path from 'path';

export interface S3SiteProps {
  readonly assetDirectory: string;
  readonly certDomain?: string;
  readonly customDomain?: string;
  readonly hostedZone?: route53.IHostedZone;
  readonly project: string;
  readonly siteConfigurationGenerator: (
    siteDomain: string
  ) => Record<string, string | number | boolean>;
}

export class S3Site extends Construct {
  public readonly s3Bucket: aws_s3.Bucket;
  public readonly webDistribution: aws_cloudfront.CloudFrontWebDistribution;
  public readonly siteDomain: string;

  constructor(scope: Construct, id: string, props: S3SiteProps) {
    super(scope, id);

    const createS3Bucket = (bucketName: string) => {
      bucketName += 'SiteBucket';
      const s3Bucket = new aws_s3.Bucket(this, bucketName, {
        encryption: aws_s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });
      return s3Bucket;
    };

    const createCloudFrontWebDistribution = (id: string, s3Bucket: aws_s3.Bucket) => {
      const webDistribution = new aws_cloudfront.CloudFrontWebDistribution(this, 'Site' + id, {
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: s3Bucket,
            },
            behaviors: [
              {
                isDefaultBehavior: true,
              },
            ],
          },
        ],
        defaultRootObject: 'index.html',
        httpVersion: aws_cloudfront.HttpVersion.HTTP2,
        priceClass: aws_cloudfront.PriceClass.PRICE_CLASS_ALL,
        errorConfigurations: [
          {
            errorCode: 403,
            responseCode: 200,
            responsePagePath: '/index.html',
          },
          {
            errorCode: 404,
            responseCode: 200,
            responsePagePath: '/index.html',
          },
        ],
      });

      const cfnOriginAccessControl = new aws_cloudfront.CfnOriginAccessControl(
        this,
        'OriginAccessControl' + id,
        {
          originAccessControlConfig: {
            name: `${id}-${this.node.id}`,
            originAccessControlOriginType: 's3',
            signingBehavior: 'always',
            signingProtocol: 'sigv4',
          },
        }
      );

      const cfnDistribution = webDistribution.node.defaultChild as CfnDistribution;
      cfnDistribution.addPropertyOverride(
        'DistributionConfig.Origins.0.OriginAccessControlId',
        cfnOriginAccessControl.getAtt('Id')
      );

      s3Bucket.addToResourcePolicy(
        new aws_iam.PolicyStatement({
          actions: ['s3:GetObject'],
          principals: [new aws_iam.ServicePrincipal('cloudfront.amazonaws.com')],
          effect: aws_iam.Effect.ALLOW,
          resources: [s3Bucket.bucketArn + '/*'],
          conditions: {
            StringEquals: {
              'AWS:SourceArn': cdk.Arn.format(
                {
                  service: 'cloudfront',
                  resource: 'distribution',
                  region: '', // must not specify a single region
                  resourceName: webDistribution.distributionId,
                },
                cdk.Stack.of(this)
              ),
            },
          },
        })
      );

      return webDistribution;
    };

    const callS3Deploy = (
      siteConfig: any,
      assetDirectory: string,
      project: string,
      s3Bucket: aws_s3.Bucket,
      webDistribution: aws_cloudfront.CloudFrontWebDistribution
    ) => {
      const dockerImage = cdk.DockerImage.fromRegistry(
        'public.ecr.aws/docker/library/node:18.17.1-bookworm-slim'
      );

      new s3deploy.BucketDeployment(this, 'SiteCodeDeployment' + project, {
        sources: [
          s3deploy.Source.asset(assetDirectory, {
            assetHashType: cdk.AssetHashType.SOURCE,
            bundling: {
              image: dockerImage,
              entrypoint: ['bash', '-c'],
              user: 'root',
              bundlingFileAccess: cdk.BundlingFileAccess.VOLUME_COPY,
              command: [
                [
                  'pwd',
                  'npm install',
                  `echo 'export const environment = ${JSON.stringify(
                    siteConfig
                  )}' > ./projects/${project.toLowerCase()}/src/environments/environment.development.ts`,
                  `echo 'export const environment = ${JSON.stringify(
                    siteConfig
                  )}' > ./projects/${project.toLowerCase()}/src/environments/environment.ts`,
                  `npm run build ${project}`,
                  `cp -r /asset-input/dist/${project.toLowerCase()}/browser/* /asset-output/`,
                ].join(' && '),
              ],
            },
          }),
        ],
        destinationBucket: s3Bucket,
        distribution: webDistribution, // invalidates distribution's edge caches
        prune: true,
      });
    };

    this.s3Bucket = createS3Bucket(id);
    const useCustomDomain = props.customDomain ? true : false;
    this.webDistribution = createCloudFrontWebDistribution(id, this.s3Bucket);
    this.siteDomain = useCustomDomain
      ? props.customDomain!
      : this.webDistribution.distributionDomainName;
    const siteConfig = props.siteConfigurationGenerator(this.siteDomain);
    callS3Deploy(
      siteConfig,
      props.assetDirectory,
      props.project,
      this.s3Bucket,
      this.webDistribution
    );
  }
}

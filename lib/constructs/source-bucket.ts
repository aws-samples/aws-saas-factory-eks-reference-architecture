import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { ISource } from 'aws-cdk-lib/aws-codebuild';
import * as aws_s3 from 'aws-cdk-lib/aws-s3';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';

export interface SourceBucketProps {
  readonly name: string;
  readonly assetDirectory: string;
}

/**
 * Represents a source bucket for the CodeBuild project.
 */
export class SourceBucket extends Construct {
  readonly source: ISource;

  constructor(scope: Construct, id: string, props: SourceBucketProps) {
    super(scope, id);

    const directoryAsset = new Asset(this, `${props.name}-assets`, {
      path: props.assetDirectory,
    });

    const bucket = aws_s3.Bucket.fromBucketName(
      this,
      `${id}-asset-bucket`,
      directoryAsset.s3BucketName
    );

    this.source = codebuild.Source.s3({
      bucket,
      path: directoryAsset.s3ObjectKey,
    });
  }
}

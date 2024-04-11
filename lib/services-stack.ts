import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { ApplicationService } from './constructs/application-service';

export interface ServicesStackProps extends StackProps {
  readonly internalNLBApiDomain: string;
  readonly eksClusterName: string;
  readonly codebuildKubectlRoleArn: string;
}

export class ServicesStack extends Stack {
  constructor(scope: Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);

    const role = iam.Role.fromRoleArn(this, 'CodebuildKubectlRole', props.codebuildKubectlRoleArn);

    // application services
    const productSvc = new ApplicationService(this, 'ProductService', {
      internalApiDomain: props.internalNLBApiDomain,
      eksClusterName: props.eksClusterName,
      codebuildKubectlRole: role,
      name: 'ProductService',
      ecrImageName: 'product-svc',
      serviceUrlPrefix: 'products',
      assetDirectory: path.join(
        __dirname,
        '..',
        'services',
        'application-services',
        'product-service'
      ),
    });
    new CfnOutput(this, 'ProductServiceRepository', {
      value: productSvc.codeRepositoryUrl,
    });

    const orderSvc = new ApplicationService(this, 'OrderService', {
      internalApiDomain: props.internalNLBApiDomain,
      eksClusterName: props.eksClusterName,
      codebuildKubectlRole: role,
      name: 'OrderService',
      ecrImageName: 'order-svc',
      serviceUrlPrefix: 'orders',
      assetDirectory: path.join(
        __dirname,
        '..',
        'services',
        'application-services',
        'order-service'
      ),
    });
    new CfnOutput(this, 'OrderServiceRepository', {
      value: orderSvc.codeRepositoryUrl,
    });
  }
}

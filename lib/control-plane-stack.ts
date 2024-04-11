import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CognitoAuth, ControlPlane } from '@cdklabs/sbt-aws';

export interface ControlPlaneStackProps extends StackProps {
  readonly systemAdminEmail: string;
}

export class ControlPlaneStack extends Stack {
  constructor(scope: Construct, id: string, props: ControlPlaneStackProps) {
    super(scope, id, props);

    const idpName = 'COGNITO';
    const systemAdminRoleName = 'SystemAdmin';

    const cognitoAuth = new CognitoAuth(this, 'CognitoAuth', {
      idpName: idpName,
      systemAdminRoleName: systemAdminRoleName,
      systemAdminEmail: props.systemAdminEmail,
    });

    const controlPlane = new ControlPlane(this, 'ControlPlane', {
      auth: cognitoAuth,
    });
  }
}

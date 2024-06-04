import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CognitoAuth, ControlPlane } from '@cdklabs/sbt-aws';
import { EventBus } from 'aws-cdk-lib/aws-events';

export interface ControlPlaneStackProps extends StackProps {
  readonly systemAdminEmail: string;
}

export class ControlPlaneStack extends Stack {
  eventBusArn: string;
  controlPlaneUrl: string;
  clientId: string;
  authorizationServer: string;
  wellKnownEndpointUrl: string;
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

    this.controlPlaneUrl = controlPlane.controlPlaneAPIGatewayUrl;
    this.eventBusArn = controlPlane.eventBusArn;
    this.clientId = cognitoAuth.clientId;
    this.wellKnownEndpointUrl = cognitoAuth.wellKnownEndpointUrl;
    this.authorizationServer = cognitoAuth.authorizationServer;
  }
}

import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ControlPlane, CognitoAuth } from '@cdklabs/sbt-aws';

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
      setAPIGWScopes: false, // only for testing purposes!
      controlPlaneCallbackURL: '',
    });

    const controlPlane = new ControlPlane(this, 'ControlPlane', {
      systemAdminEmail: props.systemAdminEmail,
      auth: cognitoAuth,
    });

    this.controlPlaneUrl = controlPlane.controlPlaneAPIGatewayUrl;
    this.eventBusArn = controlPlane.eventManager.busArn;
    this.clientId = cognitoAuth.userClientId;
    this.wellKnownEndpointUrl = cognitoAuth.wellKnownEndpointUrl;
    const tokenEndpoint = cognitoAuth.tokenEndpoint;
    this.authorizationServer = tokenEndpoint.substring(0, tokenEndpoint.indexOf('/oauth2/token'));
  }
}

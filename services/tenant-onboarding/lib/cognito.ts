import { Construct } from 'constructs';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito'

export interface CognitoProps {
    readonly adminUserEmailAddress: string;
    readonly userPoolName: string;

    readonly customAttributes?: { [key: string]: { value: boolean | number | string, mutable: boolean } };
    readonly callbackUrl?: string;
    readonly signoutUrl?: string;
    readonly inviteEmailSubject?: string;
    readonly inviteEmailBody?: string;
}

export class Cognito extends Construct {
    readonly appClientId: string;
    readonly authServerUrl: string;
    readonly userPoolId: string;

    constructor(scope: Construct, id: string, props: CognitoProps) {
        super(scope, id);

        const callbackUrls = props.callbackUrl ? [props.callbackUrl!] : undefined;
        const signoutUrls = props.signoutUrl ? [props.signoutUrl!] : undefined;

        let customAttributes: { [key: string]: cognito.ICustomAttribute } | undefined = undefined;
        if (props.customAttributes) {
            customAttributes = {};
            Object.keys(props.customAttributes!).forEach(key => {
                const item = props.customAttributes![key];
                switch (typeof (item.value)) {
                    case "boolean":
                        customAttributes![key] = new cognito.BooleanAttribute({ mutable: item.mutable });
                        break;
                    case "number":
                        customAttributes![key] = new cognito.NumberAttribute({ mutable: item.mutable });
                        break;
                    case "string":
                        customAttributes![key] = new cognito.StringAttribute({ mutable: item.mutable });
                        break;
                }
            });
        }

        const userPool = new cognito.UserPool(this, 'UserPool', {
            userPoolName: props.userPoolName,
            selfSignUpEnabled: false,
            userInvitation: {
                emailBody: props.inviteEmailBody,
                emailSubject: props.inviteEmailSubject
            },
            passwordPolicy: {
                minLength: 8,
                requireDigits: true,
                requireLowercase: true,
                requireUppercase: true,
                requireSymbols: false,
                tempPasswordValidity: Duration.days(7),
            },
            signInAliases: {
                email: true,
                username: false
            },
            autoVerify: {
                email: true
            },
            customAttributes: customAttributes,
            accountRecovery: cognito.AccountRecovery.NONE,
            mfa: cognito.Mfa.OFF,
            removalPolicy: RemovalPolicy.DESTROY
        });
        this.userPoolId = userPool.userPoolId;

        const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
            userPool: userPool,
            disableOAuth: false,
            oAuth: {
                flows: {
                    clientCredentials: false,
                    implicitCodeGrant: true,
                    authorizationCodeGrant: true
                },
                scopes: [
                    cognito.OAuthScope.PHONE,
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE
                ],
                callbackUrls: callbackUrls,
                logoutUrls: signoutUrls,
            },
            generateSecret: false,
            authFlows: {
                adminUserPassword: true,
                custom: true,
                userPassword: true,
                userSrp: true,
            },
            preventUserExistenceErrors: true,
            refreshTokenValidity: Duration.days(30),
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO
            ]
        });

        this.appClientId = userPoolClient.userPoolClientId;
        this.authServerUrl = userPool.userPoolProviderUrl;

        userPool.addDomain(`${id}-Domain`, {
            cognitoDomain: {
                domainPrefix: this.appClientId
            }
        });

        const userAttributes = [
            { name: "email", value: props.adminUserEmailAddress },
            { name: "email_verified", value: "true" }
        ];

        if (props.customAttributes) {
            Object.keys(props.customAttributes!).forEach(key => {
                userAttributes.push({ name: `custom:${key}`, value: props.customAttributes![key].value.toString() });
            })
        }

        const admin = new cognito.CfnUserPoolUser(this, 'AdminUser', {
            userPoolId: userPool.userPoolId,
            username: props.adminUserEmailAddress,
            userAttributes: userAttributes,
            desiredDeliveryMediums: [
                "EMAIL"
            ],
            forceAliasCreation: true
        });
    }
}
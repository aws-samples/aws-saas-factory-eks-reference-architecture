import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import * as route53 from 'aws-cdk-lib/aws-route53';
import { StaticSite } from "./constructs/static-site";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";

export interface StaticSitesStackProps extends StackProps {
    readonly apiUrl: string
    readonly saasAdminEmail: string

    readonly usingKubeCost: boolean

    readonly customBaseDomain?: string
    readonly hostedZoneId?: string
}

export class StaticSitesStack extends Stack {

    readonly applicationSiteDistribution: Distribution

    constructor(scope: Construct, id: string, props: StaticSitesStackProps) {
        super(scope, id, props);

        const useCustomDomain = props.customBaseDomain ? true : false;
        if (useCustomDomain && !props.hostedZoneId) {
            throw new Error("HostedZoneId must be specified when using a custom domain for static sites.");
        }

        const hostedZone = useCustomDomain ? route53.PublicHostedZone.fromHostedZoneAttributes(this, 'PublicHostedZone', {
            hostedZoneId: props.hostedZoneId!,
            zoneName: props.customBaseDomain!
        }) : undefined;


        // Landing site
        const landingSite = new StaticSite(this, "LandingSite", {
            name: "LandingSite",
            assetDirectory: path.join(path.dirname(__filename), "..", "clients", "Landing"),
            allowedMethods: ["GET", "HEAD", "OPTIONS"],
            createCognitoUserPool: false,
            siteConfigurationGenerator: (siteDomain, _) => ({
                production: true,
                apiUrl: props.apiUrl,
                domain: siteDomain,
                usingCustomDomain: useCustomDomain,
            }),
            customDomain: useCustomDomain ? `landing.${props.customBaseDomain!}` : undefined,
            hostedZone: hostedZone
        });

        new CfnOutput(this, `LandingSiteRepository`, {
            value: landingSite.repositoryUrl
        });
        new CfnOutput(this, `LandingSiteUrl`, {
            value: `https://${landingSite.siteDomain}`
        });


        // Admin site
        const adminSite = new StaticSite(this, "AdminSite", {
            name: "AdminSite",
            assetDirectory: path.join(path.dirname(__filename), "..", "clients", "Admin"),
            allowedMethods: ["GET", "HEAD", "OPTIONS"],
            createCognitoUserPool: true,
            cognitoProps: {
                adminUserEmail: props.saasAdminEmail
            },
            siteConfigurationGenerator: (siteDomain, cognito) => ({
                production: true,
                clientId: cognito!.appClientId,
                issuer: cognito!.authServerUrl,
                customDomain: cognito!.appClientId,
                apiUrl: props.apiUrl,
                domain: siteDomain,
                usingCustomDomain: useCustomDomain,
                usingKubeCost: props.usingKubeCost,
                kubecostUI: props.usingKubeCost ? `${props.apiUrl}/kubecost` : ""
            }),
            customDomain: useCustomDomain ? `admin.${props.customBaseDomain!}` : undefined,
            hostedZone: hostedZone
        });
        new CfnOutput(this, `AdminSiteRepository`, {
            value: adminSite.repositoryUrl
        });
        new CfnOutput(this, `AdminSiteUrl`, {
            value: `https://${adminSite.siteDomain}`
        });


        // Application site
        const applicationSite = new StaticSite(this, "ApplicationSite", {
            name: "ApplicationSite",
            assetDirectory: path.join(path.dirname(__filename), "..", "clients", "Application"),
            allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
            createCognitoUserPool: false,
            siteConfigurationGenerator: (siteDomain, _) => ({
                production: true,
                apiUrl: props.apiUrl,
                domain: siteDomain,
                usingCustomDomain: useCustomDomain,
            }),
            customDomain: useCustomDomain ? `app.${props.customBaseDomain!}` : undefined,
            certDomain: useCustomDomain ? `*.app.${props.customBaseDomain!}` : undefined,
            hostedZone: hostedZone
        });

        this.applicationSiteDistribution = applicationSite.cloudfrontDistribution;
        new CfnOutput(this, `ApplicationSiteRepository`, {
            value: applicationSite.repositoryUrl
        });
    }
}
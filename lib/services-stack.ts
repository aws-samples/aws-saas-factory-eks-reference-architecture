import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { SharedService } from "./constructs/shared-service";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import { ApplicationService } from "./constructs/application-service";
import { TenantOnboarding } from "./constructs/tenant-onboarding";

export interface ServicesStackProps extends StackProps {
    readonly internalNLBApiDomain: string
    readonly eksClusterName: string
    readonly eksClusterOIDCProviderArn: string
    readonly codebuildKubectlRoleArn: string
    readonly appSiteDistributionId: string
    readonly appSiteCloudFrontDomain: string
    readonly sharedServiceAccountName: string
    readonly appHostedZoneId?: string
    readonly customDomain?: string
}

export class ServicesStack extends Stack {
    constructor(scope: Construct, id: string, props: ServicesStackProps) {
        super(scope, id, props);

        const role = iam.Role.fromRoleArn(this, "CodebuildKubectlRole", props.codebuildKubectlRoleArn);

        // shared services

        const tenantMgmtSvc = new SharedService(this, "TenantManagementService", {
            internalApiDomain: props.internalNLBApiDomain,
            eksClusterName: props.eksClusterName,
            codebuildKubectlRole: role,
            name: "TenantManagement",
            ecrImageName: "tenant-mgmt",
            sharedServiceAccountName: props.sharedServiceAccountName,
            assetDirectory: path.join(__dirname, "..", "services", "shared-services", "tenant-management-service")
        });
        new CfnOutput(this, "TenantManagementRepository", {
            value: tenantMgmtSvc.codeRepositoryUrl
        });

        const tenantRegSvc = new SharedService(this, "TenantRegistrationService", {
            internalApiDomain: props.internalNLBApiDomain,
            eksClusterName: props.eksClusterName,
            codebuildKubectlRole: role,
            name: "TenantRegistration",
            ecrImageName: "tenant-reg",
            sharedServiceAccountName: props.sharedServiceAccountName,
            assetDirectory: path.join(__dirname, "..", "services", "shared-services", "tenant-registration-service")
        });
        new CfnOutput(this, "TenantRegistrationRepository", {
            value: tenantRegSvc.codeRepositoryUrl
        });

        const userMgmtSvc = new SharedService(this, "UserManagementService", {
            internalApiDomain: props.internalNLBApiDomain,
            eksClusterName: props.eksClusterName,
            codebuildKubectlRole: role,
            name: "UserManagement",
            ecrImageName: "user-mgmt",
            sharedServiceAccountName: props.sharedServiceAccountName,
            assetDirectory: path.join(__dirname, "..", "services", "shared-services", "user-management-service")
        });
        new CfnOutput(this, "UserManagementRepository", {
            value: userMgmtSvc.codeRepositoryUrl
        });


        // application services

        const productSvc = new ApplicationService(this, "ProductService", {
            internalApiDomain: props.internalNLBApiDomain,
            eksClusterName: props.eksClusterName,
            codebuildKubectlRole: role,
            name: "ProductService",
            ecrImageName: "product-svc",
            serviceUrlPrefix: "products",
            assetDirectory: path.join(__dirname, "..", "services", "application-services", "product-service")
        });
        new CfnOutput(this, "ProductServiceRepository", {
            value: productSvc.codeRepositoryUrl
        });

        const orderSvc = new ApplicationService(this, "OrderService", {
            internalApiDomain: props.internalNLBApiDomain,
            eksClusterName: props.eksClusterName,
            codebuildKubectlRole: role,
            name: "OrderService",
            ecrImageName: "order-svc",
            serviceUrlPrefix: "orders",
            assetDirectory: path.join(__dirname, "..", "services", "application-services", "order-service")
        });
        new CfnOutput(this, "OrderServiceRepository", {
            value: orderSvc.codeRepositoryUrl
        });


        // tenant onboarding service

        const onboardingSvc = new TenantOnboarding(this, "TenantOnboarding", {
            appSiteCloudFrontDomain: props.appSiteCloudFrontDomain,
            appSiteDistributionId: props.appSiteDistributionId,
            codebuildKubectlRole: role,
            eksClusterOIDCProviderArn: props.eksClusterOIDCProviderArn,
            eksClusterName: props.eksClusterName,
            applicationServiceBuildProjectNames: ["ProductService", "OrderService"],
            onboardingProjectName: "TenantOnboardingProject",
            deletionProjectName: "TenantDeletionProject",
            appSiteHostedZoneId: props.appHostedZoneId,
            appSiteCustomDomain: props.customDomain ? `app.${props.customDomain!}` : undefined,
            assetDirectory: path.join(__dirname, "..", "services", "tenant-onboarding"),
        });

        new CfnOutput(this, "TenantOnboardingRepository", {
            value: onboardingSvc.repositoryUrl
        });
    }
}
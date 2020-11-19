# Shared Services

This folder contains source code for the microservices that run in the EKS cluster supporting operational, non-tenant-specific functionality. The only publically facing endpoint for these services is the Tenant Registration site. Current

## [Tenant Management Service](./tenant-management-service)

The tenant management service is responsible for most of the heavy lifting with respect to tenant management. It provisions the tenant's stack by way of CodePipeline, and records tenant details (along with Cognito OAuth settings) in a DynamoDB table. It surfaces these details when an Application Client first comes online. This service has no public internet-facing endpoints but rather is called internally within the cluster.

## [Tenant Registration Service](./tenant-registration-service)

The registration service is a public internet-facing service that exposes the endpoints for both tenant registration and Application Client auth settings.

## [User Management Service](./user-management-service)

The user management service is responsible for creating the Cognito user pool, as well as the first user. It also creates the tenant-specific Route53 Aliases for the CloudFront distribution that hosts the Application client.

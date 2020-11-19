# Services

This folder contains the source the services that are built and deployed into the EKS Cluster. They are divided into two broad categories:

## [Application Services](./application-services)

The application services are deployed on a per-tenant basis into a tenant-specific namespace inside the EKS cluster. This provisioning happens as part of the AWS CodeBuild and CodePipeline process that gets kicked off by way of the [Tenant Registration Shared Service](./shared-services/tenant-registration-service).

## [Shared Services](./shared-services)

The shared services represent those services that operate a level above the individual tenant services. These services include [tenant registration](./shared-services/tenant-registration-service) and [management](./shared-services/tenant-management-service), as well as [user management](./shared-services/user-management-service).


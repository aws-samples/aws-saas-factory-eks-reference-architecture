# Application Services

The application services are deployed on a per-tenant basis as pods inside a tenant-specific namespace. The images for these services are built, tagged and deployed to [AWS ECR](https://aws.amazon.com/ecr/) by of the [build_and_upload_sharedsvcs.sh](../../resources/build_and_upload_sharedsvcs.sh) script.

Both services are written in Java Spring and are secured with Spring Security. The Application client presents the access token retrieved as part of the standard OAuth 2.0 Authorization Code grant flow, using the Cognito user pool that was provisioned upon tenant registration.

## [Order Service](./order-service)

The order service provides basic CRUD functionality for our Application web client. An order object simply contains the order name as well as a collection of objects representing the individual line items in this order--specifically the id, quantity and price of the products ordered.

## [Product Service](./product-service)

The product service handles basic CRUD functionaliry for our Application web client. A product object contains the product name, and price. Once created, the object becomes available to Order. 


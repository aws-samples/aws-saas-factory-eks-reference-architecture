# Clients

This folder holds the various web clients included in the EKS Reference Architecture.

## [Admin](./Admin/README.md)

Provides an example web application for what the SaaS Administration experience might look like. This application includes a set of sample (fake) graphs and charts for the operational monitoring of all tenants across the system. It also includes the ability to provision new tenants and perform basic CRUD operations.

## [Application](./Application/README.md)

A sample e-Commerce supply/order management web application that's provided for each provisioned. It allows tenant users to create new Products and Orders (based on those products). The storage story for Products is pooled in that all tenants share the same DynamoDB table. Orders, on the other hand, are siloed--that is, each tenant gets their own individual DynamoDB table. The Product and Order services are secured by with JWT credentials. The application retrieves access tokens by way of OIDC and the standard [OAuth Authorization Code](https://oauth.net/2/grant-types/authorization-code/) grant type using Cognito as an OIDC provider.

## [Landing](./Landing/README.md)

A simple signup form. This application represents the "marketing" page for our SaaS e-Commerce application. From here, tenants can self-signup using the registration form. The registration process provisions the first user as well as all the infrastructure/services to support the newly provisioned tenant.

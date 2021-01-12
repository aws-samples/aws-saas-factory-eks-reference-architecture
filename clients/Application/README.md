# Application

A sample e-Commerce supply/order management web application that's provided for each provisioned. It allows tenant users to create new Products and Orders (based on those products). The storage story for Products is pooled in that all tenants share the same DynamoDB table. Orders, on the other hand, are siloed--that is, each tenant gets their own individual DynamoDB table. The Product and Order services are secured by with JWT credentials. The application retrieves access tokens by way of OIDC and the standard [OAuth Authorization Code](https://oauth.net/2/grant-types/authorization-code/) grant type using Cognito as an OIDC provider.

## Details

(Insert Arch/Flow Diagrams)

This application is written in Angular 9.1. The Order CRUD functionality is in the [OrdersModule](./src/app/orders/orders.module). Product CRUD functionality is in the [ProductsModule](./src/app/products/products.module). Routing for the app happens in the [AppRoutingModule]( /src/app/app.routing.ts). Both the `Orders` and `Products` module have routing modules to handle anything beyond the `/orders` and `/products` segments respectively.

As mentioned above, the Application leverages an [OAuth Authorization Code](https://oauth.net/2/grant-types/authorization-code/) flow for authentication. New tenants are provisioned with not only with an alias to this application, but also a new Cognito user pool and first user. Once provisioned, the details of this user pool, as well as other OIDC-specific settings are stored in a DynamoDB table called `Tenant`. When the Application is first loaded, this OIDC configuration is fetched from the [`TenantRegistrationService`](../../../../services/shared-services/tenant-registration-service) by way of the `https://api.CUSTOMDOMAIN.com/auth` endpoint. This configuration bootstrapping occurs in the [AppModule](./src/app/app.module.ts:88) using a custom [Angular Dependency Provider](https://angular.io/guide/dependency-injection-providers) factory function: [auth-config.ts](./src/app/views/auth/auth-config.ts). Once the auth settings are loaded, the application has everything it needs to defer authentication to the Cognito hosted UI.

Once authenticated, an [Angular Auth Guard](https://angular.io/api/router/CanActivate): [cognito.guard.ts](./src/app/cognito.guard.ts) is utilized to protect both the `Orders` and `Products` routes.

An [Angular Http Interceptor](https://angular.io/api/common/http/HttpInterceptor), [AuthInterceptor](./src/app/interceptors/auth.interceptor.ts) is used to add the `Authenticate bearer` token to all outbound HTTP calls.

The application is based on [CoreUI (free)](https://coreui.io/demo/3.2.0/).

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 9.1.0.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).

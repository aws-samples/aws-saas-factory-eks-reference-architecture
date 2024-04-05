# Admin Client

Provides an example web application for what the SaaS Administration experience might look like. This application includes a set of sample (fake) graphs and charts for the operational monitoring of all tenants across the system. It also includes the ability to provision new tenants and perform basic CRUD operations.

## Details

This application is written in Angular 9.1. The tenant CRUD functionality is in the [TenantModule](./src/app/views/tenants/tenant.module.ts). Routing for the app happens in the [AppRoutingModule](./src/app/app.routing.ts). The tenant module has its own routing module for handling segments under the `/tenants` segment.

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

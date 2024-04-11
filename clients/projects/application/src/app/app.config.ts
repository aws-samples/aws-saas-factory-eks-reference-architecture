import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  provideRouter,
  withEnabledBlockingInitialNavigation,
  withHashLocation,
  withInMemoryScrolling,
  withRouterConfig,
  withViewTransitions,
} from '@angular/router';
import { DropdownModule, SidebarModule } from '@coreui/angular';
import { IconSetService } from '@coreui/icons-angular';
import { routes } from './app.routes';
import {
  provideHttpClient,
  HttpClient,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import {
  AbstractLoggerService,
  AuthModule,
  LogLevel,
  StsConfigLoader,
  provideAuth,
} from 'angular-auth-oidc-client';
import { HttpConfigLoaderFactory } from './auth-configuration';
import { ServiceHelperService } from './service-helper.service';
import { AuthInterceptor } from './auth.interceptor';
import { APP_BASE_HREF } from '@angular/common';
import { environment } from '../environments/environment';
import { AuthLoggerService } from './auth-logger';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withRouterConfig({
        onSameUrlNavigation: 'reload',
      }),
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
      withEnabledBlockingInitialNavigation(),
      withViewTransitions(),
      withHashLocation()
    ),
    importProvidersFrom(
      SidebarModule,
      DropdownModule,
      AuthModule.forRoot({
        loader: {
          provide: StsConfigLoader,
          useFactory: HttpConfigLoaderFactory,
          deps: [HttpClient, ServiceHelperService],
        },
      })
    ),
    IconSetService,
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    // provideAuth({
    //   config: {
    //     authority: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_upmWHO9G7',
    //     redirectUrl: 'http://localhost:4200/?tenantId=tenantone',
    //     clientId: '321gk7aphr8imgp0skouiar9ln',
    //     responseType: 'code',
    //     scope: 'phone email openid profile',
    //     postLogoutRedirectUri: 'http://localhost:4200/?tenantId=tenantone/logoff',
    //     postLoginRoute: '',
    //     forbiddenRoute: '/forbidden',
    //     unauthorizedRoute: '/unauthorized',
    //     logLevel: LogLevel.Debug,
    //   },
    // }),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    {
      provide: APP_BASE_HREF,
      useFactory: () => {
        if (environment.usingCustomDomain) {
          return '';
        }
        const parts = window.location.hash.split('/');
        return `/${parts[1]}`;
      },
    },
    { provide: AbstractLoggerService, useClass: AuthLoggerService },
  ],
};

import { APP_BASE_HREF } from '@angular/common';
import {
  HTTP_INTERCEPTORS,
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
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
import { AbstractLoggerService, AuthModule, StsConfigLoader } from 'angular-auth-oidc-client';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { HttpConfigLoaderFactory } from './auth-configuration';
import { AuthLoggerService } from './auth-logger';
import { AuthInterceptor } from './auth.interceptor';
import { ServiceHelperService } from './service-helper.service';

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
    // provideHttpClient(withInterceptorsFromDi()),

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

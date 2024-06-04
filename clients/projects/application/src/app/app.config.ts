import { APP_BASE_HREF } from '@angular/common';
import {
  HTTP_INTERCEPTORS,
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom } from '@angular/core';
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
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { HttpConfigLoaderFactory } from './auth-configuration';
import { AuthInterceptor } from './auth.interceptor';
import { ServiceHelperService } from './service-helper.service';
import { OAuthService, provideOAuthClient } from 'angular-oauth2-oidc';

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
    importProvidersFrom(SidebarModule, DropdownModule),
    IconSetService,
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),

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
    provideOAuthClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: HttpConfigLoaderFactory,
      multi: true,
      deps: [HttpClient, OAuthService, ServiceHelperService],
    },
  ],
};

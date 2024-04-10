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
  HTTP_INTERCEPTORS,
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { AbstractLoggerService, AuthModule, StsConfigLoader } from 'angular-auth-oidc-client';
import { ConfigLoaderFactory } from './auth-configuration';
import { AuthInterceptor } from './auth.interceptor';
import { AuthLoggerService } from './auth-logger';
import { ServiceHelperService } from '../../../application/src/app/service-helper.service';
import { HttpConfigLoaderFactory } from '../../../application/src/app/auth-configuration';

export const appConfig: ApplicationConfig = {
  providers: [
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

    IconSetService,
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: AbstractLoggerService, useClass: AuthLoggerService },
  ],
};

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
import { provideHttpClient, HttpClient } from '@angular/common/http';
import { AuthModule, StsConfigLoader } from 'angular-auth-oidc-client';
import { HttpConfigLoaderFactory } from './auth-configuration';
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
      AuthModule.forRoot({
        loader: {
          provide: StsConfigLoader,
          useFactory: HttpConfigLoaderFactory,
          deps: [HttpClient, ServiceHelperService],
        },
      }),
      SidebarModule,
      DropdownModule
    ),
    IconSetService,
    provideAnimations(),
    provideHttpClient(),
  ],
};

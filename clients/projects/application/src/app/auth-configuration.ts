import { HttpClient } from '@angular/common/http';
import { AuthConfig, OAuthService } from 'angular-oauth2-oidc';
import { environment } from '../environments/environment';
import { ServiceHelperService } from './service-helper.service';
import { ConfigParams } from './views/auth/models/config-params';
import { map, tap } from 'rxjs';

export const DummyHttpConfigLoaderFactory = () => {};

export function HttpConfigLoaderFactory(
  http: HttpClient,
  oauthService: OAuthService,
  svcHelper: ServiceHelperService
) {
  return () => {
    console.log('Configuring Auth');

    const tenantId = environment.usingCustomDomain ? '' : svcHelper.getTenantId();
    const url = `${environment.controlPlaneUrl}/tenant-config?tenantId=${tenantId}`;

    return http.get<ConfigParams>(url).pipe(
      map((customConfig: ConfigParams) => {
        return {
          clientId: customConfig.appClientId,
          issuer: customConfig.authServer,
          redirectUri: customConfig.redirectUrl,
          responseType: 'code',
          scope: 'openid profile email',
          showDebugInformation: true,
          strictDiscoveryDocumentValidation: false,
        } as AuthConfig;
      }),
      tap((authConfig: AuthConfig) => {
        console.log('Configuration: ', JSON.stringify(authConfig));
        oauthService.configure(authConfig);
        oauthService.loadDiscoveryDocumentAndTryLogin();
      })
    );
  };
}

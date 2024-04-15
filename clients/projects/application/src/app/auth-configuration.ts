import { HttpClient } from '@angular/common/http';
import { LogLevel, OpenIdConfiguration } from 'angular-auth-oidc-client';
import { distinct, map, take } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { ServiceHelperService } from './service-helper.service';
import { ConfigParams } from './views/auth/models/config-params';
import { StsConfigHttpLoader, StsConfigStaticLoader } from 'angular-auth-oidc-client';

export const DummyHttpConfigLoaderFactory = () => {
  return new StsConfigStaticLoader({
    authority: 'https://offeringsolutions-sts.azurewebsites.net',
    redirectUrl: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    clientId: 'angularClient',
    scope: 'openid profile email',
    responseType: 'code',
    silentRenew: true,
    silentRenewUrl: `${window.location.origin}/silent-renew.html`,
    logLevel: LogLevel.Debug,
  });
};

export const HttpConfigLoaderFactory = (http: HttpClient, svcHelper: ServiceHelperService) => {
  // console.log('Configuring Auth');

  const tenantName = environment.usingCustomDomain ? '' : svcHelper.getTenantId();
  const url = `${environment.controlPlaneUrl}/tenant-config/${tenantName}`;

  const config$ = http.get<ConfigParams>(url).pipe(
    distinct(),
    map((customConfig: ConfigParams) => {
      return {
        authority: customConfig.issuer,
        redirectUrl: customConfig.redirectUri,
        clientId: customConfig.clientId,
        responseType: customConfig.responseType,
        scope: customConfig.scope,
        postLogoutRedirectUri: `${customConfig.redirectUri}/logoff`,
        postLoginRoute: '',
        forbiddenRoute: '/forbidden',
        unauthorizedRoute: '/unauthorized',
        logLevel: LogLevel.Debug,
      } as OpenIdConfiguration;
    })
  );
  return new StsConfigHttpLoader(config$);
};

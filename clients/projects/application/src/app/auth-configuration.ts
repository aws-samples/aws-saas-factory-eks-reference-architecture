import { HttpClient } from '@angular/common/http';
import { LogLevel } from 'angular-auth-oidc-client';
import { map } from 'rxjs/operators';
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
  console.log('**********HttpConfigLoaderFactory**********');
  const url =
    `${environment.apiUrl}/auth-info` +
    (environment.usingCustomDomain ? '' : `?tenantId=${svcHelper.getTenantId()}`);
  const config$ = http.get<ConfigParams>(url).pipe(
    map((customConfig) => {
      return {
        authority: customConfig.issuer,
        redirectUrl: customConfig.redirectUri,
        clientId: customConfig.clientId,
        responseType: customConfig.responseType,
        scope: customConfig.scope,
        postLogoutRedirectUri: `${customConfig.redirectUri}/logoff`,
        startCheckSession: customConfig.start_checksession,
        silentRenew: false, // customConfig.useSilentRefresh,
        silentRenewUrl: customConfig.silentRefreshRedirectUri,
        postLoginRoute: '',
        forbiddenRoute: '/forbidden',
        unauthorizedRoute: '/unauthorized',
        logLevel: LogLevel.Debug,
        maxIdTokenIatOffsetAllowedInSeconds: 10,
        historyCleanupOff: true,
        autoUserinfo: false,
        cognitoDomain:
          customConfig.cognitoDomain ||
          'https://saascoffeekincorqobl.auth.us-east-1.amazoncognito.com',
      };
    })
  );
  return new StsConfigHttpLoader(config$);
};

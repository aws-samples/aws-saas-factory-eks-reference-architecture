import { LogLevel } from 'angular-auth-oidc-client';
import { StsConfigStaticLoader } from 'angular-auth-oidc-client';
import { environment } from '../environments/environment';

export const ConfigLoaderFactory = () => {
  return new StsConfigStaticLoader({
    authority: environment.issuer,
    redirectUrl: window.location.origin,
    postLogoutRedirectUri: `${window.location.origin}/signout`,
    clientId: environment.clientId,
    scope: 'openid profile email phone',
    responseType: 'code',
    useRefreshToken: true,
    logLevel: LogLevel.Debug,
  });
};

/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { OidcConfigService, LogLevel } from 'angular-auth-oidc-client';
import { HttpClient } from '@angular/common/http';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';


export function configureAuth(oidcConfigService: OidcConfigService) {
  return () =>
      oidcConfigService.withConfig({
          stsServer: 'https://offeringsolutions-sts.azurewebsites.net',
          redirectUrl: window.location.origin,
          postLogoutRedirectUri: window.location.origin,
          clientId: 'angularClient',
          scope: 'openid profile email',
          responseType: 'code',
          silentRenew: true,
          silentRenewUrl: `${window.location.origin}/silent-renew.html`,
          logLevel: LogLevel.Debug,
      });
}

export function configureAuth2(oidcConfigService: OidcConfigService, http: HttpClient) {
  const url = `${environment.apiUrl}/auth`;
  const setupAction$ = http.get<any>(url).pipe(
      map((customConfig) => {
          return {
              stsServer: customConfig.issuer,
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
          };
      }),
      switchMap((config) => oidcConfigService.withConfig(config))
  );

  return () => setupAction$.toPromise();
}

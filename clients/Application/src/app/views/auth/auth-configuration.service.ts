import { HttpClient } from '@angular/common/http';
import { Injectable, OnInit } from '@angular/core';
import { LogLevel, OidcConfigService } from 'angular-auth-oidc-client';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ConfigParams } from './models/config-params';

@Injectable({
  providedIn: 'root'
})
export class AuthConfigurationService {
  params$: Observable<ConfigParams>;
  params: ConfigParams;

  constructor(private oidcConfigService: OidcConfigService, private http: HttpClient) {
    const url = `${environment.apiUrl}/auth-info`;
    this.params$ = this.http.get<ConfigParams>(url);
    this.params$.subscribe(val => this.params = val, err => console.error(err));
  }

  public ConfigureDummy() {
    return () =>
    this.oidcConfigService.withConfig({
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

  public Configure() {
    const setupAction$ = this.params$.pipe(
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
                cognitoDomain: customConfig.cognitoDomain || 'https://saascoffeekincorqobl.auth.us-east-1.amazoncognito.com',
            };
        }),
        switchMap((config) => this.oidcConfigService.withConfig(config))
    );
    return () => setupAction$.toPromise();
  }

  public LogOutOfCognito(): Observable<any> {
    const stsServer = this.params.issuer;
    const clientId = this.params.clientId;
    const logoutUrl = this.params.redirectUri;
    window.location.href = `${this.params.cognitoDomain}/login?client_id=${this.params.clientId}&response_type=code&redirect_uri=${this.params.redirectUri}`;
    return;
  }
}

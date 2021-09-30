import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { navItems } from '../../_nav';

@Component({
  selector: 'app-dashboard',
  templateUrl: './default-layout.component.html',
})
export class DefaultLayoutComponent implements OnInit {
  public sidebarMinimized = false;
  public navItems = navItems;
  isAuthenticated$: Observable<Boolean>;
  username$: Observable<string>;

  constructor(
    public oidcSecurityService: OidcSecurityService,
    private router: Router
  ) {}

  ngOnInit() {
    this.isAuthenticated$ = this.oidcSecurityService.isAuthenticated$;
    this.username$ = this.oidcSecurityService.userData$.pipe(
      map((ud) => ud?.email)
    );
  }

  toggleMinimize(e) {
    this.sidebarMinimized = e;
  }

  login() {
    this.oidcSecurityService.authorize();
  }

  logout() {
    this.oidcSecurityService.logoffAndRevokeTokens().subscribe(() => {});
    const match = environment.issuer.match(/(?!\.)([\w-]+)(?=\.amazonaws)/);
    const region = !!match ? match[0] : '';
    window.location.href = `https://${environment.customDomain}.auth.${region}.amazoncognito.com/login?client_id=${environment.clientId}&response_type=code&redirect_uri=https://admin.${environment.domain}`;
  }
}

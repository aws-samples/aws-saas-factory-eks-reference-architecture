import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';

import { IconSetService } from '@coreui/icons-angular';
import { iconSubset } from './icons/icon-subset';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  template: '<router-outlet />',
  standalone: true,
  imports: [RouterOutlet],
})
export class AppComponent implements OnInit {
  title = 'EKS SaaS Reference Architecture';

  constructor(
    private router: Router,
    private titleService: Title,
    private iconSetService: IconSetService,
    private oidcSecurityService: OidcSecurityService
  ) {
    this.titleService.setTitle(this.title);
    // iconSet singleton
    this.iconSetService.icons = { ...iconSubset };
    if (!environment.usingCustomDomain) {
      const query = new URLSearchParams(window.location.search);
      const tenantId = query.get('tenantId');
      const path = query.get('path') || '';
      if (tenantId) {
        query.delete('tenantId');
        query.delete('path');
        window.location.assign(`/?${query.toString()}#/${tenantId}/${path}`);
      }
    }
  }

  ngOnInit(): void {
    this.oidcSecurityService.checkAuth().subscribe(({ isAuthenticated, userData }) => {
      console.log('isAuthenticated: ', isAuthenticated);
      console.log('userData: ', userData);
    });
    this.router.events.subscribe((evt) => {
      if (!(evt instanceof NavigationEnd)) {
        return;
      }
    });
  }
}

import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';

import { IconSetService } from '@coreui/icons-angular';
import { iconSubset } from './icons/icon-subset';
import { environment } from '../environments/environment';
import { OAuthService } from 'angular-oauth2-oidc';

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
    private oauthService: OAuthService
  ) {
    this.titleService.setTitle(this.title);
    // iconSet singleton
    this.iconSetService.icons = { ...iconSubset };
    if (!environment.usingCustomDomain) {
      const query = new URLSearchParams(window.location.search);
      const tenantId = query.get('tenantId');
      if (tenantId) {
        query.delete('tenantId');
        const url = `/#/${tenantId}/?${query.toString()}`;
        console.log('Rewriting URL. Result: ', url);
        window.location.assign(url);
      }
    }
  }

  ngOnInit(): void {
    console.log('Starting Auth Flow');
    this.router.events.subscribe((evt) => {
      if (!(evt instanceof NavigationEnd)) {
        return;
      }
    });
  }
}

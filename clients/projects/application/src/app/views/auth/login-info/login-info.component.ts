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
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  OidcClientNotification,
  OidcSecurityService,
  ConfigurationService,
} from 'angular-auth-oidc-client';
import { Observable, map, of, tap } from 'rxjs';

@Component({
  selector: 'app-login-info',
  templateUrl: './login-info.component.html',
  styleUrls: ['login-info.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class LoginInfoComponent implements OnInit {
  configuration: string = '';
  userData$: Observable<any> = of('');
  isAuthenticated$: Observable<boolean> = of(false);
  idToken$: Observable<string> = of('');
  accessToken$: Observable<string> = of('');

  constructor(
    public oidcSecurityService: OidcSecurityService,
    public configService: ConfigurationService
  ) {}

  ngOnInit() {
    console.log(this.configService.getAllConfigurations());

    const authInfo$ = this.oidcSecurityService.checkAuth();
    this.isAuthenticated$ = authInfo$.pipe(map((result) => result.isAuthenticated));
    this.userData$ = authInfo$.pipe(map((result) => result.userData));
    this.accessToken$ = authInfo$.pipe(map((result) => result.accessToken));
    this.idToken$ = authInfo$.pipe(map((result) => result.idToken));
  }

  login() {
    this.oidcSecurityService.authorize();
  }

  forceRefreshSession() {
    this.oidcSecurityService.forceRefreshSession().subscribe((result) => console.warn(result));
  }

  logout() {
    this.oidcSecurityService.logoff();
  }
}

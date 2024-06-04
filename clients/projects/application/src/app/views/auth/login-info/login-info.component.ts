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
import { OAuthService } from 'angular-oauth2-oidc';

import { Observable, from } from 'rxjs';

@Component({
  selector: 'app-login-info',
  templateUrl: './login-info.component.html',
  styleUrls: ['login-info.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class LoginInfoComponent implements OnInit {
  configuration: string = '';
  userData$ = new Observable<any>();
  isAuthenticated = false;
  idToken = '';
  accessToken = '';

  constructor(private oauthService: OAuthService) {}

  ngOnInit() {
    this.userData$ = from(this.oauthService.loadUserProfile());
    this.idToken = this.oauthService.getIdToken();
    this.accessToken = this.oauthService.getAccessToken();
    this.isAuthenticated = this.oauthService.hasValidIdToken();
  }

  login() {
    console.log('initializing login');
    this.oauthService.initLoginFlow();
  }

  forceRefreshSession() {}

  logout() {}
}

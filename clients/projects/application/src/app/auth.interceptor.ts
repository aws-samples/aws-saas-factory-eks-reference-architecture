import { Injectable } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OAuthStorage } from 'angular-oauth2-oidc';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authStorage: OAuthStorage) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const url = req.url;
    console.log('INTERCEPTOR url', url);

    if (url.includes('cognito') || url.includes('auth-config')) {
      console.log('INTERCEPTOR bypassed');
      return next.handle(req);
    }
    console.log('fetching token');
    let token = this.authStorage.getItem('id_token');

    if (!token) {
      console.log("Supposed to attached a token, but it's null");
      return next.handle(req);
    }
    let header = 'Bearer ' + token;

    let headers = req.headers.set('Authorization', header);
    const newReq = req.clone({ headers });
    return next.handle(newReq);
  }
}

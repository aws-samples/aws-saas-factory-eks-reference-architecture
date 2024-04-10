import { Injectable } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { OidcSecurityService } from 'angular-auth-oidc-client';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: OidcSecurityService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // console.log('INTERCEPTOR Called');
    const url = req.url;

    if (url.includes('amazoncognito') || url.includes('auth-info')) {
      // console.log('INTERCEPTOR bypassed');
      return next.handle(req);
    }

    return this.auth.getIdToken().pipe(
      switchMap((token) => {
        const newRequest = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`,
          },
        });
        // console.log('INTERCEPTOR adding token');
        return next.handle(newRequest);
      })
    );
  }
}

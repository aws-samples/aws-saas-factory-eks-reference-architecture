import { Injectable } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { filter, mergeMap, switchMap, tap } from 'rxjs/operators';
import { OidcSecurityService } from 'angular-auth-oidc-client';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: OidcSecurityService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const url = req.url;
    console.log('INTERCEPTOR url', url);
    console.log('OIDC: ', this.auth.isAuthenticated);

    if (url.includes('amazoncognito') || url.includes('auth-config')) {
      console.log('INTERCEPTOR bypassed');
      return next.handle(req);
    }

    return this.auth.isAuthenticated$.pipe(
      mergeMap((authResult) => {
        if (authResult.isAuthenticated) {
          return this.auth.getIdToken().pipe(
            mergeMap((tok) => {
              const newRequest = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${tok}`,
                },
              });
              console.log('INTERCEPTOR adding token');
              return next.handle(newRequest);
            })
          );
        } else {
          console.log('INTERCEPTOR bypassed');
          return next.handle(req);
        }
      })
    );
  }
}

import { Injectable } from '@angular/core';
import { AbstractLoggerService } from 'angular-auth-oidc-client';

@Injectable()
export class AuthLoggerService implements AbstractLoggerService {
  logError(message: any, ...args: any[]): void {
    console.log('AUTH ERROR: ', message);
  }
  logWarning(message: any, ...args: any[]): void {
    console.log('AUTH WARNING: ', message);
  }
  logDebug(message: any, ...args: any[]): void {
    console.log('AUTH DEBUG: ', message);
  }
}

import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { find, mergeMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { User } from './models/user';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  apiUrl: string;

  constructor(private http: HttpClient) {
    this.apiUrl = `${environment.apiUrl}users`;
  }

  fetch(): Observable<User[]> {
    return this.http.get<User[]>(this.apiUrl);
  }

  get(email: string): Observable<User | undefined> {
    return this.fetch().pipe(
      mergeMap((users) => users),
      find((u) => u.email == email)
    );
  }

  create(user: User): Observable<User> {
    return this.http.post<User>(this.apiUrl, user);
  }

  update(email: string, user: User) {}
}

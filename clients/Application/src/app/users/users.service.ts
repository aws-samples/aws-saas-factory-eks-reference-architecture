import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { find, mergeMap } from 'rxjs/operators';
import { User } from './models/user';

@Injectable({
  providedIn: 'root'
})
export class UsersService {

  constructor(private http: HttpClient) { }
  users: User[] = [{
    Created: new Date('1/2/2020').toString(),
    Modified: new Date('1/2/2020').toString(),
    Email: 'toby@toby.com',
    Status: 'Active',
    Verified: true,
  }]


  fetch(): Observable<User[]> {
    return of(this.users);
  }

  get(email: string): Observable<User> {
    return this.fetch().pipe(
      mergeMap(users => users),
      find(u => u.Email == email)
    );
  }

  create(user: User): Observable<User> {
    this.users.push(user);
    return of(user);
  }

  update(email: string, user:User) {
    this.users = this.users.map(u => {
      if (u.Email === email) {
        return user;
      }
      return u;
    })
  }
}

// User service matching Angular version with JWT token support
import { httpClient } from './httpClient';
import { User, CreateUserRequest } from '../types/User';
import { environment } from '../config/environment';

class UserService {
  private get baseUrl(): string {
    return `${environment.apiUrl}users`;
  }

  async fetch(): Promise<User[]> {
    const response = await httpClient.get<User[]>(this.baseUrl);
    return response.data;
  }

  async create(user: CreateUserRequest): Promise<User> {
    const response = await httpClient.post<User>(this.baseUrl, user);
    return response.data;
  }

  // Not implemented as update method is empty in Angular version
  // async update(email: string, user: User): Promise<User> {
  //   // Not implemented in Angular version
  // }
}

export const userService = new UserService();
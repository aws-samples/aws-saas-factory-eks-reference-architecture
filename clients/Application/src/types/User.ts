// User interface matching Angular version
export interface User {
  email: string;
  created?: string;
  modified?: string;
  enabled?: boolean;
  status?: string;
  verified?: boolean;
  role?: string;
  username?: string;
}

// For user creation form
export interface CreateUserRequest {
  userName: string;
  userEmail: string;
  userRole: string;
}
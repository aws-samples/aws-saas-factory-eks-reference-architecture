import axios, { AxiosInstance } from 'axios';
import { environment } from '../config/environment';

class ApiService {
  private api: AxiosInstance;
  private getAccessToken: (() => string | undefined) | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: environment.controlPlaneUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  setTokenProvider(getAccessToken: () => string | undefined) {
    this.getAccessToken = getAccessToken;
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        // Skip auth for issuer URLs and auth-info endpoints
        if (config.url?.includes(environment.issuer) || config.url?.includes('auth-info')) {
          return config;
        }

        const token = this.getAccessToken?.();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized access - let OIDC handle this
          window.location.reload();
        }
        return Promise.reject(error);
      }
    );
  }

  getInstance() {
    return this.api;
  }
}

const apiService = new ApiService();
export default apiService.getInstance();
export { apiService };
// HTTP client with automatic JWT token injection
import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

// Token provider will be set by TenantContext after OIDC auth
let getAccessToken: (() => string | undefined) | null = null;

export function setHttpClientTokenProvider(provider: () => string | undefined) {
  getAccessToken = provider;
}

class HttpClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create();
    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.axiosInstance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        if (config.url?.includes('tenant-config')) {
          return config;
        }

        const token = getAccessToken?.();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Let OIDC handle re-auth
        }
        return Promise.reject(error);
      }
    );
  }

  get<T = any>(url: string, config?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.get<T>(url, config);
  }

  post<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.post<T>(url, data, config);
  }

  put<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.put<T>(url, data, config);
  }

  delete<T = any>(url: string, config?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.delete<T>(url, config);
  }

  patch<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.patch<T>(url, data, config);
  }
}

export const httpClient = new HttpClient();

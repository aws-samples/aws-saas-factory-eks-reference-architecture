// Auth configuration service for SaaS (shared between ECS and EKS)
// Calls SBT ControlPlane tenant-config API to get tenant auth info
import axios from 'axios';
import { environment } from '../config/environment';

// SBT tenant-config API response structure
interface TenantConfigResponse {
  tenantId: string;
  appClientId: string;
  authServer: string;
  redirectUrl: string;
}

export interface TenantAuthConfig {
  tenantId: string;
  appClientId: string;
  authServer: string;     // Cognito OIDC issuer URL
  userPoolId: string;     // Extracted from authServer URL
  apiGatewayUrl: string;
}

/**
 * Extract User Pool ID from Cognito OIDC issuer URL.
 * e.g. "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_n0TntzKQf"
 *   -> "ap-northeast-2_n0TntzKQf"
 */
function extractUserPoolId(authServer: string): string {
  return authServer.split('/').pop()!;
}

class AuthConfigurationService {
  async setTenantConfig(tenantName: string): Promise<TenantAuthConfig> {
    try {
      // controlPlaneUrl is the standard field; apiUrl is fallback for legacy buildspec
      const rawUrl = environment.controlPlaneUrl || (environment as any).apiUrl || '';
      const baseUrl = rawUrl.replace(/\/+$/, '');
      const url = `${baseUrl}/tenant-config/${tenantName}`;

      console.log('Calling tenant config API:', url);

      const response = await axios.get<TenantConfigResponse>(url, {
        headers: { 'Accept': 'application/json' },
        timeout: 10000
      });

      const data = typeof response.data === 'string'
        ? JSON.parse(response.data)
        : response.data;

      if (!data?.appClientId || !data?.authServer) {
        throw new Error('Invalid tenant config response');
      }

      const userPoolId = extractUserPoolId(data.authServer);

      const config: TenantAuthConfig = {
        tenantId: data.tenantId || tenantName,
        appClientId: data.appClientId,
        authServer: data.authServer,
        userPoolId,
        apiGatewayUrl: '',
      };

      // Store in sessionStorage
      sessionStorage.setItem('app_tenantName', tenantName);
      sessionStorage.setItem('app_tenantId', config.tenantId);
      sessionStorage.setItem('app_appClientId', config.appClientId);
      sessionStorage.setItem('app_authServer', config.authServer);
      sessionStorage.setItem('app_userPoolId', config.userPoolId);
      sessionStorage.setItem('app_apiGatewayUrl', config.apiGatewayUrl);

      console.log('Tenant config set successfully:', config);
      return config;
    } catch (error) {
      console.error('Error setting tenant config:', error);
      throw error;
    }
  }

  cleanSessionStorage(): void {
    sessionStorage.removeItem('app_tenantName');
    sessionStorage.removeItem('app_tenantId');
    sessionStorage.removeItem('app_appClientId');
    sessionStorage.removeItem('app_authServer');
    sessionStorage.removeItem('app_userPoolId');
    sessionStorage.removeItem('app_apiGatewayUrl');
  }

  getTenantName(): string | null {
    return sessionStorage.getItem('app_tenantName');
  }

  getAppClientId(): string | null {
    return sessionStorage.getItem('app_appClientId');
  }

  getAuthServer(): string | null {
    return sessionStorage.getItem('app_authServer');
  }

  getUserPoolId(): string | null {
    return sessionStorage.getItem('app_userPoolId');
  }

  getTenantId(): string | null {
    return sessionStorage.getItem('app_tenantId');
  }

  getApiGatewayUrl(): string | null {
    return sessionStorage.getItem('app_apiGatewayUrl');
  }
}

export const authConfigService = new AuthConfigurationService();

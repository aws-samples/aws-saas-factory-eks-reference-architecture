import api from './api';
import { Tenant, TenantRegistrationData, CreateTenantRequest } from '../models/tenant';
import { environment } from '../config/environment';
import { handleApiError } from '../types/errors';

class TenantService {
  private baseUrl = environment.controlPlaneUrl;
  private tenantsApiUrl = `${this.baseUrl}/tenant-registrations`;
  private tenantsMgmtApiUrl = `${this.baseUrl}/tenants`;

  async fetchTenants(): Promise<Tenant[]> {
    try {
      let allTenants: Tenant[] = [];
      let nextToken: string | undefined;
      const limit = 100;
      
      do {
        const url = nextToken 
          ? `${this.tenantsMgmtApiUrl}?limit=${limit}&next_token=${nextToken}`
          : `${this.tenantsMgmtApiUrl}?limit=${limit}`;
          
        const response = await api.get<{ data: Tenant[], next_token?: string }>(url);
        
        if (response.data.data) {
          allTenants = allTenants.concat(response.data.data);
        }
        
        nextToken = response.data.next_token;
      } while (nextToken);
      
      return allTenants;
    } catch (error: any) {
      throw new Error(handleApiError(error));
    }
  }

  async fetchTenantsPage(nextToken?: string): Promise<{ data: Tenant[], nextToken?: string }> {
    try {
      const limit = 18; // 18 items for 3-column grid (6 rows × 3 columns)
      const url = nextToken 
        ? `${this.tenantsMgmtApiUrl}?limit=${limit}&next_token=${nextToken}`
        : `${this.tenantsMgmtApiUrl}?limit=${limit}`;
        
      const response = await api.get<{ data: Tenant[], next_token?: string }>(url);
      
      return {
        data: response.data.data || [],
        nextToken: response.data.next_token
      };
    } catch (error: any) {
      throw new Error(handleApiError(error));
    }
  }

  async createTenant(tenant: CreateTenantRequest): Promise<any> {
    try {
      const response = await api.post(this.tenantsApiUrl, tenant);
      return response.data;
    } catch (error: any) {
      throw new Error(handleApiError(error));
    }
  }

  async getTenant(id: string): Promise<TenantRegistrationData> {
    try {
      const response = await api.get<{ data: TenantRegistrationData }>(`${this.tenantsApiUrl}/${id}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(handleApiError(error));
    }
  }

  async deleteTenant(tenant: any): Promise<any> {
    try {
      const tenantId = tenant.tenantRegistrationData?.tenantRegistrationId || 
                      tenant.tenantRegistrationId ||
                      tenant.id ||
                      tenant.tenantId;
      
      if (!tenantId) {
        throw new Error('Tenant ID not found in tenant object');
      }
      
      const response = await api.delete(`${this.tenantsApiUrl}/${tenantId}`, {
        data: tenant,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(handleApiError(error));
    }
  }
}

export const tenantService = new TenantService();
export default tenantService;
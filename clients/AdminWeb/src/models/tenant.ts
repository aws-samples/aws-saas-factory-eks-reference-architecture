interface TenantData {
  tenantName?: string | null;
  email?: string | undefined | null;
  companyName?: string | null;
  tier?: string | undefined | null;
}

export interface TenantRegistrationData {
  tenantRegistrationId?: string;
  registrationStatus?: string;
}

export interface Tenant {
  tenantId?: string;
  tenantData: TenantData;
  tenantRegistrationData: TenantRegistrationData;
  sbtaws_active?: boolean;
}

export interface CreateTenantRequest {
  tenantData: TenantData;
  tenantRegistrationData: TenantRegistrationData;
}

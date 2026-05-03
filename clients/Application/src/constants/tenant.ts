export const TENANT_DEFAULTS = {
  REGISTRATION_STATUS: 'In progress' as const
} as const;

export const createTenantId = (tenantName: string): string => {
  return tenantName.toLowerCase().replace(/\s+/g, '-');
};
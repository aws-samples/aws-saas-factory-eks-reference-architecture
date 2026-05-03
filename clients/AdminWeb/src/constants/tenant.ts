export const TENANT_DEFAULTS = {
  DEFAULT_TIER: 'basic' as const,
  REGISTRATION_STATUS: 'In progress' as const
} as const;

export const createTenantId = (tenantName: string): string => {
  return tenantName.toLowerCase().replace(/\s+/g, '-');
};
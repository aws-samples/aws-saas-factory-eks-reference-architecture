import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { authConfigService, TenantAuthConfig } from '../services/authConfigService';
import { createTenantId } from '../constants/tenant';

interface Tenant {
  id: string;
  name: string;
  tier?: string;
}

interface TenantContextType {
  tenant: Tenant | null;
  setTenant: (tenant: Tenant | null) => void;
  loading: boolean;
  setTenantConfig: (tenantName: string) => Promise<TenantAuthConfig>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

interface TenantProviderProps {
  children: ReactNode;
}

export const TenantProvider: React.FC<TenantProviderProps> = ({ children }) => {
  const [tenant, setTenantState] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing tenant in sessionStorage on mount
  useEffect(() => {
    const tenantName = sessionStorage.getItem('app_tenantName');
    if (tenantName) {
      const tenantId = sessionStorage.getItem('app_tenantId') || createTenantId(tenantName);
      setTenantState({ id: tenantId, name: tenantName });
    }
    setLoading(false);
  }, []);

  const handleSetTenant = useCallback((newTenant: Tenant | null) => {
    setTenantState(newTenant);
    if (newTenant) {
      sessionStorage.setItem('app_tenantName', newTenant.name);
    } else {
      sessionStorage.removeItem('app_tenantName');
      authConfigService.cleanSessionStorage();
    }
  }, []);

  const setTenantConfig = useCallback(async (tenantName: string): Promise<TenantAuthConfig> => {
    const config = await authConfigService.setTenantConfig(tenantName);
    handleSetTenant({
      id: config.tenantId || createTenantId(tenantName),
      name: tenantName,
    });
    return config;
  }, [handleSetTenant]);

  const value = useMemo(() => ({
    tenant,
    setTenant: handleSetTenant,
    loading,
    setTenantConfig,
  }), [tenant, handleSetTenant, loading, setTenantConfig]);

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

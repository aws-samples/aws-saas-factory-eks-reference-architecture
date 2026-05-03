import { useState, useCallback } from 'react';
import { Tenant } from '../models/tenant';
import tenantService from '../services/tenantService';
import { handleApiError } from '../types/errors';

export const useTenants = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);

  const loadTenants = useCallback(async (reset = false, token?: string) => {
    try {
      if (reset) {
        setLoading(true);
        setTenants([]);
        setNextToken(undefined);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      
      const result = await tenantService.fetchTenantsPage(reset ? undefined : token);
      
      if (reset) {
        setTenants(result.data);
      } else {
        setTenants(prev => [...prev, ...result.data]);
      }
      
      setNextToken(result.nextToken);
      setHasMore(!!result.nextToken);
    } catch (error: any) {
      setError(handleApiError(error));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMoreTenants = useCallback(() => {
    if (loadingMore || !hasMore || !nextToken) return;
    
    setLoadingMore(true);
    setError(null);
    
    tenantService.fetchTenantsPage(nextToken)
      .then(result => {
        setTenants(prev => [...prev, ...result.data]);
        setNextToken(result.nextToken);
        setHasMore(!!result.nextToken);
      })
      .catch(error => {
        setError(handleApiError(error));
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [loadingMore, hasMore, nextToken]);

  const deleteTenant = useCallback(async (tenant: Tenant) => {
    try {
      await tenantService.deleteTenant(tenant);
      // Mark tenant as inactive instead of removing from list
      setTenants(prev => prev.map(t => 
        t.tenantId === tenant.tenantId 
          ? { ...t, sbtaws_active: false }
          : t
      ));
    } catch (error: any) {
      setError(handleApiError(error));
      throw error;
    }
  }, []);

  const initialLoad = useCallback(() => {
    loadTenants(true);
  }, [loadTenants]);

  return {
    tenants,
    loading,
    loadingMore,
    error,
    hasMore,
    loadTenants: initialLoad,
    loadMoreTenants,
    deleteTenant
  };
};
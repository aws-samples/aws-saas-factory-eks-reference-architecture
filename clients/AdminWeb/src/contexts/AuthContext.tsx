import React, { createContext, useContext, ReactNode, useMemo, useCallback } from 'react';
import { AuthProvider as OidcAuthProvider, useAuth as useOidcAuth } from 'react-oidc-context';
import { User } from 'oidc-client-ts';
import { oidcConfig } from '../auth/AuthConfig';
import { environment } from '../config/environment';

interface AuthContextType {
  user: User | null | undefined;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: any;
  login: () => void;
  logout: () => void;
  getAccessToken: () => string | undefined;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const AuthProviderInner: React.FC<AuthProviderProps> = ({ children }) => {
  const oidcAuth = useOidcAuth();

  // Enhanced OIDC error handling
  React.useEffect(() => {
    if (oidcAuth.error) {
      // Attempt automatic recovery for specific error types
      if (oidcAuth.error.message?.includes('No matching state found')) {
        oidcAuth.clearStaleState();
      }
    }
  }, [oidcAuth.error, oidcAuth.clearStaleState, oidcAuth]);

  const login = useCallback(() => {
    try {
      oidcAuth.signinRedirect();
    } catch (error) {
      // Login redirect failed - error handled by OIDC context
    }
  }, [oidcAuth.signinRedirect, oidcAuth]);

  const logout = useCallback(() => {
    try {
      // Clear admin app session storage
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('admin_')) {
          sessionStorage.removeItem(key);
        }
      });
      sessionStorage.clear();
      
      // Direct Cognito logout URL
      const cognitoDomain = environment.issuer.replace('/oauth2/token', '');
      const clientId = environment.clientId;
      const logoutUrl = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(window.location.origin)}`;
      
      window.location.href = logoutUrl;
    } catch (error) {
      // Clear admin app session storage on error
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('admin_')) {
          sessionStorage.removeItem(key);
        }
      });
      sessionStorage.clear();
      window.location.reload();
    }
  }, []);

  const getAccessToken = useCallback(() => oidcAuth.user?.access_token, [oidcAuth.user?.access_token]);

  const clearError = useCallback(() => {
    try {
      oidcAuth.clearStaleState();
    } catch (error) {
      // Clear error failed - handled silently
    }
  }, [oidcAuth.clearStaleState, oidcAuth]);

  const value = useMemo((): AuthContextType => ({
    user: oidcAuth.user,
    isAuthenticated: oidcAuth.isAuthenticated,
    isLoading: oidcAuth.isLoading,
    error: oidcAuth.error,
    login,
    logout,
    getAccessToken,
    clearError,
  }), [oidcAuth.user, oidcAuth.isAuthenticated, oidcAuth.isLoading, oidcAuth.error, login, logout, getAccessToken, clearError]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  return (
    <OidcAuthProvider {...oidcConfig}>
      <AuthProviderInner>
        {children}
      </AuthProviderInner>
    </OidcAuthProvider>
  );
};
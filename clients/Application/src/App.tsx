import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { CircularProgress, Box, Typography } from "@mui/material";
import { AuthProvider, useAuth } from "react-oidc-context";
import { UserManagerSettings } from "oidc-client-ts";
import Layout from "./components/Layout/Layout";
import Dashboard from "./pages/Dashboard/Dashboard";
import ProductList from "./pages/Products/ProductList";
import ProductCreate from "./pages/Products/ProductCreate";
import ProductEdit from "./pages/Products/ProductEdit";
import OrderList from "./pages/Orders/OrderList";
import OrderCreate from "./pages/Orders/OrderCreate";
import OrderDetail from "./pages/Orders/OrderDetail";
import UserList from "./pages/Users/UserList";
import UserCreate from "./pages/Users/UserCreate";
import AuthInfo from "./pages/Auth/AuthInfo";
import UnauthorizedPage from "./pages/Error/UnauthorizedPage";
import { useTenant } from "./contexts/TenantContext";
import { setHttpClientTokenProvider } from "./services/httpClient";
import ErrorBoundary from "./components/ErrorBoundary";

// Authenticated routes
const AuthenticatedApp: React.FC = () => {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/create" element={<ProductCreate />} />
          <Route path="/products/:id/edit" element={<ProductEdit />} />
          <Route path="/orders" element={<OrderList />} />
          <Route path="/orders/create" element={<OrderCreate />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/users" element={<UserList />} />
          <Route path="/users/create" element={<UserCreate />} />
          <Route path="/auth/info" element={<AuthInfo />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
};

// Inner app that handles OIDC auth state and token provider
const AppWithAuth: React.FC = () => {
  const auth = useAuth();

  // Set up token provider for httpClient when authenticated
  useEffect(() => {
    if (auth.user?.id_token) {
      setHttpClientTokenProvider(() => auth.user?.id_token);
    }
  }, [auth.user?.id_token]);

  // Clean up OIDC callback params from URL after successful auth
  useEffect(() => {
    if (auth.isAuthenticated) {
      const url = new URL(window.location.href);
      if (url.searchParams.has('code') || url.searchParams.has('state')) {
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        window.history.replaceState({}, '', url.pathname + url.hash);
      }
    }
  }, [auth.isAuthenticated]);

  useEffect(() => {
    // Auto-login if not authenticated
    if (!auth.isLoading && !auth.isAuthenticated && !auth.error) {
      const forceLogin = sessionStorage.getItem('oidc_force_login');
      if (forceLogin) {
        sessionStorage.removeItem('oidc_force_login');
        auth.signinRedirect({ prompt: 'login' });
      } else {
        auth.signinRedirect();
      }
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.error]);

  if (auth.isLoading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" gap={2}>
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">Authenticating...</Typography>
      </Box>
    );
  }

  if (auth.error) {
    // Stale OIDC callback params — clear URL and retry login
    if (auth.error.message.includes('No matching state')) {
      window.history.replaceState({}, '', window.location.pathname);
      auth.signinRedirect();
      return (
        <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" gap={2}>
          <CircularProgress size={60} />
          <Typography variant="h6" color="text.secondary">Redirecting to login...</Typography>
        </Box>
      );
    }
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" gap={2}>
        <Typography variant="h6" color="error">Authentication Error: {auth.error.message}</Typography>
      </Box>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" gap={2}>
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">Redirecting to login...</Typography>
      </Box>
    );
  }

  return <AuthenticatedApp />;
};

function App() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [oidcConfig, setOidcConfig] = useState<UserManagerSettings | null>(null);

  // Build OIDC config from tenant auth info in sessionStorage
  useEffect(() => {
    const authServer = sessionStorage.getItem('app_authServer');
    const appClientId = sessionStorage.getItem('app_appClientId');

    if (authServer && appClientId) {
      setOidcConfig({
        authority: authServer,
        client_id: appClientId,
        redirect_uri: window.location.origin,
        post_logout_redirect_uri: window.location.origin,
        response_type: 'code',
        scope: 'openid profile email',
        automaticSilentRenew: false,
        loadUserInfo: true,
      });
    }
  }, [tenant]);

  if (tenantLoading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" gap={2}>
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">Loading tenant configuration...</Typography>
      </Box>
    );
  }

  // No tenant configured — show tenant selection
  // Clean up any OIDC callback params from URL to prevent auto-login with stale code
  if (!tenant || !oidcConfig) {
    const url = new URL(window.location.href);
    if (url.searchParams.has('code') || url.searchParams.has('state')) {
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    return <UnauthorizedPage />;
  }

  // Tenant configured — wrap with OIDC AuthProvider
  return (
    <AuthProvider {...oidcConfig}>
      <AppWithAuth />
    </AuthProvider>
  );
}

export default App;

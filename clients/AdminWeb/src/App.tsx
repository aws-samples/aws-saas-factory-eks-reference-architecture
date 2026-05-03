import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, Typography, Alert } from '@mui/material';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import TenantList from './pages/Tenants/TenantList';
import TenantCreate from './pages/Tenants/TenantCreate';
import TenantDetail from './pages/Tenants/TenantDetail';
import AuthInfo from './pages/Auth/AuthInfo';
import AuthCallback from './components/Auth/AuthCallback';
import { useAuth } from './contexts/AuthContext';
import { apiService } from './services/api';

function App() {
  const { isAuthenticated, isLoading, login, getAccessToken, error, clearError } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Set up API service with token provider
    apiService.setTokenProvider(getAccessToken);
  }, [getAccessToken]);

  // When error occurs
  if (error) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" gap={2}>
        <Alert severity="error" sx={{ maxWidth: 600 }}>
          <Typography variant="h6">Authentication Error</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {error.message || 'There was a problem with authentication.'}
          </Typography>
        </Alert>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <button onClick={clearError} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Clear Error
          </button>
          <button onClick={() => { clearError(); login(); }} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Try Again
          </button>
        </Box>
      </Box>
    );
  }

  // While loading
  if (isLoading) {
    return <AuthCallback />;
  }

  // When not authenticated
  if (!isAuthenticated) {
    // Check if URL has authentication related parameters (Cognito callback)
    const urlParams = new URLSearchParams(window.location.search);
    const hasAuthParams = urlParams.has('code') || urlParams.has('state') || urlParams.has('error');
    
    // Also check hash fragment (used in some OIDC flows)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const hasHashAuthParams = hashParams.has('code') || hashParams.has('state') || hashParams.has('access_token');
    
    // Only redirect to login if no auth parameters and not on error page
    if (!hasAuthParams && !hasHashAuthParams && !location.pathname.includes('error')) {
      // Give OIDC library time to initialize with slight delay
      setTimeout(() => {
        if (!isAuthenticated) {
          login();
        }
      }, 100);
    }
    
    return <AuthCallback />;
  }

  // Main application after authentication complete
  return (
    <Routes>
      {/* Authentication callback handling */}
      <Route path="/callback" element={<AuthCallback />} />
      <Route path="/signin-oidc" element={<AuthCallback />} />
      
      {/* Error page */}
      <Route path="/error" element={
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <Alert severity="error">
            <Typography variant="h6">Authentication Error</Typography>
            <Typography>There was a problem with authentication. Please try again.</Typography>
          </Alert>
        </Box>
      } />
      
      {/* Main application routes */}
      <Route path="/*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/tenants" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tenants" element={<TenantList />} />
            <Route path="/tenants/create" element={<TenantCreate />} />
            <Route path="/tenants/:id" element={<TenantDetail />} />
            <Route path="/auth/info" element={<AuthInfo />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  );
}

export default App;
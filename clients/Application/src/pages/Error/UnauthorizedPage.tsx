import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  TextField,
  Button,
  Alert,
  Container,
  CircularProgress,
} from '@mui/material';
import {
  Home as HomeIcon,
} from '@mui/icons-material';
import { useTenant } from '../../contexts/TenantContext';
import { useNavigate } from 'react-router-dom';


const UnauthorizedPage: React.FC = () => {
  const { setTenantConfig } = useTenant();
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(true);

  // Check for tenant in URL query param or sessionStorage
  useEffect(() => {
    const storedTenantName = sessionStorage.getItem('app_tenantName');
    if (storedTenantName) {
      navigate('/dashboard');
      return;
    }

    // Check URL query param for auto-login
    const urlParams = new URLSearchParams(window.location.search);
    const tenantParam = urlParams.get('tenant');
    if (tenantParam) {
      // Clear the tenant param from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('tenant');
      window.history.replaceState({}, '', url.pathname + url.search);

      // Auto-submit tenant config
      handleAutoLogin(tenantParam);
    } else {
      setAutoLoading(false);
    }
  }, [navigate]);

  const handleAutoLogin = async (tenant: string) => {
    try {
      await setTenantConfig(tenant.trim());
      // After setTenantConfig, App.tsx will detect tenant and redirect to Cognito
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Invalid tenant name');
      setAutoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!tenantName.trim()) {
      setError('No tenant name provided.');
      return;
    }

    setLoading(true);

    try {
      await setTenantConfig(tenantName.trim());
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'An unexpected error occurred!');
      setLoading(false);
    }
  };

  // Show loading while auto-login is in progress
  if (autoLoading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" gap={2}
        sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <CircularProgress size={60} sx={{ color: 'white' }} />
        <Typography variant="h6" sx={{ color: 'white' }}>Loading tenant configuration...</Typography>
      </Box>
    );
  }

  const isFormValid = tenantName.trim().length > 0;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Box component="form" onSubmit={handleSubmit}>
          <Card
            sx={{
              maxWidth: 500,
              mx: 'auto',
              borderRadius: 3,
              boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Typography 
                variant="h4" 
                component="h1" 
                gutterBottom 
                align="center"
                sx={{ 
                  fontWeight: 600,
                  color: '#2c3e50',
                  mb: 1
                }}
              >
                Tenant Name
              </Typography>
              
              <Typography 
                variant="body1" 
                color="text.secondary" 
                align="center" 
                sx={{ mb: 4 }}
              >
                Enter your tenant name and click submit below
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {error}
                </Alert>
              )}

              <TextField
                fullWidth
                label="Tenant Name"
                placeholder="Enter Tenant Name"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                required
                variant="outlined"
                sx={{ mb: 3 }}
                InputProps={{
                  endAdornment: <HomeIcon sx={{ color: 'text.secondary' }} />,
                }}
              />

              <CardActions sx={{ p: 0 }}>
                <Box sx={{ width: '100%', textAlign: 'center' }}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={!isFormValid || loading}
                    sx={{
                      px: 4,
                      py: 1.5,
                      fontSize: '1rem',
                      fontWeight: 600,
                      borderRadius: 2,
                      textTransform: 'none',
                    }}
                  >
                    {loading ? 'Submitting...' : 'Submit'}
                  </Button>
                </Box>
              </CardActions>
            </CardContent>
          </Card>
        </Box>
      </Container>
    </Box>
  );
};

export default UnauthorizedPage;
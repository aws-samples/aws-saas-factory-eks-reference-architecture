import React, { useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const AuthCallback: React.FC = () => {
  const {} = useAuth();

  useEffect(() => {
    // OIDC callback processing is handled automatically by react-oidc-context
    // When loading completes, App.tsx automatically redirects
  }, []);

  return (
    <Box 
      display="flex" 
      flexDirection="column"
      justifyContent="center" 
      alignItems="center" 
      minHeight="100vh"
      gap={2}
    >
      <CircularProgress size={60} />
      <Typography variant="h6" color="text.secondary">
        Processing authentication...
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Please wait while we complete your sign-in.
      </Typography>
    </Box>
  );
};

export default AuthCallback;
import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuth } from 'react-oidc-context';
import { useTenant } from '../../contexts/TenantContext';

// JWT Token Utilities
interface DecodedJWT {
  header: any;
  payload: any;
  signature: string;
  raw: {
    header: string;
    payload: string;
    signature: string;
  };
}

const decodeJWT = (token: string): DecodedJWT | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    const base64UrlDecode = (str: string): string => {
      let padded = str;
      while (padded.length % 4) {
        padded += '=';
      }
      padded = padded.replace(/-/g, '+').replace(/_/g, '/');
      return atob(padded);
    };

    const headerJson = base64UrlDecode(headerB64);
    const payloadJson = base64UrlDecode(payloadB64);

    return {
      header: JSON.parse(headerJson),
      payload: JSON.parse(payloadJson),
      signature: signatureB64,
      raw: { header: headerB64, payload: payloadB64, signature: signatureB64 },
    };
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
};


const TokenSection: React.FC<{
  title: string;
  token: string | undefined;
  tooltip: string;
  onCopy: (text: string) => void;
}> = ({ title, token, tooltip, onCopy }) => {
  if (!token) {
    return (
      <Typography variant="body2" color="text.secondary">
        No {title.toLowerCase()} available
      </Typography>
    );
  }

  const decoded = decodeJWT(token);

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">Raw Token</Typography>
          <Box sx={{ position: 'relative' }}>
            <Box
              sx={{
                cursor: 'pointer', color: 'primary.main', fontSize: '1rem',
                width: '16px', height: '16px', border: '1px solid currentColor',
                borderRadius: '2px', position: 'relative',
                '&:hover': { color: 'primary.dark' },
                '&::after': {
                  content: '""', position: 'absolute', top: '-2px', left: '2px',
                  width: '12px', height: '12px', border: '1px solid currentColor',
                  borderRadius: '2px', bgcolor: 'background.paper'
                }
              }}
              onClick={() => onCopy(token)}
            />
            {tooltip && (
              <Box sx={{
                position: 'absolute', top: '-30px', right: '0',
                bgcolor: 'rgba(0,0,0,0.8)', color: 'white',
                px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem', whiteSpace: 'nowrap'
              }}>
                {tooltip}
              </Box>
            )}
          </Box>
        </Box>
        <Typography variant="body2" sx={{
          fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all',
          bgcolor: 'rgba(0, 0, 0, 0.05)', p: 1, borderRadius: 1,
          maxHeight: '100px', overflow: 'auto'
        }}>
          {token}
        </Typography>
      </Box>

      {decoded ? (
        <>
          <Accordion sx={{ mb: 1, bgcolor: 'transparent', boxShadow: 'none' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight="medium">Header</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" component="pre" sx={{
                fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap',
                bgcolor: 'rgba(0, 0, 0, 0.05)', p: 1, borderRadius: 1, overflow: 'auto'
              }}>
                {JSON.stringify(decoded.header, null, 2)}
              </Typography>
            </AccordionDetails>
          </Accordion>
          <Accordion sx={{ mb: 1, bgcolor: 'transparent', boxShadow: 'none' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight="medium">Payload</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" component="pre" sx={{
                fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap',
                bgcolor: 'rgba(0, 0, 0, 0.05)', p: 1, borderRadius: 1, overflow: 'auto'
              }}>
                {JSON.stringify(decoded.payload, null, 2)}
              </Typography>
            </AccordionDetails>
          </Accordion>
          <Accordion sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight="medium">Signature</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" sx={{
                fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all',
                bgcolor: 'rgba(0, 0, 0, 0.05)', p: 1, borderRadius: 1
              }}>
                {decoded.signature}
              </Typography>
            </AccordionDetails>
          </Accordion>
        </>
      ) : (
        <Typography variant="body2" color="error">Failed to decode token</Typography>
      )}
    </>
  );
};


const cardSx = {
  border: 0,
  bgcolor: 'rgba(255, 255, 255, 0.5)',
  backdropFilter: 'blur(12px)',
  borderRadius: 3,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
  minHeight: 400,
  display: 'flex',
  flexDirection: 'column',
};

const AuthInfo: React.FC = () => {
  const auth = useAuth();
  const { tenant } = useTenant();
  const [idTooltip, setIdTooltip] = React.useState('');
  const [accessTooltip, setAccessTooltip] = React.useState('');

  const copyWithTooltip = (text: string, setter: (v: string) => void) => {
    navigator.clipboard.writeText(text);
    setter('Copied!!');
    setTimeout(() => setter(''), 2000);
  };

  const profile = auth.user?.profile;
  const idToken = auth.user?.id_token;
  const accessToken = auth.user?.access_token;

  return (
    <div className="page-container">
      <div className="container">
        <div>
          <Typography variant="h4" className="page-title">
            Authentication Information
          </Typography>
          <Typography variant="body2" className="page-subtitle">
            View detailed authentication tokens and user profile information
          </Typography>
        </div>
        
        <Grid container spacing={3}>
          {/* User Profile */}
          <Grid item xs={12} md={6}>
            <Card sx={cardSx}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>User Profile</Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Subject (User ID)</Typography>
                  <Typography variant="body1">{profile?.sub || 'N/A'}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Email</Typography>
                  <Typography variant="body1">{profile?.email as string || 'N/A'}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Preferred Username</Typography>
                  <Typography variant="body1">{profile?.preferred_username as string || profile?.['cognito:username'] as string || 'N/A'}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Email Verified</Typography>
                  <Chip
                    label={profile?.email_verified ? 'Verified' : 'Not Verified'}
                    color={profile?.email_verified ? 'success' : 'warning'}
                    variant="outlined" size="small"
                  />
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Authentication Status</Typography>
                  <Chip label="Authenticated" color="success" variant="outlined" size="small" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Tenant Information */}
          <Grid item xs={12} md={6}>
            <Card sx={{ ...cardSx, minHeight: 300 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Tenant Information</Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Tenant ID</Typography>
                  <Typography variant="body1">{tenant?.id || 'N/A'}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Tenant Name</Typography>
                  <Typography variant="body1">{tenant?.name || 'N/A'}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Tier</Typography>
                  <Chip label={tenant?.tier?.toUpperCase() || 'N/A'} color="primary" variant="outlined" size="small" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* ID Token Analysis */}
          <Grid item xs={12} md={6}>
            <Card sx={{ ...cardSx, minHeight: 500 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>ID Token Analysis</Typography>
                <TokenSection
                  title="ID Token"
                  token={idToken}
                  tooltip={idTooltip}
                  onCopy={(text) => copyWithTooltip(text, setIdTooltip)}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Access Token Analysis */}
          <Grid item xs={12} md={6}>
            <Card sx={{ ...cardSx, minHeight: 500 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Access Token Analysis</Typography>
                <TokenSection
                  title="Access Token"
                  token={accessToken}
                  tooltip={accessTooltip}
                  onCopy={(text) => copyWithTooltip(text, setAccessTooltip)}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </div>
    </div>
  );
};

export default AuthInfo;
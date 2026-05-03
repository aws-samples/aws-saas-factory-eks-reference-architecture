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
import { useAuth } from '../../contexts/AuthContext';
import { decodeJWT, formatTimestamp } from '../../utils/jwtUtils';
import "../../styles/index.css";

const AuthInfo: React.FC = () => {
  const { user, isAuthenticated } = useAuth();

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
          <Grid item xs={12} md={6}>
            <Card 
              className="glass-card auth-info-card-tall"
              sx={{
                border: 0,
                bgcolor: 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(12px)',
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  User Profile
                </Typography>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Subject (User ID)
                  </Typography>
                  <Typography variant="body1">
                    {user?.profile?.sub || 'N/A'}
                  </Typography>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Email
                  </Typography>
                  <Typography variant="body1">
                    {user?.profile?.email || 'N/A'}
                  </Typography>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Preferred Username
                  </Typography>
                  <Typography variant="body1">
                    {user?.profile?.preferred_username || 'N/A'}
                  </Typography>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Email Verified
                  </Typography>
                  <Chip 
                    label={user?.profile?.email_verified ? 'Verified' : 'Not Verified'} 
                    color={user?.profile?.email_verified ? 'success' : 'warning'} 
                    variant="outlined" 
                    size="small"
                  />
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Authentication Status
                  </Typography>
                  <Chip 
                    label={isAuthenticated ? 'Authenticated' : 'Not Authenticated'} 
                    color={isAuthenticated ? 'success' : 'error'} 
                    variant="outlined" 
                    size="small"
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card 
              className="glass-card auth-info-card-standard"
              sx={{
                border: 0,
                bgcolor: 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(12px)',
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Token Information
                </Typography>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Token Type
                  </Typography>
                  <Typography variant="body1">
                    {user?.token_type || 'N/A'}
                  </Typography>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Scope
                  </Typography>
                  <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>
                    {user?.scope || 'N/A'}
                  </Typography>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Expires At
                  </Typography>
                  <Typography variant="body1">
                    {user?.expires_at ? formatTimestamp(user.expires_at) : 'N/A'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* ID Token Analysis */}
          <Grid item xs={12} md={6}>
            <Card 
              className="glass-card jwt-token-card"
              sx={{
                border: 0,
                bgcolor: 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(12px)',
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  ID Token Analysis
                </Typography>
                
                {user?.id_token ? (
                  <>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Raw Token
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontFamily: 'monospace', 
                          fontSize: '0.75rem', 
                          wordBreak: 'break-all',
                          bgcolor: 'rgba(0, 0, 0, 0.05)',
                          p: 1,
                          borderRadius: 1,
                          maxHeight: '100px',
                          overflow: 'auto'
                        }}
                      >
                        {user.id_token}
                      </Typography>
                    </Box>

                    {(() => {
                      const decoded = decodeJWT(user.id_token);
                      return decoded ? (
                        <>
                          <Accordion sx={{ mb: 1, bgcolor: 'transparent', boxShadow: 'none' }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="body2" fontWeight="medium">Header</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography 
                                variant="body2" 
                                component="pre" 
                                sx={{ 
                                  fontFamily: 'monospace', 
                                  fontSize: '0.75rem',
                                  whiteSpace: 'pre-wrap',
                                  bgcolor: 'rgba(0, 0, 0, 0.05)',
                                  p: 1,
                                  borderRadius: 1,
                                  overflow: 'auto'
                                }}
                              >
                                {JSON.stringify(decoded.header, null, 2)}
                              </Typography>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion sx={{ mb: 1, bgcolor: 'transparent', boxShadow: 'none' }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="body2" fontWeight="medium">Payload</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography 
                                variant="body2" 
                                component="pre" 
                                sx={{ 
                                  fontFamily: 'monospace', 
                                  fontSize: '0.75rem',
                                  whiteSpace: 'pre-wrap',
                                  bgcolor: 'rgba(0, 0, 0, 0.05)',
                                  p: 1,
                                  borderRadius: 1,
                                  overflow: 'auto'
                                }}
                              >
                                {JSON.stringify(decoded.payload, null, 2)}
                              </Typography>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="body2" fontWeight="medium">Signature</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontFamily: 'monospace', 
                                  fontSize: '0.75rem',
                                  wordBreak: 'break-all',
                                  bgcolor: 'rgba(0, 0, 0, 0.05)',
                                  p: 1,
                                  borderRadius: 1
                                }}
                              >
                                {decoded.signature}
                              </Typography>
                            </AccordionDetails>
                          </Accordion>
                        </>
                      ) : (
                        <Typography variant="body2" color="error">
                          Failed to decode ID token
                        </Typography>
                      );
                    })()}
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No ID token available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Access Token Analysis */}
          <Grid item xs={12} md={6}>
            <Card 
              className="glass-card jwt-token-card"
              sx={{
                border: 0,
                bgcolor: 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(12px)',
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Access Token Analysis
                </Typography>
                
                {user?.access_token ? (
                  <>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Raw Token
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontFamily: 'monospace', 
                          fontSize: '0.75rem', 
                          wordBreak: 'break-all',
                          bgcolor: 'rgba(0, 0, 0, 0.05)',
                          p: 1,
                          borderRadius: 1,
                          maxHeight: '100px',
                          overflow: 'auto'
                        }}
                      >
                        {user.access_token}
                      </Typography>
                    </Box>

                    {(() => {
                      const decoded = decodeJWT(user.access_token);
                      return decoded ? (
                        <>
                          <Accordion sx={{ mb: 1, bgcolor: 'transparent', boxShadow: 'none' }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="body2" fontWeight="medium">Header</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography 
                                variant="body2" 
                                component="pre" 
                                sx={{ 
                                  fontFamily: 'monospace', 
                                  fontSize: '0.75rem',
                                  whiteSpace: 'pre-wrap',
                                  bgcolor: 'rgba(0, 0, 0, 0.05)',
                                  p: 1,
                                  borderRadius: 1,
                                  overflow: 'auto'
                                }}
                              >
                                {JSON.stringify(decoded.header, null, 2)}
                              </Typography>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion sx={{ mb: 1, bgcolor: 'transparent', boxShadow: 'none' }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="body2" fontWeight="medium">Payload</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography 
                                variant="body2" 
                                component="pre" 
                                sx={{ 
                                  fontFamily: 'monospace', 
                                  fontSize: '0.75rem',
                                  whiteSpace: 'pre-wrap',
                                  bgcolor: 'rgba(0, 0, 0, 0.05)',
                                  p: 1,
                                  borderRadius: 1,
                                  overflow: 'auto'
                                }}
                              >
                                {JSON.stringify(decoded.payload, null, 2)}
                              </Typography>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="body2" fontWeight="medium">Signature</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontFamily: 'monospace', 
                                  fontSize: '0.75rem',
                                  wordBreak: 'break-all',
                                  bgcolor: 'rgba(0, 0, 0, 0.05)',
                                  p: 1,
                                  borderRadius: 1
                                }}
                              >
                                {decoded.signature}
                              </Typography>
                            </AccordionDetails>
                          </Accordion>
                        </>
                      ) : (
                        <Typography variant="body2" color="error">
                          Failed to decode Access token
                        </Typography>
                      );
                    })()}
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No Access token available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </div>
    </div>
  );
};

export default AuthInfo;
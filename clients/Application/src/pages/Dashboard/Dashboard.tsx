import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Paper,
  Button,
  Stack,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  ShoppingCart as ShoppingCartIcon,
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { useAuth } from 'react-oidc-context';
import { useTenant } from '../../contexts/TenantContext';
import { environment } from '../../config/environment';

/**
 * Application Dashboard for SaaS tenants.
 *
 * SSO entry link generation is **fully driven by `environment.services`** —
 * the CDK `static-sites-stack` buildspec reads active service names from
 * `services-template.json` and injects them into this config at build time.
 *
 * To add a new service, just add it to `services-template.json`. No
 * Dashboard edits required.
 *
 * Path convention (enforced by CDK + Istio VirtualService):
 *   SSO entry:  {apiUrl}/<service-name>/sso-entry?_jwt=<id_token>
 *   Page:       {apiUrl}/<service-name>/<page>
 */
const Dashboard: React.FC = () => {
  const { tenant } = useTenant();
  const auth = useAuth();

  const openService = (serviceName: string): void => {
    const token = auth.user?.id_token;

    if (!token) {
      alert('No auth token found. Please log in again.');
      return;
    }

    // Expiry check — the Cognito id_token defaults to a 1-hour TTL. With
    // `automaticSilentRenew: false` users who stay on the Dashboard for a
    // long time can accumulate an expired token. Sending an expired token
    // through /sso-entry results in a 401 from the API Gateway
    // queryJwtAuthorizer Lambda and a Cognito error page in the new tab.
    // Detect this at click time and force re-login instead.
    //
    // `exp` is a Unix-seconds timestamp in the JWT payload. A 30-second
    // buffer absorbs minor clock drift between the browser and the server.
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp - nowSec < 30) {
        alert('Your session has expired. Please log in again.');
        auth.signoutRedirect().catch(() => {
          window.location.href = '/';
        });
        return;
      }
    } catch {
      // JWT parse failed — defensively let it through and rely on the
      // server-side 401 to surface the problem.
    }

    const base = environment.apiUrl.replace(/\/$/, '');
    const url = `${base}/${serviceName}/sso-entry?_jwt=${encodeURIComponent(token)}`;

    // Passing a named target as the 2nd argument of `window.open` causes
    // Chrome to apply a COOP-like isolation between cross-origin windows
    // and to label the request `(blocked:origin)` in DevTools. Even a
    // per-click unique name (e.g. `Date.now()`) does not help. The cleanest
    // approach is plain `_blank`.
    //
    // `noopener`/`noreferrer` also trigger `(blocked:origin)` in
    // cross-origin SSO flows and block the cookie from being sent, so
    // leave the features argument empty as well.
    window.open(url, '_blank');
  };

  const stats = [
    { title: 'Total Products', value: '24', icon: <InventoryIcon />, color: '#1976d2' },
    { title: 'Total Orders', value: '156', icon: <ShoppingCartIcon />, color: '#2e7d32' },
    { title: 'Active Users', value: '8', icon: <PeopleIcon />, color: '#ed6c02' },
    { title: 'Revenue Growth', value: '+12%', icon: <TrendingUpIcon />, color: '#9c27b0' },
  ];

  // Filter out the reverse-proxy entry (ECS legacy) and any falsy values.
  // EKS doesn't use rproxy, but the filter is harmless and keeps parity
  // with the ECS reference.
  const services = (environment.services ?? []).filter((s) => s && s !== 'rproxy');

  return (
    <Box>
      <Typography variant="h4" className="page-title">Dashboard</Typography>
      <Typography variant="body2" className="page-subtitle">
        Monitor your SaaS platform performance and business metrics
      </Typography>

      {tenant?.tier ? (
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Welcome to {tenant.name} ({tenant.tier} tier)
        </Typography>
      ) : (
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Welcome to {tenant?.name}
        </Typography>
      )}

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card className="dashboard-card card-with-top-border">
              <CardContent className="dashboard-card-content">
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box
                    sx={{
                      backgroundColor: stat.color,
                      color: 'white',
                      borderRadius: 1,
                      p: 1,
                      mr: 2,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {stat.icon}
                  </Box>
                  <Typography variant="h6">{stat.title}</Typography>
                </Box>
                <Typography variant="h4" color={stat.color}>{stat.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Registered services — clickable cards that SSO-enter each service */}
      {services.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Applications</Typography>
          <Stack spacing={2}>
            {services.map((name) => (
              <Paper
                key={name}
                sx={{
                  p: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Box>
                  <Typography variant="h6" sx={{ textTransform: 'capitalize' }}>
                    {name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Open {name} with single sign-on in a new tab
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<OpenInNewIcon />}
                  onClick={() => openService(name)}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Open
                </Button>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}

      {services.length === 0 && (
        <Box sx={{ mt: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Activity
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • No registered services yet — add entries to
              <code> services-template.json </code> and redeploy.
            </Typography>
          </Paper>
        </Box>
      )}
    </Box>
  );
};

export default Dashboard;

import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Paper,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  ShoppingCart as ShoppingCartIcon,
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
} from '@mui/icons-material';
import { useTenant } from '../../contexts/TenantContext';

const Dashboard: React.FC = () => {
  const { tenant } = useTenant();

  const stats = [
    {
      title: 'Total Products',
      value: '24',
      icon: <InventoryIcon />,
      color: '#1976d2',
    },
    {
      title: 'Total Orders',
      value: '156',
      icon: <ShoppingCartIcon />,
      color: '#2e7d32',
    },
    {
      title: 'Active Users',
      value: '8',
      icon: <PeopleIcon />,
      color: '#ed6c02',
    },
    {
      title: 'Revenue Growth',
      value: '+12%',
      icon: <TrendingUpIcon />,
      color: '#9c27b0',
    },
  ];

  return (
    <Box>
      <div>
        <Typography variant="h4" className="page-title">
          Dashboard
        </Typography>
        <Typography variant="body2" className="page-subtitle">
          Monitor your SaaS platform performance and business metrics
        </Typography>
      </div>
      
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
                  <Typography variant="h6" component="div">
                    {stat.title}
                  </Typography>
                </Box>
                <Typography variant="h4" component="div" color={stat.color}>
                  {stat.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mt: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Recent Activity
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • New order #1234 created
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • Product "Widget A" updated
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • User "john@example.com" registered
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default Dashboard;
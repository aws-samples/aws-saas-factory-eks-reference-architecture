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
  People as PeopleIcon,
  Business as BusinessIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';

const Dashboard: React.FC = () => {
  const stats = [
    {
      title: 'Total Tenants',
      value: '12',
      icon: <PeopleIcon />,
      color: '#1976d2',
    },
    {
      title: 'Active Tenants',
      value: '10',
      icon: <BusinessIcon />,
      color: '#2e7d32',
    },
    {
      title: 'Growth Rate',
      value: '+15%',
      icon: <TrendingUpIcon />,
      color: '#ed6c02',
    },
  ];

  return (
    <Box>
      <div>
        <Typography variant="h4" className="page-title">
          Dashboard
        </Typography>
        <Typography variant="body2" className="page-subtitle">
          Monitor your SaaS platform performance and tenant metrics
        </Typography>
      </div>
      
      <Grid container spacing={3}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Card>
              <CardContent>
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
            No recent activity to display.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default Dashboard;
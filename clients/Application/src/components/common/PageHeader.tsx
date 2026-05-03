import React from 'react';
import { Typography, Box } from '@mui/material';
import '../../styles/components.css';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => {
  return (
    <Box className="page-header">
      <Box className="page-header-container">
        <div>
          <Typography variant="h4" className="page-title">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" className="page-subtitle">
              {subtitle}
            </Typography>
          )}
        </div>
        {actions && <Box>{actions}</Box>}
      </Box>
    </Box>
  );
};

export default PageHeader;
import React from 'react';
import {
  AppBar,
  Box,
  Button,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  Menu as MenuIcon,
  ExitToApp as ExitToAppIcon,
  AccountCircleOutlined as AccountCircleIcon,
} from '@mui/icons-material';
import { DRAWER_WIDTH, LAYOUT_STYLES } from '../constants';
import '../../../styles/components.css';

interface AppHeaderProps {
  userEmail?: string;
  onDrawerToggle: () => void;
  onLogout: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  userEmail,
  onDrawerToggle,
  onLogout,
}) => {
  return (
    <AppBar
      position="fixed"
      sx={{
        width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
        ml: { sm: `${DRAWER_WIDTH}px` },
        ...LAYOUT_STYLES.appBar,
      }}
    >
      <Toolbar>
        <IconButton
          aria-label="open drawer"
          edge="start"
          onClick={onDrawerToggle}
          sx={{ mr: 2, display: { sm: 'none' }, color: '#2c3e50' }}
        >
          <MenuIcon />
        </IconButton>
        <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, color: '#2c3e50' }}>
          SaaS Provider Console
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
          <AccountCircleIcon sx={{ mr: 1, fontSize: 20, color: '#2c3e50' }} />
          <Typography variant="body2" sx={{ color: '#2c3e50' }}>
            {userEmail}
          </Typography>
        </Box>
        <Button
          onClick={onLogout}
          startIcon={<ExitToAppIcon />}
          sx={{ 
            color: '#2c3e50',
            '&:hover': {
              backgroundColor: 'rgba(44, 62, 80, 0.1)'
            }
          }}
        >
          Logout
        </Button>
      </Toolbar>
    </AppBar>
  );
};

export default AppHeader;
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
import { useTenant } from '../../../contexts/TenantContext';
import '../../../styles/components.css';

interface AppHeaderProps {
  desktopOpen: boolean;
  userEmail?: string;
  onDrawerToggle: () => void;
  onMobileDrawerToggle: () => void;
  onLogout: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  desktopOpen,
  userEmail,
  onDrawerToggle,
  onMobileDrawerToggle,
  onLogout,
}) => {
  const { tenant } = useTenant();
  return (
    <AppBar
      position="fixed"
      sx={{
        width: { sm: desktopOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%' },
        ml: { sm: desktopOpen ? `${DRAWER_WIDTH}px` : 0 },
        ...LAYOUT_STYLES.appBar,
        transition: 'width 0.3s, margin-left 0.3s'
      }}
    >
      <Toolbar className="app-header-toolbar">
        <IconButton
          aria-label="open drawer"
          edge="start"
          onClick={onMobileDrawerToggle}
          sx={{ mr: 2, display: { sm: "none" }, color: '#2c3e50', pt: '18px' }}
        >
          <MenuIcon />
        </IconButton>
        <IconButton
          aria-label="toggle drawer"
          edge="start"
          onClick={onDrawerToggle}
          sx={{ mr: 2, display: { xs: "none", sm: "block" }, color: '#2c3e50', pt: '18px' }}
        >
          <MenuIcon />
        </IconButton>
        <Typography variant="h6" noWrap component="div" sx={{ mr: 3, color: '#2c3e50' }}>
          {tenant?.name || 'Tenant Name'}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
          <AccountCircleIcon sx={{ mr: 1, fontSize: '1.2rem', color: '#2c3e50' }} />
          <Typography variant="body2" sx={{ color: '#2c3e50' }}>
            {userEmail || "User"}
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
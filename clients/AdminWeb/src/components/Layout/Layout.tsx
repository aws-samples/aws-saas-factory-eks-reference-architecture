import React, { useMemo } from 'react';
import {
  Box,
  CssBaseline,
  Drawer,
  Toolbar,
} from '@mui/material';
import {
  DashboardOutlined as DashboardIcon,
  BugReportOutlined as BugReportIcon,
  GroupsOutlined as GroupsIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLayout } from './hooks/useLayout';
import { DRAWER_WIDTH } from './constants';
import { LayoutProps, MenuItem } from './types';
import DrawerContent from './components/DrawerContent';
import AppHeader from './components/AppHeader';

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { mobileOpen, handleDrawerToggle } = useLayout();

  const mainMenuItems: MenuItem[] = useMemo(() => [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
    { text: 'Tenants', icon: <GroupsIcon />, path: '/tenants' },
  ], []);

  const bottomMenuItems: MenuItem[] = useMemo(() => [
    { text: 'Auth Debug', icon: <BugReportIcon />, path: '/auth/info' },
  ], []);

  const userEmail = user?.profile?.email || user?.profile?.preferred_username;
  const drawerContent = (
    <DrawerContent
      mainItems={mainMenuItems}
      bottomItems={bottomMenuItems}
      currentPath={location.pathname}
      onNavigate={navigate}
    />
  );

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppHeader
        userEmail={userEmail}
        onDrawerToggle={handleDrawerToggle}
        onLogout={logout}
      />
      <Box
        component="nav"
        sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: DRAWER_WIDTH,
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
};

export default Layout;
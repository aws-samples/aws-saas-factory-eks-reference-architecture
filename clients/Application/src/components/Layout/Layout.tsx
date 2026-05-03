import React, { useMemo, useCallback } from "react";
import {
  Box,
  CssBaseline,
  Drawer,
  Toolbar,
} from "@mui/material";
import {
  DashboardOutlined as DashboardIcon,
  Inventory2Outlined as ProductsIcon,
  ShoppingCartOutlined as OrdersIcon,
  PeopleOutlined as UsersIcon,
  BugReportOutlined as DebugIcon,
  SwapHorizOutlined as SwapIcon,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from 'react-oidc-context';
import { useTenant } from "../../contexts/TenantContext";
import { useLayout } from './hooks/useLayout';
import { DRAWER_WIDTH } from './constants';
import { LayoutProps, MenuItem } from './types';
import DrawerContent from './components/DrawerContent';
import AppHeader from './components/AppHeader';

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { setTenant } = useTenant();
  const { mobileOpen, desktopOpen, handleDrawerToggle, handleMobileDrawerToggle } = useLayout();

  const mainMenuItems: MenuItem[] = useMemo(() => [
    { text: "Dashboard", icon: <DashboardIcon />, path: "/dashboard" },
    { text: "Products", icon: <ProductsIcon />, path: "/products" },
    { text: "Orders", icon: <OrdersIcon />, path: "/orders" },
    { text: "Users", icon: <UsersIcon />, path: "/users" },
  ], []);

  const handleChangeTenant = useCallback(() => {
    setTenant(null);
  }, [setTenant]);

  const handleLogout = useCallback(async () => {
    try {
      const clientId = auth.settings.client_id;
      const authority = auth.settings.authority;
      const logoutUri = window.location.origin;
      const cognitoDomain = `https://${clientId}.auth.${authority.split('cognito-idp.')[1]?.split('.amazonaws')[0]}.amazoncognito.com`;

      // Clear ALL storage first, then set force-login flag, then redirect immediately
      // Do NOT call setTenant(null) or auth.removeUser() — they trigger React re-renders
      // which can cause oidc-client-ts to fire signinRedirect before the redirect happens
      sessionStorage.clear();
      localStorage.clear();
      sessionStorage.setItem('oidc_force_login', 'true');

      // Redirect immediately — no React state updates before this
      window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
    } catch (error) {
      console.error('Logout error:', error);
      sessionStorage.clear();
      window.location.href = window.location.origin;
    }
  }, [auth]);

  const bottomMenuItems: MenuItem[] = useMemo(() => [
    { text: "Auth Debug", icon: <DebugIcon />, path: "/auth/info" },
    { text: "Tenant Change", icon: <SwapIcon />, action: handleChangeTenant },
  ], [handleChangeTenant]);

  const userEmail = String(
    auth.user?.profile?.email ||
    auth.user?.profile?.preferred_username ||
    "User"
  );

  const drawerContent = (
    <DrawerContent
      mainItems={mainMenuItems}
      bottomItems={bottomMenuItems}
      currentPath={location.pathname}
      onNavigate={navigate}
      onAction={(action) => action()}
    />
  );

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppHeader
        desktopOpen={desktopOpen}
        userEmail={userEmail}
        onDrawerToggle={handleDrawerToggle}
        onMobileDrawerToggle={handleMobileDrawerToggle}
        onLogout={handleLogout}
      />
      <Box
        component="nav"
        sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleMobileDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: "block", sm: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="persistent"
          sx={{
            display: { xs: "none", sm: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: DRAWER_WIDTH,
            },
          }}
          open={desktopOpen}
        >
          {drawerContent}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: desktopOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%' },
          transition: 'width 0.3s'
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
};

export default Layout;

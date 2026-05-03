import { useState, useCallback } from 'react';

export const useLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  const handleDrawerToggle = useCallback(() => {
    setMobileOpen(prev => !prev);
    setDesktopOpen(prev => !prev);
  }, []);

  const handleMobileDrawerToggle = useCallback(() => {
    setMobileOpen(prev => !prev);
  }, []);

  return {
    mobileOpen,
    desktopOpen,
    handleDrawerToggle,
    handleMobileDrawerToggle,
  };
};
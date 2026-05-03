import { useState, useCallback } from 'react';

export const useLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = useCallback(() => {
    setMobileOpen(prev => !prev);
  }, []);

  return {
    mobileOpen,
    handleDrawerToggle,
  };
};
import React from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { ShoppingBagOutlined as ShoppingBagIcon } from '@mui/icons-material';
import { MenuItem } from '../types';
import { LAYOUT_STYLES } from '../constants';

interface DrawerContentProps {
  mainItems: MenuItem[];
  bottomItems: MenuItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onAction?: (action: () => void) => void;
}

const DrawerContent: React.FC<DrawerContentProps> = ({
  mainItems,
  bottomItems,
  currentPath,
  onNavigate,
  onAction,
}) => {
  const handleItemClick = (item: MenuItem) => {
    if (item.path) {
      onNavigate(item.path);
    } else if (item.action && onAction) {
      onAction(item.action);
    }
  };

  const renderMenuItems = (items: MenuItem[], isBottom = false) => (
    items.map((item) => (
      <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
        <ListItemButton
          selected={item.path ? currentPath === item.path : false}
          onClick={() => handleItemClick(item)}
          sx={{
            mx: 1,
            borderRadius: 2,
            '&.Mui-selected': {
              backgroundColor: 'rgba(255,255,255,0.2)',
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.25)',
              },
            },
            '&:hover': {
              backgroundColor: 'rgba(255,255,255,0.1)',
            },
            color: 'white'
          }}
        >
          <ListItemIcon sx={{ color: 'white', minWidth: 40 }}>
            {item.icon}
          </ListItemIcon>
          <ListItemText 
            primary={item.text}
            primaryTypographyProps={{
              fontSize: isBottom ? '0.85rem' : '1rem',
              fontWeight: item.path && currentPath === item.path ? (isBottom ? 600 : 700) : (isBottom ? 400 : 500),
              letterSpacing: isBottom ? 'normal' : '0.02em'
            }}
          />
        </ListItemButton>
      </ListItem>
    ))
  );

  return (
    <Box 
      sx={{ 
        height: '100%', 
        backgroundColor: LAYOUT_STYLES.drawer.backgroundColor,
        color: 'white',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Toolbar className="drawer-header" sx={LAYOUT_STYLES.toolbar}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          width: '100%'
        }}>
          <ShoppingBagIcon sx={{ color: '#1976d2', fontSize: 32, strokeWidth: 1.5 }} />
          <Typography variant="h6" sx={{ 
            fontWeight: 'bold',
            color: '#2c3e50',
            lineHeight: 1.2
          }}>
            SaaS Commerce
          </Typography>
        </Box>
      </Toolbar>

      <List sx={{ flexGrow: 1, pt: 2 }}>
        {renderMenuItems(mainItems)}
      </List>

      <Box sx={{ 
        borderTop: '1px solid rgba(255,255,255,0.1)',
        pt: 1,
        pb: 1
      }}>
        {renderMenuItems(bottomItems, true)}
      </Box>
    </Box>
  );
};

export default DrawerContent;
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
import { CloudOutlined as CloudIcon, FactoryOutlined as FactoryIcon } from '@mui/icons-material';
import { MenuItem } from '../types';
import { LAYOUT_STYLES } from '../constants';

interface DrawerContentProps {
  mainItems: MenuItem[];
  bottomItems: MenuItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
}

const DrawerContent: React.FC<DrawerContentProps> = ({
  mainItems,
  bottomItems,
  currentPath,
  onNavigate,
}) => {
  const renderMenuItems = (items: MenuItem[], isBottom = false) => (
    items.map((item) => (
      <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
        <ListItemButton
          selected={currentPath === item.path}
          onClick={() => onNavigate(item.path)}
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
              fontWeight: currentPath === item.path ? (isBottom ? 600 : 700) : (isBottom ? 400 : 500),
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
        background: LAYOUT_STYLES.drawer.background,
        color: 'white',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Toolbar sx={LAYOUT_STYLES.toolbar}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          width: '100%'
        }}>
          <CloudIcon sx={{ color: '#3b82f6', fontSize: 24 }} />
          <Typography variant="h6" sx={{ 
            fontWeight: 'bold',
            color: '#2c3e50',
            lineHeight: 1.2
          }}>
            SaaS Admin
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

      <Box sx={{ 
        borderTop: '1px solid rgba(255,255,255,0.1)',
        py: 2,
        pl: '52px',
        pr: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1
      }}>
        <FactoryIcon sx={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 16 }} />
        <Typography variant="body2" sx={{ 
          color: 'rgba(255, 255, 255, 0.8)',
          fontSize: '0.8rem'
        }}>
          AWS SaaS Factory
        </Typography>
      </Box>
    </Box>
  );
};

export default DrawerContent;
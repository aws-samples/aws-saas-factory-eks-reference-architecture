// Layout component types
export interface MenuItem {
  text: string;
  icon: React.ReactNode;
  path?: string;
  action?: () => void;
}

export interface LayoutProps {
  children: React.ReactNode;
}

export interface DrawerProps {
  items: MenuItem[];
  bottomItems: MenuItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onAction?: (action: () => void) => void;
}
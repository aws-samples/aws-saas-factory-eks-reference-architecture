import { INavData } from '@coreui/angular';

export const navItems: INavData[] = [
  {
    name: 'Dashboard',
    url: '/dashboard',
    iconComponent: { name: 'cil-speedometer' },
  },
  {
    name: 'Products',
    url: '/products',
    iconComponent: { name: 'cil-tag' },
  },
  {
    name: 'Orders',
    url: '/orders',
    iconComponent: { name: 'cil-cart' },
  },
  {
    name: 'Users',
    url: '/users',
    iconComponent: { name: 'cil-people' },
  },
];

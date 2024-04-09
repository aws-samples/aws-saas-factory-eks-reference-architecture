import { Routes } from '@angular/router';
import { DefaultLayoutComponent } from './layout';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: '',
    component: DefaultLayoutComponent,
    data: {
      title: 'Home',
    },
    children: [
      {
        path: 'dashboard',
        loadChildren: () => import('./views/dashboard/routes').then((m) => m.routes),
      },
      {
        path: 'products',
        loadChildren: () => import('./views/products/routes').then((m) => m.routes),
      },
      {
        path: 'orders',
        loadChildren: () => import('./views/orders/routes').then((m) => m.routes),
      },
      {
        path: 'users',
        loadChildren: () => import('./views/users/routes').then((m) => m.routes),
      },
      {
        path: 'error',
        loadChildren: () => import('./views/pages/routes').then((m) => m.routes),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];

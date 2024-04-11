import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'unauthorized',
    loadComponent: () =>
      import('./unauthorized/unauthorized.component').then((m) => m.UnauthorizedComponent),
    data: {
      title: 'Unauthorized',
    },
  },
  { path: '**', redirectTo: 'unauthorized' },
];

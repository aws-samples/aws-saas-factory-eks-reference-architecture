import { Routes } from '@angular/router';
import { TenantListComponent } from './tenant-list.component';
import { CreateComponent } from './create.component';
import { TenantDetailComponent } from './tenant-detail.component';

export const routes: Routes = [
  {
    path: '',
    data: {
      title: 'Tenant Management',
    },
    children: [
      {
        path: '',
        component: TenantListComponent,
        data: {
          title: 'Tenant List',
        },
        // canActivate: [CognitoGuard],
      },
      {
        path: 'create',
        component: CreateComponent,
        data: {
          title: 'Create New Tenant',
        },
        // canActivate: [CognitoGuard],
      },
      {
        path: ':id',
        component: TenantDetailComponent,
        data: {
          title: 'Tenant Detail',
        },
        // canActivate: [CognitoGuard],
      },
    ],
  },
];

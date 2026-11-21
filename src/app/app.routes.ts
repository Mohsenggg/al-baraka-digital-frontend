import { Routes } from '@angular/router';
import { authGuard } from './core/auth/guards/auth.guard';

export const routes: Routes = [
      { path: '', redirectTo: 'pos/login', pathMatch: 'full' },
      { path: 'pos/login', loadComponent: () => import('./features/auth/pages/login/login.component').then(c => c.LoginComponent) },
      { path: 'login', redirectTo: 'pos/login', pathMatch: 'full' },
      { path: 'pos/cashier', loadComponent: () => import('./features/pos/cashier/cashier-page.component').then(c => c.CashierPageComponent), canActivate: [authGuard] },
      { path: 'pos/receipts', loadComponent: () => import('./features/pos/receipts/receipt-list.component').then(c => c.ReceiptListComponent), canActivate: [authGuard] },
      { path: 'pos/receipt-form', loadComponent: () => import('./features/pos/receipts/receipt-form.component').then(c => c.ReceiptFormComponent), canActivate: [authGuard] },
      { path: 'pos/products', loadComponent: () => import('./features/pos/products/components/products-main-page/products-main-page.component').then(c => c.ProductsMainPageComponent), canActivate: [authGuard] },
      { path: 'pos/products/tree', loadComponent: () => import('./features/pos/products/components/new/productTreeView/product-tree-view.component').then(c => c.ProductTreeViewComponent), canActivate: [authGuard] },
      { path: 'pos/product/manage', loadComponent: () => import('./features/pos/products/components/manage-product/manage-product.component').then(c => c.ManageProductComponent), canActivate: [authGuard] },
      { path: 'pos/product/manage/:id', loadComponent: () => import('./features/pos/products/components/manage-product/manage-product.component').then(c => c.ManageProductComponent), canActivate: [authGuard] },
      { path: 'pos/settings', loadComponent: () => import('./features/pos/settings/settings-page.component').then(c => c.SettingsPageComponent), canActivate: [authGuard] },
];

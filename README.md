Implementation Plan - Generic Mini + Overlay Sidebar Component
Refactor the Cashier Page left sidebar navigation to a generic, reusable <app-sidebar> component in the shared components directory, and integrate it on both the Cashier Page and the Product Page.

Proposed Changes
Reusable Sidebar Component
Create a new shared sidebar component using Angular's routing capabilities (routerLink, routerLinkActive) and signals.

[Component: Shared Sidebar]
[NEW] 
sidebar.component.ts
A standalone Angular component (selector: 'app-sidebar').
Takes an @Input() expanded: boolean = false; to control open state.
Emits a @Output() toggle = new EventEmitter<void>(); when the menu icon or backdrop is clicked.
Listens to document Escape key HostListener('document:keydown.escape') to emit toggle when expanded.
Defines a list of navigation items linked to actual routes:
Cashier (/pos/cashier)
Inventory (/pos/products)
Sales Reports (/pos/receipts)
Print Tools (/pos/receipt-form)
Settings (#)
Closes the sidebar on item select if screen width is < 1024px.
[NEW] 
sidebar.component.html
Backdrop div: <div class="sidebar-backdrop" *ngIf="expanded" (click)="onClose()"></div>
Sidebar structure containing the toggle menu button, the list of navigation links with routerLink and routerLinkActive="active", and the bottom user action button.
Add tooltips using data attributes ([attr.data-tooltip]).
[NEW] 
sidebar.component.css
Layout CSS for the mini sidebar (always visible, width 72px in layout flow on desktop).
Overlay CSS for the expanded state (width 260px, absolute position, drop shadow, blur backdrop).
Animated premium CSS tooltips visible on hover in mini mode.
Mobile drawer mode (screen width <= 1024px): sidebar hidden off-screen left (-260px), slides in when expanded (left: 0).
[Component: Cashier Page]
[MODIFY] 
cashier-page-components.component.ts
Import the new SidebarComponent from src/app/shared/components/sidebar/sidebar.component.ts.
Remove the local navItems array and onCloseSidebar handlers that are no longer needed.
[MODIFY] 
cashier-page-components.component.html
Replace the legacy <aside class="sidebar"> markup with the new <app-sidebar [expanded]="sidebarVisible()" (toggle)="onToggleSidebar()"></app-sidebar>.
Remove references to !sidebarVisible() toggling classes on the root layout container.
[MODIFY] 
cashier-page-components.component.css
Remove CSS rules related to .sidebar, .menu-btn-container, .nav-menu, .user-container, and responsive rules overriding them.
[Component: Product Page]
[MODIFY] 
products-main-page.component.ts
Import the SidebarComponent and place it in the imports array.
Declare the sidebarVisible signal: sidebarVisible = signal(false);.
Add the toggle handler onToggleSidebar() { this.sidebarVisible.update(v => !v); }.
[MODIFY] 
products-main-page.component.html
Wrap the main template content in a <div class="products-layout"> container.
Place the <app-sidebar [expanded]="sidebarVisible()" (toggle)="onToggleSidebar()"></app-sidebar> at the start of the layout.
Add a menu toggle button inside the header next to the page title المنتجات to trigger sidebar expansion.
[MODIFY] 
products-main-page.component.css
Add styling for the .products-layout container (display: flex; height: 100vh; overflow: hidden; direction: rtl;).
Set .products-container to flex: 1; height: 100%; overflow: hidden; so it doesn't wrap or resize in a layout-breaking way.
Verification Plan
Manual Verification
Open the Cashier Page:
Verify that the mini-sidebar is always visible (72px) with icons and has sleek tooltips on hover.
Click the menu toggle (either in sidebar or action bar); verify it expands smoothly above the workspace.
Press Escape or click on the backdrop to collapse it.
Navigate to the Products Page (by clicking "إدارة المخزون" in the sidebar):
Verify that the mini-sidebar is visible.
Verify that the active styling correctly highlights "إدارة المخزون" using routerLinkActive.
Click the menu button next to the title "المنتجات" or the sidebar menu button; verify the sidebar expands overlaying the page.

---

## API Routing: Local Development vs Production

The app always calls the **relative** `/api` base path (`src/environments/environment.ts` -> `apiUrl`,
`src/app/shared/environment/developments.ts` -> `API_URL`). Only the thing that resolves `/api`
differs per mode:

| Mode | Command | `/api` handled by | Backend reached |
| --- | --- | --- | --- |
| Local development | `npm start` (`ng serve` on http://localhost:4200) | Angular dev-server proxy (`proxy.conf.json`) | `http://localhost:8080` |
| Production / Docker | `npm run build` served by Nginx (Dockerfile) | Nginx (`nginx.conf`, `location /api`) | `http://backend:8080` |

### 1) Local development (your local backend on 8080)

1. Start your backend so it listens on port `8080`.
2. Run `npm start` and open http://localhost:4200.

Every `/api/...` call is forwarded by the dev server to `http://localhost:8080/api/...`, so the backend
sees the same path it gets through Nginx, and the browser stays same-origin (no CORS needed).

If your local backend runs on a different host/port, just edit `target` in `proxy.conf.json`
(no application code change):

```json
{
  "/api": {
    "target": "http://localhost:8081",
    "secure": false,
    "changeOrigin": true,
    "logLevel": "info"
  }
}
```

If the proxy target is down, the dev server answers proxied requests with an error (e.g. `504` /
`ECONNREFUSED`) while the Angular app itself keeps working - handy signal that the backend is not up.

### 2) Production / Docker (Nginx)

`angular.json` only attaches `proxy.conf.json` to the **development** serve configuration, so the
production bundle keeps the plain relative `/api` path and Nginx forwards it to the `backend`
service on port 8080 (`nginx.conf` -> `proxy_pass http://backend:8080;`). Nothing else to change.

### Alternative: absolute URLs instead of a proxy

If you would rather have the browser call `http://localhost:8080/api` directly in development, set
`apiUrl` / `API_URL` to that absolute URL in the two development environment files and enable CORS
on the backend. The proxy setup above is preferred because it keeps dev and prod path-identical and
avoids CORS/preflight issues.
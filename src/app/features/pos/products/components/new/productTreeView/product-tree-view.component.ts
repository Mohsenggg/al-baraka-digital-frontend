import {
      Component,
      signal,
      computed,
      inject,
      OnInit,
      HostListener,
      ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { SidebarComponent } from '../../../../../../shared/components/sidebar/sidebar.component';
import { NotificationService } from '../../../../../../shared/services/notification.service';
import { ConfirmService } from '../../../../../../shared/services/confirm.service';
import {
      getStockClass,
      getStockLabel,
      getTypeLabel,
      getStatusLabel,
      getStatusClass,
      StockStatus,
      ProductStatus,
      ProductType
} from '../../../models/product.models';
import {
      CategoryNode,
      BrandNode,
      ProductGroupNode,
      TreeProductItem,
      TreeStatistics,
      computeTreeStats,
      TreeNodeType,
      TreeNodeActionTarget,
      RenameNodeTarget,
      NodeNameValidationResult,
      TREE_NODE_TYPE_LABELS,
      validateNodeName,
      INITIAL_MOCK_TREE_DATA
} from './models/product-tree.models';
import { ProductApiService } from '../../../services/product-api.service';

@Component({
      selector: 'app-product-tree-view',
      standalone: true,
      imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, SidebarComponent],
      templateUrl: './product-tree-view.component.html',
      styleUrl: './product-tree-view.component.css',
      changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductTreeViewComponent implements OnInit {
      private router = inject(Router);
      private productApiService = inject(ProductApiService);
      private notificationService = inject(NotificationService);
      private confirmService = inject(ConfirmService);

      // Sidebar state
      sidebarVisible = signal(false);

      // Tree raw state
      treeData = signal<CategoryNode[]>([]);
      isLoading = signal(false);
      errorMessage = signal<string | null>(null);

      // Search & Filters
      searchQuery = signal<string>('');
      selectedCategoryId = signal<string>('');
      selectedStockFilter = signal<string>('');

      // UI popups / active menus
      openMenuProductId = signal<number | string | null>(null);
      activePricePopoverProductId = signal<number | string | null>(null);

      // ── Edit Mode state (Task 4: toggle + bulk product selection) ────────
      isEditMode = signal(false);
      selectedProductIds = signal<Set<number | string>>(new Set());
      selectedProductsCount = computed(() => this.selectedProductIds().size);

      // ─── Node actions state (Task 5: rename / delete) ────────────────────
      /** Key of the rename / delete request currently in flight, e.g. `delete:group:12`. */
      nodeActionKey = signal<string | null>(null);
      renameTarget = signal<RenameNodeTarget | null>(null);
      renameValue = signal('');
      renameError = signal<string | null>(null);
      isRenameSaving = computed(() => {
            const target = this.renameTarget();
            return !!target && this.nodeActionKey() === this.nodeActionKeyOf('rename', target.type, target.id);
      });

      /** Arabic labels for the editable hierarchy tiers (used by dialogs / toasts). */
      readonly nodeTypeLabels = TREE_NODE_TYPE_LABELS;

      // Formatters imported from product.models
      readonly getStockClass = getStockClass;
      readonly getStockLabel = getStockLabel;
      readonly getTypeLabel = getTypeLabel;
      readonly getStatusLabel = getStatusLabel;
      readonly getStatusClass = getStatusClass;

      ngOnInit(): void {
            this.loadTreeData();
      }

      loadTreeData(): void {
            this.isLoading.set(true);
            this.errorMessage.set(null);
            this.productApiService.getProductTree().subscribe({
                  next: (res: any) => {
                        this.treeData.set(res.tree || []);
                        this.isLoading.set(false);
                  },
                  error: (err: any) => {
                        console.error('Failed to load product tree data', err);
                        this.errorMessage.set('فشل تحميل شجرة المنتجات. يرجى المحاولة مرة أخرى.');
                        this.isLoading.set(false);
                  }
            });
      }

      // Sidebar toggle
      onToggleSidebar(): void {
            this.sidebarVisible.update(v => !v);
      }

      // Filtered tree computation
      filteredTree = computed(() => {
            const query = this.searchQuery().trim().toLowerCase();
            const categoryFilter = this.selectedCategoryId();
            const stockFilter = this.selectedStockFilter();
            const rawTree = this.treeData();

            if (!query && !categoryFilter && !stockFilter) {
                  return rawTree;
            }

            const result: CategoryNode[] = [];

            for (const cat of rawTree) {
                  // Category filter check
                  if (categoryFilter && String(cat.id) !== categoryFilter) {
                        continue;
                  }

                  const catMatches = !query || cat.name.toLowerCase().includes(query) || cat.code.toLowerCase().includes(query);

                  // Filter brands
                  const filteredBrands: BrandNode[] = [];
                  for (const brand of cat.brands || []) {
                        const brandMatches = !query || brand.name.toLowerCase().includes(query) || brand.code.toLowerCase().includes(query);

                        const filteredBrandGroups: ProductGroupNode[] = [];
                        for (const group of brand.groups || []) {
                              const groupMatches = !query || group.name.toLowerCase().includes(query) || group.code.toLowerCase().includes(query);

                              const matchingProducts = (group.products || []).filter(product => {
                                    const prodMatches = !query ||
                                          product.name.toLowerCase().includes(query) ||
                                          product.sku.toLowerCase().includes(query) ||
                                          (product.vendorCode && product.vendorCode.toLowerCase().includes(query));

                                    const stockMatches = this.checkStockFilter(product.stock, stockFilter);
                                    return (catMatches || brandMatches || groupMatches || prodMatches) && stockMatches;
                              });

                              if (catMatches || brandMatches || groupMatches || matchingProducts.length > 0) {
                                    filteredBrandGroups.push({
                                          ...group,
                                          products: matchingProducts,
                                          expanded: query ? true : group.expanded
                                    });
                              }
                        }

                        if (catMatches || brandMatches || filteredBrandGroups.length > 0) {
                              filteredBrands.push({
                                    ...brand,
                                    groups: filteredBrandGroups,
                                    expanded: query ? true : brand.expanded
                              });
                        }
                  }

                  // Filter direct groups (without brands)
                  const filteredDirectGroups: ProductGroupNode[] = [];
                  for (const group of cat.directGroups || []) {
                        const groupMatches = !query || group.name.toLowerCase().includes(query) || group.code.toLowerCase().includes(query);

                        const matchingProducts = (group.products || []).filter(product => {
                              const prodMatches = !query ||
                                    product.name.toLowerCase().includes(query) ||
                                    product.sku.toLowerCase().includes(query) ||
                                    (product.vendorCode && product.vendorCode.toLowerCase().includes(query));

                              const stockMatches = this.checkStockFilter(product.stock, stockFilter);
                              return (catMatches || groupMatches || prodMatches) && stockMatches;
                        });

                        if (catMatches || groupMatches || matchingProducts.length > 0) {
                              filteredDirectGroups.push({
                                    ...group,
                                    products: matchingProducts,
                                    expanded: query ? true : group.expanded
                              });
                        }
                  }

                  if (catMatches || filteredBrands.length > 0 || filteredDirectGroups.length > 0) {
                        result.push({
                              ...cat,
                              brands: filteredBrands,
                              directGroups: filteredDirectGroups,
                              expanded: query ? true : cat.expanded
                        });
                  }
            }

            return result;
      });

      // Overall tree statistics
      stats = computed<TreeStatistics>(() => {
            return computeTreeStats(this.filteredTree());
      });

      private checkStockFilter(stock: number, filter: string): boolean {
            if (!filter) return true;
            if (filter === 'in-stock') return stock > 0;
            if (filter === 'low') return stock > 0 && stock <= 10;
            if (filter === 'critical') return stock > 0 && stock <= 5;
            if (filter === 'outofstock') return stock === 0;
            return true;
      }

      // Node toggle handlers
      toggleCategory(category: CategoryNode, event?: Event): void {
            if (event) event.stopPropagation();
            this.treeData.update(tree =>
                  tree.map(c => (c.id === category.id ? { ...c, expanded: !c.expanded } : c))
            );
      }

      toggleBrand(category: CategoryNode, brand: BrandNode, event?: Event): void {
            if (event) event.stopPropagation();
            this.treeData.update(tree =>
                  tree.map(c => {
                        if (c.id !== category.id) return c;
                        return {
                              ...c,
                              brands: (c.brands || []).map(b =>
                                    b.id === brand.id ? { ...b, expanded: !b.expanded } : b
                              )
                        };
                  })
            );
      }

      toggleGroup(category: CategoryNode, brand: BrandNode | null, group: ProductGroupNode, event?: Event): void {
            if (event) event.stopPropagation();
            this.treeData.update(tree =>
                  tree.map(c => {
                        if (c.id !== category.id) return c;

                        if (brand) {
                              return {
                                    ...c,
                                    brands: (c.brands || []).map(b => {
                                          if (b.id !== brand.id) return b;
                                          return {
                                                ...b,
                                                groups: (b.groups || []).map(g =>
                                                      g.id === group.id ? { ...g, expanded: !g.expanded } : g
                                                )
                                          };
                                    })
                              };
                        } else {
                              return {
                                    ...c,
                                    directGroups: (c.directGroups || []).map(g =>
                                          g.id === group.id ? { ...g, expanded: !g.expanded } : g
                                    )
                              };
                        }
                  })
            );
      }

      // Expand / Collapse All
      expandAll(): void {
            this.treeData.update(tree =>
                  tree.map(c => ({
                        ...c,
                        expanded: true,
                        brands: (c.brands || []).map(b => ({
                              ...b,
                              expanded: true,
                              groups: (b.groups || []).map(g => ({ ...g, expanded: true }))
                        })),
                        directGroups: (c.directGroups || []).map(g => ({ ...g, expanded: true }))
                  }))
            );
      }

      collapseAll(): void {
            this.treeData.update(tree =>
                  tree.map(c => ({
                        ...c,
                        expanded: false,
                        brands: (c.brands || []).map(b => ({
                              ...b,
                              expanded: false,
                              groups: (b.groups || []).map(g => ({ ...g, expanded: false }))
                        })),
                        directGroups: (c.directGroups || []).map(g => ({ ...g, expanded: false }))
                  }))
            );
      }

      // Search & Filters controls
      onSearchInput(event: Event): void {
            const input = event.target as HTMLInputElement;
            this.searchQuery.set(input.value);
      }

      clearSearch(): void {
            this.searchQuery.set('');
      }

      onCategoryFilterChange(val: string): void {
            this.selectedCategoryId.set(val);
      }

      onStockFilterChange(val: string): void {
            this.selectedStockFilter.set(val);
      }

      clearAllFilters(): void {
            this.searchQuery.set('');
            this.selectedCategoryId.set('');
            this.selectedStockFilter.set('');
      }

      hasActiveFilters(): boolean {
            return !!(this.searchQuery() || this.selectedCategoryId() || this.selectedStockFilter());
      }

      // Row Actions
      onViewProduct(product: TreeProductItem): void {
            this.router.navigate(['/pos/product/manage', product.id]);
      }

      onEditProduct(product: TreeProductItem): void {
            this.router.navigate(['/pos/product/manage', product.id]);
      }

      onDeleteProduct(product: TreeProductItem, group: ProductGroupNode, event?: Event): void {
            if (event) event.stopPropagation();
            if (confirm(`هل أنت متأكد من حذف المنتج "${product.name}"؟`)) {
                  this.removeProductFromTree(product.id);
            }
      }

      private removeProductFromTree(productId: number | string): void {
            this.treeData.update(tree =>
                  tree.map(cat => ({
                        ...cat,
                        brands: (cat.brands || []).map(brand => ({
                              ...brand,
                              groups: (brand.groups || []).map(group => ({
                                    ...group,
                                    products: (group.products || []).filter(p => p.id !== productId)
                              }))
                        })),
                        directGroups: (cat.directGroups || []).map(group => ({
                              ...group,
                              products: (group.products || []).filter(p => p.id !== productId)
                        }))
                  }))
            );
      }

      /* ============================= */
      /* EDIT MODE (Task 4)            */
      /* ============================= */

      /** Enters / leaves Edit Mode. Leaving always resets the pending selection & dialogs. */
      toggleEditMode(): void {
            const nextMode = !this.isEditMode();
            this.isEditMode.set(nextMode);

            if (!nextMode) {
                  this.clearSelection();
                  this.closeRenameDialog(true);
            }
      }

      toggleProductSelection(productId: number | string, event?: Event): void {
            if (event) event.stopPropagation();

            this.selectedProductIds.update(current => {
                  const next = new Set(current);
                  if (next.has(productId)) {
                        next.delete(productId);
                  } else {
                        next.add(productId);
                  }
                  return next;
            });
      }

      isProductSelected(productId: number | string): boolean {
            return this.selectedProductIds().has(productId);
      }

      isGroupAllSelected(group: ProductGroupNode): boolean {
            const products = group.products || [];
            return products.length > 0 && products.every(product => this.selectedProductIds().has(product.id));
      }

      isGroupPartiallySelected(group: ProductGroupNode): boolean {
            const products = group.products || [];
            if (products.length === 0) return false;

            const selectedCount = products.filter(product => this.selectedProductIds().has(product.id)).length;
            return selectedCount > 0 && selectedCount < products.length;
      }

      /** Selects / deselects every (currently visible) product of a group. */
      selectAllInGroup(group: ProductGroupNode, event?: Event): void {
            if (event) event.stopPropagation();

            const productIds = (group.products || []).map(product => product.id);
            const shouldDeselect = this.isGroupAllSelected(group);

            this.selectedProductIds.update(current => {
                  const next = new Set(current);
                  for (const id of productIds) {
                        if (shouldDeselect) {
                              next.delete(id);
                        } else {
                              next.add(id);
                        }
                  }
                  return next;
            });
      }

      clearSelection(): void {
            this.selectedProductIds.set(new Set());
      }

      /**
       * Index of the nodes that still hold children, built from the raw (unfiltered) tree.
       * Frontend checks are a UX convenience only — the backend enforces the same "empty only" rule.
       */
      private readonly nodesWithChildren = computed(() => {
            const blocked: Record<TreeNodeType, Set<string>> = {
                  category: new Set<string>(),
                  brand: new Set<string>(),
                  group: new Set<string>()
            };

            for (const category of this.treeData()) {
                  const brands = category.brands || [];
                  const directGroups = category.directGroups || [];

                  if (brands.length > 0 || directGroups.length > 0) {
                        blocked.category.add(this.nodeKey(category.id));
                  }

                  for (const group of directGroups) {
                        if ((group.products || []).length > 0) {
                              blocked.category.add(this.nodeKey(category.id));
                              blocked.group.add(this.nodeKey(group.id));
                        }
                  }

                  for (const brand of brands) {
                        const groups = brand.groups || [];
                        if (groups.length > 0) {
                              blocked.brand.add(this.nodeKey(brand.id));
                        }

                        for (const group of groups) {
                              if ((group.products || []).length > 0) {
                                    blocked.category.add(this.nodeKey(category.id));
                                    blocked.group.add(this.nodeKey(group.id));
                              }
                        }
                  }
            }

            return blocked;
      });

      /** A node is deletable only when it has no children (empty node rule). */
      isNodeDeletable(type: TreeNodeType, id: number | string): boolean {
            return !this.nodesWithChildren()[type].has(this.nodeKey(id));
      }

      /** True while a rename / delete request for this exact node is in flight. */
      isNodeActionPending(type: TreeNodeType, id: number | string): boolean {
            return this.nodeActionKey() === this.nodeActionKeyOf('rename', type, id) ||
                  this.nodeActionKey() === this.nodeActionKeyOf('delete', type, id);
      }

      private nodeKey(id: number | string): string {
            return String(id);
      }

      private nodeActionKeyOf(action: 'rename' | 'delete', type: TreeNodeType, id: number | string): string {
            return `${action}:${type}:${this.nodeKey(id)}`;
      }

      /* ============================= */
      /* NODE RENAME (Task 5)          */
      /* ============================= */

      openRenameCategory(category: CategoryNode, event?: Event): void {
            if (event) event.stopPropagation();

            this.openRenameDialog({
                  type: 'category',
                  id: category.id,
                  name: category.name,
                  parentId: null,
                  siblingNames: this.treeData().filter(item => item.id !== category.id).map(item => item.name),
                  contextLabel: 'قسم رئيسي'
            });
      }

      openRenameBrand(category: CategoryNode, brand: BrandNode, event?: Event): void {
            if (event) event.stopPropagation();

            this.openRenameDialog({
                  type: 'brand',
                  id: brand.id,
                  name: brand.name,
                  parentId: category.id,
                  siblingNames: (category.brands || [])
                        .filter(item => item.id !== brand.id)
                        .map(item => item.name),
                  contextLabel: `داخل قسم: ${category.name}`
            });
      }

      openRenameGroup(category: CategoryNode, brand: BrandNode | null, group: ProductGroupNode, event?: Event): void {
            if (event) event.stopPropagation();

            const siblingNames = (brand ? brand.groups || [] : category.directGroups || [])
                  .filter(item => item.id !== group.id)
                  .map(item => item.name);

            this.openRenameDialog({
                  type: 'group',
                  id: group.id,
                  name: group.name,
                  parentId: brand ? brand.id : category.id,
                  siblingNames,
                  contextLabel: brand ? `داخل شركة: ${brand.name}` : `داخل قسم: ${category.name}`
            });
      }

      onRenameInput(event: Event): void {
            this.renameValue.set((event.target as HTMLInputElement).value);
            this.renameError.set(null);
      }

      onRenameKeydown(event: KeyboardEvent): void {
            if (event.key === 'Enter') {
                  event.preventDefault();
                  this.submitRename();
            }
      }

      /** Closes the rename dialog. While a save is running it stays open unless `force` is passed. */
      closeRenameDialog(force: boolean = false): void {
            if (!force && this.isRenameSaving()) return;

            this.renameTarget.set(null);
            this.renameValue.set('');
            this.renameError.set(null);
      }

      private openRenameDialog(target: RenameNodeTarget): void {
            this.renameError.set(null);
            this.renameValue.set(target.name);
            this.renameTarget.set(target);
      }

      submitRename(): void {
            const target = this.renameTarget();
            if (!target || this.isRenameSaving()) return;

            const trimmedName = this.renameValue().trim();
            if (trimmedName === target.name.trim()) {
                  this.closeRenameDialog();
                  return;
            }

            const validation: NodeNameValidationResult = validateNodeName(trimmedName, target.siblingNames);
            if (!validation.valid) {
                  this.renameError.set(validation.error);
                  return;
            }

            this.nodeActionKey.set(this.nodeActionKeyOf('rename', target.type, target.id));
            this.renameNode(target, trimmedName).subscribe({
                  next: () => {
                        this.nodeActionKey.set(null);
                        this.applyRenamedNode(target, trimmedName);
                        this.closeRenameDialog(true);
                        this.notificationService.success(
                              `تمت إعادة تسمية ${this.nodeTypeLabels[target.type]} إلى "${trimmedName}" بنجاح`
                        );
                  },
                  error: (err: unknown) => {
                        this.nodeActionKey.set(null);
                        this.renameError.set(
                              this.resolveErrorMessage(err, 'تعذر حفظ الاسم الجديد. يرجى المحاولة مرة أخرى.')
                        );
                  }
            });
      }

      private renameNode(target: TreeNodeActionTarget, newName: string): Observable<void> {
            switch (target.type) {
                  case 'category':
                        return this.productApiService.renameCategory(target.id, newName);
                  case 'brand':
                        return this.productApiService.renameBrand(target.id, newName);
                  case 'group':
                        return this.productApiService.renameProductGroup(target.id, newName);
            }
      }

      /** Applies the new name locally so the tree reflects it without a full reload. */
      private applyRenamedNode(target: TreeNodeActionTarget, newName: string): void {
            this.treeData.update(tree =>
                  tree.map(category => {
                        if (target.type === 'category') {
                              return category.id === target.id ? { ...category, name: newName } : category;
                        }

                        if (target.type === 'brand') {
                              return {
                                    ...category,
                                    brands: (category.brands || []).map(brand =>
                                          brand.id === target.id ? { ...brand, name: newName } : brand
                                    )
                              };
                        }

                        return {
                              ...category,
                              brands: (category.brands || []).map(brand => ({
                                    ...brand,
                                    groups: (brand.groups || []).map(group =>
                                          group.id === target.id ? { ...group, name: newName } : group
                                    )
                              })),
                              directGroups: (category.directGroups || []).map(group =>
                                    group.id === target.id ? { ...group, name: newName } : group
                              )
                        };
                  })
            );
      }

      /* ============================= */
      /* NODE DELETE (Task 5)          */
      /* ============================= */

      openDeleteCategory(category: CategoryNode, event?: Event): void {
            if (event) event.stopPropagation();

            if (!this.isNodeDeletable('category', category.id)) {
                  this.notifyDeleteBlocked('category', category.name);
                  return;
            }
            this.confirmDeleteNode({ type: 'category', id: category.id, name: category.name });
      }

      openDeleteBrand(category: CategoryNode, brand: BrandNode, event?: Event): void {
            if (event) event.stopPropagation();

            if (!this.isNodeDeletable('brand', brand.id)) {
                  this.notifyDeleteBlocked('brand', brand.name);
                  return;
            }
            this.confirmDeleteNode({ type: 'brand', id: brand.id, name: brand.name, parentId: category.id });
      }

      openDeleteGroup(category: CategoryNode, brand: BrandNode | null, group: ProductGroupNode, event?: Event): void {
            if (event) event.stopPropagation();

            if (!this.isNodeDeletable('group', group.id)) {
                  this.notifyDeleteBlocked('group', group.name);
                  return;
            }
            this.confirmDeleteNode({
                  type: 'group',
                  id: group.id,
                  name: group.name,
                  parentId: brand ? brand.id : category.id
            });
      }

      private notifyDeleteBlocked(type: TreeNodeType, name: string): void {
            this.notificationService.warning(
                  `لا يمكن حذف ${this.nodeTypeLabels[type]} "${name}" لاحتوائه على بيانات تابعة`
            );
      }

      private confirmDeleteNode(target: TreeNodeActionTarget): void {
            if (this.nodeActionKey()) return;

            this.confirmService
                  .confirm(`سيتم حذف ${this.nodeTypeLabels[target.type]} "${target.name}" نهائياً. هل أنت متأكد؟`)
                  .then(confirmed => {
                        if (confirmed) {
                              this.performDeleteNode(target);
                        }
                  });
      }

      private performDeleteNode(target: TreeNodeActionTarget): void {
            this.nodeActionKey.set(this.nodeActionKeyOf('delete', target.type, target.id));
            this.deleteNode(target).subscribe({
                  next: () => {
                        this.nodeActionKey.set(null);
                        this.removeNodeFromTree(target);
                        this.notificationService.success(
                              `تم حذف ${this.nodeTypeLabels[target.type]} "${target.name}" بنجاح`
                        );
                  },
                  error: (err: unknown) => {
                        this.nodeActionKey.set(null);
                        this.notificationService.error(
                              this.resolveErrorMessage(
                                    err,
                                    `تعذر حذف ${this.nodeTypeLabels[target.type]} "${target.name}". يحتوي العنصر على بيانات تابعة.`
                              )
                        );
                  }
            });
      }

      private deleteNode(target: TreeNodeActionTarget): Observable<void> {
            switch (target.type) {
                  case 'category':
                        return this.productApiService.deleteCategory(target.id);
                  case 'brand':
                        return this.productApiService.deleteBrand(target.id);
                  case 'group':
                        return this.productApiService.deleteProductGroup(target.id);
            }
      }

      /** Removes the deleted node from the local tree (only childless nodes can reach this point). */
      private removeNodeFromTree(target: TreeNodeActionTarget): void {
            this.treeData.update(tree => {
                  if (target.type === 'category') {
                        return tree.filter(category => category.id !== target.id);
                  }

                  return tree.map(category => {
                        if (target.type === 'brand') {
                              return {
                                    ...category,
                                    brands: (category.brands || []).filter(brand => brand.id !== target.id)
                              };
                        }

                        return {
                              ...category,
                              brands: (category.brands || []).map(brand => ({
                                    ...brand,
                                    groups: (brand.groups || []).filter(group => group.id !== target.id)
                              })),
                              directGroups: (category.directGroups || []).filter(group => group.id !== target.id)
                        };
                  });
            });
      }

      /** Extracts the backend (or network) error message, falling back to a localized default. */
      private resolveErrorMessage(err: unknown, fallback: string): string {
            const httpError = err as { error?: { message?: string; error?: string } | string; message?: string } | null;
            const body = httpError?.error;

            if (typeof body === 'string' && body.trim()) {
                  return body.trim();
            }
            if (body && typeof body === 'object') {
                  const message = body.message || body.error;
                  if (message) return message;
            }
            if (httpError?.message) {
                  return httpError.message;
            }
            return fallback;
      }

      toggleMenu(productId: number | string, event: Event): void {
            event.stopPropagation();
            this.openMenuProductId.set(this.openMenuProductId() === productId ? null : productId);
      }

      togglePricePopover(productId: number | string, event: Event): void {
            event.stopPropagation();
            this.activePricePopoverProductId.set(
                  this.activePricePopoverProductId() === productId ? null : productId
            );
      }

      @HostListener('document:click')
      handleDocumentClick(): void {
            this.openMenuProductId.set(null);
            this.activePricePopoverProductId.set(null);
      }

      @HostListener('document:keydown.escape')
      handleEscapeKey(): void {
            if (this.renameTarget()) {
                  this.closeRenameDialog();
            }
      }

      // Counting helpers for badges
      getCategoryBrandsCount(cat: CategoryNode): number {
            return cat.brands ? cat.brands.length : 0;
      }

      getCategoryGroupsCount(cat: CategoryNode): number {
            let count = cat.directGroups ? cat.directGroups.length : 0;
            if (cat.brands) {
                  for (const b of cat.brands) {
                        count += b.groups ? b.groups.length : 0;
                  }
            }
            return count;
      }

      getCategoryProductsCount(cat: CategoryNode): number {
            let count = 0;
            if (cat.directGroups) {
                  for (const g of cat.directGroups) {
                        count += g.products ? g.products.length : 0;
                  }
            }
            if (cat.brands) {
                  for (const b of cat.brands) {
                        if (b.groups) {
                              for (const g of b.groups) {
                                    count += g.products ? g.products.length : 0;
                              }
                        }
                  }
            }
            return count;
      }

      getBrandProductsCount(brand: BrandNode): number {
            let count = 0;
            if (brand.groups) {
                  for (const g of brand.groups) {
                        count += g.products ? g.products.length : 0;
                  }
            }
            return count;
      }

      // Stock status resolver for product rows
      resolveStockIndicator(stock: number): { statusClass: string; label: string } {
            let statusClass: StockStatus = 'healthy';
            if (stock === 0) statusClass = 'outofstock';
            else if (stock <= 5) statusClass = 'critical';
            else if (stock <= 15) statusClass = 'low';

            const label = stock === 0 ? 'نفذ المخزون' : `${stock} وحدة`;
            return { statusClass, label };
      }

      trackByCategoryId(_: number, item: CategoryNode): number | string {
            return item.id;
      }

      trackByBrandId(_: number, item: BrandNode): number | string {
            return item.id;
      }

      trackByGroupId(_: number, item: ProductGroupNode): number | string {
            return item.id;
      }

      trackByProductId(_: number, item: TreeProductItem): number | string {
            return item.id;
      }
}

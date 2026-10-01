import { Injectable, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, catchError, tap, throwError } from 'rxjs';
import { ProductApiService } from './product-api.service';
import { ProductCatalogStore } from '../../../../core/products/services/product-catalog.store';
import type { ProductFilterParams, ProductListItemDto } from '../models/product.models';
import type { CatalogProduct } from '../../../../core/products/models/catalog-product.model';

@Injectable({
      providedIn: 'root'
})
export class ProductStateService {
      private api = inject(ProductApiService);
      private catalogStore = inject(ProductCatalogStore);

      private _loading = new BehaviorSubject<boolean>(false);
      public loading$ = this._loading.asObservable();

      private _error = new BehaviorSubject<string | null>(null);
      public error$ = this._error.asObservable();

      public isLoading = this.catalogStore.isLoading;
      public currentPage = signal<number>(1);
      public pageSize = signal<number>(100);

      // ==========================================
      // Stream 1: Hierarchy Skeleton State (Cached)
      // ==========================================
      private skeletonSignal = signal<any[]>([]);
      public skeleton = this.skeletonSignal.asReadonly();
      public treeData = this.skeletonSignal.asReadonly(); // Backward compatibility

      // Search & Status filters
      public searchQuery = signal<string>('');
      public selectedStatus = signal<string>('');

      // Selected IDs (Multi-select)
      public selectedCategories = signal<(number | string)[]>([]);
      public selectedBrands = signal<(number | string)[]>([]);
      public selectedProductGroups = signal<(number | string)[]>([]);

      // Advanced Filters
      public buyingPriceMin = signal<number | null>(null);
      public buyingPriceMax = signal<number | null>(null);
      public sellingPriceMin = signal<number | null>(null);
      public sellingPriceMax = signal<number | null>(null);
      public profitValueMin = signal<number | null>(null);
      public profitValueMax = signal<number | null>(null);
      public profitPercentMin = signal<number | null>(null);
      public profitPercentMax = signal<number | null>(null);
      public stockMin = signal<number | null>(null);
      public stockMax = signal<number | null>(null);

      // ==========================================
      // Stream 2: In-Memory Filtered & Paged Products
      // ==========================================

      /** Full list of products after applying active search, category, brand, group, and range filters */
      public readonly filteredProducts = computed<CatalogProduct[]>(() => {
            const all = this.catalogStore.products();
            const query = this.searchQuery().trim().toLowerCase();
            const status = this.selectedStatus().trim().toLowerCase();
            const selectedCats = this.selectedCategories().map(String);
            const selectedBrs = this.selectedBrands().map(String);
            const selectedGrps = this.selectedProductGroups().map(String);

            const bMin = this.buyingPriceMin();
            const bMax = this.buyingPriceMax();
            const sMin = this.sellingPriceMin();
            const sMax = this.sellingPriceMax();
            const pValMin = this.profitValueMin();
            const pValMax = this.profitValueMax();
            const pPctMin = this.profitPercentMin();
            const pPctMax = this.profitPercentMax();
            const stMin = this.stockMin();
            const stMax = this.stockMax();

            return all.filter(p => {
                  // Search query (matches name or barcode)
                  if (query) {
                        const matchName = p.name ? p.name.toLowerCase().includes(query) : false;
                        const matchBarcode = p.barcode ? p.barcode.toLowerCase().includes(query) : false;
                        if (!matchName && !matchBarcode) return false;
                  }

                  // Status filter
                  if (status) {
                        const pStatus = p.status ? p.status.toLowerCase() : (p.isActive ? 'active' : 'inactive');
                        if (pStatus !== status) return false;
                  }

                  // Category filter
                  if (selectedCats.length > 0) {
                        if (p.categoryId == null || !selectedCats.includes(String(p.categoryId))) {
                              return false;
                        }
                  }

                  // Brand / Manufacturer filter
                  if (selectedBrs.length > 0) {
                        if (p.manufacturerId == null || !selectedBrs.includes(String(p.manufacturerId))) {
                              return false;
                        }
                  }

                  // Product Group filter
                  if (selectedGrps.length > 0) {
                        if (p.productGroupId == null || !selectedGrps.includes(String(p.productGroupId))) {
                              return false;
                        }
                  }

                  // Buying price range
                  if (bMin != null && p.buyingPrice < bMin) return false;
                  if (bMax != null && p.buyingPrice > bMax) return false;

                  // Selling price range
                  if (sMin != null && p.sellingPrice < sMin) return false;
                  if (sMax != null && p.sellingPrice > sMax) return false;

                  // Profit value & percentage
                  const profitVal = (p.sellingPrice || 0) - (p.buyingPrice || 0);
                  if (pValMin != null && profitVal < pValMin) return false;
                  if (pValMax != null && profitVal > pValMax) return false;

                  if (pPctMin != null || pPctMax != null) {
                        const profitPct = p.buyingPrice > 0 ? (profitVal / p.buyingPrice) * 100 : 0;
                        if (pPctMin != null && profitPct < pPctMin) return false;
                        if (pPctMax != null && profitPct > pPctMax) return false;
                  }

                  // Stock quantity range
                  const stock = p.stockQuantity ?? p.stock ?? 0;
                  if (stMin != null && stock < stMin) return false;
                  if (stMax != null && stock > stMax) return false;

                  return true;
            });
      });

      public readonly totalProducts = computed(() => this.filteredProducts().length);
      public readonly totalPages = computed(() => Math.ceil(this.totalProducts() / this.pageSize()) || 1);

      /** Current page slice of products for the main management table */
      public readonly products = computed<ProductListItemDto[]>(() => {
            const start = (this.currentPage() - 1) * this.pageSize();
            const paged = this.filteredProducts().slice(start, start + this.pageSize());
            return paged.map(p => ({
                  id: p.id,
                  name: p.name,
                  barcode: p.barcode,
                  code: p.barcode,
                  sellingPrice: p.sellingPrice,
                  buyingPrice: p.buyingPrice,
                  stock: p.stockQuantity ?? p.stock ?? 0,
                  status: (p.status as any) || (p.isActive ? 'active' : 'inactive'),
                  type: (p.type as any) || 'inventory'
            }));
      });

      // Category options extracted from Skeleton
      public categories = computed(() => {
            return this.skeletonSignal().map(c => ({ id: c.id, name: c.name }));
      });

      // Brand options extracted from Skeleton
      public allBrands = computed(() => {
            const brandsMap = new Map<number | string, any>();
            for (const cat of this.skeletonSignal()) {
                  for (const brand of cat.brands || []) {
                        brandsMap.set(brand.id, { id: brand.id, name: brand.name, categoryId: cat.id });
                  }
            }
            return Array.from(brandsMap.values());
      });

      // Available Brands based on selected Categories (extracted from Skeleton)
      public availableBrands = computed(() => {
            const selectedCats = this.selectedCategories().map(String);
            const brandsMap = new Map<string, any>();

            for (const cat of this.skeletonSignal()) {
                  if (selectedCats.length === 0 || selectedCats.includes(String(cat.id))) {
                        for (const brand of cat.brands || []) {
                              const brandKey = String(brand.id);
                              if (!brandsMap.has(brandKey)) {
                                    brandsMap.set(brandKey, {
                                          id: brand.id,
                                          name: brand.name,
                                          code: brand.code
                                    });
                              }
                        }
                  }
            }
            return Array.from(brandsMap.values());
      });

      // Available Groups based on selected Categories & selected Brands (extracted from Skeleton)
      public availableGroups = computed(() => {
            const selectedCats = this.selectedCategories().map(String);
            const selectedBrs = this.selectedBrands().map(String);
            const groupsMap = new Map<string, any>();

            for (const cat of this.skeletonSignal()) {
                  const catMatches = selectedCats.length === 0 || selectedCats.includes(String(cat.id));
                  if (!catMatches) continue;

                  // Direct groups under matching categories (included when no specific brand filter is active)
                  if (selectedBrs.length === 0) {
                        for (const group of cat.directGroups || []) {
                              const groupKey = String(group.id);
                              if (!groupsMap.has(groupKey)) {
                                    groupsMap.set(groupKey, {
                                          id: group.id,
                                          name: group.name,
                                          code: group.code,
                                          categoryId: cat.id
                                    });
                              }
                        }
                  }

                  // Groups under brands
                  for (const brand of cat.brands || []) {
                        const brandMatches = selectedBrs.length === 0 || selectedBrs.includes(String(brand.id));
                        if (brandMatches) {
                              for (const group of brand.groups || []) {
                                    const groupKey = String(group.id);
                                    if (!groupsMap.has(groupKey)) {
                                          groupsMap.set(groupKey, {
                                                id: group.id,
                                                name: group.name,
                                                code: group.code,
                                                categoryId: cat.id,
                                                brandId: brand.id
                                          });
                                    }
                              }
                        }
                  }
            }
            return Array.from(groupsMap.values());
      });

      // ==========================================
      // Loaders
      // ==========================================

      /**
       * Initial loader: loads skeleton and loads canonical catalog in-memory.
       */
      public loadProducts(): void {
            this.loadSkeleton();
            this.catalogStore.loadCatalog().subscribe({
                  error: (err) => this.handleError(err)
            });
      }

      /**
       * Loads the lightweight hierarchy skeleton (~30 KB). Cached once per session.
       */
      public loadSkeleton(forceRefresh = false): void {
            if (!forceRefresh && this.skeletonSignal().length > 0) {
                  return; // Serve from cache
            }

            this.api.getHierarchySkeleton().subscribe({
                  next: (res) => {
                        this.skeletonSignal.set(res.tree || []);
                  },
                  error: (err) => {
                        console.error('Failed to load hierarchy skeleton', err);
                        this.handleError(err);
                  }
            });
      }

      /**
       * Backward compatibility placeholder (pagination is now in-memory via computed signals).
       */
      public loadProductsPage(): void {
            // In-memory pagination is automatic via computed signals
      }

      // ==========================================
      // Filter Setters & Cascading Handlers
      // ==========================================

      public setSelectedCategories(ids: (number | string)[]): void {
            this.selectedCategories.set(ids);
            this.currentPage.set(1);

            // Cascade: filter out brand selections that are no longer available
            const validBrandIds = this.availableBrands().map(b => String(b.id));
            const updatedBrands = this.selectedBrands().filter(id => validBrandIds.includes(String(id)));
            if (updatedBrands.length !== this.selectedBrands().length) {
                  this.selectedBrands.set(updatedBrands);
            }

            // Cascade: filter out group selections that are no longer available
            const validGroupIds = this.availableGroups().map(g => String(g.id));
            const updatedGroups = this.selectedProductGroups().filter(id => validGroupIds.includes(String(id)));
            if (updatedGroups.length !== this.selectedProductGroups().length) {
                  this.selectedProductGroups.set(updatedGroups);
            }
      }

      public setSelectedBrands(ids: (number | string)[]): void {
            this.selectedBrands.set(ids);
            this.currentPage.set(1);

            // Cascade: if user clears Brands, reset/clear the Product Group filter
            if (ids.length === 0) {
                  this.selectedProductGroups.set([]);
            } else {
                  const validGroupIds = this.availableGroups().map(g => String(g.id));
                  const updatedGroups = this.selectedProductGroups().filter(id => validGroupIds.includes(String(id)));
                  if (updatedGroups.length !== this.selectedProductGroups().length) {
                        this.selectedProductGroups.set(updatedGroups);
                  }
            }
      }

      public setSelectedProductGroups(ids: (number | string)[]): void {
            this.selectedProductGroups.set(ids);
            this.currentPage.set(1);
      }

      public setSearchQuery(query: string): void {
            this.searchQuery.set(query);
            this.currentPage.set(1);
      }

      public setSelectedStatus(status: string): void {
            this.selectedStatus.set(status);
            this.currentPage.set(1);
      }

      public setAdvancedFilters(filters: {
            buyingPriceMin?: number | null;
            buyingPriceMax?: number | null;
            sellingPriceMin?: number | null;
            sellingPriceMax?: number | null;
            profitValueMin?: number | null;
            profitValueMax?: number | null;
            profitPercentMin?: number | null;
            profitPercentMax?: number | null;
            stockMin?: number | null;
            stockMax?: number | null;
      }): void {
            if (filters.buyingPriceMin !== undefined) this.buyingPriceMin.set(filters.buyingPriceMin);
            if (filters.buyingPriceMax !== undefined) this.buyingPriceMax.set(filters.buyingPriceMax);
            if (filters.sellingPriceMin !== undefined) this.sellingPriceMin.set(filters.sellingPriceMin);
            if (filters.sellingPriceMax !== undefined) this.sellingPriceMax.set(filters.sellingPriceMax);
            if (filters.profitValueMin !== undefined) this.profitValueMin.set(filters.profitValueMin);
            if (filters.profitValueMax !== undefined) this.profitValueMax.set(filters.profitValueMax);
            if (filters.profitPercentMin !== undefined) this.profitPercentMin.set(filters.profitPercentMin);
            if (filters.profitPercentMax !== undefined) this.profitPercentMax.set(filters.profitPercentMax);
            if (filters.stockMin !== undefined) this.stockMin.set(filters.stockMin);
            if (filters.stockMax !== undefined) this.stockMax.set(filters.stockMax);
            this.currentPage.set(1);
      }

      public clearAdvancedFilters(): void {
            this.buyingPriceMin.set(null);
            this.buyingPriceMax.set(null);
            this.sellingPriceMin.set(null);
            this.sellingPriceMax.set(null);
            this.profitValueMin.set(null);
            this.profitValueMax.set(null);
            this.profitPercentMin.set(null);
            this.profitPercentMax.set(null);
            this.stockMin.set(null);
            this.stockMax.set(null);
            this.currentPage.set(1);
      }

      public clearFilters(): void {
            this.searchQuery.set('');
            this.selectedCategories.set([]);
            this.selectedBrands.set([]);
            this.selectedProductGroups.set([]);
            this.selectedStatus.set('');
            this.buyingPriceMin.set(null);
            this.buyingPriceMax.set(null);
            this.sellingPriceMin.set(null);
            this.sellingPriceMax.set(null);
            this.profitValueMin.set(null);
            this.profitValueMax.set(null);
            this.profitPercentMin.set(null);
            this.profitPercentMax.set(null);
            this.stockMin.set(null);
            this.stockMax.set(null);
            this.currentPage.set(1);
      }

      public hasActiveFilters(): boolean {
            return !!(
                  this.searchQuery() ||
                  this.selectedCategories().length > 0 ||
                  this.selectedBrands().length > 0 ||
                  this.selectedProductGroups().length > 0 ||
                  this.selectedStatus() ||
                  this.buyingPriceMin() != null ||
                  this.buyingPriceMax() != null ||
                  this.sellingPriceMin() != null ||
                  this.sellingPriceMax() != null ||
                  this.profitValueMin() != null ||
                  this.profitValueMax() != null ||
                  this.profitPercentMin() != null ||
                  this.profitPercentMax() != null ||
                  this.stockMin() != null ||
                  this.stockMax() != null
            );
      }

      // ==========================================
      // Pagination Controls
      // ==========================================

      public getPageNumbers(): number[] {
            const total = this.totalPages();
            const current = this.currentPage();
            const maxDisplay = 5;

            if (total <= maxDisplay) {
                  return Array.from({ length: total }, (_, i) => i + 1);
            }

            const pages: number[] = [];
            const start = Math.max(1, current - 2);
            const end = Math.min(total, current + 2);

            if (start > 1) pages.push(1);
            if (start > 2) pages.push(-1);

            for (let i = start; i <= end; i++) {
                  pages.push(i);
            }

            if (end < total - 1) pages.push(-1);
            if (end < total) pages.push(total);

            return pages;
      }

      public setPage(page: number): void {
            if (page > 0 && page <= this.totalPages() && page !== this.currentPage()) {
                  this.currentPage.set(page);
            }
      }

      public previousPage(): void {
            if (this.currentPage() > 1) {
                  this.currentPage.update(p => p - 1);
            }
      }

      public nextPage(): void {
            if (this.currentPage() < this.totalPages()) {
                  this.currentPage.update(p => p + 1);
            }
      }

      public goToPage(page: number): void {
            this.setPage(page);
      }

      // ==========================================
      // Mutation Operations
      // ==========================================

      public deleteProduct(productId: number): Observable<void> {
            return this.api.deleteProduct(productId).pipe(
                  tap(() => {
                        this.catalogStore.removeProduct(productId);
                  }),
                  catchError(err => {
                        this.handleError(err);
                        return throwError(() => err);
                  })
            );
      }

      public clearError(): void {
            this._error.next(null);
      }

      private handleError(err: unknown): void {
            const message = (err as { error?: { message?: string }; message?: string })?.error?.message
                  || (err as { message?: string })?.message
                  || 'حدث خطأ غير متوقع';
            this._error.next(message);
      }
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, catchError, tap, throwError } from 'rxjs';
import { ProductApiService } from './product-api.service';
import { ProductCatalogStore } from '../../../../core/products/services/product-catalog.store';
import type { ProductFilterParams, ProductListItemDto } from '../models/product.models';

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

      public isLoading = signal<boolean>(false);
      public currentPage = signal<number>(1);
      public pageSize = signal<number>(100);

      // ==========================================
      // Stream 1: Hierarchy Skeleton State (Cached)
      // ==========================================
      private skeletonSignal = signal<any[]>([]);
      public skeleton = this.skeletonSignal.asReadonly();
      public treeData = this.skeletonSignal.asReadonly(); // Backward compatibility

      // ==========================================
      // Stream 2: Paginated Table State (Server-Driven)
      // ==========================================
      private _pagedProducts = signal<ProductListItemDto[]>([]);
      public products = this._pagedProducts.asReadonly();
      public totalProducts = signal<number>(0);
      public totalPages = signal<number>(1);

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
       * Initial loader: loads skeleton once, then fetches first page of products.
       */
      public loadProducts(): void {
            this.loadSkeleton();
            this.loadProductsPage();
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
       * Loads paginated product page from backend via indexed JPA specification query.
       */
      public loadProductsPage(): void {
            this.isLoading.set(true);
            this._loading.next(true);
            this.clearError();

            const params: ProductFilterParams = {
                  page: Math.max(0, this.currentPage() - 1),
                  size: this.pageSize(),
                  query: this.searchQuery()?.trim() || undefined,
                  categoryId: this.selectedCategories().length > 0 ? Number(this.selectedCategories()[0]) : undefined,
                  manufacturerId: this.selectedBrands().length > 0 ? Number(this.selectedBrands()[0]) : undefined,
                  productGroupId: this.selectedProductGroups().length > 0 ? Number(this.selectedProductGroups()[0]) : undefined,
                  status: this.selectedStatus() || undefined
            };

            this.api.listProducts(params).subscribe({
                  next: (res) => {
                        this._pagedProducts.set(res.content || []);
                        this.totalProducts.set(res.totalElements || 0);
                        this.totalPages.set(res.totalPages || 1);
                        this.isLoading.set(false);
                        this._loading.next(false);
                  },
                  error: (err) => {
                        console.error('Failed to load products page', err);
                        this.isLoading.set(false);
                        this._loading.next(false);
                        this.handleError(err);
                  }
            });
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

            this.loadProductsPage();
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

            this.loadProductsPage();
      }

      public setSelectedProductGroups(ids: (number | string)[]): void {
            this.selectedProductGroups.set(ids);
            this.currentPage.set(1);
            this.loadProductsPage();
      }

      public setSearchQuery(query: string): void {
            this.searchQuery.set(query);
            this.currentPage.set(1);
            this.loadProductsPage();
      }

      public setSelectedStatus(status: string): void {
            this.selectedStatus.set(status);
            this.currentPage.set(1);
            this.loadProductsPage();
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
            this.loadProductsPage();
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
            this.loadProductsPage();
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
            this.loadProductsPage();
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
                  this.loadProductsPage();
            }
      }

      public previousPage(): void {
            if (this.currentPage() > 1) {
                  this.currentPage.update(p => p - 1);
                  this.loadProductsPage();
            }
      }

      public nextPage(): void {
            if (this.currentPage() < this.totalPages()) {
                  this.currentPage.update(p => p + 1);
                  this.loadProductsPage();
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
                        this.loadProductsPage();
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

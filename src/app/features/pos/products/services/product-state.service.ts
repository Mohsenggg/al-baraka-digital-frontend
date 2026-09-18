import { Injectable, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, catchError, Subject, tap, throwError } from 'rxjs';
import { ProductApiService } from './product-api.service';
import { calculateProfitMargin, resolveStockStatus, type ProductListItem } from '../models/product.models';

@Injectable({
      providedIn: 'root'
})
export class ProductStateService {
      private api = inject(ProductApiService);

      private _loading = new BehaviorSubject<boolean>(false);
      public loading$ = this._loading.asObservable();

      private _error = new BehaviorSubject<string | null>(null);
      public error$ = this._error.asObservable();

      public isLoading = signal<boolean>(false);
      public currentPage = signal<number>(1);
      public pageSize = signal<number>(100);

      // Raw tree data loaded from API
      private treeDataSignal = signal<any[]>([]);
      public treeData = this.treeDataSignal.asReadonly();

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
      public stockStatusFilter = signal<string>('');

      // Category options extracted from Tree
      public categories = computed(() => {
            return this.treeData().map(c => ({ id: c.id, name: c.name }));
      });

      // Brand options extracted from Tree
      public allBrands = computed(() => {
            const brandsMap = new Map<number | string, any>();
            for (const cat of this.treeData()) {
                  for (const brand of cat.brands || []) {
                        brandsMap.set(brand.id, { id: brand.id, name: brand.name, categoryId: cat.id });
                  }
            }
            return Array.from(brandsMap.values());
      });

      // Available Brands based on selected Categories (directly extracted from matching categories in treeData)
      public availableBrands = computed(() => {
            const selectedCats = this.selectedCategories().map(String);
            const brandsMap = new Map<string, any>();

            for (const cat of this.treeData()) {
                  // If no category selected or category matches selected categories
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

      // Available Groups based on selected Categories & selected Brands
      public availableGroups = computed(() => {
            const selectedCats = this.selectedCategories().map(String);
            const selectedBrs = this.selectedBrands().map(String);
            const groupsMap = new Map<string, any>();

            for (const cat of this.treeData()) {
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

      // Local flat products list extracted from the full tree
      public allProductsFromTree = computed(() => {
            const prods: ProductListItem[] = [];
            const seenIds = new Set<number | string>();

            for (const cat of this.treeData()) {
                  // Direct groups products (no brand)
                  for (const group of cat.directGroups || []) {
                        for (const p of group.products || []) {
                              if (!seenIds.has(p.id)) {
                                    seenIds.add(p.id);
                                    const code = p.sku || p.barcode || p.code || '';
                                    prods.push({
                                          id: Number(p.id),
                                          name: p.name || '',
                                          code: code,
                                          barcode: code,
                                          sku: code,
                                          category: cat.name,
                                          manufacturer: '',
                                          sellingPrice: p.sellingPrice,
                                          buyingPrice: p.buyingPrice,
                                          stock: p.stock,
                                          status: p.status,
                                          type: p.type,
                                          // Keep raw associations for filtering
                                          categoryId: cat.id,
                                          brandId: null,
                                          groupId: group.id
                                    } as any);
                              }
                        }
                  }
                  // Brand groups products
                  for (const brand of cat.brands || []) {
                        for (const group of brand.groups || []) {
                              for (const p of group.products || []) {
                                    if (!seenIds.has(p.id)) {
                                          seenIds.add(p.id);
                                          const code = p.sku || p.barcode || p.code || '';
                                          prods.push({
                                                id: Number(p.id),
                                                name: p.name || '',
                                                code: code,
                                                barcode: code,
                                                sku: code,
                                                category: cat.name,
                                                manufacturer: brand.name,
                                                sellingPrice: p.sellingPrice,
                                                buyingPrice: p.buyingPrice,
                                                stock: p.stock,
                                                status: p.status,
                                                type: p.type,
                                                // Keep raw associations for filtering
                                                categoryId: cat.id,
                                                brandId: brand.id,
                                                groupId: group.id
                                          } as any);
                                    }
                              }
                        }
                  }
            }
            return prods;
      });

      // Filtered list of products based on all search terms & active filters
      public filteredProducts = computed(() => {
            let list = this.allProductsFromTree();

            // Search query filter (by name or barcode/code)
            const query = this.searchQuery().trim().toLowerCase();
            if (query) {
                  list = list.filter(p =>
                        (p.name && p.name.toLowerCase().includes(query)) ||
                        (p.code && p.code.toLowerCase().includes(query)) ||
                        ((p as any).barcode && String((p as any).barcode).toLowerCase().includes(query)) ||
                        ((p as any).sku && String((p as any).sku).toLowerCase().includes(query))
                  );
            }

            // Categories filter
            const selectedCats = this.selectedCategories().map(String);
            if (selectedCats.length > 0) {
                  list = list.filter(p => (p as any).categoryId != null && selectedCats.includes(String((p as any).categoryId)));
            }

            // Brands filter
            const selectedBrs = this.selectedBrands().map(String);
            if (selectedBrs.length > 0) {
                  list = list.filter(p => (p as any).brandId != null && selectedBrs.includes(String((p as any).brandId)));
            }

            // Product Groups filter
            const selectedGroups = this.selectedProductGroups().map(String);
            if (selectedGroups.length > 0) {
                  list = list.filter(p => (p as any).groupId != null && selectedGroups.includes(String((p as any).groupId)));
            }

            // Status filter
            const status = this.selectedStatus();
            if (status) {
                  list = list.filter(p => p.status === status);
            }

            // Advanced Filters: Buying Price Range
            const bMin = this.buyingPriceMin();
            const bMax = this.buyingPriceMax();
            if (bMin != null) {
                  list = list.filter(p => (p.buyingPrice != null ? p.buyingPrice >= bMin : false));
            }
            if (bMax != null) {
                  list = list.filter(p => (p.buyingPrice != null ? p.buyingPrice <= bMax : false));
            }

            // Advanced Filters: Selling Price Range
            const sMin = this.sellingPriceMin();
            const sMax = this.sellingPriceMax();
            if (sMin != null) {
                  list = list.filter(p => (p.sellingPrice != null ? p.sellingPrice >= sMin : false));
            }
            if (sMax != null) {
                  list = list.filter(p => (p.sellingPrice != null ? p.sellingPrice <= sMax : false));
            }

            // Advanced Filters: Profit Value & Margin %
            const pvMin = this.profitValueMin();
            const pvMax = this.profitValueMax();
            const ppMin = this.profitPercentMin();
            const ppMax = this.profitPercentMax();

            if (pvMin != null || pvMax != null || ppMin != null || ppMax != null) {
                  list = list.filter(p => {
                        const margin = calculateProfitMargin(p.buyingPrice || 0, p.sellingPrice || 0);
                        if (pvMin != null && margin.value < pvMin) return false;
                        if (pvMax != null && margin.value > pvMax) return false;
                        if (ppMin != null && margin.percentage < ppMin) return false;
                        if (ppMax != null && margin.percentage > ppMax) return false;
                        return true;
                  });
            }

            // Advanced Filters: Stock Status
            const stockFilter = this.stockStatusFilter();
            if (stockFilter && stockFilter !== 'ALL') {
                  list = list.filter(p => resolveStockStatus(p.stock) === stockFilter);
            }

            return list;
      });

      // Paginated page slice shown to the user
      public products = computed(() => {
            const list = this.filteredProducts();
            const start = (this.currentPage() - 1) * this.pageSize();
            const end = start + this.pageSize();
            return list.slice(start, end);
      });

      // Pagination metadata computed from filtered list
      public totalProducts = computed(() => this.filteredProducts().length);
      public totalPages = computed(() => Math.ceil(this.filteredProducts().length / this.pageSize()) || 1);

      // Load products tree data
      public loadProducts(): void {
            this.loadTreeData();
      }

      public loadTreeData(): void {
            this.isLoading.set(true);
            this._loading.next(true);
            this._error.next(null);

            this.api.getProductTree({ includeProducts: true }).subscribe({
                  next: (res: any) => {
                        this.treeDataSignal.set(res.tree || []);
                        this.isLoading.set(false);
                        this._loading.next(false);
                        this.clearError();
                  },
                  error: (err: any) => {
                        console.error('Failed to load product tree data', err);
                        this.isLoading.set(false);
                        this._loading.next(false);
                        this.handleError(err);
                  }
            });
      }

      // Setter functions for Multi-select filters implementing cascading rules
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
            stockStatusFilter?: string;
      }): void {
            if (filters.buyingPriceMin !== undefined) this.buyingPriceMin.set(filters.buyingPriceMin);
            if (filters.buyingPriceMax !== undefined) this.buyingPriceMax.set(filters.buyingPriceMax);
            if (filters.sellingPriceMin !== undefined) this.sellingPriceMin.set(filters.sellingPriceMin);
            if (filters.sellingPriceMax !== undefined) this.sellingPriceMax.set(filters.sellingPriceMax);
            if (filters.profitValueMin !== undefined) this.profitValueMin.set(filters.profitValueMin);
            if (filters.profitValueMax !== undefined) this.profitValueMax.set(filters.profitValueMax);
            if (filters.profitPercentMin !== undefined) this.profitPercentMin.set(filters.profitPercentMin);
            if (filters.profitPercentMax !== undefined) this.profitPercentMax.set(filters.profitPercentMax);
            if (filters.stockStatusFilter !== undefined) this.stockStatusFilter.set(filters.stockStatusFilter);
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
            this.stockStatusFilter.set('');
            this.currentPage.set(1);
      }

      public clearFilters(): void {
            this.searchQuery.set('');
            this.selectedCategories.set([]);
            this.selectedBrands.set([]);
            this.selectedProductGroups.set([]);
            this.selectedStatus.set('');
            this.clearAdvancedFilters();
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
                  (this.stockStatusFilter() && this.stockStatusFilter() !== 'ALL')
            );
      }

      public deleteProduct(productId: number): Observable<void> {
            return this.api.deleteProduct(productId).pipe(
                  tap(() => {
                        this.loadProducts();
                  }),
                  catchError(err => {
                        this.handleError(err);
                        return throwError(() => err);
                  })
            );
      }

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
            if (page > 0 && page <= this.totalPages()) {
                  this.currentPage.set(page);
            }
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

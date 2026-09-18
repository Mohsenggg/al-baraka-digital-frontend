import {
      Component,
      signal,
      OnInit,
      HostListener,
      inject,
      ChangeDetectionStrategy,
      ViewChild,
      ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { SidebarComponent } from '../../../../../shared/components/sidebar/sidebar.component';
import { ProductStateService } from '../../services/product-state.service';
import {
      getStockClass,
      getStockLabel,
      getTypeLabel,
      getStatusLabel,
      getStatusClass
} from '../../models/product.models';

@Component({
      selector: 'app-products-main-page',
      standalone: true,
      imports: [CommonModule, FormsModule, ReactiveFormsModule, SidebarComponent, RouterModule],
      templateUrl: './products-main-page.component.html',
      styleUrl: './products-main-page.component.css',
      changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductsMainPageComponent implements OnInit {
      private state = inject(ProductStateService);
      private router = inject(Router);

      @ViewChild('tableWrapper') tableWrapper?: ElementRef<HTMLElement>;

      sidebarVisible = signal(false);

      isLoading = this.state.isLoading;

      localSearchTerm = signal(this.state.searchQuery());
      searchQuery = this.state.searchQuery;
      selectedStatus = this.state.selectedStatus;
      
      // Cascading signals from state
      selectedCategories = this.state.selectedCategories;
      selectedBrands = this.state.selectedBrands;
      selectedProductGroups = this.state.selectedProductGroups;

      categories = this.state.categories;
      availableBrands = this.state.availableBrands;
      availableGroups = this.state.availableGroups;

      currentPage = this.state.currentPage;
      pageSize = this.state.pageSize;
      totalPages = this.state.totalPages;
      totalProducts = this.state.totalProducts;
      products = this.state.products;

      // Active dropdown state ('category' | 'brand' | 'group' | null)
      activeDropdown = signal<string | null>(null);

      // Advanced filters visibility & local form values
      showAdvancedFilters = signal<boolean>(false);
      localBuyingPriceMin = signal<number | null>(null);
      localBuyingPriceMax = signal<number | null>(null);
      localSellingPriceMin = signal<number | null>(null);
      localSellingPriceMax = signal<number | null>(null);
      localProfitValueMin = signal<number | null>(null);
      localProfitValueMax = signal<number | null>(null);
      localProfitPercentMin = signal<number | null>(null);
      localProfitPercentMax = signal<number | null>(null);
      localStockStatusFilter = signal<string>('');

      hoveredProductId = signal<number | null>(null);
      openMenuId = signal<number | null>(null);

      Math = Math;

      readonly getStockClass = getStockClass;
      readonly getStockLabel = getStockLabel;
      readonly getTypeLabel = getTypeLabel;
      readonly getStatusLabel = getStatusLabel;
      readonly getStatusClass = getStatusClass;

      ngOnInit(): void {
            this.state.loadProducts();
      }

      resetScroll(): void {
            if (this.tableWrapper?.nativeElement) {
                  this.tableWrapper.nativeElement.scrollTop = 0;
            }
      }

      onToggleSidebar(): void {
            this.sidebarVisible.update(v => !v);
      }

      onSearchInput(event: Event): void {
            const input = event.target as HTMLInputElement;
            this.localSearchTerm.set(input.value);
            this.resetScroll();
            this.state.setSearchQuery(input.value);
      }

      onSearchKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Enter') {
                  this.executeSearch();
            }
      }

      executeSearch(): void {
            this.resetScroll();
            this.state.setSearchQuery(this.localSearchTerm());
      }

      clearSearch(): void {
            this.localSearchTerm.set('');
            this.resetScroll();
            this.state.setSearchQuery('');
      }

      // Dropdown toggle handler
      toggleDropdown(type: string, event: Event): void {
            event.stopPropagation();
            this.activeDropdown.set(this.activeDropdown() === type ? null : type);
      }

      // Checkbox state checkers
      isCategorySelected(id: number | string): boolean {
            return this.selectedCategories().some(cId => String(cId) === String(id));
      }

      isBrandSelected(id: number | string): boolean {
            return this.selectedBrands().some(bId => String(bId) === String(id));
      }

      isProductGroupSelected(id: number | string): boolean {
            return this.selectedProductGroups().some(gId => String(gId) === String(id));
      }

      // Checkbox togglers
      toggleCategorySelection(id: number | string): void {
            this.resetScroll();
            const current = [...this.selectedCategories()];
            const idx = current.findIndex(cId => String(cId) === String(id));
            if (idx > -1) {
                  current.splice(idx, 1);
            } else {
                  current.push(id);
            }
            this.state.setSelectedCategories(current);
      }

      toggleBrandSelection(id: number | string): void {
            this.resetScroll();
            const current = [...this.selectedBrands()];
            const idx = current.findIndex(bId => String(bId) === String(id));
            if (idx > -1) {
                  current.splice(idx, 1);
            } else {
                  current.push(id);
            }
            this.state.setSelectedBrands(current);
      }

      toggleProductGroupSelection(id: number | string): void {
            this.resetScroll();
            const current = [...this.selectedProductGroups()];
            const idx = current.findIndex(gId => String(gId) === String(id));
            if (idx > -1) {
                  current.splice(idx, 1);
            } else {
                  current.push(id);
            }
            this.state.setSelectedProductGroups(current);
      }

      // Dropdown button labels in Arabic
      getCategoriesLabel(): string {
            const selected = this.selectedCategories();
            if (selected.length === 0) return 'الأقسام (الكل)';
            if (selected.length === 1) {
                  const cat = this.categories().find(c => String(c.id) === String(selected[0]));
                  return cat ? cat.name : 'قسم واحد محدد';
            }
            return `الأقسام (${selected.length})`;
      }

      getBrandsLabel(): string {
            const selected = this.selectedBrands();
            if (selected.length === 0) return 'الشركات (الكل)';
            if (selected.length === 1) {
                  const brand = this.availableBrands().find(b => String(b.id) === String(selected[0]));
                  return brand ? brand.name : 'شركة واحدة محددة';
            }
            return `الشركات (${selected.length})`;
      }

      getProductGroupsLabel(): string {
            const selected = this.selectedProductGroups();
            if (selected.length === 0) return 'المجموعات (الكل)';
            if (selected.length === 1) {
                  const group = this.availableGroups().find(g => String(g.id) === String(selected[0]));
                  return group ? group.name : 'مجموعة واحدة محددة';
            }
            return `المجموعات (${selected.length})`;
      }

      toggleAdvancedFilters(): void {
            this.showAdvancedFilters.update(v => !v);
      }

      hasAdvancedFiltersActive(): boolean {
            return (
                  this.state.buyingPriceMin() != null ||
                  this.state.buyingPriceMax() != null ||
                  this.state.sellingPriceMin() != null ||
                  this.state.sellingPriceMax() != null ||
                  this.state.profitValueMin() != null ||
                  this.state.profitValueMax() != null ||
                  this.state.profitPercentMin() != null ||
                  this.state.profitPercentMax() != null ||
                  (!!this.state.stockStatusFilter() && this.state.stockStatusFilter() !== 'ALL')
            );
      }

      updateNumberFilter(filterName: 'buyingMin' | 'buyingMax' | 'sellingMin' | 'sellingMax' | 'profitValMin' | 'profitValMax' | 'profitPctMin' | 'profitPctMax', event: Event): void {
            const input = event.target as HTMLInputElement;
            const val = input.value.trim() === '' ? null : Number(input.value);
            switch (filterName) {
                  case 'buyingMin': this.localBuyingPriceMin.set(val); break;
                  case 'buyingMax': this.localBuyingPriceMax.set(val); break;
                  case 'sellingMin': this.localSellingPriceMin.set(val); break;
                  case 'sellingMax': this.localSellingPriceMax.set(val); break;
                  case 'profitValMin': this.localProfitValueMin.set(val); break;
                  case 'profitValMax': this.localProfitValueMax.set(val); break;
                  case 'profitPctMin': this.localProfitPercentMin.set(val); break;
                  case 'profitPctMax': this.localProfitPercentMax.set(val); break;
            }
      }

      updateStockFilter(event: Event): void {
            const select = event.target as HTMLSelectElement;
            this.localStockStatusFilter.set(select.value);
      }

      applyAdvancedFilters(): void {
            this.resetScroll();
            this.state.setAdvancedFilters({
                  buyingPriceMin: this.localBuyingPriceMin(),
                  buyingPriceMax: this.localBuyingPriceMax(),
                  sellingPriceMin: this.localSellingPriceMin(),
                  sellingPriceMax: this.localSellingPriceMax(),
                  profitValueMin: this.localProfitValueMin(),
                  profitValueMax: this.localProfitValueMax(),
                  profitPercentMin: this.localProfitPercentMin(),
                  profitPercentMax: this.localProfitPercentMax(),
                  stockStatusFilter: this.localStockStatusFilter()
            });
      }

      clearAdvancedFilters(): void {
            this.resetScroll();
            this.localBuyingPriceMin.set(null);
            this.localBuyingPriceMax.set(null);
            this.localSellingPriceMin.set(null);
            this.localSellingPriceMax.set(null);
            this.localProfitValueMin.set(null);
            this.localProfitValueMax.set(null);
            this.localProfitPercentMin.set(null);
            this.localProfitPercentMax.set(null);
            this.localStockStatusFilter.set('');
            this.state.clearAdvancedFilters();
      }

      clearFilters(): void {
            this.resetScroll();
            this.localSearchTerm.set('');
            this.localBuyingPriceMin.set(null);
            this.localBuyingPriceMax.set(null);
            this.localSellingPriceMin.set(null);
            this.localSellingPriceMax.set(null);
            this.localProfitValueMin.set(null);
            this.localProfitValueMax.set(null);
            this.localProfitPercentMin.set(null);
            this.localProfitPercentMax.set(null);
            this.localStockStatusFilter.set('');
            this.state.clearFilters();
      }

      hasActiveFilters(): boolean {
            return this.state.hasActiveFilters();
      }

      onRowHover(productId: number): void {
            this.hoveredProductId.set(productId);
      }

      onRowLeave(): void {
            this.hoveredProductId.set(null);
      }

      toggleMenu(productId: number, event: Event): void {
            event.stopPropagation();
            this.openMenuId.set(this.openMenuId() === productId ? null : productId);
      }

      @HostListener('document:click')
      handleDocumentClick(): void {
            this.openMenuId.set(null);
            this.activeDropdown.set(null);
      }

      onViewProduct(productId: number): void {
            this.router.navigate(['/pos/product/manage', productId]);
      }

      onEditProduct(productId: number): void {
            this.router.navigate(['/pos/product/manage', productId]);
      }

      onDeleteProduct(productId: number): void {
            if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
                  this.state.deleteProduct(productId).subscribe();
            }
      }

      getPageNumbers(): number[] {
            return this.state.getPageNumbers();
      }

      previousPage(): void {
            this.resetScroll();
            this.state.previousPage();
      }

      nextPage(): void {
            this.resetScroll();
            this.state.nextPage();
      }

      goToPage(page: number): void {
            this.resetScroll();
            this.state.goToPage(page);
      }

      trackByProductId(index: number, product: any): number {
            return product.id;
      }
}

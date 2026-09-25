import {
      Component,
      OnInit,
      OnDestroy,
      inject,
      signal,
      ViewChild,
      ElementRef,
      ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { SidebarComponent } from '../../../../../shared/components/sidebar/sidebar.component';
import { ProductManageStateService } from '../../services/product-manage-state.service';
import { FloatingDropdownComponent } from '../../../../../shared/components/floating-dropdown/floating-dropdown.component';
import { ProductSearchPopupComponent } from '../../../../../shared/components/product-search-popup/product-search-popup.component';
import type { NamedEntity, ProductAttributeOption, ProductListItemDto, BrandTreeNodeDto, ProductGroupTreeNodeDto } from '../../models/product.models';
import { calculateProfitMargin } from '../../models/product.models';
import { ProductApiService } from '../../services/product-api.service';
import { NotificationService } from '../../../../../shared/services/notification.service';

/** Prompt 1 choice: update the whole unified group, only this product, or abort the save. */
export type UnifiedPriceChoice = 'all' | 'single' | 'cancel';

/** View state of Prompt 1 (bulk selling price update choice). */
export interface UnifiedPricePromptState {
      groupName: string;
      newPrice: number;
}

/** View state of Prompt 2 (warning shown when the group currently has different selling prices). */
export interface PriceDiscrepancyPromptState {
      groupName: string;
      newPrice: number;
      existingPrices: number[];
}

/** Tolerance used to ignore floating point noise when comparing selling prices (نصف قرش). */
const SELLING_PRICE_EPSILON = 0.004;

@Component({
      selector: 'app-manage-product',
      standalone: true,
      imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, SidebarComponent, FloatingDropdownComponent, ProductSearchPopupComponent],
      templateUrl: './manage-product.component.html',
      styleUrl: './manage-product.component.css',
      changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageProductComponent implements OnInit, OnDestroy {
      private readonly state = inject(ProductManageStateService);
      private readonly api = inject(ProductApiService);
      private readonly router = inject(Router);
      private readonly route = inject(ActivatedRoute);
      private readonly notifications = inject(NotificationService);
      private readonly destroy$ = new Subject<void>();

      activeTab: 'basic' | 'composition' = 'basic';
      sidebarVisible = signal(false);
      activeDropdown: 'attribute' | 'category' | 'manufacturer' | 'supplier' | 'brand' | 'productGroup' | null = null;
      showOverlay: 'category' | 'manufacturer' | 'supplier' | 'attribute' | null = null;

      @ViewChild('attributeTrigger') attributeTrigger?: ElementRef<HTMLButtonElement>;

      productId = this.state.productId;
      isEditMode = this.state.isEditMode;
      isPageLoading = this.state.isPageLoading;
      isSaving = this.state.isSaving;
      saveSuccess = this.state.saveSuccess;
      saveError = this.state.saveError;
      generatedName = this.state.generatedName;

      readonly attributes = this.state.attributes;
      readonly categories = this.state.categories;
      readonly manufacturers = this.state.manufacturers;
      readonly suppliers = this.state.suppliers;
      readonly brands = this.state.brands;
      readonly productGroups = this.state.productGroups;
      readonly selectedBrandId = this.state.selectedBrandId;
      readonly hasNoBrandsForCategory = this.state.hasNoBrandsForCategory;
      readonly isHierarchyLoading = this.state.isHierarchyLoading;

      readonly pendingAttribute = this.state.pendingAttribute;
      readonly editingAttributeIndex = this.state.editingAttributeIndex;
      readonly attributeEditorError = this.state.attributeEditorError;

      readonly calculateProfitMargin = calculateProfitMargin;

      // Product search state for composition/conversions
      allProducts = signal<any[]>([]);
      popupOpen = signal(false);
      activeSearchContext = signal<{ type: 'composition' | 'conversion', index: number } | null>(null);

      // ─── Unified selling price state (Phase 3) ────────────────────────────
      /** Group the edited product belongs to (null while creating / ungrouped products). */
      readonly productGroupId = this.state.productGroupId;
      readonly productGroupName = this.state.productGroupName;
      readonly isPriceUnified = this.state.isPriceUnified;

      /** Prompt 1: apply the new selling price to the whole group or only this product? */
      readonly unifiedPricePrompt = signal<UnifiedPricePromptState | null>(null);
      /** Prompt 2: extra confirmation when the group currently holds different selling prices. */
      readonly priceDiscrepancyPrompt = signal<PriceDiscrepancyPromptState | null>(null);
      /** True while the group price summary is being fetched. */
      readonly isPricePromptBusy = signal(false);

      get productForm() {
            return this.state.productForm;
      }

      get compositionFormArray() {
            return this.state.compositionFormArray;
      }

      get conversionsFormArray() {
            return this.state.conversionsFormArray;
      }

      get attributesFormArray() {
            return this.state.attributesFormArray;
      }

      get barcodesFormArray() {
            return this.state.barcodesFormArray;
      }

      get isBaseNameInvalid(): boolean {
            return this.state.isBaseNameInvalid;
      }

      get pageTitle(): string {
            return this.state.pageTitle;
      }

      get pendingAttributeLabel(): string {
            return this.state.pendingAttributeLabel;
      }

      get canConfirmAttribute(): boolean {
            return this.state.canConfirmAttribute;
      }

      get selectedCategoryName(): string {
            return this.state.getSelectedCategoryName();
      }

      get selectedBrandName(): string {
            return this.state.getSelectedBrandName();
      }

      get selectedProductGroupName(): string {
            return this.state.getSelectedProductGroupName();
      }

      get selectedManufacturerName(): string {
            return this.state.getSelectedManufacturerName();
      }

      get selectedSuppliers(): NamedEntity[] {
            return this.state.getSelectedSuppliers();
      }

      ngOnInit(): void {
            this.state.initialize();
            this.state.productForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
                  this.state.onFormValueChanged();
            });
            this.resolveEditMode();
      }

      ngOnDestroy(): void {
            this.destroy$.next();
            this.destroy$.complete();
      }

      private resolveEditMode(): void {
            const idParam = this.route.snapshot.paramMap.get('id');
            if (!idParam) {
                  this.state.resolveEditMode(null);
                  return;
            }
            const id = Number(idParam);
            if (isNaN(id)) return;
            this.state.resolveEditMode(id);
      }

      onToggleSidebar(): void {
            this.sidebarVisible.update(v => !v);
      }

      onSearchAttributeValueChange(value: string): void {
            this.state.pendingAttributeValue.set(value);
      }

      get pendingAttributeValue(): string {
            return this.state.pendingAttributeValue();
      }

      set pendingAttributeValue(value: string) {
            this.state.pendingAttributeValue.set(value);
      }

      selectPendingAttribute(attr: ProductAttributeOption, event?: MouseEvent): void {
            if (event) {
                  event.preventDefault();
                  event.stopPropagation();
            }
            this.state.selectPendingAttribute(attr);
            this.activeDropdown = null;
      }

      confirmAttributeValue(): void {
            this.state.confirmAttributeValue();
      }

      loadAttributeForEdit(index: number): void {
            this.state.loadAttributeForEdit(index);
      }

      removeAttribute(index: number): void {
            this.state.removeAttribute(index);
      }

      addBarcode(): void {
            this.state.addBarcode();
      }

      removeBarcode(index: number): void {
            this.state.removeBarcode(index);
      }

      setDefaultBarcode(index: number): void {
            this.state.setDefaultBarcode(index);
      }

      addConversion(): void {
            this.state.addConversion();
      }

      removeConversion(index: number): void {
            this.state.removeConversion(index);
      }

      setDefaultConversion(index: number): void {
            this.state.setDefaultConversion(index);
      }

      addCompositionRow(): void {
            this.state.addCompositionRow();
      }

      removeCompositionRow(index: number): void {
            this.state.removeCompositionRow(index);
      }

      getTotalStock(): number {
            return this.state.getTotalStock();
      }

      getStockClass(): string {
            return this.state.getStockClass();
      }

      getStockLabel(): string {
            return this.state.getStockLabel();
      }

      toggleDropdown(type: 'attribute' | 'category' | 'manufacturer' | 'supplier' | 'brand' | 'productGroup'): void {
            this.activeDropdown = this.activeDropdown === type ? null : type;
      }

      closeDropdowns(): void {
            this.activeDropdown = null;
      }

      onFormBodyScroll(): void {
            if (this.activeDropdown) {
                  this.closeDropdowns();
            }
      }

      selectCategory(cat: NamedEntity): void {
            this.state.selectCategory(cat);
            this.activeDropdown = null;
      }

      selectBrand(brand: BrandTreeNodeDto): void {
            this.state.selectBrand(brand);
            this.activeDropdown = null;
      }

      selectProductGroup(group: ProductGroupTreeNodeDto): void {
            this.state.selectProductGroup(group);
            this.activeDropdown = null;
      }

      selectManufacturer(man: NamedEntity): void {
            this.state.selectManufacturer(man);
            this.activeDropdown = null;
      }

      toggleSupplier(sup: NamedEntity): void {
            this.state.toggleSupplier(sup);
      }

      isSupplierSelected(sup: NamedEntity): boolean {
            return this.state.isSupplierSelected(sup);
      }

      removeSupplier(id: number): void {
            this.state.removeSupplier(id);
      }

      getAvailableAttributesForDropdown(): ProductAttributeOption[] {
            return this.state.getAvailableAttributesForDropdown();
      }

      openOverlay(type: 'category' | 'manufacturer' | 'supplier' | 'attribute'): void {
            this.showOverlay = type;
            this.activeDropdown = null;
      }

      closeOverlay(): void {
            this.showOverlay = null;
      }

      addNewItem(type: 'category' | 'manufacturer' | 'supplier' | 'attribute', name: string): void {
            this.state.addNewReferenceItem(type, name);
            this.closeOverlay();
      }

      getOverlayLabel(): string {
            switch (this.showOverlay) {
                  case 'category': return 'قسم';
                  case 'manufacturer': return 'شركة مصنعة';
                  case 'supplier': return 'مورد';
                  case 'attribute': return 'سمة';
                  default: return '';
            }
      }

      openProductPopup(type: 'composition' | 'conversion', index: number): void {
            this.activeSearchContext.set({ type, index });
            this.popupOpen.set(true);

            if (this.allProducts().length === 0) {
                  this.api.listProducts({ size: 1000 }).subscribe(res => {
                        const mapped = res.content.map(p => ({
                              ...p,
                              barcode: p.code,
                              stockQuantity: p.stock
                        }));
                        this.allProducts.set(mapped);
                  });
            }
      }

      onPopupClosed(): void {
            this.popupOpen.set(false);
            this.activeSearchContext.set(null);
      }

      selectProductFromSearch(product: any): void {
            const context = this.activeSearchContext();
            if (!context) return;
            const { type, index } = context;

            if (type === 'composition') {
                  const ctrl = this.compositionFormArray.at(index);
                  ctrl.patchValue({
                        materialId: product.id,
                        materialName: product.name,
                        costPerUnit: product.sellingPrice
                  });
            } else if (type === 'conversion') {
                  const ctrl = this.conversionsFormArray.at(index);
                  ctrl.patchValue({
                        parentProductId: product.id,
                        parentProductName: product.name
                  });
            }

            this.onPopupClosed();
      }

      onCancel(): void {
            this.unifiedPricePrompt.set(null);
            this.priceDiscrepancyPrompt.set(null);
            this.router.navigate(['/pos/products']);
      }

      onSave(): void {
            if (this.isPricePromptBusy()) return;

            if (this.requiresGroupPriceDecision()) {
                  this.unifiedPricePrompt.set({
                        groupName: this.state.productGroupName() || 'مجموعة المنتجات',
                        newPrice: this.state.getCurrentSellingPrice() ?? 0
                  });
                  return;
            }

            this.persistProduct();
      }

      /* ============================= */
      /* UNIFIED SELLING PRICE FLOW    */
      /* ============================= */

      /** Prompt 1 handler: group-wide update, single product update, or cancel the save. */
      onUnifiedPriceChoice(choice: UnifiedPriceChoice): void {
            if (this.isPricePromptBusy()) return;

            this.unifiedPricePrompt.set(null);

            if (choice === 'cancel') return;
            if (choice === 'single') {
                  this.persistProduct(false);
                  return;
            }

            this.resolveBulkPriceUpdate();
      }

      /** Prompt 2 handler: explicit confirmation before overwriting the different existing prices. */
      onPriceDiscrepancyDecision(confirmed: boolean): void {
            if (this.isPricePromptBusy()) return;

            this.priceDiscrepancyPrompt.set(null);
            if (!confirmed) return;

            this.persistProduct(true);
      }

      /** True when the edited product changed its selling price inside a price-unified group. */
      private requiresGroupPriceDecision(): boolean {
            if (!this.state.isEditMode()) return false;
            if (!this.state.isPriceUnified()) return false;
            if (this.state.productGroupId() == null) return false;

            const initial = this.state.initialSellingPrice();
            const current = this.state.getCurrentSellingPrice();
            if (initial === null || current === null) return false;

            return Math.abs(current - initial) > SELLING_PRICE_EPSILON;
      }

      /**
       * Loads the group price summary and either warns about a discrepancy (Prompt 2)
       * or propagates the new selling price right away.
       */
      private resolveBulkPriceUpdate(): void {
            const groupId = this.state.productGroupId();
            const newPrice = this.state.getCurrentSellingPrice();

            if (groupId == null || newPrice === null) return;

            this.isPricePromptBusy.set(true);
            this.api.getGroupPriceSummary(groupId).subscribe({
                  next: summary => {
                        this.isPricePromptBusy.set(false);

                        // Edge case: a single-product group has nothing to unify — skip Prompt 2.
                        if (summary.productCount <= 1) {
                              this.persistProduct(true);
                              return;
                        }

                        const distinctPrices = summary.distinctSellingPrices || [];
                        if (summary.hasPriceDiscrepancy || distinctPrices.length > 1) {
                              this.priceDiscrepancyPrompt.set({
                                    groupName: summary.groupName || this.state.productGroupName() || 'مجموعة المنتجات',
                                    newPrice,
                                    existingPrices: distinctPrices
                              });
                              return;
                        }

                        this.persistProduct(true);
                  },
                  error: (err: unknown) => {
                        this.isPricePromptBusy.set(false);
                        this.notifications.error(
                              this.resolveErrorMessage(err, 'تعذر التحقق من أسعار المجموعة. يرجى المحاولة مرة أخرى.')
                        );
                  }
            });
      }

      /** Saves the product, optionally propagating the selling price to the whole group. */
      private persistProduct(propagateGroupSellingPrice?: boolean): void {
            const isCreating = !this.state.isEditMode();
            const result = this.state.saveProduct(propagateGroupSellingPrice);
            if (!result) {
                  if (this.state.saveError()) {
                        // Composition has its own tab; conversions and every other invalid field are
                        // rendered inside the primary tab, so the user stays there.
                        const compositionInvalid = this.productForm.get('composition')?.invalid
                              && this.productForm.get('hasComposition')?.value;
                        this.activeTab = compositionInvalid ? 'composition' : 'basic';
                  }
                  return;
            }

            result.subscribe({
                  next: () => {
                        // Keep the baseline price in sync so later saves compare against the persisted value.
                        const savedPrice = this.state.getCurrentSellingPrice();
                        if (savedPrice !== null) {
                              this.state.initialSellingPrice.set(savedPrice);
                        }

                        if (isCreating) {
                              // Navigate immediately to product list, then show the toast
                              // The toast is rendered at the app root level so it persists across navigation
                              this.router.navigate(['/pos/products']).then(() => {
                                    this.notifications.success('تم حفظ المنتج بنجاح');
                              });
                        } else if (propagateGroupSellingPrice) {
                              this.notifications.success('تم توحيد سعر البيع لجميع منتجات المجموعة');
                        }
                        // In edit mode, saveSuccess signal handles inline feedback
                  }
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
}

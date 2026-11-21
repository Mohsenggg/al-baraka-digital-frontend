import { Component, ChangeDetectionStrategy, inject, HostListener, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ReceiptResponse } from '../core/models/pos.models';

// New dumb components
import { CashierActionsComponent } from './components/cashier-actions/cashier-actions.component';
import { CashierSidebarComponent } from './components/cashier-sidebar/cashier-sidebar.component';
import { CashierReceiptComponent } from './components/cashier-receipt/cashier-receipt.component';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';

// New state service
import { CashierStateService } from './services/cashier-state.service';
import { CreateReceiptInput, Product, CartItem, PaymentMethod } from '../core/models/pos.models';
import { NotificationService } from '../../../shared/services/notification.service';
import { ProductCatalogStore } from '../../../core/products/services/product-catalog.store';
import { SettingsService } from '../../../core/services/settings.service';

@Component({
      selector: 'app-cashier-page',
      standalone: true,
      imports: [
            CommonModule,
            FormsModule,
            CashierActionsComponent,
            CashierSidebarComponent,
            CashierReceiptComponent,
            SidebarComponent
      ],
      templateUrl: './cashier-page.component.html',
      styleUrls: ['./cashier-page.component.css'],
      encapsulation: ViewEncapsulation.None, // Ensures composed CSS targets dumb component internals perfectly
      changeDetection: ChangeDetectionStrategy.OnPush
})
export class CashierPageComponent implements OnInit {
      private state = inject(CashierStateService);
      private catalogStore = inject(ProductCatalogStore);
      private notifications = inject(NotificationService);
      private settingsService = inject(SettingsService);

      sidebarVisible = signal(false);
      rightSidebarVisible = signal(false);
      sidebarActiveTab = signal<'PERMANENT' | 'TEMPORARY'>('PERMANENT');

      // State bindings
      receipts$ = this.state.receipts$;
      filteredReceipts$ = this.state.filteredReceipts$;
      loading$ = this.state.loading$;

      currentReceipt = this.state.currentReceipt;
      cartItems = this.state.cartItems;
      distinctItemsCount = this.state.distinctItemsCount;
      totalQuantity = this.state.totalQuantity;
      subtotal = this.state.subtotal;
      totalDiscount = this.state.totalDiscount;
      tax = this.state.tax;
      finalTotal = this.state.finalTotal;
      receiptMode = this.state.receiptMode;
      hasStockErrors = this.state.hasStockErrors;
      products = this.state.products;
      draftsCount = this.state.draftsCount;
      temporaryReceipts = this.state.temporaryReceipts;

      showPaymentScreen = signal(false);
      showNewReceiptConfirmDialog = signal(false);
      showDraftConflictDialog = signal(false);
      pendingDraftToLoad = signal<number | null>(null);
      pendingReceiptAction: 'NEW' | 'PREVIOUS' | null = null;

      ngOnInit() {
            this.state.loadAllProducts().subscribe();
            // Initial fetch to populate sidebar
            this.state.filterReceipts({ page: 0, size: 20 });
            this.state.loadTemporaryReceiptsCount();
            this.state.loadTemporaryReceipts();
            this.settingsService.loadSettings().subscribe();
      }

      // Action Bar Events
      private pendingPrintIntent = false;

      onSave() {
            this.pendingPrintIntent = false;
            this.executeSaveFlow();
      }

      onSaveAndPrint() {
            this.pendingPrintIntent = true;
            this.executeSaveFlow();
      }

      onConfirmPayment() {
            this.executeSaveFlow();
      }

      private executeSaveFlow() {
            const obs = this.doSave();
            if (obs) {
                  obs.subscribe({
                        next: (receipt) => {
                              if (receipt && receipt.id) {
                                    if (this.pendingPrintIntent) {
                                          this.executePrint(receipt.id, true);
                                    }
                                    // Reset intent after successful completion
                                    this.pendingPrintIntent = false;

                                    if (this.pendingReceiptAction === 'PREVIOUS') {
                                          this.pendingReceiptAction = null;
                                          this.state.navigateReceipt('PREVIOUS');
                                    } else {
                                          this.pendingReceiptAction = null;
                                    }
                              }
                        },
                        error: () => {
                              this.pendingReceiptAction = null;
                        }
                  });
            }
      }

      private buildReceiptPayload(): CreateReceiptInput {
            const receiptData = this.currentReceipt();
            const items = this.cartItems();
            const isEdit = this.receiptMode() === 'EDIT' && receiptData?.status !== 'DRAFT';

            return {
                  customerName: receiptData?.customerName || receiptData?.customer?.name || '',
                  customerPhone: receiptData?.customerPhone || receiptData?.customer?.phone || '',
                  customerId: receiptData?.customerId || null,
                  cashierId: receiptData?.cashierId || 1,
                  paymentMethod: (receiptData?.paymentMethod as PaymentMethod) || 'CASH',
                  receiptType: 'SELL',
                  totalQuantity: this.totalQuantity(),
                  items: items.map(item => ({
                        productCode: item.product.barcode,
                        productName: item.product.name,
                        sellingPrice: item.sellingPrice,
                        buyingPrice: item.buyingPrice,
                        quantity: item.quantity,
                        total: item.total,
                        remainingStock: item.remainingStock,
                        ...(isEdit && item.originalQuantity != null ? { originalQuantity: item.originalQuantity } : {})
                  }))
            };
      }

      private doSave(): Observable<ReceiptResponse | null> {
            const items = this.cartItems();
            if (items.length === 0) return of(null);
            if (this.hasStockErrors()) return of(null);

            const receiptData = this.currentReceipt();
            const paymentMethod = (receiptData?.paymentMethod as PaymentMethod) || 'CASH';
            const total = this.finalTotal();
            const threshold = this.settingsService.remainingAmountThreshold();
            const isThresholdEnabled = this.settingsService.enableRemainingAmountThreshold();

            // Conditional Payment Screen Rule:
            // - Always bypass if paymentMethod is TRANSFER (no cash change applicable)
            // - Bypass if threshold is enabled and total <= threshold
            // - Require overlay if payment is CASH and (threshold disabled OR total > threshold)
            const requiresPaymentOverlay = paymentMethod === 'CASH' &&
                                           (!isThresholdEnabled || total > threshold);

            if (requiresPaymentOverlay && !this.showPaymentScreen()) {
                  this.showPaymentScreen.set(true);
                  return of(null);
            }

            const payload = this.buildReceiptPayload();

            if (receiptData?.status === 'DRAFT' && receiptData?.id) {
                  return this.state.completeTemporaryReceipt(receiptData.id, payload).pipe(
                        tap(() => {
                              this.showPaymentScreen.set(false);
                              this.state.filterReceipts({ page: 0, size: 20 });
                        })
                  );
            } else if (this.receiptMode() === 'EDIT' && receiptData?.id) {
                  return this.state.updateReceipt(receiptData.id, payload).pipe(
                        tap(() => {
                              this.showPaymentScreen.set(false);
                              this.state.filterReceipts({ page: 0, size: 20 });
                        })
                  );
            } else {
                  return this.state.createReceipt(payload).pipe(
                        tap(() => {
                              this.showPaymentScreen.set(false);
                              this.state.filterReceipts({ page: 0, size: 20 });
                        })
                  );
            }
      }

      onTemporarySave(onSuccess?: () => void) {
            if (this.cartItems().length === 0) {
                  this.notifications.warning('لا توجد عناصر لحفظها مؤقتاً');
                  return;
            }
            const payload = this.buildReceiptPayload();
            this.state.saveTemporaryReceipt(payload).subscribe({
                  next: () => {
                        this.notifications.success('تم حفظ الفاتورة مؤقتاً بنجاح');
                        onSuccess?.();
                  },
                  error: () => {
                        this.notifications.error('فشل حفظ الفاتورة مؤقتاً');
                  }
            });
      }

      onOpenDraftsSidebar() {
            this.sidebarActiveTab.set('TEMPORARY');
            this.rightSidebarVisible.set(true);
            this.state.loadTemporaryReceipts();
      }

      onPrint() {
            const current = this.currentReceipt();
            if (current?.id) {
                  this.executePrint(current.id, false);
            }
      }

      private executePrint(id: number, isFromSaveAndPrint: boolean) {
            console.log(`[PRINT] Starting print operation for receipt ID: ${id}`);
            this.state.printReceipt(id).subscribe({
                  next: () => {
                        console.log(`[PRINT SUCCESS] Receipt ID ${id} printed successfully.`);
                        this.notifications.success('تمت الطباعة بنجاح');
                  },
                  error: (err) => {
                        console.error(`[PRINT ERROR] Failed to print receipt ID ${id}.`, err);
                        if (isFromSaveAndPrint) {
                              this.notifications.warning('تم حفظ الفاتورة ولكن فشلت عملية الطباعة');
                        } else {
                              this.notifications.error('فشلت عملية الطباعة');
                        }
                  }
            });
      }

      hasEnteredData(): boolean {
            return this.receiptMode() !== 'VIEW' && this.cartItems().length > 0;
      }

      onNew() {
            if (this.hasEnteredData()) {
                  this.pendingReceiptAction = 'NEW';
                  this.showNewReceiptConfirmDialog.set(true);
            } else {
                  this.state.clearCart();
            }
      }

      onConfirmNewWithTempSave() {
            this.showNewReceiptConfirmDialog.set(false);
            const action = this.pendingReceiptAction;
            this.pendingReceiptAction = null;
            this.onTemporarySave(() => {
                  if (action === 'PREVIOUS') {
                        this.state.navigateReceipt('PREVIOUS');
                  }
            });
      }

      onConfirmNewWithPermanentSave() {
            this.showNewReceiptConfirmDialog.set(false);
            this.onSave();
      }

      onConfirmNewWithDiscard() {
            this.showNewReceiptConfirmDialog.set(false);
            const action = this.pendingReceiptAction;
            this.pendingReceiptAction = null;

            const cur = this.currentReceipt();
            if (cur?.id && cur?.status === 'DRAFT') {
                  this.state.deleteTemporaryReceipt(cur.id).subscribe({
                        next: () => {
                              this.notifications.info(action === 'PREVIOUS' ? 'تم حذف الفاتورة المؤقتة والانتقال' : 'تم بدء فاتورة جديدة');
                              if (action === 'PREVIOUS') {
                                    this.state.navigateReceipt('PREVIOUS');
                              }
                        },
                        error: () => {
                              this.notifications.error('فشل حذف الفاتورة المؤقتة');
                        }
                  });
            } else {
                  this.state.clearCart();
                  this.notifications.info(action === 'PREVIOUS' ? 'تم تجاهل الفاتورة والانتقال' : 'تم بدء فاتورة جديدة');
                  if (action === 'PREVIOUS') {
                        this.state.navigateReceipt('PREVIOUS');
                  }
            }
      }

      onCancelNewReceiptDialog() {
            this.showNewReceiptConfirmDialog.set(false);
            this.pendingReceiptAction = null;
      }

      onClosePaymentScreen() {
            this.showPaymentScreen.set(false);
            this.pendingReceiptAction = null;
      }

      onOpenPaymentScreenManual() {
            this.showPaymentScreen.set(true);
      }

      onSelectTemporaryReceipt(id: number) {
            if (this.cartItems().length > 0) {
                  this.pendingDraftToLoad.set(id);
                  this.showDraftConflictDialog.set(true);
            } else {
                  this.loadDraftDirectly(id);
            }
      }

      onConflictSaveCurrentTemp() {
            const draftId = this.pendingDraftToLoad();
            this.showDraftConflictDialog.set(false);
            const payload = this.buildReceiptPayload();
            this.state.saveTemporaryReceipt(payload).subscribe({
                  next: () => {
                        if (draftId) {
                              this.loadDraftDirectly(draftId);
                        }
                  }
            });
      }

      onConflictDiscardCurrent() {
            const draftId = this.pendingDraftToLoad();
            this.showDraftConflictDialog.set(false);
            if (draftId) {
                  this.loadDraftDirectly(draftId);
            }
      }

      onCancelDraftConflict() {
            this.showDraftConflictDialog.set(false);
            this.pendingDraftToLoad.set(null);
      }

      private loadDraftDirectly(id: number) {
            this.state.loadDraftReceipt(id).subscribe({
                  next: () => {
                        this.notifications.success('تم فتح الفاتورة المؤقتة للمتابعة');
                  },
                  error: () => {
                        this.notifications.error('فشل فتح الفاتورة المؤقتة');
                  }
            });
      }

      onDeleteTemporaryReceipt(id: number) {
            if (!confirm('هل أنت متأكد من حذف هذه الفاتورة المؤقتة؟')) return;
            this.state.deleteTemporaryReceipt(id).subscribe({
                  next: () => {
                        this.notifications.success('تم حذف الفاتورة المؤقتة بنجاح');
                  },
                  error: () => {
                        this.notifications.error('فشل حذف الفاتورة المؤقتة');
                  }
            });
      }

      onEdit() {
            this.state.setReceiptMode('EDIT');
      }
      onRefund() {
            const receipt = this.currentReceipt();
            if (!receipt?.id) {
                  this.notifications.warning('لا توجد فاتورة محددة للاسترجاع');
                  return;
            }
            if (!confirm('هل أنت متأكد من استرجاع هذه الفاتورة؟ سيتم استعادة المخزون وحذف سجل الفاتورة.')) return;

            this.state.deleteReceipt(receipt.id).subscribe({
                  next: () => {
                        this.notifications.success('تم استرجاع الفاتورة واستعادة المخزون بنجاح');
                        this.state.filterReceipts({ page: 0, size: 20 });
                  },
                  error: (err) => {
                        const message = err?.error?.message || 'فشل استرجاع الفاتورة';
                        this.notifications.error(message);
                  }
            });
      }
      onDrafts() {
            this.onOpenDraftsSidebar();
      }

      onToggleSidebar() {
            this.sidebarVisible.update(v => !v);
      }

      onToggleRightSidebar() {
            if (!this.rightSidebarVisible()) {
                  this.sidebarActiveTab.set('PERMANENT');
            }
            this.rightSidebarVisible.update(v => !v);
      }

      // Receipt Table Events
      onRemoveItem(productId: number) {
            this.state.removeDraftItem(productId);
      }

      onViewItem(item: any) {
            console.log('View item', item);
      }

      onUpdateQuantity(event: { item: CartItem, delta: number }) {
            if (event.delta > 0) {
                  this.onAddItem({ product: event.item.product, quantity: event.delta });
            } else {
                  this.state.updateItemQuantity(event.item.productId, event.delta);
            }
      }

      onUpdateItemField(event: { item: CartItem, field: 'sellingPrice' | 'quantity' | 'total', value: number }) {
            if (event.field === 'quantity') {
                  const delta = event.value - event.item.quantity;
                  if (delta > 0) {
                        this.onAddItem({ product: event.item.product, quantity: delta });
                        return;
                  }
            }
            this.state.updateCartItemField(event.item.productId, event.field, event.value);
      }

      // Refill state
      showRefillDialog = signal(false);
      showPricingDialog = signal(false);
      refillProduct: Product | null = null;
      /** How many units of the PARENT product to transfer */
      refillParentUnits: number = 1;
      refillSelectedParentId: number | null = null;
      isRefillLoading = signal(false);
      pricingValidation: import('../core/models/pos.models').RefillValidateResponse | null = null;
      /**
       * The quantity the cashier originally tried to sell (e.g. 1 piece).
       * Preserved across the refill dialog so the cart row reflects the sale,
       * not the inventory refill amount.
       */
      refillOriginalSaleQuantity: number = 1;

      /** The conversion option currently selected */
      get selectedRefillOption() {
            return this.refillProduct?.refillOptions?.find(o => o.parentProductId === this.refillSelectedParentId) ?? null;
      }

      /**
       * Returns live stock of the parent product directly from catalogStore if available,
       * or falls back to the static parentStock on the refillOption.
       */
      getParentStock(parentProductId: number): number {
            const parent = this.catalogStore.findById(parentProductId) ?? this.products().find(p => p.id === parentProductId);
            if (parent && parent.stockQuantity != null) {
                  return parent.stockQuantity;
            }
            const opt = this.refillProduct?.refillOptions?.find(o => o.parentProductId === parentProductId);
            return opt?.parentStock ?? 0;
      }

      /** Units that will be added to the child product */
      get refillChildUnitsAdded(): number {
            const opt = this.selectedRefillOption;
            if (!opt || opt.parentQuantity <= 0) return 0;
            const units = Number(this.refillParentUnits);
            if (!Number.isFinite(units) || units <= 0) return 0;
            return Math.floor(units * (opt.childQuantity / opt.parentQuantity));
      }

      /**
       * Total quantity needed across any existing cart row + the new quantity being added.
       */
      get refillTotalNeededQuantity(): number {
            if (!this.refillProduct) return 0;
            const currentItem = this.cartItems().find(i => i.productId === this.refillProduct!.id);
            return (currentItem?.quantity || 0) + this.refillOriginalSaleQuantity;
      }

      /**
       * How many child units are still missing to fulfil the total sale quantity.
       * e.g. stock=9, requested=20 → shortage = 11
       */
      get refillMissingChildQty(): number {
            if (!this.refillProduct) return 0;
            const currentStock = this.refillProduct.stockQuantity ?? 0;
            return Math.max(0, this.refillTotalNeededQuantity - currentStock);
      }

      /** Remaining parent stock after the transfer */
      get refillParentRemainingAfter(): number {
            if (!this.refillSelectedParentId) return 0;
            const units = Number(this.refillParentUnits);
            const validUnits = Number.isFinite(units) && units > 0 ? units : 0;
            return this.getParentStock(this.refillSelectedParentId) - validUnits;
      }

      /** Max parent units the cashier can transfer (limited by available live parent stock) */
      get refillParentMaxUnits(): number {
            if (!this.refillSelectedParentId) return 0;
            return this.getParentStock(this.refillSelectedParentId);
      }

      decrementRefillParentUnits(): void {
            const current = Math.floor(Number(this.refillParentUnits)) || 1;
            this.refillParentUnits = Math.max(1, current - 1);
      }

      incrementRefillParentUnits(): void {
            const current = Math.floor(Number(this.refillParentUnits)) || 0;
            const max = this.refillParentMaxUnits;
            if (max > 0) {
                  this.refillParentUnits = Math.min(max, Math.max(1, current + 1));
            }
      }

      onRefillParentUnitsChange(value: any): void {
            this.refillParentUnits = value;
      }

      normalizeRefillParentUnits(): void {
            const parsed = Math.floor(Number(this.refillParentUnits));
            if (!Number.isFinite(parsed) || parsed < 1) {
                  this.refillParentUnits = 1;
            } else {
                  this.refillParentUnits = parsed;
            }
      }

      onRefillParentSelect(parentId: number) {
            this.refillSelectedParentId = parentId;
            this.refillParentUnits = 1;
      }

      async onAddItem(event: { product: Product, quantity: number }) {
            // Always obtain the canonical product from catalogStore to ensure latest stock & refillOptions
            const canonicalProduct = this.catalogStore.findById(event.product.id)
                  ?? (event.product.barcode ? this.catalogStore.findByBarcode(event.product.barcode) : null)
                  ?? event.product;

            const currentItem = this.cartItems().find(i => i.productId === canonicalProduct.id);
            const totalRequested = (currentItem?.quantity || 0) + event.quantity;
            const currentStock = canonicalProduct.stockQuantity ?? 0;

            if (currentStock < totalRequested) {
                  const options = canonicalProduct.refillOptions;

                  if (options && options.length > 0) {
                        // How many child units are still missing after current stock
                        const missingChildQty = totalRequested - currentStock;

                        this.refillProduct = canonicalProduct;
                        this.refillOriginalSaleQuantity = event.quantity;

                        // Choose the preferred parent (default or first)
                        const preferredParent = options.find(o => o.isDefault) ?? options[0];

                        // Find a capable parent that has available live stock
                        const capableParent = options
                              .map(o => ({ opt: o, liveStock: this.getParentStock(o.parentProductId) }))
                              .filter(item => item.liveStock > 0)
                              .sort((a, b) => b.liveStock - a.liveStock)
                              .find(item => {
                                    const maxChild = item.liveStock * (item.opt.childQuantity / item.opt.parentQuantity);
                                    return maxChild >= missingChildQty;
                              })?.opt;

                        const selectedParent = capableParent ?? preferredParent;
                        this.refillSelectedParentId = selectedParent.parentProductId;
                        this.refillParentUnits = 1;

                        this.showRefillDialog.set(true);
                        return;
                  } else {
                        // Show insufficient stock message as a toast, and allow it to be added to cart with error state
                        this.notifications.warning(`الكمية المطلوبة (${totalRequested}) تتجاوز الرصيد المتاح (${currentStock})`);
                  }
            }
            this.state.addCartItem(canonicalProduct, event.quantity);
      }

      async confirmRefill() {
            this.normalizeRefillParentUnits();
            const childQty = this.refillChildUnitsAdded;
            if (!this.refillProduct || !this.refillSelectedParentId || childQty < 1 || this.refillParentRemainingAfter < 0 || this.refillParentMaxUnits <= 0) return;
            
            this.isRefillLoading.set(true);
            try {
                  const response = await this.state.validateRefill({
                        childBarcode: this.refillProduct.barcode,
                        parentProductId: this.refillSelectedParentId,
                        requestedChildQuantity: childQty
                  });
                  
                  this.pricingValidation = response;
                  if (response.pricingChangeRequired) {
                        this.showRefillDialog.set(false);
                        this.showPricingDialog.set(true);
                  } else {
                        await this.executeRefill(false);
                  }
            } catch (err: any) {
                  this.notifications.error(err?.error?.message || 'فشل التحقق من إعادة التعبئة');
            } finally {
                  this.isRefillLoading.set(false);
            }
      }

      async executeRefill(acceptPricingChange: boolean = true) {
            const childQty = this.refillChildUnitsAdded;
            if (!this.refillProduct || !this.refillSelectedParentId || !this.pricingValidation) return;
            
            this.isRefillLoading.set(true);
            try {
                  const updatedProduct = await this.state.executeRefill({
                        childBarcode: this.refillProduct.barcode,
                        parentProductId: this.refillSelectedParentId,
                        requestedChildQuantity: childQty,
                        acceptPricingChange: acceptPricingChange,
                        expectedNewBuyingPrice: this.pricingValidation.newBuyingPrice,
                        expectedProposedSellingPrice: this.pricingValidation.proposedSellingPrice,
                        expectedMarkupPercentage: this.pricingValidation.currentMarkupPercentage,
                        parentUnitsUsed: this.refillParentUnits
                  });
                  
                  this.showPricingDialog.set(false);
                  this.showRefillDialog.set(false);
                  
                  // Add the originally requested SALE quantity to the cart.
                  // refillChildUnitsAdded is an inventory operation and must never
                  // replace the cashier's requested sale quantity.
                  this.state.addCartItem(updatedProduct, this.refillOriginalSaleQuantity);
                  this.refillProduct = null;
                  this.pricingValidation = null;
                  this.refillOriginalSaleQuantity = 1;
                  this.notifications.success('تمت إعادة التعبئة بنجاح');
            } catch (err: any) {
                  this.notifications.error(err?.error?.message || 'فشل تنفيذ إعادة التعبئة');
            } finally {
                  this.isRefillLoading.set(false);
            }
      }

      cancelRefill() {
            this.showRefillDialog.set(false);
            this.showPricingDialog.set(false);
            this.refillProduct = null;
            this.pricingValidation = null;
      }

      onUpdatePaymentMethod(method: PaymentMethod) {
            this.state.updateDraftReceiptData({ paymentMethod: method });
      }

      onUpdateCustomerName(name: string) {
            this.state.updateDraftReceiptData({ customerName: name });
      }

      onUpdateCustomerPhone(phone: string) {
            const current = this.currentReceipt();
            const customer = { ...(current?.customer || {}), phone } as any;
            this.state.updateDraftReceiptData({ customer });
      }

      // Sidebar Events
      onSelectReceipt(id: number) {
            this.state.loadNavigationCache(id);
      }

      onApplyFilters(filters: any) {
            this.state.filterReceipts({ ...filters, page: 0, size: 20 });
      }

      onClearFilters() {
            this.state.filterReceipts({ sort: 'receiptDate,DESC', page: 0, size: 20 });
      }

      onPreviousReceipt() {
            if (this.hasEnteredData()) {
                  this.pendingReceiptAction = 'PREVIOUS';
                  this.showNewReceiptConfirmDialog.set(true);
            } else {
                  this.state.navigateReceipt('PREVIOUS');
            }
      }

      onNextReceipt() {
            this.state.navigateReceipt('NEXT');
      }

      @HostListener('window:keydown', ['$event'])
      handleKeyboardEvent(event: KeyboardEvent) {
            switch (event.key) {
                  case 'F1': event.preventDefault(); this.onNew(); break;
                  case 'F2': event.preventDefault(); this.onEdit(); break;
                  case 'F5': event.preventDefault(); this.onRefund(); break;
                  case 'F11': event.preventDefault(); this.onSave(); break;
                  case 'F12': event.preventDefault(); this.onSaveAndPrint(); break;
            }
      }
}

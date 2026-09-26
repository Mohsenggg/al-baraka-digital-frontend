import { Injectable, computed, signal, inject } from '@angular/core';
import { BehaviorSubject, Observable, tap, finalize, catchError, throwError, EMPTY, map, switchMap, firstValueFrom } from 'rxjs';
import { CashierApiService } from './cashier-api.service';
import { CashierSeedService } from './cashier-seed.service';
import { ProductCatalogStore } from '../../../../core/products/services/product-catalog.store';
import type {
      ReceiptResponse, CreateReceiptInput, UpdateReceiptInput,
      Product, CartItem, ReceiptFilterParams, ReceiptListItemDto, ReceiptMode,
      DeleteReceiptResponse
} from '../../core/models/pos.models';

export function validateCartItemStock(item: CartItem, mode: ReceiptMode): string | null {
      if (mode === 'VIEW') return null;

      if (mode === 'EDIT' && item.originalQuantity != null && item.currentRemainingStock != null) {
            const maxAllowed = item.currentRemainingStock + item.originalQuantity;
            if (item.quantity > maxAllowed) {
                  return `الكمية المطلوبة (${item.quantity}) تتجاوز الحد الأقصى المسموح به (${maxAllowed})`;
            }
      } else {
            if (item.quantity > item.product.stockQuantity) {
                  return `الكمية المطلوبة (${item.quantity}) تتجاوز الرصيد المتاح (${item.product.stockQuantity})`;
            }
      }

      return null;
}

@Injectable({
      providedIn: 'root'
})
export class CashierStateService {
      private api = inject(CashierApiService);
      private seed = inject(CashierSeedService);
      private catalogStore = inject(ProductCatalogStore);

      // --------- State Management (RxJS BehaviorSubjects) ---------
      private _receiptsList = new BehaviorSubject<ReceiptResponse[]>([]);
      public receipts$ = this._receiptsList.asObservable();

      private _filteredReceipts = new BehaviorSubject<ReceiptListItemDto[]>([]);
      public filteredReceipts$ = this._filteredReceipts.asObservable();

      private _loading = new BehaviorSubject<boolean>(false);
      public loading$ = this._loading.asObservable();

      private _error = new BehaviorSubject<string | null>(null);
      public error$ = this._error.asObservable();

      private _pagination = new BehaviorSubject<{ page: number; size: number; total: number; totalPages: number }>({
            page: 1, size: 10, total: 0, totalPages: 0
      });
      public pagination$ = this._pagination.asObservable();

      // --------- Frontend POS Cart State (Signal based for UI reactivity) ---------
      private draftItemsSignal = signal<CartItem[]>([]);
      public cartItems = this.draftItemsSignal.asReadonly();

      public distinctItemsCount = computed(() => this.draftItemsSignal().length);
      public totalQuantity = computed(() => this.draftItemsSignal().reduce((acc, item) => acc + item.quantity, 0));
      public subtotal = computed(() => this.draftItemsSignal().reduce((acc, item) => acc + item.total, 0));
      public totalDiscount = computed(() => this.draftItemsSignal().reduce((acc, item) => acc + item.discount, 0));
      public tax = computed(() => this.subtotal() * 0.15); // Example 15% tax
      public finalTotal = computed(() => this.subtotal());

      private currentSavedReceiptSignal = signal<ReceiptResponse | null>(null);
      public currentReceipt = this.currentSavedReceiptSignal.asReadonly();

      private receiptModeSignal = signal<ReceiptMode>('NEW');
      public receiptMode = this.receiptModeSignal.asReadonly();

      public hasStockErrors = computed(() =>
            this.draftItemsSignal().some(item => !!item.stockError)
      );

      public setReceiptMode(mode: ReceiptMode): void {
            this.receiptModeSignal.set(mode);
      }

      // Signal to hold all cached products locally (delegated to ProductCatalogStore)
      public products = this.catalogStore.products;

      // --------- Navigation Cache State ---------
      private navigationCache: ReceiptResponse[] = [];
      private navCurrentIndex: number = -1;
      private navHasPrevious: boolean = false;
      private navHasNext: boolean = false;

      constructor() { }

      // --------- API Orchestration Methods ---------

      public loadAllProducts(forceRefresh: boolean = false): Observable<Product[]> {
            this.setLoading(true);
            return this.catalogStore.loadCatalog(forceRefresh).pipe(
                  tap(() => {
                        this.refreshNavigationCacheStock();
                        this.refreshCurrentReceiptDisplay();
                        this.clearError();
                  }),
                  catchError((err) => {
                        this.handleError(err);
                        return throwError(() => err);
                  }),
                  finalize(() => this.setLoading(false))
            );
      }

      private getLiveStockForProductCode(productCode: string, fallback = 0): number {
            const product = this.catalogStore.findByBarcode(productCode);
            return product ? product.stockQuantity : fallback;
      }

      private refreshNavigationCacheStock(): void {
            if (this.navigationCache.length === 0) return;

            this.navigationCache = this.navigationCache.map(receipt => ({
                  ...receipt,
                  items: receipt.items.map(item => ({
                        ...item,
                        currentRemainingStock: this.getLiveStockForProductCode(
                              item.productCode,
                              item.currentRemainingStock ?? item.remainingStock ?? 0
                        )
                  }))
            }));
      }

      private refreshCurrentReceiptDisplay(): void {
            const current = this.currentSavedReceiptSignal();
            if (!current?.id) return;

            const cached = this.navigationCache.find(r => r.id === current.id);
            if (cached) {
                  this.setReceiptAsCurrent(cached);
            }
      }

      public searchProducts(query: string): Product[] {
            return this.catalogStore.search({ query, activeOnly: true });
      }

      public loadReceipts(page: number = 1, size: number = 10, search: string = ''): void {
            this.setLoading(true);
            this.api.getReceipts(page, size, search).subscribe({
                  next: (res) => {
                        const content = res.data || res.content || [];
                        this._receiptsList.next(content);
                        this._pagination.next({
                              page: res.page,
                              size: res.size,
                              total: res.total || res.totalElements || 0,
                              totalPages: res.totalPages || Math.ceil((res.total || 0) / res.size)
                        });
                        this.clearError();
                  },
                  error: (err) => this.handleError(err),
                  complete: () => this.setLoading(false)
            });
      }

      public filterReceipts(params: ReceiptFilterParams): void {
            this.setLoading(true);
            this.api.filterReceipts(params).subscribe({
                  next: (res) => {
                        this._filteredReceipts.next(res.content || []);
                        this._pagination.next({
                              page: (res.number || 0) + 1,
                              size: res.size || 20,
                              total: res.totalElements || 0,
                              totalPages: res.totalPages || 0
                        });
                        this.clearError();
                  },
                  error: (err) => this.handleError(err),
                  complete: () => this.setLoading(false)
            });
      }

      private setReceiptAsCurrent(receipt: ReceiptResponse) {
            this.setReceiptMode('VIEW');
            this.currentSavedReceiptSignal.set(receipt);

            this.draftItemsSignal.set(
                  receipt.items.map((i, index) => {
                        const foundProduct = this.catalogStore.findByBarcode(i.productCode);
                        const uniqueId = foundProduct ? foundProduct.id : -(index + 1);
                        const currentLiveStock = foundProduct
                              ? foundProduct.stockQuantity
                              : (i.currentRemainingStock ?? i.remainingStock ?? 0);

                        return {
                              productId: uniqueId,
                              productName: i.productName,
                              quantity: i.quantity,
                              sellingPrice: i.sellingPrice,
                              buyingPrice: i.buyingPrice,
                              discount: 0,
                              total: i.totalPrice,
                              remainingStock: currentLiveStock,
                              product: foundProduct || this.seed.getPlaceholderProduct({
                                    id: uniqueId,
                                    name: i.productName,
                                    barcode: i.productCode,
                                    sellingPrice: i.sellingPrice,
                                    buyingPrice: i.buyingPrice,
                                    stockQuantity: currentLiveStock
                              }),
                              originalQuantity: i.quantity,
                              originalRemainingStock: i.remainingStock,
                              currentRemainingStock: currentLiveStock
                        };
                  })
            );
      }

      public getReceipt(id: number): void {
            this.setLoading(true);
            this.api.getReceiptById(id).subscribe({
                  next: (receipt) => {
                        this.setReceiptAsCurrent(receipt);
                        this.clearError();
                  },
                  error: (err) => this.handleError(err),
                  complete: () => this.setLoading(false)
            });
      }

      public loadNavigationCache(id: number, direction: 'NEXT' | 'PREVIOUS' = 'PREVIOUS'): void {
            this.setLoading(true);
            // Backend pagination: 'NEXT' = older receipts, 'PREVIOUS' = newer receipts
            // Frontend timeline: 'PREVIOUS' = older receipts, 'NEXT' = newer receipts
            const backendDirection = direction === 'PREVIOUS' ? 'NEXT' : 'PREVIOUS';
            console.log(`[Navigation] Loading cache for receipt ID: ${id} with frontend direction ${direction} (backend ${backendDirection})`);

            this.api.getReceiptNavigation(id, backendDirection, 10).subscribe({
                  next: (res) => {
                        console.log('[Navigation] Cache loaded from backend:', res);
                        this.navigationCache = res.receipts || [];
                        this.navCurrentIndex = res.currentIndex ?? -1;
                        // Backend hasNext means has OLDER. Frontend navHasPrevious means can we go OLDER.
                        // Backend hasPrevious means has NEWER. Frontend navHasNext means can we go NEWER.
                        this.navHasPrevious = res.hasNext ?? false;
                        this.navHasNext = res.hasPrevious ?? false;

                        if (this.navigationCache.length > 0 && this.navCurrentIndex >= 0 && this.navCurrentIndex < this.navigationCache.length) {
                              this.setReceiptAsCurrent(this.navigationCache[this.navCurrentIndex]);
                        }
                        this.clearError();
                  },
                  error: (err) => {
                        console.error('[Navigation] Failed to load cache:', err);
                        this.handleError(err);
                        // Fallback to standard getReceipt so the selected receipt is at least displayed
                        this.getReceipt(id);
                  },
                  complete: () => this.setLoading(false)
            });
      }

      public navigateReceipt(direction: 'PREVIOUS' | 'NEXT'): void {
            console.log(`[Navigation] Navigating ${direction}. Current cache length: ${this.navigationCache.length}, Current Index: ${this.navCurrentIndex}`);

            if (this.navigationCache.length === 0) {
                  const current = this.currentSavedReceiptSignal();
                  if (current && current.id) {
                        console.log('[Navigation] Cache is empty, initializing with current receipt ID:', current.id);
                        this.loadNavigationCache(current.id, direction);
                  } else {
                        if (direction === 'PREVIOUS') {
                              const list = this._filteredReceipts.value;
                              if (list && list.length > 0) {
                                    console.log('[Navigation] Fetching the latest receipt from the list as PREVIOUS:', list[0].id);
                                    this.loadNavigationCache(list[0].id, 'PREVIOUS');
                              } else {
                                    console.warn('[Navigation] Cannot navigate: No receipts available in the system.');
                              }
                        } else {
                              console.log('[Navigation] Cannot move NEXT from a blank receipt.');
                        }
                  }
                  return;
            }

            // Determine array order: isNewerFirst is true if index 0 is newer than the end of the array.
            // We assume ID sequentially correlates with time (higher ID = newer).
            let isNewerFirst = true;
            if (this.navigationCache.length >= 2) {
                  isNewerFirst = this.navigationCache[0].id > this.navigationCache[this.navigationCache.length - 1].id;
            }

            // PREVIOUS = go to older receipt. NEXT = go to newer receipt.
            let targetIndex = this.navCurrentIndex;
            let fetchDirection: 'PREVIOUS' | 'NEXT' | null = null;

            if (direction === 'PREVIOUS') {
                  if (isNewerFirst) targetIndex++; // moving right gets older
                  else targetIndex--; // moving left gets older
                  fetchDirection = 'PREVIOUS'; // when fetching, we want OLDER
            } else if (direction === 'NEXT') {
                  if (isNewerFirst) targetIndex--; // moving left gets newer
                  else targetIndex++; // moving right gets newer
                  fetchDirection = 'NEXT'; // when fetching, we want NEWER
            }

            // Check if targetIndex is within bounds
            if (targetIndex >= 0 && targetIndex < this.navigationCache.length) {
                  this.navCurrentIndex = targetIndex;
                  console.log(`[Navigation] Moved in cache to index: ${this.navCurrentIndex}`);
                  this.setReceiptAsCurrent(this.navigationCache[this.navCurrentIndex]);
            } else {
                  // Target out of bounds, check if we can fetch more
                  const canFetch = direction === 'PREVIOUS' ? this.navHasPrevious : this.navHasNext;
                  if (canFetch && fetchDirection) {
                        const edgeId = this.navigationCache[this.navCurrentIndex].id;
                        console.log(`[Navigation] Reached edge of cache. Fetching ${fetchDirection} chunk based on ID: ${edgeId}`);
                        this.fetchNavigationChunk(edgeId, fetchDirection);
                  } else {
                        console.log(`[Navigation] Reached absolute limit. No more ${direction} receipts.`);
                        if (direction === 'NEXT') {
                              console.log('[Navigation] Reached newest receipt. Clearing cart for a new blank receipt.');
                              this.clearCart();
                        }
                  }
            }
      }

      private fetchNavigationChunk(receiptId: number, direction: 'PREVIOUS' | 'NEXT'): void {
            this.setLoading(true);
            const backendDirection = direction === 'PREVIOUS' ? 'NEXT' : 'PREVIOUS';
            console.log(`[Navigation] Fetching chunk for ID: ${receiptId} with frontend direction ${direction} (backend ${backendDirection})`);

            this.api.getReceiptNavigation(receiptId, backendDirection, 10).subscribe({
                  next: (res) => {
                        this.navigationCache = res.receipts || [];
                        this.navCurrentIndex = res.currentIndex ?? -1;
                        this.navHasPrevious = res.hasNext ?? false; // OLDER
                        this.navHasNext = res.hasPrevious ?? false; // NEWER

                        if (this.navigationCache.length > 0 && this.navCurrentIndex >= 0 && this.navCurrentIndex < this.navigationCache.length) {
                              let isNewerFirst = true;
                              if (this.navigationCache.length >= 2) {
                                    isNewerFirst = this.navigationCache[0].id > this.navigationCache[this.navigationCache.length - 1].id;
                              }

                              if (direction === 'PREVIOUS') {
                                    if (isNewerFirst && this.navCurrentIndex < this.navigationCache.length - 1) this.navCurrentIndex++;
                                    else if (!isNewerFirst && this.navCurrentIndex > 0) this.navCurrentIndex--;
                              } else if (direction === 'NEXT') {
                                    if (isNewerFirst && this.navCurrentIndex > 0) this.navCurrentIndex--;
                                    else if (!isNewerFirst && this.navCurrentIndex < this.navigationCache.length - 1) this.navCurrentIndex++;
                              }

                              this.setReceiptAsCurrent(this.navigationCache[this.navCurrentIndex]);
                        }
                        this.clearError();
                  },
                  error: (err) => {
                        console.warn('[Navigation] Fetch chunk API failed:', err);
                        this.handleError(err);
                  },
                  complete: () => this.setLoading(false)
            });
      }

      public createReceipt(payload: CreateReceiptInput): Observable<ReceiptResponse> {
            this.setLoading(true);
            return this.api.createReceipt(payload).pipe(
                  tap((receipt) => {
                        this.updateProductsCacheFromReceipt(receipt);
                        this.currentSavedReceiptSignal.set(receipt);
                        this.clearCart();
                        this.clearError();
                  }),
                  catchError((err) => {
                        this.handleError(err);
                        return EMPTY;
                  }),
                  finalize(() => this.setLoading(false))
            );
      }

      public updateReceipt(id: number, payload: UpdateReceiptInput): Observable<ReceiptResponse> {
            this.setLoading(true);
            return this.api.updateReceipt(id, payload).pipe(
                  tap((receipt) => {
                        this.updateProductsCacheFromReceipt(receipt);
                        this.setReceiptAsCurrent(receipt);
                        this.clearError();
                  }),
                  catchError((err) => {
                        this.handleError(err);
                        return EMPTY;
                  }),
                  finalize(() => this.setLoading(false))
            );
      }

      public deleteReceipt(id: number): Observable<DeleteReceiptResponse> {
            const receiptToDelete = this._receiptsList.value.find(r => r.id === id) 
                  || this.navigationCache.find(r => r.id === id)
                  || (this.currentSavedReceiptSignal()?.id === id ? this.currentSavedReceiptSignal() : null);

            this.setLoading(true);
            return this.api.deleteReceipt(id).pipe(
                  tap(() => {
                        this.removeReceiptFromLocalState(id);
                        if (receiptToDelete) {
                              this.restoreStockForDeletedReceipt(receiptToDelete);
                        }
                  }),
                  tap(() => this.showReceiptAfterDelete(id)),
                  catchError((err) => {
                        this.handleError(err);
                        return throwError(() => err);
                  }),
                  finalize(() => this.setLoading(false))
            );
      }

      public printReceipt(id: number): Observable<void> {
            this.setLoading(true);
            return this.api.printReceipt(id).pipe(
                  catchError((err) => {
                        this.handleError(err);
                        return throwError(() => err);
                  }),
                  finalize(() => this.setLoading(false))
            );
      }

      private updateProductsCacheFromReceipt(receipt: ReceiptResponse): void {
            if (!receipt.items || receipt.items.length === 0) return;
            const itemsToUpdate = receipt.items
                  .filter(item => item.productCode && item.remainingStock !== undefined)
                  .map(item => ({
                        barcode: item.productCode,
                        remainingStock: item.remainingStock
                  }));
            this.catalogStore.updateStockBatchByBarcode(itemsToUpdate);
      }

      private restoreStockForDeletedReceipt(receipt: ReceiptResponse): void {
            if (!receipt.items || receipt.items.length === 0) return;
            const itemsToRestore = receipt.items
                  .filter(item => item.productCode && item.quantity)
                  .map(item => ({
                        barcode: item.productCode,
                        quantity: item.quantity
                  }));
            this.catalogStore.restoreStockBatchByBarcode(itemsToRestore);
      }

      private removeReceiptFromLocalState(deletedId: number): void {
            this.clearError();
            this._receiptsList.next(this._receiptsList.value.filter(r => r.id !== deletedId));
            this._filteredReceipts.next(this._filteredReceipts.value.filter(r => r.id !== deletedId));

            const deletedIndex = this.navigationCache.findIndex(r => r.id === deletedId);
            if (deletedIndex >= 0) {
                  this.navigationCache.splice(deletedIndex, 1);
                  if (this.navigationCache.length > 0) {
                        this.navCurrentIndex = deletedIndex < this.navigationCache.length
                              ? deletedIndex
                              : this.navigationCache.length - 1;
                  } else {
                        this.navCurrentIndex = -1;
                  }
            }
      }

      private showReceiptAfterDelete(deletedId: number): void {
            if (this.currentSavedReceiptSignal()?.id === deletedId) {
                  if (this.navigationCache.length > 0 && this.navCurrentIndex >= 0) {
                        this.setReceiptAsCurrent(this.navigationCache[this.navCurrentIndex]);
                  } else {
                        this.resetWorkspaceAfterDelete();
                  }
            } else {
                  this.refreshCurrentReceiptDisplay();
            }
      }

      private resetWorkspaceAfterDelete(): void {
            this.setReceiptMode('NEW');
            this.draftItemsSignal.set([]);
            this.currentSavedReceiptSignal.set(null);
            this.navigationCache = [];
            this.navCurrentIndex = -1;
            this.navHasPrevious = false;
            this.navHasNext = false;
      }

      // --------- Cart Logic Methods ---------

      public addCartItem(product: Product, quantity: number = 1) {
            const items = [...this.draftItemsSignal()];
            const existingIdx = items.findIndex(i => i.productId === product.id);
            const mode = this.receiptModeSignal();

            if (existingIdx > -1) {
                  items[existingIdx] = { ...items[existingIdx] };
                  items[existingIdx].sellingPrice = product.sellingPrice;
                  items[existingIdx].buyingPrice = product.buyingPrice;
                  items[existingIdx].product = product; // Keep product reference current (critical after a refill)
                  items[existingIdx].quantity += quantity;
                  items[existingIdx].total = items[existingIdx].quantity * items[existingIdx].sellingPrice;
                  if (mode === 'EDIT' && items[existingIdx].originalQuantity != null && items[existingIdx].currentRemainingStock != null) {
                        items[existingIdx].remainingStock = items[existingIdx].currentRemainingStock! + items[existingIdx].originalQuantity! - items[existingIdx].quantity;
                  } else {
                        items[existingIdx].remainingStock = product.stockQuantity - items[existingIdx].quantity;
                  }
                  items[existingIdx].stockError = validateCartItemStock(items[existingIdx], mode) ?? undefined;
            } else {
                  const newItem: CartItem = {
                        productId: product.id,
                        productName: product.name,
                        quantity,
                        sellingPrice: product.sellingPrice,
                        buyingPrice: product.buyingPrice,
                        discount: 0,
                        total: product.sellingPrice * quantity,
                        remainingStock: product.stockQuantity - quantity,
                        product
                  };
                  newItem.stockError = validateCartItemStock(newItem, mode) ?? undefined;
                  items.push(newItem);
            }
            this.draftItemsSignal.set(items);
      }

      public removeDraftItem(productId: number) {
            this.draftItemsSignal.update(items => items.filter(i => i.productId !== productId));
      }

      public clearCart() {
            this.setReceiptMode('NEW');
            this.draftItemsSignal.set([]);
            this.currentSavedReceiptSignal.set(null);
            this.navigationCache = [];
            this.navCurrentIndex = -1;
            this.navHasPrevious = false;
            this.navHasNext = false;
      }

      public updateItemQuantity(productId: number, delta: number) {
            const items = [...this.draftItemsSignal()];
            const existingIdx = items.findIndex(i => i.productId === productId);
            const mode = this.receiptModeSignal();

            if (existingIdx > -1) {
                  const newQty = items[existingIdx].quantity + delta;
                  if (newQty > 0) {
                        items[existingIdx] = { ...items[existingIdx] };
                        items[existingIdx].quantity = newQty;
                        items[existingIdx].total = items[existingIdx].quantity * items[existingIdx].sellingPrice;
                        if (mode === 'EDIT' && items[existingIdx].originalQuantity != null && items[existingIdx].currentRemainingStock != null) {
                              items[existingIdx].remainingStock = items[existingIdx].currentRemainingStock! + items[existingIdx].originalQuantity! - newQty;
                        } else {
                              items[existingIdx].remainingStock = items[existingIdx].product.stockQuantity - newQty;
                        }
                        items[existingIdx].stockError = validateCartItemStock(items[existingIdx], mode) ?? undefined;
                  } else {
                        items.splice(existingIdx, 1);
                  }
                  this.draftItemsSignal.set(items);
            }
      }

      public updateCartItemField(productId: number, field: 'sellingPrice' | 'quantity' | 'total', newValue: number) {
            const items = [...this.draftItemsSignal()];
            const existingIdx = items.findIndex(i => i.productId === productId);
            const mode = this.receiptModeSignal();

            if (existingIdx > -1) {
                  const item = { ...items[existingIdx] };

                  if (field === 'sellingPrice') {
                        item.sellingPrice = newValue;
                        item.total = Number((item.quantity * item.sellingPrice).toFixed(3));
                  } else if (field === 'quantity') {
                        item.quantity = newValue;
                        item.total = Number((item.quantity * item.sellingPrice).toFixed(3));
                  } else if (field === 'total') {
                        item.total = newValue;
                        if (item.sellingPrice && item.sellingPrice > 0) {
                              item.quantity = Number((item.total / item.sellingPrice).toFixed(3));
                        }
                  }

                  if (item.quantity <= 0) {
                        items.splice(existingIdx, 1);
                  } else {
                        if (mode === 'EDIT' && item.originalQuantity != null && item.currentRemainingStock != null) {
                              item.remainingStock = item.currentRemainingStock + item.originalQuantity - item.quantity;
                        } else {
                              item.remainingStock = item.product.stockQuantity - item.quantity;
                        }
                        item.stockError = validateCartItemStock(item, mode) ?? undefined;
                        items[existingIdx] = item;
                  }
                  this.draftItemsSignal.set(items);
            }
      }

      private syncProductInCartItems(updatedProduct: Product): void {
            const items = [...this.draftItemsSignal()];
            let didUpdate = false;

            const updatedItems = items.map(item => {
                  if (item.productId === updatedProduct.id || item.product?.barcode === updatedProduct.barcode) {
                        didUpdate = true;
                        const newItem = { ...item };
                        newItem.product = { ...newItem.product, ...updatedProduct };
                        newItem.sellingPrice = updatedProduct.sellingPrice;
                        newItem.buyingPrice = updatedProduct.buyingPrice;
                        newItem.total = Number((newItem.quantity * updatedProduct.sellingPrice).toFixed(3));
                        if (newItem.originalQuantity != null && newItem.currentRemainingStock != null && this.receiptModeSignal() === 'EDIT') {
                              newItem.remainingStock = newItem.currentRemainingStock + newItem.originalQuantity - newItem.quantity;
                        } else {
                              newItem.remainingStock = updatedProduct.stockQuantity - newItem.quantity;
                        }
                        newItem.stockError = validateCartItemStock(newItem, this.receiptModeSignal()) ?? undefined;
                        return newItem;
                  }
                  return item;
            });

            if (didUpdate) {
                  this.draftItemsSignal.set(updatedItems);
            }
      }

      private syncProductInNavigationCache(updatedProduct: Product): void {
            if (this.navigationCache.length === 0) return;

            this.navigationCache = this.navigationCache.map(receipt => ({
                  ...receipt,
                  items: receipt.items.map(item => {
                        if (item.productCode === updatedProduct.barcode) {
                              return {
                                    ...item,
                                    sellingPrice: updatedProduct.sellingPrice,
                                    buyingPrice: updatedProduct.buyingPrice,
                                    remainingStock: Math.min(item.remainingStock, updatedProduct.stockQuantity),
                                    currentRemainingStock: updatedProduct.stockQuantity
                              };
                        }
                        return item;
                  })
            }));
      }

      public updateDraftReceiptData(partial: Partial<ReceiptResponse>) {
            const current = this.currentSavedReceiptSignal() || {} as ReceiptResponse;
            this.currentSavedReceiptSignal.set({ ...current, ...partial });
      }

      private syncProductInCurrentReceipt(updatedProduct: Product): void {
            const current = this.currentSavedReceiptSignal();
            if (!current?.id) return;

            const updatedItems = current.items.map(item => {
                  if (item.productCode === updatedProduct.barcode) {
                        return {
                              ...item,
                              sellingPrice: updatedProduct.sellingPrice,
                              buyingPrice: updatedProduct.buyingPrice,
                              totalPrice: Number((item.quantity * updatedProduct.sellingPrice).toFixed(3)),
                              currentRemainingStock: updatedProduct.stockQuantity
                        };
                  }
                  return item;
            });

            this.currentSavedReceiptSignal.set({ ...current, items: updatedItems });
      }

      private syncUpdatedProductAcrossState(updatedProduct: Product): void {
            this.syncProductInCartItems(updatedProduct);
            this.syncProductInCurrentReceipt(updatedProduct);
            this.syncProductInNavigationCache(updatedProduct);
      }

      public getProductByBarcodeAsync(barcode: string): Promise<Product> {
            return firstValueFrom(this.api.getProductByBarcode(barcode).pipe(
                  map(product => {
                        if (product.stock !== undefined) {
                              product.stockQuantity = product.stock;
                        }
                        return product;
                  })
            ));
      }
      
      public validateRefill(payload: import('../../core/models/pos.models').RefillValidateRequest) {
            return firstValueFrom(this.api.validateRefill(payload));
      }
      
      public executeRefill(payload: import('../../core/models/pos.models').RefillExecuteRequest): Promise<Product> {
            return firstValueFrom(this.api.executeRefill(payload).pipe(
                  map(response => {
                        const updatedProduct = this.normalizeRefillExecuteResponse(response, payload);

                        this.catalogStore.applyRefillUpdate(
                              updatedProduct,
                              payload.parentProductId,
                              payload.parentUnitsUsed
                        );
                        this.syncUpdatedProductAcrossState(updatedProduct);

                        return updatedProduct;
                  })
            ));
      }

      private normalizeRefillExecuteResponse(
            response: import('../../core/models/pos.models').RefillExecuteResponse,
            payload: import('../../core/models/pos.models').RefillExecuteRequest
      ): Product {
            const childProduct = response.childProduct ?? response;
            const barcode = childProduct.barcode || response.childBarcode || payload.childBarcode;
            const currentProduct = this.catalogStore.findByBarcode(barcode);

            const normalized: Product = {
                  id: childProduct.id ?? currentProduct?.id ?? 0,
                  name: childProduct.name || currentProduct?.name || '',
                  barcode,
                  costPrice: childProduct.costPrice ?? currentProduct?.costPrice ?? 0,
                  sellingPrice: childProduct.sellingPrice ?? this.pricingFallbackSellingPrice(response, payload),
                  buyingPrice: childProduct.buyingPrice ?? this.pricingFallbackBuyingPrice(response, payload),
                  stockQuantity: childProduct.stockQuantity ?? childProduct.stock ?? currentProduct?.stockQuantity ?? 0,
                  stock: childProduct.stock ?? childProduct.stockQuantity,
                  refillOptions: childProduct.refillOptions ?? currentProduct?.refillOptions,
                  isActive: childProduct.isActive ?? currentProduct?.isActive ?? true,
                  createdAt: childProduct.createdAt ?? currentProduct?.createdAt ?? '',
                  updatedAt: childProduct.updatedAt ?? currentProduct?.updatedAt ?? ''
            };

            return normalized;
      }

      private pricingFallbackSellingPrice(
            response: import('../../core/models/pos.models').RefillExecuteResponse,
            payload: import('../../core/models/pos.models').RefillExecuteRequest
      ): number {
            if (response.sellingPrice != null) return response.sellingPrice;
            return payload.expectedProposedSellingPrice;
      }

      private pricingFallbackBuyingPrice(
            response: import('../../core/models/pos.models').RefillExecuteResponse,
            payload: import('../../core/models/pos.models').RefillExecuteRequest
      ): number {
            if (response.buyingPrice != null) return response.buyingPrice;
            return payload.expectedNewBuyingPrice;
      }


      // --------- Internal Helper Methods ---------

      private setLoading(isLoading: boolean) {
            this._loading.next(isLoading);
      }

      private handleError(err: any) {
            let errorMsg = 'حدث خطأ أثناء معالجة الطلب';
            if (err.error && err.error.message) {
                  errorMsg = err.error.message;
            } else if (err.message) {
                  errorMsg = err.message;
            }
            this._error.next(errorMsg);
            console.error('Backend Error:', err);
      }

      public clearError() {
            this._error.next(null);
      }
}

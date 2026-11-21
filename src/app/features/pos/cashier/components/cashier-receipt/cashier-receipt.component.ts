import {
  Component, Input, Output, EventEmitter, ChangeDetectionStrategy,
  ViewChild, ViewChildren, QueryList, ElementRef, OnInit, OnDestroy, inject, ChangeDetectorRef, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReceiptResponse, Product, CartItem, ReceiptMode, PaymentMethod } from '../../../core/models/pos.models';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { ProductSearchPopupComponent } from '../../../../../shared/components/product-search-popup/product-search-popup.component';
import { ProductSearchService } from '../../../../../shared/services/product-search.service';
import { NotificationService } from '../../../../../shared/services/notification.service';

export type ReceiptTableNavCol = 'name' | 'sellingPrice' | 'quantity' | 'total';
const RECEIPT_TABLE_NAV_COLS: ReceiptTableNavCol[] = ['name', 'sellingPrice', 'quantity', 'total'];

@Component({
      selector: 'app-cashier-receipt',
      standalone: true,
      imports: [CommonModule, ReactiveFormsModule, ProductSearchPopupComponent],
      templateUrl: './cashier-receipt.component.html',
      styles: [`:host { display: contents; }`],
      changeDetection: ChangeDetectionStrategy.OnPush
})
export class CashierReceiptComponent implements OnInit, OnDestroy {
      private fb = inject(FormBuilder);
      private cdr = inject(ChangeDetectorRef);
      private productSearch = inject(ProductSearchService);
      private notifications = inject(NotificationService);
      private elementRef = inject(ElementRef);
      private destroy$ = new Subject<void>();

      @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
      @ViewChildren('rowQtyInput') rowQtyInputs!: QueryList<ElementRef<HTMLInputElement>>;

      @Input() items: CartItem[] = [];
      @Input() receipt: ReceiptResponse | null = null;
      @Input() receiptMode: ReceiptMode = 'NEW';
      @Input() finalTotal: number = 0;
      @Input() totalQuantity: number = 0;
      @Input() distinctItemsCount: number = 0;
      @Input() products: Product[] = [];

      @Output() previousReceipt = new EventEmitter<void>();
      @Output() nextReceipt = new EventEmitter<void>();
      @Output() removeItem = new EventEmitter<number>();
      @Output() viewItem = new EventEmitter<any>();
      @Output() updateQuantity = new EventEmitter<{ item: CartItem, delta: number }>();
      @Output() addItem = new EventEmitter<{ product: Product, quantity: number }>();
      @Output() updatePaymentMethod = new EventEmitter<PaymentMethod>();
      @Output() updateCustomerName = new EventEmitter<string>();
      @Output() updateCustomerPhone = new EventEmitter<string>();

      @Output() closePaymentScreen = new EventEmitter<void>();
      @Output() confirmPayment = new EventEmitter<void>();
      @Output() openPaymentScreen = new EventEmitter<void>();
      
      @ViewChild('paidInput') paidInput?: ElementRef<HTMLInputElement>;
      
      private _showPaymentScreen = false;
      @Input() set showPaymentScreen(value: boolean) {
            this._showPaymentScreen = value;
            if (value) {
                  this.paidAmount = 0;
                  setTimeout(() => {
                        if (this.paidInput) {
                              this.paidInput.nativeElement.focus();
                              this.paidInput.nativeElement.select();
                        }
                  }, 50);
            }
      }
      get showPaymentScreen(): boolean {
            return this._showPaymentScreen;
      }

      paidAmount: number = 0;

      get changeAmount(): number {
            return Math.max(0, this.paidAmount - this.finalTotal);
      }

      onPaidAmountChange(event: Event) {
            const val = (event.target as HTMLInputElement).value;
            this.paidAmount = parseFloat(val) || 0;
      }

      onPaymentInputEnter(event: Event) {
            this.onPaidAmountChange(event);
            this.confirmPayment.emit();
      }

      async copyProductBarcode(barcode: string | null | undefined): Promise<void> {
            if (!barcode) {
                  this.notifications.warning('لا يوجد باركود لهذا الصنف');
                  return;
            }

            try {
                  await navigator.clipboard.writeText(barcode);
                  this.notifications.success('تم نسخ باركود الصنف');
            } catch {
                  this.notifications.error('تعذر نسخ باركود الصنف');
            }
      }

      inputForm!: FormGroup;
      popupOpen = false;
      popupInitialQuery = '';
      searchTerm = '';
      barcodeNotFound = signal<string | null>(null);
      private quantityInputModified = false;
      private lastAddedProductId: number | null = null;
      private isSelectingFromPopup = false;

      get today() { return new Date(); }
      get searchTriggerEl(): HTMLElement | undefined {
            return this.searchInput?.nativeElement;
      }

      ngOnInit() {
            this.inputForm = this.fb.group({
                  barcode: ['', Validators.required],
                  quantity: [1, [Validators.required, Validators.min(1)]],
                  sellingPrice: [{ value: 0, disabled: true }]
            });

            this.inputForm.get('barcode')?.valueChanges.pipe(
                  takeUntil(this.destroy$),
                  debounceTime(80)
            ).subscribe(value => {
                  this.searchTerm = typeof value === 'string' ? value.trim() : '';
                  if (this.barcodeNotFound() && this.searchTerm !== this.barcodeNotFound()) {
                        this.clearNotFoundAlert();
                  }
                  if (!this.searchTerm) {
                        this.popupOpen = false;
                  }
                  this.cdr.markForCheck();
            });
      }

      clearNotFoundAlert(): void {
            if (this.barcodeNotFound()) {
                  this.barcodeNotFound.set(null);
                  this.cdr.markForCheck();
            }
      }

      ngOnDestroy() {
            this.destroy$.next();
            this.destroy$.complete();
      }

      incrementQty() {
            const qty = this.inputForm.get('quantity')?.value || 1;
            this.inputForm.get('quantity')?.setValue(qty + 1);
      }

      decrementQty() {
            const qty = this.inputForm.get('quantity')?.value || 1;
            if (qty > 1) {
                  this.inputForm.get('quantity')?.setValue(qty - 1);
            }
      }

      onPaymentMethodChange(event: Event) {
            this.updatePaymentMethod.emit((event.target as HTMLSelectElement).value as PaymentMethod);
      }

      onCustomerNameChange(event: Event) {
            this.updateCustomerName.emit((event.target as HTMLInputElement).value);
      }

      onCustomerPhoneChange(event: Event) {
            this.updateCustomerPhone.emit((event.target as HTMLInputElement).value);
      }

      private isBarcodeValue(value: string, currentItem: CartItem): boolean {
            const trimmed = (value || '').trim();
            if (!trimmed) return false;

            // When the value matches the current item quantity, it is quantity confirmation, not a barcode scan
            if (trimmed === String(currentItem.quantity)) {
                  return false;
            }

            // 1. If it matches the current item's barcode exactly, it is definitely a repeated scan
            if (currentItem.product?.barcode && trimmed.toLowerCase() === currentItem.product.barcode.toLowerCase()) {
                  return true;
            }

            // 2. If it contains non-numeric characters (alphanumeric barcodes)
            if (!/^\d+(\.\d+)?$/.test(trimmed)) {
                  return true;
            }

            // 3. If it exceeds reasonable quantity digits (integer part > 4 digits or value > 9999)
            const num = parseFloat(trimmed);
            const integerPart = trimmed.split('.')[0];
            if (integerPart.length > 4 || (!isNaN(num) && num > 9999)) {
                  return true;
            }

            // 4. If it exactly matches any other product's barcode in the catalog (length >= 3)
            if (trimmed.length >= 3) {
                  const exactMatch = this.productSearch.findExactByCode(this.products, trimmed);
                  if (exactMatch) {
                        return true;
                  }
            }

            return false;
      }

      processBarcode(rawCode: string): void {
            const term = (rawCode || '').trim();
            if (!term) return;

            const exact = this.productSearch.findExactByCode(this.products, term);
            if (exact) {
                  this.clearNotFoundAlert();
                  this.onSelectProduct(exact);
                  return;
            }

            const matches = this.productSearch.filterProducts(this.products, { query: term });
            if (matches.length === 1) {
                  this.clearNotFoundAlert();
                  this.onSelectProduct(matches[0]);
                  return;
            }

            if (matches.length > 1) {
                  this.clearNotFoundAlert();
                  this.openProductPopup(term);
                  return;
            }

            // If no match found, place the code in the search input and focus it, and show not found alert
            this.barcodeNotFound.set(term);
            this.inputForm.patchValue({ barcode: term });
            this.focusBarcodeScanner();
            this.cdr.markForCheck();
      }

      submitInputRow() {
            const term = (this.inputForm.get('barcode')?.value || '').trim();
            if (!term) {
                  this.clearNotFoundAlert();
                  this.openProductPopup('');
                  return;
            }
            this.processBarcode(term);
      }

      onSearchClicked(): void {
            const term = (this.inputForm.get('barcode')?.value || '').trim();
            if (!term) {
                  return;
            }
            this.processBarcode(term);
      }

      onSearchDoubleClick(event: MouseEvent): void {
            event.preventDefault();
            const term = (this.inputForm.get('barcode')?.value || '').trim();
            this.openProductPopup(term);
      }

      onSearchKeyDown(event: KeyboardEvent) {
            if (this.popupOpen) return;

            if (event.key === 'ArrowUp' && this.items.length > 0) {
                  event.preventDefault();
                  this.focusTableCell(this.items.length - 1, 'quantity');
                  return;
            }

            if (event.key === 'Escape' && this.barcodeNotFound()) {
                  this.clearNotFoundAlert();
                  return;
            }

            if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  this.submitInputRow();
            }
      }

      onPopupProductSelected(product: Product): void {
            this.clearNotFoundAlert();
            this.isSelectingFromPopup = true;
            this.onSelectProduct(product);
      }

      onPopupClosed(): void {
            this.popupOpen = false;
            this.cdr.markForCheck();
            if (this.isSelectingFromPopup) {
                  this.isSelectingFromPopup = false;
                  return;
            }
            setTimeout(() => this.searchInput?.nativeElement?.focus());
      }

      onSelectProduct(product: Product) {
            this.clearNotFoundAlert();
            const quantity = this.inputForm.get('quantity')?.value || 1;
            this.lastAddedProductId = product.id;
            this.addItem.emit({ product, quantity });
            this.inputForm.patchValue({ barcode: '', quantity: 1, sellingPrice: 0 });
            this.popupOpen = false;
            this.cdr.markForCheck();

            this.focusProductAmount(product.id);
      }

      @Output() updateItemField = new EventEmitter<{ item: CartItem, field: 'sellingPrice' | 'quantity' | 'total', value: number }>();

      onFieldFocus(event: FocusEvent): void {
            const input = event.target as HTMLInputElement;
            if (input && typeof input.select === 'function') {
                  input.select();
            }
      }

      onQuantityInput(): void {
            this.quantityInputModified = true;
      }

      onQuantityFocus(event: FocusEvent): void {
            this.quantityInputModified = false;
            const input = event.target as HTMLInputElement;
            input.select();
      }

      onQuantityKeyDown(item: CartItem, event: KeyboardEvent, rowIndex: number = 0): void {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                  this.onTableKeyDown(event, rowIndex, 'quantity');
                  return;
            }

            if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  const input = event.target as HTMLInputElement;
                  const rawVal = input.value.trim();

                  // If the user did not modify the field or value equals current quantity, confirm quantity and return to barcode input
                  if (!this.quantityInputModified || rawVal === String(item.quantity)) {
                        const qty = parseFloat(rawVal);
                        if (!isNaN(qty) && qty > 0 && qty !== item.quantity) {
                              this.updateItemField.emit({ item, field: 'quantity', value: qty });
                        }
                        this.focusBarcodeScanner();
                        return;
                  }

                  if (this.isBarcodeValue(rawVal, item)) {
                        input.value = String(item.quantity);
                        this.processBarcode(rawVal);
                  } else {
                        const qty = parseFloat(rawVal);
                        if (!isNaN(qty) && qty > 0) {
                              this.updateItemField.emit({ item, field: 'quantity', value: qty });
                        } else {
                              input.value = String(item.quantity);
                        }
                        this.focusBarcodeScanner();
                  }
            } else if (event.key === 'Tab') {
                  const input = event.target as HTMLInputElement;
                  const rawVal = input.value.trim();
                  if (this.quantityInputModified && rawVal !== String(item.quantity) && this.isBarcodeValue(rawVal, item)) {
                        event.preventDefault();
                        input.value = String(item.quantity);
                        this.processBarcode(rawVal);
                  }
            }
      }

      focusTableCell(rowIndex: number, col: ReceiptTableNavCol): boolean {
            if (rowIndex < 0 || rowIndex >= this.items.length) {
                  return false;
            }

            const selector = `[data-row="${rowIndex}"][data-col="${col}"]`;
            const el = this.elementRef.nativeElement.querySelector(selector) as HTMLElement | null;
            if (el) {
                  el.focus();
                  if (el instanceof HTMLInputElement) {
                        el.select();
                  }
                  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                  return true;
            }
            return false;
      }

      private shouldNavigateHorizontal(input: HTMLInputElement, direction: 'left' | 'right'): boolean {
            try {
                  const { selectionStart, selectionEnd, value } = input;
                  if (selectionStart === null || selectionEnd === null) {
                        return true;
                  }

                  // When entire text is selected (e.g. freshly focused cell), navigate to adjacent cell
                  if (selectionStart === 0 && selectionEnd === value.length) {
                        return true;
                  }

                  // Partial selection active: preserve text selection
                  if (selectionStart !== selectionEnd) {
                        return false;
                  }

                  // Caret in the middle of text: preserve native cursor movement inside input
                  if (selectionStart > 0 && selectionStart < value.length) {
                        return false;
                  }

                  // Caret at boundary: navigate out to adjacent cell
                  return true;
            } catch {
                  return true;
            }
      }

      onTableKeyDown(event: KeyboardEvent, rowIndex: number, col: ReceiptTableNavCol): void {
            if (this.popupOpen || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
                  return;
            }

            const input = event.target as HTMLInputElement;
            const isInput = input instanceof HTMLInputElement;

            switch (event.key) {
                  case 'ArrowUp': {
                        event.preventDefault();
                        if (rowIndex > 0) {
                              this.focusTableCell(rowIndex - 1, col);
                        }
                        break;
                  }

                  case 'ArrowDown': {
                        event.preventDefault();
                        if (rowIndex < this.items.length - 1) {
                              this.focusTableCell(rowIndex + 1, col);
                        } else {
                              this.focusBarcodeScanner();
                        }
                        break;
                  }

                  case 'ArrowLeft': {
                        // In RTL: ArrowLeft moves visually left towards total (name -> sellingPrice -> quantity -> total)
                        if (isInput && !this.shouldNavigateHorizontal(input, 'left')) {
                              return;
                        }

                        const colIdx = RECEIPT_TABLE_NAV_COLS.indexOf(col);
                        if (colIdx >= 0 && colIdx < RECEIPT_TABLE_NAV_COLS.length - 1) {
                              event.preventDefault();
                              this.focusTableCell(rowIndex, RECEIPT_TABLE_NAV_COLS[colIdx + 1]);
                        } else if (colIdx === RECEIPT_TABLE_NAV_COLS.length - 1) {
                              if (rowIndex < this.items.length - 1) {
                                    event.preventDefault();
                                    this.focusTableCell(rowIndex + 1, RECEIPT_TABLE_NAV_COLS[0]);
                              } else {
                                    event.preventDefault();
                                    this.focusBarcodeScanner();
                              }
                        }
                        break;
                  }

                  case 'ArrowRight': {
                        // In RTL: ArrowRight moves visually right towards name (total -> quantity -> sellingPrice -> name)
                        if (isInput && !this.shouldNavigateHorizontal(input, 'right')) {
                              return;
                        }

                        const colIdx = RECEIPT_TABLE_NAV_COLS.indexOf(col);
                        if (colIdx > 0) {
                              event.preventDefault();
                              this.focusTableCell(rowIndex, RECEIPT_TABLE_NAV_COLS[colIdx - 1]);
                        } else if (colIdx === 0 && rowIndex > 0) {
                              event.preventDefault();
                              this.focusTableCell(rowIndex - 1, RECEIPT_TABLE_NAV_COLS[RECEIPT_TABLE_NAV_COLS.length - 1]);
                        }
                        break;
                  }
            }
      }

      onQuantityBlur(item: CartItem, event: FocusEvent): void {
            const input = event.target as HTMLInputElement;
            const rawVal = input.value.trim();

            if (!this.quantityInputModified || rawVal === String(item.quantity)) {
                  const qty = parseFloat(rawVal);
                  if (!isNaN(qty) && qty > 0 && qty !== item.quantity) {
                        this.updateItemField.emit({ item, field: 'quantity', value: qty });
                  } else if (isNaN(qty) || qty <= 0) {
                        input.value = String(item.quantity);
                  }
                  return;
            }

            if (this.isBarcodeValue(rawVal, item)) {
                  input.value = String(item.quantity);
                  this.processBarcode(rawVal);
            } else {
                  const qty = parseFloat(rawVal);
                  if (!isNaN(qty) && qty > 0) {
                        if (qty !== item.quantity) {
                              this.updateItemField.emit({ item, field: 'quantity', value: qty });
                        }
                  } else {
                        input.value = String(item.quantity);
                  }
            }
      }

      onInlineFieldChange(item: CartItem, field: 'sellingPrice' | 'quantity' | 'total', event: Event) {
            const input = event.target as HTMLInputElement;
            let newValue = parseFloat(input.value);

            if (!isNaN(newValue) && newValue >= 0) {
                  if (field === 'quantity' && newValue <= 0) {
                        input.value = String(item.quantity);
                        return;
                  }
                  
                  // Prevent division by zero if editing total
                  if (field === 'total' && (item.sellingPrice === 0 || !item.sellingPrice)) {
                        input.value = String(item.total);
                        return;
                  }

                  this.updateItemField.emit({ item, field, value: newValue });
            } else {
                  input.value = String(item[field]);
            }
      }

      onInlineFieldEnter(item: CartItem, field: 'sellingPrice' | 'quantity' | 'total', event: Event) {
            this.onInlineFieldChange(item, field, event);
            this.focusBarcodeScanner();
      }

      focusBarcodeScanner() {
            setTimeout(() => this.searchInput?.nativeElement?.focus());
      }

      trackByProductId(index: number, item: CartItem): number {
            return item.productId;
      }

      private evaluateSearchInput(term: string): void {
            if (!term) {
                  this.popupOpen = false;
                  this.cdr.markForCheck();
                  return;
            }

            if (this.productSearch.findExactByCode(this.products, term)) {
                  this.popupOpen = false;
                  this.cdr.markForCheck();
                  return;
            }

            // When typing manually, do not open popup until search is explicitly triggered.
            this.popupOpen = false;
            this.cdr.markForCheck();
      }

      private openProductPopup(query: string): void {
            this.popupInitialQuery = query;
            this.popupOpen = true;
            this.cdr.markForCheck();
      }

      private focusProductAmount(productId: number, attempt: number = 0): void {
            this.cdr.detectChanges();

            const findAndFocus = () => {
                  if (!this.rowQtyInputs) return false;
                  const inputs = this.rowQtyInputs.toArray();
                  const targetInput = inputs.find(
                        input => input.nativeElement.getAttribute('data-product-id') === String(productId)
                  );
                  if (targetInput) {
                        targetInput.nativeElement.focus();
                        targetInput.nativeElement.select();
                        return true;
                  }
                  return false;
            };

            if (findAndFocus()) {
                  return;
            }

            if (attempt < 6) {
                  setTimeout(() => {
                        this.focusProductAmount(productId, attempt + 1);
                  }, 30 * (attempt + 1));
            }
      }
}

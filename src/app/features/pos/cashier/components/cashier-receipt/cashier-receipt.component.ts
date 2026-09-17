import {
  Component, Input, Output, EventEmitter, ChangeDetectionStrategy,
  ViewChild, ViewChildren, QueryList, ElementRef, OnInit, OnDestroy, inject, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReceiptResponse, Product, CartItem, ReceiptMode, PaymentMethod } from '../../../core/models/pos.models';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { ProductSearchPopupComponent } from '../../../../../shared/components/product-search-popup/product-search-popup.component';
import { ProductSearchService } from '../../../../../shared/services/product-search.service';

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

      inputForm!: FormGroup;
      popupOpen = false;
      popupInitialQuery = '';
      searchTerm = '';
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
                  if (!this.searchTerm) {
                        this.popupOpen = false;
                  }
                  this.cdr.markForCheck();
            });
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
                  this.onSelectProduct(exact);
                  return;
            }

            const matches = this.productSearch.filterProducts(this.products, { query: term });
            if (matches.length === 1) {
                  this.onSelectProduct(matches[0]);
                  return;
            }

            if (matches.length > 1) {
                  this.openProductPopup(term);
                  return;
            }

            // If no match found, place the code in the search input and focus it
            this.inputForm.patchValue({ barcode: term });
            this.focusBarcodeScanner();
      }

      submitInputRow() {
            const term = (this.inputForm.get('barcode')?.value || '').trim();
            if (!term) return;
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

            if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  this.submitInputRow();
            }
      }

      onPopupProductSelected(product: Product): void {
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
            const quantity = this.inputForm.get('quantity')?.value || 1;
            this.lastAddedProductId = product.id;
            this.addItem.emit({ product, quantity });
            this.inputForm.patchValue({ barcode: '', quantity: 1, sellingPrice: 0 });
            this.popupOpen = false;
            this.cdr.markForCheck();

            this.focusProductAmount(product.id);
      }

      @Output() updateItemField = new EventEmitter<{ item: CartItem, field: 'sellingPrice' | 'quantity' | 'total', value: number }>();

      onQuantityFocus(event: FocusEvent): void {
            const input = event.target as HTMLInputElement;
            input.select();
      }

      onQuantityKeyDown(item: CartItem, event: KeyboardEvent): void {
            if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  const input = event.target as HTMLInputElement;
                  const rawVal = input.value.trim();

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
                  if (this.isBarcodeValue(rawVal, item)) {
                        event.preventDefault();
                        input.value = String(item.quantity);
                        this.processBarcode(rawVal);
                  }
            }
      }

      onQuantityBlur(item: CartItem, event: FocusEvent): void {
            const input = event.target as HTMLInputElement;
            const rawVal = input.value.trim();

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

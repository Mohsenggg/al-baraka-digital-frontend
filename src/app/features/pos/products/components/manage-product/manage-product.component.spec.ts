import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControlName } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { ManageProductComponent } from './manage-product.component';
import { ProductManageStateService } from '../../services/product-manage-state.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import type { ProductManagePayload } from '../../models/product.models';

describe('ManageProductComponent', () => {
      let component: ManageProductComponent;
      let fixture: ComponentFixture<ManageProductComponent>;
      let httpMock: HttpTestingController;
      let state: ProductManageStateService;

      const API = '/api';
      const PRODUCT_ID = 501;
      const GROUP_ID = 77;

      /** Editing payload as returned by `GET /api/products/:id`. */
      function productDetail(overrides: Partial<ProductManagePayload> = {}): ProductManagePayload {
            return {
                  baseName: 'شاي',
                  name: 'شاي أخضر 250 جم',
                  status: 'active',
                  attributes: [],
                  barcodes: [
                        { id: 1, barcode: '111', sellingPrice: 10, buyingPrice: 7, stock: 5, isDefault: true }
                  ],
                  categoryId: 1,
                  manufacturerId: null,
                  supplierIds: [],
                  productGroupId: GROUP_ID,
                  productGroupName: 'مجموعة الشاي',
                  isPriceUnified: true,
                  hasConversion: false,
                  conversions: [],
                  hasComposition: false,
                  composition: [],
                  ...overrides
            };
      }

      /** Group price summary as returned by `GET /api/products/tree/groups/:id/price-summary`. */
      function groupSummary(overrides: Record<string, unknown> = {}) {
            return {
                  groupId: GROUP_ID,
                  groupName: 'مجموعة الشاي',
                  isPriceUnified: true,
                  productCount: 3,
                  distinctSellingPrices: [10],
                  hasPriceDiscrepancy: false,
                  ...overrides
            };
      }

      /** Answers the four lookup calls issued by the state service. */
      function flushLookups(): void {
            httpMock.expectOne(`${API}/lookups/categories`).flush([]);
            httpMock.expectOne(`${API}/lookups/manufacturers`).flush([]);
            httpMock.expectOne(`${API}/lookups/suppliers`).flush([]);
            httpMock.expectOne(`${API}/lookups/attributes`).flush([]);
      }

      /** Answers the category hierarchy call triggered when the edited product has a category. */
      function flushCategoryNodes(categoryId: number): void {
            httpMock.expectOne(`${API}/products/tree/categories/${categoryId}/nodes`).flush({
                  categoryId,
                  brands: [],
                  directGroups: []
            });
      }

      /** Switches the component into edit mode and feeds the product detail. */
      function loadProductForEdit(detail: ProductManagePayload): void {
            state.resolveEditMode(PRODUCT_ID);
            flushLookups();
            httpMock.expectOne(`${API}/products/${PRODUCT_ID}`).flush(detail);
            if (detail.categoryId) {
                  flushCategoryNodes(Number(detail.categoryId));
            }
      }

      /** Simulates the user typing a new selling price on the default barcode. */
      function setSellingPrice(value: number): void {
            state.barcodesFormArray.at(0).patchValue({ sellingPrice: value });
      }

      /** Pending `PUT /api/products/:id` request (query params are ignored in the match). */
      function expectUpdateRequest() {
            return httpMock.expectOne(request =>
                  request.method === 'PUT' && request.url === `${API}/products/${PRODUCT_ID}`
            );
      }

      beforeEach(async () => {
            await TestBed.configureTestingModule({
                  imports: [ManageProductComponent, RouterTestingModule],
                  providers: [
                        provideHttpClient(),
                        provideHttpClientTesting()
                  ]
            }).compileComponents();

            httpMock = TestBed.inject(HttpTestingController);
            fixture = TestBed.createComponent(ManageProductComponent);
            component = fixture.componentInstance;
            state = TestBed.inject(ProductManageStateService);
            fixture.detectChanges();
            flushLookups();
      });

      afterEach(() => {
            httpMock.verify();
      });

      it('should create', () => {
            expect(component).toBeTruthy();
      });

      it('should open the bulk-update prompt when the selling price changed in a unified group', () => {
            loadProductForEdit(productDetail());
            setSellingPrice(12);

            component.onSave();

            expect(component.unifiedPricePrompt()).toEqual({ groupName: 'مجموعة الشاي', newPrice: 12 });
            expect(component.priceDiscrepancyPrompt()).toBeNull();
            httpMock.expectNone(request => request.method === 'PUT');
      });

      it('should render the prompt with its three choices', () => {
            loadProductForEdit(productDetail());
            setSellingPrice(12);

            component.onSave();
            fixture.detectChanges();

            expect(fixture.debugElement.queryAll(By.css('.price-prompt-panel')).length).toBe(1);
            const text = fixture.nativeElement.textContent as string;
            expect(text).toContain('تحديث جميع منتجات المجموعة');
            expect(text).toContain('تحديث هذا المنتج فقط');
            expect(text).toContain('إلغاء');
      });

      it('should not call the API when the bulk-update prompt is cancelled', () => {
            loadProductForEdit(productDetail());
            setSellingPrice(12);
            component.onSave();

            component.onUnifiedPriceChoice('cancel');

            expect(component.unifiedPricePrompt()).toBeNull();
            httpMock.expectNone(request => request.method === 'PUT');
      });

      it('should update only the edited product when the user declines the bulk update', () => {
            loadProductForEdit(productDetail());
            setSellingPrice(12);
            component.onSave();

            component.onUnifiedPriceChoice('single');

            expect(component.unifiedPricePrompt()).toBeNull();
            const request = expectUpdateRequest();
            expect(request.request.method).toBe('PUT');
            expect(request.request.params.get('propagateGroupSellingPrice')).toBe('false');
            request.flush(productDetail());

            expect(component.isPricePromptBusy()).toBeFalse();
      });

      it('should propagate to the whole group without a warning when all prices already match', () => {
            loadProductForEdit(productDetail());
            setSellingPrice(12);
            component.onSave();

            component.onUnifiedPriceChoice('all');

            httpMock.expectOne(`${API}/products/tree/groups/${GROUP_ID}/price-summary`).flush(groupSummary());

            expect(component.priceDiscrepancyPrompt()).toBeNull();
            const request = expectUpdateRequest();
            expect(request.request.params.get('propagateGroupSellingPrice')).toBe('true');
            request.flush(productDetail());
      });

      it('should ask for a second confirmation when the group prices differ', () => {
            const notify = TestBed.inject(NotificationService);
            const successSpy = spyOn(notify, 'success');

            loadProductForEdit(productDetail());
            setSellingPrice(12);
            component.onSave();
            component.onUnifiedPriceChoice('all');

            httpMock.expectOne(`${API}/products/tree/groups/${GROUP_ID}/price-summary`).flush(
                  groupSummary({ distinctSellingPrices: [8, 10], hasPriceDiscrepancy: true })
            );

            expect(component.priceDiscrepancyPrompt()).toEqual({
                  groupName: 'مجموعة الشاي',
                  newPrice: 12,
                  existingPrices: [8, 10]
            });
            httpMock.expectNone(request => request.method === 'PUT');

            component.onPriceDiscrepancyDecision(true);

            expect(component.priceDiscrepancyPrompt()).toBeNull();
            const request = expectUpdateRequest();
            expect(request.request.params.get('propagateGroupSellingPrice')).toBe('true');
            request.flush(productDetail());

            expect(successSpy).toHaveBeenCalled();
            const messages = successSpy.calls.allArgs().map(args => args[0] as string);
            expect(messages).toContain('تم توحيد سعر البيع لجميع منتجات المجموعة');
      });

      it('should abort the propagation when the discrepancy warning is dismissed', () => {
            loadProductForEdit(productDetail());
            setSellingPrice(12);
            component.onSave();
            component.onUnifiedPriceChoice('all');

            httpMock.expectOne(`${API}/products/tree/groups/${GROUP_ID}/price-summary`).flush(
                  groupSummary({ distinctSellingPrices: [8, 10], hasPriceDiscrepancy: true })
            );

            component.onPriceDiscrepancyDecision(false);

            expect(component.priceDiscrepancyPrompt()).toBeNull();
            httpMock.expectNone(request => request.method === 'PUT');
      });

      it('should skip the discrepancy warning for a single-product group', () => {
            loadProductForEdit(productDetail());
            setSellingPrice(12);
            component.onSave();

            component.onUnifiedPriceChoice('all');

            httpMock.expectOne(`${API}/products/tree/groups/${GROUP_ID}/price-summary`).flush(
                  groupSummary({ productCount: 1, distinctSellingPrices: [10], hasPriceDiscrepancy: false })
            );

            expect(component.priceDiscrepancyPrompt()).toBeNull();
            const request = expectUpdateRequest();
            expect(request.request.params.get('propagateGroupSellingPrice')).toBe('true');
            request.flush(productDetail());
      });

      it('should surface the summary error without saving when the check fails', () => {
            const notify = TestBed.inject(NotificationService);
            const errorSpy = spyOn(notify, 'error');

            loadProductForEdit(productDetail());
            setSellingPrice(12);
            component.onSave();

            component.onUnifiedPriceChoice('all');

            httpMock
                  .expectOne(`${API}/products/tree/groups/${GROUP_ID}/price-summary`)
                  .flush({ message: 'Group not found' }, { status: 404, statusText: 'Not Found' });

            expect(errorSpy).toHaveBeenCalledWith('Group not found');
            expect(component.isPricePromptBusy()).toBeFalse();
            httpMock.expectNone(request => request.method === 'PUT');
      });

      it('should save directly when the product is not in a unified group', () => {
            loadProductForEdit(productDetail({ isPriceUnified: false }));
            setSellingPrice(12);

            component.onSave();

            expect(component.unifiedPricePrompt()).toBeNull();
            const request = expectUpdateRequest();
            expect(request.request.params.has('propagateGroupSellingPrice')).toBeFalse();
            request.flush(productDetail());
      });

      it('should save directly when the selling price did not change', () => {
            loadProductForEdit(productDetail());

            component.onSave();

            expect(component.unifiedPricePrompt()).toBeNull();
            const request = expectUpdateRequest();
            expect(request.request.params.has('propagateGroupSellingPrice')).toBeFalse();
            request.flush(productDetail());
      });

      describe('primary tab layout', () => {
            it('should expose only the primary and composition tabs', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  const tabLabels = fixture.debugElement
                        .queryAll(By.css('.tab-btn'))
                        .map(btn => (btn.nativeElement.textContent as string).trim());

                  expect(tabLabels.length).toBe(2);
                  expect(tabLabels.some(label => label.includes('البيانات الأساسية'))).toBeTrue();
                  expect(tabLabels.some(label => label.includes('مكونات المنتج'))).toBeTrue();
                  expect(tabLabels.some(label => label.includes('التحويلات'))).toBeFalse();
            });

            it('should render the sections with their content and without descriptions', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  // Descriptions were removed from all cards
                  expect(fixture.debugElement.queryAll(By.css('.card-desc')).length).toBe(0);

                  const cards = fixture.debugElement.queryAll(By.css('.form-sections > .form-card'));

                  // Classification and name cards are header-less bodies holding their content inline
                  expect(cards[0].query(By.css('.classification-grid'))).toBeTruthy();
                  expect(cards[0].queryAll(By.css('.card-header')).length).toBe(0);
                  expect(cards[1].query(By.css('input#baseName.form-input-name'))).toBeTruthy();
                  expect(cards[1].queryAll(By.css('.card-header')).length).toBe(0);

                  // The barcodes card keeps its inline heading and its add-barcode action
                  const barcodes = fixture.debugElement.query(By.css('.form-card-barcodes'));
                  expect(barcodes.query(By.css('.card-header .section-heading .card-title'))).toBeTruthy();
                  expect(barcodes.query(By.css('.card-header-actions .btn-add-barcode'))).toBeTruthy();
            });

            it('should render the compact conversions empty state when the product has none', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  expect(fixture.debugElement.queryAll(By.css('.conversions-empty-card')).length).toBe(1);
                  expect(fixture.debugElement.queryAll(By.css('.conversions-card')).length).toBe(0);
            });

            it('should expand the conversions section when a conversion is added from the empty state', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  fixture.debugElement.query(By.css('.btn-add-conversion')).triggerEventHandler('click', null);
                  fixture.detectChanges();

                  expect(component.conversionsFormArray.length).toBe(1);
                  expect(fixture.debugElement.queryAll(By.css('.conversions-card')).length).toBe(1);
                  expect(fixture.debugElement.queryAll(By.css('.conversions-empty-card')).length).toBe(0);
            });

            it('should auto-expand the conversions section when the edited product already has conversions', () => {
                  loadProductForEdit(productDetail({
                        hasConversion: true,
                        conversions: [
                              { parentProductId: 11, parentProductName: 'كرتونة شاي', parentQuantity: 1, childQuantity: 12, isDefault: true },
                              { parentProductId: 12, parentProductName: 'علبة شاي', parentQuantity: 1, childQuantity: 3, isDefault: false }
                        ]
                  }));
                  fixture.detectChanges();

                  expect(component.conversionsFormArray.length).toBe(2);
                  expect(fixture.debugElement.queryAll(By.css('.conversions-card')).length).toBe(1);
                  expect(fixture.debugElement.queryAll(By.css('.conversions-empty-card')).length).toBe(0);
            });
      });

      describe('editable profit cell', () => {
            function profitValueInput(): HTMLInputElement {
                  return fixture.debugElement.query(By.css('.profit-input-val')).nativeElement as HTMLInputElement;
            }

            function profitPercentInput(): HTMLInputElement {
                  return fixture.debugElement.query(By.css('.profit-input-pct')).nativeElement as HTMLInputElement;
            }

            /** Simulates the user typing in one of the profit inputs (live, without leaving the field). */
            function typeProfitInput(input: HTMLInputElement, value: string): void {
                  input.dispatchEvent(new Event('focus'));
                  input.value = value;
                  input.dispatchEvent(new Event('input'));
                  fixture.detectChanges();
            }

            /** Simulates the user leaving a profit input (blur or Enter then leaving). */
            function blurProfitInput(input: HTMLInputElement): void {
                  input.dispatchEvent(new Event('blur'));
                  fixture.detectChanges();
            }

            /** Simulates the user typing a value in one of the barcode row's reactive form inputs. */
            function typeBarcodeControl(controlName: string, value: string): void {
                  const control = fixture.debugElement
                        .queryAll(By.directive(FormControlName))
                        .find(element => element.injector.get(FormControlName).name === controlName);

                  const input = control?.nativeElement as HTMLInputElement | undefined;
                  if (!input) {
                        throw new Error(`No barcode input found for form control "${controlName}"`);
                  }

                  input.value = value;
                  input.dispatchEvent(new Event('input'));
                  fixture.detectChanges();
            }

            it('should derive the profit inputs from the barcode buying and selling prices', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  expect(profitValueInput().value).toBe('3');
                  expect(profitPercentInput().value).toBe('42.86');
            });

            it('should update the selling price live from a typed profit amount', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  typeProfitInput(profitValueInput(), '5');

                  expect(state.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(12);
                  expect(profitPercentInput().value).toBe('71.43');
            });

            it('should update the selling price live from a typed profit percentage', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  typeProfitInput(profitPercentInput(), '20');

                  expect(state.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(8.4);
                  expect(profitValueInput().value).toBe('1.4');
            });

            it('should keep the typed percentage while the selling price updates live', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  const percent = profitPercentInput();
                  typeProfitInput(percent, '33.33');

                  // The selling price and the profit amount update live, the typed percentage is preserved
                  expect(state.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(9.33);
                  expect(percent.value).toBe('33.33');
                  expect(profitValueInput().value).toBe('2.33');

                  blurProfitInput(percent);

                  // Leaving the field snaps it to the percentage derived from the rounded selling price
                  expect(percent.value).toBe('33.29');
            });

            it('should refresh the profit inputs when the selling price changes', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  typeBarcodeControl('sellingPrice', '14');

                  expect(state.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(14);
                  expect(profitValueInput().value).toBe('7');
                  expect(profitPercentInput().value).toBe('100');
            });

            it('should ignore a profit percentage typed while the buying price is zero', () => {
                  loadProductForEdit(productDetail({
                        barcodes: [
                              { id: 1, barcode: '111', sellingPrice: 10, buyingPrice: 0, stock: 5, isDefault: true }
                        ]
                  }));
                  fixture.detectChanges();

                  const percent = profitPercentInput();
                  typeProfitInput(percent, '20');

                  expect(state.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(10);

                  blurProfitInput(percent);
                  expect(percent.value).toBe('0');
            });
      });

      describe('selling price live validation and anchored warning overlay', () => {
            function getWarningOverlay() {
                  return fixture.debugElement.query(By.css('.price-warning-overlay'));
            }

            function getWarningCloseBtn() {
                  return fixture.debugElement.query(By.css('.warning-close-btn'));
            }

            function getWarningAckBtn() {
                  return fixture.debugElement.query(By.css('.btn-warning-ack'));
            }

            it('should not display the warning while entering prices, but trigger on selling price blur', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(0)).toBeFalse();
                  expect(getWarningOverlay()).toBeNull();

                  // Selling price 5 < buying price 7 is entered (still entering, no blur yet)
                  setSellingPrice(5);
                  fixture.detectChanges();

                  // Should NOT show warning yet while still entering
                  expect(component.isPriceWarningOpen(0)).toBeFalse();
                  expect(getWarningOverlay()).toBeNull();

                  // User leaves the selling price input (blur)
                  component.onSellingPriceBlur(0);
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(0)).toBeTrue();
                  expect(component.hasPriceDiscrepancy(0)).toBeTrue();
                  expect(component.isPriceWarningAcknowledged(0)).toBeFalse();

                  const overlay = getWarningOverlay();
                  expect(overlay).toBeTruthy();
                  expect(overlay.nativeElement.textContent).toContain('سعر البيع أقل من سعر الشراء');
                  expect(overlay.nativeElement.textContent).toContain('5.00');
                  expect(overlay.nativeElement.textContent).toContain('7.00');
            });

            it('should automatically dismiss the warning overlay when selling price is corrected', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  setSellingPrice(5);
                  component.onSellingPriceBlur(0);
                  fixture.detectChanges();
                  expect(component.isPriceWarningOpen(0)).toBeTrue();

                  // Correct selling price to >= buying price (7)
                  setSellingPrice(8);
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(0)).toBeFalse();
                  expect(component.hasPriceDiscrepancy(0)).toBeFalse();
                  expect(getWarningOverlay()).toBeNull();
            });

            it('should close the overlay when close button is clicked without acknowledging', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  setSellingPrice(5);
                  component.onSellingPriceBlur(0);
                  fixture.detectChanges();
                  expect(component.isPriceWarningOpen(0)).toBeTrue();

                  getWarningCloseBtn().nativeElement.click();
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(0)).toBeFalse();
                  expect(component.isPriceWarningAcknowledged(0)).toBeFalse();
                  expect(getWarningOverlay()).toBeNull();
            });

            it('should acknowledge the warning and close overlay when acknowledge button is clicked', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  setSellingPrice(5);
                  component.onSellingPriceBlur(0);
                  fixture.detectChanges();
                  expect(component.isPriceWarningOpen(0)).toBeTrue();

                  getWarningAckBtn().nativeElement.click();
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(0)).toBeFalse();
                  expect(component.isPriceWarningAcknowledged(0)).toBeTrue();
                  expect(getWarningOverlay()).toBeNull();
            });

            it('should block submission and re-open the warning overlay if selling price < buying price and not acknowledged', () => {
                  loadProductForEdit(productDetail({ isPriceUnified: false }));
                  fixture.detectChanges();

                  setSellingPrice(5);
                  component.onSellingPriceBlur(0);
                  fixture.detectChanges();

                  // User closes the overlay without acknowledging
                  component.closePriceWarning(0);
                  fixture.detectChanges();
                  expect(component.isPriceWarningOpen(0)).toBeFalse();

                  // Attempt save
                  component.onSave();
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(0)).toBeTrue();
                  expect(state.saveError()).toContain('يرجى تأكيد الإقرار بأن سعر البيع أقل من سعر الشراء قبل الحفظ');
                  httpMock.expectNone(request => request.method === 'PUT');
            });

            it('should allow submission when the warning has been explicitly acknowledged', () => {
                  loadProductForEdit(productDetail({ isPriceUnified: false }));
                  fixture.detectChanges();

                  setSellingPrice(5);
                  component.onSellingPriceBlur(0);
                  fixture.detectChanges();

                  component.acknowledgePriceWarning(0);
                  fixture.detectChanges();
                  expect(component.isPriceWarningAcknowledged(0)).toBeTrue();

                  component.onSave();

                  const request = expectUpdateRequest();
                  expect(request.request.method).toBe('PUT');
                  request.flush(productDetail());
            });

            it('should reset acknowledgment and re-open warning on blur if price changes after acknowledgment', () => {
                  loadProductForEdit(productDetail({ isPriceUnified: false }));
                  fixture.detectChanges();

                  setSellingPrice(5);
                  component.onSellingPriceBlur(0);
                  fixture.detectChanges();

                  component.acknowledgePriceWarning(0);
                  expect(component.isPriceWarningAcknowledged(0)).toBeTrue();
                  expect(component.isPriceWarningOpen(0)).toBeFalse();

                  // User modifies price further down (typing)
                  setSellingPrice(4);
                  fixture.detectChanges();

                  expect(component.isPriceWarningAcknowledged(0)).toBeFalse();
                  expect(component.isPriceWarningOpen(0)).toBeFalse(); // Not shown while typing

                  // User leaves the field (blur)
                  component.onSellingPriceBlur(0);
                  fixture.detectChanges();
                  expect(component.isPriceWarningOpen(0)).toBeTrue();

                  // Save should be blocked again
                  component.onSave();
                  expect(state.saveError()).toContain('يرجى تأكيد الإقرار بأن سعر البيع أقل من سعر الشراء قبل الحفظ');
                  httpMock.expectNone(request => request.method === 'PUT');
            });

            it('should display warning overlay when selling price is driven below buying price via profit percent on blur', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  // Buying price is 7. Setting -50% profit drives selling price to 3.5
                  const percentInput = fixture.debugElement.query(By.css('.profit-input-pct')).nativeElement as HTMLInputElement;
                  percentInput.dispatchEvent(new Event('focus'));
                  percentInput.value = '-50';
                  percentInput.dispatchEvent(new Event('input'));
                  fixture.detectChanges();

                  expect(state.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(3.5);
                  expect(component.isPriceWarningOpen(0)).toBeFalse(); // Still in focus

                  percentInput.dispatchEvent(new Event('blur'));
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(0)).toBeTrue();
                  expect(getWarningOverlay()).toBeTruthy();
            });

            it('should apply price validation during product creation mode', () => {
                  // In create mode (no route ID)
                  state.resolveEditMode(null);
                  flushLookups();
                  state.barcodesFormArray.at(0).patchValue({ buyingPrice: 50, sellingPrice: 30 });
                  state.productForm.get('baseName')?.setValue('منتج جديد');
                  fixture.detectChanges();

                  // Not blurred yet, but save triggers validation
                  component.onSave();
                  expect(component.isPriceWarningOpen(0)).toBeTrue();
                  expect(state.saveError()).toContain('يرجى تأكيد الإقرار بأن سعر البيع أقل من سعر الشراء قبل الحفظ');
                  httpMock.expectNone(request => request.method === 'POST');

                  component.acknowledgePriceWarning(0);
                  component.onSave();

                  const createReq = httpMock.expectOne(`${API}/products`);
                  expect(createReq.request.method).toBe('POST');
                  createReq.flush({ id: 999, ...productDetail() });
            });

            it('should handle multiple barcode rows independently', () => {
                  loadProductForEdit(productDetail());
                  state.addBarcode();
                  // Row 0: buying 7, selling 10 (ok)
                  // Row 1: buying 20, selling 15 (warning on blur)
                  state.barcodesFormArray.at(1).patchValue({ buyingPrice: 20, sellingPrice: 15 });
                  component.onSellingPriceBlur(1);
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(0)).toBeFalse();
                  expect(component.isPriceWarningOpen(1)).toBeTrue();

                  component.acknowledgePriceWarning(1);
                  expect(component.isPriceWarningAcknowledged(1)).toBeTrue();
                  expect(component.isPriceWarningOpen(1)).toBeFalse();
            });

            it('should properly re-index warning states when a row is removed', () => {
                  loadProductForEdit(productDetail());
                  state.addBarcode();
                  state.barcodesFormArray.at(1).patchValue({ buyingPrice: 20, sellingPrice: 15 });
                  component.onSellingPriceBlur(1);
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(1)).toBeTrue();

                  // Remove row 0 -> row 1 becomes row 0
                  component.removeBarcode(0);
                  fixture.detectChanges();

                  expect(component.isPriceWarningOpen(0)).toBeTrue();
            });
      });
});

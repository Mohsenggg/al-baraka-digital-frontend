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

            /** Simulates the user committing a value in one of the profit inputs (blur or Enter). */
            function commitProfitInput(input: HTMLInputElement, value: string): void {
                  input.value = value;
                  input.dispatchEvent(new Event('change'));
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

            it('should update the selling price from a typed profit amount', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  commitProfitInput(profitValueInput(), '5');

                  expect(state.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(12);
                  expect(profitPercentInput().value).toBe('71.43');
            });

            it('should update the selling price from a typed profit percentage', () => {
                  loadProductForEdit(productDetail());
                  fixture.detectChanges();

                  commitProfitInput(profitPercentInput(), '20');

                  expect(state.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(8.4);
                  expect(profitValueInput().value).toBe('1.4');
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

                  commitProfitInput(profitPercentInput(), '20');

                  expect(state.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(10);
                  expect(profitPercentInput().value).toBe('0');
            });
      });
});

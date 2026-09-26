/// <reference types="jasmine" />

import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ProductManageStateService } from './product-manage-state.service';
import { ProductApiService } from './product-api.service';

describe('ProductManageStateService', () => {
  let service: ProductManageStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [{ provide: ProductApiService, useValue: {} }]
    });

    service = TestBed.inject(ProductManageStateService);
    service.initialize();
  });

  it('should enable conversion state when a complete conversion row is added', () => {
    expect(service.productForm.get('hasConversion')?.value).toBeFalse();

    service.addConversion();
    service.conversionsFormArray.at(0).patchValue({
      parentProductId: 11,
      parentProductName: 'Carton',
      parentQuantity: 1,
      childQuantity: 12
    });
    // The component calls this whenever the form value changes.
    service.onFormValueChanged();

    expect(service.conversionsFormArray.length).toBe(1);
    expect(service.productForm.get('hasConversion')?.value).toBeTrue();

    const payload = service.buildProductPayload();
    expect(payload.hasConversion).toBeTrue();
    expect(payload.conversions.length).toBe(1);
  });

  it('should disable conversion state when the last conversion row is removed', () => {
    service.addConversion();

    service.removeConversion(0);

    expect(service.conversionsFormArray.length).toBe(0);
    expect(service.productForm.get('hasConversion')?.value).toBeFalse();

    const payload = service.buildProductPayload();
    expect(payload.hasConversion).toBeFalse();
    expect(payload.conversions).toEqual([]);
  });

  it('should derive the profit amount and percentage from a barcode row prices', () => {
    service.barcodesFormArray.at(0).patchValue({ buyingPrice: 10, sellingPrice: 14 });

    expect(service.getBarcodeProfitValue(0)).toBe(4);
    expect(service.getBarcodeProfitPercent(0)).toBe(40);
  });

  it('should update the selling price when a profit amount is applied', () => {
    service.barcodesFormArray.at(0).patchValue({ buyingPrice: 10, sellingPrice: 12 });

    service.applyBarcodeProfitValue(0, 6.5);

    expect(service.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(16.5);
    expect(service.getBarcodeProfitValue(0)).toBe(6.5);
  });

  it('should update the selling price when a profit percentage is applied', () => {
    service.barcodesFormArray.at(0).patchValue({ buyingPrice: 8, sellingPrice: 8 });

    service.applyBarcodeProfitPercent(0, 25);

    expect(service.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(10);
    expect(service.getBarcodeProfitPercent(0)).toBe(25);
  });

  it('should round the selling price to two decimals when a profit percentage is applied', () => {
    service.barcodesFormArray.at(0).patchValue({ buyingPrice: 7, sellingPrice: 7 });

    service.applyBarcodeProfitPercent(0, 33.33);

    expect(service.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(9.33);
  });

  it('should ignore a profit percentage while the buying price is zero', () => {
    service.barcodesFormArray.at(0).patchValue({ buyingPrice: 0, sellingPrice: 5 });

    service.applyBarcodeProfitPercent(0, 20);

    expect(service.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(5);
  });

  it('should never drive the selling price below zero when a negative profit is applied', () => {
    service.barcodesFormArray.at(0).patchValue({ buyingPrice: 10, sellingPrice: 12 });

    service.applyBarcodeProfitValue(0, -25);

    expect(service.barcodesFormArray.at(0).get('sellingPrice')?.value).toBe(0);
  });
});

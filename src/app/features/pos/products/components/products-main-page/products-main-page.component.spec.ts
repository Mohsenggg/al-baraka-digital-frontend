import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NotificationService } from '../../../../../shared/services/notification.service';

import { ProductsMainPageComponent } from './products-main-page.component';

describe('ProductsMainPageComponent', () => {
  let component: ProductsMainPageComponent;
  let fixture: ComponentFixture<ProductsMainPageComponent>;
  let notificationService: NotificationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsMainPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    })
    .compileComponents();

    notificationService = TestBed.inject(NotificationService);
    fixture = TestBed.createComponent(ProductsMainPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render two independent search fields and one shared search button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const nameInput = compiled.querySelector('.search-name-wrapper input') as HTMLInputElement;
    const barcodeInput = compiled.querySelector('.search-barcode-wrapper input') as HTMLInputElement;
    const sharedSearchBtn = compiled.querySelector('.shared-search-btn') as HTMLButtonElement;

    expect(nameInput).toBeTruthy();
    expect(barcodeInput).toBeTruthy();
    expect(sharedSearchBtn).toBeTruthy();
    expect(nameInput.placeholder).toContain('بحث باسم المنتج');
    expect(barcodeInput.placeholder).toContain('بحث بالباركود');
  });

  it('should handle name search input, execution, and clear', () => {
    component.onSearchNameInput({ target: { value: 'حليب' } } as any);
    expect(component.localSearchName()).toBe('حليب');

    component.executeSearchName();
    expect(component.searchNameQuery()).toBe('حليب');

    component.clearSearchName();
    expect(component.localSearchName()).toBe('');
    expect(component.searchNameQuery()).toBe('');
  });

  it('should handle barcode search input with contains mode while typing and exact mode on shared search', () => {
    const warnSpy = spyOn(notificationService, 'warning');

    component.onSearchBarcodeInput({ target: { value: '123456' } } as any);
    expect(component.localSearchBarcode()).toBe('123456');

    // Executing shared search (clicking search icon or Enter) performs exact barcode search
    component.executeSharedSearch();
    expect(component.searchBarcodeQuery()).toBe('123456');

    // Since '123456' doesn't exist in empty mock catalog, it reports not found
    expect(component.barcodeNotFoundQuery()).toBe('123456');
    expect(warnSpy).toHaveBeenCalledWith('الباركود غير موجود: 123456');

    // Typing again clears barcodeNotFoundQuery
    component.onSearchBarcodeInput({ target: { value: '123' } } as any);
    expect(component.barcodeNotFoundQuery()).toBe('');

    component.clearSearchBarcode();
    expect(component.localSearchBarcode()).toBe('');
    expect(component.searchBarcodeQuery()).toBe('');
  });

  it('should clear both search inputs and alerts when clearFilters is called', () => {
    component.localSearchName.set('منتج');
    component.localSearchBarcode.set('999');
    component.barcodeNotFoundQuery.set('999');
    component.executeSearchName();

    component.clearFilters();

    expect(component.localSearchName()).toBe('');
    expect(component.localSearchBarcode()).toBe('');
    expect(component.searchNameQuery()).toBe('');
    expect(component.searchBarcodeQuery()).toBe('');
    expect(component.barcodeNotFoundQuery()).toBe('');
  });
});

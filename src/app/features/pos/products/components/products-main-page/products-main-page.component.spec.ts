import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ProductsMainPageComponent } from './products-main-page.component';

describe('ProductsMainPageComponent', () => {
  let component: ProductsMainPageComponent;
  let fixture: ComponentFixture<ProductsMainPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsMainPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductsMainPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render two independent search fields for name and barcode', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const nameInput = compiled.querySelector('.search-name-wrapper input') as HTMLInputElement;
    const barcodeInput = compiled.querySelector('.search-barcode-wrapper input') as HTMLInputElement;

    expect(nameInput).toBeTruthy();
    expect(barcodeInput).toBeTruthy();
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

  it('should handle barcode search input, execution, and clear', () => {
    component.onSearchBarcodeInput({ target: { value: '123456' } } as any);
    expect(component.localSearchBarcode()).toBe('123456');

    component.executeSearchBarcode();
    expect(component.searchBarcodeQuery()).toBe('123456');

    component.clearSearchBarcode();
    expect(component.localSearchBarcode()).toBe('');
    expect(component.searchBarcodeQuery()).toBe('');
  });

  it('should clear both search inputs when clearFilters is called', () => {
    component.localSearchName.set('منتج');
    component.localSearchBarcode.set('999');
    component.executeSearchName();
    component.executeSearchBarcode();

    component.clearFilters();

    expect(component.localSearchName()).toBe('');
    expect(component.localSearchBarcode()).toBe('');
    expect(component.searchNameQuery()).toBe('');
    expect(component.searchBarcodeQuery()).toBe('');
  });
});

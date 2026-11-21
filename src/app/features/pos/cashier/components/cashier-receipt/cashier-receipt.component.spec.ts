import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CashierReceiptComponent } from './cashier-receipt.component';
import { ProductSearchService } from '../../../../../shared/services/product-search.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { CartItem } from '../../../core/models/pos.models';

describe('CashierReceiptComponent keyboard navigation', () => {
  let component: CashierReceiptComponent;
  let fixture: ComponentFixture<CashierReceiptComponent>;

  const mockCartItems: CartItem[] = [
    {
      productId: 1,
      productName: 'Item 1',
      quantity: 1,
      sellingPrice: 10,
      buyingPrice: 8,
      discount: 0,
      total: 10,
      remainingStock: 50,
      product: {
        id: 1,
        name: 'Item 1',
        barcode: '111',
        costPrice: 8,
        sellingPrice: 10,
        buyingPrice: 8,
        stockQuantity: 50,
        isActive: true,
        createdAt: '',
        updatedAt: ''
      }
    },
    {
      productId: 2,
      productName: 'Item 2',
      quantity: 3,
      sellingPrice: 25,
      buyingPrice: 20,
      discount: 0,
      total: 75,
      remainingStock: 30,
      product: {
        id: 2,
        name: 'Item 2',
        barcode: '222',
        costPrice: 20,
        sellingPrice: 25,
        buyingPrice: 20,
        stockQuantity: 30,
        isActive: true,
        createdAt: '',
        updatedAt: ''
      }
    }
  ];

  beforeEach(async () => {
    const mockProductSearch = jasmine.createSpyObj('ProductSearchService', ['findExactByCode', 'filterProducts']);
    const mockNotification = jasmine.createSpyObj('NotificationService', ['success', 'warning', 'error']);

    await TestBed.configureTestingModule({
      imports: [CashierReceiptComponent],
      providers: [
        { provide: ProductSearchService, useValue: mockProductSearch },
        { provide: NotificationService, useValue: mockNotification }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CashierReceiptComponent);
    component = fixture.componentInstance;
    component.items = [...mockCartItems];
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should navigate down between rows on ArrowDown', () => {
    const focusSpy = spyOn(component, 'focusTableCell').and.callThrough();
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    component.onTableKeyDown(event, 0, 'quantity');

    expect(event.defaultPrevented).toBeTrue();
    expect(focusSpy).toHaveBeenCalledWith(1, 'quantity');
  });

  it('should navigate up between rows on ArrowUp', () => {
    const focusSpy = spyOn(component, 'focusTableCell').and.callThrough();
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
    component.onTableKeyDown(event, 1, 'quantity');

    expect(event.defaultPrevented).toBeTrue();
    expect(focusSpy).toHaveBeenCalledWith(0, 'quantity');
  });

  it('should focus barcode scanner when pressing ArrowDown on the last row', () => {
    const scannerSpy = spyOn(component, 'focusBarcodeScanner');
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    component.onTableKeyDown(event, 1, 'quantity');

    expect(event.defaultPrevented).toBeTrue();
    expect(scannerSpy).toHaveBeenCalled();
  });

  it('should focus the last row quantity input when pressing ArrowUp in the barcode search input', () => {
    const focusSpy = spyOn(component, 'focusTableCell');
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
    component.onSearchKeyDown(event);

    expect(event.defaultPrevented).toBeTrue();
    expect(focusSpy).toHaveBeenCalledWith(1, 'quantity');
  });

  it('should navigate horizontally across columns in logical RTL order', () => {
    const focusSpy = spyOn(component, 'focusTableCell').and.callThrough();

    // From sellingPrice moving left to quantity
    const eventLeft = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    component.onTableKeyDown(eventLeft, 0, 'sellingPrice');
    expect(focusSpy).toHaveBeenCalledWith(0, 'quantity');

    // From quantity moving left to total
    component.onTableKeyDown(eventLeft, 0, 'quantity');
    expect(focusSpy).toHaveBeenCalledWith(0, 'total');

    // From quantity moving right to sellingPrice
    const eventRight = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    component.onTableKeyDown(eventRight, 0, 'quantity');
    expect(focusSpy).toHaveBeenCalledWith(0, 'sellingPrice');
  });

  it('should open product search list when pressing Enter while the search input is empty', () => {
    component.inputForm.patchValue({ barcode: '' });
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    component.onSearchKeyDown(event);

    expect(event.defaultPrevented).toBeTrue();
    expect(component.popupOpen).toBeTrue();
    expect(component.popupInitialQuery).toBe('');
  });
});

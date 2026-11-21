import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReceiptTableComponent } from './receipt-table.component';
import { ReceiptItemResponse } from '../../../core/models/pos.models';

describe('ReceiptTableComponent keyboard navigation', () => {
  let component: ReceiptTableComponent;
  let fixture: ComponentFixture<ReceiptTableComponent>;

  const mockItems: ReceiptItemResponse[] = [
    {
      productCode: '1001',
      productName: 'Product 1',
      quantity: 2,
      sellingPrice: 50,
      buyingPrice: 40,
      totalPrice: 100,
      remainingStock: 10
    },
    {
      productCode: '1002',
      productName: 'Product 2',
      quantity: 5,
      sellingPrice: 20,
      buyingPrice: 15,
      totalPrice: 100,
      remainingStock: 25
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiptTableComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptTableComponent);
    component = fixture.componentInstance;
    component.items = [...mockItems];
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should navigate down to the same column on row 1 when ArrowDown is pressed on row 0', () => {
    const focusSpy = spyOn(component, 'focusTableCell').and.callThrough();
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    component.onTableKeyDown(event, 0, 'quantity');

    expect(event.defaultPrevented).toBeTrue();
    expect(focusSpy).toHaveBeenCalledWith(1, 'quantity');
  });

  it('should navigate up to the same column on row 0 when ArrowUp is pressed on row 1', () => {
    const focusSpy = spyOn(component, 'focusTableCell').and.callThrough();
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
    component.onTableKeyDown(event, 1, 'quantity');

    expect(event.defaultPrevented).toBeTrue();
    expect(focusSpy).toHaveBeenCalledWith(0, 'quantity');
  });

  it('should navigate left from price to quantity when ArrowLeft is pressed with entire text selected', () => {
    const input = fixture.nativeElement.querySelector('[data-row="0"][data-col="price"]') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, input.value.length);

    const focusSpy = spyOn(component, 'focusTableCell').and.callThrough();
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    Object.defineProperty(event, 'target', { value: input });

    component.onTableKeyDown(event, 0, 'price');
    expect(event.defaultPrevented).toBeTrue();
    expect(focusSpy).toHaveBeenCalledWith(0, 'quantity');
  });

  it('should navigate right from quantity to price when ArrowRight is pressed with entire text selected', () => {
    const input = fixture.nativeElement.querySelector('[data-row="0"][data-col="quantity"]') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, input.value.length);

    const focusSpy = spyOn(component, 'focusTableCell').and.callThrough();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    Object.defineProperty(event, 'target', { value: input });

    component.onTableKeyDown(event, 0, 'quantity');
    expect(event.defaultPrevented).toBeTrue();
    expect(focusSpy).toHaveBeenCalledWith(0, 'price');
  });

  it('should preserve text selection and NOT navigate when partial text is selected', () => {
    const input = fixture.nativeElement.querySelector('[data-row="0"][data-col="price"]') as HTMLInputElement;
    input.value = '50.00';
    input.setSelectionRange(1, 3); // partially selected

    const focusSpy = spyOn(component, 'focusTableCell').and.callThrough();
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    Object.defineProperty(event, 'target', { value: input });

    component.onTableKeyDown(event, 0, 'price');
    expect(event.defaultPrevented).toBeFalse();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('should preserve cursor movement and NOT navigate when caret is in middle of text', () => {
    const input = fixture.nativeElement.querySelector('[data-row="0"][data-col="price"]') as HTMLInputElement;
    input.value = '50.00';
    input.setSelectionRange(2, 2); // caret between 0 and .

    const focusSpy = spyOn(component, 'focusTableCell').and.callThrough();
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    Object.defineProperty(event, 'target', { value: input });

    component.onTableKeyDown(event, 0, 'price');
    expect(event.defaultPrevented).toBeFalse();
    expect(focusSpy).not.toHaveBeenCalled();
  });
});

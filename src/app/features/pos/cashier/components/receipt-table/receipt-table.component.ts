import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReceiptItemResponse } from '../../../core/models/pos.models';

export type ReceiptTableNavCol = 'name' | 'price' | 'quantity' | 'total';
const RECEIPT_TABLE_NAV_COLS: ReceiptTableNavCol[] = ['name', 'price', 'quantity', 'total'];

@Component({
      selector: 'app-cashier-receipt-table',
      standalone: true,
      imports: [CommonModule],
      templateUrl: './receipt-table.component.html',
      styleUrls: ['./receipt-table.component.css'],
      changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptTableComponent {
      private elementRef = inject(ElementRef);

      @Input() items: ReceiptItemResponse[] = [];
      @Output() removeItem = new EventEmitter<number>();
      @Output() viewItem = new EventEmitter<ReceiptItemResponse>();
      @Output() updateQuantity = new EventEmitter<{ item: ReceiptItemResponse, delta: number }>();
      @Output() updateItemField = new EventEmitter<{ item: ReceiptItemResponse, field: string, value: number }>();

      onRemove(item: ReceiptItemResponse, index: number): void {
            this.removeItem.emit((item as any).productId ?? index);
      }

      onFieldFocus(event: FocusEvent): void {
            const input = event.target as HTMLInputElement;
            if (input && typeof input.select === 'function') {
                  input.select();
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

                  if (selectionStart === 0 && selectionEnd === value.length) {
                        return true;
                  }

                  if (selectionStart !== selectionEnd) {
                        return false;
                  }

                  if (selectionStart > 0 && selectionStart < value.length) {
                        return false;
                  }

                  return true;
            } catch {
                  return true;
            }
      }

      onTableKeyDown(event: KeyboardEvent, rowIndex: number, col: ReceiptTableNavCol): void {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
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
                        }
                        break;
                  }

                  case 'ArrowLeft': {
                        // In RTL: ArrowLeft moves visually left towards total (name -> price -> quantity -> total)
                        if (isInput && !this.shouldNavigateHorizontal(input, 'left')) {
                              return;
                        }

                        const colIdx = RECEIPT_TABLE_NAV_COLS.indexOf(col);
                        if (colIdx >= 0 && colIdx < RECEIPT_TABLE_NAV_COLS.length - 1) {
                              event.preventDefault();
                              this.focusTableCell(rowIndex, RECEIPT_TABLE_NAV_COLS[colIdx + 1]);
                        } else if (colIdx === RECEIPT_TABLE_NAV_COLS.length - 1 && rowIndex < this.items.length - 1) {
                              event.preventDefault();
                              this.focusTableCell(rowIndex + 1, RECEIPT_TABLE_NAV_COLS[0]);
                        }
                        break;
                  }

                  case 'ArrowRight': {
                        // In RTL: ArrowRight moves visually right towards name (total -> quantity -> price -> name)
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
}

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReceiptResponse, ReceiptMode } from '../../../core/models/pos.models';

@Component({
      selector: 'app-cashier-actions',
      standalone: true,
      imports: [CommonModule],
      templateUrl: './cashier-actions.component.html',
      styles: [`:host { display: contents; }`],
      changeDetection: ChangeDetectionStrategy.OnPush
})
export class CashierActionsComponent {
      @Input() receipt: ReceiptResponse | null = null;
      @Input() receiptMode: ReceiptMode = 'NEW';
      @Input() draftsCount = 0;
      @Input() hasStockErrors = false;
      @Input() isLoading = false;
      @Input() finalTotal: number = 0;
      @Input() totalQuantity: number = 0;
      @Input() distinctItemsCount: number = 0;

      @Output() toggleRightSidebar = new EventEmitter<void>();
      @Output() saveAndPrint = new EventEmitter<void>();
      @Output() save = new EventEmitter<void>();
      @Output() temporarySave = new EventEmitter<void>();
      @Output() print = new EventEmitter<void>();
      @Output() edit = new EventEmitter<void>();
      @Output() newReceipt = new EventEmitter<void>();
      @Output() drafts = new EventEmitter<void>();
      @Output() refundReceipt = new EventEmitter<void>();

      get integerPart(): string {
            const num = Number(this.finalTotal) || 0;
            const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const dotIndex = formatted.lastIndexOf('.');
            return dotIndex !== -1 ? formatted.substring(0, dotIndex) : formatted;
      }

      get decimalPart(): string {
            const num = Number(this.finalTotal) || 0;
            const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const dotIndex = formatted.lastIndexOf('.');
            return dotIndex !== -1 ? formatted.substring(dotIndex) : '.00';
      }
}

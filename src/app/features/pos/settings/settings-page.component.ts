import { Component, OnInit, inject, signal, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SettingsService } from '../../../core/services/settings.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { POS_CONFIG_KEYS } from '../../../core/models/pos-settings.model';

export type SettingsTab = 'PAYMENT' | 'PRINTING' | 'GENERAL';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SidebarComponent],
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPageComponent implements OnInit {
  private settingsService = inject(SettingsService);
  private notifications = inject(NotificationService);
  private router = inject(Router);

  // Active navigation tab
  activeTab = signal<SettingsTab>('PAYMENT');

  // Form state signals
  thresholdInput = signal<number>(50);
  enableThreshold = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  sidebarVisible = signal<boolean>(false);

  // Quick preset values in EGP
  readonly presets = [0, 20, 50, 100, 200];

  // Service reactive bindings
  isLoading = this.settingsService.isLoading;

  ngOnInit(): void {
    this.fetchSettingsFromService();
  }

  /** Load current settings into form controls */
  private fetchSettingsFromService(): void {
    this.settingsService.loadSettings().subscribe({
      next: () => {
        this.syncLocalStateWithService();
      },
      error: () => {
        this.syncLocalStateWithService();
      }
    });
  }

  private syncLocalStateWithService(): void {
    this.thresholdInput.set(this.settingsService.remainingAmountThreshold());
    this.enableThreshold.set(this.settingsService.enableRemainingAmountThreshold());
  }

  /** Preset selection handler */
  selectPreset(value: number): void {
    this.thresholdInput.set(value);
  }

  /** Step increment */
  incrementThreshold(step: number = 5): void {
    const current = this.thresholdInput();
    this.thresholdInput.set(current + step);
  }

  /** Step decrement with zero clamp */
  decrementThreshold(step: number = 5): void {
    const current = this.thresholdInput();
    this.thresholdInput.set(Math.max(0, current - step));
  }

  /** Master switch toggle */
  onToggleThreshold(enabled: boolean): void {
    this.enableThreshold.set(enabled);
  }

  /** Save all settings to the backend database */
  onSave(): void {
    const val = Number(this.thresholdInput());
    if (isNaN(val) || val < 0) {
      this.notifications.warning('يرجى إدخال قيمة صحيحة للحد المالي (صفر أو قيمة موجبة)');
      return;
    }

    this.isSaving.set(true);
    const updates: Record<string, string> = {
      [POS_CONFIG_KEYS.REMAINING_AMOUNT_THRESHOLD]: val.toFixed(2),
      [POS_CONFIG_KEYS.ENABLE_REMAINING_AMOUNT_THRESHOLD]: String(this.enableThreshold())
    };

    this.settingsService.saveSettings(updates).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.notifications.success('تم حفظ إعدادات الكاشير في قاعدة البيانات بنجاح');
      },
      error: (err) => {
        this.isSaving.set(false);
        const msg = err?.error?.message || 'فشل حفظ الإعدادات، يرجى التحقق من اتصال الخادم';
        this.notifications.error(msg);
      }
    });
  }

  /** Reset settings to defaults */
  onReset(): void {
    if (!confirm('هل تريد بالتأكيد استعادة الإعدادات الافتراضية للحد المالي (50 ج.م)؟')) {
      return;
    }

    this.isSaving.set(true);
    const targetKeys = [
      POS_CONFIG_KEYS.REMAINING_AMOUNT_THRESHOLD,
      POS_CONFIG_KEYS.ENABLE_REMAINING_AMOUNT_THRESHOLD
    ];

    this.settingsService.resetToDefaults(targetKeys).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.syncLocalStateWithService();
        this.notifications.info('تمت استعادة الإعدادات الافتراضية بنجاح (50 ج.م)');
      },
      error: (err) => {
        this.isSaving.set(false);
        const msg = err?.error?.message || 'فشل استعادة الإعدادات الافتراضية';
        this.notifications.error(msg);
      }
    });
  }

  /** Return to cashier workspace */
  goBack(): void {
    this.router.navigate(['/pos/cashier']);
  }

  /** Toggle sidebar visibility */
  toggleSidebar(): void {
    this.sidebarVisible.update(v => !v);
  }

  /** Keyboard shortcut handler */
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (event.key === 'F11') {
      event.preventDefault();
      this.onSave();
    } else if (event.key === 'Escape') {
      if (this.sidebarVisible()) {
        this.sidebarVisible.set(false);
      }
    }
  }
}

import { Component, Input, Output, EventEmitter, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/auth/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit {
  @Input() expanded = false;
  @Input() cashierName?: string;
  @Input() branchName?: string;
  @Output() toggle = new EventEmitter<void>();

  private authService = inject(AuthService);

  isFullscreen = false;
  fullScreenIcon = 'fullscreen';
  fullScreenLabel = 'ملء الشاشة';

  navItems = [
    { label: 'الكاشير', icon: 'point_of_sale', route: '/pos/cashier' },
    { label: 'إدارة المخزون', icon: 'inventory_2', route: '/pos/products' },
    { label: 'تقارير المبيعات', icon: 'bar_chart', route: '/pos/receipts' },
    { label: 'أدوات الطباعة', icon: 'print', route: '/pos/receipt-form' },
    { label: 'الإعدادات', icon: 'settings', route: '#' }
  ];

  get resolvedCashierName(): string {
    if (this.cashierName && this.cashierName.trim()) {
      return this.cashierName.trim();
    }
    const user = this.authService.getUser();
    return user?.name || user?.fullName || user?.username || 'أحمد محمود';
  }

  get resolvedBranchName(): string {
    if (this.branchName && this.branchName.trim()) {
      return this.branchName.trim();
    }
    const user = this.authService.getUser();
    return user?.branch || user?.branchName || 'الفرع الرئيسي';
  }

  ngOnInit(): void {
    this.syncFullscreenState();
  }

  onToggleSidebar(): void {
    this.toggle.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: KeyboardEvent) {
    if (this.expanded) {
      this.toggle.emit();
    }
  }

  onClose() {
    if (this.expanded) {
      this.toggle.emit();
    }
  }

  onSelectNavItem() {
    if (window.innerWidth < 1024 && this.expanded) {
      this.toggle.emit();
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.syncFullscreenState();
  }

  enterFullscreen(): void {
    if (this.isFullscreen) {
      document.exitFullscreen();
      return;
    }

    document.documentElement.requestFullscreen().catch(console.error);
  }

  private syncFullscreenState(): void {
    this.isFullscreen = !!document.fullscreenElement;
    this.fullScreenIcon = this.isFullscreen ? 'fullscreen_exit' : 'fullscreen';
    this.fullScreenLabel = this.isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة';
  }

  logout(): void {
    this.authService.logout();
  }
}

import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  POS_CONFIG_KEYS,
  DEFAULT_CONFIG_VALUES,
  PosSettingsResponse,
  UpdatePosSettingsBatchRequest
} from '../models/pos-settings.model';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/pos/settings`;
  private readonly CACHE_KEY = 'pos_settings_cache';

  // Internal reactive dictionary of all key-value settings
  private _settingsMap = signal<Record<string, string>>(this.loadInitialCache());
  public readonly settingsMap = this._settingsMap.asReadonly();

  // Typed Computed Signals for Cashier & Checkout consumption
  public readonly remainingAmountThreshold = computed(() => {
    const raw = this._settingsMap()[POS_CONFIG_KEYS.REMAINING_AMOUNT_THRESHOLD];
    const parsed = parseFloat(raw);
    return isNaN(parsed) || parsed < 0 ? 50.00 : parsed;
  });

  public readonly enableRemainingAmountThreshold = computed(() => {
    const raw = this._settingsMap()[POS_CONFIG_KEYS.ENABLE_REMAINING_AMOUNT_THRESHOLD];
    return raw !== undefined ? raw === 'true' : true;
  });

  private _isLoading = signal<boolean>(false);
  public readonly isLoading = this._isLoading.asReadonly();

  /** Eagerly load from backend with offline fallback */
  loadSettings(): Observable<PosSettingsResponse | null> {
    this._isLoading.set(true);
    return this.http.get<PosSettingsResponse>(this.apiUrl).pipe(
      tap(res => {
        if (res && res.settings) {
          const merged = { ...DEFAULT_CONFIG_VALUES, ...res.settings };
          this._settingsMap.set(merged);
          this.writeCache(merged);
        }
        this._isLoading.set(false);
      }),
      catchError(err => {
        console.warn('[SettingsService] Failed to fetch settings from server; using local cache.', err);
        this._isLoading.set(false);
        return of(null);
      })
    );
  }

  /** Generic getter for any future setting key */
  getValue(key: string, fallback: string = ''): string {
    return this._settingsMap()[key] ?? fallback;
  }

  /** Save a batch of key-value pairs to the database */
  saveSettings(updates: Record<string, string>): Observable<PosSettingsResponse> {
    this._isLoading.set(true);
    const payload: UpdatePosSettingsBatchRequest = {
      scopeType: 'GLOBAL',
      scopeId: 'DEFAULT',
      settings: updates
    };

    return this.http.put<PosSettingsResponse>(this.apiUrl, payload).pipe(
      tap(res => {
        if (res && res.settings) {
          const merged = { ...this._settingsMap(), ...res.settings };
          this._settingsMap.set(merged);
          this.writeCache(merged);
        }
        this._isLoading.set(false);
      }),
      catchError(err => {
        this._isLoading.set(false);
        throw err;
      })
    );
  }

  /** Reset settings to defaults on the database */
  resetToDefaults(keys?: string[]): Observable<PosSettingsResponse> {
    this._isLoading.set(true);
    return this.http.post<PosSettingsResponse>(`${this.apiUrl}/reset`, keys || []).pipe(
      tap(res => {
        if (res && res.settings) {
          const merged = { ...this._settingsMap(), ...res.settings };
          this._settingsMap.set(merged);
          this.writeCache(merged);
        }
        this._isLoading.set(false);
      }),
      catchError(err => {
        this._isLoading.set(false);
        throw err;
      })
    );
  }

  private loadInitialCache(): Record<string, string> {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (raw) return { ...DEFAULT_CONFIG_VALUES, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_CONFIG_VALUES };
  }

  private writeCache(map: Record<string, string>): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('[SettingsService] Failed to cache settings in localStorage', e);
    }
  }
}

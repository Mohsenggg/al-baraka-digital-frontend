import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, shareReplay, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CatalogProduct, CatalogFilterCriteria, StockUpdateItem, StockRestoreItem } from '../models/catalog-product.model';
import type { ProductManagePayload } from '../../../features/pos/products/models/product.models';

@Injectable({
  providedIn: 'root'
})
export class ProductCatalogStore {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/products`;

  // --- Internal State Signals ---
  private readonly _products = signal<CatalogProduct[]>([]);
  private readonly _isLoading = signal<boolean>(false);
  private readonly _lastLoadedAt = signal<number | null>(null);
  private readonly _error = signal<string | null>(null);

  // --- Public Readonly Signals ---
  public readonly products = this._products.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();
  public readonly isLoaded = computed(() => this._lastLoadedAt() !== null);
  public readonly error = this._error.asReadonly();
  public readonly totalCount = computed(() => this._products().length);

  // --- O(1) High-Performance Index Lookups ---
  public readonly barcodeIndex = computed(() => {
    const map = new Map<string, CatalogProduct>();
    for (const p of this._products()) {
      if (p.barcode) {
        map.set(p.barcode.trim().toLowerCase(), p);
      }
    }
    return map;
  });

  public readonly idIndex = computed(() => {
    const map = new Map<number, CatalogProduct>();
    for (const p of this._products()) {
      map.set(p.id, p);
    }
    return map;
  });

  // --- Cache Expiration Policy (5 Minutes TTL) ---
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  /**
   * Initializes or refreshes the catalog if cache is expired or forced.
   */
  public loadCatalog(forceRefresh: boolean = false): Observable<CatalogProduct[]> {
    const now = Date.now();
    const lastLoaded = this._lastLoadedAt();

    if (!forceRefresh && lastLoaded && (now - lastLoaded < this.CACHE_TTL_MS)) {
      return of(this._products());
    }

    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<any[]>(`${this.apiUrl}/all-products`).pipe(
      map(dtoList => dtoList.map(dto => this.mapDtoToCatalogProduct(dto))),
      tap(products => {
        this._products.set(products);
        this._lastLoadedAt.set(Date.now());
        this._isLoading.set(false);
      }),
      catchError(err => {
        this._error.set('Failed to load product catalog');
        this._isLoading.set(false);
        return throwError(() => err);
      }),
      shareReplay(1)
    );
  }

  /**
   * O(1) Barcode lookup for instant POS scanning.
   */
  public findByBarcode(barcode: string): CatalogProduct | undefined {
    if (!barcode) return undefined;
    return this.barcodeIndex().get(barcode.trim().toLowerCase());
  }

  /**
   * O(1) ID lookup.
   */
  public findById(id: number): CatalogProduct | undefined {
    return this.idIndex().get(id);
  }

  /**
   * In-Memory Search & Filtering for popups and auto-completes.
   */
  public search(criteria: CatalogFilterCriteria): CatalogProduct[] {
    const list = this._products();
    const query = criteria.query?.trim().toLowerCase();
    const activeOnly = criteria.activeOnly ?? true;

    return list.filter(p => {
      if (activeOnly && p.isActive === false) return false;

      if (query) {
        const matchName = p.name ? p.name.toLowerCase().includes(query) : false;
        const matchBarcode = p.barcode ? p.barcode.toLowerCase().includes(query) : false;
        if (!matchName && !matchBarcode) return false;
      }

      if (criteria.stockStatus === 'in_stock' && p.stockQuantity <= 0) return false;
      if (criteria.stockStatus === 'out_of_stock' && p.stockQuantity > 0) return false;

      if (criteria.minPrice != null && p.sellingPrice < criteria.minPrice) return false;
      if (criteria.maxPrice != null && p.sellingPrice > criteria.maxPrice) return false;

      return true;
    });
  }

  // =========================================================================
  // Product Catalog CRUD & Incremental Mutations
  // =========================================================================

  /**
   * Adds or upserts a product in the catalog incrementally.
   * Can accept either a CatalogProduct or a ProductManagePayload (along with an optional ID).
   */
  public addProduct(productOrPayload: CatalogProduct | ProductManagePayload, id?: number): CatalogProduct {
    const product: CatalogProduct = this.isManagePayload(productOrPayload)
      ? this.mapPayloadToCatalogProduct(productOrPayload, id)
      : productOrPayload;

    this._products.update(current => {
      const index = current.findIndex(p => p.id === product.id);
      if (index > -1) {
        const next = [...current];
        next[index] = { ...next[index], ...product };
        return next;
      }
      return [...current, product];
    });

    return product;
  }

  /**
   * Removes a product by ID from the in-memory catalog.
   */
  public removeProduct(id: number): void {
    this._products.update(current => current.filter(p => p.id !== id));
  }

  /**
   * Patch a single product when edited in Product Management form.
   */
  public patchProduct(updated: Partial<CatalogProduct> & { id: number }): void {
    this._products.update(current =>
      current.map(p => p.id === updated.id ? { ...p, ...updated } : p)
    );
  }

  // =========================================================================
  // Stock Mutations & Lifecycle Synchronization
  // =========================================================================

  /**
   * Batch update stock levels by barcode after receipt create or update.
   */
  public updateStockBatchByBarcode(items: StockUpdateItem[]): void {
    if (!items || items.length === 0) return;
    const updateMap = new Map<string, number>();
    items.forEach(item => {
      if (item.barcode && item.remainingStock !== undefined) {
        updateMap.set(item.barcode.trim().toLowerCase(), item.remainingStock);
      }
    });

    this._products.update(current =>
      current.map(p => {
        const key = p.barcode ? p.barcode.trim().toLowerCase() : '';
        if (updateMap.has(key)) {
          const newStock = updateMap.get(key)!;
          return { ...p, stockQuantity: newStock, stock: newStock };
        }
        return p;
      })
    );
  }

  /**
   * Additive batch stock restore by barcode after receipt deletion.
   */
  public restoreStockBatchByBarcode(items: StockRestoreItem[]): void {
    if (!items || items.length === 0) return;
    const restoreMap = new Map<string, number>();
    items.forEach(item => {
      if (item.barcode && item.quantity) {
        const key = item.barcode.trim().toLowerCase();
        restoreMap.set(key, (restoreMap.get(key) || 0) + item.quantity);
      }
    });

    this._products.update(current =>
      current.map(p => {
        const key = p.barcode ? p.barcode.trim().toLowerCase() : '';
        if (restoreMap.has(key)) {
          const addedQty = restoreMap.get(key)!;
          const newStock = p.stockQuantity + addedQty;
          return { ...p, stockQuantity: newStock, stock: newStock };
        }
        return p;
      })
    );
  }

  /**
   * Atomic Refill Update:
   * 1. Updates child product stock + prices + name (or adds child if not present)
   * 2. Decrements parent product stock
   * 3. Synchronizes parentStock across all sibling refillOptions
   */
  public applyRefillUpdate(
    updatedChild: CatalogProduct,
    parentProductId: number,
    parentUnitsUsed: number
  ): void {
    this._products.update(current => {
      let final = [...current];
      const childBarcode = updatedChild.barcode ? updatedChild.barcode.trim().toLowerCase() : '';
      const existingChildIdx = final.findIndex(p => (p.barcode ? p.barcode.trim().toLowerCase() : '') === childBarcode);

      if (existingChildIdx > -1) {
        final[existingChildIdx] = {
          ...final[existingChildIdx],
          stockQuantity: updatedChild.stockQuantity,
          stock: updatedChild.stockQuantity,
          buyingPrice: updatedChild.buyingPrice,
          sellingPrice: updatedChild.sellingPrice,
          name: updatedChild.name
        };
      } else {
        final.push(updatedChild);
      }

      const parentIdx = final.findIndex(p => p.id === parentProductId);
      if (parentIdx > -1) {
        const oldParentStock = final[parentIdx].stockQuantity ?? 0;
        const newParentStock = Math.max(0, oldParentStock - parentUnitsUsed);

        final = final.map((p, idx) => {
          if (idx === parentIdx) {
            return { ...p, stockQuantity: newParentStock, stock: newParentStock };
          }
          if (p.refillOptions?.some(o => o.parentProductId === parentProductId)) {
            return {
              ...p,
              refillOptions: p.refillOptions.map(o =>
                o.parentProductId === parentProductId
                  ? { ...o, parentStock: newParentStock }
                  : o
              )
            };
          }
          return p;
        });
      }

      return final;
    });
  }

  /**
   * Invalidate cache to force reload on next access.
   */
  public invalidate(): void {
    this._lastLoadedAt.set(null);
  }

  // =========================================================================
  // Mappers & Helpers
  // =========================================================================

  /**
   * Converts a ProductManagePayload into a standard CatalogProduct.
   */
  public mapPayloadToCatalogProduct(payload: ProductManagePayload, id?: number): CatalogProduct {
    const targetId = Number(id ?? payload.id);
    const defaultBarcode = payload.barcodes?.find(b => b.isDefault) ?? payload.barcodes?.[0];
    const totalStock = payload.barcodes?.reduce((sum, b) => sum + (Number(b.stock) || 0), 0) ?? 0;
    const sellingPrice = Number(defaultBarcode?.sellingPrice) || 0;
    const buyingPrice = Number(defaultBarcode?.buyingPrice) || 0;
    const status = payload.status ? String(payload.status).toLowerCase() : 'active';
    const isActive = status === 'active';

    return {
      id: targetId,
      name: payload.name || payload.baseName || '',
      barcode: defaultBarcode?.barcode ? String(defaultBarcode.barcode).trim() : '',
      sellingPrice,
      buyingPrice,
      costPrice: buyingPrice,
      stockQuantity: totalStock,
      stock: totalStock,
      categoryId: payload.categoryId != null ? Number(payload.categoryId) : null,
      manufacturerId: payload.manufacturerId != null ? Number(payload.manufacturerId) : null,
      productGroupId: payload.productGroupId != null ? Number(payload.productGroupId) : null,
      status,
      isActive,
      refillOptions: payload.conversions?.map(c => ({
        parentProductId: Number(c.parentProductId),
        parentProductName: c.parentProductName || '',
        parentQuantity: Number(c.parentQuantity) || 1,
        childQuantity: Number(c.childQuantity) || 1,
        parentStock: 0,
        isDefault: Boolean(c.isDefault)
      })) || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private isManagePayload(value: any): value is ProductManagePayload {
    return value && (Array.isArray(value.barcodes) || 'baseName' in value);
  }

  /**
   * Maps flat /all-products backend DTO to CatalogProduct.
   */
  private mapDtoToCatalogProduct(dto: any): CatalogProduct {
    const rawStatus = dto.status != null ? String(dto.status).toLowerCase() : undefined;
    const isActive = dto.isActive !== undefined
      ? Boolean(dto.isActive)
      : (rawStatus ? rawStatus === 'active' : true);

    return {
      id: Number(dto.id),
      name: dto.name || '',
      barcode: dto.barcode || '',
      costPrice: Number(dto.costPrice || dto.buyingPrice) || 0,
      sellingPrice: Number(dto.sellingPrice) || 0,
      buyingPrice: Number(dto.buyingPrice) || 0,
      stockQuantity: Number(dto.stock ?? dto.stockQuantity) || 0,
      stock: Number(dto.stock ?? dto.stockQuantity) || 0,
      categoryId: dto.categoryId != null ? Number(dto.categoryId) : null,
      manufacturerId: dto.manufacturerId != null ? Number(dto.manufacturerId) : null,
      productGroupId: dto.productGroupId != null ? Number(dto.productGroupId) : null,
      type: dto.type != null ? String(dto.type).toLowerCase() : undefined,
      refillOptions: dto.refillOptions || [],
      isActive,
      status: rawStatus || (isActive ? 'active' : 'inactive'),
      createdAt: dto.createdAt || '',
      updatedAt: dto.updatedAt || ''
    };
  }
}

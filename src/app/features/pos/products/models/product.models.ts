import type { ProductCompositionDto } from './product-material.models';

export interface ProductBarcode {
      id: number;
      barcode: string;
      sellingPrice: number;
      buyingPrice: number;
      stock: number;
      default: boolean;
}

export type ProductType = 'inventory' | 'service' | 'bundle' | 'raw';
export type ProductStatus = 'active' | 'inactive' | 'draft' | 'deleted';
export type StockStatus = 'healthy' | 'low' | 'critical' | 'outofstock';

export interface ProductListItem {
      id: number;
      name: string;
      code: string;
      category?: string;
      manufacturer?: string;
      sellingPrice: number;
      buyingPrice?: number;
      stock: number;
      status: ProductStatus;
      type: ProductType;
}

export interface ProductFilterParams {
      query?: string;
      categoryId?: number;
      manufacturerId?: number;
      supplierId?: number;
      status?: string;
      page?: number;
      size?: number;
      sort?: string;
}

export interface ProductPagination {
      page: number;
      size: number;
      total: number;
      totalPages: number;
}

export interface ProductListItemDto {
      id: number;
      name: string;
      code: string;
      category?: string;
      manufacturer?: string;
      sellingPrice: number;
      buyingPrice?: number;
      stock: number;
      status: ProductStatus;
      type: ProductType;
}

export function resolveStockStatus(stock: number): StockStatus {
      if (stock === 0) return 'outofstock';
      if (stock <= 10) return 'critical';
      if (stock <= 30) return 'low';
      return 'healthy';
}

export function getStockClass(product: ProductListItem): StockStatus {
      return resolveStockStatus(product.stock);
}

export function getStockLabel(product: ProductListItem): string {
      const stock = product.stock;
      if (stock === 0) return '0';
      return `${stock}`;
}

export function getTypeLabel(type: string): string {
      const labels: Record<string, string> = {
            inventory: 'منتج مخزون',
            service: 'خدمة',
            bundle: 'حزمة',
            raw: 'مادة خام'
      };
      return labels[type] || type;
}

export function getStatusLabel(status: ProductStatus): string {
      const labels: Record<ProductStatus, string> = {
            active: 'نشط',
            inactive: 'غير نشط',
            draft: 'مسودة',
            deleted: 'محذوف'
      };
      return labels[status];
}

export function getStatusClass(status: ProductStatus): string {
      return `status-${status}`;
}

export interface ProductAttributeOption {
      id: number;
      name: string;
}

export interface NamedEntity {
      id: number;
      name: string;
}

/** Response of `POST /api/products/tree/products/bulk-move`. */
export interface BulkMoveProductsResponse {
      movedCount: number;
      targetGroupId: number | string;
      message: string;
}

export interface ProductAttributeFormValue {
      id: number;
      name: string;
      value: string;
}

export interface ProductBarcodeFormValue {
      id?: number | null;
      barcode: string;
      sellingPrice: number;
      buyingPrice: number;
      stock: number;
      isDefault: boolean;
}

export interface ProductConversionDto {
      parentProductId: number;
      parentProductName?: string;
      parentQuantity: number;
      childQuantity: number;
      isDefault: boolean;
}

export interface ProductManagePayload {
      id?: number | null;
      baseName: string;
      name: string;
      status: string;
      attributes: ProductAttributeFormValue[];
      barcodes: ProductBarcodeFormValue[];
      categoryId: number | null;
      manufacturerId: number | null;
      supplierIds: number[];
      productGroupId?: number | string | null;
      productGroupName?: string | null;
      isPriceUnified?: boolean;
      propagateGroupSellingPrice?: boolean;
      hasConversion: boolean;
      conversions: ProductConversionDto[];
      hasComposition: boolean;
      composition: ProductCompositionDto[];
}

export interface GroupPriceSummary {
      groupId: number | string;
      groupName: string;
      isPriceUnified: boolean;
      productCount: number;
      distinctSellingPrices: number[];
      hasPriceDiscrepancy: boolean;
}

export interface ProfitMargin {
      value: number;
      percentage: number;
}

export function calculateProfitMargin(buying: number, selling: number): ProfitMargin {
      if (!buying || buying <= 0) return { value: 0, percentage: 0 };
      const value = selling - buying;
      const percentage = (value / buying) * 100;
      return { value, percentage };
}

export function resolveBarcodeStockStatus(total: number): StockStatus {
      if (total === 0) return 'outofstock';
      if (total <= 10) return 'critical';
      if (total <= 30) return 'low';
      return 'healthy';
}

export function getBarcodeStockLabel(total: number): string {
      if (total === 0) return 'غير متاح';
      return `${total} وحدة`;
}

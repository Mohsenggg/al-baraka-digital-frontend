import { Product, RefillOption } from '../../../features/pos/core/models/pos.models';
import type { ProductType } from '../../../features/pos/products/models/product.models';

export interface CatalogProduct extends Product {
  status?: string;
  categoryId?: number | null;
  manufacturerId?: number | null;
  productGroupId?: number | null;
  type?: ProductType | string;
  sku?: string;
  price0?: number;
  price1?: number;
  price2?: number;
  price3?: number;
  price4?: number;
}

export interface CatalogFilterCriteria {
  query?: string;
  stockStatus?: 'all' | 'in_stock' | 'out_of_stock';
  minPrice?: number | null;
  maxPrice?: number | null;
  activeOnly?: boolean;
}

export interface StockUpdateItem {
  barcode: string;
  remainingStock: number;
}

export interface StockRestoreItem {
  barcode: string;
  quantity: number;
}

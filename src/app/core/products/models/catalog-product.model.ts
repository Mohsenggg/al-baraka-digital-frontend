import { Product, RefillOption } from '../../../features/pos/core/models/pos.models';

export interface CatalogProduct extends Product {
  status?: string;
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

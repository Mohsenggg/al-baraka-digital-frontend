import { ProductStatus, ProductType } from '../../../../models/product.models';

export interface TreeProductItem {
      id: number | string;
      sku: string;
      name: string;
      productGroupId: number | string;
      sellingPrice: number;
      buyingPrice?: number;
      price0?: number; // Cost price
      price1?: number; // Retail price
      price2?: number; // Wholesale 1
      price3?: number; // Wholesale 2
      price4?: number; // Special price
      vendorCode?: string;
      stock: number;
      minStock?: number;
      maxStock?: number;
      type: ProductType;
      status: ProductStatus;
}

export interface ProductGroupNode {
      id: number | string;
      code: string;
      name: string;
      categoryId: number | string;
      brandId?: number | string | null;
      products: TreeProductItem[];
      expanded?: boolean;
}

export interface BrandNode {
      id: number | string;
      code: string;
      name: string;
      categoryId: number | string;
      groups: ProductGroupNode[];
      expanded?: boolean;
}

export interface CategoryNode {
      id: number | string;
      code: string;
      name: string;
      brands: BrandNode[];
      directGroups: ProductGroupNode[];
      expanded?: boolean;
}

export interface TreeStatistics {
      totalCategories: number;
      totalBrands: number;
      totalGroups: number;
      totalProducts: number;
      totalStockUnits: number;
      activeProductsCount: number;
}

/* ============================= */
/* EDIT MODE (RENAME / DELETE)   */
/* ============================= */

/** Hierarchy tiers that can be renamed or deleted while Edit Mode is active. */
export type TreeNodeType = 'category' | 'brand' | 'group';

/** Arabic labels for each editable hierarchy tier. */
export const TREE_NODE_TYPE_LABELS: Record<TreeNodeType, string> = {
      category: 'القسم',
      brand: 'الشركة / العلامة التجارية',
      group: 'مجموعة المنتجات'
};

export const NODE_NAME_MIN_LENGTH = 2;
export const NODE_NAME_MAX_LENGTH = 255;

/** Identifies the tree node an Edit Mode action (rename / delete) targets. */
export interface TreeNodeActionTarget {
      type: TreeNodeType;
      id: number | string;
      name: string;
      /** Parent scope used by the backend uniqueness rules (category id for brands, brand/category id for groups). */
      parentId?: number | string | null;
}

/** Rename specific payload: adds the sibling scope used by the uniqueness rules. */
export interface RenameNodeTarget extends TreeNodeActionTarget {
      /** Names of the siblings inside the same parent scope (the target itself is excluded). */
      siblingNames: string[];
      /** Contextual description shown inside dialogs, e.g. `داخل قسم: مساحيق التنظيف`. */
      contextLabel: string;
}

export interface NodeNameValidationResult {
      valid: boolean;
      error: string | null;
}

/**
 * Client side validation of a node name. It mirrors the backend rules (Task 2 of the CR)
 * so users get immediate feedback; the backend stays the source of truth.
 */
export function validateNodeName(name: string, siblingNames: string[]): NodeNameValidationResult {
      const trimmed = (name || '').trim();

      if (!trimmed) {
            return { valid: false, error: 'اسم العنصر مطلوب' };
      }
      if (trimmed.length < NODE_NAME_MIN_LENGTH) {
            return { valid: false, error: `يجب أن يكون الاسم ${NODE_NAME_MIN_LENGTH} أحرف على الأقل` };
      }
      if (trimmed.length > NODE_NAME_MAX_LENGTH) {
            return { valid: false, error: `يجب ألا يتجاوز الاسم ${NODE_NAME_MAX_LENGTH} حرفاً` };
      }

      const normalized = trimmed.toLowerCase();
      const duplicated = (siblingNames || []).some(sibling => sibling.trim().toLowerCase() === normalized);
      if (duplicated) {
            return { valid: false, error: 'يوجد عنصر آخر بنفس الاسم داخل نفس النطاق' };
      }

      return { valid: true, error: null };
}

export function computeTreeStats(categories: CategoryNode[]): TreeStatistics {
      let totalBrands = 0;
      let totalGroups = 0;
      let totalProducts = 0;
      let totalStockUnits = 0;
      let activeProductsCount = 0;

      for (const cat of categories) {
            totalBrands += cat.brands ? cat.brands.length : 0;

            // Direct groups
            if (cat.directGroups) {
                  totalGroups += cat.directGroups.length;
                  for (const group of cat.directGroups) {
                        if (group.products) {
                              totalProducts += group.products.length;
                              for (const p of group.products) {
                                    totalStockUnits += p.stock || 0;
                                    if (p.status === 'active') activeProductsCount++;
                              }
                        }
                  }
            }

            // Groups under brands
            if (cat.brands) {
                  for (const brand of cat.brands) {
                        if (brand.groups) {
                              totalGroups += brand.groups.length;
                              for (const group of brand.groups) {
                                    if (group.products) {
                                          totalProducts += group.products.length;
                                          for (const p of group.products) {
                                                totalStockUnits += p.stock || 0;
                                                if (p.status === 'active') activeProductsCount++;
                                          }
                                    }
                              }
                        }
                  }
            }
      }

      return {
            totalCategories: categories.length,
            totalBrands,
            totalGroups,
            totalProducts,
            totalStockUnits,
            activeProductsCount
      };
}

export const INITIAL_MOCK_TREE_DATA: CategoryNode[] = [
      {
            id: 1,
            code: '01',
            name: 'مساحيق',
            expanded: true,
            directGroups: [],
            brands: [
                  {
                        id: 101,
                        code: '0101',
                        name: 'شركة اريال',
                        categoryId: 1,
                        expanded: true,
                        groups: [
                              {
                                    id: 1016,
                                    code: '01016',
                                    name: 'اريال 1ك',
                                    categoryId: 1,
                                    brandId: 101,
                                    expanded: true,
                                    products: [
                                          {
                                                id: 1001,
                                                sku: '8006540852170',
                                                name: 'اريال 1كيلو لافندر',
                                                productGroupId: 1016,
                                                sellingPrice: 65.0,
                                                buyingPrice: 52.0,
                                                price0: 52.0,
                                                price1: 65.0,
                                                vendorCode: 'VND-AR-01',
                                                stock: 35,
                                                minStock: 5,
                                                maxStock: 80,
                                                type: 'inventory',
                                                status: 'active'
                                          },
                                          {
                                                id: 1002,
                                                sku: '8006540852171',
                                                name: 'اريال 1كيلو داوني',
                                                productGroupId: 1016,
                                                sellingPrice: 65.0,
                                                buyingPrice: 52.0,
                                                price0: 52.0,
                                                price1: 65.0,
                                                vendorCode: 'VND-AR-02',
                                                stock: 18,
                                                minStock: 5,
                                                maxStock: 80,
                                                type: 'inventory',
                                                status: 'active'
                                          },
                                          {
                                                id: 1003,
                                                sku: '8006540852172',
                                                name: 'اريال 1كيلو عادي',
                                                productGroupId: 1016,
                                                sellingPrice: 60.0,
                                                buyingPrice: 48.0,
                                                price0: 48.0,
                                                price1: 60.0,
                                                vendorCode: 'VND-AR-03',
                                                stock: 50,
                                                minStock: 10,
                                                maxStock: 100,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              },
                              {
                                    id: 1017,
                                    code: '01017',
                                    name: 'اريال 1.5ك',
                                    categoryId: 1,
                                    brandId: 101,
                                    expanded: false,
                                    products: [
                                          {
                                                id: 1004,
                                                sku: '8006540852180',
                                                name: 'اريال 1.5كيلو أوتوماتيك',
                                                productGroupId: 1017,
                                                sellingPrice: 98.0,
                                                buyingPrice: 80.0,
                                                price0: 80.0,
                                                price1: 98.0,
                                                vendorCode: 'VND-AR-04',
                                                stock: 12,
                                                minStock: 5,
                                                maxStock: 50,
                                                type: 'inventory',
                                                status: 'active'
                                          },
                                          {
                                                id: 1005,
                                                sku: '8006540852181',
                                                name: 'اريال 1.5كيلو يدوي',
                                                productGroupId: 1017,
                                                sellingPrice: 85.0,
                                                buyingPrice: 70.0,
                                                price0: 70.0,
                                                price1: 85.0,
                                                vendorCode: 'VND-AR-05',
                                                stock: 4,
                                                minStock: 6,
                                                maxStock: 40,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              },
                              {
                                    id: 1018,
                                    code: '01018',
                                    name: 'اريال جيل 2.5 لتر',
                                    categoryId: 1,
                                    brandId: 101,
                                    expanded: false,
                                    products: [
                                          {
                                                id: 1006,
                                                sku: '8006540852190',
                                                name: 'اريال جيل معطر وردي 2.5 لتر',
                                                productGroupId: 1018,
                                                sellingPrice: 145.0,
                                                buyingPrice: 120.0,
                                                price0: 120.0,
                                                price1: 145.0,
                                                vendorCode: 'VND-AR-06',
                                                stock: 22,
                                                minStock: 5,
                                                maxStock: 40,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              }
                        ]
                  },
                  {
                        id: 102,
                        code: '0102',
                        name: 'شركة اوكسي',
                        categoryId: 1,
                        expanded: false,
                        groups: [
                              {
                                    id: 1021,
                                    code: '01021',
                                    name: 'اوكسي 1ك',
                                    categoryId: 1,
                                    brandId: 102,
                                    expanded: false,
                                    products: [
                                          {
                                                id: 1007,
                                                sku: '6223001234011',
                                                name: 'اوكسي مسحوق 1ك نسيم الربيع',
                                                productGroupId: 1021,
                                                sellingPrice: 55.0,
                                                buyingPrice: 44.0,
                                                price0: 44.0,
                                                price1: 55.0,
                                                vendorCode: 'VND-OXY-01',
                                                stock: 40,
                                                minStock: 8,
                                                maxStock: 70,
                                                type: 'inventory',
                                                status: 'active'
                                          },
                                          {
                                                id: 1008,
                                                sku: '6223001234012',
                                                name: 'اوكسي مسحوق 1ك لافندر',
                                                productGroupId: 1021,
                                                sellingPrice: 55.0,
                                                buyingPrice: 44.0,
                                                price0: 44.0,
                                                price1: 55.0,
                                                vendorCode: 'VND-OXY-02',
                                                stock: 8,
                                                minStock: 10,
                                                maxStock: 70,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              },
                              {
                                    id: 1022,
                                    code: '01022',
                                    name: 'اوكسي جيل 3 لتر',
                                    categoryId: 1,
                                    brandId: 102,
                                    expanded: false,
                                    products: [
                                          {
                                                id: 1009,
                                                sku: '6223001234020',
                                                name: 'اوكسي جيل غسالات أوتوماتيك 3 لتر',
                                                productGroupId: 1022,
                                                sellingPrice: 130.0,
                                                buyingPrice: 108.0,
                                                price0: 108.0,
                                                price1: 130.0,
                                                vendorCode: 'VND-OXY-03',
                                                stock: 15,
                                                minStock: 5,
                                                maxStock: 30,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              }
                        ]
                  },
                  {
                        id: 103,
                        code: '0103',
                        name: 'شركة تايد',
                        categoryId: 1,
                        expanded: false,
                        groups: [
                              {
                                    id: 1031,
                                    code: '01031',
                                    name: 'تايد 2.5ك',
                                    categoryId: 1,
                                    brandId: 103,
                                    expanded: false,
                                    products: [
                                          {
                                                id: 1010,
                                                sku: '8001090123456',
                                                name: 'تايد أوتوماتيك 2.5ك الأصلي',
                                                productGroupId: 1031,
                                                sellingPrice: 160.0,
                                                buyingPrice: 132.0,
                                                price0: 132.0,
                                                price1: 160.0,
                                                vendorCode: 'VND-TD-01',
                                                stock: 0,
                                                minStock: 5,
                                                maxStock: 40,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              }
                        ]
                  }
            ]
      },
      {
            id: 2,
            code: '08',
            name: 'سوائل ومنظفات',
            expanded: true,
            brands: [], // Direct groups under Category without Brand!
            directGroups: [
                  {
                        id: 2083,
                        code: '083',
                        name: 'فانش',
                        categoryId: 2,
                        brandId: null,
                        expanded: true,
                        products: [
                              {
                                    id: 2001,
                                    sku: '6221155012345',
                                    name: 'فانش سائل لإزالة البقع 1 لتر',
                                    productGroupId: 2083,
                                    sellingPrice: 55.0,
                                    buyingPrice: 45.0,
                                    price0: 45.0,
                                    price1: 55.0,
                                    vendorCode: 'VND-VN-01',
                                    stock: 24,
                                    minStock: 3,
                                    maxStock: 60,
                                    type: 'inventory',
                                    status: 'active'
                              },
                              {
                                    id: 2002,
                                    sku: '6221155012346',
                                    name: 'فانش بودرة مبيض للملابس 500 جم',
                                    productGroupId: 2083,
                                    sellingPrice: 48.0,
                                    buyingPrice: 38.0,
                                    price0: 38.0,
                                    price1: 48.0,
                                    vendorCode: 'VND-VN-02',
                                    stock: 19,
                                    minStock: 4,
                                    maxStock: 50,
                                    type: 'inventory',
                                    status: 'active'
                              },
                              {
                                    id: 2003,
                                    sku: '6221155012347',
                                    name: 'فانش جل للملابس الملونة 900 مل',
                                    productGroupId: 2083,
                                    sellingPrice: 62.0,
                                    buyingPrice: 50.0,
                                    price0: 50.0,
                                    price1: 62.0,
                                    vendorCode: 'VND-VN-03',
                                    stock: 6,
                                    minStock: 5,
                                    maxStock: 30,
                                    type: 'inventory',
                                    status: 'active'
                              }
                        ]
                  },
                  {
                        id: 2084,
                        code: '084',
                        name: 'كلوركس',
                        categoryId: 2,
                        brandId: null,
                        expanded: false,
                        products: [
                              {
                                    id: 2004,
                                    sku: '6222001987654',
                                    name: 'كلوركس مبيض عادي 1 لتر',
                                    productGroupId: 2084,
                                    sellingPrice: 22.0,
                                    buyingPrice: 17.0,
                                    price0: 17.0,
                                    price1: 22.0,
                                    vendorCode: 'VND-CL-01',
                                    stock: 65,
                                    minStock: 10,
                                    maxStock: 120,
                                    type: 'inventory',
                                    status: 'active'
                              },
                              {
                                    id: 2005,
                                    sku: '6222001987655',
                                    name: 'كلوركس ألوان معطر زهور 1 لتر',
                                    productGroupId: 2084,
                                    sellingPrice: 35.0,
                                    buyingPrice: 28.0,
                                    price0: 28.0,
                                    price1: 35.0,
                                    vendorCode: 'VND-CL-02',
                                    stock: 32,
                                    minStock: 8,
                                    maxStock: 80,
                                    type: 'inventory',
                                    status: 'active'
                              }
                        ]
                  },
                  {
                        id: 2085,
                        code: '085',
                        name: 'ديتول مطهر',
                        categoryId: 2,
                        brandId: null,
                        expanded: false,
                        products: [
                              {
                                    id: 2006,
                                    sku: '6223005544332',
                                    name: 'ديتول سائل مطهر عام 750 مل',
                                    productGroupId: 2085,
                                    sellingPrice: 78.0,
                                    buyingPrice: 64.0,
                                    price0: 64.0,
                                    price1: 78.0,
                                    vendorCode: 'VND-DT-01',
                                    stock: 14,
                                    minStock: 4,
                                    maxStock: 40,
                                    type: 'inventory',
                                    status: 'active'
                              }
                        ]
                  }
            ]
      },
      {
            id: 3,
            code: '12',
            name: 'منتجات الألبان والأجبان',
            expanded: false,
            brands: [
                  {
                        id: 301,
                        code: '1201',
                        name: 'شركة جهينة',
                        categoryId: 3,
                        expanded: false,
                        groups: [
                              {
                                    id: 3011,
                                    code: '12011',
                                    name: 'حليب جهينة 1 لتر',
                                    categoryId: 3,
                                    brandId: 301,
                                    expanded: false,
                                    products: [
                                          {
                                                id: 3001,
                                                sku: '6221002345678',
                                                name: 'جهينة حليب كامل الدسم 1 لتر',
                                                productGroupId: 3011,
                                                sellingPrice: 44.0,
                                                buyingPrice: 38.0,
                                                price0: 38.0,
                                                price1: 44.0,
                                                vendorCode: 'VND-JH-01',
                                                stock: 80,
                                                minStock: 15,
                                                maxStock: 150,
                                                type: 'inventory',
                                                status: 'active'
                                          },
                                          {
                                                id: 3002,
                                                sku: '6221002345679',
                                                name: 'جهينة حليب خالي الدسم 1 لتر',
                                                productGroupId: 3011,
                                                sellingPrice: 44.0,
                                                buyingPrice: 38.0,
                                                price0: 38.0,
                                                price1: 44.0,
                                                vendorCode: 'VND-JH-02',
                                                stock: 25,
                                                minStock: 10,
                                                maxStock: 80,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              },
                              {
                                    id: 3012,
                                    code: '12012',
                                    name: 'زبادي جهينة',
                                    categoryId: 3,
                                    brandId: 301,
                                    expanded: false,
                                    products: [
                                          {
                                                id: 3003,
                                                sku: '6221002345680',
                                                name: 'جهينة زبادي طبيعي 105 جم',
                                                productGroupId: 3012,
                                                sellingPrice: 8.5,
                                                buyingPrice: 6.8,
                                                price0: 6.8,
                                                price1: 8.5,
                                                vendorCode: 'VND-JH-03',
                                                stock: 120,
                                                minStock: 20,
                                                maxStock: 200,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              }
                        ]
                  },
                  {
                        id: 302,
                        code: '1202',
                        name: 'شركة المراعي',
                        categoryId: 3,
                        expanded: false,
                        groups: [
                              {
                                    id: 3021,
                                    code: '12021',
                                    name: 'عصائر المراعي',
                                    categoryId: 3,
                                    brandId: 302,
                                    expanded: false,
                                    products: [
                                          {
                                                id: 3004,
                                                sku: '6221003456789',
                                                name: 'المراعي عصير برتقال 1 لتر',
                                                productGroupId: 3021,
                                                sellingPrice: 38.0,
                                                buyingPrice: 31.0,
                                                price0: 31.0,
                                                price1: 38.0,
                                                vendorCode: 'VND-MR-01',
                                                stock: 45,
                                                minStock: 10,
                                                maxStock: 100,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              }
                        ]
                  }
            ],
            directGroups: [
                  {
                        id: 3099,
                        code: '1209',
                        name: 'جبنة بيضاء فلاحي بالكيلو',
                        categoryId: 3,
                        brandId: null,
                        expanded: false,
                        products: [
                              {
                                    id: 3005,
                                    sku: '6229990001111',
                                    name: 'جبن براميلي سادة طازج 1 كجم',
                                    productGroupId: 3099,
                                    sellingPrice: 180.0,
                                    buyingPrice: 150.0,
                                    price0: 150.0,
                                    price1: 180.0,
                                    vendorCode: 'VND-CH-01',
                                    stock: 15,
                                    minStock: 3,
                                    maxStock: 30,
                                    type: 'inventory',
                                    status: 'active'
                              }
                        ]
                  }
            ]
      },
      {
            id: 4,
            code: '15',
            name: 'مشروبات وسلع تموينية',
            expanded: false,
            brands: [
                  {
                        id: 401,
                        code: '1501',
                        name: 'شاي ليبتون',
                        categoryId: 4,
                        expanded: false,
                        groups: [
                              {
                                    id: 4011,
                                    code: '15011',
                                    name: 'ليبتون ناعم',
                                    categoryId: 4,
                                    brandId: 401,
                                    expanded: false,
                                    products: [
                                          {
                                                id: 4001,
                                                sku: '8712566123456',
                                                name: 'ليبتون شاي ناعم أحمر 250 جم',
                                                productGroupId: 4011,
                                                sellingPrice: 75.0,
                                                buyingPrice: 62.0,
                                                price0: 62.0,
                                                price1: 75.0,
                                                vendorCode: 'VND-LP-01',
                                                stock: 55,
                                                minStock: 10,
                                                maxStock: 100,
                                                type: 'inventory',
                                                status: 'active'
                                          }
                                    ]
                              }
                        ]
                  }
            ],
            directGroups: [
                  {
                        id: 4099,
                        code: '1505',
                        name: 'سكر وأرز معبأ',
                        categoryId: 4,
                        brandId: null,
                        expanded: false,
                        products: [
                              {
                                    id: 4002,
                                    sku: '6228880002222',
                                    name: 'سكر أبيض ناصع معبأ 1 كجم',
                                    productGroupId: 4099,
                                    sellingPrice: 35.0,
                                    buyingPrice: 30.0,
                                    price0: 30.0,
                                    price1: 35.0,
                                    vendorCode: 'VND-SC-01',
                                    stock: 150,
                                    minStock: 25,
                                    maxStock: 300,
                                    type: 'inventory',
                                    status: 'active'
                              },
                              {
                                    id: 4003,
                                    sku: '6228880002223',
                                    name: 'أرز مصري درجة أولى 1 كجم',
                                    productGroupId: 4099,
                                    sellingPrice: 32.0,
                                    buyingPrice: 27.0,
                                    price0: 27.0,
                                    price1: 32.0,
                                    vendorCode: 'VND-RC-01',
                                    stock: 90,
                                    minStock: 20,
                                    maxStock: 200,
                                    type: 'inventory',
                                    status: 'active'
                              }
                        ]
                  }
            ]
      }
];

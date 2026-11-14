/// <reference types="jasmine" />

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { ProductStateService } from './product-state.service';
import { ProductApiService } from './product-api.service';
import { ProductCatalogStore } from '../../../../core/products/services/product-catalog.store';
import type { CatalogProduct } from '../../../../core/products/models/catalog-product.model';

describe('ProductStateService Cascading Filters', () => {
  let service: ProductStateService;
  let mockCatalogProducts: CatalogProduct[];
  let mockSkeletonTree: any[];

  beforeEach(() => {
    // Hierarchy Skeleton:
    // Category 1: "Beverages"
    //   - Brand 10: "PepsiCo"
    //       - Group 100: "Cola"
    //       - Group 101: "Juice"
    //   - Brand 11: "Nestle"
    //       - Group 102: "Water"
    //   - DirectGroup 103: "General Drinks" (brandId = null)
    // Category 2: "Snacks"
    //   - Brand 20: "Lays"
    //       - Group 200: "Potato Chips"
    mockSkeletonTree = [
      {
        id: 1,
        code: 'CAT-BEV',
        name: 'مشروبات',
        brands: [
          {
            id: 10,
            code: 'BRD-PEP',
            name: 'بيبسي',
            categoryId: 1,
            groups: [
              { id: 100, code: 'GRP-COLA', name: 'كولا', brandId: 10, categoryId: 1 },
              { id: 101, code: 'GRP-JUICE', name: 'عصائر', brandId: 10, categoryId: 1 }
            ]
          },
          {
            id: 11,
            code: 'BRD-NES',
            name: 'نستله',
            categoryId: 1,
            groups: [
              { id: 102, code: 'GRP-WATER', name: 'مياه', brandId: 11, categoryId: 1 }
            ]
          }
        ],
        directGroups: [
          { id: 103, code: 'GRP-DIR', name: 'مشروبات عامة', brandId: null, categoryId: 1 }
        ]
      },
      {
        id: 2,
        code: 'CAT-SNK',
        name: 'سناكس',
        brands: [
          {
            id: 20,
            code: 'BRD-LAY',
            name: 'ليز',
            categoryId: 2,
            groups: [
              { id: 200, code: 'GRP-CHIP', name: 'شيبس', brandId: 20, categoryId: 2 }
            ]
          }
        ],
        directGroups: []
      }
    ];

    mockCatalogProducts = [
      {
        id: 1,
        name: 'بيبسي كانز 330 مل',
        barcode: '111001',
        costPrice: 5,
        sellingPrice: 10,
        buyingPrice: 5,
        stockQuantity: 50,
        categoryId: 1,
        productGroupId: 100, // Pepsi -> Cola
        isActive: true,
        status: 'active',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 2,
        name: 'عصير برتقال تروبيكانا',
        barcode: '111002',
        costPrice: 8,
        sellingPrice: 15,
        buyingPrice: 8,
        stockQuantity: 30,
        categoryId: 1,
        productGroupId: 101, // Pepsi -> Juice
        isActive: true,
        status: 'active',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 3,
        name: 'مياه نستله 600 مل',
        barcode: '111003',
        costPrice: 3,
        sellingPrice: 6,
        buyingPrice: 3,
        stockQuantity: 100,
        categoryId: 1,
        productGroupId: 102, // Nestle -> Water
        isActive: true,
        status: 'active',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 4,
        name: 'مشروب شعير مباشر',
        barcode: '111004',
        costPrice: 6,
        sellingPrice: 12,
        buyingPrice: 6,
        stockQuantity: 20,
        categoryId: 1,
        productGroupId: 103, // Direct group under category 1 (no brand)
        isActive: true,
        status: 'active',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 5,
        name: 'شيبس ليز بالجبنة',
        barcode: '222001',
        costPrice: 7,
        sellingPrice: 14,
        buyingPrice: 7,
        stockQuantity: 40,
        categoryId: 2,
        productGroupId: 200, // Lays -> Chips
        isActive: true,
        status: 'active',
        createdAt: '',
        updatedAt: ''
      }
    ];

    const productsSignal = signal<CatalogProduct[]>(mockCatalogProducts);

    const mockCatalogStore = {
      products: productsSignal,
      isLoading: signal(false),
      loadCatalog: () => of(mockCatalogProducts),
      removeProduct: jasmine.createSpy('removeProduct')
    };

    const mockProductApi = {
      getHierarchySkeleton: () => of({ tree: mockSkeletonTree, statistics: {} }),
      deleteProduct: () => of(void 0)
    };

    TestBed.configureTestingModule({
      providers: [
        ProductStateService,
        { provide: ProductCatalogStore, useValue: mockCatalogStore },
        { provide: ProductApiService, useValue: mockProductApi }
      ]
    });

    service = TestBed.inject(ProductStateService);
    // Initialize skeleton
    service.loadSkeleton();
  });

  it('should initialize and build skeleton lookups correctly', () => {
    expect(service.categories().length).toBe(2);
    expect(service.groupToBrandMap().get('100')).toBe('10');
    expect(service.groupToBrandMap().get('101')).toBe('10');
    expect(service.groupToBrandMap().get('102')).toBe('11');
    expect(service.groupToBrandMap().get('200')).toBe('20');
    expect(service.groupToBrandMap().has('103')).toBeFalse(); // direct group has no brand
  });

  describe('Validation Requirement 1: Category filter alone', () => {
    it('should display only products belonging to the selected category', () => {
      service.setSelectedCategories([1]);

      const filtered = service.filteredProducts();
      expect(filtered.length).toBe(4);
      expect(filtered.map(p => p.id)).toEqual([1, 2, 3, 4]);

      // Category 2
      service.setSelectedCategories([2]);
      const cat2Filtered = service.filteredProducts();
      expect(cat2Filtered.length).toBe(1);
      expect(cat2Filtered[0].id).toBe(5);
    });
  });

  describe('Validation Requirement 2: Brand filter in combination and individually', () => {
    it('should display products matching both selected category and brand', () => {
      // Select Category 1 ("Beverages")
      service.setSelectedCategories([1]);
      // Select Brand 10 ("Pepsi")
      service.setSelectedBrands([10]);

      const filtered = service.filteredProducts();
      expect(filtered.length).toBe(2);
      expect(filtered.map(p => p.id)).toEqual([1, 2]); // Pepsi Cola & Pepsi Juice

      // Select Brand 11 ("Nestle")
      service.setSelectedBrands([11]);
      const nestleFiltered = service.filteredProducts();
      expect(nestleFiltered.length).toBe(1);
      expect(nestleFiltered[0].id).toBe(3); // Nestle Water
    });

    it('should filter by brand individually without category selection', () => {
      // No category selected, select Brand 20 ("Lays")
      service.setSelectedBrands([20]);

      const filtered = service.filteredProducts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(5);
    });

    it('should display available brands constrained by selected category', () => {
      // When no category selected, all brands are available
      expect(service.availableBrands().map(b => b.id)).toEqual([10, 11, 20]);

      // When Category 1 is selected, only brands under Category 1 are available
      service.setSelectedCategories([1]);
      expect(service.availableBrands().map(b => b.id)).toEqual([10, 11]);

      // When Category 2 is selected, only brands under Category 2 are available
      service.setSelectedCategories([2]);
      expect(service.availableBrands().map(b => b.id)).toEqual([20]);
    });
  });

  describe('Validation Requirement 3: Product Group filter', () => {
    it('should narrow results matching category, brand, and product group', () => {
      service.setSelectedCategories([1]);
      service.setSelectedBrands([10]);
      service.setSelectedProductGroups([100]); // Cola only

      const filtered = service.filteredProducts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(1);
      expect(filtered[0].name).toBe('بيبسي كانز 330 مل');
    });

    it('should filter by product group individually', () => {
      service.setSelectedProductGroups([102]); // Water

      const filtered = service.filteredProducts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(3);
    });

    it('should constrain available groups by category and brand', () => {
      // Category 1, Brand 10 -> only groups 100, 101
      service.setSelectedCategories([1]);
      service.setSelectedBrands([10]);
      expect(service.availableGroups().map(g => g.id)).toEqual([100, 101]);

      // Category 1, Brand 11 -> only group 102
      service.setSelectedBrands([11]);
      expect(service.availableGroups().map(g => g.id)).toEqual([102]);

      // Category 1, no brand -> groups 103 (direct), 100, 101, 102
      service.setSelectedBrands([]);
      expect(service.availableGroups().map(g => g.id)).toEqual([103, 100, 101, 102]);
    });
  });

  describe('Validation Requirement 4: Cascading dependency updates and clearing', () => {
    it('should reset dependent brands and groups when Category is cleared', () => {
      service.setSelectedCategories([1]);
      service.setSelectedBrands([10]);
      service.setSelectedProductGroups([100]);

      expect(service.selectedBrands()).toEqual([10]);
      expect(service.selectedProductGroups()).toEqual([100]);

      // Clear category
      service.setSelectedCategories([]);

      expect(service.selectedCategories()).toEqual([]);
      expect(service.selectedBrands()).toEqual([]);
      expect(service.selectedProductGroups()).toEqual([]);
      expect(service.filteredProducts().length).toBe(5);
    });

    it('should prune invalid brands and groups when Category changes', () => {
      service.setSelectedCategories([1]);
      service.setSelectedBrands([10]); // Pepsi (in cat 1)
      service.setSelectedProductGroups([100]); // Cola (in cat 1)

      // Switch to Category 2 (Snacks)
      service.setSelectedCategories([2]);

      // Brand 10 is not in Category 2, so it must be pruned
      expect(service.selectedBrands()).toEqual([]);
      // Group 100 is not in Category 2, so it must be pruned
      expect(service.selectedProductGroups()).toEqual([]);
      expect(service.filteredProducts().length).toBe(1);
      expect(service.filteredProducts()[0].id).toBe(5);
    });

    it('should reset dependent group when Brand is cleared', () => {
      service.setSelectedCategories([1]);
      service.setSelectedBrands([10]);
      service.setSelectedProductGroups([100]);

      // Clear Brand
      service.setSelectedBrands([]);

      expect(service.selectedBrands()).toEqual([]);
      expect(service.selectedProductGroups()).toEqual([]);
      // Category 1 still active -> all 4 products in Category 1
      expect(service.filteredProducts().length).toBe(4);
    });

    it('should prune invalid group when Brand changes', () => {
      service.setSelectedCategories([1]);
      service.setSelectedBrands([10]); // Pepsi
      service.setSelectedProductGroups([100]); // Cola under Pepsi

      // Change brand to 11 (Nestle)
      service.setSelectedBrands([11]);

      expect(service.selectedBrands()).toEqual([11]);
      // Group 100 is under Pepsi, not Nestle, so it must be pruned
      expect(service.selectedProductGroups()).toEqual([]);
      expect(service.filteredProducts().length).toBe(1);
      expect(service.filteredProducts()[0].id).toBe(3);
    });
  });

  describe('Validation Requirement 5: Integration with other filters', () => {
    it('should preserve search, status, and range filtering in combination with cascading filters', () => {
      service.setSelectedCategories([1]);
      service.setSelectedBrands([10]);
      service.setSearchQuery('كانز');

      const filtered = service.filteredProducts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(1);

      // Search mismatch
      service.setSearchQuery('غير موجود');
      expect(service.filteredProducts().length).toBe(0);

      // Clear search
      service.setSearchQuery('');
      expect(service.filteredProducts().length).toBe(2);

      // Price filter
      service.setAdvancedFilters({ sellingPriceMin: 12 });
      expect(service.filteredProducts().length).toBe(1);
      expect(service.filteredProducts()[0].id).toBe(2); // Tropicana priced 15
    });

    it('should clear all filters correctly via clearFilters()', () => {
      service.setSelectedCategories([1]);
      service.setSelectedBrands([10]);
      service.setSelectedProductGroups([100]);
      service.setSearchQuery('بيبسي');
      service.setSearchNameQuery('كانز');
      service.setSearchBarcodeQuery('111001');

      service.clearFilters();

      expect(service.selectedCategories()).toEqual([]);
      expect(service.selectedBrands()).toEqual([]);
      expect(service.selectedProductGroups()).toEqual([]);
      expect(service.searchQuery()).toBe('');
      expect(service.searchNameQuery()).toBe('');
      expect(service.searchBarcodeQuery()).toBe('');
      expect(service.filteredProducts().length).toBe(5);
    });
  });

  describe('Validation Requirement 6: Independent Search by Product Name and Barcode', () => {
    it('should search products exclusively by name when searchNameQuery is set', () => {
      service.setSearchNameQuery('عصير');
      let filtered = service.filteredProducts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(2);
      expect(filtered[0].name).toBe('عصير برتقال تروبيكانا');

      // Searching barcode value in name search should NOT match
      service.setSearchNameQuery('111002');
      filtered = service.filteredProducts();
      expect(filtered.length).toBe(0);

      // Substring case-insensitive match
      service.setSearchNameQuery('مياه');
      filtered = service.filteredProducts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(3);
    });

    it('should search products exclusively by barcode when searchBarcodeQuery is set', () => {
      service.setSearchBarcodeQuery('111003');
      let filtered = service.filteredProducts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(3);
      expect(filtered[0].name).toBe('مياه نستله 600 مل');

      // Partial barcode match (contains mode by default)
      service.setSearchBarcodeQuery('111', 'contains');
      filtered = service.filteredProducts();
      expect(filtered.length).toBe(4); // 111001, 111002, 111003, 111004

      // Exact barcode match
      service.setSearchBarcodeQuery('111', 'exact');
      filtered = service.filteredProducts();
      expect(filtered.length).toBe(0); // no exact match for '111'

      service.setSearchBarcodeQuery('111001', 'exact');
      filtered = service.filteredProducts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(1);

      // Searching name in barcode search should NOT match
      service.setSearchBarcodeQuery('نستله');
      filtered = service.filteredProducts();
      expect(filtered.length).toBe(0);
    });

    it('should check if exact barcode exists in catalog correctly via hasExactBarcodeMatch', () => {
      expect(service.hasExactBarcodeMatch('111001')).toBeTrue();
      expect(service.hasExactBarcodeMatch('222001')).toBeTrue();
      expect(service.hasExactBarcodeMatch('111')).toBeFalse();
      expect(service.hasExactBarcodeMatch('999999')).toBeFalse();
      expect(service.hasExactBarcodeMatch('')).toBeFalse();
    });

    it('should filter correctly when both name and barcode searches are used together', () => {
      // Both match product 1 ('بيبسي كانز 330 مل', '111001')
      service.setSearchNameQuery('بيبسي');
      service.setSearchBarcodeQuery('111001');
      let filtered = service.filteredProducts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(1);

      // Name matches product 1, but barcode matches product 2 ('111002') -> 0 results
      service.setSearchBarcodeQuery('111002');
      filtered = service.filteredProducts();
      expect(filtered.length).toBe(0);
    });

    it('should report active filters correctly for name and barcode searches', () => {
      expect(service.hasActiveFilters()).toBeFalse();

      service.setSearchNameQuery('شيبس');
      expect(service.hasActiveFilters()).toBeTrue();

      service.setSearchNameQuery('');
      expect(service.hasActiveFilters()).toBeFalse();

      service.setSearchBarcodeQuery('222001');
      expect(service.hasActiveFilters()).toBeTrue();

      service.setSearchBarcodeQuery('');
      expect(service.hasActiveFilters()).toBeFalse();
    });
  });
});

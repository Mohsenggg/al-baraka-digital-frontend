import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ProductTreeViewComponent } from './product-tree-view.component';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NotificationService } from '../../../../../../shared/services/notification.service';
import { ConfirmService } from '../../../../../../shared/services/confirm.service';
import {
      BrandNode,
      CategoryNode,
      INITIAL_MOCK_TREE_DATA,
      ProductGroupNode
} from './models/product-tree.models';

interface GroupContext {
      category: CategoryNode;
      brand: BrandNode | null;
      group: ProductGroupNode;
}

interface BrandContext {
      category: CategoryNode;
      brand: BrandNode;
}

describe('ProductTreeViewComponent', () => {
      let component: ProductTreeViewComponent;
      let fixture: ComponentFixture<ProductTreeViewComponent>;
      let httpMock: HttpTestingController;

      beforeEach(async () => {
            await TestBed.configureTestingModule({
                  imports: [ProductTreeViewComponent, RouterTestingModule],
                  providers: [
                        provideHttpClient(),
                        provideHttpClientTesting()
                  ]
            }).compileComponents();

            fixture = TestBed.createComponent(ProductTreeViewComponent);
            component = fixture.componentInstance;
            httpMock = TestBed.inject(HttpTestingController);
            fixture.detectChanges();

            // The tree is loaded on init: answer the pending request with the shared mock tree.
            const mockTree: CategoryNode[] = JSON.parse(JSON.stringify(INITIAL_MOCK_TREE_DATA));
            httpMock
                  .expectOne(request => request.url.includes('/products/tree'))
                  .flush({ tree: mockTree, statistics: {} });
            fixture.detectChanges();
      });

      afterEach(() => {
            httpMock.verify();
      });

      /** First product group of the mock tree that actually contains products. */
      function findGroupContext(): GroupContext {
            for (const category of component.treeData()) {
                  for (const group of category.directGroups || []) {
                        if ((group.products || []).length > 0) return { category, brand: null, group };
                  }
                  for (const brand of category.brands || []) {
                        for (const group of brand.groups || []) {
                              if ((group.products || []).length > 0) return { category, brand, group };
                        }
                  }
            }
            throw new Error('No product group holding products was found in the mock tree');
      }

      /** First brand of the mock tree that owns at least one populated group. */
      function findBrandContext(): BrandContext {
            for (const category of component.treeData()) {
                  for (const brand of category.brands || []) {
                        const hasProducts = (brand.groups || []).some(group => (group.products || []).length > 0);
                        if (hasProducts) return { category, brand };
                  }
            }
            throw new Error('No brand holding products was found in the mock tree');
      }

      /**
       * Builds a deterministic two-product group, so selection assertions do not depend
       * on how many products the shared mock tree happens to contain.
       */
      function createTwoProductGroup(seed: number = 0): ProductGroupNode {
            const { group } = findGroupContext();
            const sourceProduct = group.products[0];
            const id = `test-group-${seed}`;

            return {
                  ...group,
                  id,
                  name: `${group.name} (اختبار)`,
                  products: [
                        { ...sourceProduct, id: `test-product-${seed}-1`, productGroupId: id },
                        { ...sourceProduct, id: `test-product-${seed}-2`, productGroupId: id }
                  ]
            };
      }

      /** Replaces the tree with a minimal one that holds a single empty (deletable) group. */
      function setTreeWithEmptyGroup(): ProductGroupNode {
            const emptyGroup: ProductGroupNode = {
                  id: 9101,
                  code: '9101',
                  name: 'مجموعة فارغة',
                  categoryId: 9001,
                  brandId: null,
                  products: [],
                  expanded: false
            };

            component.treeData.set([
                  {
                        id: 9001,
                        code: '90',
                        name: 'قسم اختبار',
                        brands: [],
                        directGroups: [emptyGroup],
                        expanded: true
                  }
            ]);

            return emptyGroup;
      }

      it('should create the ProductTreeViewComponent', () => {
            expect(component).toBeTruthy();
      });

      it('should have initial mock categories loaded', () => {
            const data = component.treeData();
            expect(data.length).toBeGreaterThan(0);
            expect(component.stats().totalProducts).toBeGreaterThan(0);
      });

      it('should support categories with direct groups without brands (e.g. سوائل ومنظفات)', () => {
            const liquidsCategory = component.treeData().find(c => c.code === '08');
            expect(liquidsCategory).toBeDefined();
            expect(liquidsCategory?.brands.length).toBe(0);
            expect(liquidsCategory?.directGroups.length).toBeGreaterThan(0);
            const vanishGroup = liquidsCategory?.directGroups.find(g => g.code === '083');
            expect(vanishGroup?.brandId).toBeNull();
            expect(vanishGroup?.products.length).toBeGreaterThan(0);
      });

      it('should expand all nodes when expandAll() is called', () => {
            component.expandAll();
            const data = component.treeData();
            for (const cat of data) {
                  expect(cat.expanded).toBeTrue();
                  for (const b of cat.brands) {
                        expect(b.expanded).toBeTrue();
                        for (const g of b.groups) {
                              expect(g.expanded).toBeTrue();
                        }
                  }
                  for (const g of cat.directGroups) {
                        expect(g.expanded).toBeTrue();
                  }
            }
      });

      it('should collapse all nodes when collapseAll() is called', () => {
            component.collapseAll();
            const data = component.treeData();
            for (const cat of data) {
                  expect(cat.expanded).toBeFalse();
                  for (const b of cat.brands) {
                        expect(b.expanded).toBeFalse();
                        for (const g of b.groups) {
                              expect(g.expanded).toBeFalse();
                        }
                  }
                  for (const g of cat.directGroups) {
                        expect(g.expanded).toBeFalse();
                  }
            }
      });

      it('should filter tree when search query is entered', () => {
            component.searchQuery.set('لافندر');
            fixture.detectChanges();
            const filtered = component.filteredTree();
            expect(filtered.length).toBeGreaterThan(0);
            const ArielCat = filtered.find(c => c.name.includes('مساحيق'));
            expect(ArielCat).toBeDefined();
            expect(ArielCat?.expanded).toBeTrue();
      });

      it('should clear all filters when clearAllFilters() is called', () => {
            component.searchQuery.set('فانش');
            component.selectedCategoryId.set('2');
            component.selectedStockFilter.set('low');
            expect(component.hasActiveFilters()).toBeTrue();

            component.clearAllFilters();
            expect(component.searchQuery()).toBe('');
            expect(component.selectedCategoryId()).toBe('');
            expect(component.selectedStockFilter()).toBe('');
            expect(component.hasActiveFilters()).toBeFalse();
      });

      describe('Edit Mode rendering (Task 4)', () => {
            it('should render the node action buttons only while edit mode is active', () => {
                  component.expandAll();
                  component.toggleEditMode();
                  fixture.detectChanges();

                  expect(fixture.debugElement.queryAll(By.css('.node-edit-actions')).length).toBeGreaterThan(0);

                  component.toggleEditMode();
                  fixture.detectChanges();

                  expect(fixture.debugElement.queryAll(By.css('.node-edit-actions')).length).toBe(0);
            });

            it('should render the product selection checkbox column only while edit mode is active', () => {
                  component.expandAll();
                  component.toggleEditMode();
                  fixture.detectChanges();

                  expect(fixture.debugElement.queryAll(By.css('th.col-tree-select')).length).toBeGreaterThan(0);
                  expect(fixture.debugElement.queryAll(By.css('td.col-tree-select')).length).toBeGreaterThan(0);

                  component.toggleEditMode();
                  fixture.detectChanges();

                  expect(fixture.debugElement.queryAll(By.css('th.col-tree-select')).length).toBe(0);
                  expect(fixture.debugElement.queryAll(By.css('td.col-tree-select')).length).toBe(0);
            });

            it('should show the edit mode badge and the selection counter while editing', () => {
                  component.toggleEditMode();
                  fixture.detectChanges();
                  expect(fixture.debugElement.queryAll(By.css('.edit-pill-badge')).length).toBe(1);

                  component.selectAllInGroup(createTwoProductGroup());
                  fixture.detectChanges();
                  expect(fixture.debugElement.queryAll(By.css('.floating-bulk-bar')).length).toBe(1);
                  expect(fixture.debugElement.queryAll(By.css('.bulk-count')).length).toBe(1);

                  component.toggleEditMode();
                  fixture.detectChanges();
                  expect(fixture.debugElement.queryAll(By.css('.edit-pill-badge')).length).toBe(0);
                  expect(fixture.debugElement.queryAll(By.css('.floating-bulk-bar')).length).toBe(0);
                  expect(fixture.debugElement.queryAll(By.css('.bulk-count')).length).toBe(0);
            });
      });

      describe('Edit Mode bulk product selection (Task 4)', () => {
            it('should start with edit mode disabled and an empty selection', () => {
                  expect(component.isEditMode()).toBeFalse();
                  expect(component.selectedProductsCount()).toBe(0);
            });

            it('should enable edit mode on toggle and reset the selection when leaving it', () => {
                  component.toggleEditMode();
                  expect(component.isEditMode()).toBeTrue();

                  const { group } = findGroupContext();
                  component.toggleProductSelection(group.products[0].id);
                  expect(component.selectedProductsCount()).toBe(1);

                  component.toggleEditMode();
                  expect(component.isEditMode()).toBeFalse();
                  expect(component.selectedProductsCount()).toBe(0);
            });

            it('should toggle a single product selection on and off', () => {
                  const { group } = findGroupContext();
                  const productId = group.products[0].id;

                  component.toggleProductSelection(productId);
                  expect(component.isProductSelected(productId)).toBeTrue();

                  component.toggleProductSelection(productId);
                  expect(component.isProductSelected(productId)).toBeFalse();
                  expect(component.selectedProductsCount()).toBe(0);
            });

            it('should select and deselect every product of a group', () => {
                  const group = createTwoProductGroup();

                  component.selectAllInGroup(group);
                  expect(component.isGroupAllSelected(group)).toBeTrue();
                  expect(component.isGroupPartiallySelected(group)).toBeFalse();
                  expect(component.selectedProductsCount()).toBe(2);

                  component.selectAllInGroup(group);
                  expect(component.isGroupAllSelected(group)).toBeFalse();
                  expect(component.selectedProductsCount()).toBe(0);
            });

            it('should flag a group as partially selected', () => {
                  const group = createTwoProductGroup();

                  component.toggleProductSelection(group.products[0].id);

                  expect(component.isGroupPartiallySelected(group)).toBeTrue();
                  expect(component.isGroupAllSelected(group)).toBeFalse();
            });

            it('should accumulate the selection across different groups', () => {
                  const groupA = createTwoProductGroup(1);
                  const groupB = createTwoProductGroup(2);

                  component.selectAllInGroup(groupA);
                  component.toggleProductSelection(groupB.products[0].id);

                  expect(component.selectedProductsCount()).toBe(3);
                  expect(component.isProductSelected(groupB.products[0].id)).toBeTrue();
            });

            it('should clear the whole selection with clearSelection()', () => {
                  component.selectAllInGroup(createTwoProductGroup());

                  component.clearSelection();

                  expect(component.selectedProductsCount()).toBe(0);
            });
      });

      describe('Node rename (Task 5)', () => {
            it('should open the rename dialog pre-filled with the current name', () => {
                  const category = component.treeData()[0];

                  component.openRenameCategory(category);

                  expect(component.renameTarget()?.type).toBe('category');
                  expect(component.renameTarget()?.id).toBe(category.id);
                  expect(component.renameValue()).toBe(category.name);
                  expect(component.renameError()).toBeNull();
            });

            it('should reject a blank or too short name without calling the API', () => {
                  component.openRenameCategory(component.treeData()[0]);

                  component.renameValue.set('   ');
                  component.submitRename();
                  expect(component.renameError()).toBeTruthy();

                  component.renameValue.set('أ');
                  component.submitRename();
                  expect(component.renameError()).toContain('2');

                  httpMock.expectNone(request => request.method === 'PATCH');
            });

            it('should reject a duplicated name inside the same scope', () => {
                  const [firstCategory, secondCategory] = component.treeData();

                  component.openRenameCategory(firstCategory);
                  component.renameValue.set(`  ${secondCategory.name}  `);
                  component.submitRename();

                  expect(component.renameError()).toContain('يوجد عنصر آخر بنفس الاسم');
                  httpMock.expectNone(request => request.method === 'PATCH');
            });

            it('should PATCH the category rename endpoint and update the tree locally', () => {
                  const category = component.treeData()[0];

                  component.openRenameCategory(category);
                  component.renameValue.set('قسم محدث');
                  component.submitRename();

                  const request = httpMock.expectOne(`/api/products/tree/categories/${category.id}/rename`);
                  expect(request.request.method).toBe('PATCH');
                  expect(request.request.body).toEqual({ name: 'قسم محدث' });
                  request.flush(null);

                  expect(component.treeData()[0].name).toBe('قسم محدث');
                  expect(component.renameTarget()).toBeNull();
                  expect(component.isRenameSaving()).toBeFalse();
            });

            it('should PATCH the brand rename endpoint for brand nodes', () => {
                  const { category, brand } = findBrandContext();
                  const updatedName = 'علامة تجارية محدثة';

                  component.openRenameBrand(category, brand);
                  component.renameValue.set(updatedName);
                  component.submitRename();

                  const request = httpMock.expectOne(`/api/products/tree/brands/${brand.id}/rename`);
                  expect(request.request.method).toBe('PATCH');
                  request.flush(null);

                  const brands = component.treeData().find(item => item.id === category.id)?.brands || [];
                  expect(brands.find(item => item.id === brand.id)?.name).toBe(updatedName);
            });

            it('should PATCH the group rename endpoint for group nodes', () => {
                  const { category, brand, group } = findGroupContext();
                  const updatedName = 'مجموعة محدثة';

                  component.openRenameGroup(category, brand, group);
                  component.renameValue.set(updatedName);
                  component.submitRename();

                  const request = httpMock.expectOne(`/api/products/tree/groups/${group.id}/rename`);
                  expect(request.request.method).toBe('PATCH');
                  request.flush(null);

                  expect(component.renameTarget()).toBeNull();
                  expect(component.renameValue()).toBe('');
            });

            it('should keep the dialog open and surface the backend error message', () => {
                  const category = component.treeData()[0];

                  component.openRenameCategory(category);
                  component.renameValue.set('اسم جديد تماماً');
                  component.submitRename();

                  httpMock
                        .expectOne(`/api/products/tree/categories/${category.id}/rename`)
                        .flush({ message: 'Cannot rename Category' }, { status: 409, statusText: 'Conflict' });

                  expect(component.renameError()).toBe('Cannot rename Category');
                  expect(component.renameTarget()).not.toBeNull();
            });

            it('should close the dialog without a request when the name is unchanged', () => {
                  const category = component.treeData()[0];

                  component.openRenameCategory(category);
                  component.renameValue.set(`  ${category.name}  `);
                  component.submitRename();

                  expect(component.renameTarget()).toBeNull();
                  httpMock.expectNone(request => request.method === 'PATCH');
            });
      });

      describe('Node deletion (Task 5)', () => {
            it('should refuse deletion for any node that still has children', () => {
                  const { category, group } = findGroupContext();
                  const brandContext = findBrandContext();

                  expect(component.isNodeDeletable('category', category.id)).toBeFalse();
                  expect(component.isNodeDeletable('brand', brandContext.brand.id)).toBeFalse();
                  expect(component.isNodeDeletable('group', group.id)).toBeFalse();
            });

            it('should block the delete request and warn the user when the node is not empty', () => {
                  const notify = TestBed.inject(NotificationService);
                  const warningSpy = spyOn(notify, 'warning');
                  const confirmSpy = spyOn(TestBed.inject(ConfirmService), 'confirm');
                  const { category, brand, group } = findGroupContext();

                  component.openDeleteGroup(category, brand, group);

                  expect(confirmSpy).not.toHaveBeenCalled();
                  expect(warningSpy).toHaveBeenCalled();
                  httpMock.expectNone(request => request.method === 'DELETE');
            });

            it('should delete an empty group and drop it from the tree', async () => {
                  const emptyGroup = setTreeWithEmptyGroup();

                  expect(component.isNodeDeletable('group', emptyGroup.id)).toBeTrue();
                  expect(component.isNodeDeletable('category', 9001)).toBeFalse();

                  const notify = TestBed.inject(NotificationService);
                  const successSpy = spyOn(notify, 'success');
                  spyOn(TestBed.inject(ConfirmService), 'confirm').and.returnValue(Promise.resolve(true));

                  component.openDeleteGroup(component.treeData()[0], null, emptyGroup);
                  await fixture.whenStable();

                  const request = httpMock.expectOne(`/api/products/tree/groups/${emptyGroup.id}`);
                  expect(request.request.method).toBe('DELETE');
                  request.flush(null);

                  expect(successSpy).toHaveBeenCalled();
                  expect(component.treeData()[0].directGroups.length).toBe(0);
                  expect(component.isNodeDeletable('category', 9001)).toBeTrue();
            });

            it('should delete an empty brand and drop it from the tree', async () => {
                  component.treeData.set([
                        {
                              id: 9200,
                              code: '92',
                              name: 'قسم بعلامة فارغة',
                              expanded: true,
                              directGroups: [],
                              brands: [
                                    {
                                          id: 9201,
                                          code: '9201',
                                          name: 'علامة فارغة',
                                          categoryId: 9200,
                                          expanded: false,
                                          groups: []
                                    }
                              ]
                        }
                  ]);

                  expect(component.isNodeDeletable('brand', 9201)).toBeTrue();
                  expect(component.isNodeDeletable('category', 9200)).toBeFalse();

                  spyOn(TestBed.inject(ConfirmService), 'confirm').and.returnValue(Promise.resolve(true));

                  const category = component.treeData()[0];
                  component.openDeleteBrand(category, category.brands[0]);
                  await fixture.whenStable();

                  const request = httpMock.expectOne('/api/products/tree/brands/9201');
                  expect(request.request.method).toBe('DELETE');
                  request.flush(null);

                  expect(component.treeData()[0].brands.length).toBe(0);
                  expect(component.isNodeDeletable('category', 9200)).toBeTrue();
            });

            it('should not call the API when the confirmation is dismissed', async () => {
                  const emptyGroup = setTreeWithEmptyGroup();
                  spyOn(TestBed.inject(ConfirmService), 'confirm').and.returnValue(Promise.resolve(false));

                  component.openDeleteGroup(component.treeData()[0], null, emptyGroup);
                  await fixture.whenStable();

                  expect(component.treeData()[0].directGroups.length).toBe(1);
                  httpMock.expectNone(request => request.method === 'DELETE');
            });

            it('should report the backend error when the delete is rejected', async () => {
                  const emptyGroup = setTreeWithEmptyGroup();
                  const notify = TestBed.inject(NotificationService);
                  const errorSpy = spyOn(notify, 'error');
                  spyOn(TestBed.inject(ConfirmService), 'confirm').and.returnValue(Promise.resolve(true));

                  component.openDeleteGroup(component.treeData()[0], null, emptyGroup);
                  await fixture.whenStable();

                  httpMock
                        .expectOne(`/api/products/tree/groups/${emptyGroup.id}`)
                        .flush({ message: 'Cannot delete Product Group containing products' },
                              { status: 409, statusText: 'Conflict' });

                  expect(errorSpy).toHaveBeenCalledWith('Cannot delete Product Group containing products');
                  expect(component.treeData()[0].directGroups.length).toBe(1);
            });
      });

      describe('Group price unification (Phase 3)', () => {
            /** Replaces the tree with a category holding one price-unification test group. */
            function setTreeWithPriceGroup(isPriceUnified: boolean): ProductGroupNode {
                  const group = createTwoProductGroup(7);
                  const unifiedGroup: ProductGroupNode = { ...group, isPriceUnified };

                  component.treeData.set([
                        {
                              id: 9300,
                              code: '93',
                              name: 'قسم الأسعار',
                              brands: [],
                              directGroups: [unifiedGroup],
                              expanded: true
                        }
                  ]);

                  return unifiedGroup;
            }

            it('should render the unified price badge only for flagged groups', () => {
                  component.expandAll();
                  fixture.detectChanges();
                  expect(fixture.debugElement.queryAll(By.css('.unified-price-tag')).length).toBe(0);

                  setTreeWithPriceGroup(true);
                  fixture.detectChanges();

                  const tags = fixture.debugElement.queryAll(By.css('.unified-price-tag'));
                  expect(tags.length).toBe(1);
                  expect(tags[0].nativeElement.textContent).toContain('سعر موحد');
            });

            it('should PATCH the price unification endpoint and update the group locally', () => {
                  const group = setTreeWithPriceGroup(false);
                  const successSpy = spyOn(TestBed.inject(NotificationService), 'success');

                  component.toggleGroupPriceUnification(group);

                  const request = httpMock.expectOne(`/api/products/tree/groups/${group.id}/price-unification`);
                  expect(request.request.method).toBe('PATCH');
                  expect(request.request.body).toEqual({ isPriceUnified: true });
                  request.flush({ groupId: group.id, isPriceUnified: true, message: 'ok' });

                  expect(component.treeData()[0].directGroups[0].isPriceUnified).toBeTrue();
                  expect(component.nodeActionKey()).toBeNull();
                  expect(successSpy).toHaveBeenCalled();
                  expect(successSpy.calls.mostRecent().args[0]).toContain('لم يتم تعديل الأسعار الحالية');
            });

            it('should toggle the flag off for an already unified group', () => {
                  const group = setTreeWithPriceGroup(true);

                  component.toggleGroupPriceUnification(group);

                  const request = httpMock.expectOne(`/api/products/tree/groups/${group.id}/price-unification`);
                  expect(request.request.body).toEqual({ isPriceUnified: false });
                  request.flush({ groupId: group.id, isPriceUnified: false, message: 'ok' });

                  expect(component.treeData()[0].directGroups[0].isPriceUnified).toBeFalse();
            });

            it('should keep the flag untouched and surface the backend error when the toggle fails', () => {
                  const group = setTreeWithPriceGroup(false);
                  const errorSpy = spyOn(TestBed.inject(NotificationService), 'error');

                  component.toggleGroupPriceUnification(group);

                  httpMock
                        .expectOne(`/api/products/tree/groups/${group.id}/price-unification`)
                        .flush({ message: 'Cannot change price unification' },
                              { status: 409, statusText: 'Conflict' });

                  expect(errorSpy).toHaveBeenCalledWith('Cannot change price unification');
                  expect(component.treeData()[0].directGroups[0].isPriceUnified).toBeFalsy();
                  expect(component.nodeActionKey()).toBeNull();
            });
      });
});

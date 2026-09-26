import { Injectable, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Observable, catchError, finalize, tap, throwError, forkJoin, of } from 'rxjs';
import { ProductApiService } from './product-api.service';
import type {
      NamedEntity,
      ProductAttributeFormValue,
      ProductAttributeOption,
      ProductBarcodeFormValue,
      ProductManagePayload,
      ProductConversionDto,
      BrandTreeNodeDto,
      ProductGroupTreeNodeDto,
      CategoryChildNodesDto,
      ProfitMargin
} from '../models/product.models';
import {
      calculateProfitMargin,
      getBarcodeStockLabel,
      resolveBarcodeStockStatus
} from '../models/product.models';
import type { ProductCompositionDto } from '../models/product-material.models';

@Injectable({
      providedIn: 'root'
})
export class ProductManageStateService {
      private readonly api = inject(ProductApiService);
      private readonly fb = inject(FormBuilder);

      productForm!: FormGroup;

      readonly productId = signal<number | null>(null);
      readonly isEditMode = signal(false);
      readonly isPageLoading = signal(false);
      readonly isSaving = signal(false);
      readonly saveSuccess = signal(false);
      readonly saveError = signal<string | null>(null);
      readonly generatedName = signal('');

      readonly productGroupId = signal<number | string | null>(null);
      readonly productGroupName = signal<string | null>(null);
      readonly isPriceUnified = signal(false);
      readonly initialSellingPrice = signal<number | null>(null);

      private readonly attributesSignal = signal<ProductAttributeOption[]>([]);
      private readonly categoriesSignal = signal<NamedEntity[]>([]);
      private readonly manufacturersSignal = signal<NamedEntity[]>([]);
      private readonly suppliersSignal = signal<NamedEntity[]>([]);
      private readonly brandsSignal = signal<BrandTreeNodeDto[]>([]);
      private readonly productGroupsSignal = signal<ProductGroupTreeNodeDto[]>([]);

      readonly attributes = this.attributesSignal.asReadonly();
      readonly categories = this.categoriesSignal.asReadonly();
      readonly manufacturers = this.manufacturersSignal.asReadonly();
      readonly suppliers = this.suppliersSignal.asReadonly();
      readonly brands = this.brandsSignal.asReadonly();
      readonly productGroups = this.productGroupsSignal.asReadonly();

      readonly selectedBrandId = signal<number | null>(null);
      readonly selectedBrandName = signal<string | null>(null);
      readonly hasNoBrandsForCategory = signal<boolean>(false);
      readonly isHierarchyLoading = signal<boolean>(false);

      readonly pendingAttribute = signal<ProductAttributeOption | null>(null);
      readonly pendingAttributeValue = signal('');
      readonly editingAttributeIndex = signal<number | null>(null);
      readonly attributeEditorError = signal<string | null>(null);

      initialize(): void {
            this.productId.set(null);
            this.isEditMode.set(false);
            this.isSaving.set(false);
            this.saveSuccess.set(false);
            this.saveError.set(null);
            this.generatedName.set('');
            this.productGroupId.set(null);
            this.productGroupName.set(null);
            this.isPriceUnified.set(false);
            this.initialSellingPrice.set(null);
            this.selectedBrandId.set(null);
            this.selectedBrandName.set(null);
            this.hasNoBrandsForCategory.set(false);
            this.brandsSignal.set([]);
            this.productGroupsSignal.set([]);
            this.clearAttributeEditor();
            this.initForm();
            this.addBarcode();
      }

      get compositionFormArray(): FormArray {
            return this.productForm.get('composition') as FormArray;
      }

      get conversionsFormArray(): FormArray {
            return this.productForm.get('conversions') as FormArray;
      }

      get attributesFormArray(): FormArray {
            return this.productForm.get('attributes') as FormArray;
      }

      get barcodesFormArray(): FormArray {
            return this.productForm.get('barcodes') as FormArray;
      }

      get isBaseNameInvalid(): boolean {
            const control = this.productForm.get('baseName');
            return !!(control?.invalid && control.touched);
      }

      get pageTitle(): string {
            return this.isEditMode() ? 'تعديل منتج' : 'اضافة منتج جديد';
      }

      onFormValueChanged(): void {
            this.updateGeneratedName();
            this.syncConversionState();
            this.saveSuccess.set(false);
            this.saveError.set(null);
      }

      resolveEditMode(id: number | null): void {
            if (!id || isNaN(id)) {
                  // Only load lookups if creating a new product
                  this.loadReferenceData();
                  return;
            }

            this.productId.set(id);
            this.isEditMode.set(true);
            this.loadProductForEdit(id);
      }

      private loadReferenceData(): void {
            this.isPageLoading.set(true);
            forkJoin({
                  categories: this.api.getCategories().pipe(catchError(() => of([]))),
                  manufacturers: this.api.getManufacturers().pipe(catchError(() => of([]))),
                  suppliers: this.api.getSuppliers().pipe(catchError(() => of([]))),
                  attributes: this.api.getAttributes().pipe(catchError(() => of([])))
            }).pipe(
                  tap(data => {
                        this.categoriesSignal.set(data.categories);
                        this.manufacturersSignal.set(data.manufacturers);
                        this.suppliersSignal.set(data.suppliers);
                        this.attributesSignal.set(data.attributes);
                  }),
                  finalize(() => this.isPageLoading.set(false))
            ).subscribe();
      }

      loadProductForEdit(id: number): void {
            this.isPageLoading.set(true);

            forkJoin({
                  categories: this.api.getCategories().pipe(catchError(() => of([]))),
                  manufacturers: this.api.getManufacturers().pipe(catchError(() => of([]))),
                  suppliers: this.api.getSuppliers().pipe(catchError(() => of([]))),
                  attributes: this.api.getAttributes().pipe(catchError(() => of([]))),
                  product: this.api.getProductById(id)
            }).pipe(
                  tap(data => {
                        this.categoriesSignal.set(data.categories);
                        this.manufacturersSignal.set(data.manufacturers);
                        this.suppliersSignal.set(data.suppliers);
                        this.attributesSignal.set(data.attributes);
                        
                        this.applyProductDetail(data.product);
                  }),
                  catchError(err => {
                        this.saveError.set(this.extractErrorMessage(err));
                        return throwError(() => err);
                  }),
                  finalize(() => this.isPageLoading.set(false))
            ).subscribe();
      }

      saveProduct(propagateGroupSellingPrice?: boolean): Observable<ProductManagePayload> | null {
            this.productForm.markAllAsTouched();
            this.compositionFormArray.controls.forEach(ctrl => ctrl.markAllAsTouched());
            this.conversionsFormArray.controls.forEach(ctrl => ctrl.markAllAsTouched());

            if (this.productForm.invalid) {
                  this.saveError.set('يرجى تعبئة الحقول المطلوبة بشكل صحيح قبل الحفظ');
                  return null;
            }

            const payload = this.buildProductPayload();
            this.isSaving.set(true);
            this.saveError.set(null);
            this.saveSuccess.set(false);

            const save$ = this.isEditMode() && this.productId()
                  ? this.api.updateProduct(this.productId()!, payload, propagateGroupSellingPrice)
                  : this.api.createProduct(payload);

            return save$.pipe(
                  tap(saved => {
                        this.isSaving.set(false);
                        this.saveSuccess.set(true);
                  }),
                  catchError(err => {
                        this.isSaving.set(false);
                        this.saveError.set(this.extractErrorMessage(err));
                        return throwError(() => err);
                  })
            );
      }

      getCurrentSellingPrice(): number | null {
            const barcodes = this.barcodesFormArray.value;
            if (!barcodes || barcodes.length === 0) return null;
            const defaultBc = barcodes.find((b: any) => b.isDefault) || barcodes[0];
            return defaultBc?.sellingPrice != null ? Number(defaultBc.sellingPrice) : null;
      }

      buildProductPayload(): ProductManagePayload {
            const formValue = this.productForm.value;
            const hasConversion = this.hasConversionRules();

            return {
                  baseName: formValue.baseName,
                  name: this.generatedName() || formValue.baseName,
                  status: formValue.status,
                  attributes: formValue.attributes,
                  barcodes: formValue.barcodes,
                  categoryId: formValue.categoryId,
                  productGroupId: formValue.productGroupId || this.productGroupId() || null,
                  manufacturerId: formValue.manufacturerId,
                  supplierIds: formValue.supplierIds,
                  hasConversion,
                  conversions: hasConversion ? formValue.conversions : [],
                  hasComposition: formValue.hasComposition,
                  composition: formValue.hasComposition ? formValue.composition : []
            };
      }

      updateGeneratedName(): void {
            const baseName = this.productForm.get('baseName')?.value || '';
            const attrs = this.attributesFormArray.value
                  .filter((a: ProductAttributeFormValue) => a.value)
                  .map((a: ProductAttributeFormValue) => a.value)
                  .join(' ');
            const name = `${baseName} ${attrs}`.trim();
            this.generatedName.set(name);
      }

      selectPendingAttribute(attr: ProductAttributeOption): void {
            this.pendingAttribute.set(attr);
            this.attributeEditorError.set(null);
            if (this.editingAttributeIndex() === null) {
                  this.pendingAttributeValue.set('');
            }
      }

      confirmAttributeValue(): void {
            const pending = this.pendingAttribute();
            const value = this.pendingAttributeValue().trim();

            if (!pending) {
                  this.attributeEditorError.set('اختر سمة أولاً');
                  return;
            }
            if (!value) {
                  this.attributeEditorError.set('أدخل قيمة السمة');
                  return;
            }

            const editingIndex = this.editingAttributeIndex();
            const isDuplicate = this.attributesFormArray.controls.some((ctrl, i) => {
                  if (editingIndex !== null && i === editingIndex) return false;
                  return ctrl.get('name')?.value === pending.name;
            });

            if (isDuplicate) {
                  this.attributeEditorError.set('هذه السمة مضافة مسبقاً');
                  return;
            }

            if (editingIndex !== null) {
                  this.attributesFormArray.at(editingIndex).patchValue({
                        id: pending.id,
                        name: pending.name,
                        value
                  });
            } else {
                  this.attributesFormArray.push(this.fb.group({
                        id: [pending.id],
                        name: [pending.name],
                        value: [value]
                  }));
            }

            this.clearAttributeEditor();
            this.updateGeneratedName();
      }

      clearAttributeEditor(): void {
            this.pendingAttribute.set(null);
            this.pendingAttributeValue.set('');
            this.editingAttributeIndex.set(null);
            this.attributeEditorError.set(null);
      }

      loadAttributeForEdit(index: number): void {
            const ctrl = this.attributesFormArray.at(index);
            this.editingAttributeIndex.set(index);
            this.pendingAttribute.set({
                  id: ctrl.get('id')?.value,
                  name: ctrl.get('name')?.value
            });
            this.pendingAttributeValue.set(ctrl.get('value')?.value || '');
            this.attributeEditorError.set(null);
      }

      removeAttribute(index: number): void {
            this.attributesFormArray.removeAt(index);
            const editingIndex = this.editingAttributeIndex();
            if (editingIndex === index) {
                  this.clearAttributeEditor();
            } else if (editingIndex !== null && editingIndex > index) {
                  this.editingAttributeIndex.set(editingIndex - 1);
            }
            this.updateGeneratedName();
      }

      getAvailableAttributesForDropdown(): ProductAttributeOption[] {
            const editingIndex = this.editingAttributeIndex();
            const confirmedNames = new Set(
                  this.attributesFormArray.controls
                        .map((c, i) => (editingIndex !== null && i === editingIndex)
                              ? null : c.get('name')?.value as string)
                        .filter((name): name is string => !!name)
            );
            return this.attributes()
                  .filter(a => !confirmedNames.has(a.name));
      }

      get pendingAttributeLabel(): string {
            return this.pendingAttribute()?.name || 'اختر أو أضف سمة...';
      }

      get canConfirmAttribute(): boolean {
            return !!(this.pendingAttribute() && this.pendingAttributeValue().trim());
      }

      addBarcode(): void {
            this.barcodesFormArray.push(this.fb.group({
                  id: [null],
                  barcode: [''],
                  sellingPrice: [0],
                  buyingPrice: [0],
                  stock: [0],
                  isDefault: [false]
            }));

            if (this.barcodesFormArray.length === 1) {
                  this.setDefaultBarcode(0);
            }
      }

      removeBarcode(index: number): void {
            if (this.barcodesFormArray.length <= 1) return;
            this.barcodesFormArray.removeAt(index);
            if (!this.barcodesFormArray.value.some((c: ProductBarcodeFormValue) => c.isDefault)) {
                  this.setDefaultBarcode(0);
            }
      }

      setDefaultBarcode(index: number): void {
            this.barcodesFormArray.controls.forEach((control, i) => {
                  control.get('isDefault')?.setValue(i === index, { emitEvent: false });
            });
      }

      addConversion(): void {
            this.conversionsFormArray.push(this.fb.group({
                  parentProductId: [null, Validators.required],
                  parentProductName: [''],
                  parentQuantity: [1, [Validators.required, Validators.min(0.01)]],
                  childQuantity: [1, [Validators.required, Validators.min(0.01)]],
                  isDefault: [false]
            }));
            
            if (this.conversionsFormArray.length === 1) {
                  this.setDefaultConversion(0);
            }
            this.syncConversionState();
      }

      removeConversion(index: number): void {
            this.conversionsFormArray.removeAt(index);
            if (this.conversionsFormArray.length > 0 && !this.conversionsFormArray.value.some((c: any) => c.isDefault)) {
                  this.setDefaultConversion(0);
            }
            this.syncConversionState();
      }

      setDefaultConversion(index: number): void {
            this.conversionsFormArray.controls.forEach((control, i) => {
                  control.get('isDefault')?.setValue(i === index, { emitEvent: false });
            });
      }

      addCompositionRow(): void {
            this.compositionFormArray.push(this.fb.group({
                  materialId: [null, Validators.required],
                  materialName: [''],
                  quantity: [1, [Validators.required, Validators.min(0.01)]],
                  unitId: [null, Validators.required],
                  costPerUnit: [0],
                  wastePercentage: [0, [Validators.min(0), Validators.max(100)]],
                  notes: ['']
            }));
      }

      removeCompositionRow(index: number): void {
            this.compositionFormArray.removeAt(index);
      }

      getProfitMargin(buying: number, selling: number) {
            return calculateProfitMargin(buying, selling);
      }

      /** Profit amount of a barcode row, rounded for the editable profit cell. */
      getBarcodeProfitValue(index: number): number {
            return roundMoney(this.getBarcodeProfitMargin(index).value);
      }

      /** Profit percentage of a barcode row, rounded for the editable profit cell. */
      getBarcodeProfitPercent(index: number): number {
            return roundMoney(this.getBarcodeProfitMargin(index).percentage);
      }

      /**
       * Applies a profit amount typed by the user in the editable profit cell:
       * selling price = buying price + profit amount (never below zero).
       */
      applyBarcodeProfitValue(index: number, profitValue: number): void {
            const row = this.barcodesFormArray.at(index);
            if (!row) return;

            const buyingPrice = Number(row.get('buyingPrice')?.value) || 0;
            row.get('sellingPrice')?.setValue(roundMoney(Math.max(0, buyingPrice + profitValue)));
      }

      /**
       * Applies a profit percentage typed by the user: selling price = buying price × (1 + percentage / 100).
       * A percentage needs a buying price base, so it is ignored while the buying price is zero.
       */
      applyBarcodeProfitPercent(index: number, profitPercent: number): void {
            const row = this.barcodesFormArray.at(index);
            if (!row) return;

            const buyingPrice = Number(row.get('buyingPrice')?.value) || 0;
            if (buyingPrice <= 0) return;

            row.get('sellingPrice')?.setValue(roundMoney(Math.max(0, buyingPrice * (1 + profitPercent / 100))));
      }

      /** Margin (amount + percentage) derived from a row's current buying and selling prices. */
      private getBarcodeProfitMargin(index: number): ProfitMargin {
            const row = this.barcodesFormArray.at(index);
            const buyingPrice = Number(row?.get('buyingPrice')?.value) || 0;
            const sellingPrice = Number(row?.get('sellingPrice')?.value) || 0;
            return calculateProfitMargin(buyingPrice, sellingPrice);
      }

      getTotalStock(): number {
            return this.barcodesFormArray.controls.reduce((sum, control) => {
                  return sum + (Number(control.get('stock')?.value) || 0);
            }, 0);
      }

      getStockClass(): string {
            return resolveBarcodeStockStatus(this.getTotalStock());
      }

      getStockLabel(): string {
            return getBarcodeStockLabel(this.getTotalStock());
      }

      selectCategory(cat: NamedEntity): void {
            if (this.productForm.get('categoryId')?.value === cat.id) return;

            this.productForm.get('categoryId')?.setValue(cat.id);

            // Reset downstream selections
            this.selectedBrandId.set(null);
            this.selectedBrandName.set(null);
            this.productForm.get('productGroupId')?.setValue(null);
            this.productGroupId.set(null);
            this.productGroupName.set(null);
            this.isPriceUnified.set(false);
            this.brandsSignal.set([]);
            this.productGroupsSignal.set([]);
            this.hasNoBrandsForCategory.set(false);

            this.loadCategoryChildNodes(cat.id);
      }

      loadCategoryChildNodes(categoryId: number, targetGroupId?: number | string | null): void {
            this.isHierarchyLoading.set(true);
            this.api.getCategoryChildNodes(categoryId).pipe(
                  catchError(() => of({ categoryId, brands: [], directGroups: [] } as CategoryChildNodesDto)),
                  finalize(() => this.isHierarchyLoading.set(false))
            ).subscribe(res => {
                  const brands = res.brands || [];
                  const directGroups = res.directGroups || [];
                  this.brandsSignal.set(brands);

                  if (brands.length > 0) {
                        this.hasNoBrandsForCategory.set(false);
                        if (targetGroupId != null) {
                              const targetIdStr = String(targetGroupId);
                              const matchedBrand = brands.find(b =>
                                    b.groups && b.groups.some(g => String(g.id) === targetIdStr)
                              );
                              if (matchedBrand) {
                                    this.selectedBrandId.set(matchedBrand.id);
                                    this.selectedBrandName.set(matchedBrand.name);
                                    this.productGroupsSignal.set(matchedBrand.groups || []);
                              }
                        }
                  } else if (directGroups.length > 0) {
                        this.hasNoBrandsForCategory.set(true);
                        this.productGroupsSignal.set(directGroups);
                  } else {
                        this.hasNoBrandsForCategory.set(false);
                        this.productGroupsSignal.set([]);
                  }
            });
      }

      selectBrand(brand: BrandTreeNodeDto): void {
            if (this.selectedBrandId() === brand.id) return;

            this.selectedBrandId.set(brand.id);
            this.selectedBrandName.set(brand.name);

            // Reset downstream group
            this.productForm.get('productGroupId')?.setValue(null);
            this.productGroupId.set(null);
            this.productGroupName.set(null);
            this.isPriceUnified.set(false);

            if (brand.groups && brand.groups.length > 0) {
                  this.productGroupsSignal.set(brand.groups);
            } else {
                  this.isHierarchyLoading.set(true);
                  this.api.getBrandGroups(brand.id).pipe(
                        catchError(() => of([])),
                        finalize(() => this.isHierarchyLoading.set(false))
                  ).subscribe(groups => {
                        this.productGroupsSignal.set(groups);
                  });
            }
      }

      selectProductGroup(group: ProductGroupTreeNodeDto): void {
            this.productForm.get('productGroupId')?.setValue(group.id);
            this.productGroupId.set(group.id);
            this.productGroupName.set(group.name);
            this.isPriceUnified.set(!!group.isPriceUnified);

            if (group.categoryId && !this.productForm.get('categoryId')?.value) {
                  this.productForm.get('categoryId')?.setValue(group.categoryId);
            }
      }

      getSelectedCategoryName(): string {
            const id = this.productForm.get('categoryId')?.value;
            return this.categories().find(c => c.id === id)?.name || 'اختر القسم...';
      }

      getSelectedBrandName(): string {
            if (this.hasNoBrandsForCategory()) {
                  return 'تصنيف مباشر (بدون شركة)';
            }
            if (!this.productForm.get('categoryId')?.value) {
                  return 'اختر القسم أولاً';
            }
            return this.selectedBrandName() || 'اختر الشركة / العلامة التجارية...';
      }

      getSelectedProductGroupName(): string {
            if (!this.productForm.get('categoryId')?.value) {
                  return 'اختر القسم أولاً';
            }
            if (!this.hasNoBrandsForCategory() && !this.selectedBrandId()) {
                  return 'اختر الشركة أولاً';
            }
            return this.productGroupName() || 'اختر مجموعة المنتجات...';
      }

      selectManufacturer(man: NamedEntity): void {
            this.productForm.get('manufacturerId')?.setValue(man.id);
      }

      getSelectedManufacturerName(): string {
            const id = this.productForm.get('manufacturerId')?.value;
            return this.manufacturers().find(m => m.id === id)?.name || 'اختر الشركة المصنعة...';
      }

      toggleSupplier(sup: NamedEntity): void {
            const control = this.productForm.get('supplierIds');
            const currentValues = (control?.value as number[]) || [];
            if (currentValues.includes(sup.id)) {
                  control?.setValue(currentValues.filter(id => id !== sup.id));
            } else {
                  control?.setValue([...currentValues, sup.id]);
            }
      }

      isSupplierSelected(sup: NamedEntity): boolean {
            const currentValues = (this.productForm.get('supplierIds')?.value as number[]) || [];
            return currentValues.includes(sup.id);
      }

      getSelectedSuppliers(): NamedEntity[] {
            const ids = (this.productForm.get('supplierIds')?.value as number[]) || [];
            return this.suppliers().filter(s => ids.includes(s.id));
      }

      removeSupplier(id: number): void {
            const control = this.productForm.get('supplierIds');
            const currentValues = (control?.value as number[]) || [];
            control?.setValue(currentValues.filter(v => v !== id));
      }

      addNewReferenceItem(type: 'category' | 'manufacturer' | 'supplier' | 'attribute', name: string): void {
            const cleanName = name.trim();
            if (!cleanName) return;

            this.isPageLoading.set(true);

            if (type === 'category') {
                  this.api.createCategory(cleanName).subscribe({
                        next: (res) => {
                              this.categoriesSignal.update(list => [...list, res]);
                              this.selectCategory(res);
                              this.isPageLoading.set(false);
                        },
                        error: (err) => {
                              this.saveError.set('فشل في إضافة الفئة');
                              this.isPageLoading.set(false);
                        }
                  });
            } else if (type === 'manufacturer') {
                  this.api.createManufacturer(cleanName).subscribe({
                        next: (res) => {
                              this.manufacturersSignal.update(list => [...list, res]);
                              this.selectManufacturer(res);
                              this.isPageLoading.set(false);
                        },
                        error: (err) => {
                              this.saveError.set('فشل في إضافة الشركة المصنعة');
                              this.isPageLoading.set(false);
                        }
                  });
            } else if (type === 'supplier') {
                  this.api.createSupplier(cleanName).subscribe({
                        next: (res) => {
                              this.suppliersSignal.update(list => [...list, res]);
                              this.toggleSupplier(res);
                              this.isPageLoading.set(false);
                        },
                        error: (err) => {
                              this.saveError.set('فشل في إضافة المورد');
                              this.isPageLoading.set(false);
                        }
                  });
            } else if (type === 'attribute') {
                  this.api.createAttribute(cleanName).subscribe({
                        next: (res) => {
                              this.attributesSignal.update(list => [...list, res]);
                              this.selectPendingAttribute(res);
                              this.isPageLoading.set(false);
                        },
                        error: (err) => {
                              this.saveError.set('فشل في إضافة السمة');
                              this.isPageLoading.set(false);
                        }
                  });
            }
      }

      private initForm(): void {
            this.productForm = this.fb.group({
                  baseName: ['', Validators.required],
                  status: ['active'],
                  attributes: this.fb.array([]),
                  barcodes: this.fb.array([]),
                  categoryId: [null],
                  productGroupId: [null],
                  manufacturerId: [null],
                  supplierIds: [[]],
                  hasConversion: [false],
                  conversions: this.fb.array([]),
                  hasComposition: [false],
                  composition: this.fb.array([])
            });
      }

      private applyProductDetail(detail: ProductManagePayload): void {
            this.productGroupId.set(detail.productGroupId || null);
            this.productGroupName.set(detail.productGroupName || null);
            this.isPriceUnified.set(!!detail.isPriceUnified);

            this.productForm.patchValue({
                  baseName: detail.baseName,
                  status: detail.status || 'active',
                  categoryId: detail.categoryId,
                  productGroupId: detail.productGroupId || null,
                  manufacturerId: detail.manufacturerId,
                  supplierIds: detail.supplierIds,
                  hasConversion: detail.hasConversion || !!detail.conversions?.length,
                  hasComposition: detail.hasComposition
            });

            if (detail.categoryId) {
                  this.loadCategoryChildNodes(Number(detail.categoryId), detail.productGroupId);
            }

            this.attributesFormArray.clear();
            (detail.attributes || []).forEach(attr => {
                  this.attributesFormArray.push(this.fb.group({
                        id: [attr.id],
                        name: [attr.name],
                        value: [attr.value]
                  }));
            });

            this.barcodesFormArray.clear();
            if (detail.barcodes && detail.barcodes.length) {
                  const defaultBc = detail.barcodes.find(b => b.isDefault) || detail.barcodes[0];
                  this.initialSellingPrice.set(defaultBc ? Number(defaultBc.sellingPrice) : null);
                  detail.barcodes.forEach(barcode => {
                        this.barcodesFormArray.push(this.fb.group({
                              id: [barcode.id],
                              barcode: [barcode.barcode],
                              sellingPrice: [barcode.sellingPrice],
                              buyingPrice: [barcode.buyingPrice],
                              stock: [barcode.stock],
                              isDefault: [barcode.isDefault]
                        }));
                  });
            } else {
                  this.initialSellingPrice.set(null);
                  this.addBarcode();
            }

            this.conversionsFormArray.clear();
            if (detail.conversions && detail.conversions.length) {
                  detail.conversions.forEach(conv => {
                        this.conversionsFormArray.push(this.fb.group({
                              parentProductId: [conv.parentProductId, Validators.required],
                              parentProductName: [conv.parentProductName || ''],
                              parentQuantity: [conv.parentQuantity, [Validators.required, Validators.min(0.01)]],
                              childQuantity: [conv.childQuantity, [Validators.required, Validators.min(0.01)]],
                              isDefault: [conv.isDefault]
                        }));
                  });
            }

            this.compositionFormArray.clear();
            if (detail.composition && detail.composition.length) {
                  detail.composition.forEach(comp => {
                        this.compositionFormArray.push(this.fb.group({
                              materialId: [comp.materialId, Validators.required],
                              quantity: [comp.quantity, [Validators.required, Validators.min(0.01)]],
                              unitId: [comp.unitId, Validators.required],
                              wastePercentage: [comp.wastePercentage || 0, [Validators.min(0), Validators.max(100)]],
                              notes: [comp.notes || '']
                        }));
                  });
            }

            this.updateGeneratedName();
            this.syncConversionState();
      }

      private hasConversionRules(): boolean {
            return this.conversionsFormArray.controls.some(control => {
                  const parentProductId = control.get('parentProductId')?.value;
                  const parentProductName = control.get('parentProductName')?.value;
                  return !!(parentProductId != null && parentProductId !== '')
                        || !!(typeof parentProductName === 'string' && parentProductName.trim());
            });
      }

      private syncConversionState(): void {
            const hasConversion = this.hasConversionRules();
            const control = this.productForm.get('hasConversion');
            if (control?.value !== hasConversion) {
                  control?.setValue(hasConversion, { emitEvent: false });
            }
      }

      private extractErrorMessage(err: unknown): string {
            return (err as { error?: { message?: string }; message?: string })?.error?.message
                  || (err as { message?: string })?.message
                  || 'حدث خطأ غير متوقع';
      }
}

/** Rounds a money amount to the two decimals stored by the backend (BigDecimal scale = 2). */
function roundMoney(value: number): number {
      return Math.round((value + Number.EPSILON * Math.abs(value)) * 100) / 100;
}

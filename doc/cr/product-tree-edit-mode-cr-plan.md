# CR Plan: Product Tree Edit Mode

## 1. Executive Summary & Architecture Analysis

### 1.1 Scope & Hierarchy
The product hierarchy consists of 4 tiers:
$$\text{Category} \longrightarrow \text{Company / Brand} \longrightarrow \text{Product Group} \longrightarrow \text{Product}$$

This Change Request (CR) plans an **Edit Mode** in the Product Tree View that allows modifying this hierarchy:
1. **Rename** Categories, Brands, and Product Groups.
2. **Delete Empty Nodes** (Category, Brand, or Product Group) strictly when no child entities exist.
3. **Move Company/Brand** to a different Category (cascading child groups and products).
4. **Move Product Group** to a different Company/Brand (cascading child products).
5. **Move Products (Single & Bulk)**: Allow moving an individual product or **bulk-moving multiple selected products together** from any location in the tree to any target Product Group.

---

## 2. Existing Data Model & Business Rules

### 2.1 Entity Relationships in Backend
- **`ProductCategory` (`product_categories`)**
  - `name`: `VARCHAR(255)` — Unique across all categories (`@Column(unique = true)`).
  - `code`: `VARCHAR(100)` — Unique.
  - Has many `Brand`, `ProductGroup` (direct), and `Product` (direct).
- **`Brand` (`product_brands`)**
  - `name`: `VARCHAR(255)` — Not unique at DB level, but should be unique within the same Category.
  - `code`: `VARCHAR(100)` — Unique globally.
  - `category`: `@ManyToOne(fetch = LAZY, optional = false)` &rarr; `category_id`.
  - Has many `ProductGroup`.
- **`ProductGroup` (`product_groups`)**
  - `name`: `VARCHAR(255)` — Should be unique within the same Brand.
  - `code`: `VARCHAR(100)` — Unique globally.
  - `brand`: `@ManyToOne(fetch = LAZY)` &rarr; `brand_id`.
  - `category`: `@ManyToOne(fetch = LAZY)` &rarr; `category_id`.
  - Has many `Product`.
- **`Product` (`cashier_products`)**
  - `productGroup`: `@ManyToOne(fetch = LAZY)` &rarr; `product_group_id`.
  - `category`: `@ManyToOne(fetch = LAZY)` &rarr; `category_id`.
  - Soft-delete: `deletedAt != null` indicates a deleted product.

### 2.2 Definition of "Empty" Node for Safe Deletion
A node can be deleted **only** if it has zero child dependencies:
1. **Product Group is empty** if:
   - `productRepository.existsByProductGroupIdAndDeletedAtIsNull(groupId) == false`.
2. **Company / Brand is empty** if:
   - `productGroupRepository.existsByBrandId(brandId) == false`.
3. **Category is empty** if:
   - `brandRepository.existsByCategoryId(categoryId) == false`
   - **AND** `productGroupRepository.existsByCategoryId(categoryId) == false`
   - **AND** `productRepository.existsByCategoryIdAndDeletedAtIsNull(categoryId) == false`.

> [!IMPORTANT]
> The backend must strictly validate this rule in service transactions and throw `409 Conflict` if deletion is attempted on a non-empty node. Frontend disabled states are a UX convenience, not a security boundary.

### 2.3 Rename Validation & Uniqueness Rules
- **Category:**
  - Name must be 2–255 characters, trimmed, not blank.
  - Must be unique across all categories: `categoryRepository.existsByNameIgnoreCaseAndIdNot(name, id) == false`.
- **Company / Brand:**
  - Name must be 2–255 characters, trimmed, not blank.
  - Must be unique within its parent category: `brandRepository.existsByNameIgnoreCaseAndCategoryIdAndIdNot(name, categoryId, id) == false`.
- **Product Group:**
  - Name must be 2–255 characters, trimmed, not blank.
  - Must be unique within its parent brand (or category): `productGroupRepository.existsByNameIgnoreCaseAndBrandIdAndIdNot(name, brandId, id) == false`.

### 2.4 Move Semantics & Foreign Key Cascade
Because `ProductGroup` and `Product` store redundant parent references (`category_id`) for direct querying performance, moving a parent node requires a transactional cascade:
1. **Move Brand $\rightarrow$ Target Category B:**
   - Update `Brand.category = Category B`.
   - Cascade to all `ProductGroup`s under this brand: set `productGroup.category = Category B`.
   - Cascade to all `Product`s under those groups: set `product.category = Category B`.
   - Rule: Target Category must exist and cannot be the current category. Check brand name uniqueness in Category B.
2. **Move Product Group $\rightarrow$ Target Brand B:**
   - Update `ProductGroup.brand = Brand B`.
   - Update `ProductGroup.category = Brand B.getCategory()`.
   - Cascade to all `Product`s under this group: set `product.category = Brand B.getCategory()`.
   - Rule: Target Brand must exist and cannot be the current brand. Check group name uniqueness in Brand B.
3. **Move Product (Single) $\rightarrow$ Target Product Group G:**
   - Any active product can be reassigned to any valid `ProductGroup` across the tree.
   - Update `Product.productGroup = G`.
   - Update `Product.category = G.getCategory()` (or `G.getBrand().getCategory()`).
   - Rule: Target Product Group must exist.
4. **Bulk Move Products $\rightarrow$ Target Product Group G:**
   - A list of product IDs `[id1, id2, ...]` can be moved simultaneously to target `ProductGroup` G.
   - Executed inside a single `@Transactional` method.
   - Validates that target `ProductGroup` G exists.
   - Batch loads all specified products, verifies they are not soft-deleted, updates both `productGroup` and `category` on all entities, and saves in batch (`productRepository.saveAll(...)`).
   - If any product ID is invalid, the entire batch transaction rolls back (atomic consistency).

---

## 3. Edit Mode UX / UI Design

### 3.1 Enter / Exit Edit Mode
- Add a toggle button in the header actions:
  - **Normal Mode:** Button reads `تعديل الهيكل` (Edit Hierarchy) with `tune` / `edit` icon.
  - **Edit Mode:** Button toggles to an active, highlighted state `إنهاء التعديل` (Done Editing) with `check` icon.
- An informative top banner appears when Edit Mode is active:
  > **وضع تعديل الهيكل مفعل** — يمكنك الآن إعادة التسمية، النقل الفردي أو الجماعي للمنتجات، أو حذف المجموعات الفارغة.

### 3.2 Visual Distinction of Editable Nodes
- When Edit Mode is active:
  - Node rows (Category, Brand, Group) display an edit accent (subtle dashed outline or left border marker).
  - An inline action toolbar appears on the trailing side of each node row:
    - ✏️ **إعادة تسمية** (Rename): Triggers an inline input or compact modal.
    - ↔️ **نقل** (Move): Opens the Destination Picker Dialog.
    - 🗑️ **حذف** (Delete): Enabled **only** when child count is 0; disabled with tooltip `لا يمكن حذف عنصر يحتوي على بيانات تابعة` if count > 0.
  - In the Leaf Products Table:
    - A checkbox column appears on the right (RTL start) for row selection.
    - Add a ↔️ **نقل لمجموعة** (Move to Group) action icon in the actions column for single-product move.

### 3.3 Bulk Product Selection & Floating Action Bar
- When Edit Mode is active:
  - **Table Header Checkbox:** Allows selecting/deselecting all products in that group at once (supports checked, unchecked, and indeterminate states).
  - **Row Checkbox:** Allows toggling selection for individual products across one or multiple groups.
  - **Floating Bulk Actions Bar:**
    - Appears smoothly docked at the bottom of the viewport whenever `selectedProductIds.size > 0`.
    - Content:
      - Selection counter: `تم تحديد X منتج` with an inventory icon.
      - Primary Action: `نقل المنتجات المحددة` (Move Selected) button &rarr; opens the Move Destination Modal with title `نقل (X) منتجات محددة إلى مجموعة جديدة`.
      - Secondary Action: `إلغاء التحديد` (Deselect All) button &rarr; clears selection immediately.
    - After the bulk move completes successfully:
      - Selection is cleared (`selectedProductIds.clear()`).
      - Success toast notification is displayed: `تم نقل X منتج بنجاح إلى مجموعة [اسم المجموعة]`.
      - Product tree data is reloaded/refreshed smoothly.

### 3.4 Drag-and-Drop vs. Explicit Move Modal Analysis
- **Decision:** Use an **Explicit Move Dialog (Modal)** rather than Drag-and-Drop.
- **Rationale:**
  1. The tree is a deep accordion table containing hundreds of rows, nested collapsible sections, and paginated tables. Dragging across scrollable viewports is error-prone.
  2. Drag-and-drop risks accidental moves of entire brands or groups on touchscreens or rapid clicks.
  3. Dragging multiple selected items simultaneously across an accordion tree is confusing and difficult to control visually.
  4. A Move Dialog with a cascading dropdown (`Select Category → Select Brand → Select Group`) provides clear validation, unambiguous intent, confirmation step, and zero chance of accidental drop errors.

---

## 4. API Endpoints Specification

All hierarchy modification endpoints will be grouped under `/api/products/tree`:

### 4.1 Rename Endpoints
- `PATCH /api/products/tree/categories/{id}/rename`
  - Body: `{ "name": "الاسم الجديد" }`
- `PATCH /api/products/tree/brands/{id}/rename`
  - Body: `{ "name": "الاسم الجديد" }`
- `PATCH /api/products/tree/groups/{id}/rename`
  - Body: `{ "name": "الاسم الجديد" }`

### 4.2 Delete Endpoints (Empty Only)
- `DELETE /api/products/tree/categories/{id}`
  - Returns: `204 No Content` on success, `409 Conflict` with error message if not empty.
- `DELETE /api/products/tree/brands/{id}`
  - Returns: `204 No Content` on success, `409 Conflict` if has groups.
- `DELETE /api/products/tree/groups/{id}`
  - Returns: `204 No Content` on success, `409 Conflict` if has products.

### 4.3 Move Endpoints
- `POST /api/products/tree/brands/{id}/move`
  - Body: `{ "targetCategoryId": 5 }`
- `POST /api/products/tree/groups/{id}/move`
  - Body: `{ "targetBrandId": 12 }`
- `POST /api/products/tree/products/{id}/move`
  - Body: `{ "targetGroupId": 45 }`
- `POST /api/products/tree/products/bulk-move`
  - Body:
    ```json
    {
      "productIds": [1001, 1002, 1005],
      "targetGroupId": 45
    }
    ```
  - Returns:
    ```json
    {
      "movedCount": 3,
      "targetGroupId": 45,
      "message": "Products moved successfully"
    }
    ```

---

## 5. Independent Implementation Tasks

Each task below is self-contained and independently verifiable.

---

### Task 1 — Backend: Node Deletion with Strict Empty Verification
**Goal:** Implement safe deletion of empty Categories, Brands, and Product Groups with backend rule enforcement.

**Backend Files:**
- `ProductCategoryRepository.java`
- `BrandRepository.java`
- `ProductGroupRepository.java`
- `ProductRepository.java`
- `ProductTreeService.java` & `ProductTreeServiceImpl.java`
- `ProductTreeController.java`

**Changes:**
1. In `ProductTreeServiceImpl`:
   - `deleteCategory(Long id)`: Verify category exists; verify `!brandRepository.existsByCategoryId(id)`, `!productGroupRepository.existsByCategoryId(id)`, `!productRepository.existsByCategoryIdAndDeletedAtIsNull(id)`; if any true, throw `ConflictException("Cannot delete Category containing brands or products")`; else delete.
   - `deleteBrand(Long id)`: Verify brand exists; verify `!productGroupRepository.existsByBrandId(id)`; if true, throw `ConflictException("Cannot delete Brand containing product groups")`; else delete.
   - `deleteProductGroup(Long id)`: Verify group exists; verify `!productRepository.existsByProductGroupIdAndDeletedAtIsNull(id)`; if true, throw `ConflictException("Cannot delete Product Group containing products")`; else delete.
2. Expose `DELETE` endpoints in `ProductTreeController`.

**Verification:**
- Call `DELETE /api/products/tree/categories/{id}` on category with brands &rarr; Expect `409 Conflict`.
- Create a dummy empty category &rarr; Call `DELETE` &rarr; Expect `204 No Content`.
- Repeat for Brand and ProductGroup.

---

### Task 2 — Backend: Node Rename with Scope-Based Uniqueness
**Goal:** Allow renaming Category, Brand, and Product Group with validation and duplicate prevention.

**Backend Files:**
- `ProductCategoryRepository.java` (add `boolean existsByNameIgnoreCaseAndIdNot(String name, Long id)`)
- `BrandRepository.java` (add `boolean existsByNameIgnoreCaseAndCategoryIdAndIdNot(String name, Long categoryId, Long id)`)
- `ProductGroupRepository.java` (add `boolean existsByNameIgnoreCaseAndBrandIdAndIdNot(String name, Long brandId, Long id)`)
- `ProductTreeService.java` & `ProductTreeServiceImpl.java`
- `ProductTreeController.java`
- Request DTO: `RenameNodeRequest.java` (`@NotBlank @Size(min = 2, max = 255) String name`)

**Changes:**
1. Implement `renameCategory(Long id, String newName)`: Trim name; check global uniqueness; update and save.
2. Implement `renameBrand(Long id, String newName)`: Trim name; check category-scoped uniqueness; update and save.
3. Implement `renameProductGroup(Long id, String newName)`: Trim name; check brand-scoped uniqueness; update and save.
4. Expose `PATCH` endpoints in `ProductTreeController`.

**Verification:**
- Rename category to duplicate name &rarr; Expect `409 Conflict`.
- Rename category to new valid name &rarr; Expect `200 OK` and updated name in tree.
- Rename brand/group &rarr; Expect `200 OK`.

---

### Task 3 — Backend: Move Nodes & Bulk Move Products with Cascading Foreign Keys
**Goal:** Support moving Brands, Product Groups, and individual or **bulk products** while preserving relational integrity and cascading foreign keys.

**Backend Files:**
- `ProductTreeService.java` & `ProductTreeServiceImpl.java`
- `ProductTreeController.java`
- Request DTOs: `MoveBrandRequest.java`, `MoveGroupRequest.java`, `MoveProductRequest.java`, `BulkMoveProductsRequest.java`
- Response DTO: `BulkMoveProductsResponse.java`

**Changes:**
1. Implement `moveBrand(Long brandId, Long targetCategoryId)`:
   - Validate target category exists and is different from current.
   - Update `brand.setCategory(targetCategory)`.
   - Update all `ProductGroup`s under `brandId`: `pg.setCategory(targetCategory)`.
   - Update all active `Product`s under those groups: `p.setCategory(targetCategory)`.
2. Implement `moveProductGroup(Long groupId, Long targetBrandId)`:
   - Validate target brand exists and is different from current.
   - Update `group.setBrand(targetBrand)`.
   - Update `group.setCategory(targetBrand.getCategory())`.
   - Update all active `Product`s under `groupId`: `p.setCategory(targetBrand.getCategory())`.
3. Implement `moveProduct(Long productId, Long targetGroupId)`:
   - Validate product and target group exist.
   - Update `product.setProductGroup(targetGroup)`.
   - Update `product.setCategory(targetGroup.getCategory())`.
4. Implement `bulkMoveProducts(List<Long> productIds, Long targetGroupId)`:
   - Validate `targetGroupId` exists and fetch `targetGroup` with its category.
   - Load products by IDs (`findAllByIdAndDeletedAtIsNull`).
   - Loop and assign `productGroup` and `category` to `targetGroup`.
   - Save all in batch via `productRepository.saveAll(...)`.
   - Return count of moved products.
5. Wrap each operation in `@Transactional`.

**Verification:**
- Move Brand from Cat 1 to Cat 2 &rarr; Tree displays Brand and all its groups/products under Cat 2.
- Move Product Group to another Brand &rarr; Group and its products appear under target brand.
- Move single product to another Group &rarr; Product moves to target group.
- Move bulk products `[1001, 1002, 1003]` to another Group &rarr; All 3 products appear in target group.

---

### Task 4 — Frontend: Edit Mode Toggle, State & Bulk Product Selection
**Goal:** Add Edit Mode toggle to the Product Tree page with visual indicators, checkbox columns in the products table, and selection state.

**Frontend Files:**
- `product-tree-view.component.ts`
- `product-tree-view.component.html`
- `product-tree-view.component.css`

**Changes:**
1. In `ProductTreeViewComponent`:
   - Add `isEditMode = signal<boolean>(false)`.
   - Add `selectedProductIds = signal<Set<number | string>>(new Set())`.
   - Selection methods: `toggleProductSelection(id)`, `selectAllInGroup(group)`, `isGroupAllSelected(group)`, `isGroupPartiallySelected(group)`, `clearSelection()`.
2. Add "تعديل الهيكل" toggle button in the header actions bar.
3. When `isEditMode` is true:
   - Show top edit mode notification bar.
   - Add `.edit-mode-active` class to container for visual accents.
   - Render action button groups (Rename, Move, Delete) on Category, Brand, and Group rows.
   - Render selection checkbox column in the leaf products table header and rows.
4. If edit mode is exited, auto-clear `selectedProductIds`.

**Verification:**
- Click "تعديل الهيكل" &rarr; Edit mode turns on, checkboxes appear in product tables.
- Check header checkbox in a group &rarr; All products in that group become checked.
- Select products across different groups &rarr; Selection count reflects total.

---

### Task 5 — Frontend: Node Rename & Safe Deletion UI
**Goal:** Implement UI modals and actions for renaming and deleting nodes.

**Frontend Files:**
- `product-tree-view.component.ts`
- `product-tree-view.component.html`
- `product-tree-view.component.css`
- `product-api.service.ts` (add rename & delete API calls)

**Changes:**
1. Add API methods in `ProductApiService` for rename and delete.
2. In `ProductTreeViewComponent`:
   - Rename dialog/prompt: On confirmation, invoke API, display toast, and update node name locally.
   - Delete button: Disabled if node has items (count > 0). If empty, shows confirmation dialog before calling DELETE API.
3. Refresh tree data or apply optimistic in-memory update on success.

**Verification:**
- Non-empty node &rarr; Delete button is disabled with explanation tooltip.
- Empty node &rarr; Delete button enabled; on click and confirm, node is deleted from tree.
- Rename node &rarr; Name updates instantly in tree and on page reload.

---

### Task 6 — Frontend: Move Destination Modal & Bulk Actions Bar
**Goal:** Build the Move Destination Modal (supporting Brand, Group, single Product, and **Bulk Products Move**) and the floating bulk-actions toolbar.

**Frontend Files:**
- `product-tree-view.component.ts`
- `product-tree-view.component.html`
- `product-tree-view.component.css`
- `product-api.service.ts` (add single move & `bulkMoveProducts` API calls)

**Changes:**
1. **Floating Bulk Action Bar (`.floating-bulk-bar`):**
   - Rendered when `isEditMode() && selectedProductIds().size > 0`.
   - Displays count: `تم تحديد {{ selectedProductIds().size }} منتج`.
   - "نقل المنتجات المحددة" button: triggers the Move Destination Modal in bulk mode.
   - "إلغاء التحديد" button: clears selection.
2. **Move Destination Modal:**
   - Supports modes: `'brand' | 'group' | 'single-product' | 'bulk-products'`.
   - Cascading picker:
     - For Brand move: Select target Category.
     - For Group move: Select target Category $\rightarrow$ target Brand.
     - For Product(s) move: Select target Category $\rightarrow$ target Brand $\rightarrow$ target Group.
   - Shows summary of items being moved (e.g., `سيتم نقل 4 منتجات إلى المجموعة المحددة`).
   - Prevents selecting current parent as destination.
3. On confirm:
   - If bulk mode: call `productApiService.bulkMoveProducts(Array.from(selectedProductIds()), targetGroupId)`.
   - On success: show toast, clear selection, reload tree data, close modal.

**Verification:**
- Select 3 products in edit mode &rarr; Floating bar appears with count 3.
- Click "نقل المنتجات المحددة" &rarr; Modal opens &rarr; Choose target Category, Brand, Group &rarr; Confirm &rarr; Products moved and tree reloaded.
- Single product move from row action continues to work seamlessly.

---

## 6. Recommended Implementation Order

Based on dependencies, the recommended sequence is:

1. **Task 1 (Backend: Delete Empty Nodes)** — Foundational safety rules and delete endpoints.
2. **Task 2 (Backend: Rename Nodes)** — Name validation and rename endpoints.
3. **Task 3 (Backend: Move Nodes & Bulk Move Products)** — Core transactional move operations, FK cascades, and batch move endpoint.
4. **Task 4 (Frontend: Edit Mode Toggle, State & Bulk Selection)** — UI framework, checkboxes, and multi-product selection state.
5. **Task 5 (Frontend: Rename & Delete UI)** — Exposing rename and deletion in the UI.
6. **Task 6 (Frontend: Move Destination Modal & Bulk Actions Bar)** — Floating bulk bar and cascading destination selector modal.

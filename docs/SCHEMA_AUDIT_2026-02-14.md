# Schema Audit: Field Categorization & Denormalization Inventory

> **Audited:** 2026-02-14
> **Scope:** 215 `v.optional()` fields across 37+ tables in `convex/schema.ts`
> **Purpose:** Permanent onboarding reference. Guides schema tightening, field removal, and denormalization documentation.

---

## Overview

This document categorizes every `v.optional()` field in the Convex schema into four categories:

| Category | Meaning | Action |
|----------|---------|--------|
| **A** | Legitimately optional -- not all documents should have this value | Keep as `v.optional()` |
| **B** | Candidate for required -- all documents likely have this value, or should | Backfill defaults, then tighten to required |
| **C** | Deprecated -- remove entirely | Clean code references, run cleanup migration, remove from schema |
| **D** | Table-level assessment | Evaluate whether entire table should be removed or kept |

---

## Category A: Legitimately Optional

Fields that are correctly `v.optional()` because not all documents should have a value.

### ingredients

| Field | Reason |
|-------|--------|
| brand | Not all ingredients have a brand |
| procurementSource | Not always tracked |

### packagingMaterials

| Field | Reason |
|-------|--------|
| brand | Not all materials have a brand |
| procurementSource | Not always tracked |

### customers

| Field | Reason |
|-------|--------|
| phone | Customer info may be incomplete |
| source | Not always known how customer found us |
| notes | Optional admin notes |

### orders

| Field | Reason |
|-------|--------|
| customerPhone | Not all customers have a phone number |
| dueDate | Not all orders have a due date |
| paymentMethod | Only set when payment is received |
| channel | Sales channel tracking is optional |
| soldBy | Sales person tracking is optional |
| pickupLocation | Only for pickup orders (deliveryType = "Pickup") |
| deliveryAddress | Only for delivery orders (deliveryType = "Delivery") |
| contactWa | WhatsApp contact is optional |
| contactIg | Instagram contact is optional |
| shippingAgency | Only for shipped orders |
| shippingNumber | Only for shipped orders with tracking |
| cancellationReason | Only for cancelled orders |
| cancellationCategory | Only for cancelled orders |
| cancelledAt | Only for cancelled orders |
| notes | Optional order notes |
| voucherId | Only if voucher applied |
| voucherCode | Only if voucher applied (SNAPSHOT) |
| voucherDiscountValue | Only if voucher applied (SNAPSHOT) |
| orderLevelDiscount | Only if manual discount applied |
| orderLevelDiscountType | Only if manual discount applied |
| awaitingPaymentSince | Only set when status = AwaitingPayment |
| confirmedAt | Only set when payment confirmed |
| lowPriceConfirmed | Only for orders with total < Rp 20,000 |
| completedAt | Only for terminal orders (CompleteShipped, PickedUp, Cancelled). Active orders correctly have `undefined`. Backfilled for historical terminal orders in Plan 03, but field stays `v.optional()`. |

### orderItems

| Field | Reason |
|-------|--------|
| productVariant | Not all items have variants |
| menuProductId | Custom/ad-hoc items have no menu product link |
| packageStatus | Only for production items with ball tracking |
| ballsFilled | Only for production items during filling |
| packedPackageIndices | Only for production items during packing |
| isProductionComplete | Boolean flag; absent = false |
| isCancelled | Boolean flag; absent = false |

### orderItemProduction

| Field | Reason |
|-------|--------|
| isCancelled | Boolean flag; absent = false |

### recipeVersions

| Field | Reason |
|-------|--------|
| description | Optional metadata |
| estimatedYieldGrams | Optional; not all recipes track yield |
| copiedFromVersionId | Only for versions copied from another |

### packagingVersions

| Field | Reason |
|-------|--------|
| description | Optional metadata |
| copiedFromVersionId | Only for versions copied from another |

### productVersions

| Field | Reason |
|-------|--------|
| description | Optional metadata |
| copiedFromVersionId | Only for versions copied from another |

### recipeComponents

| Field | Reason |
|-------|--------|
| linkedRecipeVersionId | Only for linked (reusable) components |

### vouchers

| Field | Reason |
|-------|--------|
| description | Optional admin description |
| minimumOrderAmount | Optional constraint |
| maximumDiscount | Only for percentage discounts (cap) |
| validFrom | Optional validity period start |
| validUntil | Optional validity period end |
| usageLimit | Absent = unlimited uses |
| usagePerCustomer | Absent = unlimited per customer |
| isManagerOverride | Only for auto-generated override vouchers |
| overrideReason | Only for override vouchers |
| overrideOrderId | Only for override vouchers |
| updatedAt | Only set after first update |

### componentTypes

| Field | Reason |
|-------|--------|
| gramsPerUnit | Only for production components (balls) |
| description | Optional component description |
| reorderPoint | Optional inventory alert threshold |
| reorderQuantity | Optional suggested reorder amount |
| consumptionStage | Default can be inferred from category |
| alarmPercentage | Optional stock alarm percentage |
| color | Optional display color for kitchen balls |

### storageLocations

| Field | Reason |
|-------|--------|
| address | Optional location address |
| isDefault | Only the default location has this set |

### inventoryBatches

| Field | Reason |
|-------|--------|
| supplierBrand | Not all batches track brand |
| purchaseReference | Optional PO/invoice number |
| purchaseUrl | Optional reorder link |
| expiryDate | Only for perishable items |

### componentStock

| Field | Reason |
|-------|--------|
| lastRestockTotalStock | Only set after first restock event |

### componentTransactions

| Field | Reason |
|-------|--------|
| batchId | Not all transactions affect a specific batch (e.g., adjustments) |
| orderId | Only for order-related transactions |
| transferId | Only for transfer transactions |
| referenceNote | Optional context note |

### orderComponentReservations

| Field | Reason |
|-------|--------|
| consumptionStage | May not exist for old reservations pre-BOM |
| consumedAt | Only set when reservation is consumed |

### feedback

| Field | Reason |
|-------|--------|
| elementSelector | Optional DOM selector for element targeting |
| comments | Optional comment array |
| createdBy | Optional user identification |

### users

| Field | Reason |
|-------|--------|
| avatarUrl | Optional user avatar |
| locationId | Future multi-location feature |
| lockedUntil | Only set when account is locked |
| lastLoginAt | Only set after first login |

### sessions

| Field | Reason |
|-------|--------|
| lastActiveAt | Tracking field, may not be set initially |

### whatsappTemplates

| Field | Reason |
|-------|--------|
| description | Optional usage context description |
| lastEditedBy | Only set after first edit |
| lastEditedAt | Only set after first edit |

### orderEvents

| Field | Reason |
|-------|--------|
| fromStatus | Only for status transition events |
| toStatus | Only for status transition events |
| reason | Optional human-readable reason |
| category | Only for cancellation events |
| metadata | Optional JSON for additional data |
| triggeredBy | May be absent for system events |

### productionTargets

| Field | Reason |
|-------|--------|
| manualOverride | Only if manager adds manual override |
| createdBy | Optional tracking field |

### productionCounts

| Field | Reason |
|-------|--------|
| shippedToGoldfinch | Only tracked if Goldfinch shipments occur |
| lastResetAt | Only set after first count reset |
| lastResetBy | Only set after first count reset |

### productionLog

| Field | Reason |
|-------|--------|
| orderId | Only for pack/unpack actions |
| orderItemId | Only for pack/unpack actions |
| note | Optional correction note |

### externalOutlets

| Field | Reason |
|-------|--------|
| address | Optional outlet address |
| lastSyncAt | Only set after first sync |
| lastSyncStatus | Only set after first sync |
| lastSyncError | Only set on sync error |

### externalStockSnapshots

| Field | Reason |
|-------|--------|
| priceGrabfoodGofood | Platform-specific; only if outlet sells on GrabFood/GoFood |
| priceGrabmart | Platform-specific; only if outlet sells on GrabMart |
| priceShopee | Platform-specific; only if outlet sells on Shopee |
| capital | Cost price; not always available from K3Mart API |

### externalRevenue

| Field | Reason |
|-------|--------|
| outletId | Not all revenue records link to an outlet |
| externalProductCode | Not always available |
| productName | Not always available from all data origins |
| quantitySold | Not always available |
| transactionCount | Not always available |
| revenueGross | Not always available |
| revenueNet | Not always available |
| costOfGoods | Not always available |
| syncLogId | Only for synced records |
| linkedMenuProductId | Only if product is mapped to internal product |
| externalTransactionId | Only for platform-sourced transactions |
| transactionDate | Only for transaction-level records |
| transactionType | Only for transaction-level records |
| commission | Only for GoBiz transactions with commission |
| adBurn | Only for GoBiz ad-campaign costs |
| promoBurn | Only for GoBiz promotional discounts |
| gobizOrderNumber | Only for GoBiz orders |

### externalRevenueItems

| Field | Reason |
|-------|--------|
| externalItemId | Not always available from platform |
| variants | Only if product has variant details |
| linkedMenuProductId | Only if auto-matched to internal product |
| matchConfidence | Only if matching was attempted |

### externalSyncLogs

| Field | Reason |
|-------|--------|
| outletId | Not all syncs are outlet-specific |
| snapshotBatchId | Only for stock snapshot syncs |
| productsCount | Only set on success |
| errorMessage | Only set on error |
| durationMs | Only set on completion |
| triggeredBy | Optional tracking field |

### externalProductMappings

| Field | Reason |
|-------|--------|
| menuProductId | Not all external products are mapped yet |

### platformCredentials

| Field | Reason |
|-------|--------|
| email | Not all platforms use email login |
| password | Not all platforms use password login |
| currentToken | Only set after successful token refresh |
| tokenExpiresAt | Only set with active token |
| refreshToken | Only for platforms with OAuth refresh (GoBiz) |
| lastRefreshAt | Only set after first refresh attempt |
| lastRefreshStatus | Only set after first refresh attempt |
| lastRefreshError | Only set on refresh error |

### gofoodDepotStock

| Field | Reason |
|-------|--------|
| stickerDeficit | Only tracked if deficit exists |

### k3martDispatchPlans

| Field | Reason |
|-------|--------|
| source | Optional source location |
| sourceOutletId | Only for outlet-sourced dispatches |
| destinationOutletId | Only for outlet-destination dispatches |
| destination | Optional destination location |
| submissionInProgress | Boolean flag for K3Mart API submission state |
| k3martRequestId | Only after K3Mart API submission |
| submittedAt | Only after submission |
| submittedBy | Only after submission |
| updatedBy | Only after update |

### k3martStockMovements

| Field | Reason |
|-------|--------|
| source | Optional source location |
| k3martRequestId | Only after K3Mart API submission |
| k3martStatus | Only after K3Mart API response |
| destination | Optional destination location |
| destinationOutletId | Only for outlet-destination movements |
| note | Optional movement note |

### restockTargets

| Field | Reason |
|-------|--------|
| outletId | Only for K3Mart outlet-specific targets |
| menuProductId | Only if mapped to internal product |

### manualStockEntries

| Field | Reason |
|-------|--------|
| menuProductId | Only if linked to internal product |

### menuProductComponents

| Field | Reason |
|-------|--------|
| consumptionStage | Override; inherits from componentType if absent |

### orderMessages

| Field | Reason |
|-------|--------|
| messagePreview | Optional first 100 chars of message |

### menuProducts

| Field | Reason |
|-------|--------|
| posSlot | Only for products assigned to food POS |
| packagingPosSlot | Only for products assigned to packaging POS |
| unitCostStaleAt | Only set when cost is stale, cleared after recalculation |

---

## Category B: Candidates for Required

Fields that are `v.optional()` in schema but should always have values. These require backfill migrations before schema tightening.

| Table | Field | Why Likely Required | Default If Missing |
|-------|-------|--------------------|--------------------|
| ingredients | costPerBaseUnit | Calculated on create/update via cost formula | Recalculate from `(priceExclShipping + shippingCost) / normalizedVolume` |
| ingredients | baseUnit | Derived from unitType on create/update | Derive from unitType: kg->g, l->ml, else same |
| packagingMaterials | costPerBaseUnit | Same pattern as ingredients | Same calculation |
| packagingMaterials | baseUnit | Same pattern as ingredients | Same derivation |
| menuProducts | unitCost | COGS calculated from BOM components | `0` (no cost data) |
| menuProducts | cachedProductionSummary | Refreshed by BOM operations | `""` (empty string) |
| menuProducts | productType | Set during BOM refactor | `"food"` (default) |
| orders | isKitchenVisible | Added in Phase 7, all orders should have it | Compute from status via `computeKitchenVisibility()` |
| orders | finalTotal | Should equal `totalAmount - orderLevelDiscount` | Compute from `totalAmount - (orderLevelDiscount ?? 0)` |
| kitchenInventory | totalProducedOriginal | Cumulative counter, added later | `0` |
| kitchenInventory | totalProducedBiteSized | Cumulative counter, added later | `0` |
| kitchenInventory | updatedBy | Tracking field, should always be set | `"system"` |
| productionUnitTypes | color | Display field with sensible default | `"#93C572"` |

**NOTE:** `orders.completedAt` was initially considered Category B but is actually Category A (legitimately optional). Only terminal orders (CompleteShipped, PickedUp, Cancelled) have this value; active orders correctly have `undefined`. The backfill in Plan 03 fills it for historical terminal orders for data completeness, but the field stays `v.optional()`.

---

## Category C: DEPRECATED - Remove Entirely

Fields that are deprecated and should be removed from the schema after code cleanup.

| Table | Field | Status | Code References to Clean |
|-------|-------|--------|--------------------------|
| menuProducts | productionType | DEPRECATED Phase 6 -- BOM is source of truth | Seed data in `menuProducts/mutations.ts` |
| menuProducts | productionUnits | DEPRECATED Phase 6 -- BOM is source of truth | Seed data in `menuProducts/mutations.ts` |
| menuProducts | isFixed | Replaceable by `posSlot/packagingPosSlot` check | `menuProducts/mutations.ts` (remove mutation), `MenuProductsManager.tsx` (lock icon), `useMenuProducts.ts` (useConvexFixedProducts) |
| orderItems | productionType | DEPRECATED Phase 6 -- `orderItemProduction` records are source of truth | Fallback code in `orders/queries.ts` (6 locations), `orders/mutations/packaging.ts` (2 locations), `orders/whatsapp.ts` (1 location) |
| orderItems | productionUnits | DEPRECATED Phase 6 -- `orderItemProduction` records are source of truth | Same fallback locations as productionType |

**Dead Code (not a schema field but related cleanup):**

| Item | Location | Status |
|------|----------|--------|
| `useConvexFixedProducts` hook | `src/hooks/convex/useMenuProducts.ts` | Exported but never imported anywhere (dead code) |

---

## Category D: Table-Level Assessment

| Table | Status | Notes |
|-------|--------|-------|
| kitchenInventory | **KEEP** | Actively used by Kitchen V2/V3 ball tray system (`getTrayInventory`, `addBallsToTray`, `fillPendingOrders`, `removeBallFromTray`, `boxProducts`) |
| productionUnitTypes | **KEEP** | FK from `orderItemProduction.productionUnitTypeId`. Superseded by `componentTypes` (production category) but cannot be removed while FK exists |

---

## Removal Log

Documenting all fields, tables, and code to be removed in this phase, and why.

### Schema Fields to Remove

| # | Table | Field | Reason | Prerequisite |
|---|-------|-------|--------|--------------|
| 1 | menuProducts | productionType | Deprecated Phase 6. Ball composition derived from BOM (`menuProductComponents` + `componentTypes`). | Remove from seed data |
| 2 | menuProducts | productionUnits | Deprecated Phase 6. Ball count derived from BOM. | Remove from seed data |
| 3 | menuProducts | isFixed | Original purpose (POS products) replaced by `posSlot`. Deletion-protection can use `posSlot !== undefined \|\| packagingPosSlot !== undefined` check. | Migrate protection logic, remove frontend lock icon |
| 4 | orderItems | productionType | Deprecated Phase 6. `orderItemProduction` records are source of truth for production tracking. | Verify all historical orders have production records, remove fallback code |
| 5 | orderItems | productionUnits | Deprecated Phase 6. Same as productionType. | Same as productionType |

### Dead Code to Remove

| # | Item | Location | Reason |
|---|------|----------|--------|
| 6 | `useConvexFixedProducts` hook | `src/hooks/convex/useMenuProducts.ts` | Exported but never imported by any component. References `isFixed` which is being removed. |

---

## Denormalization Inventory

All denormalized fields across the schema, organized by formal category.

### SNAPSHOT (frozen at creation, never updated)

Data copied from a source record at creation time. The snapshot preserves the value as it was when the event occurred, even if the source record changes later.

| Table | Field | Source | Captured At |
|-------|-------|--------|-------------|
| orders | customerName | `customers.name` | Order creation |
| orders | customerPhone | `customers.phone` | Order creation |
| orders | voucherCode | `vouchers.code` | Order creation |
| orders | voucherDiscountValue | Calculated from voucher | Order creation |
| orderItems | productName | Manual entry or `menuProducts.name` | Item creation |
| orderItems | unitPrice | Manual entry or `menuProducts.defaultPrice` | Item creation |
| orderItems | unitCost | `menuProducts.unitCost` | Item creation |
| orderItemProduction | productionUnitCode | `productionUnitTypes.code` / `componentTypes.code` | Order confirmation |
| orderItemProduction | productionUnitName | `productionUnitTypes.name` / `componentTypes.name` | Order confirmation |
| componentIngredients | ingredientName | `ingredients.name` | Component creation |
| packagingComponentMaterials | materialName | `packagingMaterials.name` | Component creation |
| productVersions | recipeName | `recipes.name` | Version creation |
| productVersions | recipeVersionName | `recipeVersions.versionName` | Version creation |
| productVersions | packagingName | `packagingRecipes.name` | Version creation |
| productVersions | packagingVersionName | `packagingVersions.versionName` | Version creation |
| externalStockSnapshots | productName | External API response | Snapshot time |
| k3martStockMovements | priceAtSubmission | K3Mart state | K3Mart submission |
| k3martStockMovements | currentStockAtSubmission | K3Mart state | K3Mart submission |

### CACHE (refreshable/invalidatable)

Computed values stored for query performance. Can be recalculated from source data at any time.

| Table | Field | Source | Updated When |
|-------|-------|--------|--------------|
| ingredients | costPerBaseUnit | `(priceExclShipping + shippingCost) / normalizedVolume` | On ingredient edit |
| ingredients | baseUnit | Derived from `unitType` (kg->g, l->ml) | On ingredient edit |
| packagingMaterials | costPerBaseUnit | Same formula as ingredients | On material edit |
| packagingMaterials | baseUnit | Derived from `unitType` | On material edit |
| recipeVersions | cachedTotalCost | Sum of component costs via `componentIngredients` | On cost invalidation |
| recipeVersions | cachedCostPerGram | `cachedTotalCost / estimatedYieldGrams` | On cost invalidation |
| recipeVersions | costCacheUpdatedAt | Timestamp of recalculation | On cost invalidation |
| recipeComponents | cachedSubtotalCost | Sum of ingredient line costs | On cost invalidation |
| componentIngredients | cachedLineCost | `ingredientCost * quantity` from `ingredients.costPerBaseUnit` | On cost invalidation |
| packagingVersions | cachedTotalCost | Sum of material costs via `packagingComponentMaterials` | On cost invalidation |
| packagingVersions | costCacheUpdatedAt | Timestamp of recalculation | On cost invalidation |
| packagingComponents | cachedSubtotalCost | Sum of material line costs | On cost invalidation |
| packagingComponentMaterials | cachedLineCost | `materialCost * quantity` from `packagingMaterials.costPerBaseUnit` | On cost invalidation |
| productVersions | cachedCogs | COGS breakdown from `recipeVersions` + `packagingVersions` costs | On cost invalidation |
| productVersions | cogsCacheUpdatedAt | Timestamp of COGS recalculation | On cost invalidation |
| menuProducts | unitCost | Production COGS from BOM via `componentTypes.unitCostIdr` | By `recalculateAllCosts` or `invalidateMenuProductCosts` |
| menuProducts | unitCostStaleAt | Staleness marker | Set on `componentType` cost change, cleared after recalculation |
| menuProducts | cachedProductionSummary | Human-readable BOM summary (e.g., "1 Big, 2 Mid") | On BOM change |
| componentStock | totalStock | Sum of `inventoryBatches.quantityRemaining` | On batch change |
| componentStock | totalReserved | Sum of `inventoryBatches.quantityReserved` | On reservation change |
| componentStock | weightedUnitCostIdr | Weighted average from active batches | On batch change |
| componentStock | latestSupplierName | From most recent `inventoryBatch` | On new batch |
| componentStock | latestPurchaseUrl | From most recent `inventoryBatch` | On new batch |
| componentStock | latestUnitCostIdr | From most recent `inventoryBatch` | On new batch |
| componentStock | lastRestockTotalStock | Snapshot of `totalStock` at restock | On restock event |

### DERIVED (computed from other fields in same/related records)

Values computed from other fields. Updated as part of the same write operation.

| Table | Field | Derivation | Updated When |
|-------|-------|------------|--------------|
| orders | totalAmount | Sum of `orderItems.lineTotal` | On item add/remove/edit |
| orders | totalCost | Sum of `orderItems.lineCost` | On item add/remove/edit |
| orders | totalMargin | `totalAmount - totalCost` | On item add/remove/edit |
| orders | finalTotal | `totalAmount - orderLevelDiscount` | On discount change |
| orders | itemCount | Count of `orderItems` for this order | On item add/remove |
| orders | isKitchenVisible | From `status` via `computeKitchenVisibility()` | On every status transition |
| orders | completedAt | Set on terminal status transition | On CompleteShipped/PickedUp/Cancelled, cleared on revert |
| orderItems | lineTotal | `quantity * unitPrice - discountAmount` | On item creation/update |
| orderItems | lineCost | `quantity * unitCost` | On item creation/update |
| orderItems | lineMargin | `lineTotal - lineCost` | On item creation/update |
| orderItemProduction | unitsRemaining | `unitsRequired - unitsCompleted` | On each ball completion |
| inventoryBatches | unitCostIdr | `totalCostIdr / quantityPurchased` | On batch creation |

---

*This document is the canonical reference for schema field categorization. Update it when fields are added, removed, or reclassified.*

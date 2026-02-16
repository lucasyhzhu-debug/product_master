# Phase 8: Schema Cleanup - Research

**Researched:** 2026-02-14
**Domain:** Convex schema enforcement, data migration, denormalization documentation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Tightening aggressiveness
- Claude decides per field whether 100%-populated optional fields should become required, based on business context
- Fields where any documents lack the value stay optional -- no backfill-to-require for partially populated fields
- All schema tightening changes deployed in one deploy (not batched by table)
- Audit document lives in `docs/SCHEMA_AUDIT.md` as a permanent onboarding reference

#### Backfill defaults
- Claude decides appropriate default values per field based on business meaning (best-guess, placeholder, or zero as appropriate)
- Backfills are non-reversible -- fill forward, new value is canonical
- Backfill migrations run as one-shot mutations from dashboard (not scheduled functions)
- Two-step deploy: backfill first, verify data, then deploy schema tightening separately

#### Removal scope
- Remove ALL dead fields/tables discovered during audit, not just the named ones (isFixed, kitchenInventory)
- Deprecated BOM fields (productionType, productionUnits on menuProducts and orderItems) should be removed entirely from schema -- Phase 6 migration is complete
- Clean removal: run migration to set removed fields to undefined on all documents before dropping from schema
- Maintain a removal log in the audit document (docs/SCHEMA_AUDIT.md) documenting what was removed and why

#### Denormalization documentation
- Inline comments in schema.ts explain WHY the denormalization exists AND point to source of truth
- Include timing: when the snapshot/cache is captured and whether it's ever updated
- Use formal categories: SNAPSHOT (frozen at creation, never updated), CACHE (refreshable/invalidatable), DERIVED (computed from other fields)
- Document denormalization patterns both inline in schema.ts AND in a summary section in docs/SCHEMA.md

### Claude's Discretion
- Per-field categorization decisions (optional vs. required vs. needs-backfill)
- Specific default values for backfill migrations
- Discovery of additional dead fields/tables beyond the named ones
- Exact comment format and wording for denormalization annotations

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Summary

Phase 8 is a pure schema hygiene phase with no new features. The work involves auditing all optional fields in `convex/schema.ts`, categorizing them, tightening those that should be required, removing deprecated/dead fields and tables, and documenting all denormalization patterns.

The schema currently has **215 `v.optional()` fields** across 37+ tables (the original estimate of 167 is outdated due to fields added in Phases 6-7). The work divides into four workstreams: (1) field audit and categorization, (2) backfill migrations + schema tightening, (3) deprecated field/table removal, and (4) denormalization documentation.

**Critical discovery: Two items originally slated for removal are NOT dead:**
- **`kitchenInventory` table** -- Actively used by Kitchen V2/V3 views (ball tray system, boxing pipeline). Has active queries (`getTrayInventory`) and mutations (`addBallsToTray`, `fillPendingOrders`, `removeBallFromTray`, `boxProducts`). Cannot be removed.
- **`menuProducts.isFixed` field** -- Actively used by backend (`remove` mutation blocks deletion when `isFixed === true`) and frontend (`MenuProductsManager.tsx` shows lock icon and disables delete button, `useConvexFixedProducts` hook filters by it). However, its original purpose (determining POS products) has been replaced by `posSlot`. The deletion-protection behavior could be replaced by checking if the product has a `posSlot` assigned, making `isFixed` a candidate for removal IF we migrate the protection logic.

**Primary recommendation:** Execute as a carefully sequenced two-deploy pipeline: Deploy 1 runs all backfill migrations and field cleanup migrations, then Deploy 2 tightens the schema. Each deploy must be preceded by a production database backup.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend schema enforcement | Project's existing backend |
| TypeScript | ~5.9 | Type checking against schema | Catches schema/code mismatches at build time |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Convex Dashboard | (web) | Run one-shot migration mutations | For all backfill/cleanup migrations |
| `npx convex export` | CLI | Database backup | Before every deploy |

### Alternatives Considered
N/A -- This phase modifies existing infrastructure, no new libraries needed.

## Architecture Patterns

### Pattern 1: Convex Schema Enforcement Rules
**What:** Convex validates all existing documents against the schema on deploy. If any document violates the schema, the deploy fails.
**Confidence:** HIGH (verified via Context7 official docs)
**When to use:** Understanding deploy constraints for this phase.

Key rules from Convex docs:
1. **Schema must always match existing data.** You cannot push a schema with a required field if any document lacks that field.
2. **Safe change sequence for tightening:** Add optional field -> set field on all documents -> make field required.
3. **Safe change sequence for removal:** Mark existing field optional -> remove field from all documents (set to `undefined`) -> remove field from schema.
4. **Schema validation can be temporarily disabled** with `schemaValidation: false` in `defineSchema()` -- but this is a last resort, not recommended.

### Pattern 2: Two-Step Deploy Pipeline
**What:** Separate data mutations from schema changes across two deploys.
**When to use:** For all schema tightening and field removal in this phase.
**Example:**
```
Deploy 1: Backfill + Cleanup Migrations
  1. Backup production database
  2. Deploy code that includes migration mutations (schema unchanged or only loosened)
  3. Run migration mutations from dashboard
  4. Verify data: spot-check tables, confirm all target fields populated

Deploy 2: Schema Tightening
  1. Backup production database (again)
  2. Deploy schema with optional->required changes and field/table removals
  3. Convex validates all documents -- deploy succeeds or fails atomically
  4. Verify: npm run build passes, frontend works
```

### Pattern 3: One-Shot Migration Mutation
**What:** A mutation registered in `convex/migrations/` that reads all documents in a table and patches them.
**When to use:** For backfilling defaults and clearing deprecated fields.
**Example:**
```typescript
// convex/migrations/schemaCleanup.ts
import { mutation } from "../_generated/server";

export const backfillIsKitchenVisible = mutation({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect();
    let patched = 0;
    for (const order of orders) {
      if (order.isKitchenVisible === undefined) {
        const visible = computeIsKitchenVisible(order.status);
        await ctx.db.patch(order._id, { isKitchenVisible: visible });
        patched++;
      }
    }
    return { total: orders.length, patched };
  },
});
```

### Pattern 4: Field Removal Sequence
**What:** Three-step process to safely remove a field from Convex.
**When to use:** For productionType, productionUnits, isFixed removal.
**Steps:**
1. Remove all code reads/writes of the field (queries, mutations, frontend)
2. Run migration to set field to `undefined` on all documents
3. Remove field from schema definition
4. Deploy

### Anti-Patterns to Avoid
- **Combining data migration and schema tightening in one deploy:** If the migration fails partway through, the deploy might succeed with inconsistent data, or fail leaving the system in a bad state. Always separate.
- **Removing a field from schema before clearing it from documents:** Convex will reject the deploy if any document has a field not in the schema (when strict mode).
- **Batch-processing mutations that exceed Convex limits:** Convex mutations have a maximum execution time. For tables with thousands of documents, process in batches or use pagination.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation | Manual document checking | Convex's built-in schema enforcement | Convex validates on deploy automatically |
| Batch processing | Custom pagination logic | Convex `.collect()` + loop | Tables are small enough (< 10K docs) |

**Key insight:** Convex handles schema validation automatically. The migration mutations just need to patch data -- Convex does the enforcement.

## Common Pitfalls

### Pitfall 1: Mutation Timeout on Large Tables
**What goes wrong:** A migration mutation that patches every document in a large table may exceed Convex's mutation execution time limit.
**Why it happens:** Convex mutations have execution limits. Tables like `orderItems`, `orders`, `externalRevenue` could have thousands of rows.
**How to avoid:** Check table sizes in dashboard before running. If > 5,000 documents, split migration into batches with cursor-based pagination (process N at a time, return cursor, call again).
**Warning signs:** Mutation returns error about execution time exceeded.

### Pitfall 2: kitchenInventory Is NOT Dead
**What goes wrong:** Removing `kitchenInventory` table would break the entire Kitchen V2/V3 production pipeline.
**Why it happens:** Original phase spec listed it as dead, but research shows it's actively used by:
- `convex/orders/queries.ts` - `getTrayInventory` query
- `convex/orders/mutations/kitchen.ts` - `addBallsToTray`, `fillPendingOrders`, `removeBallFromTray`, `boxProducts` mutations
- `src/pages/KitchenViewV2.tsx` - Ball tray display
- `src/components/kitchen/BoxingPanel.tsx` - Ball count for boxing
- `src/components/kitchen/ProductionLogPanel.tsx` - Tray stats display
**How to avoid:** Do NOT remove `kitchenInventory`. It is a live production system table.

### Pitfall 3: isFixed Is NOT Dead (But Is Replaceable)
**What goes wrong:** Removing `isFixed` without migrating deletion-protection logic would allow deletion of core menu products.
**Why it happens:** `isFixed` is used in:
- Backend: `menuProducts/mutations.ts` line 358 -- blocks deletion
- Frontend: `MenuProductsManager.tsx` -- shows lock icon, disables delete button
- Seed data: `seedFixedProducts` mutation sets `isFixed: true` on 4 products
- Frontend hook: `useConvexFixedProducts` filters by `isFixed === true` (exported but NOT imported anywhere besides index.ts)
**How to avoid:** Before removing `isFixed`, migrate deletion-protection to check `posSlot !== undefined` instead. Then remove the field. The `useConvexFixedProducts` hook can be removed since it's not used (only exported).

### Pitfall 4: Deprecated Order Statuses Still Referenced
**What goes wrong:** `ProductionComplete` and `Packaging` statuses are marked DEPRECATED in schema but are still actively used in code.
**Why it happens:** Multiple queries and mutations reference these statuses:
- `convex/orders/queries.ts` - Kitchen stats, packaging orders query
- `convex/orders/mutations/orderCrud.ts` - Status transitions
- `convex/orders/mutations/packaging.ts` - completePackaging, revertToPackaging
- `convex/orders/helpers/statusTransitions.ts` - Kitchen visibility computation
- `convex/orders/helpers/ballDistribution.ts` - Auto-transition to Packaging
**How to avoid:** Do NOT remove `ProductionComplete` or `Packaging` from the status union in this phase. They are "deprecated" in the sense of the intended future direction, but they are still live in production code. Removing them requires a separate effort to migrate all orders off these statuses and update all code paths.

### Pitfall 5: productionType/productionUnits Fallback Code
**What goes wrong:** Removing deprecated `productionType`/`productionUnits` fields from `orderItems` would break historical order display.
**Why it happens:** Multiple query functions have dual-read patterns:
```typescript
// NEW system: orderItemProduction records
if (activeRecords.length > 0) { /* use BOM records */ continue; }
// FALLBACK: Deprecated fields for historical orders (pre-BOM)
if (item.productionType === "original" && item.productionUnits) { ... }
```
These fallbacks exist in: `calculateBallStats`, kitchen stats query (lines ~720-730), completed stats (lines ~758-763), individual order detail (lines ~1115-1120), `packaging.ts` helpers.
**How to avoid:** Before removing fields from schema, remove all fallback code paths (the fields will be `undefined` on all documents after cleanup migration, so the fallback code is already a no-op IF all orderItemProduction records exist). Verify that ALL historical order items have corresponding `orderItemProduction` records before removing fallback code. If any don't, backfill those records first.

### Pitfall 6: Seed Data Still Sets Deprecated Fields
**What goes wrong:** The `seedFixedProducts` mutation in `menuProducts/mutations.ts` still writes `productionType` and `productionUnits` to new documents.
**Why it happens:** Seed data retained deprecated fields with DEPRECATED comments for backward compatibility.
**How to avoid:** Remove deprecated fields from seed data before removing from schema. The seed data should only set BOM-compatible fields.

## Code Examples

### Migration: Backfill a Default Value
```typescript
// convex/migrations/schemaCleanup.ts
export const backfillOrderCompletedAt = mutation({
  args: {},
  handler: async (ctx) => {
    const terminalStatuses = ["CompleteShipped", "PickedUp", "Cancelled"];
    const orders = await ctx.db.query("orders").collect();
    let patched = 0;
    for (const order of orders) {
      if (order.completedAt === undefined && terminalStatuses.includes(order.status)) {
        // Use _creationTime as best-guess for historical orders
        await ctx.db.patch(order._id, { completedAt: order._creationTime });
        patched++;
      }
    }
    return { total: orders.length, patched };
  },
});
```

### Migration: Clear Deprecated Field
```typescript
export const clearDeprecatedProductionType = mutation({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("orderItems").collect();
    let cleared = 0;
    for (const item of items) {
      if (item.productionType !== undefined || item.productionUnits !== undefined) {
        await ctx.db.patch(item._id, {
          productionType: undefined,
          productionUnits: undefined,
        });
        cleared++;
      }
    }
    return { total: items.length, cleared };
  },
});
```

### Denormalization Comment Format
```typescript
// In schema.ts:
orders: defineTable({
  // ...
  // SNAPSHOT: Copied from customers.name at order creation. Never updated after.
  // Source of truth: customers table (customerId field).
  customerName: v.string(),
  // SNAPSHOT: Copied from customers.phone at order creation. Never updated after.
  customerPhone: v.optional(v.string()),
  // DERIVED: Computed from orderItems at order creation/update. Updated on item add/remove.
  totalAmount: v.number(),
  // CACHE: Updated by cost invalidation system when component costs change.
  // Source of truth: componentTypes.unitCostIdr via menuProductComponents.
  // Set to stale via unitCostStaleAt; recalculated by recalculateAllCosts mutation.
  unitCost: v.optional(v.number()),
})
```

## Detailed Field Audit

### Field Categorization Summary

The 215 `v.optional()` fields across the schema fall into these categories:

#### Category A: Legitimately Optional (business semantics require optionality)
These fields are optional because not all documents should have them.

| Table | Field | Reason |
|-------|-------|--------|
| ingredients | brand | Not all ingredients have a brand |
| ingredients | procurementSource | Not always tracked |
| packagingMaterials | brand, procurementSource | Same as ingredients |
| customers | phone, source, notes | Customer info may be incomplete |
| orders | dueDate | Not all orders have a due date |
| orders | paymentMethod | Only set when payment received |
| orders | channel, soldBy | Sales tracking is optional |
| orders | pickupLocation | Only for pickup orders |
| orders | deliveryAddress | Only for delivery orders |
| orders | contactWa, contactIg | Contact info optional |
| orders | shippingAgency, shippingNumber | Only for shipped orders |
| orders | cancellationReason, cancellationCategory, cancelledAt | Only for cancelled orders |
| orders | notes | Optional notes |
| orders | voucherId, voucherCode, voucherDiscountValue | Only if voucher applied |
| orders | orderLevelDiscount, orderLevelDiscountType, finalTotal | Only if discount applied |
| orders | awaitingPaymentSince, confirmedAt | Status-specific timestamps |
| orders | lowPriceConfirmed | Only for low-value orders |
| orderItems | productVariant | Not all items have variants |
| orderItems | menuProductId | Custom/ad-hoc items have no menu product link |
| orderItems | packageStatus, ballsFilled, packedPackageIndices | Only for production items |
| orderItems | isProductionComplete, isCancelled | Boolean flags, absent = false |
| orderItemProduction | isCancelled | Boolean flag, absent = false |
| recipeVersions | description, estimatedYieldGrams | Optional metadata |
| recipeVersions | copiedFromVersionId | Only for copied versions |
| packagingVersions | description, copiedFromVersionId | Same pattern |
| productVersions | description, copiedFromVersionId | Same pattern |
| recipeComponents | linkedRecipeVersionId | Only for linked components |
| vouchers | description, minimumOrderAmount, maximumDiscount | Optional constraints |
| vouchers | validFrom, validUntil | Optional validity period |
| vouchers | usageLimit, usagePerCustomer | Optional limits |
| vouchers | isManagerOverride, overrideReason, overrideOrderId | Only for overrides |
| vouchers | updatedAt | Only set after first update |
| componentTypes | gramsPerUnit | Only for production components |
| componentTypes | description, reorderPoint, reorderQuantity | Optional settings |
| componentTypes | consumptionStage | Default can be inferred from category |
| componentTypes | alarmPercentage, color | Optional display settings |
| storageLocations | address, isDefault | Optional metadata |
| inventoryBatches | supplierBrand, purchaseReference, purchaseUrl | Optional purchase details |
| inventoryBatches | expiryDate | Only for perishables |
| componentStock | latestSupplierName, latestPurchaseUrl, latestUnitCostIdr | May not have batches yet |
| componentStock | lastRestockTotalStock | Only set after first restock |
| componentTransactions | batchId | Not all transactions affect a specific batch |
| componentTransactions | orderId, transferId, referenceNote | Context-specific links |
| orderComponentReservations | consumptionStage | Snapshot, may not exist for old reservations |
| orderComponentReservations | consumedAt | Only when consumed |
| feedback | elementSelector, comments, createdBy | Optional feedback metadata |
| users | avatarUrl, locationId, lockedUntil, lastLoginAt | Optional user metadata |
| sessions | lastActiveAt | Tracking field |
| whatsappTemplates | description, lastEditedBy, lastEditedAt | Optional metadata |
| orderEvents | fromStatus, toStatus, reason, category, metadata, triggeredBy | Event-specific fields |
| productionTargets | manualOverride, createdBy | Optional fields |
| productionCounts | shippedToGoldfinch, lastResetAt, lastResetBy | Optional tracking |
| productionLog | orderId, orderItemId, note | Context-specific |
| externalOutlets | address, lastSyncAt, lastSyncStatus, lastSyncError | Sync-specific |
| externalStockSnapshots | priceGrabfoodGofood, priceGrabmart, priceShopee, capital | Platform-specific |
| externalRevenue | (many optional fields) | Flexible multi-source data |
| externalRevenueItems | externalItemId, variants, linkedMenuProductId, matchConfidence | Optional matching |
| externalSyncLogs | outletId, snapshotBatchId, productsCount, errorMessage, durationMs, triggeredBy | Event-specific |
| externalProductMappings | menuProductId | Not all mapped yet |
| platformCredentials | (many optional) | Progressive credential storage |
| gofoodDepotStock | stickerDeficit | Only tracked if deficit exists |
| k3martDispatchPlans | (many optional) | Progressive status tracking |
| k3martStockMovements | (many optional) | Context-specific |
| restockTargets | outletId, menuProductId | Optional links |
| manualStockEntries | menuProductId | Optional link |
| menuProductComponents | consumptionStage | Override, inherits from componentType |

#### Category B: Candidates for Required (likely all documents have values)
These fields are optional in schema but likely always populated. **Must verify via database query before tightening.**

| Table | Field | Why Likely Required | Default If Missing |
|-------|-------|--------------------|--------------------|
| ingredients | costPerBaseUnit | Calculated on create/update | Recalculate from price/volume |
| ingredients | baseUnit | Calculated on create/update | Derive from unitType |
| packagingMaterials | costPerBaseUnit | Same pattern | Same |
| packagingMaterials | baseUnit | Same pattern | Same |
| menuProducts | unitCost | COGS calculated from BOM | 0 (no cost) |
| menuProducts | cachedProductionSummary | Refreshed by BOM operations | "" (empty string) |
| menuProducts | productType | Set during BOM refactor | "food" (default) |
| orders | isKitchenVisible | Added in Phase 7 | Compute from status |
| orders | completedAt | Added for terminal orders | _creationTime for historical terminal orders |
| orders | finalTotal | Should be totalAmount - discount | Compute from totalAmount |
| kitchenInventory | totalProducedOriginal | Added later, always 0 for new | 0 |
| kitchenInventory | totalProducedBiteSized | Added later, always 0 for new | 0 |
| kitchenInventory | updatedBy | Tracking field | "system" |
| productionUnitTypes | color | Display field, has default | "#93C572" |

#### Category C: DEPRECATED - Remove Entirely
| Table | Field | Status | Code References to Clean |
|-------|-------|--------|-------------------------|
| menuProducts | productionType | DEPRECATED Phase 6 | Seed data only (mutations.ts line 473-507) |
| menuProducts | productionUnits | DEPRECATED Phase 6 | Seed data only |
| menuProducts | isFixed | Replaceable | mutations.ts (remove), MenuProductsManager.tsx, useMenuProducts.ts |
| orderItems | productionType | DEPRECATED Phase 6 | Fallback code in queries.ts (6 locations), packaging.ts |
| orderItems | productionUnits | DEPRECATED Phase 6 | Same fallback locations |

#### Category D: Table-Level Removal Candidates
| Table | Status | References |
|-------|--------|------------|
| kitchenInventory | **ACTIVELY USED - DO NOT REMOVE** | queries.ts, kitchen.ts, KitchenViewV2, BoxingPanel, ProductionLogPanel |
| productionUnitTypes | Superseded by componentTypes (production category) but may still be referenced | Need to verify no remaining references |

### Deprecated Status Values
The `orders.status` union includes `ProductionComplete` and `Packaging` marked as deprecated, but they are **actively used in production code** across 20+ locations. These MUST NOT be removed in this phase.

## Denormalization Inventory

### SNAPSHOT patterns (frozen at creation, never updated)
| Table | Field | Source | When Captured |
|-------|-------|--------|---------------|
| orders | customerName | customers.name | Order creation |
| orders | customerPhone | customers.phone | Order creation |
| orders | voucherCode | vouchers.code | Order creation |
| orders | voucherDiscountValue | (calculated) | Order creation |
| orderItems | productName | Manual or menuProducts.name | Item creation |
| orderItems | unitPrice | Manual or menuProducts.defaultPrice | Item creation |
| orderItems | unitCost | menuProducts.unitCost | Item creation |
| orderItemProduction | productionUnitCode | productionUnitTypes.code / componentTypes.code | Order confirmation |
| orderItemProduction | productionUnitName | productionUnitTypes.name / componentTypes.name | Order confirmation |
| componentIngredients | ingredientName | ingredients.name | Component creation |
| packagingComponentMaterials | materialName | packagingMaterials.name | Component creation |
| productVersions | recipeName | recipes.name | Version creation |
| productVersions | recipeVersionName | recipeVersions.versionName | Version creation |
| productVersions | packagingName | packagingRecipes.name | Version creation |
| productVersions | packagingVersionName | packagingVersions.versionName | Version creation |
| externalStockSnapshots | productName | External API | Snapshot time |
| k3martStockMovements | priceAtSubmission, currentStockAtSubmission | External state | Submission time |

### CACHE patterns (refreshable/invalidatable)
| Table | Field | Source | When Updated |
|-------|-------|--------|--------------|
| recipeVersions | cachedTotalCost, cachedCostPerGram | Calculated from ingredients | On ingredient cost change (via costInvalidation) |
| recipeVersions | costCacheUpdatedAt | Timestamp | Same |
| recipeComponents | cachedSubtotalCost | Calculated from ingredients | Same |
| componentIngredients | cachedLineCost | ingredientCost * quantity | Same |
| packagingVersions | cachedTotalCost, costCacheUpdatedAt | Calculated from materials | On material cost change |
| packagingComponents | cachedSubtotalCost | Calculated from materials | Same |
| packagingComponentMaterials | cachedLineCost | materialCost * quantity | Same |
| productVersions | cachedCogs, cogsCacheUpdatedAt | Calculated from recipe + packaging | On recipe/packaging cost change |
| menuProducts | unitCost | From BOM (componentTypes.unitCostIdr) | On component cost change, recalculateAllCosts |
| menuProducts | unitCostStaleAt | Timestamp | Set on component cost change, cleared on recalculate |
| menuProducts | cachedProductionSummary | From BOM composition | On BOM change |
| componentStock | totalStock, totalReserved, weightedUnitCostIdr | Aggregated from inventoryBatches | On batch change |
| componentStock | latestSupplierName, latestPurchaseUrl, latestUnitCostIdr | Most recent batch | On new batch |
| componentStock | lastRestockTotalStock | Snapshot of totalStock | On restock |
| ingredients | costPerBaseUnit, baseUnit | Calculated from price/volume/unitType | On ingredient update |
| packagingMaterials | costPerBaseUnit, baseUnit | Same pattern | On material update |

### DERIVED patterns (computed from other fields in same document)
| Table | Field | Derivation |
|-------|-------|------------|
| orders | totalAmount, totalCost, totalMargin | Sum of orderItems line totals/costs/margins |
| orders | finalTotal | totalAmount - orderLevelDiscount |
| orders | itemCount | Count of orderItems |
| orders | isKitchenVisible | Computed from status |
| orderItems | lineTotal | quantity * unitPrice - discountAmount |
| orderItems | lineCost | quantity * unitCost |
| orderItems | lineMargin | lineTotal - lineCost |
| orderItemProduction | unitsRemaining | unitsRequired - unitsCompleted |
| inventoryBatches | unitCostIdr | totalCostIdr / quantityPurchased |

## Open Questions

1. **Table sizes for migration feasibility**
   - What we know: The migration mutations need to patch all documents in target tables.
   - What's unclear: Exact document counts in production for `orders`, `orderItems`, `externalRevenue` tables.
   - Recommendation: Check table sizes in Convex dashboard before running migrations. If any table has > 5,000 documents, implement cursor-based batch processing in the migration mutations.

2. **Historical orders without orderItemProduction records**
   - What we know: Some very old orders may have `productionType`/`productionUnits` on orderItems but no corresponding `orderItemProduction` records (created before BOM system).
   - What's unclear: Whether the existing migration (`orders/mutations/migrations.ts:backfillMissingProductionRecords`) was run successfully on all historical data.
   - Recommendation: Run `orders:debugProductionRecords` query to verify coverage before removing fallback code.

3. **productionUnitTypes table redundancy**
   - What we know: `componentTypes` with `category="production"` duplicates `productionUnitTypes` data. But `orderItemProduction` has a FK to `productionUnitTypes` (field `productionUnitTypeId`).
   - What's unclear: Whether `productionUnitTypes` can be removed if `orderItemProduction` still references it.
   - Recommendation: Do NOT remove `productionUnitTypes` in this phase. The FK in `orderItemProduction` makes it a live dependency. Removal would require migrating the FK to `componentTypes`, which is a separate effort.

4. **isFixed replacement strategy**
   - What we know: `isFixed` protects 4 core products from deletion. The `posSlot` field now determines POS visibility.
   - What's unclear: Whether the user wants deletion protection to be based on `posSlot` assignment (any product in POS can't be deleted) or removed entirely (admin can delete anything).
   - Recommendation: Replace `isFixed` deletion-protection with `posSlot !== undefined || packagingPosSlot !== undefined` check. This protects any POS-assigned product from accidental deletion, which is the practical intent.

## Risk Assessment

### Low Risk
- Denormalization documentation (comments only, no code changes)
- Backfill migrations for well-understood fields (isKitchenVisible, completedAt)

### Medium Risk
- Schema tightening (optional -> required) -- mitigated by two-step deploy
- isFixed removal (requires code migration first)
- Seed data cleanup (deprecated fields in seedFixedProducts)

### High Risk
- Removing productionType/productionUnits from orderItems schema -- requires removing all fallback code AND verifying all historical orders have production records
- Large table migrations that might timeout

## Sources

### Primary (HIGH confidence)
- `/llmstxt/convex_dev_llms_txt` - Schema validation, optional fields, safe changes documentation
- `convex/schema.ts` (line-by-line audit) - All 215 optional fields catalogued
- `convex/orders/queries.ts` - Fallback code patterns for deprecated fields
- `convex/orders/mutations/kitchen.ts` - kitchenInventory active usage
- `convex/menuProducts/mutations.ts` - isFixed active usage
- `src/hooks/convex/useMenuProducts.ts` - isFixed frontend usage
- `src/pages/KitchenViewV2.tsx`, `src/components/kitchen/` - kitchenInventory frontend usage

### Secondary (MEDIUM confidence)
- `convex/migrations/` - Existing migration patterns (bomBackfill, bomVerification, bomRefactorV2)
- Field population assumptions (Category B) - Based on code analysis, need database verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Convex is the existing backend, well-documented
- Architecture: HIGH - Two-step deploy is documented Convex best practice
- Pitfalls: HIGH - All discoveries verified by reading actual code references
- Field audit: MEDIUM - Categorization based on code analysis; actual field population rates need database verification before tightening

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (schema is stable, no fast-moving dependencies)

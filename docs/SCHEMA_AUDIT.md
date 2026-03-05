# Convex Schema Audit Report

> **Audit Date:** 2026-03-05
> **Schema Version:** v1.5 (post-Financial Statements milestone)
> **Auditor:** Automated schema-architect audit (Phase 35)
> **Scope:** All 65 `defineTable` definitions in `convex/schema.ts` (1,600 LOC), cross-referenced against all backend query/mutation files, `crons.ts`, and `http.ts`
> **Previous Audit:** v1.0 Phase 8 (2026-02-14) -- archived as `docs/SCHEMA_AUDIT_2026-02-14.md`

---

## Summary Scorecard

| Category | Critical | Moderate | Low | Total |
|----------|----------|----------|-----|-------|
| Duplicate Data | 0 | 1 | 1 | 2 |
| Unused Tables/Fields | 0 | 1 | 3 | 4 |
| Missing Indexes | 1 | 2 | 0 | 3 |
| Denormalization Waste | 0 | 0 | 1 | 1 |
| Over-indexing | 0 | 8 | 14 | 22 |
| Cross-table Integrity | 0 | 2 | 0 | 2 |
| Table Merge Candidates | 0 | 0 | 2 | 2 |
| Index Range Bounds Anti-patterns | 0 | 6 | 0 | 6 |
| **TOTAL** | **1** | **20** | **21** | **42** |

**Estimated Quick-Win Effort:** ~2 hours (index removals + missing index additions + one query fix)
**Estimated Full Remediation:** ~6-8 hours (includes field removals, denormalization cleanup, anti-pattern fixes)

---

## 1. Duplicate Data

### DUP-01: `dispatchChannelConfig.commissionRate` duplicates consignment-level data (Moderate)

**Tables:** `dispatchChannelConfig`, `consignmentOutlets`
**Description:** `dispatchChannelConfig` has a `commissionRate` field (line 1270) with the comment "unused -- net/gross tracked from external APIs." Meanwhile, `consignmentOutlets` also stores `commissionRate` (line 1542). Both fields serve different scopes (channel-level vs outlet-level), but the `dispatchChannelConfig` version is explicitly marked unused.
**Remediation:**
```typescript
// In dispatchChannelConfig defineTable, remove:
commissionRate: v.optional(v.number()), // unused -- net/gross tracked from external APIs
```
**Quick-win:** Yes -- field is explicitly marked unused. Verify zero documents have it populated, then remove from schema.

### DUP-02: `productionCounts` duplicates `productionLog` aggregation (Low)

**Tables:** `productionCounts`, `productionLog`
**Description:** `productionCounts` (line 505) stores running tallies (boxed, stickered, packed, shippedToGoldfinch) that are now derived from `productionLog` aggregation. The table is archived and read-only per Phase 8 decision. The `productionResets` table (line 568) also tracks reset timestamps that overlap with `productionCounts.lastResetAt`.
**Remediation:** Keep as-is. The table is intentionally archived per CONTEXT.md decision. No action needed -- just annotate.
**Quick-win:** No -- intentional archive.

---

## 2. Unused Tables/Fields

### UTF-01: Deprecated fields on `menuProducts` and `orderItems` (Low)

**Tables:** `menuProducts`, `orderItems`
**Fields:**
- `menuProducts.productionType` (line 103) -- `v.optional(v.string())`
- `menuProducts.productionUnits` (line 104) -- `v.optional(v.number())`
- `menuProducts.isFixed` (line 105) -- `v.optional(v.boolean())`
- `orderItems.productionType` (line 341) -- `v.optional(v.string())`
- `orderItems.productionUnits` (line 342) -- `v.optional(v.number())`

**Description:** All marked `// DEPRECATED: Legacy fields kept for schema compat with existing docs. Use BOM instead.` These fields are not read by any active query or mutation path. They exist purely for backward compatibility with production documents that may still have these fields populated.
**Remediation:** Keep as-is per CONTEXT.md decision. Removing requires verifying all existing documents have been cleaned, which risks production data.
**Quick-win:** No -- requires data migration verification.

### UTF-02: `bigsellerSyncState` singleton with no index (Low)

**Table:** `bigsellerSyncState`
**Description:** This is a singleton table (line 1497) with no indexes defined. The table stores sync progress state. Since it's a single-document table (like `kitchenConfig`, `dispatchPlannerSettings`, `productInventorySettings`), no indexes are needed -- queries use `.first()`. This is correct behavior, not a finding.
**Status:** Clean -- no action needed.

### UTF-03: `productionUnitTypes.by_active` index vs `componentTypes` (Low)

**Table:** `productionUnitTypes`
**Description:** The `productionUnitTypes` table (line 120) still has a `by_active` index defined (line 130). While the table itself is actively used (kitchen bridge in orderCrud, productionRecords, k3martCockpit, productionTargets), the `by_active` index has zero `.withIndex("by_active")` calls targeting `productionUnitTypes` specifically. However, since the table has only 2-3 documents, the index cost is negligible.
**Remediation:**
```typescript
// In productionUnitTypes, optionally remove:
.index("by_active", ["isActive"]),
```
**Quick-win:** Yes -- zero references, safe to remove. Negligible impact.

### UTF-04: `orders.createdByUserId` field low adoption (Moderate)

**Table:** `orders`
**Field:** `createdByUserId` (line 280) -- `v.optional(v.id("users"))`
**Description:** Added in Phase 14 for "Creator attribution (machine-readable link to users table)." However, this field is optional and older orders won't have it. No index exists for lookups by creator. The field IS written by `orderCrud.ts` on order creation but there's no query that filters by it. If "orders by creator" analytics are planned, an index should be added. If not, the field is a write-only attribute.
**Remediation:** If analytics by creator are planned, add:
```typescript
.index("by_creator", ["createdByUserId"])
```
If not needed, document as informational-only (no removal -- useful for audit trail).
**Quick-win:** No action needed unless analytics are planned.

---

## 3. Missing Indexes

### MIS-01: `sessions` cleanup does full table scan instead of using `by_expiry` (Critical)

**Table:** `sessions`
**File:** `convex/auth/mutations.ts:329-332`
**Description:** The `cleanupExpiredSessions` mutation queries all sessions with `.filter((q) => q.lt(q.field("expiresAt"), now))` -- a full table scan. The `by_expiry` index (line 453) exists in the schema but is never used. This means the cleanup function scans ALL sessions instead of efficiently querying only expired ones.
**Current code:**
```typescript
const expiredSessions = await ctx.db
  .query("sessions")
  .filter((q) => q.lt(q.field("expiresAt"), now))
  .collect();
```
**Remediation:**
```typescript
const expiredSessions = await ctx.db
  .query("sessions")
  .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
  .collect();
```
**Quick-win:** Yes -- one-line change, no migration needed.

### MIS-02: `externalOutlets` filtered by `isActive` after `by_source` index (Moderate)

**Table:** `externalOutlets`
**Files:** `convex/externalData/queries.ts:54-55`, `convex/k3martCockpit/queries.ts:26-27`, `convex/k3martKitchen/queries.ts:25-26`, `convex/dispatchPlanner/queries.ts:459-460,607-609`, `convex/gofoodDepot/queries.ts:285-286`
**Description:** Multiple query files fetch externalOutlets with `.withIndex("by_source", q => q.eq("source", "k3mart"))` then `.filter(q => q.eq(q.field("isActive"), true))`. This is a post-scan filter. A compound index `["source", "isActive"]` would allow both conditions at the index level. At least 8 call sites use this pattern.
**Remediation:**
```typescript
// In externalOutlets, add:
.index("by_source_active", ["source", "isActive"])

// Then update queries:
.withIndex("by_source_active", (q) => q.eq("source", "k3mart").eq("isActive", true))
```
**Quick-win:** Yes -- add index, update query calls. No migration needed.

### MIS-03: `storageLocations` filtered by `isActive` after `by_type` index (Moderate)

**Table:** `storageLocations`
**Files:** `convex/gofoodDepot/queries.ts:285-286`, `convex/gofoodDepot/mutations.ts:63-64,271-272`
**Description:** At least 4 call sites query `.withIndex("by_type", q => q.eq("locationType", "venue")).filter(q => q.eq(q.field("isActive"), true))`. A compound index would eliminate the post-scan filter.
**Remediation:**
```typescript
// In storageLocations, add:
.index("by_type_active", ["locationType", "isActive"])
```
**Quick-win:** Yes -- add index. No migration needed.

---

## 4. Denormalization Waste

### DNW-01: `componentStock.latestSupplierName` / `latestPurchaseUrl` / `latestUnitCostIdr` cache rarely read (Low)

**Table:** `componentStock`
**Fields:** `latestSupplierName` (line 867), `latestPurchaseUrl` (line 869), `latestUnitCostIdr` (line 871)
**Description:** These three CACHE fields snapshot data from the most recent `inventoryBatch`. They are updated on every new batch but the values are also easily derivable by querying the latest batch. Usage is limited to the restock planner UI where the supplier info is displayed. The write overhead (3 extra field updates per batch) is low, and the read benefit (avoiding a batch lookup) is marginal.
**Phase 8 Annotation Status:** Annotated as "CACHE: From most recent inventoryBatch. Updated: on new batch." -- still accurate.
**Remediation:** Keep as-is. The denormalization cost is negligible and removing requires careful verification that all read sites handle the lookup.
**Quick-win:** No -- marginal benefit.

---

## 5. Over-indexing

The following indexes have **zero** `.withIndex()` references across all backend files including `crons.ts` and `http.ts`. Each is a candidate for removal.

### Over-indexing Summary Table

| # | Table | Index Name | Schema Line | References | Severity | Recommendation |
|---|-------|-----------|-------------|------------|----------|----------------|
| OI-01 | `ingredients` | `by_name` | 61 | 0 | Moderate | Remove |
| OI-02 | `packagingMaterials` | `by_name` | 78 | 0 | Moderate | Remove |
| OI-03 | `customers` | `by_name` | 166 | 0 | Moderate | Remove |
| OI-04 | `menuProducts` | `by_pos_slot` | 111 | 0 | Low | Remove |
| OI-05 | `menuProducts` | `by_packaging_pos_slot` | 112 | 0 | Low | Remove |
| OI-06 | `menuProducts` | `by_default_price` | 113 | 1 | Low | Keep (used in autoMatch) |
| OI-07 | `orderItemProduction` | `by_production_type` | 371 | 0 | Moderate | Remove |
| OI-08 | `sessions` | `by_expiry` | 453 | 0 | Moderate | Keep -- fix MIS-01 first, then it becomes used |
| OI-09 | `vouchers` | `by_active_valid` | 683 | 0 | Low | Remove |
| OI-10 | `externalStockSnapshots` | `by_snapshot_time` | 1038 | 0 | Low | Remove |
| OI-11 | `externalRevenue` | `by_product` | 1082 | 0 | Low | Remove |
| OI-12 | `consignmentSettlements` | `by_outlet_period` | 1570 | 0 | Low | Remove |
| OI-13 | `consignmentSettlements` | `by_outlet_status` | 1572 | 0 | Low | Remove |
| OI-14 | `kitchenShiftRecords` | `by_date_submitted` | 1343 | 0 | Low | Remove |
| OI-15 | `k3martStockMovements` | `by_outlet_direction` | 1428 | 0 | Low | Remove |
| OI-16 | `grabfoodOrders` | `by_merchant` | 1454 | 0 | Moderate | Remove |
| OI-17 | `grabfoodOrders` | `by_sync_log` | 1457 | 0 | Low | Remove |
| OI-18 | `grabfoodOrders` | `by_linked_revenue` | 1458 | 0 | Low | Remove |
| OI-19 | `bigsellerOrders` | `by_shop` | 1488 | 0 | Moderate | Remove |
| OI-20 | `bigsellerOrders` | `by_sync_log` | 1491 | 0 | Low | Remove |
| OI-21 | `bigsellerOrders` | `by_state` | 1492 | 0 | Moderate | Remove |
| OI-22 | `grabfoodMenuItems` | `by_grabfood_item_id` | 1599 | 0 | Low | Remove |

**Total unused indexes: 22** (excluding `by_expiry` which should be kept and used -- see MIS-01)

**Note on `by_default_price` (OI-06):** Has 1 reference in `convex/externalData/mutations.ts:579` for auto-matching GoFood products by price. Keep this index.

**Note on `by_expiry` (OI-08):** This index SHOULD be used but ISN'T. Fix MIS-01 first (update `cleanupExpiredSessions` to use it), then the index becomes active. Do NOT remove.

### Remediation for all removals:
```typescript
// Example: Remove unused index from ingredients
ingredients: defineTable({
  // ... fields ...
})
  // REMOVED: .index("by_name", ["name"]) -- zero withIndex references
```
**Quick-win:** Yes for all removals -- Convex handles index removal automatically on deploy.

---

## 6. Cross-table Integrity

### CTI-01: `dispatchPlans.outletId` references both `externalOutlets` and `consignmentOutlets` (Moderate)

**Table:** `dispatchPlans`
**Field:** `outletId` (line 1247)
**Description:** The field is typed as `v.optional(v.union(v.id("externalOutlets"), v.id("consignmentOutlets")))` which is a polymorphic foreign key. This is intentional (dispatch plans span both outlet types), but no integrity check validates that the referenced outlet still exists. If an `externalOutlets` or `consignmentOutlets` document is deleted, `dispatchPlans` entries become orphaned.
**Coverage:** `convex/integrityChecks/` does NOT cover dispatch plan orphans.
**Remediation:** Add an integrity check or a cleanup mutation that validates `dispatchPlans.outletId` references:
```typescript
// In integrityChecks/queries.ts, add a dispatch plan orphan check
const plans = await ctx.db.query("dispatchPlans").collect();
for (const plan of plans) {
  if (plan.outletId) {
    const outlet = await ctx.db.get(plan.outletId);
    if (!outlet) orphans.push(plan._id);
  }
}
```
**Quick-win:** No -- requires new integrity check code.

### CTI-02: `gofoodDepotStock.outletId` orphan risk (Moderate)

**Table:** `gofoodDepotStock`
**Field:** `outletId` (line 1204) -- `v.optional(v.id("externalOutlets"))`
**Description:** Phase 19 added per-outlet stock tracking. If an `externalOutlets` document is deleted (outlet deactivated/removed), `gofoodDepotStock` entries with that `outletId` become orphaned. No cascade or cleanup exists.
**Coverage:** `convex/integrityChecks/` does NOT cover GoFood depot orphans.
**Remediation:** Add outlet existence validation to the GoFood depot integrity check.
**Quick-win:** No -- requires new integrity check code.

---

## 7. Table Merge Candidates

### TMC-01: `productionUnitTypes` + `componentTypes` (Low)

**Tables:** `productionUnitTypes` (line 120), `componentTypes` (line 703)
**Description:** `componentTypes` was designed to be the unified BOM replacement for `productionUnitTypes`. Both tables store production unit definitions (code, name, gramsPerUnit, unitCostIdr, color, sortOrder, isActive). However, `productionUnitTypes` is still actively referenced by:
- `orderItemProduction.productionUnitTypeId` (kitchen bridge)
- `productionTargets.productionUnitTypeId`
- `k3martCockpit/mutations.ts`
- `orders/helpers/productionRecords.ts`
- `orders/mutations/orderCrud.ts`

**Rationale for merge:** Eliminates dual source of truth for ball type definitions. Currently, cost/name changes must be made in both tables.
**Why NOT now:** ~20 code references need updating. Kitchen bridge (`orderItemProduction.productionUnitTypeId`) is deeply embedded. Requires data migration of all `orderItemProduction` records. High risk for a tech debt phase.
**Quick-win:** No -- requires careful multi-step migration.

### TMC-02: `productionCounts` + `productionResets` (Low)

**Tables:** `productionCounts` (line 505), `productionResets` (line 568)
**Description:** Both tables track per-menuProduct production reset state. `productionCounts` stores running tallies + `lastResetAt`/`lastResetBy`, while `productionResets` stores just `lastResetAt`/`lastResetBy`. The `productionCounts` table is archived (read-only), so the actual source of truth for resets is `productionResets`. These could merge, but since `productionCounts` is archived, merging gains nothing.
**Rationale:** No merge needed. `productionCounts` is frozen; `productionResets` is the active table.
**Quick-win:** No -- no value in merging.

---

## 8. Index Range Bounds Anti-patterns

The following queries use `.withIndex("idx", q => q.gte("field", start))` then `.filter(q => q.lt(q.field("field"), end))` to apply a second bound on the SAME indexed field. This means the upper bound is a post-scan filter, not leveraging the index. The fix is to chain both bounds in the `.withIndex()` callback.

### IRB-01: `externalRevenue.by_period` range queries (Moderate)

**Table:** `externalRevenue`
**Index:** `by_period` (on `periodStart`)
**Occurrences:** 5 call sites
**Files:**
1. `convex/externalData/queries.ts:524-525` -- `getDashboardSummaryByPeriodInternal` (current period)
2. `convex/externalData/queries.ts:531-532` -- `getDashboardSummaryByPeriodInternal` (previous period)
3. `convex/externalData/queries.ts:1552-1553` -- `getRevenueTimeSeries`
4. `convex/externalData/queries.ts:1664-1665` -- `getRevenueByOutletInternal`
5. `convex/externalData/queries.ts:409-410` -- `getRecentSyncedRevenue`

**Current pattern:**
```typescript
.withIndex("by_period", (q) => q.gte("periodStart", range.currentStart))
.filter((q) => q.lt(q.field("periodStart"), range.currentEnd))
```
**Remediation:**
```typescript
.withIndex("by_period", (q) => q.gte("periodStart", range.currentStart).lt("periodStart", range.currentEnd))
```
**Quick-win:** Yes -- query-only change, no schema change needed.

### IRB-02: `externalRevenue.by_source_period` range queries (Moderate)

**Table:** `externalRevenue`
**Index:** `by_source_period` (on `source`, `periodStart`)
**Occurrences:** 6 call sites
**Files:**
1. `convex/k3martCockpit/queries.ts:44-47` -- `getOutletStockSummaryInternal`
2. `convex/k3martKitchen/queries.ts:109-112` -- K3Mart kitchen today's sales
3. `convex/dispatchPlanner/queries.ts:471-474` -- GoFood revenue for dispatch
4. `convex/externalData/queries.ts:797-800` -- K3 Mart revenue (14-day window)
5. `convex/externalData/queries.ts:1261-1264` -- K3 Mart sell-through (30-day window)
6. `convex/k3martCockpit/queries.ts:774-777` -- outlet detail revenue

**Current pattern:**
```typescript
.withIndex("by_source_period", (q) => q.eq("source", "k3mart").gte("periodStart", sevenDaysAgo))
.filter((q) => q.lt(q.field("periodStart"), todayEnd))
```
**Remediation:**
```typescript
.withIndex("by_source_period", (q) =>
  q.eq("source", "k3mart").gte("periodStart", sevenDaysAgo).lt("periodStart", todayEnd)
)
```
**Note:** Some of these `.filter()` calls filter on DIFFERENT fields (e.g., `outletId`) in addition to the `periodStart` upper bound. Only the `periodStart` upper bound should be moved into the index callback. The `outletId` filter is a legitimate post-scan filter on a different field.
**Quick-win:** Yes -- query-only change.

### IRB-03: `inventoryBatches.by_fifo` filtered by `status` (Moderate)

**Table:** `inventoryBatches`
**Index:** `by_fifo` (on `componentTypeId`, `locationId`, `purchaseDate`)
**Occurrences:** 4 call sites
**Files:**
1. `convex/inventory/fifo.ts:60-63`
2. `convex/inventory/helpers.ts:57-60` (uses `by_component_location`)
3. `convex/orders/mutations/inventoryIntegration.ts:299-302`
4. `convex/orders/mutations/inventoryIntegration.ts:742-747`
5. `convex/gofoodDepot/mutations.ts:398-403`
6. `convex/kitchenShiftRecords/ingredientDeduction.ts:282-287`

**Current pattern:**
```typescript
.withIndex("by_fifo", (q) => q.eq("componentTypeId", id).eq("locationId", locId))
.filter((q) => q.eq(q.field("status"), "active"))
```
**Description:** The filter on `status` is on a DIFFERENT field from the index fields -- this is a legitimate post-scan filter, NOT the classic range-bound anti-pattern. However, if performance is a concern on large batch tables, a compound index `["componentTypeId", "locationId", "status", "purchaseDate"]` could eliminate the filter.
**Severity:** Low (not the classic anti-pattern, but suboptimal for high-volume tables)
**Remediation:** Optional -- add a compound index if batch table grows large. For now, this is acceptable because depleted batches are a minority of total batches.
**Quick-win:** Optional.

### IRB-04: `productionLog.by_menu_product` filtered by `timestamp` (Moderate)

**Table:** `productionLog`
**Index:** `by_menu_product` (on `menuProductId`)
**File:** `convex/productionLog/helpers.ts:72-73`
**Current pattern:**
```typescript
.withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
.filter((q) => q.gt(q.field("timestamp"), lastResetAt))
```
**Description:** Filters on `timestamp` after selecting by `menuProductId`. This is a different-field filter (legitimate), but a compound index `["menuProductId", "timestamp"]` would allow both conditions at the index level. The `productionLog` table can grow large (every box/sticker/pack action is logged), so this could become a performance bottleneck.
**Remediation:**
```typescript
// In productionLog, add:
.index("by_menu_product_timestamp", ["menuProductId", "timestamp"])
```
**Quick-win:** Yes -- add index, update one query call.

### IRB-05: `orderComponentReservations.by_order` filtered by `status` (Moderate)

**Table:** `orderComponentReservations`
**Index:** `by_order` (on `orderId`)
**Files:**
1. `convex/orders/mutations/inventoryIntegration.ts:401-402`
2. `convex/orders/mutations/inventoryIntegration.ts:726-727`
**Current pattern:**
```typescript
.withIndex("by_order", (q) => q.eq("orderId", args.orderId))
.filter((q) => q.eq(q.field("status"), "reserved"))
```
**Description:** Filters on `status` after selecting by `orderId`. A compound index `["orderId", "status"]` would eliminate the post-filter.
**Remediation:**
```typescript
// In orderComponentReservations, add:
.index("by_order_status", ["orderId", "status"])
```
**Quick-win:** Yes -- add index, update query calls.

### IRB-06: `externalStockSnapshots.by_batch` filtered by `outletId` (Moderate)

**Table:** `externalStockSnapshots`
**Index:** `by_batch` (on `snapshotBatchId`)
**Occurrences:** 6 call sites across `k3martCockpit/queries.ts`, `k3martKitchen/queries.ts`, `externalData/queries.ts`
**Current pattern:**
```typescript
.withIndex("by_batch", (q) => q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId))
.filter((q) => q.eq(q.field("outletId"), outlet._id))
```
**Description:** Filters on `outletId` after selecting by `snapshotBatchId`. The `by_outlet_product` index exists but uses `["outletId", "externalProductId"]` not `["snapshotBatchId", "outletId"]`. A compound index would be more efficient.
**Remediation:**
```typescript
// In externalStockSnapshots, add:
.index("by_batch_outlet", ["snapshotBatchId", "outletId"])
```
**Quick-win:** Yes -- add index, update query calls.

---

## 9. Phase 8 Annotation Freshness Review

Phase 8 (v1.0, 2026-02-14) added ~47 inline annotations to `convex/schema.ts` using prefixes: `CACHE:`, `SNAPSHOT:`, `DERIVED:`, `DEPRECATED:`. Here is the freshness assessment:

### Annotations Still Accurate (43/47)

| Prefix | Count | Status |
|--------|-------|--------|
| CACHE | 14 | All accurate -- update triggers documented correctly |
| SNAPSHOT | 10 | All accurate -- "Never updated after" confirmed |
| DERIVED | 9 | All accurate -- computation formulas verified |
| DEPRECATED | 2 | Accurate -- `productionType`/`productionUnits` still deprecated, not removed |
| QFIX-05 comments | 6 | Accurate -- removed indexes still documented as comments |
| REMOVED comments | 1 | Accurate -- `by_due_date` removal documented |

### Annotations Needing Update (4/47)

1. **`orders.status` legacy statuses (line 186-195):** Comment says "LEGACY: Old statuses kept for unmigrated production docs." Phase 14 simplified to 7 statuses but kept old ones in the union. This is accurate but should note that the legacy statuses will NOT appear in new orders -- they only exist for backward compat with documents created before Phase 14.

2. **`kitchenInventory` field names (lines 462-463):** Comments say `originalBallCount` is "MID_BALL" and `biteSizedBallCount` is "BIG_BALL". This naming is confusing and counter-intuitive (the "original" 45g ball maps to "Mid Ball" in BOM, while "bite-sized" maps to "Big Ball" 80g). The comments are technically accurate but misleading. Consider renaming the fields in a future phase.

3. **`componentStock.lastRestockTotalStock` (line 873):** Comment says "CACHE: Snapshot of totalStock at last restock. Updated: on restock." -- this was added in Phase 20 but the update trigger description is vague. The actual trigger is `inventory/mutations.ts:addBatch()` which calls `updateComponentStock()`.

4. **`productionCounts` table header comment (line 504):** Says "Running production tallies per menu product (carries over, manager can reset)." Should be updated to say "ARCHIVED -- read-only since Phase 21. Source of truth is now `productionLog` aggregation + `productionResets` timestamps."

### Missing Annotations (New tables since Phase 8)

The following tables were added after Phase 8 and do NOT have the systematic annotation style. They would benefit from consistent `CACHE:`/`SNAPSHOT:`/`DERIVED:` annotations:

- `productionComponentLinks` (Phase 20)
- `productionComponentIngredients` (Phase 20) -- has partial annotations
- `k3martDispatchPlans` (Phase 24)
- `k3martStockMovements` (Phase 24)
- `grabfoodOrders` (Phase 26)
- `bigsellerOrders` (Phase 26)
- `bigsellerSyncState` (Phase 28)
- `consignmentOutlets` (Phase 26)
- `consignmentSettlements` (Phase 26)
- `grabfoodMenuItems` (Phase 27)
- `kitchenShiftRecords` (Phase 21)
- `kitchenDailyOverrides` (Phase 21)

**Quick-win:** No -- annotation is documentation effort, not code risk.

---

## 10. Quick-Win Candidates (Inputs for Plan 02)

### Priority 1: Critical Fix (Do First)

| ID | Category | Action | Files | Risk |
|----|----------|--------|-------|------|
| MIS-01 | Missing Index | Fix `cleanupExpiredSessions` to use `by_expiry` index | `convex/auth/mutations.ts` | None |

### Priority 2: Index Cleanup (Safe Removals)

| ID | Category | Action | Files | Risk |
|----|----------|--------|-------|------|
| OI-01 | Over-index | Remove `ingredients.by_name` | `convex/schema.ts` | None |
| OI-02 | Over-index | Remove `packagingMaterials.by_name` | `convex/schema.ts` | None |
| OI-03 | Over-index | Remove `customers.by_name` | `convex/schema.ts` | None |
| OI-04 | Over-index | Remove `menuProducts.by_pos_slot` | `convex/schema.ts` | None |
| OI-05 | Over-index | Remove `menuProducts.by_packaging_pos_slot` | `convex/schema.ts` | None |
| OI-07 | Over-index | Remove `orderItemProduction.by_production_type` | `convex/schema.ts` | None |
| OI-09 | Over-index | Remove `vouchers.by_active_valid` | `convex/schema.ts` | None |
| OI-10 | Over-index | Remove `externalStockSnapshots.by_snapshot_time` | `convex/schema.ts` | None |
| OI-11 | Over-index | Remove `externalRevenue.by_product` | `convex/schema.ts` | None |
| OI-12 | Over-index | Remove `consignmentSettlements.by_outlet_period` | `convex/schema.ts` | None |
| OI-13 | Over-index | Remove `consignmentSettlements.by_outlet_status` | `convex/schema.ts` | None |
| OI-14 | Over-index | Remove `kitchenShiftRecords.by_date_submitted` | `convex/schema.ts` | None |
| OI-15 | Over-index | Remove `k3martStockMovements.by_outlet_direction` | `convex/schema.ts` | None |
| OI-16 | Over-index | Remove `grabfoodOrders.by_merchant` | `convex/schema.ts` | None |
| OI-17 | Over-index | Remove `grabfoodOrders.by_sync_log` | `convex/schema.ts` | None |
| OI-18 | Over-index | Remove `grabfoodOrders.by_linked_revenue` | `convex/schema.ts` | None |
| OI-19 | Over-index | Remove `bigsellerOrders.by_shop` | `convex/schema.ts` | None |
| OI-20 | Over-index | Remove `bigsellerOrders.by_sync_log` | `convex/schema.ts` | None |
| OI-21 | Over-index | Remove `bigsellerOrders.by_state` | `convex/schema.ts` | None |
| OI-22 | Over-index | Remove `grabfoodMenuItems.by_grabfood_item_id` | `convex/schema.ts` | None |

### Priority 3: Index Additions (Performance Improvements)

| ID | Category | Action | Files | Risk |
|----|----------|--------|-------|------|
| MIS-02 | Missing Index | Add `externalOutlets.by_source_active` | `convex/schema.ts` + 8 query files | None |
| MIS-03 | Missing Index | Add `storageLocations.by_type_active` | `convex/schema.ts` + 4 query/mutation files | None |
| IRB-04 | Anti-pattern | Add `productionLog.by_menu_product_timestamp` | `convex/schema.ts` + 1 helper | None |
| IRB-05 | Anti-pattern | Add `orderComponentReservations.by_order_status` | `convex/schema.ts` + 2 mutation files | None |
| IRB-06 | Anti-pattern | Add `externalStockSnapshots.by_batch_outlet` | `convex/schema.ts` + 6 query files | None |

### Priority 4: Range Bound Fixes (Query-Only Changes)

| ID | Category | Action | Files | Risk |
|----|----------|--------|-------|------|
| IRB-01 | Anti-pattern | Fix `by_period` range bounds | `convex/externalData/queries.ts` (5 sites) | None |
| IRB-02 | Anti-pattern | Fix `by_source_period` range bounds | 4 files (11 sites total) | None |

### Priority 5: Unused Field Removal (Requires Verification)

| ID | Category | Action | Files | Risk |
|----|----------|--------|-------|------|
| DUP-01 | Unused field | Remove `dispatchChannelConfig.commissionRate` | `convex/schema.ts` | Low -- verify no docs have it |

---

## 11. Clean Tables (No Findings)

The following tables were audited and found to be clean -- no unused fields, no over-indexing, no missing indexes, proper annotations:

| # | Table | Indexes | Status |
|---|-------|---------|--------|
| 1 | `menuProductComponents` | 2 | Clean |
| 2 | `orders` | 6 | Clean (complex but well-indexed) |
| 3 | `orderItems` | 2 | Clean |
| 4 | `orderMessages` | 2 | Clean |
| 5 | `feedback` | 2 | Clean -- active system |
| 6 | `users` | 2 | Clean |
| 7 | `kitchenInventory` | 1 | Clean |
| 8 | `productionTargets` | 2 | Clean |
| 9 | `productionProductTargets` | 3 | Clean |
| 10 | `productionTargetLogs` | 1 | Clean |
| 11 | `productionLog` | 2 | Clean (see IRB-04 for optional improvement) |
| 12 | `integrityCheckLogs` | 1 | Clean |
| 13 | `productionResets` | 1 | Clean |
| 14 | `channelUsage` | 2 | Clean |
| 15 | `shippingAgencyUsage` | 2 | Clean |
| 16 | `whatsappTemplates` | 1 | Clean |
| 17 | `orderEvents` | 3 | Clean |
| 18 | `vouchers` | 3 (of 4) | Clean (1 unused index noted in OI-09) |
| 19 | `voucherUsage` | 4 | Clean |
| 20 | `componentTypes` | 4 | Clean |
| 21 | `productionComponentLinks` | 2 | Clean |
| 22 | `productionComponentIngredients` | 2 | Clean |
| 23 | `inventoryBatches` | 4 | Clean |
| 24 | `componentStock` | 3 | Clean |
| 25 | `componentTransactions` | 2 | Clean |
| 26 | `orderComponentReservations` | 3 | Clean (see IRB-05 for optional improvement) |
| 27 | `productInventory` | 3 | Clean |
| 28 | `productInventoryTransactions` | 4 | Clean |
| 29 | `productInventorySettings` | 0 | Clean (singleton) |
| 30 | `externalOutlets` | 3 | Clean (see MIS-02 for optional improvement) |
| 31 | `externalRevenue` | 5 (of 6) | Clean (1 unused index noted in OI-11) |
| 32 | `externalRevenueItems` | 4 | Clean |
| 33 | `externalSyncLogs` | 3 | Clean |
| 34 | `externalProductMappings` | 2 | Clean |
| 35 | `restockTargets` | 3 | Clean |
| 36 | `manualStockEntries` | 2 | Clean |
| 37 | `platformCredentials` | 1 | Clean |
| 38 | `gofoodDepotStock` | 2 | Clean |
| 39 | `gofoodOutletProductMappings` | 2 | Clean |
| 40 | `gofoodDepotShipments` | 2 | Clean |
| 41 | `dispatchPlans` | 4 | Clean |
| 42 | `dispatchChannelConfig` | 2 | Clean (unused field noted in DUP-01) |
| 43 | `dispatchPlannerSettings` | 0 | Clean (singleton) |
| 44 | `kitchenConfig` | 0 | Clean (singleton) |
| 45 | `kitchenShiftRecords` | 1 (of 2) | Clean (1 unused index noted in OI-14) |
| 46 | `kitchenDailyOverrides` | 1 | Clean |
| 47 | `k3martDispatchPlans` | 4 | Clean |
| 48 | `k3martStockMovements` | 3 (of 4) | Clean (1 unused index noted in OI-15) |
| 49 | `bigsellerSyncState` | 0 | Clean (singleton) |
| 50 | `consignmentOutlets` | 2 | Clean |

**Total tables audited: 65/65** (15 with findings + 50 clean = 65)

---

## Appendix: Index Cross-Reference (Full)

For reference, the complete cross-reference of all 166 indexes against their `.withIndex()` call counts:

<details>
<summary>Click to expand full index cross-reference table</summary>

| Table | Index | Fields | Line | Refs |
|-------|-------|--------|------|------|
| ingredients | by_name | name | 61 | 0 |
| packagingMaterials | by_name | name | 78 | 0 |
| menuProducts | by_code | code | 109 | * |
| menuProducts | by_active | isActive | 110 | * |
| menuProducts | by_pos_slot | posSlot | 111 | 0 |
| menuProducts | by_packaging_pos_slot | packagingPosSlot | 112 | 0 |
| menuProducts | by_default_price | defaultPrice | 113 | 1 |
| productionUnitTypes | by_code | code | 129 | * |
| productionUnitTypes | by_active | isActive | 130 | 0 |
| menuProductComponents | by_menu_product | menuProductId | 151 | * |
| menuProductComponents | by_component_type | componentTypeId | 152 | 3 |
| customers | by_name | name | 166 | 0 |
| customers | by_phone | phone | 167 | 1 |
| orders | by_order_number | orderNumber | 296 | 8 |
| orders | by_customer | customerId | 297 | 2 |
| orders | by_status | status | 299 | * |
| orders | by_channel | channel | 300 | * |
| orders | by_status_due_date | status, dueDate | 301 | 3 |
| orders | by_kitchen_visible | isKitchenVisible, dueDate | 302 | 1 |
| orderItems | by_order | orderId | 344 | * |
| orderItems | by_menu_product | menuProductId | 345 | * |
| orderItemProduction | by_order_item | orderItemId | 370 | * |
| orderItemProduction | by_production_type | productionUnitTypeId | 371 | 0 |
| orderMessages | by_order | orderId | 386 | * |
| orderMessages | by_order_template | orderId, template | 387 | 1 |
| feedback | by_status | status | 417 | * |
| feedback | by_priority | priority | 418 | 3 |
| users | by_role | role | 441 | 2 |
| users | by_active | isActive | 442 | * |
| sessions | by_token | token | 451 | 3 |
| sessions | by_user | userId | 452 | 2 |
| sessions | by_expiry | expiresAt | 453 | 0 |
| kitchenInventory | by_date | date | 469 | * |
| productionTargets | by_date | date | 485 | * |
| productionTargets | by_type_date | productionUnitTypeId, date | 486 | 4 |
| productionProductTargets | by_date | date | 499 | * |
| productionProductTargets | by_date_source | date, source | 500 | 2 |
| productionProductTargets | by_date_source_product | date, source, menuProductId | 501 | 2 |
| productionCounts | by_menu_product | menuProductId | 514 | * |
| productionTargetLogs | by_date | date | 525 | * |
| productionLog | by_menu_product | menuProductId | 544 | * |
| productionLog | by_timestamp | timestamp | 545 | * |
| integrityCheckLogs | by_timestamp | timestamp | 561 | * |
| productionResets | by_menu_product | menuProductId | 573 | * |
| channelUsage | by_channel | channel | 585 | * |
| channelUsage | by_usage | usageCount | 586 | 4 |
| shippingAgencyUsage | by_agency | agency | 592 | 4 |
| shippingAgencyUsage | by_usage | usageCount | 593 | 4 |
| whatsappTemplates | by_code | code | 611 | * |
| orderEvents | by_order | orderId | 632 | * |
| orderEvents | by_type | eventType | 633 | * |
| orderEvents | by_timestamp | timestamp | 634 | * |
| vouchers | by_code | code | 680 | * |
| vouchers | by_active | isActive | 681 | * |
| vouchers | by_manager_override | isManagerOverride | 682 | 1 |
| vouchers | by_active_valid | isActive, validFrom | 683 | 0 |
| voucherUsage | by_voucher | voucherId | 692 | 2 |
| voucherUsage | by_customer | customerId | 693 | 2 |
| voucherUsage | by_voucher_customer | voucherId, customerId | 694 | 3 |
| voucherUsage | by_order | orderId | 695 | * |
| componentTypes | by_code | code | 758 | * |
| componentTypes | by_category | category | 759 | 4 |
| componentTypes | by_active | isActive | 760 | * |
| componentTypes | by_track_inventory | trackInventory | 761 | 3 |
| productionComponentLinks | by_parent | parentComponentId | 777 | 7 |
| productionComponentLinks | by_child | childComponentId | 778 | 2 |
| productionComponentIngredients | by_component | componentTypeId | 790 | * |
| productionComponentIngredients | by_ingredient | ingredientId | 791 | 2 |
| storageLocations | by_type | locationType | 808 | * |
| storageLocations | by_active | isActive | 809 | * |
| storageLocations | by_default | isDefault | 810 | 4 |
| inventoryBatches | by_component | componentTypeId | 846 | * |
| inventoryBatches | by_location | locationId | 847 | * |
| inventoryBatches | by_component_location | componentTypeId, locationId | 848 | 8 |
| inventoryBatches | by_fifo | componentTypeId, locationId, purchaseDate | 849 | 7 |
| componentStock | by_component | componentTypeId | 878 | * |
| componentStock | by_location | locationId | 879 | * |
| componentStock | by_component_location | componentTypeId, locationId | 880 | 8 |
| componentTransactions | by_component | componentTypeId, createdAt | 910 | * |
| componentTransactions | by_location | locationId, createdAt | 911 | * |
| orderComponentReservations | by_order | orderId | 936 | * |
| orderComponentReservations | by_component | componentTypeId | 937 | * |
| orderComponentReservations | by_status | status | 938 | * |
| productInventory | by_menu_product | menuProductId | 953 | * |
| productInventory | by_location | locationId | 954 | * |
| productInventory | by_product_location | menuProductId, locationId | 955 | * |
| productInventoryTransactions | by_product_location | menuProductId, locationId, createdAt | 979 | * |
| productInventoryTransactions | by_location | locationId, createdAt | 980 | * |
| productInventoryTransactions | by_order | orderId | 981 | * |
| productInventoryTransactions | by_type | transactionType, createdAt | 982 | * |
| externalOutlets | by_source | source | 1015 | * |
| externalOutlets | by_source_external_id | source, externalId | 1016 | 4 |
| externalOutlets | by_active | isActive | 1017 | * |
| externalStockSnapshots | by_outlet | outletId | 1034 | * |
| externalStockSnapshots | by_batch | snapshotBatchId | 1035 | * |
| externalStockSnapshots | by_outlet_product | outletId, externalProductId | 1036 | * |
| externalStockSnapshots | by_outlet_snapshot | outletId, snapshotAt | 1037 | * |
| externalStockSnapshots | by_snapshot_time | snapshotAt | 1038 | 0 |
| externalRevenue | by_source | source | 1078 | * |
| externalRevenue | by_outlet | outletId | 1079 | * |
| externalRevenue | by_period | periodStart | 1080 | * |
| externalRevenue | by_source_period | source, periodStart | 1081 | * |
| externalRevenue | by_product | linkedMenuProductId | 1082 | 0 |
| externalRevenue | by_source_txn | source, externalTransactionId | 1083 | 3 |
| externalRevenueItems | by_revenue | revenueId | 1102 | * |
| externalRevenueItems | by_source | source | 1103 | * |
| externalRevenueItems | by_menu_product | linkedMenuProductId | 1104 | * |
| externalRevenueItems | by_product_name | source, productName | 1105 | 2 |
| externalSyncLogs | by_source | source | 1121 | * |
| externalSyncLogs | by_timestamp | timestamp | 1122 | * |
| externalSyncLogs | by_outlet | outletId | 1123 | * |
| externalProductMappings | by_source_code | source, externalProductCode | 1135 | * |
| externalProductMappings | by_menu_product | menuProductId | 1136 | * |
| restockTargets | by_outlet | outletId | 1161 | * |
| restockTargets | by_channel | channel | 1162 | * |
| restockTargets | by_outlet_product | outletId, productKey | 1163 | * |
| manualStockEntries | by_channel | channel | 1173 | * |
| manualStockEntries | by_channel_product | channel, productKey | 1174 | 1 |
| platformCredentials | by_platform | platformId | 1190 | * |
| gofoodDepotStock | by_menuProduct | menuProductId | 1206 | 7 |
| gofoodDepotStock | by_outlet_product | outletId, menuProductId | 1207 | * |
| gofoodOutletProductMappings | by_outlet | outletId | 1219 | * |
| gofoodOutletProductMappings | by_outlet_product | outletId, externalProductName | 1220 | * |
| gofoodDepotShipments | by_date | date | 1231 | * |
| gofoodDepotShipments | by_product_date | menuProductId, date | 1232 | 1 |
| dispatchPlans | by_date_channel | date, channel | 1256 | 2 |
| dispatchPlans | by_date | date | 1257 | * |
| dispatchPlans | by_order | orderId | 1258 | * |
| dispatchPlans | by_outlet_date | outletId, date | 1259 | 4 |
| dispatchChannelConfig | by_channel | channelKey | 1272 | * |
| dispatchChannelConfig | by_priority | priority | 1273 | 3 |
| kitchenShiftRecords | by_date | date | 1342 | * |
| kitchenShiftRecords | by_date_submitted | date, submittedAt | 1343 | 0 |
| kitchenDailyOverrides | by_date | date | 1363 | * |
| k3martDispatchPlans | by_date_outlet | date, outletId | 1395 | 2 |
| k3martDispatchPlans | by_date_status | date, status | 1396 | 7 |
| k3martDispatchPlans | by_outlet_date | outletId, date | 1397 | 4 |
| k3martDispatchPlans | by_week | weekNumber | 1398 | 3 |
| k3martStockMovements | by_date | date | 1426 | * |
| k3martStockMovements | by_outlet_date | outletId, date | 1427 | 4 |
| k3martStockMovements | by_outlet_direction | outletId, direction | 1428 | 0 |
| k3martStockMovements | by_status | k3martStatus | 1429 | * |
| grabfoodOrders | by_order_id | orderID | 1453 | 2 |
| grabfoodOrders | by_merchant | merchantID | 1454 | 0 |
| grabfoodOrders | by_outlet | outletId | 1455 | * |
| grabfoodOrders | by_time | orderTimeMs | 1456 | 2 |
| grabfoodOrders | by_sync_log | syncLogId | 1457 | 0 |
| grabfoodOrders | by_linked_revenue | linkedRevenueId | 1458 | 0 |
| bigsellerOrders | by_platform_order | platformOrderId | 1487 | 2 |
| bigsellerOrders | by_shop | shopId | 1488 | 0 |
| bigsellerOrders | by_platform | platform | 1489 | * |
| bigsellerOrders | by_time | orderTimeMs | 1490 | 2 |
| bigsellerOrders | by_sync_log | syncLogId | 1491 | 0 |
| bigsellerOrders | by_state | orderState | 1492 | 0 |
| bigsellerOrders | by_linked_revenue | linkedRevenueId | 1493 | 0 |
| consignmentOutlets | by_active | isActive | 1548 | * |
| consignmentOutlets | by_type | type | 1549 | * |
| consignmentSettlements | by_outlet | outletId | 1568 | * |
| consignmentSettlements | by_period | periodStart | 1569 | * |
| consignmentSettlements | by_outlet_period | outletId, periodStart | 1570 | 0 |
| consignmentSettlements | by_outlet_status | outletId, status | 1572 | 0 |
| consignmentSettlements | by_status | status | 1571 | * |
| grabfoodMenuItems | by_menu_product | menuProductId | 1597 | * |
| grabfoodMenuItems | by_sequence | sequence | 1598 | 3 |
| grabfoodMenuItems | by_grabfood_item_id | grabfoodItemId | 1599 | 0 |

`*` = 2+ references (actively used)

**Total indexes: 166** (22 with 0 references, 144 actively used)

</details>

---

*End of Schema Audit Report -- Phase 35, Plan 01*
*Generated: 2026-03-05 | Next: Plan 02 (Quick-Win Execution)*

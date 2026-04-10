---
phase: 19-gofood-depot-kitchen-targets
plan: "01"
subsystem: gofood-depot-backend
tags: [schema-migration, backend, gofood, product-inventory, multi-outlet]
dependency_graph:
  requires: []
  provides:
    - "gofoodDepotStock.outletId field + by_outlet_product composite index"
    - "productInventoryTransactions.transfer type + transferPairLocationId"
    - "gofoodOutletProductMappings table"
    - "transferStock mutation (productInventory)"
    - "getStockOverviewGrouped query (productInventory)"
    - "isSeedRequired query (gofoodDepot)"
    - "per-outlet getDepotStock + getGoFoodDailyOrder queries"
    - "outletId-aware recordShipment + processSyncSales mutations"
  affects:
    - "convex/gofoodDepot/queries.ts"
    - "convex/gofoodDepot/mutations.ts"
    - "convex/productInventory/mutations.ts"
    - "convex/productInventory/queries.ts"
tech_stack:
  added: []
  patterns:
    - "Optional outletId arg with backward-compatible index selection (by_outlet_product vs by_menuProduct)"
    - "Atomic debit/credit transfer pattern with paired transaction log entries"
    - "Composite index filtering for per-outlet depot stock"
key_files:
  created: []
  modified:
    - "convex/schema.ts"
    - "convex/productInventory/mutations.ts"
    - "convex/productInventory/queries.ts"
    - "convex/gofoodDepot/queries.ts"
    - "convex/gofoodDepot/mutations.ts"
decisions:
  - "outletId is optional on gofoodDepotStock for backward compatibility with existing rows"
  - "transferStock uses .unique() to ensure exactly one row per product+location combination"
  - "processSyncSales and recordShipment use spread + conditional outletId to avoid undefined field writes"
  - "isSeedRequired was already implemented in the file (pre-existing GF-05 work) -- no duplicate added"
metrics:
  duration_minutes: 10
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
  completed_date: "2026-02-22"
---

# Phase 19 Plan 01: Schema Migration and Core Backend Mutations/Queries Summary

**One-liner:** Extended gofoodDepotStock with outletId+composite index, added transfer type to productInventoryTransactions, created gofoodOutletProductMappings table, and implemented transferStock mutation + per-outlet depot queries.

## What Was Built

### Task 1: Schema Migration (commit b3e3320)

Three changes to `convex/schema.ts`:

1. **gofoodDepotStock** -- added `outletId: v.optional(v.id("externalOutlets"))` and `.index("by_outlet_product", ["outletId", "menuProductId"])` composite index. Existing `by_menuProduct` index preserved for backward compatibility.

2. **productInventoryTransactions** -- added `v.literal("transfer")` to the `transactionType` union, and `transferPairLocationId: v.optional(v.id("storageLocations"))` field that links paired source/destination transfer transactions.

3. **New table: gofoodOutletProductMappings** -- stores per-outlet GoFood product name to internal menuProduct mappings. Fields: `outletId`, `externalProductName`, `menuProductId` (optional), `isActive`, `createdBy`, `createdAt`, `updatedAt`. Indexes: `by_outlet` and `by_outlet_product`.

### Task 2: Backend Mutations and Queries (commit 7849cd3)

**A. `transferStock` mutation** (`convex/productInventory/mutations.ts`):
- Auth: manager, admin
- Validates quantity > 0, source != destination, sufficient source stock
- Atomically debits source and credits destination productInventory
- Logs two productInventoryTransactions of type "transfer" linked via `transferPairLocationId`
- Destination row is upserted (created if missing)

**B. `isSeedRequired` query** (`convex/gofoodDepot/queries.ts`):
- Was already present in the file from prior GF-05 work -- no action needed
- Implementation matches spec: returns `seedRequired=true` when gobiz outlets lack `linkedStorageLocationId` or settings missing

**C. `getStockOverviewGrouped` query** (`convex/productInventory/queries.ts`):
- Groups productInventory rows by menuProductId
- Enriches each location entry with `locationType` for frontend bucketing (Internal / GoFood / K3Mart)
- Returns sorted by product name with totalQuantity aggregate

**D. Updated `getDepotStock`** (`convex/gofoodDepot/queries.ts`):
- Added `outletId: v.optional(v.id("externalOutlets"))` arg
- When outletId provided: uses `by_outlet_product` index, enriches with `productInventory` data at the outlet's `linkedStorageLocationId`
- Falls back to full table scan (legacy behavior) when outletId omitted

**E. Updated `getGoFoodDailyOrder`** (`convex/gofoodDepot/queries.ts`):
- Added `outletId: v.optional(v.id("externalOutlets"))` arg
- When outletId provided: filters `externalRevenue` via `by_outlet` index, filters sync logs via `by_outlet` index
- Returns `outletId` in the result object

**F. Updated `recordShipment`** (`convex/gofoodDepot/mutations.ts`):
- Added `outletId: v.optional(v.id("externalOutlets"))` arg at mutation level
- When outletId provided: uses `by_outlet_product` index to find existing stock, writes `outletId` to gofoodDepotStock on insert/patch

**G. Updated `processSyncSales`** (`convex/gofoodDepot/mutations.ts`):
- Added `outletId: v.optional(v.id("externalOutlets"))` arg
- Uses `by_outlet_product` index when outletId provided for depot stock lookup
- Writes `outletId` to gofoodDepotStock on insert/patch
- Deficit re-query in catch block also uses correct outlet-aware index

## Deviations from Plan

### Auto-fixed Issues

None.

### Discoveries

**[Discovery] isSeedRequired already existed in queries.ts**
- Found during: Task 2, step B
- The file already had a complete, correct `isSeedRequired` implementation from prior GF-05 planning work
- The file also had additional queries not in the plan spec (`getRestockSuggestions`, helpers import for `computeRestockSuggestion`)
- Action: Removed duplicate that I added at the top of the file; preserved the existing correct implementation
- No behavior change

## Self-Check

**Files exist:**
- `convex/schema.ts` -- modified with 3 schema changes
- `convex/productInventory/mutations.ts` -- transferStock mutation added
- `convex/productInventory/queries.ts` -- getStockOverviewGrouped added, type cast updated
- `convex/gofoodDepot/queries.ts` -- isSeedRequired confirmed present, getDepotStock + getGoFoodDailyOrder updated
- `convex/gofoodDepot/mutations.ts` -- recordShipment + processSyncSales updated

**Commits exist:**
- `b3e3320` -- schema migration
- `7849cd3` -- backend mutations and queries

**Build:** `npm run build` passes (0 errors, CSS warnings are pre-existing)
**Type check:** `npm run type-check` passes

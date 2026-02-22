---
phase: 19-gofood-depot-management-and-kitchen-production-targets
verified: 2026-02-22T00:00:00Z
status: passed
score: 22/22 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Navigate to /gofood-depot with seed not run"
    expected: "Full-page SeedWarningBlocker renders with unlinked outlet names and no dismiss button"
    why_human: "Requires live Convex backend with unlinked GoBiz outlet data"
  - test: "Navigate to /gofood-depot, select outlet, observe low-stock alert banner"
    expected: "Alert banner appears at top listing products below 5 units when stock is low; affected rows highlighted red in cockpit table"
    why_human: "Requires live stock data to trigger threshold"
  - test: "Click restock column cell in cockpit table"
    expected: "Tooltip appears with breakdown text (e.g. '3-day avg: 7.3 -> +1 (weekday) = 9')"
    why_human: "Tooltip interaction cannot be tested programmatically"
  - test: "Mapping section loads with unmapped GoFood products"
    expected: "Unmapped products flagged with orange warning icon and 'Unmapped' badge; Save button at bottom"
    why_human: "Requires GoBiz sync data and externalRevenueItems rows to surface unmapped products"
  - test: "Dispatch Planner page renders GoFood Depot Restock section"
    expected: "Collapsible section with per-outlet tables showing Product / Current Stock / Restock Tomorrow / Breakdown columns"
    why_human: "Requires live outlet + restock suggestions data from Convex backend"
---

# Phase 19: GoFood Depot Management and Kitchen Production Targets Verification Report

**Phase Goal:** Admin can configure per-outlet product mappings for each GoFood depot, track per-depot stock levels with low-stock alerts, receive daily restock suggestions, and see an explicit warning when the finished goods seed has not been run.

**Verified:** 2026-02-22
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `productInventoryTransactions` schema supports `transfer` type with `transferPairLocationId` field | VERIFIED | `convex/schema.ts` line 1087 adds `v.literal("transfer")` to union; line 1096 adds `transferPairLocationId: v.optional(v.id("storageLocations"))` |
| 2 | `gofoodDepotStock` schema has `outletId` field with composite index `by_outlet_product` | VERIFIED | `convex/schema.ts` lines 1322-1325: `outletId: v.optional(v.id("externalOutlets"))` with `.index("by_outlet_product", ["outletId", "menuProductId"])` |
| 3 | New `gofoodOutletProductMappings` table exists in schema | VERIFIED | `convex/schema.ts` lines 1328-1338: full table definition with `by_outlet` and `by_outlet_product` indexes |
| 4 | `transferStock` mutation atomically debits source, credits destination, validates stock, logs two transfer transactions | VERIFIED | `convex/productInventory/mutations.ts` lines 421-530: full implementation with stock validation, debit/credit, and two `productInventoryTransactions` inserts with `transferPairLocationId` |
| 5 | `isSeedRequired` query returns `seedRequired=true` when any GoBiz outlet lacks `linkedStorageLocationId` | VERIFIED | `convex/gofoodDepot/queries.ts` lines 420-435: filters GoBiz outlets without `linkedStorageLocationId`, returns `{ seedRequired, unlinkedOutlets }` |
| 6 | `getDepotStock` and `getGoFoodDailyOrder` queries filter by `outletId` | VERIFIED | `convex/gofoodDepot/queries.ts`: `getDepotStock` uses `by_outlet_product` index at line 35; `getGoFoodDailyOrder` filters by `outletId` at lines 122, 153, 199 |
| 7 | `recordShipment` and `processSyncSales` mutations write `outletId` to `gofoodDepotStock` | VERIFIED | `convex/gofoodDepot/mutations.ts`: both mutations accept optional `outletId` arg and spread it into insert/patch operations (lines 118-125, 309-317) |
| 8 | `computeRestockSuggestion` returns correct values: n+1 weekdays, n+2 Fri/Sat, Monday resets to previous Thursday total | VERIFIED | `convex/gofoodDepot/helpers.ts` lines 19-46: correct branching logic for dayOfWeek === 1 (Monday), 5/6 (Fri/Sat buffer=2), others (buffer=1) |
| 9 | `getRestockSuggestions` query returns per-product restock amounts with breakdown for given outlet | VERIFIED | `convex/gofoodDepot/queries.ts` lines 448-582: full implementation querying `externalRevenue`+`externalRevenueItems` for last 14 days, calling `computeRestockSuggestion`, returning `{ suggestions, todayWib, dayOfWeek }` |
| 10 | Product mapping CRUD mutations let admin save per-outlet product mappings with explicit save | VERIFIED | `convex/gofoodDepot/mutations.ts` lines 547-609: `saveOutletProductMappings` upserts per (outletId, externalProductName); `convex/gofoodDepot/mutations.ts` lines 611+: `initOutletMappingsFromPrevious` copies from previous depot |
| 11 | `getOutletProductMappings` query returns all mappings for a given outlet, flagging unmapped products | VERIFIED | `convex/gofoodDepot/queries.ts` line 591: query implemented, joins `menuProducts` for names |
| 12 | GoFood depot page renders cockpit table, outlet selector, seed warning blocker when not seeded | VERIFIED | `src/pages/GoFoodDepotManager.tsx` (224 lines): all hooks called before conditional returns, `SeedWarningBlocker` rendered when `seedData?.seedRequired`, outlet selector via `useState` + tab buttons |
| 13 | Seed warning is a full-page blocker — no dismiss button | VERIFIED | `src/components/gofoodDepot/SeedWarningBlocker.tsx` (75 lines): centered card with AlertTriangle icon, lists unlinked outlets, no close/dismiss control |
| 14 | Low-stock alert banner appears when any product drops below 5 remaining | VERIFIED | `src/pages/GoFoodDepotManager.tsx` lines 113-119: `lowStockProducts` computed from `depotStock.filter(row => row.quantity < 5)`; banner rendered at lines 171-182 |
| 15 | Mapping section has explicit Save button; unmapped products flagged | VERIFIED | `src/components/gofoodDepot/DepotMappingSection.tsx` (273 lines): `Save` icon imported from Lucide, `handleSave` calls `saveOutletMappings`, unmapped rows built from `unmappedProducts` array |
| 16 | Stock transfer dialog validates stock, calls `transferStock` mutation | VERIFIED | `src/components/gofoodDepot/DepotStockTransferDialog.tsx`: `useGoFoodTransferStock()` wires to `api.productInventory.mutations.transferStock` (line 82, 125) |
| 17 | Restock suggestion column has hover tooltip with calculation breakdown | VERIFIED | `src/components/gofoodDepot/DepotCockpitTable.tsx` lines 278-288: `Tooltip`/`TooltipContent` wraps restock cell, displays `restock.breakdown` |
| 18 | Finished Goods is the primary/default tab on Inventory page | VERIFIED | `src/pages/InventoryManager.tsx` line 35: `useState<...>("finished_goods")` — default is `finished_goods` |
| 19 | FinishedGoodsHero shows grand totals with Internal / GoFood Outlets / K3Mart breakdown | VERIFIED | `src/components/inventory/FinishedGoodsHero.tsx` (241 lines): `bucketLocationType()` maps `office`/`kitchen` to Internal, `depot` to GoFood, `venue` to K3Mart; three stat cards rendered |
| 20 | StockTransferModal allows multi-product transfers, validates against source stock | VERIFIED | `src/components/inventory/StockTransferModal.tsx` (400 lines): `useMutation(api.productInventory.mutations.transferStock)` wired at line 92; over-transfer blocked with clear message |
| 21 | Dispatch Planner page shows GoFood depot restock section with per-outlet suggestions | VERIFIED | `src/components/restockPlanner/GoFoodRestockSection.tsx`: `useQuery(api.gofoodDepot.queries.getRestockSuggestions)` at line 28; imported and rendered in `src/pages/RestockPlanner.tsx` lines 33, 309 |
| 22 | GoFoodDepotManager route exists in App.tsx with correct ProtectedRoute permission | VERIFIED | `src/App.tsx` lines 279-286: route `gofood-depot` with `ProtectedRoute requiredPermission="canAccessDashboard"` wrapping `GoFoodDepotManager` |

**Score:** 22/22 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/schema.ts` | Extended schema: transfer type, outletId on gofoodDepotStock, gofoodOutletProductMappings table | VERIFIED | All three schema additions confirmed at lines 1087, 1096, 1322-1325, 1328-1338 |
| `convex/productInventory/mutations.ts` | `transferStock` mutation | VERIFIED | Full implementation at lines 421-530 |
| `convex/productInventory/queries.ts` | `getStockOverviewGrouped` query | VERIFIED | Exported at line 235 |
| `convex/gofoodDepot/helpers.ts` | `computeRestockSuggestion` pure function | VERIFIED | Exported at line 19; full logic verified |
| `convex/gofoodDepot/queries.ts` | `isSeedRequired`, `getRestockSuggestions`, `getOutletProductMappings` | VERIFIED | All three exported: lines 420, 448, 591 |
| `convex/gofoodDepot/mutations.ts` | `saveOutletProductMappings`, `initOutletMappingsFromPrevious` | VERIFIED | Exported at lines 547, 611 |
| `src/pages/GoFoodDepotManager.tsx` | GoFood depot page (min 100 lines) | VERIFIED | 224 lines; full feature set implemented |
| `src/components/gofoodDepot/DepotCockpitTable.tsx` | Cockpit table (min 80 lines) | VERIFIED | 339 lines; inline edit, restock tooltip, low-stock highlighting |
| `src/components/gofoodDepot/DepotMappingSection.tsx` | Mapping editor (min 60 lines) | VERIFIED | 273 lines; explicit Save, unmapped flagging |
| `src/components/gofoodDepot/DepotStockTransferDialog.tsx` | Stock transfer dialog | VERIFIED | Wires to `transferStock` mutation with validation |
| `src/components/gofoodDepot/SeedWarningBlocker.tsx` | Full-page seed blocker (min 20 lines) | VERIFIED | 75 lines; hard blocker, no dismiss |
| `src/hooks/convex/useGoFoodDepot.ts` | Convex hooks for depot data | VERIFIED | 130 lines; all hooks exported including `useGoFoodTransferStock` |
| `src/pages/InventoryManager.tsx` | Finished Goods as default tab | VERIFIED | `useState("finished_goods")` at line 35 |
| `src/components/inventory/FinishedGoodsTab.tsx` | Redesigned tab (min 150 lines) | VERIFIED | 1,168 lines; grouping toggle, inline transfers, hero |
| `src/components/inventory/FinishedGoodsHero.tsx` | Hero section (min 60 lines) | VERIFIED | 241 lines; three location-type stat cards |
| `src/components/inventory/StockTransferModal.tsx` | Global Move Stock modal (min 80 lines) | VERIFIED | 400 lines; multi-product transfer with validation |
| `src/components/restockPlanner/GoFoodRestockSection.tsx` | GoFood restock section (min 40 lines) | VERIFIED | ~140 lines; collapsible, per-outlet tables |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/productInventory/mutations.ts` | `convex/schema.ts` | `v.literal("transfer")` in transactionType union | VERIFIED | Pattern found at schema line 1087; mutation uses `transactionType: "transfer"` at line 495 |
| `convex/gofoodDepot/queries.ts` | `convex/schema.ts` | `outletId` filter on `gofoodDepotStock` | VERIFIED | `by_outlet_product` index used at line 35 of queries.ts |
| `convex/gofoodDepot/queries.ts` | `convex/gofoodDepot/helpers.ts` | `import computeRestockSuggestion` | VERIFIED | Import at line 11 of queries.ts; called at line 553 |
| `convex/gofoodDepot/mutations.ts` | `convex/schema.ts` | `gofoodOutletProductMappings` insert/patch | VERIFIED | Table queried/inserted at lines 567, 583, 650, 667, 673 |
| `src/pages/GoFoodDepotManager.tsx` | `convex/gofoodDepot/queries.ts` | `useQuery` for `isSeedRequired`, `getDepotStock`, `getRestockSuggestions`, `getOutletProductMappings` | VERIFIED | All four queries wired in `src/hooks/convex/useGoFoodDepot.ts` lines 20, 40, 53, 66 |
| `src/components/gofoodDepot/DepotStockTransferDialog.tsx` | `convex/productInventory/mutations.ts` | `useMutation` for `transferStock` | VERIFIED | `useGoFoodTransferStock()` at line 82 → `api.productInventory.mutations.transferStock` |
| `src/App.tsx` | `src/pages/GoFoodDepotManager.tsx` | React Router route `/gofood-depot` | VERIFIED | Lines 279-286: route with ProtectedRoute |
| `src/components/inventory/FinishedGoodsTab.tsx` | `convex/productInventory/queries.ts` | `useProductInventoryGrouped` for `getStockOverviewGrouped` | VERIFIED | `useProductInventoryGrouped()` at line 723 → `api.productInventory.queries.getStockOverviewGrouped` |
| `src/components/inventory/StockTransferModal.tsx` | `convex/productInventory/mutations.ts` | `useMutation` for `transferStock` | VERIFIED | `useMutation(api.productInventory.mutations.transferStock)` at line 92 |
| `src/components/restockPlanner/GoFoodRestockSection.tsx` | `convex/gofoodDepot/queries.ts` | `useQuery` for `getRestockSuggestions` per outlet | VERIFIED | `useQuery(api.gofoodDepot.queries.getRestockSuggestions, { outletId })` at line 28 |

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| GF-02 | 19-02, 19-03 | Admin can configure per-outlet product mappings; new outlets default to previous depot's mapping | SATISFIED | `saveOutletProductMappings` + `initOutletMappingsFromPrevious` mutations; `DepotMappingSection` with explicit Save + unmapped flagging |
| GF-03 | 19-01, 19-03, 19-04 | Per-depot stock tracking with alert when any depot drops below 5 remaining | SATISFIED | `outletId` on `gofoodDepotStock`; low-stock filter in `GoFoodDepotManager`; `FinishedGoodsTab` redesign with hero + location-type breakdown |
| GF-04 | 19-02, 19-03, 19-05 | Restock suggestion per depot: n+1 avg/3 days, n+2 Fri/Sat, Monday reset to Thursday total | SATISFIED | `computeRestockSuggestion` helper with exact rules; `getRestockSuggestions` query; `DepotCockpitTable` tooltip; `GoFoodRestockSection` in Dispatch Planner |
| GF-05 | 19-01, 19-03 | Admin-visible warning when `seedFinishedGoodsLocations` not run | SATISFIED | `isSeedRequired` query; `SeedWarningBlocker` full-page hard blocker (no dismiss) |

No orphaned requirements found. All four GF requirements are claimed by plans and implemented.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/restockPlanner/GoFoodRestockSection.tsx` | 111 | `return null` | Info | Legitimate conditional render when no GoBiz outlets exist — not a stub |
| `convex/gofoodDepot/queries.ts` | 114 | `return null` | Info | Early return when no GoFood targets today — not a stub |
| `convex/gofoodDepot/queries.ts` | 293 | `return []` | Info | Early return when goldfinch location not found — not a stub |

No blocker or warning anti-patterns found. All early returns are defensive guards, not stub implementations.

---

## Human Verification Required

### 1. Seed Warning Blocker

**Test:** Navigate to `/gofood-depot` using a Manager or Admin account when at least one GoBiz outlet lacks a `linkedStorageLocationId`.
**Expected:** Full-page amber warning card appears with unlinked outlet names listed. No close or dismiss button. Page content (outlet selector, cockpit table) is completely hidden.
**Why human:** Requires live Convex backend with specific database state (unlinked outlet).

### 2. Low-Stock Alert Banner

**Test:** Ensure a GoFood depot has at least one product with `productInventory.quantity < 5`, then navigate to `/gofood-depot` and select that outlet.
**Expected:** Amber alert banner appears at top of page listing affected product names. Corresponding rows in cockpit table are highlighted red/orange.
**Why human:** Requires live stock data below the threshold.

### 3. Restock Tooltip Interaction

**Test:** Hover over a restock suggestion value in the cockpit table.
**Expected:** Tooltip appears with the calculation breakdown string (e.g., "3-day avg: 7.3 → +1 (weekday) = 9").
**Why human:** Tooltip hover interaction cannot be verified via grep/static analysis.

### 4. Product Mapping with Unmapped Products

**Test:** Navigate to depot page, scroll to Mapping section. Verify it shows GoFood product names from recent GoBiz sync data, with unmapped products highlighted with orange warning icon and "Unmapped" badge.
**Expected:** Explicit Save button is present; clicking it calls `saveOutletProductMappings` mutation. Auto-initialization from previous depot fires silently on first load.
**Why human:** Requires real GoBiz sync data in `externalRevenueItems` table to surface unmapped product names.

### 5. Dispatch Planner GoFood Restock Section

**Test:** Navigate to Dispatch Planner page (Manager or Admin role).
**Expected:** Collapsible "GoFood Depot Restock" section visible with per-outlet tables showing Product / Current Stock / Restock Tomorrow / Breakdown columns. Numbers match the depot cockpit table.
**Why human:** Requires live outlet data and `externalRevenue` records to compute suggestions.

---

## Summary

Phase 19 goal is fully achieved. All 22 observable truths verified against actual codebase — no stubs, no orphaned artifacts.

**GF-02 (Product Mappings):** `gofoodOutletProductMappings` table exists in schema; `saveOutletProductMappings` and `initOutletMappingsFromPrevious` mutations implemented; `DepotMappingSection` has explicit Save button with unmapped product flagging.

**GF-03 (Per-Depot Stock Tracking):** `outletId` field and `by_outlet_product` index added to `gofoodDepotStock`; `getDepotStock` filters by outlet; `FinishedGoodsTab` redesigned as default Inventory tab with hero section showing Internal/GoFood/K3Mart breakdown; `StockTransferModal` enables cross-location transfers.

**GF-04 (Restock Suggestions):** `computeRestockSuggestion` pure function implements exact business rules (n+1 weekday, n+2 Fri/Sat, Monday=Thursday reset); `getRestockSuggestions` query wires real sales data; tooltip in cockpit table; `GoFoodRestockSection` added to Dispatch Planner.

**GF-05 (Seed Warning):** `isSeedRequired` query detects unlinked GoBiz outlets; `SeedWarningBlocker` is a hard full-page blocker with no dismiss button, listing unlinked outlets and instructions.

---

_Verified: 2026-02-22_
_Verifier: Claude (gsd-verifier)_

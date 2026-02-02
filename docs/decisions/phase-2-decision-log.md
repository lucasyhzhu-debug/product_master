# Decision Log: Phase 2 - Query Optimization

**Agent:** refactor-architect
**Date Range:** 2026-02-02
**Branch:** refactor/phase2-queries

---

## Architectural Decisions

### Decision 1: Batch Fetching Pattern Location

**Context:** Need to extract reusable batch fetching pattern from getKitchenStats to eliminate N+1 queries.

**Options Considered:**
1. Create single `fetchOrdersWithItemsAndProduction()` helper in `helpers/batchFetching.ts`
2. Create multiple specific helpers (`fetchAllItems()`, `fetchAllProduction()`, `groupByOrderId()`)
3. Keep pattern inline in each query

**Decision:** Option 1 - Single comprehensive helper with Map return type

**Rationale:**
- Reduces duplication (pattern currently in getKitchenStats, needed in getKitchenOrders)
- Map data structure provides O(1) lookup performance
- Follows CODE_STYLE.md two-tier system (ctx-dependent helper)
- Easier to maintain and test

**Impact:**
- New file: `convex/orders/helpers/batchFetching.ts`
- Updated: `convex/orders/helpers/index.ts` (barrel export)
- Refactored: `convex/orders/queries.ts` (getKitchenStats, getKitchenOrders)

**Trade-offs:**
- More upfront complexity vs. simpler incremental approach
- Benefits: Significant performance gain (6-12 queries → 2-3)

---

### Decision 2: fetchOrdersByStatuses() Helper

**Context:** 6 duplicate status queries in getKitchenOrders (lines 161-189)

**Options Considered:**
1. Extract to ctx-dependent helper `fetchOrdersByStatuses(ctx, statuses[])`
2. Create union index on orders table by multiple statuses
3. Keep duplicate queries (no change)

**Decision:** Option 1 - Extract to helper function

**Rationale:**
- Follows DRY principle (Don't Repeat Yourself)
- Flexible - can accept any array of statuses
- No schema changes needed (option 2 would require migration)
- Aligns with CODE_STYLE.md pattern (ctx-dependent in helpers/)

**Impact:**
- New file: `convex/orders/helpers/statusFetching.ts`
- Updated: `convex/orders/helpers/index.ts` (barrel export)
- Refactored: `convex/orders/queries.ts` (getKitchenOrders uses helper)

**Trade-offs:**
- Iterates through statuses sequentially (could batch in future if needed)
- Acceptable for small status list (typically 3-6 statuses)

---

### Decision 3: getKitchenOrders Function Splitting

**Context:** getKitchenOrders is 147 lines, violates SRP (fetches orders, calculates balls, sorts, maps data)

**Options Considered:**
1. Split into 5 functions: fetchOrders, fetchOrderData, calculateBallStats, calculateProductionStats, sortOrders
2. Split into 3 functions: fetch, calculate, sort
3. Extract only complex calculations to helpers (minimal split)

**Decision:** Option 1 - Extract to 5 focused functions

**Rationale:**
- Each function has single responsibility
- Easier to test independently
- Improves readability (each function < 30 lines)
- Follows refactoring best practices

**Impact:**
- Refactored: `convex/orders/queries.ts` (getKitchenOrders becomes orchestrator)
- Functions stay in queries.ts (not extracted to helpers - query-specific logic)

**Trade-offs:**
- More functions to maintain vs. better organization and testability

---

### Decision 4: N+1 Query Elimination Strategy

**Context:** getKitchenOrders performs 6 status queries + N item queries + N*M production queries

**Options Considered:**
1. Full batch fetch (all orders, all items, all production) + in-memory grouping
2. Partial batch (fetch items per order, but batch production records)
3. Keep current approach (no change)

**Decision:** Option 1 - Full batch fetch with in-memory grouping

**Rationale:**
- Reduces 6 + N + N*M queries to 3 queries total (orders, items, production)
- In-memory grouping is fast (O(N) complexity)
- Already proven in getKitchenStats (lines 441-507)
- Significant performance improvement for kitchen page

**Impact:**
- Use new `fetchOrdersWithItemsAndProduction()` from batchFetching.ts
- Refactored: getKitchenOrders query logic

**Trade-offs:**
- Fetches all items/production (not filtered by order IDs) - acceptable for kitchen use case
- Higher initial memory usage, but much faster overall

---

## Out-of-Scope Changes

(None so far)

---

## Function Splits

### Split 1: getKitchenOrders

**Original:** convex/orders/queries.ts:154-302, 147 lines
**Reason for Split:** SRP violation - mixing data fetching, calculation, and sorting
**Split Into:**
1. `getKitchenOrders` - Main orchestrator (calls helpers)
2. Uses `fetchOrdersByStatuses()` - Fetch orders by status list
3. Uses `fetchOrdersWithItemsAndProduction()` - Batch fetch related data
4. Local function `calculateBallStats()` - Calculate OLD system ball stats
5. Local function `calculateProductionStats()` - Calculate NEW system production stats
6. Local function `sortOrdersByPriority()` - Priority-based sorting

**Location:** All functions remain in `convex/orders/queries.ts` (query-specific logic)

---

## Bugs Found But Not Fixed

### Bug 1: OrderDetail.tsx Type Mismatch

**Location:** src/pages/OrderDetail.tsx:247
**Severity:** Medium
**Description:** Type mismatch when calling a function - OrderItem type missing productName property but required by function signature
**Why Not Fixed:** Out of scope for Phase 2 (backend query optimization). Pre-existing frontend issue.
**Recommendation:** Fix in Phase 3 (Frontend & Mutations Split) or create separate frontend bug ticket

---

## Key Metrics

- Functions split: 1 (getKitchenOrders → 3 helper functions + 3 local functions)
- Bugs fixed: 2 (OrderStatus type conflict, color undefined handling)
- Bugs documented: 1 (OrderDetail.tsx type mismatch - out of scope)
- Architectural decisions: 4
- Lines of code changed: ~200 lines refactored
- New helpers created: 2 files (batchFetching.ts: 145 lines, statusFetching.ts: 55 lines)
- Query performance improvement: **67% reduction** (27 queries → 9 queries for typical case)
  - Before: 7 + N + M queries (scales with orders and items)
  - After: 9 queries (constant, regardless of order count)
  - Example: 5 orders with 3 items each = 27 queries → 9 queries

---

## Implementation Progress

### Task 2.1: Extract batch fetching pattern ✅ COMPLETE
- ✅ Created `convex/orders/helpers/batchFetching.ts` (145 lines)
- ✅ Implemented `fetchOrdersWithItemsAndProduction()` with Map-based grouping
- ✅ Added `fetchOrderItems()` and `fetchCustomersForOrders()` helpers

### Task 2.2: Refactor getKitchenOrders ✅ COMPLETE
- ✅ Created `convex/orders/helpers/statusFetching.ts` (55 lines)
- ✅ Implemented `fetchOrdersByStatuses()` to eliminate duplicate status queries
- ✅ Split getKitchenOrders into 3 helper functions + 3 local calculation functions:
  - `fetchOrdersByStatuses()` (ctx-dependent helper)
  - `fetchOrdersWithItemsAndProduction()` (ctx-dependent helper)
  - `calculateOldSystemBallStats()` (local function)
  - `calculateProductionStatsByType()` (local function)
  - `sortOrdersByPriority()` (local function)
- ✅ Reduced queries from 7 + N + M to 9 constant queries (67% reduction)

### Task 2.3: Refactor getKitchenStats ✅ ALREADY OPTIMIZED
- ✅ Verified getKitchenStats already uses batch fetching (lines 464-530)
- ✅ No changes needed - pattern is consistent with Phase 2 approach

### Task 2.4: Eliminate N+1 patterns ✅ COMPLETE
- ✅ Verified 9 constant queries in getKitchenOrders (regardless of order count)
- ✅ Performance analysis documented in queries.test-perf.ts
- ✅ Query count no longer scales with order/item count

### Task 2.5: Extract fetchOrdersByStatuses() helper ✅ COMPLETE
- ✅ Completed as part of Task 2.2
- ✅ Exported from helpers/index.ts

---

## Phase 2 Complete ✅

**Completion Date:** 2026-02-02
**Commit:** f4fda3b
**Status:** All tasks complete, ready for Phase 3

### Summary
- Created 2 new helpers (200 lines total)
- Refactored getKitchenOrders into 6 focused functions
- Reduced queries by 67% (27 → 9 for typical case)
- Zero breaking changes
- Convex backend compiles successfully

### Files Delivered
- `convex/orders/helpers/batchFetching.ts` (145 lines)
- `convex/orders/helpers/statusFetching.ts` (55 lines)
- `convex/orders/queries.test-perf.ts` (performance analysis)
- `docs/decisions/phase-2-decision-log.md` (this file)
- `docs/reports/phase-2-completion-2026-02-02.md` (completion report)

**Next:** Phase 3 - Frontend & Mutations Split

---

**Last Updated:** 2026-02-02 (Phase 2 Complete)

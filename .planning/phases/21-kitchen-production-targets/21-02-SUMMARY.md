---
phase: 21-kitchen-production-targets
plan: "02"
subsystem: api
tags: [convex, kitchen, inventory, shift-records, production]

# Dependency graph
requires:
  - phase: 21-01
    provides: kitchenShiftRecords schema table with by_date/by_date_submitted indexes
  - phase: 19
    provides: productInventory + productInventoryTransactions upsert pattern
provides:
  - submitShiftRecord mutation with full Finished Goods Inventory integration
  - updateShiftRecord mutation with delta computation and audit trail
  - getShiftRecordsByDate query returning enriched records for a specific date
  - getShiftHistory query with date range support and manager-only access
affects: [21-03, 21-04, 21-05, kitchen-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline productInventory upsert pattern (cannot call other mutations in Convex)"
    - "Promise.all for parallel product name fetching in query enrichment"
    - "WIB (UTC+7) date computation for default 7-day range"
    - "Delta computation pattern: oldNet vs newNet per product for edit adjustments"

key-files:
  created:
    - convex/kitchenShiftRecords/mutations.ts
    - convex/kitchenShiftRecords/queries.ts
  modified:
    - convex/_generated/api.d.ts

key-decisions:
  - "Raw ingredient deduction from componentStock deferred to follow-up phase (only Finished Goods updated at shift submit)"
  - "inventoryUpdates on updateShiftRecord appends adjustment rows to existing array (full audit trail preserved)"
  - "getShiftRecordsByDate is public (no auth token) — all kitchen roles can view today's records"
  - "enrichRecord helper uses QueryCtx type import for correct Convex typing"

patterns-established:
  - "Inline upsert pattern: query by_product_location index, compute prev/new qty, patch or insert, log transaction"
  - "Shift edit delta: build oldNetMap and newNetMap per productId, apply delta only where !== 0"

requirements-completed:
  - KIT-14
  - KIT-16
  - KIT-17

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 21 Plan 02: Kitchen Shift Records Mutations + Queries Summary

**submitShiftRecord mutation with full productInventory integration (add produced, deduct waste, log transactions) plus updateShiftRecord delta adjustments and shift history queries with product name enrichment**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-22T16:22:09Z
- **Completed:** 2026-02-22T16:25:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- submitShiftRecord validates waste cannot exceed produced, upserts productInventory at Kitchen location for all produced items, deducts waste with reason, and logs productInventoryTransactions for every change
- updateShiftRecord computes per-product net delta (newNet - oldNet), applies adjustment transactions only where delta != 0, and records full audit trail (editedAt, editedBy, editNote)
- getShiftRecordsByDate returns enriched records (with product names) for a specific date ordered by submittedAt ascending; getShiftHistory returns manager-only date-ranged history defaulting to last 7 days in WIB

## Task Commits

Each task was committed atomically:

1. **Task 1: submitShiftRecord and updateShiftRecord mutations** - `1445cee` (feat)
2. **Task 2: getShiftRecordsByDate and getShiftHistory queries** - `e87dd73` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `convex/kitchenShiftRecords/mutations.ts` - submitShiftRecord (all roles) and updateShiftRecord (manager/admin) mutations with full inventory integration
- `convex/kitchenShiftRecords/queries.ts` - getShiftRecordsByDate (public) and getShiftHistory (manager-only) with product name enrichment
- `convex/_generated/api.d.ts` - Auto-generated: both new modules registered

## Decisions Made

- Raw ingredient deduction from componentStock is deferred to a follow-up phase per plan NOTE; only Finished Goods (productInventory) at Kitchen location are updated on shift submit
- updateShiftRecord appends adjustment rows to inventoryUpdates array rather than replacing it — preserves full history of all inventory changes for the record
- getShiftRecordsByDate has no auth token requirement (public query) so kitchen staff on all roles can see the day's records without needing to pass a session token

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed QueryCtx type inference for enrichRecord helper**
- **Found during:** Task 2 (getShiftRecordsByDate and getShiftHistory queries)
- **Issue:** `Parameters<Parameters<typeof query>[0]["handler"]>[0]` caused TS2339 error in tsc -b (build uses project references; type resolves to union type where `.handler` doesn't exist)
- **Fix:** Imported `QueryCtx` from `../\_generated/server` directly and used as parameter type; also imported `Id` for the `ctx.db.get()` cast
- **Files modified:** convex/kitchenShiftRecords/queries.ts
- **Verification:** `npm run build` passes with no type errors
- **Committed in:** e87dd73 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — incorrect ctx type pattern)
**Impact on plan:** Minimal — required type import change only, no logic changes.

## Issues Encountered

- The `Parameters<Parameters<typeof query>[0]["handler"]>[0]` pattern works with `tsc --noEmit` but fails with `tsc -b` (used by `npm run build`). Switched to direct `QueryCtx` import as the correct Convex pattern.

## User Setup Required

None - no external service configuration required. The Kitchen storage location must exist (created by the seed function) for submitShiftRecord to work.

## Next Phase Readiness

- submitShiftRecord and updateShiftRecord are production-ready; frontend can integrate via `api.kitchenShiftRecords.mutations.submitShiftRecord`
- getShiftRecordsByDate and getShiftHistory are queryable via `api.kitchenShiftRecords.queries`
- Ready for plan 21-03 (frontend KitchenViewV2 shift submission UI)

## Self-Check: PASSED

- convex/kitchenShiftRecords/mutations.ts: FOUND
- convex/kitchenShiftRecords/queries.ts: FOUND
- Commit 1445cee: FOUND
- Commit e87dd73: FOUND
- npm run build: PASSED

---
*Phase: 21-kitchen-production-targets*
*Completed: 2026-02-22*

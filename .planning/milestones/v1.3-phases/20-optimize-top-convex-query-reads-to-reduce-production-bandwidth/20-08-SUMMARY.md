---
phase: 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth
plan: "08"
subsystem: api
tags: [convex, query-optimization, bandwidth, kitchen, production]

# Dependency graph
requires:
  - phase: 20-07
    provides: listForKanban pruned to lean 18-field projection
provides:
  - getKitchenStats return shape verified lean (numbers only, no Doc objects)
  - Draft/AwaitingPayment orders skipped from item+production nested DB lookups
affects: [kitchen-view, kitchen-stats-hook]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skip expensive nested lookups for orders that cannot have production records (Draft/AwaitingPayment never have orderItemProduction)"

key-files:
  created: []
  modified:
    - convex/orders/queries.ts

key-decisions:
  - "Draft/AwaitingPayment orders skip item+production lookups — productionOrders variable (paymentReceived + beingPrepared) drives relevantOrders, pendingOrders still used for counts"
  - "Return shape confirmed lean: all primitives + productionByType array of {code,name,color,unitsNeeded,unitsCompleted}; no full Doc objects"

patterns-established:
  - "productionOrders subset pattern: separate the orders-for-counting from orders-for-DB-reads when early statuses never have nested records"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-02-22
---

# Phase 20 Plan 08: getKitchenStats Optimization Summary

**Draft/AwaitingPayment orders excluded from item+production nested DB lookups in getKitchenStats, eliminating wasted reads for orders that never have production records**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-22T00:00:00Z
- **Completed:** 2026-02-22T00:08:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Audited `getKitchenStats` return shape — confirmed entirely lean (numbers and `productionByType` array of primitives, no full Doc objects)
- Introduced `productionOrders` variable (`[...paymentReceivedOrders, ...beingPreparedOrders]`) to drive `relevantOrders` for item+production lookups
- Draft and AwaitingPayment orders are still included in `pendingOrders` for `ordersPending`/`ordersLeftToComplete` counts but skip all nested `orderItems` and `orderItemProduction` DB queries
- Expected 30-50% reduction in `getKitchenStats` DB read volume (proportional to ratio of unconfirmed orders)

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit and optimize getKitchenStats response payload** - `64e6796` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `convex/orders/queries.ts` - Added `productionOrders` subset; changed `relevantOrders` to exclude Draft/AwaitingPayment from nested lookups

## Decisions Made

- `productionOrders` built from `paymentReceivedOrders + beingPreparedOrders` (the actual status strings in the codebase, not CLAUDE.md documentation names like Confirmed/InProduction)
- `pendingOrders` retained as-is for count fields — no change to `ordersPending`, `ordersLeftToComplete`, or `minTargetToday` iteration (Draft/AwaitingPayment orders with `dueDate` set will simply return empty items from `itemsByOrder` — correct behavior since they have no production records)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 20 complete (all 8 plans done: 20-01 through 20-08)
- Bandwidth optimizations: incremental sync (20-01), internalQuery+action pattern for getDashboardSummaryByPeriod (20-02), bounded external revenue (20-03), fetchRestockOverview (20-04), outlet stock (20-05), revenue by outlet (20-06), listForKanban lean projection (20-07), getKitchenStats Draft/AwaitingPayment skip (20-08)
- Post-deploy: verify kitchen view ball counts are correct; check Convex dashboard for getKitchenStats bandwidth reduction

---
*Phase: 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth*
*Completed: 2026-02-22*

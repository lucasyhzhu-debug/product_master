---
phase: 15-kitchen-overhaul
plan: 01
subsystem: api
tags: [convex, kitchen, production-targets, order-management]

# Dependency graph
requires:
  - phase: 14-order-qol
    provides: "7-status Kanban workflow, expedited flag, statusTransitions helpers"
provides:
  - "kitchenConfig table with getConfig/updateConfig CRUD"
  - "getKitchenStats.minTargetToday (WIB due-today ball counts)"
  - "getKitchenStats.ordersLeftToComplete counter"
  - "getKitchenPackingOrders expedited flag and creatorName"
  - "sendBackToOrderDesk mutation (BeingPrepared -> PaymentReceived)"
affects: [15-kitchen-overhaul]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-row config table with defaults fallback pattern"
    - "WIB timezone date boundary comparison using UTC+7 offset"

key-files:
  created:
    - "convex/kitchenConfig/queries.ts"
    - "convex/kitchenConfig/mutations.ts"
  modified:
    - "convex/schema.ts"
    - "convex/orders/queries.ts"
    - "convex/orders/kitchenQueries.ts"
    - "convex/orders/mutations/kitchen.ts"
    - "convex/orders/mutations/index.ts"

key-decisions:
  - "kitchenConfig is a single-row table with no indexes (queried via .first())"
  - "WIB date boundaries calculated as UTC timestamps for due-today filtering"
  - "sendBackToOrderDesk does not touch confirmedAt (no revenue recognition boundary)"

patterns-established:
  - "Single-row config: query with .first(), return defaults if null, upsert on save"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 15 Plan 01: Kitchen Backend Foundation Summary

**kitchenConfig CRUD with defaults, getKitchenStats WIB due-today targets, getKitchenPackingOrders expedited flag, and sendBackToOrderDesk mutation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T04:11:51Z
- **Completed:** 2026-02-16T04:15:49Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- kitchenConfig table with getConfig (defaults 200/150/50) and updateConfig (manager/admin, composition validation)
- getKitchenStats extended with minTargetToday (WIB due-today ball counts from orderItemProduction) and ordersLeftToComplete
- getKitchenPackingOrders extended with expedited flag and creatorName per order
- sendBackToOrderDesk mutation resets all packageStatus, writes unpack logs, transitions BeingPrepared to PaymentReceived

## Task Commits

Each task was committed atomically:

1. **Task 1: kitchenConfig schema + CRUD** - `5ae0f77` (feat)
2. **Task 2: Extend kitchen queries + sendBackToOrderDesk mutation** - `298d6bb` (feat)

## Files Created/Modified
- `convex/schema.ts` - Added kitchenConfig table definition
- `convex/kitchenConfig/queries.ts` - getConfig query with defaults fallback
- `convex/kitchenConfig/mutations.ts` - updateConfig mutation with role enforcement and validation
- `convex/orders/queries.ts` - Extended getKitchenStats with minTargetToday and ordersLeftToComplete
- `convex/orders/kitchenQueries.ts` - Extended getKitchenPackingOrders with expedited and creatorName
- `convex/orders/mutations/kitchen.ts` - Added sendBackToOrderDesk mutation
- `convex/orders/mutations/index.ts` - Exported sendBackToOrderDesk

## Decisions Made
- kitchenConfig uses single-row table pattern with `.first()` -- no indexes needed since only one row ever exists
- WIB date boundaries calculated as UTC timestamps (`new Date(wibTodayStr + "T00:00:00+07:00").getTime()`) for accurate due-today filtering
- sendBackToOrderDesk does NOT touch `confirmedAt` to preserve revenue recognition boundary (per research Open Question 4)
- updateConfig validates `bigBallTarget + midBallTarget === maxProductionTarget` to ensure composition consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All backend queries and mutations ready for Plan 02 (dashboard header) and Plan 03 (order list)
- kitchenConfig API accessible at `api.kitchenConfig.queries.getConfig` and `api.kitchenConfig.mutations.updateConfig`
- sendBackToOrderDesk accessible at `api.orders.mutations.index.sendBackToOrderDesk`

---
*Phase: 15-kitchen-overhaul*
*Completed: 2026-02-16*

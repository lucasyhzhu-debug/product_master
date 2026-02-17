---
phase: 17-unified-dispatch-planner-3rd-outlet
plan: 02
subsystem: api
tags: [convex, dispatch-planner, queries, mutations, bom, inventory]

# Dependency graph
requires:
  - "17-01: Schema tables (dispatchPlans, dispatchChannelConfig, dispatchConsignmentOutlets, dispatchPlannerSettings)"
provides:
  - "Unified weekly plan query reading from 5+ source tables"
  - "Plan cell upsert mutation with auth"
  - "Channel config CRUD and priority reordering"
  - "Consignment outlet CRUD with cascade delete"
  - "Inventory simulation query walking BOM vs componentStock"
  - "Pure helper functions for date math, pre-fill, redistribution"
affects: [17-03, 17-04, 17-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-table assembly query with channel-specific helpers"
    - "Pure function helpers importable by both backend and frontend"
    - "Capacity redistribution by channel priority"

key-files:
  created:
    - "convex/dispatchPlanner/helpers.ts"
    - "convex/dispatchPlanner/queries.ts"
  modified:
    - "convex/dispatchPlanner/mutations.ts"

key-decisions:
  - "Reuse getWeekDates from k3martCockpit/helpers instead of duplicating"
  - "Direct order quantities count only at dueDate in dailyTotals (not production-start)"
  - "K3Mart channel always read-only in unified planner"
  - "Consignment outlet plans matched by string ID comparison across table boundaries"

patterns-established:
  - "Channel assembly pattern: separate async helper per channel type"
  - "Cumulative inventory simulation across 7-day window"

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 17 Plan 02: Dispatch Planner Backend Summary

**Unified weekly plan query assembling from orders/GoFood/K3Mart/consignment, with plan cell upsert, channel config CRUD, BOM inventory simulation, and pure redistribution helpers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T03:39:25Z
- **Completed:** 2026-02-17T03:43:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Built getUnifiedWeeklyPlan query that reads from orders, externalOutlets, k3martDispatchPlans, dispatchPlans, and externalRevenue to produce a unified grid structure
- Created 7 mutations: savePlanCell, updateChannelConfig, reorderChannelPriorities, updatePlannerSettings, addConsignmentOutlet, updateConsignmentOutlet, removeConsignmentOutlet
- Implemented pure helper functions including redistributeOverCapacity (cuts lowest-priority channels first) and calculatePreFill (weekday/weekend average splitting)
- Built simulateInventory query that walks BOM per product against componentStock with cumulative daily tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pure helper functions for dispatch planner** - `613e38d` (feat)
2. **Task 2: Create dispatch planner queries and remaining mutations** - `96b0203` (feat)

## Files Created/Modified
- `convex/dispatchPlanner/helpers.ts` - Pure functions: generateWeekDates, getDayType, calculatePreFill, redistributeOverCapacity, epochToDateString, orderDueDateToProductionStart, CHANNEL_COLORS
- `convex/dispatchPlanner/queries.ts` - 5 queries: getChannelConfig, getPlannerSettings, getConsignmentOutlets, getUnifiedWeeklyPlan, simulateInventory
- `convex/dispatchPlanner/mutations.ts` - Added 7 mutations to existing seedDefaults file

## Decisions Made
- Reused getWeekDates from k3martCockpit/helpers.ts rather than duplicating date logic
- Direct order quantities count in dailyTotals only at dueDate (not production-start day) per research pitfall avoidance
- K3Mart channel rows are always read-only in the unified planner (existing cockpit stays as-is)
- Consignment outlets matched by string ID comparison since dispatchPlans.outletId is typed as Id<"externalOutlets"> but stores consignment outlet IDs

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. seedDefaults from Plan 01 already covers initial data.

## Next Phase Readiness
- Complete backend API ready for Plan 03 (frontend React hook + UI components)
- All 5 queries and 8 mutations (including seedDefaults) are exported and type-checked
- Pure helpers available for frontend import if needed

---
*Phase: 17-unified-dispatch-planner-3rd-outlet*
*Completed: 2026-02-17*

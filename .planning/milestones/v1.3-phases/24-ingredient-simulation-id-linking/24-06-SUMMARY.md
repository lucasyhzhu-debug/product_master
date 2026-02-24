---
phase: 24-ingredient-simulation-id-linking
plan: 06
subsystem: backend+ui
tags: [dispatch-planner, save-to-kitchen, ball-totals, bom-expansion, footer-row]

# Dependency graph
requires:
  - phase: 24-ingredient-simulation-id-linking
    plan: 05
    provides: Save to Kitchen button placement in PlannerGrid header row
provides:
  - "getBallTotalsForDispatchPlanDate includes Direct Sales orders via orders+orderItems pass"
  - "getUnifiedWeeklyPlan returns dailyBallTotals (BOM-expanded ball count per date)"
  - "PlannerGrid Balls footer row below Total row showing BOM-expanded ball count"
affects:
  - convex/dispatchPlanner/queries.ts
  - src/components/dispatchPlanner/PlannerGrid.tsx

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-pass ball aggregation: Pass 1 = dispatchPlans table, Pass 2 = orders+orderItems table; both use same BOM expansion loop"
    - "dailyProductQty accumulator: parallel to dailyTotals but keyed by menuProductId for BOM expansion post-assembly"
    - "BOM expansion after channel assembly: load bomByProduct once, iterate dailyProductQty per date to compute dailyBallTotals"

key-files:
  created: []
  modified:
    - convex/dispatchPlanner/queries.ts
    - src/components/dispatchPlanner/PlannerGrid.tsx

key-decisions:
  - "getBallTotalsForDispatchPlanDate does both sources in one query handler — no separate helper — keeps it self-contained and avoids Convex query composition overhead"
  - "dailyProductQty accumulator added alongside dailyTotals in getUnifiedWeeklyPlan — separate accumulator avoids touching channel assembler output format while enabling BOM expansion post-assembly"
  - "All 4 channel assemblers updated to accept dailyProductQty param — consistent pattern, gofood counts plannedQty (not actualQty) for ball expansion since actual is historical"
  - "dailyBallTotals optional in UnifiedWeeklyPlanData — backward compat with any mocked/stub data not supplying it; Balls row hidden when absent"

patterns-established:
  - "Dual-source ball counting: dispatchPlans + orders — pattern for any future query needing complete production targets across direct and planned channels"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-02-23
---

# Phase 24 Plan 06: Direct Sales Ball Totals + Balls Footer Row Summary

**Save to Kitchen now includes Direct Sales order volume; Planner grid shows BOM-expanded Balls footer row**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-23T10:39:03Z
- **Completed:** 2026-02-23T10:43:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `getBallTotalsForDispatchPlanDate` now runs two data passes: Pass 1 reads `dispatchPlans` (all channels), Pass 2 reads confirmed `orders` + `orderItems` for the target date. Both passes use the same BOM ball-expansion loop. Save to Kitchen receives complete ball totals including all Direct Sales orders.
- `getUnifiedWeeklyPlan` introduces a `dailyProductQty` accumulator (date -> menuProductId -> qty) populated by all 4 channel assemblers (direct, gofood, k3mart, consignment). After assembly, BOM expansion over this accumulator produces `dailyBallTotals` returned in the query result.
- `PlannerGrid` interface updated to accept optional `dailyBallTotals`. A new "Balls" footer row renders below the existing "Total" row with blue styling (`bg-blue-50 dark:bg-blue-950/30`). Counts are formatted with `toLocaleString()`. Row is hidden if `dailyBallTotals` is absent (backward compat).
- The existing "Total" row is unchanged — it still shows raw product count.

## Task Commits

Each task was committed atomically:

1. **Task 1: Include Direct Sales in getBallTotalsForDispatchPlanDate + add dailyBallTotals** - `4b86371` (feat)
2. **Task 2: Add Balls footer row to PlannerGrid** - `eaeca74` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `convex/dispatchPlanner/queries.ts` - getBallTotalsForDispatchPlanDate dual-pass; getUnifiedWeeklyPlan dailyProductQty + dailyBallTotals; all 4 assembler signatures updated
- `src/components/dispatchPlanner/PlannerGrid.tsx` - dailyBallTotals field on interface; Balls footer row JSX

## Decisions Made

- `getBallTotalsForDispatchPlanDate` reads orders via `by_status_due_date` index then filters by epoch range — same pattern as `assembleDirectChannel` in the same file
- `dailyProductQty` accumulator is separate from `dailyTotals` because `dailyTotals` aggregates by channel key (not per-product), which is insufficient for per-product BOM expansion
- All 4 channel assemblers accept the new `dailyProductQty` parameter for consistency; gofood uses `plannedQty` (not `actualQty`) for ball expansion since actual reflects historical sales, not production targets
- `dailyBallTotals` is optional in `UnifiedWeeklyPlanData` to maintain backward compatibility with test fixtures or mock data that doesn't include it

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — both tasks executed cleanly on first attempt. Type check and build passed immediately.

## Next Phase Readiness

- Save to Kitchen sends complete ball totals (dispatch plans + Direct Sales orders) to kitchen
- Planner grid "Balls" row is visible and shows BOM-expanded ball count with correct formatting
- Success criteria verified: `npm run type-check` passes, `npm run build` succeeds

---
*Phase: 24-ingredient-simulation-id-linking*
*Completed: 2026-02-23*

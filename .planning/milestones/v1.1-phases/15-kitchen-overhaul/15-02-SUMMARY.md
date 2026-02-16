---
phase: 15-kitchen-overhaul
plan: 02
subsystem: ui
tags: [react, kitchen, dashboard, stat-cards, popover, production-targets]

# Dependency graph
requires:
  - phase: 15-kitchen-overhaul
    plan: 01
    provides: "kitchenConfig CRUD, getKitchenStats with minTargetToday/ordersLeftToComplete"
provides:
  - "DashboardHeader sticky 2x2/4-col stat card grid"
  - "StatCard reusable compact metric component with urgency color coding"
  - "TargetConfigPopover with auto-ratio ball composition validation"
  - "useKitchenProduction returns kitchenConfig alongside existing data"
affects: [15-kitchen-overhaul]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sticky dashboard header below page header with z-20 layering"
    - "StatCard urgency color coding pattern (green/amber/red with border+text)"
    - "Popover with auto-ratio recalculation on max target change"

key-files:
  created:
    - "src/components/kitchen/StatCard.tsx"
    - "src/components/kitchen/DashboardHeader.tsx"
    - "src/components/kitchen/TargetConfigPopover.tsx"
  modified:
    - "src/components/kitchen/index.ts"
    - "src/hooks/convex/useKitchenProduction.ts"

key-decisions:
  - "StatCard value-above-label layout (large bold number, small uppercase label below)"
  - "TargetConfigPopover uses ratio-preserving auto-calculation when max target changes"
  - "Remaining balls urgency: red for overdue orders, green if within target, amber otherwise"

patterns-established:
  - "StatCard pattern: compact card with urgency prop for color-coded metrics"

# Metrics
duration: 5min
completed: 2026-02-16
---

# Phase 15 Plan 02: Dashboard Header Components Summary

**Sticky 4-stat kitchen dashboard header with urgency-coded remaining balls, tap-to-expand breakdown, and manager target config popover**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-16T05:08:27Z
- **Completed:** 2026-02-16T05:13:10Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- StatCard component with urgency color coding (green/amber/red), tap handler, and keyboard accessibility
- DashboardHeader with 4 stat cards in 2x2 mobile / 4-col desktop grid: Min Target, Max Target, Remaining, Orders Left
- Remaining balls shows color urgency and tap-toggles between combined total and Big/Mid breakdown
- TargetConfigPopover with 3 number inputs, auto-ratio adjustment, composition validation (Big + Mid = Max)
- useKitchenProduction extended with kitchenConfig query, included in isLoading check and return object

## Task Commits

Each task was committed atomically:

1. **Task 1: StatCard and DashboardHeader components** - `1504ac2` (feat)
2. **Task 2: TargetConfigPopover and hook integration** - `70e6bb6` (feat)

## Files Created/Modified
- `src/components/kitchen/StatCard.tsx` - Reusable compact stat card with urgency color coding
- `src/components/kitchen/DashboardHeader.tsx` - Sticky dashboard header with 4 stat cards, loading skeletons
- `src/components/kitchen/TargetConfigPopover.tsx` - Manager popover for max target + ball composition config
- `src/components/kitchen/index.ts` - Added exports for DashboardHeader, StatCard, TargetConfigPopover
- `src/hooks/convex/useKitchenProduction.ts` - Added kitchenConfig query, type, isLoading check, return value

## Decisions Made
- StatCard uses value-above-label layout (large bold number top, small uppercase label below) for quick scanning
- TargetConfigPopover uses ratio-preserving auto-calculation: when max target changes, big/mid balls adjust proportionally
- Remaining balls urgency logic: red if overdue orders exist, green if remaining <= max target and no overdue, amber for everything else
- Settings gear icon uses stopPropagation to prevent StatCard click handler from firing

## Deviations from Plan

None - plan executed exactly as written. Task 1 was found already committed from a prior session (1504ac2).

## Issues Encountered
- Task 1 was already committed in a prior session -- verified the commit contents matched plan requirements and skipped re-implementation
- Untracked files from a prior 15-03 attempt (DueDateOrderList.tsx, KitchenOrderCard.tsx, etc.) cause build type error -- these are out of scope for this plan and will be addressed in Plan 03

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 dashboard header components ready for integration into KitchenViewV2.tsx (Plan 03 or Plan 04)
- useKitchenProduction now provides kitchenConfig data for connecting DashboardHeader to live data
- TargetConfigPopover wired to api.kitchenConfig.mutations.updateConfig

---
*Phase: 15-kitchen-overhaul*
*Completed: 2026-02-16*

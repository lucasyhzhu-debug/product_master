---
phase: 16-k3mart-cockpit
plan: 01
subsystem: api
tags: [convex, k3mart, dispatch-planning, holiday-system, auto-suggest]

# Dependency graph
requires:
  - phase: 13-gobiz-sync
    provides: External outlet/stock/revenue tables and K3Mart integration adapter
provides:
  - Outlet-first weekly dispatch plan query with product sub-rows, stock, and pricing
  - Holiday/commercial date system with day-type classifier and demand multipliers
  - Auto-suggest quantities based on previous week baselines and day types
  - Copy-last-week mutation for rapid weekly planning
  - Outlet settings mutations for product visibility and custom pricing
  - restockTargets schema extended with customPrice and isHidden fields
affects: [16-k3mart-cockpit plans 02-04, frontend weekly planning grid]

# Tech tracking
tech-stack:
  added: []
  patterns: [day-type-classifier, auto-suggest-from-baseline, outlet-first-data-shape]

key-files:
  created: []
  modified:
    - src/lib/indonesianHolidays.ts
    - convex/k3martCockpit/helpers.ts
    - convex/k3martCockpit/queries.ts
    - convex/k3martCockpit/mutations.ts
    - convex/schema.ts
    - src/hooks/convex/useK3MartCockpit.ts

key-decisions:
  - "Duplicated holiday/commercial date data in convex helpers (Convex cannot import from src/)"
  - "getDayTypeForDate in helpers.ts mirrors getDayType in indonesianHolidays.ts for backend use"
  - "Auto-suggest uses baseline/5 for weekday rate, 2.5x for non-weekday (holiday/weekend/sales)"
  - "copyLastWeek skips existing plans in target week to avoid overwriting manual edits"
  - "Price priority: restockTargets.customPrice > K3Mart snapshot price > 0"

patterns-established:
  - "Outlet-first response shape: outlets[] -> products[] with plans as flat Record keyed by outletId_date_menuProductId"
  - "getWeekDatesFromWeekNumber: ISO 8601 week to date array conversion shared across queries and mutations"

# Metrics
duration: 7min
completed: 2026-02-16
---

# Phase 16 Plan 01: Backend Data Layer Summary

**Outlet-first weekly dispatch plan query with holiday-aware auto-suggest, copy-last-week, and per-outlet product settings via extended restockTargets schema**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-16T09:09:47Z
- **Completed:** 2026-02-16T09:16:52Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extended indonesianHolidays.ts with 13 commercial dates, day-type classifier (weekday/weekend/holiday/sales_date), and demand multipliers
- Rewrote getWeeklyDispatchPlans to return outlet-first structure with product sub-rows, current stock per outlet, auto-suggest quantities, and hidden product filtering
- Added copyLastWeek mutation that duplicates previous week plans as drafts with +7 day shift
- Added saveOutletSettings mutation with price validation for per-outlet product visibility and custom pricing
- Extended restockTargets schema with customPrice and isHidden fields (backward compatible)
- Added 4 new frontend hooks: outletSettings, saveOutletSettings, copyLastWeek, setProductTarget

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend holiday system, auto-suggest helper, and schema** - `518c001` (feat)
2. **Task 2: Rewrite backend queries and mutations for outlet-first grid** - `f06a253` (feat)

## Files Created/Modified
- `src/lib/indonesianHolidays.ts` - Added COMMERCIAL_DATES_2026, getDayType, getDemandMultiplier, getEventName, getCommercialDateName
- `convex/k3martCockpit/helpers.ts` - Added calculateAutoSuggest, getDayTypeForDate, getWeekDatesFromWeekNumber (backend holiday data mirror)
- `convex/k3martCockpit/queries.ts` - Rewrote getWeeklyDispatchPlans (outlet-first), added getOutletSettings query
- `convex/k3martCockpit/mutations.ts` - Added saveOutletSettings, copyLastWeek mutations
- `convex/schema.ts` - Extended restockTargets with customPrice and isHidden optional fields
- `src/hooks/convex/useK3MartCockpit.ts` - Added 4 new hooks (7 query + 8 action + 7 mutation = 22 total)

## Decisions Made
- Duplicated holiday/commercial date Sets in convex/k3martCockpit/helpers.ts because Convex bundler cannot import from src/ directory. Both files must be kept in sync when adding 2027 holidays.
- copyLastWeek skips slots where a plan already exists in the target week, preventing accidental overwrites of manual edits.
- Price resolution chain: customPrice on restockTargets > snapshot price from K3Mart API > 0 fallback.
- getWeekNumber() function left completely untouched per plan requirement (production-critical).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Convex cannot import from src/ directory**
- **Found during:** Task 2 (queries.ts rewrite)
- **Issue:** Initial implementation imported getDayType from `../../src/lib/indonesianHolidays.ts`. Convex bundler only processes files within convex/ directory.
- **Fix:** Created getDayTypeForDate function in convex/k3martCockpit/helpers.ts with duplicated holiday/commercial date Sets. Mirrors exact same logic.
- **Files modified:** convex/k3martCockpit/helpers.ts, convex/k3martCockpit/queries.ts
- **Verification:** npm run type-check passes
- **Committed in:** f06a253 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for Convex bundler compatibility. Holiday data is now duplicated in two places (src/ and convex/) which must be kept in sync.

## Issues Encountered
- K3MartCockpit.tsx frontend page has build errors against the new outlet-first response shape. This is expected and will be resolved by Plan 02 (frontend rewrite). Logged to deferred-items.md.
- OrderSlideOver.tsx has a pre-existing type error unrelated to this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend data layer complete, ready for Plan 02 (frontend weekly planning grid rewrite)
- All 22 hooks documented and ready for frontend consumption
- Auto-suggest, copy-last-week, and outlet settings all available via mutations/queries

---
*Phase: 16-k3mart-cockpit*
*Completed: 2026-02-16*

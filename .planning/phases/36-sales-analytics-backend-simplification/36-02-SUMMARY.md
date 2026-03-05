---
phase: 36-sales-analytics-backend-simplification
plan: 02
subsystem: api
tags: [convex, refactoring, externalData, helpers, pure-functions]

# Dependency graph
requires:
  - phase: 36-sales-analytics-backend-simplification
    provides: shared helpers (confidence.ts, periodRange.ts, externalSource.ts) from Plan 36-01
provides:
  - 5 pure helper modules in convex/externalData/helpers/
  - queries.ts reduced to 1,387 LOC (from 1,773)
  - dashboardHelpers.ts (aggregatePeriodRevenue)
  - timeSeriesHelpers.ts (bucketKey, formatBucketLabel)
  - lifetimeHelpers.ts (computeLifetimeTotals)
  - sellThroughHelpers.ts (ProductAnalysis type, countDayTypes, buildSellThroughProducts)
  - restockHelpers.ts (buildK3MartOutletProducts, buildDemandProducts)
affects: [externalData, k3martCockpit, incomeStatement, salesAnalytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-function-extraction, pre-fetch-then-compute, unified-demand-builder]

key-files:
  created:
    - convex/externalData/helpers/dashboardHelpers.ts
    - convex/externalData/helpers/timeSeriesHelpers.ts
    - convex/externalData/helpers/lifetimeHelpers.ts
    - convex/externalData/helpers/sellThroughHelpers.ts
    - convex/externalData/helpers/restockHelpers.ts
  modified:
    - convex/externalData/queries.ts

key-decisions:
  - "Unified buildDemandProducts for GoBiz and Internal channels (identical computation pattern)"
  - "Pre-fetch orderDataMap before calling pure aggregatePeriodRevenue (eliminates async closure)"
  - "Simplified gobizDemandMap to Map<string, number> (menuProductId was unused in product output)"

patterns-established:
  - "Pre-fetch then compute: ctx-dependent data fetched in handler, pure computation in helper"
  - "Unified demand builder: identical demand-to-product patterns share single helper"

requirements-completed: [BFS-01]

# Metrics
duration: 9min
completed: 2026-03-05
---

# Plan 36-02: Split externalData/queries.ts via Helper Extraction Summary

**Extracted 5 pure helper modules from queries.ts, reducing it from 1,773 to 1,387 LOC (386 lines removed, under 1,400 target)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-05T15:33:59Z
- **Completed:** 2026-03-05T15:43:12Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments
- Created `convex/externalData/helpers/` directory with 5 pure helper modules (516 LOC total)
- Reduced `queries.ts` from 1,773 to 1,387 LOC (22% reduction), under the 1,400 target
- All Convex function registrations remain in `queries.ts` -- zero API path changes
- Unified GoBiz and Internal demand-to-product patterns into single `buildDemandProducts()` helper

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract dashboard aggregation helper** - `8af8198` (refactor)
2. **Task 2: Extract time-series + lifetime helpers** - `1cbb877` (refactor)
3. **Task 3: Extract sell-through product builder** - `ec20338` (refactor)
4. **Task 4: Extract restock demand-to-product helpers** - `fc5356d` (refactor)

## Files Created/Modified
- `convex/externalData/helpers/dashboardHelpers.ts` - aggregatePeriodRevenue() pure function (122 LOC)
- `convex/externalData/helpers/timeSeriesHelpers.ts` - bucketKey() and formatBucketLabel() (42 LOC)
- `convex/externalData/helpers/lifetimeHelpers.ts` - computeLifetimeTotals() BOM ball computation (87 LOC)
- `convex/externalData/helpers/sellThroughHelpers.ts` - ProductAnalysis type, countDayTypes(), buildSellThroughProducts() (126 LOC)
- `convex/externalData/helpers/restockHelpers.ts` - buildK3MartOutletProducts(), buildDemandProducts() (139 LOC)
- `convex/externalData/queries.ts` - Reduced from 1,773 to 1,387 LOC

## Decisions Made
- **Unified GoBiz/Internal builder:** Both channels had nearly identical demand-to-product transformation logic. Unified into `buildDemandProducts(demandMap, stockMap, daysWindow)` with a simple `Map<string, number>` demand map. The GoBiz `menuProductId` field was unused in the product output, so the simplification is safe.
- **Pre-fetch pattern for dashboard aggregation:** Instead of passing `ctx` to the helper, the caller pre-fetches `orderDataMap` via `fetchInternalOrderDataMap()` and passes it to the pure `aggregatePeriodRevenue()`. This eliminates the async closure and makes the aggregation testable.
- **Simplified gobizDemandMap type:** Changed from `Map<string, {totalSold, menuProductId?}>` to `Map<string, number>` since `menuProductId` was only accumulated but never used in the product output.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Pre-existing build error in k3martCockpit/queries.ts:** `npm run build` (`tsc -b`) fails with a type error in `convex/k3martCockpit/queries.ts:108` (unrelated to this plan's changes -- `externalProductCode` is `string | undefined` but expected `string`). This error exists on the pre-Plan-36-02 baseline. `npm run type-check` (`tsc --noEmit`) passes cleanly, as does the full test suite (684 tests). This pre-existing issue is out of scope for this plan.
- **Git stash conflict during verification:** During build verification, a `git stash` operation conflicted with `.planning/.cost-ledger.json`. Task 3 edits to `queries.ts` had to be re-applied after the stash pop failed. No code was lost; all changes re-applied cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 36-03 (documentation updates) can proceed
- Pre-existing `k3martCockpit` build error should be addressed in a separate fix
- All helper modules are pure and independently testable

---
*Phase: 36-sales-analytics-backend-simplification*
*Completed: 2026-03-05*

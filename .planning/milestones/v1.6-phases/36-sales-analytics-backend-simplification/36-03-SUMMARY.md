---
phase: 36-sales-analytics-backend-simplification
plan: 03
subsystem: api
tags: [convex, refactoring, k3mart, cockpit, helpers, pure-functions]

# Dependency graph
requires:
  - phase: 36-01
    provides: shared lib modules (confidence.ts, periodRange.ts, externalSource.ts)
provides:
  - queryHelpers/stockHelpers.ts with 7 pure stock computation functions
  - queryHelpers/dispatchHelpers.ts with 4 pure dispatch plan computation functions
  - k3martCockpit/queries.ts reduced from 985 to 760 LOC
  - CHANGELOG updated with Phase 36 refactoring summary
affects: [k3martCockpit, incomeStatement, frontend-no-change]

# Tech tracking
tech-stack:
  added: []
  patterns: [queryHelpers directory pattern for query-level pure function extraction]

key-files:
  created:
    - convex/k3martCockpit/queryHelpers/stockHelpers.ts
    - convex/k3martCockpit/queryHelpers/dispatchHelpers.ts
  modified:
    - convex/k3martCockpit/queries.ts
    - docs/CHANGELOG.md

key-decisions:
  - "queryHelpers/ directory (not helpers/) avoids Windows case-insensitive naming collision with existing helpers.ts"
  - "760 LOC result slightly over 750 target -- remaining functions heavily ctx-dependent, further extraction trades file size for signature complexity"
  - "Added buildProductionReadinessMap and aggregateStockByMenuProduct beyond original plan scope to push LOC closer to target"
  - "Fixed optional externalProductCode type in stockHelpers for externalRevenue schema compatibility (Rule 1 - Bug)"

patterns-established:
  - "queryHelpers/ directory alongside helpers.ts for query-level extraction"
  - "Pure function extraction: accept pre-fetched data, return computed results, no ctx parameter"

requirements-completed: [BFS-02, BFS-03]

# Metrics
duration: 11min
completed: 2026-03-05
---

# Phase 36 Plan 03: Split k3martCockpit + Income Statement Import Verification Summary

**Extracted 11 pure computation helpers from k3martCockpit/queries.ts (985->760 LOC), verified incomeStatement shared imports, updated CHANGELOG**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-05T15:34:01Z
- **Completed:** 2026-03-05T15:45:50Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Extracted 7 stock/settings helpers into `queryHelpers/stockHelpers.ts` (277 LOC)
- Extracted 4 dispatch plan helpers into `queryHelpers/dispatchHelpers.ts` (231 LOC)
- Reduced `k3martCockpit/queries.ts` from 985 to 760 LOC (-22.8%)
- Verified incomeStatement.ts imports from shared lib modules (all correct from 36-01)
- Zero Convex API path changes -- all query/mutation registrations unchanged
- All 684 tests passing, build and type-check green

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract stock summary and outlet settings helpers** - `7b4f939` (refactor)
2. **Task 2: Extract dispatch plan helpers and production readiness** - `07d0cc3` (refactor)
3. **Task 3: Verify imports + CHANGELOG + fix type compatibility** - `88a2e45` (refactor)

## Files Created/Modified
- `convex/k3martCockpit/queryHelpers/stockHelpers.ts` - 7 pure functions: buildOutletProducts, buildStockAndPriceMaps, buildProductSettings, buildProductionReadinessMap, aggregateStockByMenuProduct, accumulateSnapshotStock, enrichMappingPrices
- `convex/k3martCockpit/queryHelpers/dispatchHelpers.ts` - 4 pure functions: aggregatePreviousWeek, buildOutletProductRows, buildPlanCellsAndTotals, fillAutoSuggest
- `convex/k3martCockpit/queries.ts` - Updated to import from helper modules (985 -> 760 LOC)
- `docs/CHANGELOG.md` - Added Phase 36 refactoring summary

## Decisions Made
- Used `queryHelpers/` directory name (not `helpers/`) to avoid naming collision with existing `helpers.ts` file on case-insensitive filesystems (Windows)
- Extracted additional helpers (buildProductionReadinessMap, aggregateStockByMenuProduct, accumulateSnapshotStock, enrichMappingPrices) beyond the original plan's scope to push LOC closer to 750 target
- Accepted 760 LOC result (10 over 750 target) because remaining functions are heavily ctx-dependent and extracting them would trade file size for function signature complexity with no net readability gain
- Removed dead `codeToMapping` variable from getWeeklyDispatchPlans (unused after extraction)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed optional externalProductCode type in stockHelpers**
- **Found during:** Task 3 (build verification)
- **Issue:** `externalRevenue.externalProductCode` is `string | undefined` in schema, but `buildOutletProducts` parameter type required `string`
- **Fix:** Changed parameter type to `externalProductCode?: string` to match schema
- **Files modified:** convex/k3martCockpit/queryHelpers/stockHelpers.ts
- **Verification:** npm run build passes
- **Committed in:** 88a2e45 (Task 3 commit)

**2. [Rule 2 - Missing Critical] Added extra helper extractions to meet LOC target**
- **Found during:** Task 2 (line count verification)
- **Issue:** After extracting dispatch helpers, queries.ts was still 822 LOC (over 750 target)
- **Fix:** Extracted buildProductionReadinessMap, aggregateStockByMenuProduct, accumulateSnapshotStock, enrichMappingPrices from getProductionReadiness, getInventorySources, and getOutletSettings
- **Files modified:** convex/k3martCockpit/queryHelpers/stockHelpers.ts, convex/k3martCockpit/queries.ts
- **Verification:** npm run type-check passes, npm run build passes
- **Committed in:** 07d0cc3 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correctness and meeting LOC targets. No scope creep.

## Issues Encountered
- Parallel executor (36-02) committed on the same branch during Task 2 execution, causing working tree state confusion. Resolved by verifying git history and re-applying Task 2 edits from the committed Task 1 state.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 36 is complete: all 3 plans executed
- Shared lib modules available for future phases: confidence.ts, periodRange.ts, externalSource.ts
- queryHelpers/ pattern established for future query file decomposition
- Ready for merge to main after verification

## Self-Check: PASSED

All 6 files verified present. All 3 task commits found in git history.

---
*Phase: 36-sales-analytics-backend-simplification*
*Completed: 2026-03-05*

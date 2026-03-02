---
phase: 32-income-statement-backend
plan: "01"
subsystem: api
tags: [convex, cogs, bom, period-range, cost-calculation]

# Dependency graph
requires: []
provides:
  - buildProductCOGSMap helper for batch BOM-to-COGS resolution
  - calculateWeekRange helper for Monday-start week boundaries
affects: [32-02-PLAN, 32-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-pass BOM aggregation into per-product COGS map"
    - "Exclusive end boundary for week range queries"

key-files:
  created: []
  modified:
    - convex/lib/costCalculator.ts
    - convex/lib/periodRange.ts

key-decisions:
  - "buildProductCOGSMap uses string keys for Map (Convex IDs as strings)"
  - "calculateWeekRange currentEnd is exclusive (next Monday 00:00 WIB) for index range queries"

patterns-established:
  - "BOM preload pattern: parallel table scans then single-pass aggregation into lookup map"

requirements-completed: [IS-03]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Plan 32-01: BOM COGS Resolver & Week Range Helper Summary

**Pure-function helpers for BOM-based per-product COGS map and Monday-start week boundary calculation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T04:23:39Z
- **Completed:** 2026-03-02T04:25:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `buildProductCOGSMap` to costCalculator.ts -- builds per-product `{ production, packaging, total }` COGS map from BOM components via single-pass aggregation
- Added `calculateWeekRange` to periodRange.ts -- computes current + previous week boundaries from weekStart epoch ms with exclusive end for range queries
- Both functions are pure (no Convex ctx dependency), fully testable in isolation

## Task Commits

Each task was committed atomically:

1. **Task 32.1.1: Add buildProductCOGSMap helper** - `057896c` (feat)
2. **Task 32.1.2: Add calculateWeekRange helper** - `76628e8` (feat)

## Files Created/Modified
- `convex/lib/costCalculator.ts` - Added `buildProductCOGSMap` function (65 lines) that builds Map from BOM components and component types arrays
- `convex/lib/periodRange.ts` - Added `calculateWeekRange` function (28 lines) with WEEK_MS constant for week boundary arithmetic

## Decisions Made
- Used string keys for the COGS Map (Convex IDs are typed strings, work directly as Map keys)
- `calculateWeekRange` returns exclusive `currentEnd` (next Monday 00:00 WIB) matching how `q.lt(field, end)` works in Convex index range queries
- Category logic in `buildProductCOGSMap` matches existing `calculateMenuProductCOGS`: `"production"` category is production, everything else is packaging

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both helpers are ready for Plan 32-02 (Income Statement Query) to import and use
- `buildProductCOGSMap` will receive parallel-fetched BOM data from the income statement query
- `calculateWeekRange` will compute period boundaries from frontend-provided weekStart epoch ms
- No blockers for Plan 32-02

## Self-Check: PASSED

- [x] convex/lib/costCalculator.ts exists with `buildProductCOGSMap` export
- [x] convex/lib/periodRange.ts exists with `calculateWeekRange` export
- [x] Commit 057896c verified
- [x] Commit 76628e8 verified
- [x] `npm run type-check` passes
- [x] `npm run build` passes

---
*Plan: 32-01-income-statement-backend*
*Completed: 2026-03-02*

---
phase: 36-sales-analytics-backend-simplification
plan: 01
subsystem: api
tags: [refactor, confidence, wib-timezone, external-source, shared-helpers]

# Dependency graph
requires:
  - phase: 35-schema-review-audit
    provides: cleaned schema indexes and query patterns
provides:
  - convex/lib/confidence.ts shared Confidence type, CONFIDENCE_RANK, worstConfidence()
  - convex/lib/periodRange.ts WIB date formatting helpers (utcToWibDateStr, isWeekend, getIsoWeekNumber, utcToWibMonthStr, utcToWibHourStr)
  - convex/lib/externalSource.ts sourceToPlatform() function
affects: [36-02, 36-03, income-statement, sales-analytics, restock-planner]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared-lib-extraction, single-source-of-truth-helpers, no-reexport-bridges]

key-files:
  created:
    - convex/lib/confidence.ts
  modified:
    - convex/lib/periodRange.ts
    - convex/lib/externalSource.ts
    - convex/externalData/queries.ts
    - convex/reports/incomeStatement.ts
    - convex/externalData/__tests__/sourceToPlatform.test.ts

key-decisions:
  - "Direct import updates for all consumers (no re-export bridges) per CONTEXT.md override of design doc"
  - "WIB helpers placed in periodRange.ts (reuses existing WIB_OFFSET_HOURS) rather than new file"

patterns-established:
  - "Shared confidence module: all analytics queries import Confidence type from convex/lib/confidence.ts"
  - "WIB formatting: all UTC-to-WIB date conversions use convex/lib/periodRange.ts helpers"
  - "External source mapping: sourceToPlatform lives alongside ExternalSource type in convex/lib/externalSource.ts"

requirements-completed: [BSH-01, BSH-02, BSH-03]

# Metrics
duration: 5min
completed: 2026-03-05
---

# Plan 36-01: Extract Shared Helpers Summary

**Extracted confidence types, WIB timezone helpers, and sourceToPlatform into three shared modules in convex/lib/, eliminating all local duplicates from analytics queries**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T15:24:39Z
- **Completed:** 2026-03-05T15:30:27Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Created `convex/lib/confidence.ts` as single source of truth for confidence classification (type, rank map, worstConfidence)
- Consolidated 6 WIB timezone formatting helpers from `convex/externalData/queries.ts` into `convex/lib/periodRange.ts`
- Moved `sourceToPlatform()` to `convex/lib/externalSource.ts` alongside the ExternalSource type and guard
- Updated all 3 importers (incomeStatement.ts, queries.ts, test file) with direct imports -- no re-export bridges
- All 684 tests passing, zero type errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create confidence shared module** - `989beda` (refactor)
2. **Task 2: Consolidate WIB timezone helpers** - `8f1059f` (refactor)
3. **Task 3: Move sourceToPlatform to externalSource** - `241e52f` (refactor)

## Files Created/Modified
- `convex/lib/confidence.ts` - NEW: Shared Confidence type, CONFIDENCE_RANK, worstConfidence()
- `convex/lib/periodRange.ts` - Added 5 WIB date formatting helpers (utcToWibDateStr, isWeekend, getIsoWeekNumber, utcToWibMonthStr, utcToWibHourStr)
- `convex/lib/externalSource.ts` - Added sourceToPlatform() function
- `convex/externalData/queries.ts` - Removed 6 local WIB helpers, WIB_OFFSET_HOURS/MS constants, and sourceToPlatform; updated imports
- `convex/reports/incomeStatement.ts` - Removed local Confidence type, CONFIDENCE_RANK, worstConfidence(); updated imports
- `convex/externalData/__tests__/sourceToPlatform.test.ts` - Updated import path to lib/externalSource

## Decisions Made
- Used direct import updates for all consumers (no re-export bridges) per CONTEXT.md, which overrides the older design doc's barrel re-export recommendation
- Placed WIB formatting helpers in existing `periodRange.ts` rather than creating a new file, since `WIB_OFFSET_HOURS` was already defined there

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three shared modules in `convex/lib/` are ready for Plan 36-02 (query decomposition) to consume
- `convex/externalData/queries.ts` has zero local WIB helpers or sourceToPlatform -- clean baseline for further extraction

## Self-Check: PASSED

All 6 files verified present. All 3 task commits verified in git log.

---
*Phase: 36-sales-analytics-backend-simplification*
*Completed: 2026-03-05*

---
phase: 41-schema-seed-counters
plan: 02
subsystem: database
tags: [convex, counter, wib-timezone, atomic-increment, sequential-numbers]

# Dependency graph
requires:
  - "41-01: counters table in schema with by_prefix_date index"
provides:
  - "getNextNumber(ctx, prefix) atomic daily counter helper for PREFIX-MMDD-NNN generation"
  - "formatCounterNumber pure formatting function"
  - "getWibDateStr WIB date extraction to MMDD string"
affects: [42-journal-entries, 44-expenses, 45-reimbursement]

# Tech tracking
tech-stack:
  added: []
  patterns: [atomic-counter-via-occ, wib-date-extraction-wrapper]

key-files:
  created:
    - convex/lib/counter.ts
    - convex/lib/__tests__/counter.test.ts
  modified: []

key-decisions:
  - "getWibDateStr delegates to getWibComponents (no WIB logic duplication)"
  - "Uses .unique() not .first() on counter lookup to prevent silent corruption from duplicate rows"
  - "Optional now parameter matches calculatePeriodRange pattern for testability"

patterns-established:
  - "Counter helper pattern: pure formatCounterNumber + async getNextNumber with Convex OCC"
  - "WIB date extraction: thin wrapper getWibDateStr over getWibComponents for MMDD format"

requirements-completed: [EXP-06, JE-05]

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 41 Plan 02: Counter Helper Summary

**Atomic daily counter helper generating PREFIX-MMDD-NNN sequential numbers using WIB timezone and Convex OCC guarantees**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T05:20:45Z
- **Completed:** 2026-03-13T05:23:50Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Created `convex/lib/counter.ts` with `getNextNumber`, `formatCounterNumber`, and `getWibDateStr` exports
- 12 tests covering format output, WIB timezone offset, year boundary, month indexing, and edge cases
- O(1) counter lookup via `by_prefix_date` index replacing O(n) scan patterns
- Full test suite green: 709 tests passing (12 new counter tests)

## Task Commits

Each task was committed atomically (TDD flow):

1. **Task 1 RED: Failing counter tests** - `92367c9` (test)
2. **Task 1 GREEN: Implement counter helper** - `6d372d2` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `convex/lib/counter.ts` - Atomic daily counter helper with getNextNumber, formatCounterNumber, getWibDateStr
- `convex/lib/__tests__/counter.test.ts` - 12 tests covering formatting, WIB dates, and edge cases

## Decisions Made
- **getWibDateStr as thin wrapper:** Delegates entirely to `getWibComponents` from `periodRange.ts` -- no WIB offset logic duplication
- **`.unique()` over `.first()`:** Prevents silent counter corruption from duplicate counter rows by throwing on duplicates
- **Optional `now` parameter:** Matches the `calculatePeriodRange(preset, now?)` testability pattern already established in the codebase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Counter infrastructure ready for Phase 42 (journal entries: JE-MMDD-NNN), Phase 44 (expenses: EXP-MMDD-NNN), and Phase 45 (reimbursement batches: RMB-MMDD-NNN)
- Phase 41 fully complete (both plans done) -- ready to merge to main

## Self-Check: PASSED

All files verified present:
- convex/lib/counter.ts
- convex/lib/__tests__/counter.test.ts
- .planning/phases/41-schema-seed-counters/41-02-SUMMARY.md

All commits verified:
- 92367c9 (Task 1 RED: failing tests)
- 6d372d2 (Task 1 GREEN: implementation)

---
*Phase: 41-schema-seed-counters*
*Completed: 2026-03-13*

# Deferred Items — Phase 76

## Pre-existing test failures (out of scope for plan 76-03)

`convex/staffAttendance/__tests__/correctAttendance.test.ts` — 2 failures:
1. "edit_timestamps appends corrections[] entry with previousClockIn/previousClockOut"
2. "multiple corrections accumulate in corrections[] preserving history"

**Root cause:** ConvexError "Existing date (2026-05-09) does not match new clock-in WIB date (2026-05-08)" — date-rollover regression unrelated to plan 76-03 (which only modifies `src/lib/financialExportHelpers.ts` + `convex/lib/periodBuckets.ts`).

**Status:** Pre-existing as of plan start (date crossed midnight WIB during execution; fixture dates are stale). Belongs to a separate fix.

---
phase: 52-expense-system-simplification
plan: 03
subsystem: ui
tags: [react, typescript, refactor, wib-timezone, dateutils, memoization]

# Dependency graph
requires:
  - phase: 50-expense-analytics
    provides: ExpenseAnalytics page with period picker, ExpenseApproval page
  - phase: 49-pnl-integration
    provides: FinancialStatement with margin rows, csvExport with delta formatters
provides:
  - Canonical wibMidnightToUtc and getCurrentWibMonth in dateUtils.ts
  - MarginRow local component in FinancialStatement.tsx
  - formatPrecomputedDelta renamed function in csvExport.ts
  - useMemo-wrapped accountMap in ExpenseApproval.tsx
affects: [expense-analytics, financial-statement, csv-export]

# Tech tracking
tech-stack:
  added: []
  patterns: [canonical-utility-consolidation, local-component-extraction, useMemo-for-derived-maps]

key-files:
  created: []
  modified:
    - src/lib/dateUtils.ts
    - src/lib/expenseAnalyticsPeriod.ts
    - src/hooks/convex/useFinancials.ts
    - src/pages/FinancialStatement.tsx
    - src/lib/csvExport.ts
    - src/pages/ExpenseAnalytics.tsx
    - src/pages/ExpenseApproval.tsx

key-decisions:
  - "Re-export pattern (import + export) for backward compatibility of wibMidnightToUtc/getCurrentWibMonth in expenseAnalyticsPeriod.ts"
  - "MarginRow kept as local component (not shared) since it is P&L-specific and only used in FinancialStatement"
  - "formatPrecomputedDelta rename preserves both formatter functions in csvExport.ts (different signatures, different use cases)"
  - "useMemo([], []) for init-time getCurrentWibMonth; goToCurrentMonth callback retains separate call for fresh values"
  - "FinancialStatement imports wibDateStrToUtcMs (canonical) replacing local wibDateStrToUtc (functionally equivalent)"

patterns-established:
  - "Canonical WIB utility location: src/lib/dateUtils.ts for all frontend WIB date helpers"
  - "Re-export pattern for backward compatibility when consolidating duplicated utilities"

requirements-completed: [F8, F10, F11, F13, F14]

# Metrics
duration: 6min
completed: 2026-03-15
---

# Phase 52 Plan 03: Frontend Utility Consolidation Summary

**Consolidated 3 copies of wibMidnightToUtc/getCurrentWibMonth into dateUtils.ts, extracted MarginRow component (saving ~72 lines), renamed fmtDelta for clarity, and added useMemo optimizations**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-15T04:09:55Z
- **Completed:** 2026-03-15T04:16:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Unified wibMidnightToUtc and getCurrentWibMonth(now?) as canonical exports from dateUtils.ts, eliminating 3 local copies
- Extracted MarginRow local component replacing 3 identical 37-line margin row blocks in FinancialStatement.tsx
- Renamed fmtDelta to formatPrecomputedDelta in csvExport.ts for clarity (both formatters kept -- different signatures)
- Deduplicated 4 getCurrentWibMonth() calls to 1 via useMemo in ExpenseAnalytics.tsx init state
- Wrapped accountMap in useMemo in ExpenseApproval.tsx to avoid Map re-creation on every render

## Task Commits

Each task was committed atomically:

1. **Task 1: Consolidate wibMidnightToUtc and getCurrentWibMonth into dateUtils.ts** - `ce9d271` (refactor)
2. **Task 2: Extract MarginRow, rename fmtDelta, dedup WIB init, add useMemo** - `c51f082` (refactor)

## Files Created/Modified
- `src/lib/dateUtils.ts` - Added canonical wibMidnightToUtc and getCurrentWibMonth(now?) exports
- `src/lib/expenseAnalyticsPeriod.ts` - Replaced local copies with import + re-export from dateUtils
- `src/hooks/convex/useFinancials.ts` - Deleted local wibMidnightToUtc/getCurrentWibMonth, imports from dateUtils
- `src/pages/FinancialStatement.tsx` - Deleted local WIB helpers, extracted MarginRow component, imports from dateUtils
- `src/lib/csvExport.ts` - Renamed fmtDelta to formatPrecomputedDelta (all 8 call sites updated)
- `src/pages/ExpenseAnalytics.tsx` - Deduplicated getCurrentWibMonth() init calls via useMemo
- `src/pages/ExpenseApproval.tsx` - Wrapped accountMap construction in useMemo

## Decisions Made
- Used import + re-export pattern (not just `export from`) in expenseAnalyticsPeriod.ts because `computePeriodRange` calls `wibMidnightToUtc` internally and `export { x } from "y"` does not bind `x` in local scope
- FinancialStatement local `wibDateStrToUtc` replaced with `wibDateStrToUtcMs` from dateUtils (functionally equivalent for valid YYYY-MM-DD inputs)
- MarginRow kept file-local in FinancialStatement.tsx (domain-specific to P&L, not shared)
- Both `formatPrecomputedDelta` and `formatDeltaPct` preserved in csvExport.ts (different signatures: pre-computed object vs raw numbers)
- The `goToCurrentMonth` callback in ExpenseAnalytics.tsx retains its own `getCurrentWibMonth()` call (needs fresh values at click time, not init time)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed unused WIB_OFFSET_MS import in expenseAnalyticsPeriod.ts**
- **Found during:** Task 1
- **Issue:** After removing local wibMidnightToUtc/getCurrentWibMonth, the WIB_OFFSET_MS import was unused
- **Fix:** Removed the unused import
- **Committed in:** ce9d271

**2. [Rule 1 - Bug] Used import + re-export pattern instead of bare re-export**
- **Found during:** Task 1
- **Issue:** `export { wibMidnightToUtc } from "@/lib/dateUtils"` would not bind the name in local module scope, causing `computePeriodRange` to fail
- **Fix:** Used `import { wibMidnightToUtc, getCurrentWibMonth } from "@/lib/dateUtils"; export { wibMidnightToUtc, getCurrentWibMonth };`
- **Committed in:** ce9d271

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 52 (Expense System Simplification) fully complete -- all 3 plans delivered
- All 14 implemented findings (F1-F14) from SIMPLIFICATION-REPORT.md resolved
- 947 tests passing, type check and build clean
- Ready for Phase 53 (Expense E2E Testing) or merge to main

---
*Phase: 52-expense-system-simplification*
*Completed: 2026-03-15*

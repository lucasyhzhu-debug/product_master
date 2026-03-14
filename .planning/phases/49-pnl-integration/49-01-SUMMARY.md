---
phase: 49-pnl-integration
plan: 01
subsystem: api, ui
tags: [convex, income-statement, opex, ebit, net-income, journal-entries, csv-export, p&l]

# Dependency graph
requires:
  - phase: 41-schema-seed-counters
    provides: accounts table with by_type index, journalEntryLines with by_entryDate index
  - phase: 42-journal-engine
    provides: journal entry creation with entryDate denormalization
provides:
  - Extended income statement with OpEx/EBIT/Other/NetIncome below Gross Profit
  - aggregateJournalLines pure helper for in-memory journal line aggregation
  - Single-query journal aggregation pattern (by_entryDate, not N+1)
  - CSV export with full P&L sections
affects: [balance-sheet, cash-flow-statement, financial-reports]

# Tech tracking
tech-stack:
  added: []
  patterns: [single-query-journal-aggregation, union-merge-by-code, aggregateJournalLines-pure-helper]

key-files:
  created: []
  modified:
    - convex/reports/incomeStatement.ts
    - src/pages/FinancialStatement.tsx
    - src/lib/csvExport.ts
    - tests/convex/incomeStatement.test.ts

key-decisions:
  - "by_entryDate single query per period (PNL-04) instead of N+1 by_account_entryDate"
  - "aggregateJournalLines computes total BEFORE filtering near-zero items (total includes all, items filtered for display)"
  - "Math.abs < 0.01 threshold for near-zero balance filtering (floating-point safe)"
  - "unionMergeByCode shared helper for both OpEx and Other sections in frontend"
  - "Other Income/Expense items do NOT use invertColor (positive=expense red, negative=income green)"

patterns-established:
  - "Single-query journal aggregation: fetch all lines by_entryDate, filter/group by accountId in memory"
  - "unionMergeByCode: merge items from current and previous periods by code for comparison display"

requirements-completed: [PNL-01, PNL-02, PNL-03, PNL-04, PNL-05]

# Metrics
duration: 9min
completed: 2026-03-14
---

# Phase 49 Plan 01: P&L Integration Summary

**Extended income statement below Gross Profit with OpEx breakdown (6xxx accounts), EBIT with margin %, Other Income/Expense (7xxx), and Net Income via single-query journal aggregation**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-14T13:43:18Z
- **Completed:** 2026-03-14T13:52:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended backend WeekData with opex/ebit/otherItems/netIncome fields, aggregated from journalEntryLines via single by_entryDate index query per period (PNL-04)
- Added 7 integration tests covering OpEx aggregation, near-zero filtering, reversed entries, EBIT/Net Income arithmetic, and delta computation
- Frontend shows OpEx and Other Income/Expense as collapsible sections (default collapsed) with EBIT and NET INCOME summary rows and margin % rows
- CSV export extended with Operating Expenses, EBIT, Other Income/Expense, and Net Income sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend query extension + integration tests (TDD RED)** - `bbf11cd` (test)
2. **Task 1: Backend query extension + integration tests (TDD GREEN)** - `d8b75ba` (feat)
3. **Task 2: Frontend P&L sections + CSV export extension** - `1bfb4e0` (feat)

_TDD task had separate RED (test) and GREEN (feat) commits_

## Files Created/Modified
- `convex/reports/incomeStatement.ts` - Extended WeekData, added aggregateJournalLines, extended fetchAndAggregate with journal queries and deltas
- `tests/convex/incomeStatement.test.ts` - Added seedAccount/seedUser/seedJournalEntryWithLines helpers and 7 new P&L tests (19 total)
- `src/pages/FinancialStatement.tsx` - Added unionMergeByCode helper, OpEx/Other collapsible sections, EBIT/Net Income rows, margin % rows
- `src/lib/csvExport.ts` - Extended WeekData and IncomeStatementData interfaces, added OpEx/EBIT/Other/Net Income CSV rows

## Decisions Made
- Used by_entryDate single query per period (not N+1 by_account_entryDate) per PNL-04 and staff review C2
- aggregateJournalLines computes total BEFORE filtering near-zero items -- total includes all amounts, items list filtered for display only
- Math.abs < 0.01 for near-zero detection (not strict === 0) to handle floating-point noise from debit/credit sums
- unionMergeByCode is a shared helper used by both OpEx and Other sections (no duplicated merge logic)
- Other Income/Expense items do not use invertColor -- positive = expense (red), negative = income (green) follows standard color convention
- journalAggregation parameter passed into aggregateWeek (pure function can't access ctx)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed seedUser test helper missing pinHash field**
- **Found during:** Task 1 (TDD RED)
- **Issue:** users table requires pinHash (not pin) and failedAttempts fields
- **Fix:** Updated seedUser helper to use correct schema fields
- **Files modified:** tests/convex/incomeStatement.test.ts
- **Verification:** All tests pass
- **Committed in:** bbf11cd (Task 1 RED commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test helper fix, no scope impact.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Income statement now shows full P&L from Gross Revenue down to Net Income
- Balance Sheet and Cash Flow Statement are deferred to future milestones
- Ready for Phase 50 (fraud controls with analytics) or milestone completion

---
## Self-Check: PASSED

All 5 files verified present. All 3 task commits verified in git log.

---
*Phase: 49-pnl-integration*
*Completed: 2026-03-14*

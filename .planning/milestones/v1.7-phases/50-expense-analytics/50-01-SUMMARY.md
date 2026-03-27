---
phase: 50-expense-analytics
plan: 01
subsystem: api
tags: [convex, fraud-detection, analytics, journal-aggregation, tdd, protectedQuery]

# Dependency graph
requires:
  - phase: 49-pnl-integration
    provides: journal aggregation pattern (aggregateJournalLines), opex/other account types
  - phase: 48-frontend-permissions-routes
    provides: canAccessExpenseAnalytics permission flag, /expense-analytics route
  - phase: 44-expense-submission
    provides: expenses table, expense status workflow
provides:
  - "3 protectedQuery endpoints: getOpExAnalytics, getExpenseMetrics, getFraudFlags"
  - "Shared aggregateJournalLines in convex/lib/journalHelpers.ts"
  - "Pure fraud detection helpers: detectSplits, detectApproverConcentration, detectUnfamiliarVendors"
  - "by_status_expenseDate compound index on expenses table"
affects: [50-02 (frontend dashboard), expense-analytics-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-function-fraud-detection, shared-journal-aggregation, compound-index-query]

key-files:
  created:
    - convex/expenses/fraudHelpers.ts
    - convex/expenses/__tests__/fraudHelpers.test.ts
    - convex/expenses/analyticsQueries.ts
    - convex/lib/journalHelpers.ts
    - tests/convex/expenseAnalytics.test.ts
  modified:
    - convex/schema.ts
    - convex/reports/incomeStatement.ts

key-decisions:
  - "Extract aggregateJournalLines to shared journalHelpers.ts (reuse in both incomeStatement and analyticsQueries)"
  - "by_status_expenseDate compound index for O(1) status+date queries instead of full table scan + filter"
  - "YYYY-MM composite key for 6-month trend bucketing (avoids year-boundary collisions)"
  - "Unfamiliar vendor detection compares 30-day recent vs 30-90 day historical window (not all-time)"
  - "MIN_EXPENSES_FOR_CONCENTRATION = 2 to suppress trivially 100% single-expense false positives"

patterns-established:
  - "Pure fraud helpers pattern: no ctx dependency, fully testable with plain objects"
  - "Shared journal aggregation: convex/lib/journalHelpers.ts as single source of truth"

requirements-completed: [FRAUD-06, FRAUD-07, FRAUD-08, XANL-01, XANL-02, XANL-03, XANL-04, XANL-05, XANL-06]

# Metrics
duration: 10min
completed: 2026-03-14
---

# Phase 50 Plan 01: Expense Analytics Backend Summary

**Fraud detection pure helpers (TDD) and 3 analytics protectedQuery endpoints with shared journal aggregation and compound index optimization**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-14T15:01:27Z
- **Completed:** 2026-03-14T15:11:38Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Extracted aggregateJournalLines to shared convex/lib/journalHelpers.ts (eliminates duplication between incomeStatement and analytics)
- Created 3 fraud detection pure functions (FRAUD-06 split detection, FRAUD-07 approver concentration, FRAUD-08 unfamiliar vendor) with 25 unit tests
- Built 3 protectedQuery analytics endpoints using Promise.all for parallel I/O and by_status_expenseDate compound index
- 878 tests passing (+40 new), build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema index, journalHelpers extraction, and fraud detection helpers (TDD)** - `45636fd` (feat)
2. **Task 2: Analytics backend queries with integration tests (TDD)** - `c7dd0d4` (feat)

## Files Created/Modified
- `convex/schema.ts` - Added by_status_expenseDate compound index to expenses table
- `convex/lib/journalHelpers.ts` - Extracted shared aggregateJournalLines function
- `convex/reports/incomeStatement.ts` - Updated to import from shared journalHelpers
- `convex/expenses/fraudHelpers.ts` - 3 pure fraud detection functions (detectSplits, detectApproverConcentration, detectUnfamiliarVendors)
- `convex/expenses/__tests__/fraudHelpers.test.ts` - 25 unit tests for fraud detection
- `convex/expenses/analyticsQueries.ts` - 3 protectedQuery endpoints (getOpExAnalytics, getExpenseMetrics, getFraudFlags)
- `tests/convex/expenseAnalytics.test.ts` - 8 integration tests for analytics queries

## Decisions Made
- Extracted aggregateJournalLines to convex/lib/journalHelpers.ts for reuse -- keeps incomeStatement.ts and analyticsQueries.ts DRY
- Used YYYY-MM composite key (not month index) for 6-month trend bucketing -- prevents year-boundary collisions (e.g., Nov 2025 vs Nov 2026)
- Set MIN_EXPENSES_FOR_CONCENTRATION = 2 to avoid false positive flags when an employee has only 1 expense (trivially 100% one approver)
- Unfamiliar vendor comparison uses 30-day recent vs 30-90 day historical window (not all-time) for meaningful recency detection
- getWibComponents(Date.now()) used for trend calculation instead of period args -- trend always shows trailing 6 months regardless of selected period

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed journalEntries seed helper in integration tests**
- **Found during:** Task 2 (integration test RED phase)
- **Issue:** Test seedJournalLine helper used string for createdBy and missed isReversed field; journalEntries schema requires v.id("users") and v.boolean()
- **Fix:** Updated seedJournalLine to create a test user for createdBy and added isReversed: false
- **Files modified:** tests/convex/expenseAnalytics.test.ts
- **Verification:** All 8 integration tests pass
- **Committed in:** c7dd0d4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test helper schema mismatch -- trivial fix, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 backend query endpoints ready for frontend consumption in Plan 02
- Endpoints accessible at api.expenses.analyticsQueries.getOpExAnalytics, getExpenseMetrics, getFraudFlags
- ExpenseAnalytics.tsx stub page exists from Phase 48 -- ready to wire up
- 878 tests passing, build clean

## Self-Check: PASSED

All 5 created files verified on disk. Both task commits (45636fd, c7dd0d4) verified in git log.

---
*Phase: 50-expense-analytics*
*Completed: 2026-03-14*

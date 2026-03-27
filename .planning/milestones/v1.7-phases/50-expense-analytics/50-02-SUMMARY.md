---
phase: 50-expense-analytics
plan: 02
subsystem: ui
tags: [react, recharts, expense-analytics, dashboard, pie-chart, line-chart, fraud-flags, wib-timezone]

# Dependency graph
requires:
  - phase: 50-expense-analytics
    provides: 3 protectedQuery analytics endpoints (getOpExAnalytics, getExpenseMetrics, getFraudFlags)
  - phase: 48-frontend-permissions-routes
    provides: canAccessExpenseAnalytics permission flag, /expense-analytics route, stub page
provides:
  - "Full ExpenseAnalytics dashboard page with 5 card/chart components"
  - "3 hook wrappers for analytics queries (useOpExAnalytics, useExpenseMetrics, useFraudFlags)"
  - "Pure period calculation helpers with WIB alignment (expenseAnalyticsPeriod.ts)"
  - "20 unit tests for period math"
affects: [expense-analytics-dashboard, expense-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns: [period-picker-month-custom, pure-period-helpers, recharts-pie-line-charts]

key-files:
  created:
    - src/hooks/convex/useExpenseAnalytics.ts
    - src/components/expenseAnalytics/OpExSummaryCard.tsx
    - src/components/expenseAnalytics/SpendByEmployeeCard.tsx
    - src/components/expenseAnalytics/MonthlyTrendChart.tsx
    - src/components/expenseAnalytics/PendingMetricsCard.tsx
    - src/components/expenseAnalytics/FraudFlagsCard.tsx
    - src/lib/expenseAnalyticsPeriod.ts
    - src/lib/__tests__/expenseAnalyticsPeriod.test.ts
  modified:
    - src/hooks/convex/index.ts
    - src/pages/ExpenseAnalytics.tsx
    - convex/expenses/analyticsQueries.ts

key-decisions:
  - "Extract period math to pure functions in expenseAnalyticsPeriod.ts for unit testability (not inline in page)"
  - "Month and custom mode only (no weekly) -- expense analytics is monthly granularity"
  - "PieChart for GL categories (donut variant with innerRadius) matching dashboard aesthetic"
  - "FraudFlagsCard renders all 3 fraud types in one card with color-coded sections"
  - "Period picker follows FinancialStatement pattern (Badge toggle + month nav arrows)"

patterns-established:
  - "Pure period helpers pattern: getCurrentWibMonth/computePeriodRange/prevMonth/nextMonth exported for testability"
  - "Expense analytics card components: data prop (undefined = loading), each handles own skeleton/empty state"

requirements-completed: [XANL-01, XANL-02, XANL-03, XANL-04, XANL-05, XANL-06, FRAUD-06, FRAUD-07, FRAUD-08]

# Metrics
duration: 9min
completed: 2026-03-14
---

# Phase 50 Plan 02: Expense Analytics Frontend Summary

**Full expense analytics dashboard with OpEx pie chart, 6-month trend line, employee spend breakdown, reimbursement metrics, and fraud flags**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-14T15:15:28Z
- **Completed:** 2026-03-14T15:24:51Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Built 3 hook wrappers connecting to Plan 01's analytics protectedQuery endpoints via useSessionQuery
- Created 5 dashboard card/chart components (OpExSummary PieChart, SpendByEmployee bar indicators, MonthlyTrend LineChart, PendingMetrics, FraudFlags)
- Replaced Phase 48 stub page with full responsive grid dashboard
- Period picker with month/custom mode toggle, WIB-aligned date math, future-month prevention
- 20 unit tests for period calculation pure functions (WIB alignment, year boundaries, roundtrip)
- 898 tests passing (+20 new), build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Hooks and sub-components** - `589f8da` (feat)
2. **Task 2: ExpenseAnalytics dashboard page and period calculation tests** - `6bede3f` (feat)

## Files Created/Modified
- `src/hooks/convex/useExpenseAnalytics.ts` - 3 hook wrappers (useOpExAnalytics, useExpenseMetrics, useFraudFlags)
- `src/hooks/convex/index.ts` - Barrel export for analytics hooks + types
- `src/components/expenseAnalytics/OpExSummaryCard.tsx` - Total OpEx card with Recharts PieChart for GL categories
- `src/components/expenseAnalytics/SpendByEmployeeCard.tsx` - Employee spend breakdown with bar indicators + percentages
- `src/components/expenseAnalytics/MonthlyTrendChart.tsx` - 6-month OpEx LineChart with abbreviated Y-axis
- `src/components/expenseAnalytics/PendingMetricsCard.tsx` - Pending reimbursement total + avg approval time
- `src/components/expenseAnalytics/FraudFlagsCard.tsx` - Split/concentration/vendor fraud alerts with badges
- `src/pages/ExpenseAnalytics.tsx` - Full dashboard page replacing stub, responsive grid layout
- `src/lib/expenseAnalyticsPeriod.ts` - Pure period calculation helpers (WIB-aligned)
- `src/lib/__tests__/expenseAnalyticsPeriod.test.ts` - 20 unit tests for period math
- `convex/expenses/analyticsQueries.ts` - Fixed Id<"users"> type cast (bug fix from Plan 01)

## Decisions Made
- Extract period math to pure functions in `expenseAnalyticsPeriod.ts` for unit testability -- same pattern as incomeStatement but without weekly mode
- Month and custom mode only (no weekly) since expense analytics is monthly granularity
- PieChart uses donut variant (innerRadius=40) for clean aesthetic with legend below
- FraudFlagsCard renders all 3 fraud types in one card with color-coded sections (amber for splits, orange for concentration, purple for vendors)
- Period picker follows FinancialStatement pattern (Badge toggle + month nav arrows + Today reset)
- Each sub-component handles its own loading skeleton and empty state independently

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Id<"users"> type cast in analyticsQueries.ts**
- **Found during:** Task 1 (build verification)
- **Issue:** `ctx.db.get(id as any)` in getFraudFlags lost type safety, causing `user.name` to error with "Property 'name' does not exist on type" union
- **Fix:** Changed `id as any` to `id as Id<"users">` and added `import type { Id } from "../_generated/dataModel"`
- **Files modified:** convex/expenses/analyticsQueries.ts
- **Verification:** `npx convex codegen` passes, `npm run build` passes
- **Committed in:** 589f8da (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type cast bug from Plan 01 -- trivial fix, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 50 complete -- all 2 plans delivered
- Expense Analytics dashboard fully functional with backend queries and frontend visualization
- 898 tests passing, build clean
- Ready for Phase 51 (Bulk Upload of Previously Reimbursed Expenses)

## Self-Check: PASSED

All 10 created files verified on disk. Both task commits (589f8da, 6bede3f) verified in git log.

---
*Phase: 50-expense-analytics*
*Completed: 2026-03-14*

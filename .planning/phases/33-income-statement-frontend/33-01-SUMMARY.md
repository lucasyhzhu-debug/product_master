---
phase: 33-income-statement-frontend
plan: 33-01
subsystem: ui
tags: [react, income-statement, p&l, week-navigation, convex-query, platformColors]

requires:
  - phase: 32-income-statement-backend
    provides: getWeeklyIncomeStatement query with WeekData, ChannelData, GapAnalysis, deltas

provides:
  - useFinancials hook with week navigation state and query integration
  - FinancialStatement page with P&L table, channel drill-down, collapsible sections
  - /financials route with canAccessDashboard permission guard
  - Navigation entry in Header for Manager and Admin roles

affects: [33-02-PLAN, 33-03-PLAN]

tech-stack:
  added: []
  patterns:
    - "Period-agnostic P&L table column headers derived from query response data"
    - "WIB Monday-start week computation on frontend synced with backend periodRange.ts"
    - "CSS-first mobile responsive with JS toggle override for comparison columns"
    - "Accounting convention: parentheses for negative amounts in deduction/COGS rows"

key-files:
  created:
    - src/hooks/convex/useFinancials.ts
    - src/pages/FinancialStatement.tsx
  modified:
    - src/hooks/convex/index.ts
    - src/App.tsx
    - src/components/layout/Header.tsx

key-decisions:
  - "Revenue section expanded by default, Deductions and COGS collapsed -- reduces cognitive load on page load"
  - "Period-agnostic column headers (date ranges from query) instead of hardcoded 'This Week' / 'Prev Week'"
  - "Channel rows expandable to show gross margin % and COGS breakdown inline"
  - "Mobile: CSS-first hidden comparison columns with JS toggle, avoiding hydration mismatches"
  - "Gross margin delta displayed as percentage points (pp) not relative percent"

patterns-established:
  - "PLRow component: reusable P&L line item with indent levels, negative formatting, delta, channel dot"
  - "formatNegative: accounting parentheses wrapper for deduction amounts"

requirements-completed: [IS-07, IS-08]

duration: 4min
completed: 2026-03-02
---

# Phase 33 Plan 01: Income Statement Page, Hook & Route Summary

**Weekly P&L page at /financials with per-channel revenue breakdown, collapsible sections, week navigation, and mobile-responsive comparison toggle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T08:06:27Z
- **Completed:** 2026-03-02T08:10:18Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- useFinancials hook with WIB Monday-start week navigation (prev/next/current) and future-week prevention
- P&L table rendering Revenue, Deductions, COGS, Gross Profit with collapsible sections
- Per-channel breakdown with colored dots from platformColors.ts and percentage of total gross revenue
- Mobile-responsive comparison columns with CSS-first hiding and JS toggle override

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useFinancials hook with week navigation state** - `b21e08a` (feat)
2. **Task 2: Create FinancialStatement page with P&L table and week navigation** - `d709eef` (feat)
3. **Task 3: Add route, lazy import, and navigation entry** - `0e282b4` (feat)

## Files Created/Modified
- `src/hooks/convex/useFinancials.ts` - Hook wrapping getWeeklyIncomeStatement with week navigation state
- `src/hooks/convex/index.ts` - Barrel export for useFinancials
- `src/pages/FinancialStatement.tsx` - Income Statement page with P&L table, channel drill-down, loading/error states
- `src/App.tsx` - Lazy import and /financials route with canAccessDashboard permission
- `src/components/layout/Header.tsx` - "Financials" nav entry with FileText icon between Sales and Orders

## Decisions Made
- Revenue section expanded by default; Deductions and COGS collapsed to reduce initial density
- Column headers derived from query response (period-agnostic) per CONTEXT.md locked decision
- Channel rows expandable to show gross margin % and per-channel COGS inline
- Mobile: CSS-first `hidden md:table-cell` with `showComparison` JS toggle override
- Gross margin delta shown as percentage points (pp) for clarity
- Combined "Ad Spend & Promos" into single deduction row (adBurn + promoBurn) for cleaner display

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Page structure and hook ready for Plan 33-02 (confidence indicators and data quality panel)
- PLRow component accepts `confidence` prop (not yet rendered -- Plan 33-02 adds visual indicators)
- PageHeader action slot reserved for Export CSV button (Plan 33-03)

## Self-Check: PASSED

All 6 files verified present. All 3 task commits found in git log.

---
*Phase: 33-income-statement-frontend*
*Completed: 2026-03-02*

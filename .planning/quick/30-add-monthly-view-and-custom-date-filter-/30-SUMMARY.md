---
phase: quick-30
plan: 01
subsystem: financials
tags: [income-statement, period-modes, monthly-view, custom-date-range]
dependency_graph:
  requires: [convex/reports/incomeStatement.ts, convex/lib/periodRange.ts]
  provides: [getIncomeStatement query, period mode UI]
  affects: [FinancialStatement page, CSV export]
tech_stack:
  added: []
  patterns: [skip-based query switching, shared fetchAndAggregate helper]
key_files:
  created: []
  modified:
    - convex/reports/incomeStatement.ts
    - convex/lib/periodRange.ts
    - src/hooks/convex/useFinancials.ts
    - src/pages/FinancialStatement.tsx
    - src/lib/financialHelpers.tsx
    - src/lib/csvExport.ts
    - docs/CHANGELOG.md
decisions:
  - "Keep getWeeklyIncomeStatement for backward compat; new getIncomeStatement for month/custom"
  - "Extract fetchAndAggregate shared helper to eliminate 80-line duplication"
  - "Use skip-based query switching (only one query fires per mode) for efficiency"
  - "Native date inputs for custom mode instead of a datepicker library"
metrics:
  duration: "~10 min"
  completed: "2026-03-05"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 30: Add Monthly View & Custom Date Filter Summary

Generalized income statement query and added period mode selector (Week/Month/Custom) to the Income Statement page, with proper WIB timezone handling and equal-length prior period comparison.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Generalized getIncomeStatement backend query | 926ef28 | convex/reports/incomeStatement.ts, convex/lib/periodRange.ts |
| 2 | Period mode selector + frontend hook | e107f19 | src/hooks/convex/useFinancials.ts, src/pages/FinancialStatement.tsx, src/lib/financialHelpers.tsx, src/lib/csvExport.ts |

## What Was Built

### Backend (Task 1)
- **New `getIncomeStatement` query** accepting arbitrary `periodStart`/`periodEnd` epoch ms. Computes equal-length comparison window automatically (`previousStart = periodStart - duration`).
- **Extracted `fetchAndAggregate` helper** that both `getWeeklyIncomeStatement` and `getIncomeStatement` call, eliminating ~80 lines of duplicated I/O + COGS map + aggregation code.
- **New `calculateMonthRange(year, month)`** returns WIB-aligned month boundaries with previous month comparison.
- **New `calculateCustomRange(periodStart, periodEnd)`** returns equal-length prior window.
- **Exported `wibMidnightToUtc` and `getWibComponents`** for frontend reuse.

### Frontend (Task 2)
- **Period mode selector** using shadcn Select dropdown with three options: Weekly, Monthly, Custom Range.
- **Month mode**: ChevronLeft/Right navigation by month, "This Month" reset button, label format "March 2026".
- **Custom mode**: Two native `<input type="date">` fields styled to match app aesthetic, with "(vs prior equal period)" explainer text.
- **Week mode**: Completely preserved existing behavior (same query, same navigation).
- **Skip-based query switching**: Only one Convex query fires at a time (`useQuery(..., "skip")` pattern).
- **Unified data shape**: Hook returns `{ periodStart, periodEnd, current, previous, deltas }` regardless of which query ran.
- **Column headers**: Dynamically formatted per mode using `formatWeekRange` (week) or `formatPeriodRange` (month/custom).
- **CSV export**: Works for all modes, filename includes mode (`frollie-income-statement-month-2026-03-01.csv`), column renamed `prev_period_idr`.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `npm run type-check` passes with zero errors
- `npm run build` succeeds (18.41s)
- Week mode behavior identical to pre-change
- Month mode computes correct WIB month boundaries
- Custom mode accepts arbitrary dates with equal-length prior comparison

## Unmapped Product Fix

> **"Dubai Chewy Cookie - Regular Pack Of 3"** is a data mapping issue, not a code bug. The product exists in `externalRevenueItems` (from GoFood/GoBiz sync) but has no `linkedMenuProductId` because no mapping exists in `externalProductMappings` for that product name + source.
>
> **To fix:** Navigate to `/sales?tab=mappings`, select the GoFood or GoBiz tab, find "Dubai Chewy Cookie - Regular Pack Of 3" in the unmapped list, and map it to the correct menu product. The `updateProductMapping` mutation will retroactively patch all matching `externalRevenueItems`.

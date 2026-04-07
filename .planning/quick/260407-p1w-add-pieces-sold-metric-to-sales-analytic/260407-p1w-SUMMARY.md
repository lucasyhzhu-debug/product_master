---
phase: 260407-p1w
plan: 01
subsystem: sales-analytics
tags: [hero-card, bom, pieces-sold, period-query]
dependency_graph:
  requires: [externalRevenueItems, menuProductComponents, componentTypes]
  provides: [computePiecesSold, totalPiecesSold-period-metric]
  affects: [getDashboardSummaryByPeriodInternal, HeroCards, PeriodData, PeriodSummary]
tech_stack:
  added: []
  patterns: [bom-resolved-ball-counting, period-gross-estimation]
key_files:
  created:
    - convex/externalData/__tests__/lifetimeHelpers.test.ts
  modified:
    - convex/externalData/helpers/lifetimeHelpers.ts
    - convex/externalData/queries.ts
    - src/components/salesAnalytics/overviewUtils.ts
    - src/hooks/convex/useExternalData.ts
    - src/components/salesAnalytics/HeroCards.tsx
decisions:
  - Kept computeLifetimeTotals with original BOM resolution (no delegation) to preserve avgRevenuePerBall semantics
  - Used periodGrossFromRecords (sum of revenueGross) instead of aggregated totalGross for BOM estimation consistency
metrics:
  duration: 621s
  completed: 2026-04-07
  tasks: 2/2
  files: 6
---

# Quick Task 260407-p1w: Add Pieces Sold Metric to Sales Analytics Summary

BOM-resolved "Pieces Sold" hero card in Sales Analytics showing period-filtered ball count with growth comparison, using computePiecesSold helper with dynamic avgRevenuePerBall from linked items and FALLBACK_REVENUE_PER_BALL (35K IDR) for cold start.

## Task Completion

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Backend helper + query + tests (TDD) | bbd6b407, a19fe574 | lifetimeHelpers.ts, queries.ts, lifetimeHelpers.test.ts |
| 2 | Frontend types + Pieces Sold card | 4af960e7 | overviewUtils.ts, useExternalData.ts, HeroCards.tsx |

## What Was Built

**Backend:**
- `computePiecesSold(items, periodGrossRevenue, bomComponents, componentTypes)` in `lifetimeHelpers.ts` -- reusable pure function for BOM-resolved ball counting per period
- `fetchPeriodItems(ctx, revenueRecords)` in `queries.ts` -- parallel fan-out fetcher for revenue items
- `getDashboardSummaryByPeriodInternal` now returns `totalPiecesSold` in both `currentPeriod` and `previousPeriod`
- 4 unit tests: linked items, zero items, all unlinked (fallback), mixed (dynamic avg)

**Frontend:**
- `totalPiecesSold?: number` added to `PeriodSummary` and `PeriodData` types
- "Pieces Sold" hero card rendered after Delivery Fees, before lifetime section
- Uses `CircleDot` icon (matching lifetime Balls Sold), `GrowthIndicator` for period-over-period comparison

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reverted computeLifetimeTotals refactor**
- **Found during:** Task 1 (REFACTOR phase)
- **Issue:** Refactoring computeLifetimeTotals to delegate to computePiecesSold changed avgRevenuePerBall semantics. Original: `knownRevenue / knownBalls`. Refactored: `lifetimeRevenue / totalBalls`. These differ when unlinked items exist, breaking 3 existing tests.
- **Fix:** Reverted computeLifetimeTotals to original implementation. computePiecesSold remains standalone.
- **Files modified:** convex/externalData/helpers/lifetimeHelpers.ts
- **Commit:** a19fe574

## Verification

- [x] `npm run test -- --run convex/externalData/__tests__/lifetimeHelpers.test.ts` -- 4/4 pass
- [x] `npm run test -- --run tests/convex/lifetimeBallCount.test.ts` -- 16/16 pass (no regression)
- [x] `npm run type-check` -- no errors
- [x] `npm run build` -- passes

## Self-Check: PASSED

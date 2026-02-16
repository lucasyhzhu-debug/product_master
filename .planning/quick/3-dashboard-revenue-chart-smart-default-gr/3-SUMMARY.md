---
phase: quick-3
plan: 01
subsystem: sales-analytics
tags: [dashboard, revenue-chart, granularity, hourly]
dependency-graph:
  requires: [externalRevenue table, recharts]
  provides: [hourly granularity for revenue time-series]
  affects: [Dashboard sales chart]
tech-stack:
  added: []
  patterns: [WIB hour bucketing, 12-hour label formatting]
key-files:
  created: []
  modified:
    - convex/externalData/queries.ts
    - src/components/salesAnalytics/SalesChart.tsx
    - src/hooks/convex/useExternalData.ts
decisions:
  - "allTime switched from monthly to weekly granularity for better detail"
  - "Hourly labels use 12-hour format (10am, 2pm) for readability"
metrics:
  duration: "2 min"
  completed: "2026-02-16"
---

# Quick Task 3: Dashboard Revenue Chart Smart Default Granularity Summary

Hourly granularity added end-to-end to revenue time-series chart with smart per-preset defaults; allTime switched from monthly to weekly.

## What Was Done

### Task 1: Add hourly granularity to backend query
**Commit:** `79e7fd3`

- Added `utcToWibHourStr` helper that produces "YYYY-MM-DD HH" bucket keys using WIB timezone offset
- Added `v.literal("hourly")` to the `getRevenueTimeSeries` granularity validator union
- Added hourly case to `bucketKey()` function
- Added hourly case to `formatLabel()` with 12-hour time format (e.g., "10am", "2pm", "12pm")

**Files modified:** `convex/externalData/queries.ts`

### Task 2: Update frontend type, hook, defaults, and selector
**Commit:** `eca447b`

- Updated `Granularity` type to include `"hourly"` in SalesChart.tsx
- Updated hook parameter type in useExternalData.ts
- Updated `defaultGranularity()` mapping:
  - `past24hours` / `today` / `yesterday` -> `"hourly"` (was `"daily"`)
  - `thisWeek` / `last7days` -> `"daily"` (unchanged)
  - `last30days` / `thisMonth` -> `"weekly"` (unchanged)
  - `allTime` -> `"weekly"` (was `"monthly"`)
- Added "Hourly" option to granularity selector badge row (first in list)

**Files modified:** `src/components/salesAnalytics/SalesChart.tsx`, `src/hooks/convex/useExternalData.ts`

## Deviations from Plan

None -- plan executed exactly as written.

## Pre-existing Issues Noted

- `src/components/orders/OrderSlideOver.tsx:141` has a pre-existing type error: `"Packaging"` not assignable to `OrderStatus`. Not related to this task, not fixed.

## Verification

- `npm run type-check`: passes (no errors in modified files; pre-existing error in OrderSlideOver.tsx is unrelated)
- `npm run build`: pre-existing type error blocks full build but is not caused by this task's changes
- Manual verification: selecting "Today" preset should show hourly bars instead of a single daily bar

## Self-Check: PASSED

All 3 modified files exist. Both commit hashes (79e7fd3, eca447b) verified in git log.

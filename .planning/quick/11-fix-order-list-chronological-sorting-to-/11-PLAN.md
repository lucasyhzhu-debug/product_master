---
phase: quick-11
title: Fix Sales Analytics revenue table chronological sorting
description: Sort the revenue table by transactionDate (fallback periodStart) descending so records display in proper chronological order
---

# Quick Task 11: Fix Revenue Table Chronological Sort

## Problem

The Sales Analytics "Sales Details" table (`RevenueTable` in `OverviewTab.tsx`) displays records in the order returned by the Convex backend. The backend uses `by_period` / `by_source_period` index which sorts by `periodStart` (date-level granularity). Records within the same date have a separate `transactionDate` field with exact timestamps, but this isn't used for sorting.

This causes records with the same date to appear in arbitrary order (insertion order) rather than chronological order.

## Root Cause

- Backend query (`convex/externalData/queries.ts:114-154`) sorts by `periodStart` desc via index — correct at the date level
- Frontend `RevenueTable` component (`OverviewTab.tsx:709-885`) never re-sorts `filtered` records
- The time displayed in the Time column uses `transactionDate ?? periodStart`, but records aren't sorted by this value

## Fix

Add a `.sort()` call on the `filtered` array in `RevenueTable` using `(transactionDate ?? periodStart)` descending, which is the same field used for the Time column display.

## Tasks

### Task 1: Add chronological sort to RevenueTable filtered results

**Files:** `src/components/salesAnalytics/OverviewTab.tsx`

**Action:** After the `filtered` array is computed (line ~728), sort it by `transactionDate ?? periodStart` descending:

```typescript
const sorted = filtered.sort((a, b) => {
  const tsA = a.transactionDate ?? a.periodStart;
  const tsB = b.transactionDate ?? b.periodStart;
  return tsB - tsA; // descending (newest first)
});
```

Then use `sorted` instead of `filtered` in the render logic (lines 864-880).

**Verify:** Build passes (`npm run type-check`)

**Done:** Records in the Sales Details table are sorted newest-first using both date AND time.

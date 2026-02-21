# Quick Task 11: Fix Revenue Table Chronological Sort

## What Changed

Added client-side sorting to the Sales Analytics "Sales Details" revenue table so records display in proper chronological order (newest first) using both date AND time.

## Files Modified

- `src/components/salesAnalytics/OverviewTab.tsx` — Added `.sort()` to `filtered` array using `transactionDate ?? periodStart` descending

## Root Cause

The Convex backend query sorted by the `periodStart` index field (date-level granularity only). Records within the same date had a `transactionDate` field with exact timestamps, but the frontend never sorted by it — records appeared in insertion order within each date.

## Commit

- `256392d` — fix(sales): sort revenue table by transactionDate descending for correct chronological order

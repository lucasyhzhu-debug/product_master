---
phase: 80
fixed_at: 2026-04-15T00:00:00Z
review_path: .planning/phases/80-unit-economics-analytics-dashboard/80-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 80: Code Review Fix Report

**Fixed at:** 2026-04-15
**Source review:** `.planning/phases/80-unit-economics-analytics-dashboard/80-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (WR-01 through WR-06)
- Fixed: 6
- Skipped: 0
- `npm run type-check` passes after all fixes.
- `npx tsc -b` (project-references build) also passes — as a side effect, WR-04 resolved a pre-existing `@convex/*` alias that was breaking the referenced build.

## Fixed Issues

### WR-01: Custom date range filter uses UTC midnight instead of Jakarta midnight

**Files modified:** `src/components/analytics/AnalyticsFilterBar.tsx`
**Commit:** 61b6a236
**Applied fix:** `fromDateInput` now parses the date picker value as `value + "T00:00:00+07:00"` instead of `"T00:00:00Z"`, so the window aligns with backend WIB bucket keys. Matches the pattern in `convex/dispatchPlanner/queries.ts`.

### WR-02: Rolling-trend average skips zero-revenue days, producing inflated means

**Files modified:** `convex/reports/unitEconomics.ts`
**Commit:** 4f5bc1e4
**Applied fix:** `rollingTrend` now builds a contiguous list of WIB calendar days spanning `[fromTs, toTs)` via `bucketKey(ts, "day")` stepped by 86400000 ms, deduplicates, sorts, and uses `daily.get(d) ?? 0` to fill gaps. The rolling window now averages over N calendar days, treating zero-revenue days as 0 rather than skipping them.
**Note:** Fix is logic-bearing but straightforward — calendar iteration is standard. Requires a production sanity check to confirm the chart renders continuous x-axis (previously discontinuous on gap days).

### WR-03: `setFilters` suffers stale-closure on rapid sequential calls

**Files modified:** `src/contexts/AnalyticsFilterContext.tsx`
**Commit:** 24d37fbb
**Applied fix:** Rewrote `setFilters` to use the functional-update overload of react-router's `setParams(prev => URLSearchParams)`. Inside the updater, prior values are parsed from `prev` rather than the render-time `filters` snapshot. Default-from fallback (now - 30d) mirrors the `useMemo` loader to preserve existing behavior on empty params.

### WR-04: `DisplayChannel` type duplicated between backend and frontend

**Files modified:** `src/contexts/AnalyticsFilterContext.tsx`
**Commit:** 8eb426f9
**Applied fix:** Removed the duplicate `DisplayChannel` union and `DISPLAY_CHANNELS` array from the frontend context; re-exports them from `convex/reports/channelTaxonomy.ts` via relative path `../../convex/reports/channelTaxonomy`. Also replaced the unconfigured `@convex/_generated/dataModel` import with a relative path (matching `AuthContext.tsx` and `BankReconciliationPage.tsx`). No `@convex/*` alias was configured in `tsconfig.app.json` or `vite.config.ts`, so the previous import was only surviving because `tsc --noEmit` uses the root `tsconfig.json` (which includes no files). The fix also resolves a latent `tsc -b` build error.

### WR-05: SKU Pareto / SKU×Channel matrix group by `productName`, not `menuProductId`

**Files modified:** `convex/reports/unitEconomics.ts`
**Commit:** 0e1af892
**Applied fix:** Both `skuPareto` and `skuChannelMatrix` now key aggregation maps by `(it.menuProductId as string) ?? "manual:${it.productName}"`. Display name is preserved via a sibling `productNames` map for the UI label, but identity is the menuProductId. Manual items (no `menuProductId`) still appear under a synthetic `manual:<name>` key so they never merge with BOM-linked products of the same display name.

### WR-06: Legacy-order fallback in `loadFilteredData` documentation

**Files modified:** `convex/reports/unitEconomics.ts`
**Commit:** 296ea888
**Applied fix:** Documentation-only change per the review guidance. Added block comments making the intentional asymmetry explicit: the primary branch covers `completedAt in window`, the legacy fallback includes only orders with `completedAt === undefined`. Orders whose `completedAt` falls outside the window are intentionally dropped from the fallback to avoid double-bucketing. Comment explicitly warns against relaxing this guard.

---

_Fixed: 2026-04-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

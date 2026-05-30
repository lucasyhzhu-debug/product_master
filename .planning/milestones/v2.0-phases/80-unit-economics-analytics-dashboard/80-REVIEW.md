---
phase: 80-unit-economics-analytics-dashboard
reviewed: 2026-04-15T00:00:00Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - convex/reports/unitEconomics.ts
  - convex/reports/productionUnitHelpers.ts
  - convex/reports/revenueHelpers.ts
  - convex/reports/channelTaxonomy.ts
  - convex/schema.ts
  - convex/dispatchPlanner/queries.ts
  - src/lib/platformColors.ts
  - src/contexts/AnalyticsFilterContext.tsx
  - src/components/analytics/AnalyticsFilterBar.tsx
  - src/components/analytics/KpiRow.tsx
  - src/components/analytics/WeekdayDualAxisChart.tsx
  - src/components/analytics/DayHourHeatmap.tsx
  - src/components/analytics/RevPerUnitChart.tsx
  - src/components/analytics/TakeRateTable.tsx
  - src/components/analytics/UnitsByTypeStackedBars.tsx
  - src/components/analytics/UnitsPerTxnByChannel.tsx
  - src/components/analytics/AovByChannel.tsx
  - src/components/analytics/TypeMixOverTime.tsx
  - src/components/analytics/SkuParetoChart.tsx
  - src/components/analytics/SkuChannelHeatmap.tsx
  - src/components/analytics/ChannelSparklineTable.tsx
  - src/components/analytics/RollingTrendChart.tsx
  - src/components/analytics/index.ts
  - src/pages/AnalyticsDashboard.tsx
  - src/hooks/convex/useAnalytics.ts
  - src/App.tsx
  - src/components/layout/Header.tsx
  - src/components/layout/MobileBottomNav.tsx
  - tests/convex/unitEconomics.test.ts
  - tests/frontend/analytics/KpiRow.test.tsx
  - tests/frontend/analytics/AnalyticsFilterBar.test.tsx
  - tests/frontend/analytics/WeekdayDualAxisChart.test.tsx
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 80: Code Review Report

**Reviewed:** 2026-04-15
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

Phase 80 introduces a unit-economics analytics dashboard (backend `convex/reports/unitEconomics.ts` + 13 React chart components, filter context, and tests). Architecture is clean: shared filter loader, index-bounded queries (`by_completed_at` + legacy `by_order_date` fallback), dynamic BOM resolution for units-sold counting, and reusable helpers for revenue/channel taxonomy. No critical security or correctness defects were found. The main issues are:

1. A date-filter timezone bug that shifts the user's intended window by 7 hours (WIB vs UTC).
2. A rolling-trend averaging bug that averages over N *data-point* days instead of N *calendar* days (zero-revenue days are dropped).
3. A stale-closure issue in `AnalyticsFilterContext.setFilters` that can drop rapid sequential updates.
4. Duplicate `DisplayChannel` enum and duplicate `TYPE_COLORS` maps — drift risk.
5. SKU Pareto/heatmap grouping by `productName` string instead of `menuProductId`, which can merge two products that share a name.

All warnings have concrete fix suggestions below. The Hazelnut dynamic-BOM regression guard test (the most important correctness property) is well-covered.

## Warnings

### WR-01: Custom date range filter uses UTC midnight instead of Jakarta midnight

**File:** `src/components/analytics/AnalyticsFilterBar.tsx:21-25`
**Issue:** `fromDateInput` parses the date picker value as `value + "T00:00:00Z"` (UTC midnight). Backend windows and bucket keys are WIB (UTC+7). A user selecting `2026-01-05` gets `2026-01-05 00:00 UTC = 2026-01-05 07:00 WIB`, silently shifting the window 7 hours later than expected. Off-by-one-day is possible at window edges.
**Fix:**
```ts
function fromDateInput(value: string, endOfDay = false): number {
  if (!value) return Date.now();
  // WIB midnight = UTC previous-day 17:00
  const base = new Date(value + "T00:00:00+07:00").getTime();
  return endOfDay ? base + 86400000 - 1 : base;
}
```
(Matches the pattern used in `convex/dispatchPlanner/queries.ts:221` which correctly uses `+07:00`.)

### WR-02: Rolling-trend average skips zero-revenue days, producing inflated means

**File:** `convex/reports/unitEconomics.ts:585-614` (`rollingTrend`)
**Issue:** `daily` is a `Map<dateKey, revenue>` keyed only by dates that have orders. `sortedDates` therefore excludes zero-revenue days. `rolling(7)` then averages over the last 7 *data points*, not the last 7 calendar days. If business closed Mon-Thu and only sold Fri-Sun, `rolling7` still shows the mean of those three non-zero days, labelled as a 7-day average. This overstates the trend during slow periods and makes the chart discontinuous on the x-axis.
**Fix:** Generate a contiguous day range from `fromTs..toTs` and fill missing days with 0 before computing the rolling window:
```ts
// Build full date list (WIB-local) spanning [fromTs, toTs]
const allDates: string[] = [];
for (let ts = args.fromTs; ts < args.toTs; ts += 86400000) {
  allDates.push(bucketKey(ts, "day"));
}
// De-dupe + sort (handles DST/edge ts collisions)
const uniqSortedDates = Array.from(new Set(allDates)).sort();
const dailyValues = uniqSortedDates.map((d) => daily.get(d) ?? 0);
```
Then return `dates: uniqSortedDates` and roll over `dailyValues`.

### WR-03: `setFilters` suffers stale-closure on rapid sequential calls

**File:** `src/contexts/AnalyticsFilterContext.tsx:55-65`
**Issue:** `setFilters` captures `filters` (derived from `params`) at render time. Calling it twice before the next render (e.g., `setFilters({fromTs:x}); setFilters({toTs:y});`) spreads a stale `filters` in both calls — the second overwrites the first's update because both merge against the same pre-update snapshot. `useSearchParams`' `setParams` is not batched with React state either. Unlikely to be triggered by current UI (each button sets both fields) but trivially reproducible and a footgun for future callers.
**Fix:** Use the functional-update pattern against `URLSearchParams`:
```ts
const setFilters = (next: Partial<AnalyticsFilters>) => {
  setParams(
    (prev) => {
      const p = new URLSearchParams(prev);
      const getNum = (k: string, fallback: number) =>
        Number(p.get(k)) || fallback;
      const merged = {
        fromTs: next.fromTs ?? getNum("from", filters.fromTs),
        toTs: next.toTs ?? getNum("to", filters.toTs),
        channels: next.channels ?? filters.channels,
        menuProductIds: next.menuProductIds ?? filters.menuProductIds,
      };
      p.set("from", String(merged.fromTs));
      p.set("to", String(merged.toTs));
      if (merged.channels.length) p.set("channels", merged.channels.join(","));
      else p.delete("channels");
      if (merged.menuProductIds.length)
        p.set("products", merged.menuProductIds.join(","));
      else p.delete("products");
      return p;
    },
    { replace: true },
  );
};
```

### WR-04: `DisplayChannel` type is duplicated between backend and frontend (drift risk)

**File:** `src/contexts/AnalyticsFilterContext.tsx:5-24` and `convex/reports/channelTaxonomy.ts:5-24`
**Issue:** Two independent copies of the `DisplayChannel` union + `DISPLAY_CHANNELS` array. If channel taxonomy changes in one file but not the other, the filter UI silently omits new channels or passes invalid strings to the backend (where they'd hit the `channelSet` filter and filter out nothing for that channel). Repeats the "single source of truth" pattern already established for `sourceToPlatform`.
**Fix:** Export from a shared file importable by both sides (e.g., keep `convex/reports/channelTaxonomy.ts` as authority and re-export in the frontend):
```ts
// src/contexts/AnalyticsFilterContext.tsx
import {
  DISPLAY_CHANNELS,
  type DisplayChannel,
} from "@convex/reports/channelTaxonomy";
export { DISPLAY_CHANNELS, type DisplayChannel };
```
(Confirm tsconfig `@convex/*` alias resolves client-side. If not, move the literal list to `src/lib/` and import from Convex instead — whichever direction the repo already uses.)

### WR-05: SKU Pareto / SKU×Channel matrix group by `productName`, not `menuProductId`

**File:** `convex/reports/unitEconomics.ts:408-446` (`skuPareto`) and `448-492` (`skuChannelMatrix`)
**Issue:** Both queries key the aggregation map by `it.productName` (denormalized string on `orderItems`). Two different `menuProducts` that share a display name — or historic typo variants of the same product ("Original" vs "Original ") — collapse into a single row or diverge into multiple rows. It also silently ignores the `menuProductIds` filter's intent (filter is applied earlier, but the display still shows the human string with no canonical identity). The correct grouping key is `menuProductId`, falling back to `productName` only for manual items where `menuProductId` is undefined.
**Fix:**
```ts
const byProduct = new Map<string, { key: string; name: string; revenue: number }>();
for (const it of items) {
  const o = orderById.get(it.orderId as string);
  if (!o) continue;
  const key = (it.menuProductId as string | undefined) ?? `manual:${it.productName}`;
  const prev = byProduct.get(key);
  if (prev) prev.revenue += itemNetRevenue(it);
  else byProduct.set(key, { key, name: it.productName, revenue: itemNetRevenue(it) });
}
```
Return `name` for display but use `key` for identity. Apply same pattern to `skuChannelMatrix`.

### WR-06: Legacy-order fallback in `loadFilteredData` can double-count if `completedAt` is set after write

**File:** `convex/reports/unitEconomics.ts:59-81`
**Issue:** The fallback branch guards with `if (o.completedAt !== undefined) continue` — good. But the primary branch collects *all* orders with `completedAt` in the window and also adds them to `seen`. If a historic order has `completedAt` set but outside the window (or undefined, then written later mid-query), it could drop out of the primary scan *and* the fallback filter (`o.completedAt !== undefined`), causing it to be missed. More importantly, the fallback filter condition `o.completedAt !== undefined` causes orders that have a completedAt timestamp *outside* the current window to be silently excluded, even if their `orderDate` falls inside it. This is intentional per the "primary wins" policy but worth documenting — current code comment says "legacy fallback" which obscures the asymmetry.
**Fix:** Either (a) add a unit test that proves an order with `completedAt` outside window and `orderDate` inside window is correctly ignored (this is the intended behavior) and a matching code comment, or (b) if the intent is "use orderDate when completedAt is missing" regardless of completedAt's window membership, guard on `o.completedAt === undefined` only:
```ts
// Current intent appears correct — just make it explicit:
// Legacy fallback: ONLY include orders with NO completedAt (null-safe).
// Orders that have completedAt outside the window are intentionally dropped
// (their "true" event date is completedAt, which places them in a different period).
```
No code change needed if intent matches behavior; add a comment + a regression test.

## Info

### IN-01: `TYPE_COLORS` + `TYPE_COLOR_FALLBACK` duplicated across two chart files

**File:** `src/components/analytics/UnitsByTypeStackedBars.tsx:14-24` and `src/components/analytics/TypeMixOverTime.tsx:16-26`
**Issue:** Identical palette and `colorFor` helper in two files.
**Fix:** Extract to `src/lib/productionTypeColors.ts` (or add to `src/lib/platformColors.ts`):
```ts
export const PRODUCTION_TYPE_COLORS: Record<string, string> = { ... };
export function colorForProductionType(code: string, i: number): string { ... }
```

### IN-02: `channelEconomics` returns `revPerUnit` and `netPerUnit` as mathematically identical fields

**File:** `convex/reports/unitEconomics.ts:297-300`
**Issue:** Since `fees = 0` for v1, both `revPerUnit` and `netPerUnit` compute `net / units`. Two fields for the same number is confusing for consumers and invites silent divergence when fees land in v2.
**Fix:** Return only one for v1 (pick `netPerUnit`, since `net` is labelled net-of-fees-and-discount) and add a TODO comment where `fees` gets hooked up. Consumer `TakeRateTable.tsx:29` uses `netPerUnit`, `RevPerUnitChart.tsx:19` uses `revPerUnit` — unify to one name.

### IN-03: `fromDateInput` silently returns `Date.now()` on empty string

**File:** `src/components/analytics/AnalyticsFilterBar.tsx:22-24`
**Issue:** If a user clears the date input, the filter window snaps to "now" rather than leaving the previous value. Harmless but surprising.
**Fix:** Return `undefined` and have the caller skip the `setFilters` call on empty input, or return the current `filters.fromTs`/`filters.toTs` instead of `Date.now()`.

### IN-04: `jakartaHour` uses ad-hoc timezone math instead of `getWibComponents`

**File:** `convex/reports/unitEconomics.ts:178-180`
**Issue:** `jakartaHour` uses the inline `new Date(ts + 7*60*60*1000).getUTCHours()` trick while the file already imports `getWibComponents` and uses it everywhere else. Two different code paths for the same transform = drift risk (e.g., if DST ever becomes relevant, or if WIB_OFFSET_HOURS changes).
**Fix:** Extend `getWibComponents` in `convex/lib/periodRange.ts` to also return `hour`, and use it here:
```ts
function jakartaHour(ts: number): number {
  return getWibComponents(ts).hour;
}
```

### IN-05: KPI delta colors assume "up is good" for every metric

**File:** `src/components/analytics/KpiRow.tsx:6-16`
**Issue:** `Delta` always renders `up`=green, `down`=red. Current KPIs (revenue, units, AOV, orders, rev/unit, units/txn) are all "up is good", so behavior is correct today. But the component is generic and mis-colors any future inverse metric (discount %, refund rate) silently.
**Fix:** Add an `inverted?: boolean` prop to `KpiTile` / `Delta` so future additions can opt in without refactoring.

### IN-06: `priorPeriod` re-runs full filtered data load for delta computation

**File:** `convex/reports/unitEconomics.ts:147-167` (`kpiSummary`), `505-583` (`channelMomentum`)
**Issue:** Both queries call `loadFilteredData` twice (current + prior), which means two full `componentTypes` + `menuProductComponents` scans per query and up to 2× the order/item reads. Acceptable for v1, but documenting the cost prevents someone from later wrapping these in a dashboard-wide polling hook without realizing the multiplier.
**Fix:** Extract `unitsPerProduct` to a separate helper call shared across both window loads, e.g.:
```ts
const unitsPerProduct = await getProductionUnitsPerProduct(ctx);
const current = await loadFilteredDataWithUnits(ctx, args, unitsPerProduct);
const prior   = await loadFilteredDataWithUnits(ctx, priorPeriod(args), unitsPerProduct);
```
(Performance is technically out-of-scope for v1 review, but this is a trivial one-line win.)

### IN-07: Test file asserts `rolling7[last] ≈ 30000` but loop seeds 10 days — add edge case

**File:** `tests/convex/unitEconomics.test.ts:384-408`
**Issue:** The test seeds 10 consecutive days of identical Rp 30_000 revenue and asserts `rolling7[last] ≈ 30000`. That passes even under the current (buggy) "average over last N data points" implementation because all data points equal 30_000. The test does **not** catch WR-02. Adding a test with gaps (e.g., only 3 of 10 days have orders) would have caught that bug.
**Fix:** Add a regression test:
```ts
test("rolling7 averages over calendar days, treating gaps as zero", async () => {
  // Seed 3 days within a 7-day window, each with Rp 70_000
  // Expected rolling7[last] ≈ (70000 * 3) / 7 ≈ 30000
});
```

---

_Reviewed: 2026-04-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

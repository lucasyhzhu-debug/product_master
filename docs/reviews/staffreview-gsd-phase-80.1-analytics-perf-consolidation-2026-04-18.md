# Staff Review: Phase 80.1 Analytics Performance Consolidation

**Branch:** gsd/phase-80.1-analytics-perf-consolidation
**Date:** 2026-04-18
**Reviewer:** Principal Engineer (AI)

---

## Summary

Phase 80.1 successfully consolidates 11+ per-widget Convex queries into 3 snapshot queries backed by 10 pure reducers, ships a well-structured `chartPrimitives.tsx` library, and migrates both heatmaps from hand-rolled grids to `@nivo/heatmap`. The architecture is sound — DI call-count tests, runtime budget test, WCAG contrast test, and backward-compatible selector hooks all land correctly. Four pre-implementation Critical findings from the planning staffreview were resolved correctly: all four Path A decisions were taken, shapes were preserved, and the implementation matches the live codebase rather than the PRD-assumed codebase. The implementation is ready to merge with two issues that must be fixed first (both are data-correctness bugs) and three improvements worth addressing before shipping.

---

## Critical Issues

### C-01: `useSkuPareto` slices `skuTop.rows` — cumulative % in `SkuParetoChart` is semantically wrong

**Files:** `src/hooks/convex/useAnalytics.ts:60`, `src/components/analytics/SkuParetoChart.tsx:35-48`

`useSkuPareto(topN)` returns `useSkuSnapshot()?.skuTop?.rows?.slice(0, topN)`. `SkuParetoChart` then recomputes `totalRevenue` from that sliced array and derives `cumulativePct` relative to it:

```typescript
// hooks/useAnalytics.ts:59-60
export const useSkuPareto = (topN = 10) =>
  useSkuSnapshot()?.skuTop?.rows?.slice(0, topN);

// SkuParetoChart.tsx:35-48
const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
let running = 0;
const withCumulative = data.map((d) => {
  running += d.revenue;
  return { ...d, cumulativePct: totalRevenue > 0 ? (running / totalRevenue) * 100 : 0 };
});
```

The server already computed correct `cumulativePct` values relative to the full window in `reduceSkuTop`. Slicing to `topN=10` and recomputing against the slice causes the Pareto line to reach 100% at the 10th bar regardless of how much revenue the excluded products represent. If the top 10 products represent 60% of revenue, the chart still shows the Pareto curve reaching 100% — a misrepresentation of the analysis.

Also: `reduceSkuTop` appends an "Other" row when products exceed the cap. `useSkuPareto(10)` slices to 10, discarding "Other" — the Pareto line cannot reach 100% without the Other row. Both problems stem from re-deriving cumulative % client-side over a slice.

**Fix:** Remove the client-side cumulative recompute. Use server-provided `cumulativePct` directly:

```typescript
// SkuParetoChart.tsx — replace the totalRevenue + running block with:
const withCumulative = data.map((d: { name: string; revenue: number; cumulativePct: number }) => ({
  ...d,
  displayName: truncateWithTooltip(d.name, 22).display,
  fullName: d.name,
  // cumulativePct from server is relative to full window — semantically correct
}));
```

Note: `SkuParetoChart.tsx` accesses `d.name` but `reduceSkuTop` returns rows with field `name` (not `productName`), so the field name is correct. The cumulative recompute is the only issue.

---

### C-02: `reduceTypeMixOverTime` returns `series: []` in the empty-orders case — shape inconsistency

**File:** `convex/reports/unitEconomics.ts:895-899`

```typescript
export function reduceTypeMixOverTime(
  current: WindowData,
  pre: Precomputed,
  granularity: "day" | "week",
) {
  if (current.orders.length === 0) {
    return { buckets: [] as string[], series: [] as Array<{ code: string; name: string; values: number[] }> };
  }
  return reduceVolumeByType(current, pre, granularity);
}
```

When orders is empty, the fast-path returns `series: []`. When `reduceVolumeByType` runs with items that match no products (or zero items but non-empty orders), it returns `series: pre.typeCodes.map(code => ({ code, name, values: [] }))` — a non-empty series array with zero-height values.

This means `TypeMixOverTime.tsx` renders with zero `<Bar>` elements (no legend, no color key) when orders is empty, but renders with zero-height bars AND a legend when orders exist but items are unlinked. The empty-state UX differs based on whether the fast-path fires, not on whether data is meaningful. Additionally, any consumer iterating `data.series` to build a static legend (color key) would see it flicker between 0 and N entries depending on this condition.

**Fix:** Remove the early-exit guard entirely:

```typescript
export function reduceTypeMixOverTime(
  current: WindowData,
  pre: Precomputed,
  granularity: "day" | "week",
) {
  return reduceVolumeByType(current, pre, granularity);
}
```

`reduceVolumeByType` already handles empty `WindowData` correctly — it produces `{ buckets: [], series: [{ code, name, values: [] }, ...] }`. Shape is consistent regardless of input.

---

## Important Improvements

### I-01: `reduceByWeekdayRolling` has O(N²) label dedup

**File:** `convex/reports/unitEconomics.ts:765-766`

```typescript
for (const k of orderCountByDay.keys()) if (!labels.includes(k)) labels.push(k);
for (const k of unitCountByDay.keys()) if (!labels.includes(k)) labels.push(k);
```

`labels.includes(k)` is O(N) inside a loop over Map keys — O(N²) total where N = distinct order days. At 90-day windows with daily external revenue rows this becomes measurable: 90 calendar days + potentially hundreds of sparse external-revenue transaction dates = up to ~400 distinct keys × 400-element array scan = ~160K comparisons per snapshot call. The runtime baseline shows `timeSeries` at 1098ms at 500-order scale in jsdom — this is already at 55% of the 2000ms budget and this loop contributes.

**Fix:**

```typescript
const labelSet = new Set(labels);
for (const k of orderCountByDay.keys()) {
  if (!labelSet.has(k)) { labels.push(k); labelSet.add(k); }
}
for (const k of unitCountByDay.keys()) {
  if (!labelSet.has(k)) { labels.push(k); labelSet.add(k); }
}
```

---

### I-02: `loadFilteredData` accepts `preloadedUnitsPerProduct` but silently ignores it

**File:** `convex/reports/unitEconomics.ts:263, 370`

The function signature includes `preloadedUnitsPerProduct?: Map<Id<"menuProducts">, number>` and callers at lines 1049, 1077, 1113 pass `pre.unitsPerProduct`, but line 370 does `void preloadedUnitsPerProduct` with a comment explaining it is "advisory". This means callers that pass this argument for dedup optimization are getting no benefit. The parameter is dead weight in the public signature.

The bigger concern: `kpiAndChannelSnapshotImpl` calls `loadFilteredData(ctx, args, pre.unitsPerProduct)` twice for current and prior periods. If the intent of passing the preloaded map was to allow the loader to skip an internal fetch, but the loader ignores it — there is no dedup happening. This is not a regression (the old code didn't dedup either) but the code is misleading.

**Fix:** Either rename parameter to `_preloadedUnitsPerProduct` to signal intentional disuse, or remove the parameter entirely and update call sites. The latter is cleaner since `Precomputed` is passed to all reducers already.

---

### I-03: Runtime budget threshold softened from plan (500ms → 2000ms) — should be documented

**File:** `tests/convex/unitEconomicsSnapshots.test.ts:327, 370-372`

Plan 01 acceptance criterion specified "each snapshot completes <500ms at 5000-order scale". The implemented test uses 500 orders and a 2000ms threshold. The runtime baseline shows 1010ms, 1098ms, 1085ms — all below 2000ms, but all above 500ms. At 10× scale (5000 orders), these times would approach or exceed 2000ms in production (jsdom harness is ~10× slower than Convex runtime, so the plan's confidence interval was ~50ms production for 5000 orders — that claim is now untestable).

This is not a merge blocker, but the delta between the planned budget and what was implemented deserves a note in the SUMMARY or CHANGELOG so future engineers know the test tolerance. Also, the `kpiAndChannelSnapshot` at 1010ms is 50% of the test budget with only 500 orders and a single BOM product. At production scale with ~50K orders the serverless environment will be faster (no jsdom overhead), but 2× loadFilteredData is still the heaviest path.

**Recommendation:** Add a comment in the test explaining the threshold relaxation and why jsdom scale does not map 1:1 to production.

---

## Refinements

### R-01: `chartPrimitives.tsx` has declaration-before-import ordering

**File:** `src/lib/chartPrimitives.tsx:8-33`

`truncateWithTooltip` and `formatCurrencyCompact` are declared as top-level functions at lines 8–30 before `import` statements at lines 32–35. ES modules hoist `import` declarations so this is not a runtime error, but it violates standard file organization conventions and will trip linters configured to enforce imports-first. Move the import statements to the top of the file.

---

### R-02: `useSkuChannelMatrix` passes `channels` unsliced alongside sliced `matrix`

**File:** `src/hooks/convex/useAnalytics.ts:61-66`

```typescript
return { products: products.slice(0, topN), channels, matrix: matrix.slice(0, topN) };
```

`channels` is returned unsliced — it contains all channels from the full snapshot. `SkuChannelHeatmap.tsx` correctly uses `row.channels` per-matrix-row for cell data and does not rely on the top-level `channels` for index alignment, so this is not currently broken. But the shape asymmetry is a latent bug: any future consumer that iterates the top-level `channels` array to build column headers and then indexes into `matrix[i]` cells by position would get misaligned columns if some matrix rows have a different channel ordering. Add a comment documenting the contract.

---

### R-03: `unitEconomicsSnapshots.test.ts` call-count test has a dead fallback branch

**File:** `tests/convex/unitEconomicsSnapshots.test.ts:263-270`

The DI call-count test attempts `(mod as any)._loadFilteredData` (not exported from `unitEconomics.ts`) and falls back to `countingSpy` on line 271. The `_loadFilteredData` branch is dead code — the fallback is always taken. The test is correct (it counts via `countingSpy`) but the unreachable branch creates confusion. Remove lines 263–268, leaving only `countingSpy`.

---

### R-04: `WeekdayDualAxisChart` uses a bespoke `WeekdayTooltip` instead of `ChartTooltip`

**File:** `src/components/analytics/WeekdayDualAxisChart.tsx:31-58`

`WeekdayDualAxisChart` defines its own `WeekdayTooltip` component that manually applies `bg-popover text-popover-foreground` classes and `data-chart-tooltip`. This is functionally correct — it achieves R2 compliance — but it bypasses the shared `ChartTooltip` primitive. If the R2 token names change (e.g. a Tailwind v5 token rename), this component would drift without being caught by the `ChartTooltip` usage grep. Not a blocker; the implementation is correct and the classes match.

---

### R-05: `formatCurrencyCompact` handles the `14580000 → "Rp 14,6jt"` edge case correctly, but only by coincidence

**File:** `src/lib/chartPrimitives.tsx:23-24`

```typescript
return `Rp ${sign}${(abs / 1_000_000).toFixed(1).replace(".", ",")}jt`;
```

`14580000 / 1_000_000 = 14.58`, `.toFixed(1) = "14.6"`, `.replace(".", ",") = "14,6"`. The test asserts `"Rp 14,6jt"` and it passes. However, the `toFixed(1)` rounding happens in the JS engine's IEEE 754 floating-point space, which can produce surprising results for certain values (e.g. `1_050_000 / 1_000_000 = 1.05 → toFixed(1) = "1.1"` not `"1.0"`). This is an inherent JS floating-point issue and is standard practice for this type of compact formatter — not a bug to fix, just worth noting for the next engineer who adds formatter tests.

---

## Plan Fidelity

### Wave A (Plan 01) — Backend: Fully delivered

All four pre-implementation Critical findings were resolved:
- **Critical 1 (shape mismatch):** Resolved. Reducer test shapes match the live query shapes. `reduceKpi` returns `{current, prior, delta}` matching `KpiRow.tsx` consumption of `data.current.netRevenue`, `data.current.orderCount`, etc.
- **Critical 2 (`typeMixOverTime` never existed as a query):** Resolved. It is correctly implemented as a NEW server-side reducer (Category B), not an extraction. Deleted from the 11-wrapper list and the 12-delete list.
- **Critical 3 (`reduceRevPerUnit` would reshape `RevPerUnitChart`):** Resolved via Path A. `RevPerUnitChart` stays on `useChannelEconomics()`. No `reduceRevPerUnit` was created. `skuSnapshot` contains only `{ skuTop, skuChannelMatrix }`.
- **Critical 4 (`UnitsByTypeStackedBars` time-bucket vs per-product):** Resolved via Path A. `UnitsByTypeStackedBars` reads `useVolumeByType("day")` → `timeSeriesSnapshot.volumeByType.day` with `data.buckets` directly. No per-product reshape.

**Notable addition not in plan:** `byWeekdayRolling` is a separate field in `timeSeriesSnapshot` (not mentioned in the plan's D-03 snapshot definition). `useByWeekday` in hooks accepts a `mode` parameter and routes to `snap.byWeekday` or `snap.byWeekdayRolling` accordingly. This is a clean addition that enables `WeekdayDualAxisChart`'s rolling mode without a new subscription — consistent with D-17 (granularity as client-side slice).

**Plan-stated items absent:**
- `jakartaHour` helper: Correctly deleted per D-10. `getWibComponents(ts).hour` is used directly in `reduceDayHourHeatmap`.
- D-19 wrapper-snapshot parity test (Improvement 3 from planning review): The plan executor added it at `unitEconomicsSnapshots.test.ts` lines 233-239 but then explicitly removed it in a comment: "D-19 wrapper-snapshot parity — REMOVED in Phase 80.1 Task 23 after the 12 legacy wrappers were deleted." The parity test was implemented and then correctly cleaned up when the wrappers were deleted. Adequate.

**Plan-specified runtime budget (500ms at 5000 orders):** Relaxed to 2000ms at 500 orders — see I-03.

### Wave B (Plan 02) — Frontend: Largely delivered with one divergence

All 8 Recharts widgets migrated to `chartPrimitives`. All 11 backward-compatible selectors present. `useChannelSparklines` correctly absent.

**Divergence — `useByWeekday` signature changed:**
Plan 02 Task 13 specifies `export const useByWeekday = () => useTimeSeriesSnapshot()?.byWeekday`. The implementation is:
```typescript
export const useByWeekday = (mode: "weekday" | "rolling" = "weekday") => {
  const snap = useTimeSeriesSnapshot();
  if (snap === undefined) return undefined;
  return mode === "rolling" ? snap.byWeekdayRolling : snap.byWeekday;
};
```
This is a sensible extension to support `WeekdayDualAxisChart`'s mode toggle, and it is backward-compatible (default mode = "weekday" matches the no-arg behavior). The plan count of "11 backward-compatible selectors" is preserved — `useByWeekday` is still one selector even with the mode param.

**`TypeMixOverTime` data source:** Correctly migrated to `useTypeMixOverTime(granularity)` per Wave B plan. The component retains a client-side absolute/percent toggle via `useState`, which is reasonable — the server returns absolute values and the toggle is purely presentational. The plan's description of "server-side pct transform" was slightly misleading; the implementation correctly computes pct client-side from absolute values, which is the right approach for an interactive toggle.

**`SkuParetoChart` field name drift:** The plan and plan template use `d.productName` as the SKU row field, but `reduceSkuTop` returns rows with field `name`. The implementation correctly uses `d.name` — this was a silent fix made during execution. The cumulative % recompute issue (C-01) traces from this same code path.

### Wave C (Plan 03) — Nivo + cleanup + docs: Delivered

- Both heatmaps on `@nivo/heatmap` with `ResponsiveHeatMap`, `labelTextColor`, `ChartTooltip` integration, `ChartFrame` wrapping — all correct.
- `collapseOvernight` stayed in `DayHourHeatmap.tsx` component per Wave A SUMMARY deviation #3 (executor discretion, documented).
- `SkuChannelHeatmap` uses `pctOfChannel` not raw revenue in the heatmap cells — correct, matches chart title "% of channel".
- 12 deprecated wrapper queries deleted. Safety grep confirmed no callers before deletion.
- `@nivo/core` + `@nivo/heatmap` installed with pinned versions (no caret) per D-11.
- `vendor-nivo` manual chunk added to `vite.config.ts` per D-09 Step 19.5a.
- CHANGELOG, API_REFERENCE, ROADMAP, HUMAN-UAT all updated.
- HUMAN-UAT split into pre-merge (items 1-5) and post-deploy (items 6-10) per plan.

**One gap:** Plan 03 acceptance criterion: `grep -c "result: [pending]" … returns 10` — the file has 10 pending items, matching the criterion.

---

*Reviewed: 2026-04-18*
*Reviewer: Principal Engineer (AI)*
*Branch: gsd/phase-80.1-analytics-perf-consolidation*

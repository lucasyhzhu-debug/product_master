# Analytics Dashboard Perf & Chart Primitives Consolidation — Design Spec

**Phase:** 80.1 (promoted from backlog)
**Date:** 2026-04-17
**Author:** Brainstormed with Lucas
**Related:**
- Staff review flagging I-04, M-02, M-03: `docs/reviews/staffreview-gsd-phase-80-unit-economics-analytics-dashboard-2026-04-15.md`
- Phase 80 source of truth: `.planning/phases/80-unit-economics-analytics-dashboard/`
- Phase 80 design: `docs/superpowers/specs/2026-04-13-unit-economics-analytics-dashboard-design.md`

---

## Problem

The `/analytics` page shipped in Phase 80 has three latent issues, all documented but deferred:

1. **I-04 — reactive fan-out.** 11 Convex queries, each a separate `useQuery` subscription. Every filter click triggers 11 parallel re-fetches; any write to `orders` invalidates all 11. Two of them (`kpiSummary`, `channelMomentum`) call `loadFilteredData` twice for current + prior period, giving 13 full loader invocations per filter click.
2. **M-02 — duplicated color primitives.** `TYPE_COLORS` + `colorFor()` helper lives in both `UnitsByTypeStackedBars.tsx` and `TypeMixOverTime.tsx`. Drift risk.
3. **M-03 — ad-hoc timezone math.** `jakartaHour` in `convex/reports/unitEconomics.ts` re-implements what `getWibComponents()` already does in `convex/lib/periodRange.ts`.

Separately, two UX defects surfaced during design review:

4. **Axis labels clip and ellipsize without recovery.** SkuParetoChart truncates X-axis labels (`Dubai Chewy C…`) with no way to see the full name; Y-axis labels (`Rp 0`, `0%`) clip at container edges.
5. **Tooltips fail WCAG AA contrast.** White-background tooltip renders light-green `Cumulative %` (~2.1:1) and light-orange `Revenue` (~3.0:1) text against the dark page chrome — unreadable at a glance.

And one library gap:

6. **Heatmaps are hand-rolled.** `DayHourHeatmap` and `SkuChannelHeatmap` each reinvent color scales, tooltips, axis labels in ~150 LOC of div grids. Recharts has no heatmap primitive.

---

## Scope

**In:**
- `convex/reports/unitEconomics.ts` — refactor 11 queries into 3 grouped snapshot queries with a hoisted shared loader
- `src/hooks/convex/useAnalytics.ts` — 11 hooks → 3 snapshot hooks + field selectors preserving existing widget APIs
- `src/components/analytics/*` (14 files) — swap to shared chart primitives
- `src/lib/productionTypeColors.ts` (new) — extracted shared color palette
- `src/lib/chartPrimitives.tsx` (new) — shared `ChartFrame`, `ChartAxis`, `ChartTooltip` with readability/contrast enforcement
- `@nivo/core` + `@nivo/heatmap` — new dependencies, lazy-loaded with `/analytics` route
- Readability/contrast cross-cutting requirements applied to all 13 widgets

**Out:**
- `src/pages/SalesAnalytics.tsx` — separate page, separate query path, follow-up phase if needed
- `src/pages/ExpenseAnalytics.tsx` — same
- Materialized views or precomputed aggregates — overkill at current order volume
- New widgets or changed filter semantics
- Full Recharts → Nivo migration — this phase keeps Recharts for bar/line/area/composed charts
- Virtualization for heatmap cells
- Cross-device responsive redesign beyond "don't silently drop ticks"

---

## Backend Architecture

### Three grouped snapshot queries

The 11 existing queries are grouped by (a) widget lens and (b) whether they need user-toggled args:

**Group 1 — KPI & Channel Lens** (`kpiAndChannelSnapshot`)
- No user-toggled args — pure filter-driven
- Needs prior-period comparison
- Covers: KPI row A1–A6, channel economics B1–B3 (AOV / units-per-txn / take-rate), channel momentum F1, channel sparkline table F2

**Group 2 — Time-Series Lens** (`timeSeriesSnapshot`)
- **No user-toggled args in query signature.** Snapshot returns BOTH granularities precomputed; client picks which to render based on the UI toggle. This ensures every time-series widget shares one subscription regardless of toggle state.
- No prior-period needed
- Covers: byWeekday C1, rollingTrend C2, dayHourHeatmap C3, volumeByType D3 (both day + week), typeMixOverTime D4 (both day + week)

**Group 3 — SKU Lens** (`skuSnapshot`)
- **No user-toggled args in query signature.** Snapshot returns top-20 SKUs (fixed cap covering both widgets' needs — E1 default 10, E2 default 8); widgets slice client-side for their topN toggle. Fixed cap is a documented tradeoff: changing the cap above 20 requires spec update.
- No prior-period needed
- Covers: skuPareto E1, skuChannelMatrix E2, revPerUnit D1, unitsByTypeStackedBars D2

### Signatures

```ts
// convex/reports/unitEconomics.ts

export const kpiAndChannelSnapshot = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const pre = await precomputeBomMaps(ctx);
    const current = await loadFilteredData(ctx, args, pre);
    const prior = await loadPriorPeriodFilteredData(ctx, args, pre);
    return {
      kpi: reduceKpi(current, prior),
      channelEconomics: reduceChannelEconomics(current),
      channelMomentum: reduceChannelMomentum(current, prior),
      channelSparklines: reduceChannelSparklines(current),
    };
  },
});

// No granularity arg — precompute both; client slices
export const timeSeriesSnapshot = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const pre = await precomputeBomMaps(ctx);
    const current = await loadFilteredData(ctx, args, pre);
    return {
      byWeekday: reduceByWeekday(current),
      rollingTrend: reduceRollingTrend(current),
      dayHourHeatmap: reduceDayHourHeatmap(current),
      volumeByType: {
        day: reduceVolumeByType(current, "day"),
        week: reduceVolumeByType(current, "week"),
      },
      typeMixOverTime: {
        day: reduceTypeMixOverTime(current, "day"),
        week: reduceTypeMixOverTime(current, "week"),
      },
    };
  },
});

// No topN arg — precompute fixed top-20; client slices per-widget default
const SKU_SNAPSHOT_TOP_CAP = 20;

export const skuSnapshot = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const pre = await precomputeBomMaps(ctx);
    const current = await loadFilteredData(ctx, args, pre);
    return {
      skuTop: reduceSkuTop(current, SKU_SNAPSHOT_TOP_CAP), // rows ordered by revenue desc
      skuChannelMatrix: reduceSkuChannelMatrix(current, SKU_SNAPSHOT_TOP_CAP),
      revPerUnit: reduceRevPerUnit(current),
      unitsByTypeStackedBars: reduceUnitsByTypeStackedBars(current),
    };
  },
});
```

### Hoisted shared loader

New helper `precomputeBomMaps(ctx)` scans `componentTypes` + `menuProductComponents` ONCE per snapshot invocation and returns `{ unitsPerProduct, unitsByTypePerProduct }` maps passed down to every reducer. Today each of the 11 queries re-scans these two tables.

`loadFilteredData` accepts the precomputed maps as a new argument so no reducer re-scans. Existing `getProductionUnitsPerProduct` / `getProductionUnitsByTypePerProduct` are retained as internal helpers called by `precomputeBomMaps`.

### Widget reducers

Each widget's compute logic is extracted into a pure, tested function (`reduceKpi`, `reduceChannelEconomics`, etc.) that takes `(orders, items, pre)` and returns the widget payload. This keeps snapshot handlers thin and preserves existing test coverage — the current per-widget tests call these pure reducers instead of the top-level query.

### Backward-compatibility: thin wrappers

The 11 existing exports (`kpiSummary`, `byWeekday`, etc.) are preserved as thin wrappers that call the appropriate snapshot and project out their field:

```ts
export const kpiSummary = query({
  args: filterArgs,
  handler: async (ctx, args) => (await kpiAndChannelSnapshot._handler(ctx, args)).kpi,
});
```

This keeps the existing frontend functional during backend deploy (Commit 1 alone is safe to ship). Wrappers are removed in Commit 3 once all widgets are migrated.

For queries that previously accepted user-toggled args (`byWeekday(mode)`, `volumeByType(granularity)`, `skuPareto(topN)`, `skuChannelMatrix(topN)`), the wrapper accepts the old arg and selects the appropriate pre-computed variant from the snapshot, preserving the old API contract exactly:

```ts
export const volumeByType = query({
  args: { ...filterArgs, granularity: v.union(v.literal("day"), v.literal("week")) },
  handler: async (ctx, args) =>
    (await timeSeriesSnapshot._handler(ctx, args)).volumeByType[args.granularity],
});

export const skuPareto = query({
  args: { ...filterArgs, topN: v.optional(v.number()) },
  handler: async (ctx, args) =>
    (await skuSnapshot._handler(ctx, args)).skuTop.slice(0, args.topN ?? 10),
});
```

### Jakarta hour swap (M-03)

Inline `jakartaHour` math in `unitEconomics.ts` is replaced with `getWibComponents(ts).hour` from `convex/lib/periodRange.ts`. One-line change per call site.

### Filter-click cost, before → after

| Metric | Before (Phase 80) | After |
|---|---|---|
| Queries on mount | 11 | 3 |
| Subscriptions per filter click | 11 | 3 |
| `loadFilteredData` invocations per click | 13 (11 + 2 prior-period) | 4 (3 + 1 prior) |
| `componentTypes` + `menuProductComponents` scans per click | 11 (or 22 if both helpers are called) | 3 (once per snapshot via `precomputeBomMaps`) |
| `orders` re-invalidation surface on write | 11 subs | 3 subs |

---

## Frontend Architecture

### Hook rewrite

`src/hooks/convex/useAnalytics.ts`:

```ts
export function useKpiAndChannelSnapshot() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.kpiAndChannelSnapshot, buildArgs(filters));
}

export function useTimeSeriesSnapshot() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.timeSeriesSnapshot, buildArgs(filters));
}

export function useSkuSnapshot() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.skuSnapshot, buildArgs(filters));
}

// Backward-compatible field selectors — widgets keep their existing hook names and return types.
// Granularity + topN are now client-side slices, not server args.
export const useKpiSummary = () => useKpiAndChannelSnapshot()?.kpi;
export const useChannelEconomics = () => useKpiAndChannelSnapshot()?.channelEconomics;
export const useChannelMomentum = () => useKpiAndChannelSnapshot()?.channelMomentum;
export const useByWeekday = () => useTimeSeriesSnapshot()?.byWeekday;
export const useRollingTrend = () => useTimeSeriesSnapshot()?.rollingTrend;
export const useDayHourHeatmap = () => useTimeSeriesSnapshot()?.dayHourHeatmap;
export const useVolumeByType = (g: "day" | "week") => useTimeSeriesSnapshot()?.volumeByType[g];
export const useTypeMixOverTime = (g: "day" | "week") => useTimeSeriesSnapshot()?.typeMixOverTime[g];
export const useSkuPareto = (topN = 10) => useSkuSnapshot()?.skuTop.slice(0, topN);
export const useSkuChannelMatrix = (topN = 8) => useSkuSnapshot()?.skuChannelMatrix.slice(0, topN);
```

Widgets import the same names they do today — single-line implementation swap, no widget-side code change needed for the migration itself.

**Note:** Widgets using the same snapshot share one subscription. When `AnalyticsDashboard` mounts all 13 widgets, Convex deduplicates identical `useQuery` calls, so `useKpiSummary` + `useChannelEconomics` + `useChannelMomentum` collectively generate exactly one `kpiAndChannelSnapshot` subscription.

### Shared chart primitives (new files)

**`src/lib/productionTypeColors.ts`** (M-02)
- Extracts `TYPE_COLORS` and `colorFor()` currently duplicated in `UnitsByTypeStackedBars.tsx:14-24` and `TypeMixOverTime.tsx:16-26`
- Mirrors existing `src/lib/platformColors.ts` pattern
- Exports:
  - `productionTypeColor(code: string): string`
  - `PRODUCTION_TYPE_PALETTE: Record<string, string>`
  - `PRODUCTION_TYPE_ORDER: string[]` (stable legend ordering)

**`src/lib/chartPrimitives.tsx`** (new)
- `<ChartFrame title subtitle loading error height={320}>{children}</ChartFrame>` — absorbs the `<Card>/<CardHeader>/<CardContent>` boilerplate currently repeated across 8 widgets
  - Default margins: `{ top: 16, right: 48, bottom: 64, left: 64 }` — documented in primitive JSDoc
- `<ChartAxis type="currency" | "count" | "percent" | "label" />` — pre-configured tick formatters
  - `currency` uses `formatCurrencyCompact` (`Rp 1,2jt`, `Rp 15rb`)
  - `count` uses `toLocaleString("id-ID")`
  - `percent` uses `(v) => ${v.toFixed(0)}%`
  - `label` applies rotation + truncation + tooltip reveal (see R1 below)
- `<ChartTooltip formatter={...} />` — shared tooltip matching shadcn theme tokens (see R2)
- `truncateWithTooltip(label: string, max = 22): { display, full }` helper
- `formatCurrencyCompact(value: number): string` helper

### `@nivo/heatmap` adoption

**Install:** `npm install @nivo/core @nivo/heatmap` — pinned exact versions.

**Lazy-load the route:**
```ts
// src/App.tsx
const AnalyticsDashboard = React.lazy(() => import("./pages/AnalyticsDashboard"));
```
Nivo loads only when user visits `/analytics`. Route already behind `canAccessDashboard`.

**Migrate `DayHourHeatmap.tsx`:**
- Replace hand-rolled div grid (~130 LOC) with `<ResponsiveHeatMap />`
- Data shape: `[{ id: "Mon", data: [{ x: "00", y: 5 }, ...] }, ...]`
- Keep existing color scale (white → brand primary) via `colors={{ type: "quantize", scheme: "reds", steps: 5 }}` or custom palette matching the current gradient
- Keep WIB-hour axis labels (0–23)
- Tooltip wraps `<ChartTooltip />` via Nivo's `tooltip` prop
- Target: ~50 LOC

**Migrate `SkuChannelHeatmap.tsx`:**
- Same pattern, axes: SKU (Y) × Channel (X)
- Currently ~150 LOC → target ~60 LOC

**Not migrated:** `SkuParetoChart` stays in Recharts `ComposedChart` (bar + cumulative line).

### Bundle budget

Expected delta: ~55 KB gzipped for `@nivo/core` + `@nivo/heatmap`. The `/analytics` chunk becomes a separate lazy chunk (from the `React.lazy` split), so app-shell bundle is unchanged.

`vite-plugin-bundlesize` vendor cap may need a bump — follow the Phase 72 precedent from `feedback_vendor_bundle_cap`. Verify locally via `npm run build` and bump only if it actually breaks.

### Subscription cost, before → after

| Surface | Before | After |
|---|---|---|
| `useQuery` calls in `useAnalytics.ts` | 11 | 3 |
| Widget-level re-subs on filter click | 11 | 3 |
| Hand-rolled heatmap LOC | ~280 | ~110 (Nivo handles scale/legend/axis/tooltip) |
| Duplicate `TYPE_COLORS` blocks | 2 | 0 (shared) |
| Chart widget LOC (avg) | ~70 | ~35 (chartPrimitives absorbs boilerplate) |

---

## Readability & Contrast Requirements (Cross-Cutting, Non-Negotiable)

These apply to every chart on `/analytics`, whether or not the widget is otherwise modified.

### R1 — Axis labels must never silently clip or ellipsize

**Cause** (from screenshot evidence 2026-04-17):
- SkuParetoChart X-axis shows `(Unlinked)`, `Dubai Chewy C…`, `FRO-DubChe…` — truncated with no hover reveal
- Y-axis `Rp 0` clips at container's left edge
- Right Y-axis `25% / 0%` clips at container's right edge

**Enforcement (in `ChartFrame` / `ChartAxis` primitives):**
- Default chart margins: `{ top: 16, right: 48, bottom: 64, left: 64 }`
- `<XAxis />` with string labels receives `angle={-35} textAnchor="end" interval={0} height={80}` by default — every tick renders; Recharts does not auto-hide
- Long labels use `truncateWithTooltip(label, 22)`; truncated text appears in the tick render BUT full label appears in the tooltip AND in any legend
- Currency Y-axis uses `formatCurrencyCompact` (`Rp 1,2jt`) by default, NOT full `Rp 1.200.000`
- `<ResponsiveContainer>` enforces `minWidth={320}` with horizontal scroll fallback on narrower viewports — no silent tick dropping

### R2 — Tooltips must have WCAG AA contrast (≥4.5:1)

**Cause** (from screenshot evidence 2026-04-17):
- Tooltip renders white background; light-green `Cumulative %: 75.6%` (~2.1:1); light-orange `Revenue: Rp 14.580.000` (~3.0:1). Both fail AA.

**Enforcement (in shared `<ChartTooltip />` primitive):**
- Background: `hsl(var(--popover))` — near-black in dark mode, matching app's `Popover` / `DropdownMenu` components
- Text: `hsl(var(--popover-foreground))` — white/near-white
- Title row: full-weight white
- Value rows: white numeric value text. Category color (green, orange, blue) appears ONLY as a small 10×10 swatch/dot prefix — NEVER as the color of the value text itself
- Border: `1px solid hsl(var(--border))` + subtle shadow for visual separation from chart area
- Automated test: `tests/components/analytics/tooltipContrast.test.tsx` mounts `<ChartTooltip>` in jsdom, computes foreground-vs-background contrast ratio, asserts ≥ 4.5:1 for title and every value row

### R3 — Nivo heatmap text follows same contrast rules

- Cell value labels (when shown): `labelTextColor={{ from: 'color', modifiers: [['darker', 3]] }}` for light cells, `['brighter', 3]` for dark — automatically meets AA against every cell color
- Heatmap tooltip uses the shared `<ChartTooltip />` primitive via Nivo's `tooltip` prop wrapper

### R4 — Success criteria additions

See "Success Criteria" section below.

### R5 — HUMAN-UAT additions

See "HUMAN-UAT Items" section below.

---

## Testing Strategy

### Backend tests (`tests/convex/unitEconomics.test.ts`)

- **Preserved:** Existing 11-query tests keep passing during migration via thin wrappers — zero rewrite
- **New — snapshot-level tests:** One per group, asserting the wrapped payload contains each widget's expected shape for a fixture with ~20 orders across 3 channels + 2 product types
- **New — call-counter regression:** "filter click with 50 orders fires `loadFilteredData` exactly 4 times" (3 snapshots + 1 prior-period for KPI). Uses mock ctx call-count pattern established in the codebase
- **New — BOM precompute regression:** asserts `precomputeBomMaps` is called once per snapshot invocation — guards against future unfactoring
- **Removed:** The 11 per-query tests are removed ONLY once frontend migration lands in the same phase (separate commit, same PR). Reducer-level tests replace them.

### Frontend tests (Vitest + React Testing Library)

- **Snapshot hook tests:** Mount test harness with `ConvexProviderMock`, verify 3 `useQuery` calls on mount, verify 3 re-fetches on filter change (not 11)
- **Tooltip contrast test:** `tests/components/analytics/tooltipContrast.test.tsx` asserts WCAG AA ratio for every tooltip variant
- **Nivo heatmap smoke tests:** Render `DayHourHeatmap` + `SkuChannelHeatmap` with fixture data, assert cell count matches data length
- **No visual regression:** Out of scope per project convention; heatmaps covered by HUMAN-UAT

### HUMAN-UAT items (persist to `.planning/phases/80.1-analytics-perf-consolidation/80.1-HUMAN-UAT.md`)

1. Open `/analytics` on production data — date range change refreshes all widgets smoothly with no flicker
2. Channel filter change — dashboard re-renders in under 1s on production data
3. Toggle granularity on volume-by-type (day ↔ week) — only time-series widgets re-render; SKU and KPI widgets remain stable
4. `DayHourHeatmap` renders with correct WIB hour axis; every cell tooltip shows on hover with correct value
5. `SkuChannelHeatmap` renders with correct SKU names on Y-axis, channels on X-axis
6. Lazy-load verification: DevTools Network tab shows Nivo chunk only loads when navigating to `/analytics`, not earlier
7. **Readability R1:** For every chart with string X-axis labels, hover every label and confirm full text reveals in tooltip. No silent `…`
8. **Readability R2:** Hover every data point with a tooltip on every chart. Read every tooltip value at a glance. If any tooltip requires squinting, fail
9. **Readability R1 (mobile):** Narrow browser to 375px width. Charts either scroll horizontally OR adapt labels without dropping ticks
10. Contrast spot-check: Open any tooltip in browser DevTools, use the accessibility contrast inspector, verify ≥4.5:1 on title and all value rows

---

## Migration / Rollout

Single phase, three commits on `gsd/phase-80.1-analytics-perf-consolidation`:

1. **Commit 1 — Backend snapshot queries + shared loader hoist.** Backward-compatible; 11 wrappers preserved. Safe to ship alone.
2. **Commit 2 — Frontend hooks migration + shared chart primitives + contrast/readability fixes.** Swaps imports; heatmaps still hand-rolled but now styled via shared primitives. Safe to ship alone.
3. **Commit 3 — Install Nivo + migrate heatmaps + lazy-load route + delete deprecated query wrappers.**

Each commit is independently deployable — Convex + Vercel can ship any subset. No flag toggles needed.

---

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds within `vite-plugin-bundlesize` cap (bumped if needed, documented in PR)
- [ ] `npm run test` — all existing tests pass + new snapshot + call-counter + contrast tests pass
- [ ] On staging dataset (~200 orders), filter click triggers exactly 3 Convex query re-runs (verified via Convex dashboard logs)
- [ ] `DayHourHeatmap` + `SkuChannelHeatmap` render identical data to pre-migration version (HUMAN-UAT screenshot compare)
- [ ] Analytics page initial paint doesn't regress — 3-group reveal feels equal or better than 11-widget reveal
- [ ] Bundle size for `/analytics` chunk documented in phase summary
- [ ] `TYPE_COLORS` block removed from both widget files; `jakartaHour` inline math removed from `unitEconomics.ts`
- [ ] **R1:** No truncated axis label exists on `/analytics` without a tooltip or hover reveal showing the full name
- [ ] **R2:** All tooltip text passes WCAG AA (≥4.5:1) contrast — verified by automated snapshot test
- [ ] Chart margins consistent across all 13 widgets (no one-off `margin={{ left: 20 }}` regressions)
- [ ] Tooltip category colors appear ONLY as swatches/dots, never as primary text color
- [ ] Lazy-load verified: Nivo chunks absent from non-`/analytics` route loads

---

## Non-Goals

- Materialized views or precomputed aggregates — overkill at current volume; revisit at 10× traffic
- New widgets
- Cross-device responsive redesign beyond R1
- Recharts → Nivo wholesale migration
- Applying this pattern to `SalesAnalytics.tsx` or `ExpenseAnalytics.tsx` — follow-up phase if observed performance issues justify it
- Changing filter semantics or adding new filters

---

## Documentation Updates (required at merge)

- `docs/CHANGELOG.md` — always required
- `docs/API_REFERENCE.md` — document 3 new snapshot queries; mark 11 wrappers deprecated-then-removed
- `docs/ROADMAP.md` — move Phase 80.1 from Backlog section into the v2.0 milestone completion row (or leave in v2.0 if promoted mid-milestone)

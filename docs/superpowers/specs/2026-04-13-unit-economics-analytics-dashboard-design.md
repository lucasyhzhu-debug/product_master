# Unit Economics Analytics Dashboard — Design Spec

**Date:** 2026-04-13
**Status:** Approved (brainstorming complete, pending implementation plan)
**Phase candidate:** v2.0 milestone (likely Phase 73 or later — schedule TBD)

---

## 1. Purpose

A single, filterable dashboard page answering three CFO/CEO questions at once:

1. **Where is money coming from?** (channel mix, product mix)
2. **How much per unit?** (AOV, revenue per unit, take-rate)
3. **Is it improving?** (WoW/MoM momentum, rolling trends)

Replaces the scattered chart widgets in `SalesAnalytics.tsx` with a purpose-built dashboard. Existing `SalesAnalytics.tsx` remains for platform-integration/sync concerns.

---

## 2. Scope & Non-Goals

### In scope (v1)
- New route: `/analytics` → `AnalyticsDashboard.tsx`
- 13 widgets across 6 lenses (A–F)
- Global filter bar (date range, channel multi-select, product multi-select)
- Backend aggregation queries in `convex/reports/unitEconomics.ts`
- Dynamic production-unit counting (see Critical Rule below)

### Not in scope (v1)
- Customer lens (new/returning, cohort retention) — deferred to future phase
- Payday cycle overlay (B3) — cut
- Revenue waterfall (C1) — cut
- Small-multiples per channel (C2) — cut
- Cost-of-goods contribution margin per channel — needs platform fee data not guaranteed available
- Real-time push updates — queries are reactive but aggregation may be cached

---

## 3. Critical Rule — Dynamic Production Unit Counting

**The ball-counting logic at `convex/dispatchPlanner/queries.ts:286` hardcodes `BIG_BALL` and `MID_BALL`. This must NOT be repeated.**

All "units sold" metrics MUST iterate every `componentTypes` row where:
- `category === "production"` AND
- `unit === "pcs"` AND
- used as a tier-1 component in `menuProductComponents`

Today this covers `BIG_BALL`, `MID_BALL`, `HAZELNUT_REGULAR`. Future production types (e.g., new stuffed variants) must be counted automatically without code changes.

Count equally: 1 pc = 1 unit, regardless of physical weight or price.

**Failing this rule = hidden Nutella/Hazelnut sales = wrong CFO metrics.** Treat as a hard correctness requirement.

---

## 4. Architecture

### 4.1 Route & Access

| Item | Value |
|---|---|
| Route | `/analytics` |
| Component | `src/pages/AnalyticsDashboard.tsx` |
| Access | `canAccessDashboard` (manager + admin) via `<ProtectedRoute>` |
| Nav placement | Primary nav, near Dashboard |

### 4.2 Component Hierarchy

```
AnalyticsDashboard.tsx
  ├── <AnalyticsFilterBar />              (sticky, global filters)
  ├── <AnalyticsKpiRow />                 (A · 6 tiles)
  ├── <TimePatternsSection>
  │   ├── <WeekdayDualAxisChart />        (B1)
  │   └── <DayHourHeatmap />              (B2)
  ├── <ChannelEconomicsSection>
  │   ├── <RevPerUnitChart />             (C3)
  │   └── <TakeRateTable />               (C4)
  ├── <VolumeMixSection>
  │   ├── <UnitsByTypeStackedBars />      (D1)
  │   ├── <UnitsPerTxnByChannel />        (D2)
  │   ├── <AovByChannel />                (D3)
  │   └── <TypeMixOverTime />             (D4)
  ├── <ConcentrationSection>
  │   ├── <SkuParetoChart />              (E1)
  │   └── <SkuChannelHeatmap />           (E2)
  └── <MomentumSection>
      ├── <ChannelSparklineTable />       (F1)
      └── <RollingTrendChart />           (F2)
```

Each widget component:
- Accepts `{ dateRange, channels, productIds }` from filter context
- Owns its own Convex query hook
- Has its own loading/empty state
- Renders with Recharts (already in deps at `^3.7.0`)

### 4.3 Filter Context

New React context `src/contexts/AnalyticsFilterContext.tsx`:

```ts
interface AnalyticsFilters {
  dateRange: { from: Date; to: Date };
  channels: ChannelName[] | "all";
  productIds: Id<"menuProducts">[] | "all";
  compareVs: "prior-period" | "prior-year" | "none";
}
```

URL-synced (bookmarkable filter states) via query params.

### 4.4 Backend — `convex/reports/unitEconomics.ts`

Single file, multiple named queries — one per widget group to minimize over-fetch:

| Query | Returns | Used by |
|---|---|---|
| `kpiSummary` | 6 KPI values + WoW deltas | A |
| `byWeekday` | 7-day array of `{orders, units}` | B1 |
| `dayHourHeatmap` | 7×8 array of revenue values | B2 |
| `channelEconomics` | per-channel `{revenue, units, revPerUnit, fees, takeRate}` | C3, C4 |
| `volumeByType` | time-series of production-type counts | D1, D4 |
| `unitsPerTxnByChannel` | per-channel units/txn | D2 |
| `aovByChannel` | per-channel `{grossAov, netAov}` | D3 |
| `skuPareto` | top-N SKUs with revenue + cumulative % | E1 |
| `skuChannelMatrix` | SKU × channel revenue share | E2 |
| `channelMomentum` | per-channel `{revenueSpark, unitsSpark, aovSpark, wow}` | F1 |
| `rollingTrend` | daily + 7d + 28d rolling series | F2 |

**Core helper** (shared across queries):

```ts
// convex/reports/productionUnitHelpers.ts
export async function getProductionUnitsPerProduct(
  ctx: QueryCtx
): Promise<Map<Id<"menuProducts">, number>>;
// Returns menuProductId -> total production pcs (Big + Mid + Hazelnut + future)
```

Built by joining `menuProductComponents` → `componentTypes` filtered to `category === "production"` AND `unit === "pcs"`. Summed across all such tier-1 components.

### 4.5 Data Sources

| Metric | Source |
|---|---|
| Revenue (gross/net) | `orders` + `orderItems` + linked external data |
| Orders count | `orders` (non-cancelled) |
| Units | BOM resolution per order item (see 4.4 helper) |
| Platform fees | `orders.platformFee` or equivalent on external data |
| Channels | Existing `externalSource` enum (8 literals) |
| Timestamps | `orders.completedAt` (never `_creationTime`) — per memory rule |

### 4.6 Performance Strategy

- Queries accept `dateRange` narrow enough to bound scans via `by_completedAt` index
- For >90-day windows, add a daily materialized aggregate (deferred to v2 if needed)
- All queries paginate only where result set can exceed ~500 rows (E1/E2 at worst)

---

## 5. Widget Specs

### Row A — KPI Headline (6 tiles)

| # | Metric | Formula | WoW Delta |
|---|---|---|---|
| A1 | Revenue (net) | Σ (grossRevenue − discounts − platformFees − shippingSubsidy) | vs prior period |
| A2 | Units sold | Σ production-unit pcs (dynamic BOM) | vs prior period |
| A3 | AOV (net) | net revenue / order count | vs prior period |
| A4 | Rev / unit | net revenue / units | vs prior period |
| A5 | Orders | count(non-cancelled) | vs prior period |
| A6 | Units / txn | units / orders | vs prior period |

Delta colors: green +, red −. Arrow + percent.

### Row B — Time patterns

**B1 · Weekday Dual-Axis Bars**
- Grouped bars (NOT stacked) — Orders on left y-axis (orange), Units on right y-axis (purple)
- X: Mon–Sun (fixed)
- Respects date filter (aggregates all matching days into 7 buckets)

**B2 · Day × Hour Heatmap**
- 7 rows (Mon–Sun) × 8 columns (3-hour bins: 0–3, 3–6, 6–9, 9–12, 12–15, 15–18, 18–21, 21–24)
- Column labels on top AND bottom
- Row labels on left (weekdays)
- Color intensity = revenue (5-step purple ramp)
- Legend: Low → High

### Row C — Channel economics

**C3 · Revenue per Unit by Channel**
- Bar chart, 6 channels, distinct colors
- Y-axis in Rp
- Tooltip: raw revenue, units, rev/unit

**C4 · Take-Rate Table**
- Columns: Channel, Gross, Fees, Take%, Net/unit
- Sortable headers
- Per channel row

### Row D — Volume & mix

**D1 · Units Stacked by Production Type (over time)**
- Stacked bars, one per day/week (respects date filter granularity)
- Stacks: Big Ball (orange), Mid Ball (purple), Hazelnut (cyan), + future types
- Legend dynamically rendered from production componentTypes (Critical Rule)

**D2 · Units per Txn by Channel**
- Bar chart, 6 channels, with value labels above bars
- X-axis: channel names

**D3 · AOV per Channel (Gross vs Net)**
- Grouped bars per channel: Gross (green) + Net (purple) side-by-side
- Y-axis in Rp

**D4 · Product-Type Mix Over Time**
- Stacked columns, one per week (W1–W7 shown)
- Toggle: 100% stacked / absolute
- Highlights Hazelnut growth trend

### Row E — Concentration

**E1 · SKU Pareto**
- Bars: top 10 SKUs by revenue (Triple, Single, Dubai, Hazelnut, Jumbo, Bite Double, Bite Single, Shopee Bundle 1&2, Other)
- Overlay line: cumulative %
- SKU names from `menuProducts.name`

**E2 · SKU × Channel Heatmap**
- Rows: top SKUs (by revenue)
- Columns: 5 primary channels
- Cell: % of channel revenue from that SKU
- Color intensity proportional to %
- Reveals channel-exclusive SKUs (e.g., Shopee Bundles) and channel-skews (Hazelnut → Direct)

### Row F — Momentum

**F1 · Per-Channel Sparkline Table**
- Rows: each active channel
- Columns: Revenue spark, Units spark, AOV spark, WoW %
- Sparks = 6-point mini bar chart
- WoW colored green/red

**F2 · Rolling Trend**
- Daily revenue bars (orange, faded)
- 7-day rolling line (green)
- 28-day rolling line (purple, dashed)
- Single chart, overlaid

---

## 6. Error & Empty States

| Condition | Behavior |
|---|---|
| No data in filter range | Widget shows "No data for selected filters" with subtle border |
| Convex query pending | Skeleton loader per widget (not page-level) |
| Query error | Red banner with retry button, other widgets still render |
| Date range >365d | Warning chip: "Long ranges may be slower" |

---

## 7. Testing Strategy

### Backend
- `tests/convex/unitEconomics.test.ts` covering:
  - Dynamic production-unit counting (seed Hazelnut, verify it counts)
  - Aggregation correctness (small fixture dataset, hand-verified totals)
  - WoW delta calculation edge cases (zero prior period)
  - Filter composition (channel + product + date all applied)
  - Excludes cancelled orders

### Frontend
- Per-widget unit tests verify props → render
- Integration: filter change → query refetch → widgets update

---

## 8. Success Criteria

- [ ] All 13 widgets render with live data
- [ ] Filter changes update all widgets within 500ms (dev env)
- [ ] Hazelnut sales appear in units-sold metrics (regression guard)
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes
- [ ] Route accessible only to manager + admin roles
- [ ] URL filter state shareable (bookmark test)

---

## 9. Documentation Updates

After merge:
- [ ] `docs/CHANGELOG.md` — new feature entry
- [ ] `docs/API_REFERENCE.md` — new queries in `reports/unitEconomics`
- [ ] `docs/ROADMAP.md` — mark phase complete
- [ ] `CLAUDE.md` Quick File Finder — add "Unit economics" row

---

## 10. Open Questions Resolved

| Q | A |
|---|---|
| Separate page or enhance existing? | New page at `/analytics` |
| Chart library? | Recharts (already in deps) |
| Access control? | `canAccessDashboard` (manager + admin) |
| Payday cycle — hardcode or configurable? | Cut from v1 (widget dropped) |
| Contribution margin in v1? | Cut — platform fee data gaps |
| Product-type counting with Hazelnut? | Dynamic iteration — Critical Rule §3 |

---

## 11. Future Extensions (NOT v1)

- Customer lens: new/returning, cohort retention, LTV
- Contribution margin per channel once fee data is reliable
- Payday cycle overlay as configurable widget
- Anomaly detection (auto-flag WoW drops > threshold)
- Export dashboard as PDF/image
- Weight-normalized "80g-equivalent" unit view as alternative to raw piece count

---

## 12. Implementation Notes for Planner

- **Risk**: Dynamic production-unit iteration must be tested with Hazelnut present — otherwise the bug reappears silently.
- **Risk**: `orders.completedAt` filtering (not `_creationTime`) — follow memory rule.
- **Risk**: Recharts may not natively support dual-axis for B1 — verify before Wave 2.
- **Sequencing**: Backend queries first (Wave 1), then frontend widgets (Wave 2 parallel by row), then filter integration (Wave 3).
- **Pure helper extraction**: `getProductionUnitsPerProduct` as standalone function for unit testing without Convex ctx where possible.

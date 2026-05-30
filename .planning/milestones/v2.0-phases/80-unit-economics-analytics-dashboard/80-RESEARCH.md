# Phase 80: Unit Economics Analytics Dashboard — Research

**Researched:** 2026-04-14
**Domain:** Analytics dashboard (Convex aggregation + Recharts frontend)
**Confidence:** HIGH
**Research mode:** Validation + drift check against existing canonical plan (spec/plan/addendum/review all dated 2026-04-13, so drift window is ~1 day — near-zero).

## Summary

The canonical plan + addendum are **still viable and accurate** against the current codebase as of 2026-04-14. All critical assumptions in the plan — the hardcoded `BIG_BALL`/`MID_BALL` accumulator location, the missing `by_completed_at` index, the absence of analytics helpers in `convex/reports/`, the denormalized `lineTotal` schema, the existing `getWibComponents` helper, and the inline-colors state of `src/lib/platformColors.ts` — were verified true today. **No structural drift since 2026-04-13.** Execute the plan as written with the addendum overrides.

Two small deltas to communicate to the planner:
1. The raw `orders.channel` union has **11 literals**, not 8 as the addendum's comment implies (the 8-display-channel collapse is still correct — it's the input that has more sources).
2. Existing "Sales" nav item uses `canAccessSalesAnalytics` permission, not `canAccessDashboard`. The new Analytics nav entry should follow the phase's own access rule (`canAccessDashboard`), which is stricter (manager+admin only). Don't copy the existing nav entry's permission string verbatim.

**Primary recommendation:** Proceed with execution exactly as specified in 80-01-PLAN (pointer → canonical plan) and 80-02-PLAN (pointer → addendum). No further research needed before implementation.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Critical Rule §3:** All "units sold" metrics MUST iterate every `componentTypes` row where `category === "production"` AND `unit === "pcs"` AND used as a tier-1 component in `menuProductComponents`. Hardcoded BIG_BALL/MID_BALL anywhere is a bug.
- **Performance:** Every analytics query goes through `loadFilteredData` using `by_completed_at` primary index + `by_order_date` legacy fallback + per-order `by_order` item fetch. No full-table scans.
- **Revenue math:** Use denormalized `lineTotal` via `itemNetRevenue`/`itemGrossRevenue`/`itemDiscount` helpers. No manual `quantity * unitPrice - discountAmount`.
- **Reuse, not duplicate:** Extend `src/lib/platformColors.ts` with display-channel aggregates. Reuse `getWibComponents` from `convex/lib/periodRange.ts`. Reuse `by_order` index on orderItems.
- **Channel taxonomy:** 11 raw `orders.channel` literals collapse to 8 display channels (Shopee, Tokopedia, GoFood, K3Mart, Direct, Consignment, TikTok, Other).
- **Hardcoded accumulator at `convex/dispatchPlanner/queries.ts:286` is migrated in T1.6** using `getProductionUnitsByTypePerProduct`. Backward-compat shape preserved (`bigBalls`/`midBalls` still returned) plus new `unitsByType` record.
- **Route:** `/analytics` → `AnalyticsDashboard.tsx`, protected by `canAccessDashboard` (manager + admin).
- **Wave sequencing:** Wave 1 backend (T1–T7 sequential, all append to same file) → Wave 2 frontend (widgets parallel by row) → Wave 3 verification.
- **Chart library:** Recharts `^3.7.0` (already in deps — verified in package.json line 61).
- **Branch:** `gsd/phase-80-unit-economics-analytics-dashboard` (already created per context).
- **Merge:** Squash-merge PR per addendum T16 Step 8.

### Claude's Discretion
- Exact internal organisation of `unitEconomics.ts` (single file, multiple queries — order is an append sequence defined by the plan).
- Minor widget polish (skeleton height, empty-state copy) where not specified.
- Frontend hook naming beyond what the plan shows (`useKpiSummary`, `useByWeekday`, etc. — can follow existing `useSalesAnalytics.ts` conventions).

### Deferred Ideas (OUT OF SCOPE)
- Customer lens (new/returning, cohort retention, LTV)
- Contribution margin per channel (depends on platform-fee data not reliably attributed today)
- Payday cycle (gajian 25th–5th) overlay
- Revenue waterfall per channel
- Per-channel small-multiples panel
- Materialized daily aggregate table

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| A1–A6 KPI row | Revenue net, Units sold, AOV net, Rev/unit, Orders, Units/txn + WoW | `kpiSummary` query in `convex/reports/unitEconomics.ts`; denormalized `lineTotal` from `orderItems`; BOM-resolved units via `getProductionUnitsPerProduct` helper |
| B1 Weekday dual-axis | Orders + Units, NOT stacked | `byWeekday` query using `jakartaMondayIndex(ts)` via `getWibComponents` |
| B2 Day × Hour heatmap | 7×8 (3-hour bins) | `dayHourHeatmap` query + `React.Fragment key={row}` fix from addendum |
| C3 Rev/unit per channel | — | `channelEconomics` query + display-channel colors via `getPlatformPalette` |
| C4 Take-rate table | v1: discount only | `channelEconomics.takePct = discount / gross` |
| D1 Units stacked by production type | Big + Mid + Hazelnut + future | `volumeByType` query iterating `componentTypes` where category=production, unit=pcs |
| D2 Units/txn by channel | — | `unitsPerTxnByChannel` query |
| D3 AOV per channel gross vs net | — | `aovByChannel` query using `itemGrossRevenue` + `itemNetRevenue` |
| D4 Product-type mix over time | — | `volumeByType` with granularity=week |
| E1 SKU Pareto (top 10 + Other) | — | `skuPareto` query with `topN` arg + cumulative% monotonic assertion |
| E2 SKU × Channel heatmap | — | `skuChannelMatrix` query |
| F1 Per-channel sparkline row | Adaptive bucket count | `channelMomentum` query + `pickBucketCount(spanMs)` (7/13/12) |
| F2 Rolling 7d/28d trend | — | `rollingTrend` query + simple moving avg |

## Standard Stack

### Core (all already in repo)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Convex | `^1.31.7` | Backend queries/mutations | In use |
| Recharts | `^3.7.0` | Chart rendering | In use (package.json:61) [VERIFIED: package.json] |
| React Router | `^7.13.0` | `useSearchParams` for URL-synced filters | In use |
| Tailwind | `^4.1.18` | Styling (via shadcn/ui) | In use |
| lucide-react | (installed) | `BarChart3` icon for nav | In use |

### Test infrastructure
| Library | Version | Status |
|---------|---------|--------|
| vitest | `^4.0.18` | In use |
| convex-test | (installed) | Used in `tests/convex/` |
| @testing-library/react | `^16.3.2` | Installed, jsdom environment configured [VERIFIED: vitest.config.ts:9 `environment: 'jsdom'`] |
| @testing-library/jest-dom | `^6.9.1` | Wired in `tests/setup.ts` |
| jsdom | `^27.4.0` | Configured |

**`tests/frontend/` directory does NOT yet exist.** T14.5 must create it. `tests/setup.ts` is minimal (just `@testing-library/jest-dom` + afterEach cleanup).

## Validation Results — Plan Assumptions vs. Current Code

All verified via direct grep/read of live files on 2026-04-14.

| Plan claim | Location | Verified? |
|------------|----------|-----------|
| Hardcoded `BIG_BALL`/`MID_BALL` at `dispatchPlanner/queries.ts:286` | Lines 286–287 and 301–302 (two occurrences in same function) | ✅ EXACT match — T1.6 fix is valid |
| `convex/reports/` has no analytics files | Contains only `dailySales.ts` + `incomeStatement.ts` | ✅ Safe to create new helpers + `unitEconomics.ts` |
| `convex/schema.ts` orders table lacks `by_completed_at` index | Indexes: `by_order_number`, `by_customer`, `by_status`, `by_channel`, `by_status_due_date`, `by_kitchen_visible` | ✅ T1.5 index addition required |
| `orders.completedAt` field exists as optional number | Line 317 | ✅ |
| `orders.orderDate` is required `v.number()` | Line 231 | ✅ `by_order_date` legacy fallback viable |
| `orderItems.lineTotal` is denormalized (post-discount, pre-fees) | Lines 338–339 | ✅ `itemNetRevenue(it) = it.lineTotal` is correct |
| `orderItems.by_order` index exists | Line 367 | ✅ Per-order fetch strategy valid |
| `getWibComponents` in `convex/lib/periodRange.ts` | Line 31 | ✅ Reusable |
| `src/lib/platformColors.ts` uses raw lowercase keys, no display-channel aggregates | Keys: `gobiz`, `k3mart`, `internal`, `grabfood`, `shopee`, `tiktok`, `consignment`, `bigseller` | ✅ Addendum's extension is necessary (no overlap) |
| Recharts 3.7.0 in deps | `package.json:61` | ✅ |
| `Header.tsx` + `MobileBottomNav.tsx` both exist and are nav sources | Confirmed | ✅ T13 dual-edit necessary |
| `canAccessDashboard` permission exists | Used in 7 files incl. `App.tsx`, `Header.tsx` | ✅ |
| `bigBalls`/`midBalls` consumers outside dispatchPlanner | `src/pages/DispatchPlanner.tsx:77,110`, `src/components/kitchen/DashboardHeader.tsx`, `PackagingMixEditor.tsx`, `ProductionTargetsBar.tsx`, `TargetConfigPopover.tsx` | ✅ Backward-compat shape preservation in T1.6 is required (not optional) |

## Drift Since Canonical Plan (2026-04-13 → 2026-04-14)

**None structural.** The plan was written 1 day ago against the current main branch. No phases or refactors have landed in between that touch these files.

Two wording-level nits (not blockers):
1. **Addendum comment says "8 externalSource literals"** — actual `orders.channel` union has 11 literals (shopee, tokopedia, grabfood, k3mart_gf, whatsapp, instagram, legato_tamtem, legato_goldfinch, bazaar, tiktok, other). The 8-**display** channel collapse is what the addendum refers to downstream. Channel taxonomy helper must map all 11 → 8.
2. **Addendum T13 says "find SalesAnalytics link"** — actual nav label is "Sales" (not "SalesAnalytics") and it uses `canAccessSalesAnalytics` permission. The new Analytics entry should use `canAccessDashboard` (manager+admin), NOT copy the existing entry's permission. Icon `BarChart3` is correct; existing Sales uses `TrendingUp`.

## Implementation Gotchas Not Fully Covered by Plan/Addendum

### 1. Convex query count × filter context = reactive cascade
The dashboard fires **11 separate Convex queries** (kpiSummary + 10 widget queries) all reading from the same `loadFilteredData` loader. When a filter changes, all 11 rerun. Two consequences the plan should anticipate:

- **Initial page load:** React 19 + Convex will batch the subscriptions but each query still independently scans `loadFilteredData`. At 11× the indexed scan cost, a wide date range still means significant repeat work. The plan's index-bounded approach keeps each scan to O(orders-in-window) — **acceptable** for 1-year windows in the current dataset (~5k orders/year), but plan the "Long ranges may be slower" warning chip (spec §6).
- **Filter debouncing:** `AnalyticsFilterContext` should debounce date-range slider changes (if one exists) so intermediate values don't trigger 11 queries × N intermediate frames. Preset buttons (7d/30d/etc.) don't need this; a calendar picker/drag does. [ASSUMED — plan doesn't specify; recommend `useDeferredValue` or a ~200ms debounce on URL writes only for continuous inputs.]

### 2. URL state sync edge cases
The plan covers `from`, `to`, `channels`, `productIds` as URL params. Gotchas to handle explicitly:
- **Empty arrays:** `channels=` vs. `channels` absent — both must mean "all". Pick one canonical form (prefer absent).
- **Malformed params:** Invalid `from=abc` should fall back to default range (last 30d), not crash. Wrap `Number.parseInt` with `Number.isFinite` guard.
- **React Router 7 behavior:** `setSearchParams` replaces entire param set by default. When only changing `channels`, preserve `from`/`to`/`productIds`. Use `setSearchParams((prev) => { ... prev, channels })` callback form.

### 3. Convex index bound semantics
`withIndex("by_completed_at", q => q.gte("completedAt", fromTs).lt("completedAt", toTs))` only works when `completedAt` is present. For the legacy fallback `by_order_date` scan, the addendum correctly filters `if (o.completedAt !== undefined) continue` inside the loop so we don't double-count orders that have both fields set. Verify this deduplication via the `seen` set — the addendum already does this with `seen.add(o._id as string)`.

### 4. HAZELNUT_REGULAR seed state
The plan assumes `HAZELNUT_REGULAR` already exists as a `componentTypes` row in production. Regression tests in T14 seed it explicitly. **Verify before merge** via Convex dashboard that prod has this row; if not, seeding must happen before the dashboard renders meaningful Hazelnut data. (Not a blocker — widgets degrade gracefully with empty series.) [ASSUMED — not verified against prod dashboard in this research session.]

### 5. Recharts 3.x dual-axis (B1)
Recharts 3 supports dual-axis via `<YAxis yAxisId="left" />` + `<YAxis yAxisId="right" orientation="right" />` + per-bar `yAxisId`. This is documented and supported. Spec §12 flagged "Recharts may not natively support dual-axis — verify before Wave 2" — **verified supported** [CITED: recharts docs, v3 API unchanged from v2 for `yAxisId`].

### 6. Hook order with Convex reactivity
Each widget owns its own `useQuery` hook. React 19 hook-order rule: **all queries fire before any early `return <Skeleton />`**. In widgets that compose multiple queries (none planned here, each widget = 1 query), ensure the skeleton-or-render switch happens after all hooks. This is already a CLAUDE.md pitfall #9.

### 7. Test file naming — convex-test expects `.test.ts`, not `.test.tsx`
Backend tests in `tests/convex/` all use `.test.ts`. The addendum specifies `tests/convex/unitEconomics.test.ts` and `tests/convex/dispatchPlanner.test.ts` — correct. Frontend smoke tests should use `.test.tsx` because they import JSX components. Ensure `tests/frontend/analytics/*.test.tsx` naming. The existing `tests/setup.ts` is imported by vitest automatically; no additional config needed for frontend JSX tests.

### 8. `tests/frontend/` directory does not exist
The addendum creates three files under `tests/frontend/analytics/`. This directory tree is new. Confirm vitest.config.ts's `include` pattern picks up `tests/**/*.test.{ts,tsx}` (likely does by default, but verify during T14.5 execution).

### 9. `productionType`/`productionUnits` deprecation — stay away
Phase 80 must not read `menuProducts.productionType` or `orderItems.productionType`/`productionUnits` (CLAUDE.md pitfall #11). Grep confirms `convex/dispatchPlanner/` does NOT use them currently (checked). The plan's `getProductionUnitsPerProduct` helper goes through `menuProductComponents` + `componentTypes` — compliant.

### 10. Squash-merge loses commit-per-step audit trail
The addendum's T16 Step 8 recommends squash-merge. This collapses the ~18 commits of the phase into one. Fine for rollback ergonomics, but if something breaks post-merge, the bisection granularity is lost. Alternative: `--rebase` merge to keep individual commits. Phase 80 is substantial (16 tasks, ~11 queries, 13 widgets) — consider rebase-merge unless explicit squash preference. [User decision in CONTEXT.md says squash; respect that.]

## Architecture Patterns

### Query file organization
Single `convex/reports/unitEconomics.ts` with 11 named queries, all sharing the same `loadFilteredData` + `filterArgs` validator. This matches existing `convex/reports/dailySales.ts` and `incomeStatement.ts` single-file-per-report pattern.

### Helper extraction
Three new helper modules under `convex/reports/`:
- `productionUnitHelpers.ts` — BOM-resolved unit counting, single source of truth for Critical Rule §3
- `revenueHelpers.ts` — `itemNetRevenue`/`itemGrossRevenue`/`itemDiscount` (tiny pure functions, testable)
- `channelTaxonomy.ts` — 11→8 channel collapse

### Widget component pattern
```
src/components/analytics/
  AnalyticsFilterBar.tsx     — sticky filter row, writes to URL + context
  KpiRow.tsx                  — 6 tiles, single useKpiSummary hook
  WeekdayDualAxisChart.tsx    — Recharts BarChart with two YAxis
  DayHourHeatmap.tsx          — CSS grid + intensity class (no chart lib)
  RevPerUnitChart.tsx         — BarChart with per-Cell color
  TakeRateTable.tsx           — plain <table>
  UnitsByTypeStackedBars.tsx  — stacked BarChart
  UnitsPerTxnByChannel.tsx    — BarChart with LabelList
  AovByChannel.tsx            — grouped BarChart (gross vs net)
  TypeMixOverTime.tsx         — stacked column + 100%/abs toggle
  SkuParetoChart.tsx          — ComposedChart (bars + line)
  SkuChannelHeatmap.tsx       — CSS grid
  ChannelSparklineTable.tsx   — table with inline mini BarCharts
  RollingTrendChart.tsx       — ComposedChart (bars + 2 lines)
```

Each widget: owns its own hook, its own skeleton, renders independently. Uses `getPlatformPalette(displayChannel).hex` for all channel colors.

### Filter context
```ts
interface AnalyticsFilters {
  dateRange: { from: Date; to: Date };
  channels: DisplayChannel[] | "all";
  productIds: Id<"menuProducts">[] | "all";
  compareVs: "prior-period" | "prior-year" | "none";
}
```
URL params: `from`, `to` (unix ms), `channels` (csv), `products` (csv of Id strings).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Revenue math | Manual `quantity * unitPrice - discountAmount` | `itemNetRevenue(it)` / `itemGrossRevenue(it)` / `itemDiscount(it)` helpers |
| Production-unit counting | Hardcoded `BIG_BALL === "..."` checks | `getProductionUnitsPerProduct(ctx)` iterating componentTypes dynamically |
| Jakarta timezone math | Inline `new Date(ts + 7*60*60*1000)` | `getWibComponents(ts)` from `convex/lib/periodRange.ts` |
| Channel colors | Inline `CHANNEL_COLORS` Record | `getPlatformPalette(displayChannel).hex` from `src/lib/platformColors.ts` (extended in T1) |
| Channel display name | `order.channel === "shopee" ? "Shopee" : ...` | `toDisplayChannel(channel)` from `convex/reports/channelTaxonomy.ts` |
| URL sync | Manual history.pushState | React Router 7 `useSearchParams` |
| WoW delta % | Manual div-by-zero checks | `deltaPct(curr, prior)` helper (returns null when prior=0) |
| Full-table scans | `ctx.db.query("orders").collect()` | `.withIndex("by_completed_at", q => q.gte(...).lt(...))` |

## Common Pitfalls

### Pitfall 1: Ignoring orders with only `orderDate` (legacy)
Some orders never reach terminal status and never have `completedAt` set. The primary `by_completed_at` scan skips them. The addendum's fallback `by_order_date` scan catches them BUT must filter `if (o.completedAt !== undefined) continue` to avoid double-counting, which it does.

### Pitfall 2: Draft + Cancelled orders polluting revenue
`loadFilteredData` excludes `Draft` and `Cancelled` status. Test #2 in T14 guards this. Don't rely on status filtering downstream.

### Pitfall 3: Products with no BOM silently contribute 0 units
A menu product without `menuProductComponents` rows returns 0 from `unitsForOrderItem`. Revenue still counts but units don't. This is correct (they're not production items), but make sure the unit-count widgets don't crash on products missing from `unitsPerProduct` — use `Map.get(id) ?? 0`.

### Pitfall 4: Channel filter uses display name, order.channel is raw
Filter state stores `DisplayChannel[]` (`"Shopee"`, `"Direct"`), but `order.channel` is raw literal (`"shopee"`, `"whatsapp"`). Comparison must go through `toDisplayChannel(o.channel)`. Addendum's `loadFilteredData` does this correctly.

### Pitfall 5: Recharts 3.x `<Cell>` inside `<Bar>` for per-channel color
For single-dimension bar charts (e.g., `UnitsPerTxnByChannel`), need to wrap the `<Bar>` with per-channel `<Cell>` children. Addendum's T11/T12 patch shows the pattern. Without this, all bars get the first color.

### Pitfall 6: WoW delta with prior period = 0
`deltaPct(100, 0)` is undefined mathematically. Return `null`. KpiRow must render `—` (em-dash) for null deltas. Frontend test 1 asserts this.

### Pitfall 7: Pareto "Other" bucket math
If there are exactly 10 SKUs, "Other" is 0. Sum of percentages still must reach 100.0 within float tolerance. Addendum test 8 uses `toBeCloseTo(100, 1)`.

### Pitfall 8: Convex schema regeneration race
After T1.5 adds indexes, `npx convex dev --once` must run before subsequent backend tasks can reference them via `.withIndex("by_completed_at", ...)`. Typescript will red-squiggle otherwise. Addendum documents this step.

### Pitfall 9: `DayHourHeatmap` fragment key warning
React 18+ warns when `<></>` is used in a map. Addendum T10 patch uses `<Fragment key={row}>`. Needed for clean dev console.

### Pitfall 10: Worktree executors don't populate main tree's node_modules
Per Memory/lessons: when executing via a worktree, the main-tree `node_modules` isn't updated. If T16 runs `npm run build` in the main tree, ensure `npm install` ran there too.

## Code Examples

### Dynamic production-unit accumulator (T1 helper)
```typescript
// convex/reports/productionUnitHelpers.ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export async function getProductionUnitsByTypePerProduct(ctx: QueryCtx) {
  const componentTypes = await ctx.db.query("componentTypes").collect();
  const prodTypes = componentTypes.filter(
    (ct) => ct.category === "production" && ct.unit === "pcs"
  );
  const prodTypeMap = new Map<string, Doc<"componentTypes">>();
  for (const ct of prodTypes) prodTypeMap.set(ct._id as string, ct);

  const components = await ctx.db.query("menuProductComponents").collect();
  const byProduct = new Map<Id<"menuProducts">, Map<string, number>>();
  for (const c of components) {
    const ct = prodTypeMap.get(c.componentTypeId as string);
    if (!ct) continue;
    const perType = byProduct.get(c.menuProductId) ?? new Map();
    perType.set(ct.code, (perType.get(ct.code) ?? 0) + c.quantity);
    byProduct.set(c.menuProductId, perType);
  }
  return { byProduct, prodTypes };
}

export async function getProductionUnitsPerProduct(ctx: QueryCtx) {
  const { byProduct } = await getProductionUnitsByTypePerProduct(ctx);
  const totals = new Map<Id<"menuProducts">, number>();
  for (const [id, perType] of byProduct) {
    let sum = 0;
    for (const qty of perType.values()) sum += qty;
    totals.set(id, sum);
  }
  return totals;
}

export function unitsForOrderItem(
  it: Doc<"orderItems">,
  unitsPerProduct: Map<Id<"menuProducts">, number>,
): number {
  if (!it.menuProductId) return 0;
  return (unitsPerProduct.get(it.menuProductId) ?? 0) * it.quantity;
}
```

### Index-bounded loader (T2 core)
See addendum §T2 — already includes the full corrected implementation with dedup via `seen` set.

### WoW delta helper
```typescript
export function deltaPct(curr: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((curr - prior) / prior) * 100;
}
```

## State of the Art

| Old Approach | Current Approach | Why |
|--------------|------------------|-----|
| `order.productionType === "original"` | BOM via `menuProductComponents` + `componentTypes` | `productionType` is deprecated (CLAUDE.md pitfall #11); BOM is the only truth |
| `_creationTime` filter | `completedAt` filter | `_creationTime` = insertion; `completedAt` = business event |
| Full-table `.collect()` then JS filter | `.withIndex("by_X", q => q.gte(...).lt(...))` | Convex scan cost scales with window, not table size |
| Inline `CHANNEL_COLORS` records | `getPlatformPalette(channel).hex` | Single source of truth, already established pattern |
| Inline timezone offset math | `getWibComponents(ts)` | Handles DST-free but leap-year-correct Jakarta math |
| Manual `quantity * unitPrice - discountAmount` | Denormalized `lineTotal` | Changes to discount rules propagate via mutations, not readers |

## Project Constraints (from CLAUDE.md)

- **Pitfall #11:** Never use `productionType`/`productionUnits` — derive from BOM. (Plan compliant via `getProductionUnitsPerProduct`.)
- **Pitfall #13:** "Units sold" counts BOM balls, not product quantity. (Plan compliant — all unit metrics multiply by BOM-resolved `unitsPerProduct`.)
- **Pitfall #1:** Convex IDs are typed strings (`Id<"menuProducts">`). (Plan uses these consistently.)
- **Pitfall #2:** Convex queries return `undefined` while loading. (Plan: per-widget skeletons.)
- **Pitfall #4:** Real-time updates automatic — no cache invalidation. (Plan relies on Convex reactivity, correct.)
- **Pitfall #8:** No dynamic imports in Convex. (Plan uses static imports only.)
- **Pitfall #9:** Hooks before conditional returns. (Frontend widgets already follow.)
- **Pitfall #10:** Protected mutations need `token: v.string()`. (N/A — Phase 80 is all queries, no mutations. Access control is route-level via `canAccessDashboard`.)
- **Pitfall #12:** Branch from main before new phase. (Already on `gsd/phase-80-...` per context.)
- **Pitfall #14:** Phase dir name ≤50 chars. (`80-unit-economics-analytics-dashboard` = 36 chars ✓)
- **Git workflow:** No direct commits to main, feature branch, `npm run build` must pass. (Plan compliant.)
- **Docs:** CHANGELOG.md always updated after merge; SCHEMA.md if schema changed (yes — T1.5 adds indexes); API_REFERENCE.md for new backend queries (yes — `unitEconomics.*`); ROADMAP.md to mark phase complete. (Plan's T16 covers all.)
- **Planning template:** Git Workflow + Waves + Docs + Success Criteria all present in canonical plan + addendum.

## Runtime State Inventory

Not applicable — this phase is greenfield feature work, not a rename/refactor/migration.

## Environment Availability

Not applicable — phase is code-only (new Convex queries + React components). All dependencies (Convex, Recharts, React Router 7, Tailwind, shadcn, vitest, testing-library, jsdom) already installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^4.0.18` + convex-test + @testing-library/react 16 + jsdom |
| Config file | `vitest.config.ts` (environment: jsdom, setup: `tests/setup.ts`) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` (same — no e2e in phase scope) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Command | File Exists? |
|--------|----------|-----------|---------|--------------|
| Critical Rule §3 | Hazelnut counted in units | integration | `npm run test -- unitEconomics` | ❌ Wave 3 |
| Draft/Cancelled excluded | kpiSummary filter | integration | `npm run test -- unitEconomics` | ❌ Wave 3 |
| WoW delta edge | prior period = 0 → null | integration | `npm run test -- unitEconomics` | ❌ Wave 3 |
| Channel filter | aggregation restricted | integration | `npm run test -- unitEconomics` | ❌ Wave 3 |
| byWeekday | 7 buckets, Jakarta-local | integration | `npm run test -- unitEconomics` | ❌ Wave 3 |
| volumeByType Hazelnut | distinct series | integration | `npm run test -- unitEconomics` | ❌ Wave 3 |
| channelEconomics takePct | math correctness | integration | `npm run test -- unitEconomics` | ❌ Wave 3 |
| skuPareto | top10+Other, monotonic cumPct | integration | `npm run test -- unitEconomics` | ❌ Wave 3 |
| rollingTrend | 7d windowing | integration | `npm run test -- unitEconomics` | ❌ Wave 3 |
| dispatchPlanner Hazelnut | regression guard | integration | `npm run test -- dispatchPlanner` | ❌ Wave 3 (new file) |
| KpiRow render | skeleton + tiles | frontend unit | `npm run test -- KpiRow` | ❌ Wave 3 |
| AnalyticsFilterBar | URL sync | frontend unit | `npm run test -- AnalyticsFilterBar` | ❌ Wave 3 |
| WeekdayDualAxisChart | renders SVG | frontend unit | `npm run test -- WeekdayDualAxisChart` | ❌ Wave 3 |

### Sampling Rate
- **Per task commit:** Run affected test file (`npm run test -- <pattern>`)
- **Per wave merge:** Full `npm run test`
- **Phase gate:** `npm run type-check && npm run build && npm run test` all green

### Wave 0 Gaps
- [ ] Create `tests/frontend/` directory (does not exist yet)
- [ ] Create `tests/convex/unitEconomics.test.ts`
- [ ] Create `tests/convex/dispatchPlanner.test.ts` (new file per addendum)
- [ ] Create `tests/frontend/analytics/` with 3 smoke test files
- [ ] Verify vitest picks up `tests/**/*.test.tsx` — likely via default glob in vitest.config.ts (confirm during T14.5)

*(No framework install needed — jsdom, testing-library, jest-dom all present.)*

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes (indirect) | Route protected by `<ProtectedRoute permission="canAccessDashboard">`; Convex queries rely on existing auth context |
| V3 Session Management | yes | Existing PIN+token session pattern via `AuthContext` |
| V4 Access Control | yes | `canAccessDashboard` = manager + admin only; verified in `ProtectedRoute` wrapper |
| V5 Input Validation | yes | Convex `v.number()`, `v.optional(v.array(v.string()))` validators on `fromTs`/`toTs`/`channels`/`menuProductIds`; URL params validated with `Number.isFinite` guard |
| V6 Cryptography | no | No new secrets, tokens, or crypto — pure read-only aggregation |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Client-side filter bypass (user edits URL to bypass channel restriction) | Spoofing | Convex queries take filter args from client — this is the designed flow. Access control is role-level (manager+admin only). Users who can access `/analytics` at all can see ALL channels anyway. No per-channel permission exists. |
| Massive date-range DoS | DoS | `loadFilteredData` uses indexed bounds — cost scales with rows in window. No explicit server-side max span enforced. Consider soft cap (e.g., reject `toTs - fromTs > 730 days`) if needed. [ASSUMED — not in plan; not critical for MVP.] |
| SQL-like injection via `menuProductIds` | Tampering | `v.id("menuProducts")` validator enforces type — invalid IDs rejected by Convex runtime |
| XSS via chart tooltips | Tampering | Recharts escapes by default; product names pass through `formatCurrency`/plain text — no `dangerouslySetInnerHTML` anywhere |
| Permission escalation via `ProtectedRoute` bypass | Elevation | `canAccessDashboard` is checked in `ProtectedRoute`; Convex queries don't enforce role (read-only + no sensitive PII beyond order aggregates) — **consider** adding `requireRole(ctx, token, ["manager", "admin"])` to queries if strict backend gate is needed. [ASSUMED — plan does not add this; route-level gate is consistent with other analytics pages.] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | HAZELNUT_REGULAR componentType row exists in production (not just dev) | Implementation Gotcha #4 | Widgets render empty Hazelnut series; not broken, just visually incomplete until seed |
| A2 | Filter debouncing not strictly required — preset buttons + discrete multiselect are the main interactions | Implementation Gotcha #1 | Slight perf overhead on continuous controls; not a correctness issue |
| A3 | Frontend widgets don't need `requireRole` guard at query level — route gate is sufficient | Security Domain | Very low — analytics aggregates don't expose sensitive PII beyond what existing SalesAnalytics already exposes |
| A4 | vitest default glob picks up `tests/**/*.test.tsx` | Validation Architecture | Tests not collected; config tweak during T14.5 if needed |
| A5 | Recharts 3.x dual-axis API unchanged from 2.x (`yAxisId` on YAxis + Bar) | Gotcha #5 | Very low — spot-check during B1 implementation, pivot to single-axis + second chart if broken |
| A6 | Squash-merge is the intended strategy (per user context) | Gotcha #10 | Low — is a reversible merge-strategy choice, not a code risk |

## Open Questions

1. **Soft cap on date range span?**
   - What we know: spec §6 mentions "warning chip" for >365d, but no hard rejection.
   - What's unclear: whether to enforce at query level.
   - Recommendation: UI warning chip only; no server enforcement for v1. Revisit if a user tries 5-year ranges and hits Convex query timeout.

2. **Should Convex queries also call `requireRole`?**
   - What we know: existing analytics queries (`reports/dailySales.ts`, `incomeStatement.ts`) rely on route-level gate.
   - What's unclear: whether Phase 80 should add backend role check or match the existing pattern.
   - Recommendation: match existing pattern (no role check in query). Keeps the phase scope tight. If a future security review demands it, add in a follow-up.

3. **Frontend test strategy for widgets that `useQuery` directly?**
   - What we know: Addendum's T14.5 Test 1 mocks `useKpiSummary` via `vi.mock`. Implies widgets import hooks from `@/hooks/convex/useAnalytics`.
   - What's unclear: if widgets instead use `useQuery(api....)` directly, the mock pattern changes.
   - Recommendation: standardize on `useAnalytics.ts` barrel of typed hooks (matches existing `useSalesAnalytics.ts` pattern). This is already implied by the plan.

## Sources

### Primary (HIGH confidence — verified this session)
- `convex/dispatchPlanner/queries.ts:250-312` — hardcoded BIG_BALL/MID_BALL accumulator confirmed
- `convex/schema.ts:255-325` — orders table, channel union (11 literals), `completedAt: v.optional(v.number())`, index list (no by_completed_at)
- `convex/schema.ts:327-367` — orderItems table, `lineTotal/lineCost/lineMargin` denormalized, `by_order` index present
- `convex/lib/periodRange.ts:31` — `getWibComponents` helper exists
- `convex/reports/` — directory listing (only dailySales.ts + incomeStatement.ts)
- `src/lib/platformColors.ts` — 8 raw-source keys, no display aggregates
- `src/components/layout/{Header.tsx,MobileBottomNav.tsx}` — both contain SalesAnalytics/Sales nav entries
- `package.json` — recharts ^3.7.0, vitest ^4.0.18, @testing-library/react ^16.3.2, jsdom ^27.4.0
- `vitest.config.ts` — jsdom environment
- `tests/setup.ts` — minimal (jest-dom + cleanup)

### Secondary (reference docs)
- Recharts v3 docs — dual-axis `yAxisId` pattern [CITED: recharts.org/en-US/api/YAxis]
- React Router v7 `useSearchParams` callback form
- CLAUDE.md pitfalls #1, #9, #11, #13 — project-specific rules

### Tertiary
- None — no web searches needed; this is an in-codebase validation phase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libs verified in package.json
- Architecture: HIGH — canonical plan + addendum are 1 day old, directly validated against live files
- Pitfalls: HIGH — cross-referenced with CLAUDE.md and verified against current code state

**Research date:** 2026-04-14
**Valid until:** 2026-04-28 (14 days — plan references live file paths and line numbers; refresh if significant changes land in `convex/dispatchPlanner/`, `convex/schema.ts`, or `src/lib/platformColors.ts` before execution starts)

---

## RESEARCH COMPLETE

**Phase:** 80 — Unit Economics Analytics Dashboard
**Confidence:** HIGH

### Key Findings
- Canonical plan + addendum (dated 2026-04-13) remain accurate against main as of 2026-04-14. Zero structural drift.
- All referenced line numbers, indexes, helpers, and file paths verified present (or verified absent where the plan creates them).
- `convex/dispatchPlanner/queries.ts:286-287 + 301-302` hardcoded BIG_BALL/MID_BALL confirmed — T1.6 migration valid.
- `orders` table lacks both `by_completed_at` and `by_order_date` indexes — T1.5 schema additions valid.
- `src/lib/platformColors.ts` has only raw-source keys; addendum's display-channel extension (Shopee, Direct, etc.) is necessary and non-overlapping.
- Frontend test infra (jsdom + testing-library + jest-dom) fully installed; `tests/frontend/` directory does not yet exist and must be created in T14.5.
- Two minor corrections for the planner: `orders.channel` union has 11 literals (not 8 as addendum comment implies); existing "Sales" nav uses `canAccessSalesAnalytics` (new Analytics entry should use `canAccessDashboard` per spec, not copy).

### File Created
`.planning/phases/80-unit-economics-analytics-dashboard/80-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All libs verified in package.json + vitest.config.ts |
| Architecture | HIGH | Plan validated line-by-line against live code |
| Pitfalls | HIGH | Cross-referenced CLAUDE.md + grep'd actual consumers of bigBalls/midBalls |

### Open Questions
See "Open Questions" section — 3 low-stakes decisions (date-range cap, backend role check, hook barrel organization). None block execution; all have documented recommendations.

### Ready for Planning
Planner should proceed with the existing 80-01-PLAN (pointer → `docs/superpowers/plans/2026-04-13-unit-economics-analytics-dashboard.md`) and 80-02-PLAN (pointer → ADDENDUM). No plan rewrite needed. Flag the two minor corrections (11-literal channel union, nav permission) to the executor.

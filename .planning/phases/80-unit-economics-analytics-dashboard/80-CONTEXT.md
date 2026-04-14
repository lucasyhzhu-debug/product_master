# Phase 80: Unit Economics Analytics Dashboard — Context

**Gathered:** 2026-04-13
**Revised:** 2026-04-14 — Added cross-channel unification (Task 4b) after discovering Shopee/TikTok/Tokopedia/consignment sales bypass orders/orderItems.
**Status:** Ready for execution AFTER Phase 79 merges to main (hard dependency — Task 4b blocks without it).
**Milestone:** v2.0 Financial Management & Data Quality (last phase)
**Depends on:** Phase 79 (Shopee Item-Level Revenue) — populates `externalRevenueItems.linkedMenuProductId` which Task 4b reads.

## Source Artifacts

| Artifact | Path |
|---|---|
| Design spec | `docs/superpowers/specs/2026-04-13-unit-economics-analytics-dashboard-design.md` |
| Implementation plan | `docs/superpowers/plans/2026-04-13-unit-economics-analytics-dashboard.md` |
| Plan addendum (staff review fixes) | `docs/superpowers/plans/2026-04-13-unit-economics-analytics-dashboard-ADDENDUM.md` |
| Staff review | `docs/reviews/staffreview-unit-economics-analytics-dashboard-2026-04-13.md` |
| Visual brainstorm mockups | `.superpowers/brainstorm/512192-1776071087/content/dashboard-mockup-v3.html` |

**Read these in order:** spec → plan → addendum → review.

<domain>
## Phase Boundary

New `/analytics` page with 13 widgets covering unit economics across 6 lenses:
- **A · KPIs** — 6 tiles (Revenue net, Units sold, AOV, Rev/Unit, Orders, Units/Txn) with WoW deltas
- **B · Time patterns** — Weekday dual-axis (orders + units), Day×Hour heatmap (3-hour bins)
- **C · Channel economics** — Rev/unit per channel, Take-rate table
- **D · Volume & mix** — Units stacked by production type, Units/txn by channel, AOV gross vs net, Product-type mix over time
- **E · Concentration** — SKU Pareto (top 10 + Other), SKU × Channel heatmap
- **F · Momentum** — Per-channel sparkline row, Rolling 7d/28d trend

Filterable globally by date range, channel multi-select, and product multi-select. URL-synced for bookmarkable views.

Read-only over existing data — no schema changes except a new `by_completed_at` index on orders.

</domain>

<decisions>
## Implementation Decisions

### Critical Rule §3 — Dynamic Production Unit Counting
All "units sold" metrics MUST iterate every `componentTypes` row where `category === "production"` AND `unit === "pcs"` AND used as a tier-1 component in `menuProductComponents`. Today: `BIG_BALL`, `MID_BALL`, `HAZELNUT_REGULAR`. Future production types must be counted automatically.

The existing hardcoded `BIG_BALL`/`MID_BALL` accumulator in `convex/dispatchPlanner/queries.ts:286` violates this rule and is migrated as part of this phase (Task 1.6).

### Performance — Index-Bounded Loader
Every analytics query goes through `loadFilteredData` which uses `by_completed_at` (primary) and `by_order_date` (legacy fallback) indexes on orders, plus `by_order` for per-order item fetches. Eliminates the 11× full-table-scan footprint that the naive implementation would create.

### Revenue Math — Use Denormalized lineTotal
Schema already stores `lineTotal = quantity * unitPrice - discountAmount` (post-discount, pre-fees). All analytics use `itemNetRevenue(it)` / `itemGrossRevenue(it)` / `itemDiscount(it)` helpers — no manual recomputation.

### Reuse, Not Duplicate
- `src/lib/platformColors.ts` extended with display-channel aggregates (`Shopee`, `Direct`, `GoFood`, etc.) — single color source
- `convex/lib/periodRange.ts:getWibComponents` reused for all Jakarta-timezone date math
- Convex `by_order` index on orderItems reused for per-order fetches

### Channel Taxonomy
Raw `orders.channel` literals (11 total) collapse into 8 display channels:
- `shopee` → Shopee
- `tokopedia` → Tokopedia
- `grabfood` → GoFood
- `k3mart_gf` → K3Mart
- `whatsapp`, `instagram` → Direct
- `legato_tamtem`, `legato_goldfinch`, `bazaar` → Consignment
- `tiktok` → TikTok
- `other`/unknown → Other

**Parallel mapping for external sources** (Task 4b — `externalRevenueItems.source`): 8 `externalSource` literals (`k3mart | gobiz | internal | grabfood | bigseller | consignment | shopee | tiktok`) collapse into the same 8 display channels via `externalSourceToDisplayChannel`. `gobiz`/`internal` sources are skipped at the loader layer — those rows already have `orders` twins and would double-count (R5).

### Cross-Channel Unification (Task 4b — added 2026-04-14)
**Discovery:** Shopee/TikTok/Tokopedia/consignment sales write to `externalRevenue` + `externalRevenueItems`, NOT to `orders`/`orderItems`. Without this unification, 7 of 13 widgets (KPI units, SKU Pareto, SKU×Channel, channel rev/unit, AOV per channel, take-rate, units stacked) are broken for marketplace channels.

**Solution:** `loadFilteredData` (Task 4b) merges both sources into a single `UnifiedItem` stream:
- Internal items from `orderItems` (existing path)
- External items from `externalRevenueItems` (joined to `externalRevenue` for date + channel)
- `UnifiedItem.menuProductId` = `externalRevenueItems.linkedMenuProductId` (populated by Phase 79)
- Unmatched external items (no `linkedMenuProductId`) counted in `unmatchedExternalItems` diagnostic
- Returns excluded (`externalRevenue.transactionType === "return"`)
- External rows carry `discountAmount = 0` (marketplace fees deferred to v2 contribution-margin lens per D-C4)

**Handshake with Phase 999.4:** Phase 80 shares `externalRevenueItems.linkedMenuProductId` with the future unified inventory deduction phase (999.4). Phase 80's `channelTaxonomy.ts` and `productionUnitHelpers.ts` are reusable primitives for 999.4.

### Deferred to v2 (Explicitly Out of Scope)
- Customer lens (new/returning, cohort retention, LTV)
- Contribution margin per channel — depends on platform-fee data not reliably attributed today
- Payday cycle (gajian 25th–5th) overlay
- Revenue waterfall per channel
- Per-channel small-multiples panel
- Materialized daily aggregate table

</decisions>

<requirements>
## Requirements (from spec)

| Lens | Widget | Original ask | Notes |
|---|---|---|---|
| A | 6 KPI tiles | — | WoW deltas on each |
| B1 | Weekday dual-axis bars | ✅ user | Orders + Units, NOT stacked |
| B2 | Day × Hour heatmap | ✅ Claude | 3-hour bins, axis labels top + bottom |
| C3 | Rev/unit per channel | — | |
| C4 | Take-rate table | — | v1: discount only (fees deferred) |
| D1 | Units stacked by production type | ✅ user | Big + Mid + Hazelnut + future |
| D2 | Units / txn by channel | ✅ user | Channel name labels |
| D3 | AOV per channel (gross vs net) | ✅ user | |
| D4 | Product-type mix over time | — | Stacked column with %/abs toggle |
| E1 | SKU Pareto (top 10 + Other) | — | Named SKUs incl. Triple/Single/Dubai/Hazelnut/Shopee bundles |
| E2 | SKU × Channel heatmap | — | Reveals channel-exclusive SKUs |
| F1 | Per-channel sparkline row | — | Adaptive bucket count by window span |
| F2 | Rolling 7d/28d trend | — | Daily bars + 2 rolling lines |

</requirements>

<success-criteria>
## Success Criteria

1. Manager/admin opens `/analytics` and sees all 13 widgets render with live data
2. Hazelnut sales appear in `units` metric (regression-guarded by integration test)
3. `volumeByType` query returns a `HAZELNUT_REGULAR` series (regression-guarded by integration test)
4. `dispatchPlanner.getProductionRequirements` `unitsByType` includes `HAZELNUT_REGULAR` (regression-guarded)
5. `by_completed_at` index exists on orders (verify via `convex dashboard`)
6. Date / channel / product filter changes reflect in every widget
7. URL filter state shareable — pasting `/analytics?from=X&to=Y&channels=Shopee,Direct` restores view
8. Nav link present in BOTH `Header.tsx` and `MobileBottomNav.tsx`
9. Route protected by `canAccessDashboard` permission (manager + admin only)
10. `npm run type-check` + `npm run build` + `npm run test` all pass
11. **Shopee/TikTok/Tokopedia sales show up in every widget** (regression-guarded by integration test — a Shopee `externalRevenueItems` row flows into `kpiSummary`, `skuPareto`, `channelEconomics`, `volumeByType`) — closes the cross-channel gap discovered 2026-04-14
12. **No double-counting** — an `externalRevenue` row with `source === "gobiz"` does NOT contribute units when its `orders` twin is already counted (regression-guarded by integration test)

</success-criteria>

<test-coverage>
## Test Coverage (10 backend + 3 frontend)

### Backend integration tests (`tests/convex/unitEconomics.test.ts`)
1. `kpiSummary` — Hazelnut counted in units (regression guard for Critical Rule §3)
2. `kpiSummary` — excludes Draft and Cancelled orders
3. `kpiSummary` — WoW delta uses prior period of equal span (+100% case)
4. `kpiSummary` — channel filter restricts aggregation
5. `byWeekday` — 7 buckets with correct Jakarta-local weekday placement
6. `volumeByType` — Hazelnut appears as distinct series
7. `channelEconomics` — takePct = discount / gross math
8. `skuPareto` — top 10 + Other, cumulativePct monotonic 0→100
9. `rollingTrend` — rolling7[i] = mean of last 7 daily values

### Backend regression test (`tests/convex/dispatchPlanner.test.ts`)
10. `getProductionRequirements` — returns `unitsByType.HAZELNUT_REGULAR` when Hazelnut orders present

### Cross-channel unification tests (Task 4b additions — `tests/convex/unitEconomicsCrossChannel.test.ts`)
11. `kpiSummary` — a Shopee `externalRevenueItems` row (source=shopee, linkedMenuProductId set) contributes to `current.units` AND `current.netRevenue`
12. `kpiSummary` — a `source="internal"` external row is SKIPPED when its `orders` twin already exists (no double-count — R5 applies ONLY to internal, not gobiz)
12b. `kpiSummary` — a `source="gobiz"` external row CONTRIBUTES (gobiz has no orders twin — skipping it would zero out GoFood revenue)
12c. `kpiSummary` — a row with `transactionDate` in-window but `periodStart` outside the window IS included (validates 31-day periodStart scan widening)
13. `skuPareto` — Shopee item with matched `linkedMenuProductId` appears in the top-N list
14. `channelEconomics` — Shopee externalRevenueItems contribute to the "Shopee" row; gobiz contributes to "GoFood" row; neither appears as "bigseller" or "Other"
15. `loadFilteredData` — returns `unmatchedExternalItems > 0` when a Shopee item lacks `linkedMenuProductId` (diagnostic check)
16. `kpiSummary` — rows with `transactionType="return"` are EXCLUDED from positive units (regression guard for returns filter)
17. `kpiSummary` + `channelEconomics` + `skuPareto` + `volumeByType` + `unitsPerTxnByChannel` — R5 internal-skip is symmetric: all 5 queries return single-count not double-count for an orders row + internal twin pair

**Critical corrections applied 2026-04-14 (staffreview):**
- R5 skip rule: `internal` ONLY, NOT `gobiz` (gobiz has no orders twin; skipping it would zero out GoFood)
- `externalSourceToDisplayChannel("gobiz")` returns `"GoFood"`, NOT `"Direct"` (gobiz IS GoFood via GoBiz merchant app)
- `loadFilteredData` returns `unifiedItems` ONLY (NOT both `orderItems` + `unifiedItems`) — R7 prevents copy-paste landmine
- External scan widens `by_period` index by 31 days then post-filters on `transactionDate ?? periodStart` — fixes the "late-transactionDate row missed" bug
- `revenueHelpers` retyped via `RevenueBearing` structural interface so both `Doc<"orderItems">` and `UnifiedItem` pass through unchanged

### Frontend smoke tests (`tests/frontend/analytics/`)
1. `KpiRow` — loading state + render with mock data + null-delta handling
2. `AnalyticsFilterBar` — clicking 7d preset writes `from`+`to` into URL
3. `WeekdayDualAxisChart` — renders SVG with mock data, skeleton when loading

</test-coverage>

<execution-notes>
## Execution Notes

### Wave Order
Wave 1 (Backend) → Wave 2 (Frontend) → Wave 3 (Verification). Within Wave 1, T1–T7 are sequential because they all append to `convex/reports/unitEconomics.ts`. Within Wave 2, widgets parallelize naturally.

### Branch
Use this phase's GSD branch: `gsd/phase-80-unit-economics-analytics-dashboard` (already created). Final merge to main via squash-merge per addendum T16 Step 8.

### Subagent Recommendation
- T1, T1.5, T1.6, T2–T7 → `convex-backend`
- T8–T13 → `react-ui-builder` (T10–T12 can parallelize by row)
- T14, T14.5 → `tdd-test-architect`
- T15 → `code-auditor`
- T16 → Bash + human commit

### Known Caveat
A branch-switching hook in this workspace has been observed swapping the working branch mid-edit. Disable or audit the hook before execution begins to avoid losing work.

</execution-notes>

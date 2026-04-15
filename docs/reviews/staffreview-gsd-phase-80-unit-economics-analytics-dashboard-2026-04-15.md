---
reviewer: Claude (staffreview, post-implementation)
phase: 80-unit-economics-analytics-dashboard
branch: gsd/phase-80-unit-economics-analytics-dashboard
base: 8e361405
reviewed_at: 2026-04-15
artifacts_read:
  - .planning/phases/80-unit-economics-analytics-dashboard/80-CONTEXT.md
  - .planning/phases/80-unit-economics-analytics-dashboard/80-01-PLAN.md
  - .planning/phases/80-unit-economics-analytics-dashboard/80-02-PLAN.md
  - .planning/phases/80-unit-economics-analytics-dashboard/80-01-SUMMARY.md
  - .planning/phases/80-unit-economics-analytics-dashboard/80-02-SUMMARY.md
  - .planning/phases/80-unit-economics-analytics-dashboard/80-REVIEW.md
  - .planning/phases/80-unit-economics-analytics-dashboard/80-REVIEW-FIX.md
  - docs/superpowers/specs/2026-04-13-unit-economics-analytics-dashboard-design.md
  - docs/superpowers/plans/2026-04-13-unit-economics-analytics-dashboard.md
  - docs/superpowers/plans/2026-04-13-unit-economics-analytics-dashboard-ADDENDUM.md
  - convex/reports/unitEconomics.ts
  - convex/reports/productionUnitHelpers.ts
  - convex/reports/revenueHelpers.ts
  - convex/reports/channelTaxonomy.ts
  - convex/dispatchPlanner/queries.ts
  - convex/schema.ts (indexes)
  - src/contexts/AnalyticsFilterContext.tsx
  - src/components/analytics/AnalyticsFilterBar.tsx
  - src/pages/AnalyticsDashboard.tsx
  - src/hooks/convex/useAnalytics.ts
  - src/components/analytics/* (14 widgets)
  - tests/convex/unitEconomics.test.ts
  - tests/frontend/analytics/*.test.tsx
findings:
  critical: 1
  important: 3
  minor: 4
  nitpick: 3
status: approve_with_changes
---

# Phase 80 — Staff Review (Post-Implementation)

## Summary

Phase 80 ships a credible v1 of the unit-economics analytics dashboard. The architecture is sound: a single index-bounded loader, denormalized `lineTotal` revenue helpers, dynamic BOM iteration for production counting (Pitfall #11 closure landed in both `unitEconomics` and the migrated `dispatchPlanner`), and URL-synced filter state. The six warnings from the prior code review (WR-01..WR-06) are all genuinely fixed — not just rubber-stamped. Hazelnut regression is test-guarded in `volumeByType` and `kpiSummary`.

That said, three material gaps from plan-to-implementation need attention before merge:

1. **Product multi-select UI was planned + backend-wired but never built.** The filter bar only ships date presets + channel checkboxes. Backend accepts `menuProductIds`; the only way to populate it today is hand-editing the URL. This contradicts the spec ("Global filter bar (date range, channel multi-select, product multi-select)") and Success Criterion #6 ("Date / channel / product filter changes reflect in every widget").
2. **`orderCount` is not product-filter-aware** — a subtle correctness bug. `loadFilteredData` filters *items* by `productSet` but orders stay unfiltered. Result: when a user filters by a single product, `kpiSummary.orderCount`, `aovNet`, `aovGross`, and `unitsPerTxn` silently use the denominator of **all** orders in the window (many of which did not contain that product). AOV and units/txn both break.
3. **dispatchPlanner Hazelnut regression test was explicitly scoped (Success Criterion #4, Addendum Test #10) and deferred by the executor** with the reasoning "the dynamic BOM behavior is already covered by the volumeByType Hazelnut test." That's a reasonable engineering judgement, but the stated success criteria say otherwise. Either backfill the test or drop the criterion from the phase.

None of these block the dashboard from being useful today for a channel+date analyst. All three are cheap to fix.

Build, type-check, and the 14 new tests pass. `npx tsc -b` passes (previously latent `@convex/*` alias resolution surfaced and was fixed via WR-04). No new security or privacy exposure.

Recommendation: **Approve with changes** — fix Critical C-01 (product-filter aware denominator) before merge; treat I-02 (missing product UI) and I-03 (missing dispatchPlanner regression test) as must-do follow-ups (either in this phase or an immediate 80.1 cleanup phase, not backlog). Everything else is polish.

---

## Critical Issues

### C-01 · `orderCount` ignores product filter → AOV / units-per-txn incorrect when product filter is applied

**File:** `convex/reports/unitEconomics.ts:67-110` (`loadFilteredData`) and `127-154` (`computeKpis`)

`loadFilteredData` filters orders by channel, then fetches items per order, then filters items by `productSet`. The returned `orders` array is the channel-filtered set — **not** the product-filtered set. Every per-order aggregator (`kpiSummary.orderCount`, `aovGross`, `aovNet`, `unitsPerTxn`; `channelEconomics.orderCount`; `unitsPerTxnByChannel`; `aovByChannel`; `channelMomentum.orders[idx]`) then divides product-filtered numerators by an unfiltered denominator.

Concrete failure mode: a user selects product "Hazelnut Single" to see its economics. Numerator (revenue, units) is correct — Hazelnut only. Denominator (order count) includes every Shopee/Direct/GoFood order in the window, whether or not it contained Hazelnut. AOV collapses toward zero; units/txn collapses; Rev/unit is still correct only because it divides by units not orders.

**Fix:** In `loadFilteredData`, after building `items`, rebuild `orders` as the distinct set of order IDs that contributed an item (when `productSet` is non-null). Something like:

```ts
let filteredOrders = orders;
if (productSet) {
  const orderIdsWithMatchingItem = new Set(items.map((it) => it.orderId as string));
  filteredOrders = orders.filter((o) => orderIdsWithMatchingItem.has(o._id as string));
}
return { orders: filteredOrders, items, orderById, unitsPerProduct };
```

Add a regression test: "product filter restricts orderCount to orders containing that product" — same skeleton as the existing channel-filter test.

This is the only correctness bug I'd block merge on. Until the product filter UI lands (I-02) the bug is dormant, but merging the UI without this fix means shipping an analytics page that silently lies when a product is selected.

---

## Important

### I-02 · Product multi-select UI missing — spec + success criterion unmet

**Files:** `src/components/analytics/AnalyticsFilterBar.tsx` (UI), `src/contexts/AnalyticsFilterContext.tsx` (state exists), `convex/reports/unitEconomics.ts` (backend wired)

Spec §"Global filter bar" explicitly requires product multi-select. Plan `docs/superpowers/plans/2026-04-13-unit-economics-analytics-dashboard.md:1002`–`1034` plumbs `menuProductIds` through the context. Backend `filterArgs` accepts `menuProductIds: v.optional(v.array(v.id("menuProducts")))`. The UI renders no product picker.

The 80-01 summary does not flag this as a deviation. It should have been. This is ~40 LOC of work (Popover + MenuProducts query + multi-select list — same pattern as the channel checkboxes) and unlocks the documented behavior.

Fix together with C-01 or the feature ships half-built.

### I-03 · dispatchPlanner Hazelnut regression test deferred without phase-level signoff

**File missing:** `tests/convex/dispatchPlanner.test.ts`

Success Criterion #4 in `80-CONTEXT.md`: *"`dispatchPlanner.getProductionRequirements` `unitsByType` includes `HAZELNUT_REGULAR` (regression-guarded)."* Addendum Test #10 specifies this test as a required deliverable. `80-01-SUMMARY.md` "Follow-ups / known limitations" admits it wasn't written and justifies the deferral via adjacency to `volumeByType` coverage. That's a reasonable argument but the addendum author disagreed, and this is the **one** test guarding the `dispatchPlanner` migration itself — if someone regresses the `byProduct` iteration in that file to a hardcoded BIG_BALL/MID_BALL block tomorrow, the `volumeByType` test won't catch it because `volumeByType` calls `getProductionUnitsByTypePerProduct` directly, not through `dispatchPlanner`.

Fix: write the test. The helper scaffolding in `tests/convex/unitEconomics.test.ts` (`seedBaseFixtures`, `seedMenuProduct`) is already reusable — move them to `tests/convex/helpers.ts` and reuse. Exercise `api.dispatchPlanner.getProductionRequirements` with a Hazelnut product order, assert `result.unitsByType.HAZELNUT_REGULAR > 0`, and also assert backward-compat `result.bigBalls` / `result.midBalls` survive for a BIG_BALL + MID_BALL fixture. Thirty lines.

### I-04 · All 11 analytics queries re-subscribe on every filter change → reactive fan-out on the orders table

**File:** `src/hooks/convex/useAnalytics.ts` and `convex/reports/unitEconomics.ts`

Every widget uses `useQuery`, so with 11 hooks mounted on `AnalyticsDashboard`, a single filter-bar click re-runs all 11 queries in parallel. Each query calls `loadFilteredData`, which does two `orders` index scans + one `orderItems` `by_order` scan per order + one full `componentTypes` + `menuProductComponents` scan. Several queries (`kpiSummary`, `channelMomentum`) call it twice (current + prior period).

For current order volume (~hundreds/day) this is fine. At 10× volume with a 90-day window it becomes a 22-scan burst on every filter click, and because Convex auto-subscribes, any write to `orders` during the session re-invalidates all 11 subscriptions.

Two easy mitigations, either of which closes this without architectural change:
1. **Shared loader hoisting** — extract `getProductionUnitsPerProduct(ctx)` out of `loadFilteredData` and hoist the `componentTypes` + `menuProductComponents` scans to a single query call shared across widgets (or memoize via a lightweight cache table). IN-06 in the code review flagged the prior-period double-load; same root cause.
2. **Single "analytics snapshot" query** returning every widget's payload. Reduces 11 subscriptions to 1. Heavier refactor — defer to a performance phase if the v1 dashboard is lightly used.

For v1, ship as-is but add a doc note in `convex/reports/unitEconomics.ts` header warning future authors that the 11 queries co-scale with every filter change. Plan a perf follow-up if the dashboard gets heavy use.

---

## Minor

### M-01 · `revPerUnit` and `netPerUnit` are mathematically identical in `channelEconomics` (IN-02 not resolved)

**File:** `convex/reports/unitEconomics.ts:297-309`

With `fees = 0` in v1, both fields compute `net / units`. Consumers diverge: `TakeRateTable.tsx:29` uses `netPerUnit`, `RevPerUnitChart.tsx:19` uses `revPerUnit`. This was flagged as IN-02 in 80-REVIEW.md and not fixed (info-level, out of scope for WR-only fix batch). It's a latent bug trap: when fees land in v2, someone updates the math in one place and the other silently drifts.

Drop `revPerUnit` now, rename usage in `RevPerUnitChart` to `netPerUnit`, and add a TODO where `fees` would be subtracted. Two-line change.

### M-02 · `TYPE_COLORS` and `colorFor` duplicated across two widget files (IN-01 not resolved)

**Files:** `src/components/analytics/UnitsByTypeStackedBars.tsx:14-24` and `src/components/analytics/TypeMixOverTime.tsx:16-26`

Identical palette and helper. Extract to `src/lib/productionTypeColors.ts`. Trivial but the codebase already has `src/lib/platformColors.ts` establishing the pattern — don't drift.

### M-03 · `jakartaHour` uses ad-hoc timezone math instead of `getWibComponents` (IN-04 not resolved)

**File:** `convex/reports/unitEconomics.ts:187-189`

Inline `new Date(ts + 7 * 60 * 60 * 1000).getUTCHours()` while the rest of the file uses `getWibComponents`. Add `hour` to `getWibComponents`'s return shape (check `convex/lib/periodRange.ts`) and unify. This is small but matters because if anyone ever needs DST-aware WIB (historic transitions) the one helper is the fix site.

### M-04 · `rollingTrend` regression test doesn't catch WR-02's original bug (IN-07 not resolved)

**File:** `tests/convex/unitEconomics.test.ts:384-408`

The test seeds 10 consecutive days × Rp 30_000 each and asserts `rolling7[last] ≈ 30_000`. Under the **old** (buggy) "average over N data-point days" implementation this would also have passed because every day had data. WR-02 is fixed in the code but the guard test is weak — add a gap case:

```ts
test("rolling7 treats missing calendar days as zero", async () => {
  // Seed 3 of the last 7 days with Rp 70_000 each; expect rolling7[last] ≈ 30_000
});
```

Otherwise a future refactor could silently regress WR-02 without the suite catching it.

---

## Nitpick

### N-01 · 13 separate widgets + 1 filter context on a single page is borderline over-engineered but acceptable for charts

The per-widget split (14 files, ~760 LOC of widget code) is defensible because each widget has its own loading/empty state, Recharts config, and color strategy. A consolidated `AnalyticsWidgets.tsx` would be a nightmare to maintain. No action, just noting the tradeoff is acceptable here despite the file count.

### N-02 · `AnalyticsDashboard.tsx` grid uses `md:grid-cols-2` for D section which contains **4** widgets — Will stack 2×2 on desktop

`src/pages/AnalyticsDashboard.tsx:63-68` — four widgets (`UnitsByTypeStackedBars`, `UnitsPerTxnByChannel`, `AovByChannel`, `TypeMixOverTime`) in a `md:grid-cols-2`. Works but each widget is 200px tall and the section scrolls a lot on a laptop. Consider `xl:grid-cols-4` for the single-row layout shown in the brainstorm mockup, or group them as two rows of two intentionally. Cosmetic.

### N-03 · `MobileBottomNav` places Analytics in "More" tab per 80-01-SUMMARY — consider primary tab slot

Per 80-01-SUMMARY.md (final bullet): "MobileBottomNav places Analytics in the 'More' tab (5th+ entry), not in the primary 4-tab bar." For a dashboard users open daily, putting it one level deeper than Orders/Kitchen/Inventory is a product call, not a code review issue — but worth surfacing explicitly to the user so the decision is intentional.

---

## Plan-Fidelity Checklist

| Item | Planned | Delivered | Status |
|---|---|---|---|
| T1 production unit helpers | ✓ | ✓ | Done |
| T1.5 by_completed_at + by_order_date indexes | ✓ | ✓ | Done |
| T1.6 dispatchPlanner dynamic BOM migration | ✓ | ✓ | Done (backward-compat preserved) |
| T2–T7 11 Convex queries | ✓ | ✓ | Done |
| T8 AnalyticsFilterContext + FilterBar | ✓ | **Partial** — product multi-select missing (I-02) |
| T9 useAnalytics hooks | ✓ | ✓ | Done |
| T10–T12 13 widgets | ✓ | ✓ (14 components — AnalyticsFilterBar + 13 widgets) |
| T13 /analytics route + nav (Header + MobileBottomNav) | ✓ | ✓ | Done |
| T14 9 backend integration tests | ✓ | ✓ | Done |
| T14 Test #10 dispatchPlanner Hazelnut regression | ✓ | **Missing** (I-03) |
| T14.5 3 frontend smoke tests | ✓ | ✓ | Done |
| Pitfall #11 closure (dispatchPlanner) | ✓ | ✓ | Verified: no new hardcoded BIG_BALL/MID_BALL in unitEconomics.ts or dispatchPlanner.ts; existing occurrences in kitchen/productionLog/ballDistribution are pre-existing and out-of-scope |
| WR-01..WR-06 code-review fixes | ✓ (post-review) | ✓ | All 6 applied |

---

## Architectural Notes

- **Two new indexes on orders (`by_completed_at` + `by_order_date`)** — write amplification is modest (two indexed fields, both already written per order). Acceptable.
- **Channel taxonomy single source of truth via relative import from `convex/reports/channelTaxonomy.ts` into the frontend** — unusual pattern for this codebase (most frontend code imports from `src/lib/`), but it works and WR-04 picked it explicitly. Fine.
- **KPI semantics**:
  - "Units sold" = BOM-resolved production pieces (Big Ball + Mid Ball + Hazelnut + future) per CLAUDE.md rules 10 + 13 — correct.
  - Gross revenue = `lineTotal + discountAmount` (pre-discount, post-quantity) — correct per schema.
  - Net revenue = `lineTotal` (post-discount, pre-platform-fees) — correct.
  - Take-rate denominator = gross — correct (see `channelEconomics` line 306).
  - AOV denominator = orderCount (per order, not per item) — correct in principle, broken by C-01 when product filter is applied.
  - Units-per-txn = units / orderCount — correct in principle, broken by C-01.

- **Reactive load at current scale**: the 11-query × 2-period × 2-table scan pattern is workable for hundreds of orders/day. It is a tripwire at 10× volume (I-04). Document before merge; refactor later.

---

## Verification

Trusting the 80-01-SUMMARY claim since I did not re-run: `npm run type-check` PASS, `npm run build` PASS, 14/14 new tests PASS. The 17 pre-existing unrelated test failures listed in the summary are indeed unrelated to Phase 80 changes.

---

_Reviewed: 2026-04-15_
_Reviewer: Claude (staffreview, post-implementation)_
_Branch: gsd/phase-80-unit-economics-analytics-dashboard_

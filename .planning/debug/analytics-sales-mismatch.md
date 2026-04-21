---
slug: analytics-sales-mismatch
status: root_cause_found
trigger: Analytics page KPIs do not match Sales Aggregation page KPIs — need to validate whether Analytics double-counts or Sales undercounts
created: 2026-04-17
updated: 2026-04-17
goal: find_root_cause_only
---

# Debug Session: analytics-sales-mismatch

## Symptoms

**Expected behavior:**
Analytics page (90d filter, covering full 60-day business history) and Sales Aggregation page (All Time) should show matching headline KPIs — same revenue, same units/pieces/balls sold, same transaction/order counts. The business has only existed for ~60 days, so 90d and All Time must equal each other.

**Actual behavior:**
The two pages disagree on every KPI:

| KPI | Analytics (90d) | Sales Aggregation (All Time) | Delta | Delta % |
|-----|----------------:|-----------------------------:|------:|--------:|
| Revenue (Net) | Rp 517,406,822 | Rp 310,247,469 (Net Sales) | +Rp 207,159,353 | +66.8% |
| Revenue (Gross proxy) | — | Rp 387,470,822 (Gross Sales) | — | — |
| Units / Pieces Sold | 9,493 | 8,876 | +617 | +7.0% |
| Orders / Transactions | 2,629 | 2,364 | +265 | +11.2% |
| AOV (Net) | Rp 196,807 | — | — | — |
| Balls Sold | — | 8,876 | — | — |

Notable: Analytics "Units Sold" (9,493) is higher than Sales "Pieces Sold" / "Balls Sold" (8,876) by 617. Analytics Revenue is between Sales Gross (387M) and what net would be if grossed up — it's actually 33% higher than Sales Gross, which is a strong signal of double-counting.

**Error messages:** None. Silent data discrepancy.

**Timeline:** Observed 2026-04-17. Business ~60 days old, so both windows should be equivalent.

## Candidate Hypotheses

1. **Double-counting in Analytics** — Analytics pulls from multiple sources (externalRevenue + orders + gofoodDepot etc.) that overlap; same transaction counted twice. ✅ CONFIRMED
2. Consignment/wholesale included in Analytics but not Sales. ❌ Eliminated
3. Gross vs Net confusion. ❌ Eliminated
4. Different entity scope (BOM expansion differences). ❌ Eliminated
5. Undercounting in Sales Aggregation. ❌ Eliminated
6. Period boundary drift. ❌ Eliminated

## Current Focus

hypothesis: Analytics double-counts every Direct/internal order — native order is counted ONCE via `orders`+`orderItems`, AND a SECOND time via its mirror in `externalRevenue[source="internal"]`+`externalRevenueItems` created by `syncInternalOrders`.
test: Trace `loadExternalStream` in `convex/reports/unitEconomics.ts` → confirmed it does NOT skip `source === "internal"`.
expecting: Missing dedup rule (R5 from Phase 80 staff review addendum).
next_action: None — root cause located.

## Evidence

- timestamp: 2026-04-17 (investigation)
  finding: `src/pages/AnalyticsDashboard.tsx` uses `<KpiRow />` → `useKpiSummary()` → `api.reports.unitEconomics.kpiSummary`.
  location: convex/reports/unitEconomics.ts:425-447

- timestamp: 2026-04-17
  finding: `kpiSummary` calls `loadFilteredData()` which UNIONs native `orders`+`orderItems` with `externalRevenue`+`externalRevenueItems` via `loadExternalStream()`.
  location: convex/reports/unitEconomics.ts:240-362

- timestamp: 2026-04-17
  finding: `loadExternalStream` filters externalRevenue by `transactionType === "sales"` ONLY. It does NOT skip `source === "internal"`. All 8 sources (shopee, tokopedia, grabfood/gobiz, k3mart, consignment, tiktok, bigseller, INTERNAL) flow through equally.
  location: convex/reports/unitEconomics.ts:100-229 (specifically line 126 — only returns/delta_inferred filter)

- timestamp: 2026-04-17
  finding: `convex/integrations/internal/adapter.ts` `syncInternalOrders` action iterates every revenue-countable `orders` row and INSERTs a corresponding `externalRevenue[source="internal"]` row + child `externalRevenueItems`. Every native direct/whatsapp/instagram order has a twin in externalRevenue.
  location: convex/integrations/internal/adapter.ts:79-153

- timestamp: 2026-04-17
  finding: `sourceToDisplayChannel("internal")` returns `"Direct"` — same display channel as native `whatsapp`/`instagram` orders via `toDisplayChannel()`. So Direct channel units+revenue in Analytics get counted twice.
  location: convex/reports/channelTaxonomy.ts:74

- timestamp: 2026-04-17
  finding: Sales Aggregation page (`src/components/salesAnalytics/OverviewTab.tsx`) uses `useDashboardSalesSummaryByPeriod` → `api.externalData.actions.fetchDashboardSummaryByPeriod` → `getDashboardSummaryByPeriodInternal`. Reads ONLY `externalRevenue` table (never `orders`/`orderItems`). Native orders are counted ONCE via their `source="internal"` twin.
  location: convex/externalData/queries.ts:520-621, convex/externalData/helpers/dashboardHelpers.ts:15-141

- timestamp: 2026-04-17
  finding: Sales `totalGross` = `platformGross + internalGross`. Internal section looks up the real `orders` row by `orderNumber` (stored in `externalTransactionId`) to get pre-discount `totalAmount` / `finalTotal` / `deliveryFee`.
  location: convex/externalData/helpers/dashboardHelpers.ts:44-66

- timestamp: 2026-04-17
  finding: Sales `Balls Sold` = `Math.round(lifetimeRevenue / avgRevenuePerBall)`. Revenue comes from `externalRevenue.revenueGross` sum across all rows. No BOM expansion on native orderItems. `avgRevenuePerBall` is computed dynamically from BOM-linked externalRevenueItems.
  location: convex/externalData/helpers/lifetimeHelpers.ts:77-105

- timestamp: 2026-04-17 (smoking-gun confirmation)
  finding: `docs/reviews/staffreview-phase-80-task-4b-addendum-2026-04-14.md` explicitly identified this exact bug BEFORE phase 80 shipped. Staff review line 30: "source=`internal` is a projection of every `orders` row [...] `internal` IS the twin source." Review mandated rule R5: `if (parentRev.source === "internal") continue;` inside `loadExternalStream`.
  location: docs/reviews/staffreview-phase-80-task-4b-addendum-2026-04-14.md:30, 58

- timestamp: 2026-04-17
  finding: Commit `59069988 fix(80): apply Task 4b staff-review fixes — gobiz is GoFood, R5 skip internal only` was authored 2026-04-14 AND IS ON MAIN. But `git show --stat 59069988` shows it only modified PLAN files (80-01-PLAN.md, 80-03-PLAN.md, 80-CONTEXT.md) and a staffreview doc — it does NOT touch `convex/reports/unitEconomics.ts`. The R5 rule was written into the plan but never implemented in code.
  location: git log + git show 59069988 + `git grep "source === \"internal\"" convex/reports/unitEconomics.ts` returns 0 hits

- timestamp: 2026-04-17 (math verification)
  finding: Analytics Revenue − Sales Gross = 517,406,822 − 387,470,822 = Rp 129,936,000. This is the revenue contributed by native `orderItems.lineTotal` summed over the 265 duplicate direct orders. Units delta 9,493 − 8,876 = 617 balls = BOM-expanded double-count of those same direct orders' items. Order delta 2,629 − 2,364 = 265 = native orders double-counted (one per mirror pair). All three deltas are self-consistent with a single unified double-count through the `internal`-source mirror.

## Eliminated

- **Consignment collapsing** — consignment externalRevenue uses periodStart=transactionDate, so it appears in both pipelines identically. Ruled out.
- **Gross vs Net labelling** — verified: Analytics "Revenue (Net)" reads `itemNetRevenue = lineTotal` (post-discount, pre-fees). Sales "Net Sales" reads `revenueNet` (platform-pre-computed post-commission). Different definitions but the 130M gap is larger than any discount/commission wedge could explain.
- **BOM expansion mismatch** — Analytics uses `unitsForOrderItem` (BOM `menuProductComponents` + `componentTypes` category=production). Sales uses the same BOM via `buildBallCountMap` and `computePiecesSold`. Both count balls correctly; the 617-ball delta is purely from double-counting direct orders' items.
- **Period drift** — Analytics 90d ends at now, Sales All Time starts 2020-01-01. Both windows cover the full 60-day business history, so identical data is read. Deltas would be identical regardless of window.

## Resolution

status: root_cause_found
root_cause: `convex/reports/unitEconomics.ts` `loadExternalStream` is missing the R5 dedup rule. Every native `orders` row (status ∈ REVENUE_COUNTABLE_STATUSES) is mirrored by `syncInternalOrders` into `externalRevenue[source="internal"]` + child `externalRevenueItems`. The Analytics pipeline unions both streams without filtering out the mirror, so every Direct/WhatsApp/Instagram/Consignment order contributes twice to revenue, units, AOV, orderCount, channel economics, and every other KPI. The Sales Aggregation page reads only `externalRevenue` and is therefore correct. The fix (skip `source === "internal"` in `loadExternalStream`) was specified in the Phase 80 staff-review addendum (commit `59069988`, 2026-04-14) but that commit only modified plan documents — the code change was never made.
fix: not applied — diagnose-only mode.
verification: pending
files_changed: none
specialist_hint: typescript

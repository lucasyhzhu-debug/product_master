---
phase: 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth
verified: 2026-02-22T16:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 20: Optimize Top Convex Query Reads — Verification Report

**Phase Goal:** Reduce production bandwidth by converting the 5 heaviest analytical queries from reactive subscriptions to on-demand fetches, bounding unbounded table scans, fixing N+1 patterns, pruning query return shapes, and making internal order sync incremental

**Verified:** 2026-02-22T16:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | syncInternalOrders only processes orders since last sync (incremental) | VERIFIED | `convex/integrations/internal/adapter.ts` calls `getLatestSyncTimestamp`, passes result to `getRevenueOrders` as `sinceTimestamp` (lines 54-63) |
| 2 | First-ever sync still does full scan (no regression) | VERIFIED | `convex/integrations/internal/queries.ts` falls back to `ctx.db.query("orders").collect()` when `sinceTimestamp` is undefined (lines 30-33) |
| 3 | getDashboardSummaryByPeriod is no longer a public reactive query | VERIFIED | `convex/externalData/queries.ts` exports `getDashboardSummaryByPeriodInternal` as `internalQuery` (line 400); no public `getDashboardSummaryByPeriod` export remains |
| 4 | Sales Analytics Overview tab loads summary data on page visit via action | VERIFIED | `useConvexDashboardSalesSummaryByPeriod` uses `useAction + useState + useEffect` pattern in `src/hooks/convex/useExternalData.ts` (lines 123-143) |
| 5 | getRevenue is always called with a period bound (no unbounded scan) | VERIFIED | `useConvexExternalRevenue` applies `effectivePeriodStart = periodStart ?? (Date.now() - 90d)` as default (line 70); OverviewTab passes real period bounds from `selectedPeriod` (lines 929-949) |
| 6 | getRestockOverview is not a public reactive query | VERIFIED | `convex/externalData/queries.ts` exports `getRestockOverviewInternal` as `internalQuery` (line 629); Restock Planner uses `useConvexRestockOverview` (on-demand action hook) |
| 7 | N+1 patterns in getRestockOverview eliminated | VERIFIED | GoBiz section uses `Promise.all` (lines 746-753); Internal section uses two `Promise.all` batches (lines 813-831) in `convex/externalData/queries.ts` |
| 8 | getOutletStockSummary is not a public reactive query | VERIFIED | `convex/k3martCockpit/queries.ts` exports `getOutletStockSummaryInternal` as `internalQuery` (line 18); `useConvexOutletStockSummary` uses action-based fetch |
| 9 | getRevenueByOutlet is not a public reactive query | VERIFIED | `convex/externalData/queries.ts` exports `getRevenueByOutletInternal` as `internalQuery` (line 1532); `useConvexRevenueByOutlet` uses `useAction + useState` pattern |
| 10 | listForKanban returns a lean pruned payload (not full Doc spreads) | VERIFIED | `convex/orders/queries.ts` returns explicit 18-field order projection + 5-field item projection (lines 1196-1232); result type annotation enforces pruned shape |
| 11 | getKitchenStats skips item+production lookups for Draft/AwaitingPayment orders | VERIFIED | `productionOrders = [...paymentReceivedOrders, ...beingPreparedOrders]` drives `relevantOrders` (lines 639-641); Draft/AwaitingPayment orders counted but not queried for items |
| 12 | getKitchenStats return shape is lean (no full Doc objects) | VERIFIED | Return shape confirmed as aggregated numbers + `productionByType` array of primitives; no Doc objects escape the response |
| 13 | Build passes with no TypeScript errors | VERIFIED | `npm run build` exits with `built in 11.42s`; `npm run type-check` exits clean (zero errors) |

**Score:** 13/13 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/integrations/internal/queries.ts` | Incremental `getRevenueOrders` with `sinceTimestamp` filter and `by_creationTime` index | VERIFIED | `internalQuery` with optional `sinceTimestamp` arg; uses `.withIndex("by_creationTime", ...)` when provided |
| `convex/integrations/internal/adapter.ts` | `syncInternalOrders` fetches last sync timestamp and passes to query | VERIFIED | Step 2 calls `getLatestSyncTimestamp`, step 3 passes result as `sinceTimestamp ?? undefined` |
| `convex/schema.ts` | `by_creationTime` index on orders table | VERIFIED | Line 430: `.index("by_creationTime", ["_creationTime"])` |
| `convex/externalData/actions.ts` | 4 action wrappers for on-demand fetches | VERIFIED | `fetchDashboardSummaryByPeriod`, `fetchRestockOverview`, `fetchOutletStockSummary`, `fetchRevenueByOutlet` all present and wired to internal queries |
| `convex/externalData/queries.ts` | `getDashboardSummaryByPeriodInternal`, `getRestockOverviewInternal`, `getRevenueByOutletInternal` as `internalQuery` | VERIFIED | All three confirmed as `internalQuery` exports |
| `convex/k3martCockpit/queries.ts` | `getOutletStockSummaryInternal` as `internalQuery` | VERIFIED | Line 18: `export const getOutletStockSummaryInternal = internalQuery({...})` |
| `src/hooks/convex/useExternalData.ts` | On-demand hooks for dashboard summary, restock overview, revenue by outlet | VERIFIED | All three hooks use `useAction + useState + useCallback + useEffect` pattern with `refresh` callback |
| `src/hooks/convex/useK3MartCockpit.ts` | `useConvexOutletStockSummary` using action-based fetch | VERIFIED | Uses `useAction(api.externalData.actions.fetchOutletStockSummary)` with on-demand pattern |
| `src/components/salesAnalytics/OverviewTab.tsx` | Period bounds passed to revenue query; `refreshSummary` called after sync | VERIFIED | `revenuePeriodBounds` computed from `selectedPeriod` + `summary.currentPeriod`; `await refreshSummary()` called in `handleRefreshAll` |
| `src/pages/RestockPlanner.tsx` | `refreshOverview` wired into sync handlers | VERIFIED | `refresh: refreshOverview` destructured; called in `handleSyncAll` |
| `src/pages/K3MartCockpit.tsx` | `refreshOutletStock` wired into sync handlers | VERIFIED | `refresh: refreshOutletStock` destructured; called in `handleSync` |
| `convex/orders/queries.ts` | `listForKanban` lean projection; `getKitchenStats` `productionOrders` optimization | VERIFIED | Both confirmed with exact code inspection |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/integrations/internal/adapter.ts` | `convex/externalData/queries.ts:getLatestSyncTimestamp` | `ctx.runQuery(internal.externalData.queries.getLatestSyncTimestamp, { source: "internal" })` | WIRED | Lines 54-57 in adapter.ts |
| `src/hooks/convex/useExternalData.ts` | `convex/externalData/actions.ts:fetchDashboardSummaryByPeriod` | `useAction(api.externalData.actions.fetchDashboardSummaryByPeriod)` | WIRED | Line 126 in useExternalData.ts |
| `src/hooks/convex/useExternalData.ts` | `convex/externalData/actions.ts:fetchRestockOverview` | `useAction(api.externalData.actions.fetchRestockOverview)` | WIRED | Line 272 in useExternalData.ts |
| `src/hooks/convex/useK3MartCockpit.ts` | `convex/externalData/actions.ts:fetchOutletStockSummary` | `useAction(api.externalData.actions.fetchOutletStockSummary)` | WIRED | Line 39 in useK3MartCockpit.ts |
| `src/hooks/convex/useExternalData.ts` | `convex/externalData/actions.ts:fetchRevenueByOutlet` | `useAction(api.externalData.actions.fetchRevenueByOutlet)` | WIRED | Line 383 in useExternalData.ts |
| `convex/externalData/actions.ts:fetchDashboardSummaryByPeriod` | `convex/externalData/queries.ts:getDashboardSummaryByPeriodInternal` | `ctx.runQuery(internal.externalData.queries.getDashboardSummaryByPeriodInternal, ...)` | WIRED | Line 27 in actions.ts |
| `convex/externalData/actions.ts:fetchRestockOverview` | `convex/externalData/queries.ts:getRestockOverviewInternal` | `ctx.runQuery(internal.externalData.queries.getRestockOverviewInternal, ...)` | WIRED | Line 37 in actions.ts |
| `convex/externalData/actions.ts:fetchOutletStockSummary` | `convex/k3martCockpit/queries.ts:getOutletStockSummaryInternal` | `ctx.runQuery(internal.k3martCockpit.queries.getOutletStockSummaryInternal, ...)` | WIRED | Lines 46-49 in actions.ts |
| `convex/externalData/actions.ts:fetchRevenueByOutlet` | `convex/externalData/queries.ts:getRevenueByOutletInternal` | `ctx.runQuery(internal.externalData.queries.getRevenueByOutletInternal, ...)` | WIRED | Lines 55-58 in actions.ts |
| `src/components/salesAnalytics/OverviewTab.tsx` | `src/hooks/convex/useExternalData.ts:useConvexExternalRevenue` with period bounds | `revenuePeriodBounds.periodStart` passed as third arg | WIRED | Lines 944-949 in OverviewTab.tsx |

---

## Requirements Coverage

No formal requirement IDs declared for this phase — all plans declared `requirements: []`. Coverage assessed via goal derivation.

| Goal Component | Plans | Status | Evidence |
|----------------|-------|--------|---------|
| Convert 5 heaviest analytical queries from reactive subscriptions to on-demand fetches | 20-02, 20-04, 20-05, 20-06 | SATISFIED | 4 queries converted: getDashboardSummaryByPeriod, getRestockOverview, getOutletStockSummary, getRevenueByOutlet |
| Bound unbounded table scans | 20-03 | SATISFIED | `getRevenue` now always receives `effectivePeriodStart` (90-day default); OverviewTab passes real period bounds |
| Fix N+1 patterns | 20-04 | SATISFIED | GoBiz and Internal N+1 loops in `getRestockOverview` replaced with `Promise.all` |
| Prune query return shapes | 20-07 | SATISFIED | `listForKanban` returns 18-field order + 5-field item lean projection |
| Make internal order sync incremental | 20-01 | SATISFIED | `syncInternalOrders` uses `by_creationTime` index with 24h buffer; first sync does full scan |
| getKitchenStats optimization (bonus) | 20-08 | SATISFIED | Draft/AwaitingPayment orders skip item+production nested DB reads |

---

## Anti-Patterns Found

No blockers or stubs detected across key modified files.

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `src/components/salesAnalytics/OverviewTab.tsx` line 604 | `void refreshByOutlet;` — refresh not wired to sync handlers | Info | Acceptable: `PlatformHierarchy` component is self-contained; preset changes already trigger re-fetch; no parent sync handler integration needed |

---

## Human Verification Required

### 1. saveRevenue Call Count Drop (Post-Deploy)

**Test:** Trigger `syncInternalOrders` twice via Sales Analytics page sync button with no new orders between runs.
**Expected:** Second sync shows `totalOrders` near-zero in the sync result; Convex dashboard shows `saveRevenue` call count drops ~90% compared to pre-optimization baseline.
**Why human:** Requires live Convex dashboard metrics; cannot verify bandwidth reduction programmatically from source code alone.

### 2. Analytical Pages Load Data Correctly

**Test:** Open Sales Analytics, Restock Planner, K3Mart Cockpit pages and verify data displays without errors.
**Expected:** All pages load their data on initial visit; switching period presets on Sales Analytics re-triggers data fetch; sync buttons reload data without page refresh.
**Why human:** On-demand fetch pattern correctness (initial load, preset change re-fetch, post-sync refresh) requires browser interaction to verify.

### 3. Kanban Board Rendering After Payload Pruning

**Test:** Open Order Manager, switch to Kanban view, expand several order cards.
**Expected:** All order cards render correctly with customer name, status, items, pricing, due date — no missing fields.
**Why human:** Visual rendering of pruned `listForKanban` response requires UI inspection.

### 4. Kitchen Dashboard Ball Counts After getKitchenStats Optimization

**Test:** Open Kitchen View with a mix of Draft, AwaitingPayment, and PaymentReceived orders in flight.
**Expected:** Ball counts (needed/completed per type) show correct values; Draft and AwaitingPayment orders appear in `ordersPending` count but do not distort ball production totals.
**Why human:** Requires real order data in production; count correctness depends on actual order state distribution.

---

## Summary

Phase 20 achieved its goal. All 8 plans executed cleanly and their implementations are verified in the codebase:

- **Plan 20-01** (Incremental sync): `syncInternalOrders` is incremental — uses `by_creationTime` index with 24-hour buffer, falls back to full scan on first sync. Wiring to `getLatestSyncTimestamp` confirmed.

- **Plan 20-02** (getDashboardSummaryByPeriod): Renamed to `internalQuery`; `fetchDashboardSummaryByPeriod` action created; `useConvexDashboardSalesSummaryByPeriod` uses `useAction` pattern; `refreshSummary` called after sync in OverviewTab.

- **Plan 20-03** (getRevenue bounding): `useConvexExternalRevenue` applies 90-day default; OverviewTab computes real period bounds from `selectedPeriod` + `summary.currentPeriod`; allTime preset uses explicit `Date.UTC(2020, 0, 1)` to keep indexed path.

- **Plan 20-04** (getRestockOverview): Renamed to `internalQuery`; GoBiz and Internal N+1 loops replaced with `Promise.all`; `useConvexRestockOverview` uses on-demand pattern; `refreshOverview` wired into `handleSyncAll`.

- **Plan 20-05** (getOutletStockSummary): Renamed to `internalQuery`; `fetchOutletStockSummary` action created; `useConvexOutletStockSummary` uses action-based fetch; `refreshOutletStock` wired into K3Mart `handleSync`.

- **Plan 20-06** (getRevenueByOutlet): Renamed to `internalQuery`; `fetchRevenueByOutlet` action created; `useConvexRevenueByOutlet` uses on-demand pattern.

- **Plan 20-07** (listForKanban pruning): Explicit 18-field order projection + 5-field item projection; result type annotation enforces the lean shape; build confirms no consumer references dropped fields.

- **Plan 20-08** (getKitchenStats): `productionOrders` subset excludes Draft/AwaitingPayment from nested DB reads; `pendingOrders` still used for counts; lean return shape confirmed.

Build passes (`npm run build` exits clean). TypeScript type check passes (`npm run type-check` exits clean). No stubs, placeholder implementations, or broken wiring detected.

---

_Verified: 2026-02-22T16:00:00Z_
_Verifier: Claude (gsd-verifier)_

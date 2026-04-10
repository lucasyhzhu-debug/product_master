# Phase 20: Optimize Top Convex Query Reads to Reduce Production Bandwidth - Research

**Researched:** 2026-02-22
**Domain:** Convex query optimization — field pruning, subscription-to-fetch conversion, payload reduction
**Confidence:** HIGH (all findings from direct codebase inspection of live query code)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Query Targeting (priority order):**
1. `getDashboardSummaryByPeriod` — 205 MB, ~108 KB/call, 1.9K calls (BOTH frequency + payload)
2. `getRevenue` — 80 MB, ~94 KB/call (costly payload)
3. `getOutletStockSummary` — 48 MB (costly payload)
4. `getRestockOverview` — 47 MB (costly payload)
5. `getRevenueByOutlet` — 30 MB (costly payload)
6. `getKitchenStats` — 25 MB, ~35 KB/call, 742 calls (moderate per call)
7. `listForKanban` — 22 MB (moderate)
8. `saveRevenue` (mutation) — 7.3 MB, 5.2K calls (pure frequency)

**Optimization Strategy:**
- All techniques available: field pruning, pagination/windowing, subscription-to-fetch conversion
- Pre-aggregation only if >50% reduction for that query
- Incremental rollout: fix one query, deploy, verify, then next
- New indexes on schema.ts are approved if needed

**Data Freshness Tolerance:**
- ALL 5 top queries tolerate manual refresh (load-on-visit, not reactive)
- Existing refresh buttons on each page — reuse, no new UI needed
- Subscription-to-fetch is a MAJOR optimization lever for these analytical views

**Breaking Changes Allowed:**
- OK to change query return shapes (update hooks + components to match)
- OK to split heavy queries into lighter ones
- OK to add indexes to schema.ts
- Minor external data storage tweaks OK; don't overhaul sync pipeline

### Claude's Discretion
- Whether to split or consolidate queries per case
- Subscription-to-fetch conversion approach per query
- Specific field pruning decisions (which fields to drop)
- Index design choices
- Debounce vs. throttle vs. fetch conversion per query's frequency issue

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This is a pure code-optimization phase: no new features, no new UI. All eight target queries have been directly inspected. Root causes are well-understood. The optimization strategy is clear for each query.

Five of the seven top bandwidth-consuming queries (`getDashboardSummaryByPeriod`, `getRevenue`, `getOutletStockSummary`, `getRestockOverview`, `getRevenueByOutlet`) are reactive `useQuery` subscriptions on analytical/planning views that tolerate manual refresh. Converting these to on-demand fetches (load-on-mount + manual refresh) eliminates the Convex WebSocket subscription overhead and all re-push bandwidth whenever underlying data changes.

For `getKitchenStats` and `listForKanban`, subscription reactivity IS desirable (kitchen operators need live updates), so these need payload optimization rather than conversion.

`saveRevenue` (5.2K calls, 7 MB) is an `internalMutation` called by the `syncInternalOrders` action, which iterates all historical confirmed orders in batches and re-saves them every sync. The 5.2K call count suggests the dedup logic (by `externalTransactionId`) is working but the full re-scan of all orders is wasteful. The fix is incremental sync: track the last synced timestamp and only process new orders.

**Primary recommendation:** Convert the five analytical `useQuery` subscriptions to `useAction`-based load-on-visit fetches with manual refresh; prune fields on `listForKanban` and `getKitchenStats`; fix `syncInternalOrders` to be truly incremental.

---

## Architecture Patterns

### Pattern 1: Subscription-to-Fetch Conversion

**What:** Replace `useQuery(api.x.query, args)` with `useAction(api.x.action)` or a one-shot `useQuery` that is triggered imperatively. The standard Convex pattern is to wrap the query as a public `action` that calls an `internalQuery`, then call it with `useAction` in the frontend.

**When to use:** Analytical/planning pages where data doesn't need to auto-refresh when the DB changes. User visits page → data loads → user clicks "Refresh" to reload.

**Convex pattern for on-demand queries:**
```typescript
// Backend: convex/externalData/actions.ts
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const fetchDashboardSummaryByPeriod = action({
  args: { preset: periodPresetValidator },
  handler: async (ctx, args) => {
    // Call the internal query handler directly
    return await ctx.runQuery(internal.externalData.queries.getDashboardSummaryByPeriodInternal, args);
  },
});
```

```typescript
// Frontend hook
import { useAction } from "convex/react";
import { useEffect, useState } from "react";

export function useDashboardSummaryOnDemand(preset: PeriodPreset) {
  const [data, setData] = useState<SummaryData | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const fetch = useAction(api.externalData.actions.fetchDashboardSummaryByPeriod);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetch({ preset });
      setData(result);
    } finally {
      setIsLoading(false);
    }
  }, [fetch, preset]);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, refresh: load };
}
```

**Alternative (simpler): Keep as `query`, but wrap in a stateful hook that only calls it once on mount.** The simplest approach that avoids breaking backend code is to use Convex `useQuery` with a stable args object and avoid re-subscribing when args change. However, Convex doesn't natively support "one-shot" queries — `useQuery` always subscribes reactively. The `useAction` pattern is the correct way to get non-reactive data fetching.

**Confidence:** HIGH — This is the documented Convex pattern for separating reactive subscriptions from on-demand fetches.

---

### Pattern 2: Field Pruning (Lean Return Shapes)

**What:** Return only the fields the frontend actually uses, dropping large or unused fields from the query response.

**When to use:** When query fetches full documents but frontend only uses a subset of fields.

**Example for `listForKanban`:**
The query returns full `Doc<"orders">` objects (which include all order fields: `notes`, `deliveryAddress`, `voucherCode`, `voucherDiscountValue`, `orderLevelDiscount`, `orderLevelDiscountType`, `totalCost`, `totalMargin`, `deliveryFee`, plus all `orderItems` fields). The Kanban UI only needs a subset for card display.

```typescript
// Pruned return in query handler:
return {
  ...order,
  // Drop heavy/unused fields for kanban display
  notes: undefined,
  // Keep only needed item fields
  items: items.map(item => ({
    _id: item._id,
    productName: item.productName,
    quantity: item.quantity,
    ballsFilled: item.ballsFilled,
    packageStatus: item.packageStatus,
    isCancelled: item.isCancelled,
  })),
};
```

**Confidence:** HIGH — Standard Convex best practice. Field selection at the query level is the only way to reduce payload since Convex doesn't support projection queries.

---

### Pattern 3: Incremental Sync for `saveRevenue`

**What:** Track the last successfully synced timestamp and only process orders created/updated after that point. The current `syncInternalOrders` fetches ALL revenue-countable orders every sync run and relies on `externalTransactionId` dedup in `saveRevenue` to skip existing ones — but this still incurs the cost of calling `saveRevenue` for all records.

**Root cause of 5.2K calls:** The `syncInternalOrders` action fetches all orders, batches them, and calls `saveRevenue` (an `internalMutation`) once per batch. With `BATCH_SIZE` records per batch, 5.2K calls means either batching is per-record (batch size = 1) or there are many orders. The mutation itself does a dedup check per record, which means 5.2K dedup checks. The fix: track `lastSyncedAt` in `externalSyncLogs` and use it to filter orders in `getRevenueOrders`.

**Fix pattern:**
```typescript
// convex/integrations/internal/queries.ts - getRevenueOrders
// Add: sincetimestamp parameter
export const getRevenueOrders = internalQuery({
  args: { sinceTimestamp: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (args.sinceTimestamp) {
      return await ctx.db
        .query("orders")
        .withIndex("by_status", ...)
        .filter((q) => q.gte(q.field("_creationTime"), args.sinceTimestamp!))
        ...
    }
    // Full scan for first sync only
  },
});
```

**Confidence:** HIGH — Issue is clearly visible in adapter code. Fix is straightforward.

---

### Pattern 4: Query Splitting for `getDashboardSummaryByPeriod`

**What:** Break the 108 KB monolith query into smaller independent queries, so only needed data is fetched for each UI section.

The current `getDashboardSummaryByPeriod` does all of:
1. Fetches all outlets (for platform counts)
2. Fetches latest sync logs per source (3 queries)
3. Fetches current period revenue records (full collect)
4. Fetches previous period revenue records (full collect)
5. For each internal order number, does a `by_order_number` index lookup
6. Aggregates all of the above

If converted to on-demand fetch (Pattern 1), the 108 KB payload can be reduced by splitting into:
- A lean "platform status" query (just outlet counts + last sync timestamps) — tiny
- A "period summary" query that aggregates numbers only (no raw records returned)

The key insight: the query currently returns COMPUTED aggregates (not raw records), so the 108 KB isn't from returning too many rows — it's from the complexity of the response object AND the frequent re-execution when any underlying table changes.

**Confidence:** HIGH — Confirmed by code inspection.

---

### Pattern 5: Windowing `getRevenue` (Full Table Scan)

**What:** `getRevenue` currently fetches all records via `.collect()` (with optional period filter via index), then enriches each with outlet names and order data. With no period filter, this is an unbounded fetch.

The frontend usage in `OverviewTab.tsx` calls `useConvexExternalRevenue()` with no `periodStart`/`periodEnd` args, meaning it fetches ALL `externalRevenue` records every time. This is the 80 MB query.

**Fix:** Add a default window (e.g., last 90 days) when no period is specified. Or better: use `getRevenuePaginated` (already exists!) instead of `getRevenue` for the revenue table display.

```typescript
// Already exists — switch OverviewTab to use this:
export const getRevenuePaginated = query({ ... }); // in externalData/queries.ts line 207
```

The `getRevenuePaginated` hook already exists in the backend but is apparently not used on the main revenue list in `OverviewTab`. Switching to it eliminates the full table scan.

**Confidence:** HIGH — Both the problem (unbounded collect) and the solution (existing paginated query) are confirmed in code.

---

### Pattern 6: `getRestockOverview` — N+1 Pattern Fix

**What:** `getRestockOverview` has an N+1 issue in the GoBiz section: it fetches all GoBiz revenue records, then for EACH record fetches `externalRevenueItems` in a loop. This is an `await ctx.db.query(...)` inside a `for` loop.

```typescript
// Current (N+1 pattern — each gobizRevenue record triggers a separate query):
for (const r of gobizRevenue) {
  const items = await ctx.db.query("externalRevenueItems")
    .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
    .collect();
  ...
}
```

Also in the Internal channel section: for each internal revenue record, it fetches orders AND then fetches `orderItems` per order — a two-level N+1 pattern.

**Fix:** Use `Promise.all()` for parallel fetching, which Convex supports and is significantly faster.

```typescript
// Optimized:
const allItems = await Promise.all(
  gobizRevenue.map((r) =>
    ctx.db.query("externalRevenueItems")
      .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
      .collect()
  )
);
```

Note: This reduces execution time but doesn't reduce payload size. The payload reduction comes from converting to on-demand fetch (no reactive re-push on DB change).

**Confidence:** HIGH — N+1 pattern clearly visible in code.

---

## Query-by-Query Analysis

### Query 1: `getDashboardSummaryByPeriod` — 205 MB, 1.9K calls, ~108 KB/call

**File:** `convex/externalData/queries.ts:400`
**Used by:** `src/hooks/convex/useExternalData.ts:useConvexDashboardSalesSummaryByPeriod` → `src/components/salesAnalytics/OverviewTab.tsx`
**Root cause:** BOTH frequency and payload.

**Frequency issue:** 1.9K calls over the dashboard period. The `useQuery` subscription means Convex re-executes and re-pushes the result every time ANY row in `externalRevenue`, `externalOutlets`, `externalSyncLogs`, or `orders` changes. Since `saveRevenue` runs thousands of times during sync, it triggers thousands of dashboard re-computations.

**Payload issue:** 108 KB per response. The query returns a deeply nested object with current period aggregates, previous period aggregates, per-channel breakdowns, plus platform status objects including full `externalSyncLogs` rows.

**Fix strategy:**
1. Convert `useConvexDashboardSalesSummaryByPeriod` hook to use `useAction` (on-demand fetch, eliminates reactive re-push)
2. Backend: add an `internalQuery` variant + a public `action` wrapper
3. Prune the response: the `lastSync` object currently returns the full `externalSyncLogs` doc — only return `timestamp` and `status`, not the full document
4. The `platforms` info (outlet counts, last sync) could be a separate tiny query cached independently

**Expected reduction:** ~90% of 205 MB (eliminating reactive subscription during sync runs)

---

### Query 2: `getRevenue` — 80 MB, ~94 KB/call

**File:** `convex/externalData/queries.ts:114`
**Used by:** `src/components/salesAnalytics/OverviewTab.tsx:925` via `useConvexExternalRevenue()`
**Root cause:** Costly payload — full table scan with no date bound.

**Key finding:** `useConvexExternalRevenue()` is called without `periodStart`/`periodEnd`. The query falls back to `by_period` index with no lower bound, fetching ALL records. The enrichment loop adds N outlet lookups and an orders table scan for internal records. This produces a huge response even for a moderate number of records.

**Fix strategy:**
1. Switch `OverviewTab.tsx` to use the existing `getRevenuePaginated` hook (already built) for the revenue records table display
2. For the period-filtered revenue list in the UI, add a period filter matching the selected `preset`
3. OR: remove `useConvexExternalRevenue` from `OverviewTab` entirely — the `getDashboardSummaryByPeriod` result already contains the aggregated numbers; the raw records are only needed for the expandable table rows

**Expected reduction:** 70-90% of 80 MB (bounding to a period or paginating)

---

### Query 3: `getOutletStockSummary` — 48 MB

**File:** `convex/k3martCockpit/queries.ts:18`
**Used by:** `src/hooks/convex/useK3MartCockpit.ts`
**Root cause:** Costly payload — reactive subscription on K3Mart cockpit page.

**What it does:** Fetches all active K3 outlets, then for each outlet: latest snapshot batch + 7 days of revenue. On every `externalRevenue` insert (each sync), the subscription re-executes and re-pushes results for ALL outlets.

**Fix strategy:**
1. Convert to on-demand fetch (`useAction` pattern)
2. Prune returned fields: currently returns full product objects from snapshots. The cockpit view doesn't need `price`, `priceGrabfoodGofood`, etc. — just `productName`, `quantity`, `soldToday`, `avgDailySales7d`

**Expected reduction:** High — subscription elimination removes re-pushes during sync runs.

---

### Query 4: `getRestockOverview` — 47 MB

**File:** `convex/externalData/queries.ts:628`
**Used by:** `src/pages/RestockPlanner.tsx` via `useConvexRestockOverview`
**Root cause:** Costly payload + N+1 execution pattern.

**What it does:** Fetches 14 days of revenue across K3 outlet, GoBiz (with per-record `externalRevenueItems` N+1), and internal (with per-record order lookup + orderItems N+1). Also fetches stock snapshots per outlet.

**Fix strategy:**
1. Convert to on-demand fetch (the Restock Planner already has a "Sync" button workflow — it just needs the initial load to not be reactive)
2. Fix the two N+1 patterns with `Promise.all()`
3. Return only fields needed for overview grid (not all product analysis fields)

**Expected reduction:** High — both N+1 fixes reduce execution cost; subscription elimination reduces push count.

---

### Query 5: `getRevenueByOutlet` — 30 MB

**File:** `convex/externalData/queries.ts:1512`
**Used by:** `src/hooks/convex/useExternalData.ts:useConvexRevenueByOutlet` → `OverviewTab.tsx`
**Root cause:** Costly payload — full period fetch with outlet enrichment, reactive subscription.

**What it does:** Same period-based revenue fetch as `getDashboardSummaryByPeriod` (by_period index), plus outlet lookups and order data for internal. Returns grouped platform → outlet hierarchy with totals.

**Fix strategy:**
1. Convert to on-demand fetch
2. This query is shown in a specific tab/section of OverviewTab — load only when that tab is active (conditional fetch)
3. Prune to only the aggregated numbers (not outlet names repeated in every record)

**Expected reduction:** High — shares the same reactive subscription problem as other analytical queries.

---

### Query 6: `getKitchenStats` — 25 MB, 742 calls, ~35 KB/call

**File:** `convex/orders/queries.ts:610`
**Used by:** `src/hooks/convex/useKitchenStats.ts:useConvexKitchenStats`
**Root cause:** Moderate per-call size; subscription is APPROPRIATE here (kitchen needs live updates).

**What it does:** Fetches orders by 6 different statuses (parallel queries), then per-order fetches `orderItems` and per-item fetches `orderItemProduction`. This is already optimized with `Promise.all()`. The kitchen page NEEDS live reactivity — this subscription should stay.

**Payload reduction opportunities:**
- The `productionByType` array is returned for each query call even when the kitchen view doesn't use it on the stats summary card
- Consider two separate queries: `getKitchenStatsSummary` (just counts/totals, tiny) and `getKitchenProductionDetail` (full production breakdown)
- Or: prune unused fields from `orderItemProduction` records before aggregating

**Note:** The per-order loop through `orderItemProduction` is correct and already uses indexed queries. The 35 KB/call is large but this is live operational data.

**Fix strategy (conservative):** Prune intermediate data accumulation — the query currently builds `productionByItem` maps with full Doc objects but only uses specific numeric fields.

**Expected reduction:** 30-50% payload reduction via field pruning.

---

### Query 7: `listForKanban` — 22 MB

**File:** `convex/orders/queries.ts:1104`
**Used by:** `src/hooks/convex/useOrders.ts:useKanbanOrders` → `src/pages/OrderManager.tsx`
**Root cause:** Returns enriched full order documents + all non-cancelled items + creator names. Subscription is appropriate (Kanban needs live updates).

**What it does:** For each of 6 columns, fetches all orders by status index, then per-order fetches `orderItems` and user for creator name. Returns complete order objects.

**Payload reduction opportunities:**
- Full `Doc<"orders">` objects contain many unused Kanban fields: `notes`, `deliveryAddress`, `voucherCode`, `voucherDiscountValue`, `orderLevelDiscountType`, `totalCost`, `totalMargin`, `deliveryFee`, etc.
- Full `orderItems` returned but Kanban cards only need: `productName`, `quantity`, `ballsFilled`, `packageStatus`
- The "complete" column is already limited to 50 orders — good

**Fix strategy:** Create a lean return shape — define a `KanbanOrder` type that only includes fields shown on Kanban cards. Project to that shape before returning.

**Expected reduction:** 40-60% of 22 MB.

---

### Mutation: `saveRevenue` — 7.3 MB, 5.2K calls

**File:** `convex/externalData/mutations.ts:42`
**Called by:** `convex/integrations/internal/adapter.ts:syncInternalOrders`
**Root cause:** Pure frequency — sync re-processes ALL historical orders every run.

**What it does:** `syncInternalOrders` calls `getRevenueOrders` which fetches ALL revenue-countable orders (no timestamp filter). It then calls `saveRevenue` in batches. The mutation does a `by_source_txn` dedup check per record. For N orders in history, every sync run incurs N dedup lookups + N mutation calls (even though most are skips).

**Key finding:** `convex/integrations/internal/config.ts` has `BATCH_SIZE`. The 5.2K calls are `saveRevenue` invocations (not individual records). This means either `BATCH_SIZE = 1` (per-record batching) or there are many orders.

**Fix strategy:**
1. In `getRevenueOrders`, add a `sinceTimestamp` parameter
2. In `syncInternalOrders`, query `externalSyncLogs` for the last successful internal sync timestamp, pass as `sinceTimestamp` to only fetch new orders
3. On first-ever sync (no last timestamp), fall back to full scan
4. This reduces `saveRevenue` calls from O(all_orders) to O(new_orders_since_last_sync)

**Expected reduction:** ~90% of 7.3 MB assuming most syncs add 0-10 new orders.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| On-demand data fetching | Custom websocket management | `useAction` from `convex/react` | Convex provides this; actions don't create subscriptions |
| Load-on-mount state | Custom fetch state machine | `useState` + `useEffect` + `useAction` | Simple and correct for one-shot fetches |
| Pagination | Custom cursor management | `usePaginatedQuery` or existing `getRevenuePaginated` | Already built in Convex and in this codebase |
| Caching fetched data | External cache (Redis, etc.) | Local React state (`useState`) | Data is fetched per page mount; no cross-page cache needed |

---

## Common Pitfalls

### Pitfall 1: Breaking Kitchen/Order Reactivity
**What goes wrong:** Converting `getKitchenStats` or `listForKanban` to on-demand fetch, then finding kitchen operators see stale data during production.
**Why it happens:** These queries serve LIVE operational workflows, not analytical views.
**How to avoid:** ONLY convert the 5 analytical queries to on-demand fetch. Keep `getKitchenStats` and `listForKanban` as reactive `useQuery` subscriptions.
**Warning signs:** If kitchen page shows outdated ball counts after completing production.

### Pitfall 2: useAction Returns Snapshot, Not Reactive
**What goes wrong:** Assuming `useAction` result auto-updates like `useQuery`.
**Why it happens:** Actions return a Promise result once, not a subscription. Data won't update when the DB changes.
**How to avoid:** This is the INTENT for analytical pages. The refresh button re-calls the action. Confirm with user that manual refresh is acceptable (it is, per CONTEXT.md).

### Pitfall 3: Forgetting to Convert the `internalQuery` Variant
**What goes wrong:** Moving query logic to an `internalQuery` but the public `query` still subscribes.
**Why it happens:** The `useAction` pattern requires: public `action` → `ctx.runQuery(internal.x.internalQuery)`. If the public `query` remains and isn't replaced, the subscription still exists.
**How to avoid:** Remove (or don't use) the public `query` version. Replace the hook to use the action.

### Pitfall 4: `getRevenue` Without Period Bound
**What goes wrong:** Forgetting that `getRevenue()` with no args fetches ALL records.
**Why it happens:** The hook signature accepts optional args, so calling without them looks harmless.
**How to avoid:** Add a default period bound (e.g., last 90 days) or always require explicit period. Add a comment in the query.

### Pitfall 5: N+1 in Promise.all vs Sequential Loop
**What goes wrong:** Leaving the sequential `for...await` loops in `getRestockOverview` — each iteration waits for the previous DB call to complete before starting the next.
**Why it happens:** JavaScript `for...of` with `await` is sequential, not parallel.
**How to avoid:** Use `Promise.all(array.map(async (item) => ...))` for parallel fetching. This is already done correctly in `getKitchenStats` and `getOutletStockSummary` (they use `Promise.all`).

### Pitfall 6: Pruning Fields That Are Used Downstream
**What goes wrong:** Removing a field from a query return shape that a page component references.
**Why it happens:** Fields like `totalCost`, `totalMargin` appear unused in kanban cards but may be used in slide-overs or tooltips.
**How to avoid:** Grep for each field name across `src/` before removing from query return. Update TypeScript types to catch any breakage (`npm run type-check` is the safety net).

### Pitfall 7: `saveRevenue` Mutation Bandwidth vs Argument Size
**What goes wrong:** Thinking the 7.3 MB is from the mutation's return value. Mutations return data too, but the bandwidth is mostly from the ARGUMENT payload sent to the server.
**Why it happens:** The `saveRevenue` args include full revenue record objects — each call with a batch of records sends all those fields over the wire.
**How to avoid:** Incremental sync (fewer calls) is the fix. The batch size itself doesn't need to change.

---

## Code Examples

### Converting useQuery to useAction (on-demand fetch pattern)

```typescript
// convex/externalData/actions.ts (NEW FILE)
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
// Import periodPresetValidator from queries.ts or a shared validator file

export const fetchDashboardSummaryByPeriod = action({
  args: { preset: periodPresetValidator },
  handler: async (ctx, args) => {
    return await ctx.runQuery(
      internal.externalData.queries.getDashboardSummaryByPeriodInternal,
      args
    );
  },
});
```

```typescript
// convex/externalData/queries.ts — change export to internalQuery
// Rename getDashboardSummaryByPeriod -> getDashboardSummaryByPeriodInternal
// Change: query({ ... }) -> internalQuery({ ... })
export const getDashboardSummaryByPeriodInternal = internalQuery({ ... });
```

```typescript
// src/hooks/convex/useExternalData.ts — replace hook
export function useConvexDashboardSalesSummaryByPeriod(preset: PeriodPreset) {
  const [data, setData] = useState<SummaryData | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const fetchAction = useAction(api.externalData.actions.fetchDashboardSummaryByPeriod);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAction({ preset });
      setData(result);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAction, preset]);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, refresh: load };
}
```

### Field Pruning for listForKanban

```typescript
// In convex/orders/queries.ts — listForKanban handler
// Replace: return { ...order, items, creatorName };
// With a lean shape:
return {
  _id: order._id,
  _creationTime: order._creationTime,
  orderNumber: order.orderNumber,
  customerName: order.customerName,
  status: order.status,
  paymentStatus: order.paymentStatus,
  dueDate: order.dueDate,
  channel: order.channel,
  deliveryType: order.deliveryType,
  itemCount: order.itemCount,
  totalAmount: order.totalAmount,
  completedAt: order.completedAt,
  creatorName,
  items: items.map(item => ({
    _id: item._id,
    productName: item.productName,
    productVariant: item.productVariant,
    quantity: item.quantity,
    ballsFilled: item.ballsFilled,
    packageStatus: item.packageStatus,
    isCancelled: item.isCancelled,
  })),
};
```

### Incremental Internal Sync

```typescript
// convex/integrations/internal/adapter.ts — syncInternalOrders
// Step 2: Get last successful sync timestamp BEFORE fetching orders
const lastSyncLog = await ctx.runQuery(
  internal.externalData.queries.getLatestSyncTimestamp,  // already exists!
  { source: "internal" }
);
// lastSyncLog is already the timestamp of the last successful sync

// Step 3: Pass timestamp to filter orders
const orders = await ctx.runQuery(
  internal.integrations.internal.queries.getRevenueOrders,
  { sinceTimestamp: lastSyncLog ?? undefined }
);
```

```typescript
// convex/integrations/internal/queries.ts — getRevenueOrders
export const getRevenueOrders = internalQuery({
  args: { sinceTimestamp: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const baseQuery = ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Complete"));

    if (args.sinceTimestamp) {
      // Only new orders since last sync
      return await baseQuery
        .filter((q) => q.gte(q.field("confirmedAt"), args.sinceTimestamp!))
        .collect();
    }
    // First sync: full scan
    return await baseQuery.collect();
  },
});
```

Note: `getLatestSyncTimestamp` already exists as an `internalQuery` in `externalData/queries.ts:42`. The sync adapter can call it directly.

---

## State of the Art

| Old Approach | Current Approach | Recommended Approach | Impact |
|--------------|------------------|---------------------|--------|
| Reactive `useQuery` for analytical views | All 5 top analytical queries use `useQuery` | `useAction` on-demand fetch with manual refresh | Eliminates re-push bandwidth during sync runs |
| Full table scan for revenue | `getRevenue` with no period bound fetches all records | Use existing `getRevenuePaginated` or add period bound | Reduces payload from O(all_records) to O(page) |
| Full order docs in Kanban | `listForKanban` returns complete order + item docs | Lean projected return shape | ~50% payload reduction |
| All-history re-sync | `syncInternalOrders` processes all confirmed orders every run | Incremental: only orders since last sync timestamp | ~90% reduction in `saveRevenue` call count |
| Sequential N+1 queries | `getRestockOverview` GoBiz/Internal sections use `for...await` loops | `Promise.all()` parallel fetching | Faster execution (less time for subscription to push) |

---

## Implementation Order (Recommended)

Following the CONTEXT.md instruction to do incremental rollout — fix one, deploy, verify, then next:

1. **Plan 20-01:** `saveRevenue` mutation — incremental internal sync (quickest win, no frontend changes, pure backend fix)
2. **Plan 20-02:** `getDashboardSummaryByPeriod` — subscription-to-fetch conversion + field pruning on `lastSync` response (largest absolute bandwidth)
3. **Plan 20-03:** `getRevenue` — switch `OverviewTab.tsx` to `getRevenuePaginated` + add period bound
4. **Plan 20-04:** `getRestockOverview` — on-demand fetch + `Promise.all()` N+1 fix
5. **Plan 20-05:** `getOutletStockSummary` — on-demand fetch + field pruning
6. **Plan 20-06:** `getRevenueByOutlet` — on-demand fetch + tab-conditional loading
7. **Plan 20-07:** `listForKanban` — lean return shape (field pruning only, keep subscription)
8. **Plan 20-08:** `getKitchenStats` — payload pruning (keep subscription)

Each plan: backend change → frontend hook update → type-check → build verify.

---

## Open Questions

1. **What pages consume `getOutletStockSummary`?**
   - Need to check `src/hooks/convex/useK3MartCockpit.ts` fully to confirm all callers and what refresh mechanism already exists on K3Mart Cockpit page.
   - Recommendation: Read `useK3MartCockpit.ts` during Plan 20-05 planning.

2. **Is `getRevenuePaginated` already used anywhere?**
   - The hook exists in backend but no frontend usage was found. Verify before Plan 20-03.
   - Recommendation: Grep for `getRevenuePaginated` in `src/` — if unused, it's safe to adopt.

3. **`listForKanban` — which order fields are used in OrderSlideOver?**
   - The slide-over panel (shown when clicking a Kanban card) may use additional fields from the kanban order object. Need to inspect `OrderManager.tsx` slide-over component to know which fields to keep.
   - Recommendation: Read `OrderManager.tsx` before finalizing the pruned shape in Plan 20-07.

4. **`syncInternalOrders` BATCH_SIZE value?**
   - `convex/integrations/internal/config.ts` has `BATCH_SIZE`. If batch size is small (e.g., 10) and there are 52+ orders, that explains the 5.2K call count. Verify during Plan 20-01.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `convex/externalData/queries.ts` (1622 lines) — all query implementations
- Direct inspection of `convex/k3martCockpit/queries.ts` (986 lines) — `getOutletStockSummary`, `getOutletSettings`
- Direct inspection of `convex/orders/queries.ts` — `getKitchenStats` (line 610), `listForKanban` (line 1104)
- Direct inspection of `convex/integrations/internal/adapter.ts` — `syncInternalOrders` root cause
- Direct inspection of `src/hooks/convex/useExternalData.ts` — all frontend hook patterns
- Direct inspection of `src/hooks/convex/useKitchenStats.ts` — kitchen subscription pattern
- Direct inspection of `src/components/salesAnalytics/OverviewTab.tsx` — `getRevenue` unbounded call
- Convex Context7 docs (`/llmstxt/convex_dev_llms_txt`) — `useQuery` skip pattern, pagination, action vs query

### Secondary (MEDIUM confidence)
- CONTEXT.md bandwidth numbers — taken as authoritative from Convex dashboard screenshot
- Convex docs on reactive subscriptions and action patterns

---

## Metadata

**Confidence breakdown:**
- Root cause analysis: HIGH — all queries directly inspected
- Fix strategies: HIGH — patterns are standard Convex patterns confirmed in docs
- Expected reduction estimates: MEDIUM — based on understanding of Convex re-push behavior; actual numbers need dashboard verification post-deploy
- Implementation ordering: HIGH — follows CONTEXT.md incremental rollout requirement

**Research date:** 2026-02-22
**Valid until:** 2026-04-22 (codebase findings; stable unless schema changes)

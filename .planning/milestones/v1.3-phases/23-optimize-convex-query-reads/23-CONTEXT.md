# Phase 23: Optimize Top Convex Query Reads to Reduce Production Bandwidth - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Diagnose and optimize the top bandwidth-consuming Convex queries in production. Root-cause each query (frequency vs. payload vs. both), then apply targeted optimizations. Total production bandwidth across top queries is ~833 MB — reduce by making each query as lean as possible with no fixed target.

</domain>

<decisions>
## Implementation Decisions

### Query Targeting
- Prioritize by bandwidth size (top down): getDashboardSummaryByPeriod (205MB) first, then getRevenue (80MB), etc.
- Root-cause diagnosis required per query: is it call frequency, payload size, or both?
- Use Convex dashboard metrics as source of truth for call counts and bandwidth per function
- No fixed bandwidth reduction target — just make each query as lean as possible

### Root-Cause Analysis (from dashboard data)

| Query (Prod) | Calls | Bandwidth | Avg/Call | Root Cause |
|-------|-------|-----------|---------|------------|
| `getDashboardSummaryByPeriod` | 1.9K | 205.51 MB | ~108 KB | Both: costly payload + high frequency |
| `getRevenue` | 873 | 79.96 MB | ~94 KB | Costly payload |
| `getOutletStockSummary` | — | 48.31 MB | — | Costly payload (call count not visible) |
| `getRestockOverview` | — | 46.62 MB | — | Costly payload (call count not visible) |
| `getRevenueByOutlet` | — | 30.10 MB | — | Costly payload (call count not visible) |
| `getKitchenStats` | 742 | 25.04 MB | ~35 KB | Moderate per call |
| `listForKanban` | — | 21.96 MB | — | Moderate |
| `saveRevenue` (mutation) | 5.2K | 7.34 MB | ~1.4 KB | Pure frequency (5.2K calls) |

Key observation: 5 of top 7 bandwidth consumers are `externalData/queries`.

### Optimization Strategy
- All techniques available: field pruning, pagination/windowing, subscription-to-fetch conversion
- Claude decides the right approach per query based on root cause
- Pre-aggregation tables (summary tables with cron updates) only if huge impact (>50% reduction for that query)
- Incremental rollout: fix one query, deploy, verify bandwidth drop, then next
- New indexes on schema.ts are approved if needed

### Data Freshness Tolerance
- ALL 5 top queries can use manual refresh (load on page visit, not reactive subscriptions)
- Dashboard, revenue, stock summary, restock overview — all analytical/planning views, not live ops
- Existing refresh/sync buttons on each page already exist — reuse those, no new UI needed
- Converting reactive `useQuery` subscriptions to on-demand fetches is a major optimization lever

### Breaking Changes
- OK to change query return shapes — update frontend hooks and components to match
- OK to split heavy queries into lighter ones if Claude determines it helps
- OK to add indexes to schema.ts
- Minor external data storage tweaks OK (e.g., adding summary fields), but don't overhaul the sync pipeline

### Claude's Discretion
- Whether to split or consolidate queries per case
- Subscription-to-fetch conversion approach per query
- Specific field pruning decisions (which fields to drop)
- Index design choices
- Debounce vs. throttle vs. fetch conversion per query's frequency issue

</decisions>

<specifics>
## Specific Ideas

- `getDashboardSummaryByPeriod` is the #1 target — 108 KB per call AND 1.9K calls makes it both frequency and payload heavy
- `saveRevenue` mutation at 5.2K calls is a pure frequency outlier — investigate why it's called so often
- The `externalData` module is the hotspot — most bandwidth comes from this single module
- Dashboard data from user's screenshot shows 832.92 MB total across all functions — the top 5 queries represent the majority

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-optimize-convex-query-reads*
*Context gathered: 2026-02-22*

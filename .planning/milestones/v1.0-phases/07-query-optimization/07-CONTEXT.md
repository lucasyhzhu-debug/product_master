# Phase 7: Query Optimization - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate N+1 query patterns in orders and dashboard, paginate large data queries, optimize kitchen queries with proper indexes, and cache COGS for fast product lookups. This phase is about performance and query efficiency -- no new features or UI overhauls.

</domain>

<decisions>
## Implementation Decisions

### COGS caching strategy
- Cache recipe-only COGS (food cost) as `unitCost` on menuProducts -- packaging costs excluded
- Recalculate automatically on ingredient price change (eager, not lazy)
- Depth-1 cascade only -- directly affected products recalculated, deeper chains self-correct on next view
- Display cached unitCost in both product listings AND detail pages
- Admin "Recalculate All Costs" button in MenuProductsManager as safety net
- Recalculate-all shows before/after cost diff summary (product name, old cost, new cost, delta)
- Show visual indicator (badge/icon) on products with stale/pending COGS recalculation

### Kitchen query approach
- Add denormalized `isKitchenVisible` boolean to orders -- set on status change, indexed for fast kitchen queries
- Flat list sorted by earliest due date+time (most urgent first) -- not grouped by status
- Completed orders move to bottom of list, only cleared at end of day
- Orders grouped by order (one card per order with all items, not individual item rows)
- Kitchen order card shows: detailed items, customer details, due date (including day name), and any specific order notes
- Per-item tracking within orders (kitchen marks individual items as done)

### Pagination design
- "Load More" button pattern (not infinite scroll, not page numbers)
- 25 items per batch
- Paginate all large lists (orders, inventory transactions, production logs) -- not just orders
- Show remaining item count on Load More button (e.g., "Load 25 more (150 remaining)")

### Order query restructuring
- Use parallel indexed lookups (Promise.all with by_order index) for N+1 fix -- not denormalized snapshots
- Pre-fetch item count and total price summaries in order list query (not lazy-loaded on expand)
- Include dashboard aggregation queries in optimization scope (same N+1 patterns)
- Dashboard metrics computed live (not cached) -- rely on Convex real-time for freshness

### Claude's Discretion
- Cost change history tracking (whether to log old/new cost changes or just overwrite) -- Claude decides based on complexity vs business value
- Exact stale cost indicator design (badge style, color, placement)
- Loading skeleton and empty state designs for paginated lists
- Specific index design choices for kitchen visibility and order sorting
- Dashboard query restructuring approach

</decisions>

<specifics>
## Specific Ideas

- Kitchen due date should show both the date AND the day name (e.g., "Friday, Feb 14")
- Kitchen completed orders stay visible at bottom of list until day ends (not removed immediately)
- Recalculate-all summary should show a clear diff: product name, old cost, new cost, and delta amount

</specifics>

<deferred>
## Deferred Ideas

- **Revert completed order to packing status** -- new status transition capability, belongs in its own phase (kitchen workflow improvements)
- **Audio/visual alert for new kitchen orders** -- new feature for kitchen UX, separate from query optimization
- Kitchen UI redesign (card layout, mobile optimization) -- separate phase if needed

</deferred>

---

*Phase: 07-query-optimization*
*Context gathered: 2026-02-14*

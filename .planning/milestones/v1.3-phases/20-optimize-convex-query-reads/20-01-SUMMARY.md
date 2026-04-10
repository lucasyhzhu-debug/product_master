---
phase: 20-optimize-convex-query-reads
plan: 01
subsystem: api
tags: [convex, internal-sync, incremental-query, bandwidth-optimization, orders]

# Dependency graph
requires:
  - phase: 19-gofood-depot-kitchen-targets
    provides: stable orders table and externalSyncLogs infrastructure
provides:
  - Incremental getRevenueOrders query with sinceTimestamp filter and by_creationTime index
  - syncInternalOrders action that fetches last sync timestamp and passes it to query
affects:
  - externalData sync health
  - SalesAnalytics bandwidth (reduces saveRevenue calls from ~5.2K to near-zero)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Incremental sync with timestamp buffer: fetch since (lastSyncTimestamp - 24h) to catch late-confirmed orders; dedup handles overlap"
    - "by_creationTime index on orders table: use _creationTime for index-backed incremental queries"

key-files:
  created: []
  modified:
    - convex/integrations/internal/queries.ts
    - convex/integrations/internal/adapter.ts
    - convex/schema.ts

key-decisions:
  - "24-hour buffer before sinceTimestamp catches orders created before last sync but confirmed after; saveRevenue dedup by orderNumber handles overlap"
  - "by_creationTime index on orders makes incremental query index-backed, reducing both mutation calls AND DB read bandwidth"
  - "getRevenueOrders uses by_creationTime .withIndex() not .filter() so Convex can skip rows at storage layer"

patterns-established:
  - "Incremental sync pattern: fetch lastSyncTimestamp via getLatestSyncTimestamp, pass to query as sinceTimestamp, query uses index-backed filter with safety buffer"

requirements-completed: []

# Metrics
duration: 13min
completed: 2026-02-22
---

# Phase 20 Plan 01: Incremental Internal Sync Summary

**Index-backed incremental syncInternalOrders using by_creationTime on orders table, reducing saveRevenue mutation calls from ~5.2K to near-zero on repeated syncs with no new orders**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-02-22T14:22:53Z
- **Completed:** 2026-02-22T14:35:23Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Added `by_creationTime` index to `orders` table in schema, enabling Convex to skip rows at the storage layer
- Updated `getRevenueOrders` to accept optional `sinceTimestamp` arg; queries only orders created since `(sinceTimestamp - 24h buffer)` when provided; falls back to full scan on first sync
- Wired `syncInternalOrders` to fetch `getLatestSyncTimestamp` for the `"internal"` source and pass the result to `getRevenueOrders`, so subsequent syncs only process new orders

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sinceTimestamp to getRevenueOrders + wire incremental sync** - `2d676e9` (feat)

## Files Created/Modified

- `convex/schema.ts` - Added `.index("by_creationTime", ["_creationTime"])` to orders table
- `convex/integrations/internal/queries.ts` - Updated `getRevenueOrders` to accept `sinceTimestamp: v.optional(v.number())` and use `by_creationTime` index for incremental filter
- `convex/integrations/internal/adapter.ts` - Added step 2 to fetch `getLatestSyncTimestamp` and pass result to `getRevenueOrders`

## Decisions Made

- **24-hour buffer:** Applied `sinceTimestamp - 24h` as cutoff to catch orders that were created before the last sync but had their status changed (confirmed) after it. The downstream `saveRevenue` dedup by `externalTransactionId` (orderNumber) safely handles any overlap.
- **Index-backed query:** Used `.withIndex("by_creationTime", (q) => q.gte("_creationTime", cutoff))` instead of `.filter()` so Convex can skip rows at the storage layer, not just filter them in JS.
- **`lastSyncTimestamp ?? undefined`:** Convex's `getLatestSyncTimestamp` returns `null` when no prior sync exists. Coerce to `undefined` so the optional `sinceTimestamp` arg is absent (triggering the full-scan path) on first sync.

## Deviations from Plan

None - plan executed exactly as written. The incremental pattern with index, buffer, and adapter wiring was all specified in the plan and implemented exactly as described.

## Issues Encountered

The `npm run build` (`tsc -b`) returned 188 errors during investigation but all were pre-existing from the branch state (commit `2435405` partially updated the codebase for plan 20-02). After confirming errors were pre-existing with stash test, running `npm run build` fresh (invalidating stale `.tsbuildinfo` cache) showed the build passes cleanly with my changes applied.

## User Setup Required

None - no external service configuration required. Changes take effect when deployed via `npx convex deploy`. Post-deploy, trigger an internal sync via the Sales Analytics page "Sync" button and observe `totalOrders` drops to near-zero on subsequent syncs with no new orders.

## Next Phase Readiness

- Plan 20-01 complete: incremental sync implemented and build passes
- Next plans in phase 20 should continue bandwidth optimization work
- Convex dashboard verification (saveRevenue call count drop) should be done post-deploy to confirm ~90% call count reduction

## Self-Check: PASSED

- convex/integrations/internal/queries.ts: FOUND
- convex/integrations/internal/adapter.ts: FOUND
- convex/schema.ts: FOUND
- .planning/phases/20-.../20-01-SUMMARY.md: FOUND
- Commit 2d676e9: FOUND

---
*Phase: 20-optimize-convex-query-reads*
*Completed: 2026-02-22*

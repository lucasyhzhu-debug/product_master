---
phase: 07-query-optimization
plan: 03
subsystem: api, ui
tags: [convex, pagination, usePaginatedQuery, load-more, cursor-based]

# Dependency graph
requires:
  - phase: 07-01
    provides: "Denormalized fields on orders table (itemCount, totalAmount, customerName)"
provides:
  - "listPaginated query for orders with cursor-based pagination"
  - "countOrders lightweight count query for remaining display"
  - "getLocationTransactionsPaginated for inventory transactions"
  - "getRecentPaginated for production log"
  - "getRevenuePaginated for external revenue data"
  - "useConvexOrdersPaginated hook with usePaginatedQuery"
  - "Load More UI pattern in OrderManager"
affects: ["08-schema-cleanup", "09-frontend-factories"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Convex paginationOptsValidator + paginate() for cursor-based pagination"
    - "usePaginatedQuery with initialNumItems: 25 for Load More pattern"
    - "Dual-hook pattern: paginated for all-view, non-paginated for category filters"
    - "Skip support via 'skip' arg in both paginated and non-paginated hooks"

key-files:
  created: []
  modified:
    - "convex/orders/queries.ts"
    - "convex/inventory/queries.ts"
    - "convex/productionLog/queries.ts"
    - "convex/externalData/queries.ts"
    - "src/hooks/convex/useOrders.ts"
    - "src/hooks/convex/index.ts"
    - "src/pages/OrderManager.tsx"

key-decisions:
  - "Paginated query supports single status only (no arrays) due to Convex filter() + paginate() limitation"
  - "OrderManager uses paginated hook for All view, non-paginated for category views (dual-hook pattern)"
  - "useConvexOrders accepts 'skip' string to disable query when paginated hook is active"
  - "countOrders uses full .collect().length (Convex has no native count API)"
  - "Existing non-paginated queries preserved for backward compatibility"

patterns-established:
  - "Load More pattern: CanLoadMore -> button with remaining count, LoadingMore -> spinner, Exhausted -> total loaded"
  - "Skip pattern for dual-hook components: pass 'skip' to disable unused query"

# Metrics
duration: 7min
completed: 2026-02-14
---

# Phase 7 Plan 3: Cursor-Based Pagination Summary

**Convex paginate() + usePaginatedQuery with Load More UI on order list, plus paginated queries for inventory/production/revenue**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-14T12:45:00Z
- **Completed:** 2026-02-14T12:52:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Four new paginated backend queries: orders, inventory transactions, production log, external revenue
- OrderManager shows 25 orders initially with "Load 25 more (X remaining)" button
- Dual-hook pattern cleanly separates paginated (all) and non-paginated (category) views
- No N+1 queries in paginated order list (uses denormalized fields from Phase 07-01)

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend paginated queries** - `7cb330f` (feat)
2. **Task 2: Frontend pagination hooks + Load More UI** - `5262d2c` (feat)

## Files Created/Modified
- `convex/orders/queries.ts` - Added listPaginated, countOrders queries; deprecation comment on list
- `convex/inventory/queries.ts` - Added getLocationTransactionsPaginated query
- `convex/productionLog/queries.ts` - Added getRecentPaginated query
- `convex/externalData/queries.ts` - Added getRevenuePaginated query
- `src/hooks/convex/useOrders.ts` - Added useConvexOrdersPaginated hook, skip support on useConvexOrders
- `src/hooks/convex/index.ts` - Exported useConvexOrdersPaginated
- `src/pages/OrderManager.tsx` - Dual-hook pattern, Load More button, loading/exhausted states

## Decisions Made
- Paginated query only supports single status filter (not arrays) because Convex paginate() cannot chain after .filter(). Multi-status category views continue using the existing list query.
- OrderManager uses dual-hook pattern: useConvexOrdersPaginated for "All" view (no filter), useConvexOrders for category tabs. Both hooks always called but one is skipped via "skip" arg.
- countOrders uses .collect().length since Convex has no native count API. Acceptable for order counts.
- Existing non-paginated queries preserved for backward compatibility (KitchenView, category tabs, other consumers).

## Deviations from Plan

None - plan executed exactly as written. The plan's item (h) correctly anticipated the multi-status limitation and recommended keeping the non-paginated hook for category views.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 07 (Query Optimization) is now COMPLETE (all 3 plans done)
- Phase 08 (Schema Cleanup) is unblocked
- Paginated queries available for future pages (inventory, production log, revenue)

---
*Phase: 07-query-optimization*
*Completed: 2026-02-14*

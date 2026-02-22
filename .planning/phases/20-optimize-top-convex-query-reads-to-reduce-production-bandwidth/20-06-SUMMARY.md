---
phase: 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth
plan: 06
subsystem: api
tags: [convex, bandwidth, internalQuery, action, react-hooks, sales-analytics]

# Dependency graph
requires:
  - phase: 20-05
    provides: fetchOutletStockSummary action + actions.ts pattern
  - phase: 20-03
    provides: externalData queries.ts with periodPresetValidator
provides:
  - getRevenueByOutletInternal as internalQuery in convex/externalData/queries.ts
  - fetchRevenueByOutlet action in convex/externalData/actions.ts
  - useConvexRevenueByOutlet as on-demand action hook with refresh callback
affects: [sales-analytics, SalesAnalytics page, OverviewTab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "internalQuery + action + useAction hook conversion (6th application of this pattern)"
    - "Explicit local type + cast for action return shape (same as 20-04, 20-05)"

key-files:
  created: []
  modified:
    - convex/externalData/queries.ts
    - convex/externalData/actions.ts
    - src/hooks/convex/useExternalData.ts
    - src/components/salesAnalytics/OverviewTab.tsx

key-decisions:
  - "RevenueByOutlet explicit local type defined in hook (action returns Promise<unknown>; same cast pattern as 20-04 and 20-05)"
  - "refresh callback exposed but not wired to external sync handlers — PlatformHierarchy component owns its own fetch lifecycle; preset changes trigger re-fetch automatically"

patterns-established:
  - "Pattern: internalQuery + action + useAction hook; 6th repetition; well-established for analytical queries"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-02-22
---

# Phase 20 Plan 06: getRevenueByOutlet Conversion Summary

**`getRevenueByOutlet` converted from 30 MB reactive subscription to on-demand internalQuery + action with `useConvexRevenueByOutlet` hook using useState/useEffect fetch pattern**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-22T14:54:15Z
- **Completed:** 2026-02-22T15:02:00Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Renamed `getRevenueByOutlet` to `getRevenueByOutletInternal` and converted to `internalQuery` in `convex/externalData/queries.ts`
- Added `fetchRevenueByOutlet` action wrapper in `convex/externalData/actions.ts` (appended after `fetchOutletStockSummary`)
- Replaced reactive `useQuery` in `useConvexRevenueByOutlet` with `useAction + useState + useCallback + useEffect` pattern, exposing `refresh` callback
- Updated `PlatformHierarchy` in `OverviewTab.tsx` to destructure `refresh` from hook

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert getRevenueByOutlet to internalQuery + action + update hook** - `d32b96a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `convex/externalData/queries.ts` - `getRevenueByOutlet` renamed to `getRevenueByOutletInternal`, changed from `query` to `internalQuery`
- `convex/externalData/actions.ts` - New `fetchRevenueByOutlet` action wrapper calling `getRevenueByOutletInternal`
- `src/hooks/convex/useExternalData.ts` - `useConvexRevenueByOutlet` replaced with on-demand action hook; explicit `RevenueByOutlet` local type defined; `refresh` callback exposed
- `src/components/salesAnalytics/OverviewTab.tsx` - `PlatformHierarchy` destructures `refresh: refreshByOutlet` from hook

## Decisions Made
- Explicit local `RevenueByOutlet` type defined in hook (mirrors `OutletData`/`PlatformData` types from query handler) — action returns `Promise<unknown>`, FunctionReturnType resolves to `unknown`, cast required; same pattern as 20-04 and 20-05
- `refresh` callback exposed but not externally wired — `PlatformHierarchy` component is self-contained; preset changes trigger `load` via `useCallback` dep; no parent sync handler integration needed for this section

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 6/8 plans in Phase 20 complete; `getRevenueByOutlet` now on-demand
- Patterns fully established: internalQuery + action + useAction hook conversion
- Ready for plan 20-07 (next bandwidth target)

---
*Phase: 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth*
*Completed: 2026-02-22*

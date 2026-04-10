---
phase: 20-optimize-convex-query-reads
plan: 04
subsystem: api
tags: [convex, bandwidth, optimization, internalQuery, action, promise-all]

# Dependency graph
requires:
  - phase: 20-optimize-convex-query-reads
    plan: 02
    provides: "internalQuery + action wrapper pattern, fetchDashboardSummaryByPeriod reference implementation"
provides:
  - "getRestockOverviewInternal as internalQuery (not public reactive subscription)"
  - "fetchRestockOverview action wrapper for on-demand fetching"
  - "useConvexRestockOverview using useAction + useState on-demand pattern"
  - "N+1 parallel fixes for GoBiz externalRevenueItems and Internal order+orderItems lookups"
affects: [phase-21, restock-planner, bandwidth-monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "internalQuery + action wrapper: same pattern as getDashboardSummaryByPeriodInternal (Plan 20-02)"
    - "Promise.all parallel fetch replacing sequential for..of with await inside"
    - "Local type definition for action return shape (avoids FunctionReturnType<unknown> from Promise<unknown> handler)"
    - "refreshOverview wired into handleSyncAll so overview reloads after every sync"

key-files:
  created: []
  modified:
    - convex/externalData/queries.ts
    - convex/externalData/actions.ts
    - src/hooks/convex/useExternalData.ts
    - src/pages/RestockPlanner.tsx

key-decisions:
  - "fetchRestockOverview handler typed as Promise<unknown> (same as fetchDashboardSummaryByPeriod) to avoid tsc -b circular type inference"
  - "RestockOverview local type defined explicitly in useExternalData.ts with cast (result as RestockOverview) — FunctionReturnType resolves to unknown when handler returns Promise<unknown>"
  - "refreshOverview called after all sync actions settle in handleSyncAll — ensures UI refreshes with latest synced data without requiring a page reload"
  - "GoBiz N+1: single Promise.all for all externalRevenueItems, replacing sequential for..of with await"
  - "Internal N+1: two Promise.all batches (orders by orderNumber, then orderItems for valid orders), replacing two-level sequential nested awaits"

patterns-established:
  - "Pattern: Always cast action result to explicit local type when handler returns Promise<unknown>"
  - "Pattern: Wire refresh callback into sync handlers to keep on-demand data current after user-triggered syncs"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-02-22
---

# Phase 20 Plan 04: Restock Overview N+1 Fix + Action Conversion Summary

**getRestockOverview converted from 47 MB reactive subscription to internalQuery + on-demand action, with GoBiz and Internal N+1 sequential loops replaced by Promise.all parallel fetches**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-02-22T00:00:00Z
- **Completed:** 2026-02-22T00:12:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Renamed `getRestockOverview` to `getRestockOverviewInternal` and converted from `query` to `internalQuery` — eliminates persistent reactive subscription
- GoBiz N+1: replaced sequential `for...of` (one `externalRevenueItems` query per revenue record) with a single `Promise.all` parallel fetch
- Internal N+1: replaced two-level sequential await (per revenue record: order lookup then orderItems lookup) with two `Promise.all` batches (all orders in parallel, then all orderItems in parallel)
- Added `fetchRestockOverview` action in `actions.ts` wrapping the internalQuery
- Updated `useConvexRestockOverview` to use `useAction + useState + useCallback + useEffect` on-demand pattern with typed `RestockOverview` local type
- Wired `refreshOverview` into `handleSyncAll` so the Restock Planner overview reloads after every sync

## Task Commits

1. **Task 1: Convert getRestockOverview to internalQuery + fix N+1 patterns** - `7a849a1` (feat)
2. **Task 2: Add action wrapper + update frontend hook** - `8423322` (feat)

## Files Created/Modified

- `convex/externalData/queries.ts` - Renamed export to `getRestockOverviewInternal` as `internalQuery`; GoBiz N+1 replaced with `Promise.all`; Internal two-level N+1 replaced with two `Promise.all` batches
- `convex/externalData/actions.ts` - Added `fetchRestockOverview` action wrapping the internalQuery
- `src/hooks/convex/useExternalData.ts` - Replaced `useQuery` subscription with `useAction + useState` on-demand hook; added explicit `RestockOverview` local type definition
- `src/pages/RestockPlanner.tsx` - Destructures `refresh: refreshOverview`; wires it into `handleSyncAll`

## Decisions Made

- `fetchRestockOverview` handler typed as `Promise<unknown>` — same fix as Plan 20-02 (`fetchDashboardSummaryByPeriod`) to avoid tsc -b circular type inference when `runQuery` return type references the action itself
- `RestockOverview` defined as an explicit local type in `useExternalData.ts` with `result as RestockOverview` cast — because `FunctionReturnType<typeof api.externalData.actions.fetchRestockOverview>` resolves to `unknown` when the handler returns `Promise<unknown>`
- `refreshOverview` wired into `handleSyncAll` after all sync actions settle — ensures the planner displays fresh data without a page reload

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `Promise<unknown>` return type to fetchRestockOverview handler**
- **Found during:** Task 2 (full build check)
- **Issue:** Build error TS7022/TS7023 — `fetchRestockOverview` implicitly had type `any` due to circular type inference in tsc -b project-references mode (same issue documented in STATE.md for Plan 20-02)
- **Fix:** Added `: Promise<unknown>` return type annotation to the action handler
- **Files modified:** convex/externalData/actions.ts
- **Verification:** `npm run build` passes after fix
- **Committed in:** 8423322 (Task 2 commit)

**2. [Rule 1 - Bug] Replaced FunctionReturnType with explicit local RestockOverview type**
- **Found during:** Task 2 (full build check)
- **Issue:** `FunctionReturnType<typeof api.externalData.actions.fetchRestockOverview>` resolved to `unknown` (since handler is `Promise<unknown>`), causing TS2339 errors on `overview.channels`, `overview.summary` in RestockPlanner
- **Fix:** Defined explicit `RestockK3MartChannel`, `RestockChannel`, `RestockOverview` local types matching the actual return shape; cast fetch result as `RestockOverview`
- **Files modified:** src/hooks/convex/useExternalData.ts
- **Verification:** `npm run type-check` + `npm run build` both pass
- **Committed in:** 8423322 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - same circular type inference issue documented in Phase 20-02 precedent)
**Impact on plan:** Essential for build correctness. No scope creep — follows established 20-02 pattern exactly.

## Issues Encountered

None beyond the circular type inference issue (handled by auto-fix, same as Plan 20-02).

## Next Phase Readiness

- `getRestockOverview` is now an internalQuery — will disappear from Convex dashboard public query list after deploy
- Bandwidth reduction for this query expected to be significant (47 MB saved on each subscription refresh)
- Post-deploy: verify Restock Planner loads all channel data correctly; confirm `getRestockOverview` no longer appears in public queries on Convex dashboard
- Plans 20-05+ can proceed (remaining bandwidth targets)

---
*Phase: 20-optimize-convex-query-reads*
*Completed: 2026-02-22*

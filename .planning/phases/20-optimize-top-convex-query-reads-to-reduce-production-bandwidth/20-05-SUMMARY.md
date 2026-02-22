---
phase: 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth
plan: 05
subsystem: api
tags: [convex, internalQuery, action, bandwidth, k3mart, react-hooks]

# Dependency graph
requires:
  - phase: 20-04
    provides: fetchRestockOverview action pattern established in externalData/actions.ts
provides:
  - getOutletStockSummaryInternal as internalQuery in k3martCockpit/queries.ts
  - fetchOutletStockSummary action in externalData/actions.ts
  - useConvexOutletStockSummary hook using on-demand action fetch with refresh callback
affects: [k3mart-cockpit, bandwidth-optimization, phase-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "internalQuery + action + explicit local type cast (same as 20-02, 20-04)"
    - "useAction + useState + useCallback + useEffect for on-demand fetch hook"
    - "refresh callback returned from hook, wired into sync handlers"

key-files:
  created: []
  modified:
    - convex/k3martCockpit/queries.ts
    - convex/externalData/actions.ts
    - src/hooks/convex/useK3MartCockpit.ts
    - src/pages/K3MartCockpit.tsx

key-decisions:
  - "OutletStockSummary defined as explicit local type in hook (action returns Promise<unknown>, FunctionReturnType resolves to unknown — same pattern as 20-04)"
  - "refreshOutletStock wired into handleSync after Promise.allSettled — data reloads after every sync without page reload"
  - "isLoading starts as true so cockpit loading state shows on first page visit"

patterns-established:
  - "Pattern: internalQuery+action conversion — rename export, change query() to internalQuery(), add action in externalData/actions.ts calling ctx.runQuery(internal.*)"
  - "Pattern: explicit local type cast for action return shape when FunctionReturnType resolves to unknown"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-02-22
---

# Phase 20 Plan 05: K3Mart getOutletStockSummary On-Demand Conversion Summary

**getOutletStockSummary (48 MB) converted from reactive subscription to internalQuery + action with on-demand hook and post-sync refresh**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-22T~09:30Z
- **Completed:** 2026-02-22
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Renamed `getOutletStockSummary` to `getOutletStockSummaryInternal` and converted from `query` to `internalQuery` — eliminates reactive subscription
- Added `fetchOutletStockSummary` action in `externalData/actions.ts` using the established `ctx.runQuery(internal.*)` pattern
- Replaced `useQuery` in `useConvexOutletStockSummary` with `useAction + useState + useCallback + useEffect` for on-demand fetching
- Wired `refreshOutletStock` into `handleSync` so outlet data reloads after every K3Mart sync without requiring a page reload

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert getOutletStockSummary to internalQuery + action** - `69799a9` (feat)
2. **Task 2: Update frontend hook and K3MartCockpit page** - `ad0ad68` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `convex/k3martCockpit/queries.ts` - Added `internalQuery` import; renamed `getOutletStockSummary` -> `getOutletStockSummaryInternal` as `internalQuery`
- `convex/externalData/actions.ts` - Added `fetchOutletStockSummary` action calling internal query via `ctx.runQuery`
- `src/hooks/convex/useK3MartCockpit.ts` - Replaced reactive `useQuery` with action-based on-demand fetch; defined explicit `OutletStockSummary` local type; returns `refresh` callback
- `src/pages/K3MartCockpit.tsx` - Destructures `refresh: refreshOutletStock`; wires it into `handleSync` after sync actions settle

## Decisions Made
- Explicit local `OutletStockSummary` type defined in hook rather than using `FunctionReturnType` — action handler returns `Promise<unknown>` to avoid tsc -b circular type inference (same pattern established in 20-04)
- `refreshOutletStock` called after `Promise.allSettled` in `handleSync` — ensures data reload after sync regardless of individual sync outcomes
- `isLoading` initialized to `true` so the cockpit loading skeleton shows on first visit before the action returns

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FunctionReturnType resolves to unknown — replaced with explicit local type**
- **Found during:** Task 2 (frontend hook update)
- **Issue:** `FunctionReturnType<typeof api.externalData.actions.fetchOutletStockSummary>` resolves to `{}` (unknown) in tsc -b build because the action handler is typed as `Promise<unknown>`. Caused TS2339 errors on `.outlets` access in K3MartCockpit.tsx
- **Fix:** Removed `FunctionReturnType` import; defined explicit `OutletStockSummary`, `OutletSummaryRow`, `OutletProduct` local types in the hook; cast action result with `result as OutletStockSummary`
- **Files modified:** `src/hooks/convex/useK3MartCockpit.ts`
- **Verification:** `npm run build` passes with no type errors
- **Committed in:** `ad0ad68` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type mismatch)
**Impact on plan:** Necessary fix — same pattern as 20-04 (RestockOverview). No scope creep.

## Issues Encountered
- `FunctionReturnType` on an action returning `Promise<unknown>` resolves to `{}` in strict tsc -b mode, causing property-access type errors downstream. Fixed by explicit local type + cast (consistent with 20-04 pattern).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 20-05 complete; 5/8 plans done in Phase 20
- K3Mart Cockpit now loads outlet stock on page visit with manual refresh, not as continuous reactive subscription
- Post-deploy: verify outlet data still appears in K3Mart Cockpit; check Convex dashboard bandwidth for getOutletStockSummary drop
- Next: 20-06 (next bandwidth target per roadmap)

---
*Phase: 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth*
*Completed: 2026-02-22*

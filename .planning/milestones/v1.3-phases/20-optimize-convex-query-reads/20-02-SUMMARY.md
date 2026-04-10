---
phase: 20-optimize-convex-query-reads
plan: 02
subsystem: api
tags: [convex, bandwidth, actions, useAction, subscription-to-fetch]

# Dependency graph
requires:
  - phase: 19-gofood-depot-kitchen-targets
    provides: stable base with externalData queries for sales analytics
provides:
  - getDashboardSummaryByPeriodInternal internalQuery (no longer reactive public query)
  - fetchDashboardSummaryByPeriod action in convex/externalData/actions.ts
  - useConvexDashboardSalesSummaryByPeriod uses on-demand action fetch with refresh callback
affects: [SalesAnalytics, OverviewTab, bandwidth-optimization]

# Tech tracking
tech-stack:
  added: [convex/externalData/actions.ts (new file)]
  patterns: [subscription-to-fetch conversion, useAction + useState + useCallback + useEffect hook pattern]

key-files:
  created:
    - convex/externalData/actions.ts
  modified:
    - convex/externalData/queries.ts
    - convex/_generated/api.d.ts
    - src/hooks/convex/useExternalData.ts
    - src/components/salesAnalytics/OverviewTab.tsx

key-decisions:
  - "getDashboardSummaryByPeriod renamed to getDashboardSummaryByPeriodInternal and changed from query to internalQuery — no longer a public reactive subscription"
  - "periodPresetValidator duplicated inline in actions.ts (not imported from queries.ts) to break circular type inference with tsc -b project-references build"
  - "Action handler typed as Promise<unknown> with explicit cast in hook to avoid TS7022 circular implicit any error from tsc -b"
  - "DashboardSummaryByPeriod type defined locally in useExternalData.ts to avoid FunctionReturnType circular dependency chain"
  - "handleRefreshAll in OverviewTab awaits refreshSummary() after sync calls complete since data is no longer reactive"

patterns-established:
  - "Subscription-to-fetch: move heavyweight queries to internalQuery + action wrapper, hook uses useAction + useState/useCallback/useEffect"
  - "Type circularity workaround: when action returns runQuery result, type handler as Promise<unknown> and cast at call site"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-02-22
---

# Phase 20 Plan 02: Subscription-to-Fetch Conversion for getDashboardSummaryByPeriod Summary

**getDashboardSummaryByPeriod converted from reactive useQuery subscription to on-demand useAction fetch, eliminating ~205 MB / 1.9K calls bandwidth spike during GoBiz sync runs**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-22T14:10:00Z
- **Completed:** 2026-02-22T14:34:34Z
- **Tasks:** 2
- **Files modified:** 5 (1 created)

## Accomplishments

- Converted `getDashboardSummaryByPeriod` from a public `query` to an `internalQuery` (`getDashboardSummaryByPeriodInternal`) — eliminating reactive re-pushes during sync runs
- Created `convex/externalData/actions.ts` with `fetchDashboardSummaryByPeriod` action that calls the internal query on-demand
- Updated `useConvexDashboardSalesSummaryByPeriod` hook to use `useAction` + `useState` pattern (loads on mount, returns `refresh` callback)
- Wired `refreshSummary()` into `handleRefreshAll` in OverviewTab so data reloads after sync actions

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert getDashboardSummaryByPeriod to internalQuery + create action wrapper** - `2435405` (feat)
2. **Task 2: Update frontend hook and OverviewTab to use action-based fetch** - `dec55aa` (feat)

## Files Created/Modified

- `convex/externalData/actions.ts` - New file: `fetchDashboardSummaryByPeriod` action wrapping internalQuery
- `convex/externalData/queries.ts` - `getDashboardSummaryByPeriod` → `getDashboardSummaryByPeriodInternal` (internalQuery), `periodPresetValidator` exported
- `convex/_generated/api.d.ts` - Added `externalData_actions` import and `"externalData/actions"` entry in fullApi
- `src/hooks/convex/useExternalData.ts` - Hook rewritten: `useAction` + `useState` + `useCallback` + `useEffect`, local `DashboardSummaryByPeriod` type
- `src/components/salesAnalytics/OverviewTab.tsx` - Destructures `refresh: refreshSummary`, calls `await refreshSummary()` after `handleRefreshAll`

## Decisions Made

- **periodPresetValidator duplication:** Inlined in `actions.ts` instead of importing from `queries.ts`. The tsc -b project-references build triggered TS7022 (circular implicit any) when the action imported from queries.ts. Inline duplication breaks the cycle cleanly.
- **Promise<unknown> return type:** The `handler` in `actions.ts` is explicitly typed as `Promise<unknown>` to prevent TS7022 circular type inference. The hook casts the result to `DashboardSummaryByPeriod`.
- **Local type definition:** `DashboardSummaryByPeriod` defined inline in `useExternalData.ts` matching the exact return shape of the internal query. Avoids `FunctionReturnType<typeof api.externalData.actions...>` circularity.
- **api.d.ts manual update:** The generated `api.d.ts` was manually updated with `externalData_actions` import and registration. This will be overwritten by the next `npx convex dev` run (which will generate the correct content from `actions.ts`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tsc -b circular type inference in actions.ts**
- **Found during:** Task 2 (build verification)
- **Issue:** `tsc -b` (project-references build used by `npm run build`) emitted TS7022 for `fetchDashboardSummaryByPeriod` due to circular type inference through `ctx.runQuery(internal.externalData.queries.getDashboardSummaryByPeriodInternal, ...)`. `tsc --noEmit` passed but `tsc -b` did not.
- **Fix:** (a) Inlined `periodPresetValidator` in `actions.ts` instead of importing from `queries.ts`; (b) Added explicit `Promise<unknown>` return type on handler; (c) Cast result to `DashboardSummaryByPeriod` at call site in hook; (d) Defined `DashboardSummaryByPeriod` locally in hook instead of via `FunctionReturnType`
- **Files modified:** `convex/externalData/actions.ts`, `src/hooks/convex/useExternalData.ts`
- **Verification:** `npm run build` passes with no TypeScript errors
- **Committed in:** `dec55aa` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug: circular type inference)
**Impact on plan:** Essential fix for build to pass. Type safety maintained via local type definition matching the query's actual return shape.

## Issues Encountered

- Git stash accidentally switched branch to `main` during a test verification step. Recovered by switching back to the phase branch and re-applying Task 2 changes.
- The Convex dev server (or a VS Code extension) was reverting manual edits to `api.d.ts`. Resolved by applying all edits sequentially without intermediate checks, then committing.

## User Setup Required

None - no external service configuration required. Data loads automatically on Sales Analytics page visit.

**Post-deploy verification:** Open Sales Analytics page → data should load on visit. In Convex dashboard, `getDashboardSummaryByPeriod` should no longer appear in public query list. Expected bandwidth reduction: ~90% for this query (~205 MB → near zero during sync runs).

## Next Phase Readiness

- Plan 20-02 complete. Proceeding to plan 20-03 (next bandwidth optimization target).
- The `getDashboardSummaryByPeriodInternal` pattern is established — future plans can use the same subscription-to-fetch template.

---
*Phase: 20-optimize-convex-query-reads*
*Completed: 2026-02-22*

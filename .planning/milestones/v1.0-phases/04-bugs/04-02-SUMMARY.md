---
phase: 04-bugs
plan: 02
subsystem: backend, frontend
tags: [convex, scheduler, cost-invalidation, production-tracking, todo-cleanup]

# Dependency graph
requires:
  - phase: 03-tech-debt
    provides: clean codebase with removed deprecated shims
provides:
  - convex/lib/costInvalidation.ts with invalidateRecipeCosts and invalidatePackagingCosts internalMutations
  - Async cost recalculation on ingredient/material price changes via Convex scheduler
  - getOrderProductionRecords query for OrderDetail production step
  - K3 Mart Cockpit backlog items tracked in REQUIREMENTS.md v2 (K3MART-01 through K3MART-06)
  - Zero TODO comments in production code (src/ and convex/ directories)
affects: [phase-06-bom-migration, phase-07-query-optimization]

# Tech tracking
tech-stack:
  added: []
  patterns: [convex-scheduler-cost-invalidation, backlog-reference-comments]

key-files:
  created:
    - convex/lib/costInvalidation.ts
  modified:
    - convex/ingredients/mutations.ts
    - convex/materials/mutations.ts
    - convex/orders/queries.ts
    - src/pages/OrderDetail.tsx
    - src/pages/K3MartCockpit.tsx
    - .planning/REQUIREMENTS.md
    - convex/_generated/api.d.ts

key-decisions:
  - "Cost invalidation is depth-1 only -- does not cascade to linked recipe consumers"
  - "K3Mart TODOs converted to BACKLOG references, not implemented (deferred to v2)"
  - "Production records mapped per-item with parent product name for display context"
  - "Codegen required to register costInvalidation internal mutations in generated API types"

patterns-established:
  - "BACKLOG: K3MART-XX comment pattern for tracked deferred work"
  - "Convex scheduler pattern: ctx.scheduler.runAfter(0, internal.lib.X.fn, { id }) for async cache invalidation"

# Metrics
duration: 9min
completed: 2026-02-13
---

# Phase 4 Plan 2: TODO Comment Resolution Summary

**Async cost invalidation via Convex scheduler, production data wired to OrderDetail, and K3Mart TODOs converted to tracked backlog items (K3MART-01 through K3MART-06)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-13T15:56:03Z
- **Completed:** 2026-02-13T16:05:28Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created `convex/lib/costInvalidation.ts` with two internalMutation functions that recalculate cached costs when ingredient/material prices change
- Wired `ctx.scheduler.runAfter(0, ...)` in both `ingredients/mutations.ts` and `materials/mutations.ts` to trigger async cost invalidation
- Added `getOrderProductionRecords` query to `convex/orders/queries.ts` and wired it into `OrderDetail.tsx` production step
- Converted 7 K3MartCockpit TODO comments to BACKLOG references with matching entries in REQUIREMENTS.md v2
- Achieved zero TODO comments across all production code (`src/` and `convex/` directories)

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend cost invalidation + production records query** - `bbde6d4` (feat)
2. **Task 2: Frontend TODO resolution + K3Mart backlog conversion** - `5c71a86` (feat)

**Note:** OrderDetail.tsx production query changes were captured in parallel commit `e41d0de` (04-01 executor) due to concurrent main-branch execution.

## Files Created/Modified
- `convex/lib/costInvalidation.ts` - internalMutation functions for recipe and packaging cost recalculation
- `convex/ingredients/mutations.ts` - Added scheduler call to invalidateRecipeCosts after ingredient update
- `convex/materials/mutations.ts` - Added scheduler call to invalidatePackagingCosts after material update
- `convex/orders/queries.ts` - Added getOrderProductionRecords query
- `src/pages/OrderDetail.tsx` - Wired production records query, replaced deprecated getProductionUnits
- `src/pages/K3MartCockpit.tsx` - Converted 7 TODOs to BACKLOG references
- `.planning/REQUIREMENTS.md` - Added K3 Mart Cockpit backlog section (K3MART-01 through K3MART-06)
- `convex/_generated/api.d.ts` - Regenerated to include new internal functions

## Decisions Made
- Cost invalidation walks depth-1 only (ingredient -> componentIngredient -> recipeComponent -> recipeVersion). Linked recipe consumers are NOT cascaded -- they self-correct on next view/save.
- K3MartCockpit TODOs were converted to backlog references rather than implementing the features, since they represent substantial new functionality (dispatch plans, stock movements, bump approval).
- Production records are mapped with parent product name included for display context (e.g., "Big Ball (Frollie Original 3-Pack)").
- Ran `npx convex codegen` to regenerate `_generated/api.d.ts` since new `internalMutation` exports need to be registered for TypeScript type safety.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ran Convex codegen to register new internal mutations**
- **Found during:** Task 2 (build verification)
- **Issue:** `tsc -b` failed with `Property 'lib' does not exist on type internal` because `_generated/api.d.ts` did not include the new `costInvalidation` module
- **Fix:** Ran `npx convex codegen` to regenerate TypeScript bindings
- **Files modified:** `convex/_generated/api.d.ts`
- **Verification:** `npm run build` passes
- **Committed in:** `5c71a86` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Codegen step was necessary for build to pass. No scope creep.

## Issues Encountered
- Parallel executor (plan 04-01) committed OrderDetail.tsx changes that included our production records query edits, since both executors were modifying the same file on main. Our changes were preserved correctly, just attributed to the wrong commit. This is a known risk of parallel execution without feature branches.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 (Bugs) is now complete with both plans executed
- Cost invalidation is ready for production -- ingredient/material price changes will automatically cascade to recipe/packaging cost caches
- K3 Mart Cockpit has clear backlog items for future implementation (K3MART-01 through K3MART-06)

## Self-Check: PASSED

All 8 files verified present. Both commit hashes (bbde6d4, 5c71a86) found in git log.

---
*Phase: 04-bugs*
*Completed: 2026-02-13*

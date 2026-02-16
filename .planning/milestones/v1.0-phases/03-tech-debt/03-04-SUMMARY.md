---
phase: 03-tech-debt
plan: 04
subsystem: api
tags: [convex, refactor, barrel-export, api-paths]

# Dependency graph
requires:
  - phase: 03-tech-debt
    provides: "Prior tech debt cleanup (plans 01-03) completed"
provides:
  - "Clean API path resolution for order mutations via convex/orders/mutations/index.ts"
  - "No more confusing shim file that masked the true module structure"
affects: [04-bugs, orders, kitchen, packaging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "api.orders.mutations.index.X pattern for accessing barrel-exported order mutations"

key-files:
  created: []
  modified:
    - "convex/_generated/api.d.ts"
    - "src/hooks/convex/useOrders.ts"
    - "src/hooks/convex/useKitchenStats.ts"
    - "src/pages/KitchenViewV2.tsx"
    - "src/pages/PackagingView.tsx"
    - "src/hooks/__tests__/useConvexHooks.test.tsx"
    - "tests/convex/helpers.ts"
    - "tests/convex/ballDistribution.test.ts"
    - "tests/convex/orderLifecycle.test.ts"
    - "tests/convex/orders.test.ts"

key-decisions:
  - "Used api.orders.mutations.index.X path (mechanical find-replace) instead of domain-specific paths for simplicity"
  - "fifo.test.ts failure is pre-existing (table schema issue) -- not related to this plan"

patterns-established:
  - "Barrel exports in Convex directories use api.module.submodule.index.X path pattern"

# Metrics
duration: 4min
completed: 2026-02-13
---

# Phase 3 Plan 4: Remove Orders Mutations Shim Summary

**Deleted deprecated convex/orders/mutations.ts re-export shim and migrated 135 API references across 8 source files to use api.orders.mutations.index.X barrel path**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-13T10:52:17Z
- **Completed:** 2026-02-13T10:56:18Z
- **Tasks:** 2
- **Files modified:** 11 (1 deleted, 10 updated)

## Accomplishments
- Deleted the 23-line `convex/orders/mutations.ts` shim that re-exported everything from `./mutations/index`
- Migrated all 135 references across frontend hooks (useOrders, useKitchenStats), pages (KitchenViewV2, PackagingView), and test files (4 test suites + 1 test helper)
- Updated `api.d.ts` to remove the shim's module registration
- Updated mock in `useConvexHooks.test.tsx` to match the new `index`-based path structure
- Build, type-check, and all 91 affected tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Test Convex API path resolution** - (no commit, investigation only)
2. **Task 2: Delete shim and update all callers** - `1273279` (refactor)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `convex/orders/mutations.ts` - DELETED (deprecated shim file)
- `convex/_generated/api.d.ts` - Removed shim import and module registration
- `src/hooks/convex/useOrders.ts` - 12 references updated to `.index.` path
- `src/hooks/convex/useKitchenStats.ts` - 5 references updated to `.index.` path
- `src/pages/KitchenViewV2.tsx` - 5 references updated to `.index.` path
- `src/pages/PackagingView.tsx` - 1 reference updated to `.index.` path
- `tests/convex/orderLifecycle.test.ts` - 51 references updated to `.index.` path
- `tests/convex/ballDistribution.test.ts` - 32 references updated to `.index.` path
- `tests/convex/orders.test.ts` - 27 references updated to `.index.` path
- `tests/convex/helpers.ts` - 2 references updated to `.index.` path
- `src/hooks/__tests__/useConvexHooks.test.tsx` - Mock API structure updated with `index` nesting

## Decisions Made
- Used `api.orders.mutations.index.X` path instead of domain-specific paths (e.g., `api.orders.mutations.orderCrud.create`). The index barrel path was chosen because it's a simple mechanical find-replace, maintains a consistent pattern across the codebase, and keeps the single barrel import point.
- Confirmed this is Outcome B (migration needed): Convex registers both `orders/mutations` (shim) and `orders/mutations/index` (directory) as separate modules. After deleting the shim, only the `index` path remains valid.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated useConvexHooks.test.tsx mock**
- **Found during:** Task 2 (test verification)
- **Issue:** The mock API structure in `useConvexHooks.test.tsx` had mutations at `api.orders.mutations.create` but the code now expects `api.orders.mutations.index.create`, causing 2 test failures
- **Fix:** Nested the mock mutations under an `index` key to match the new path structure
- **Files modified:** `src/hooks/__tests__/useConvexHooks.test.tsx`
- **Verification:** All 20 tests in the file pass
- **Committed in:** `1273279` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for test correctness. No scope creep.

## Issues Encountered
- Pre-existing `fifo.test.ts` failure (1 test) -- table schema issue unrelated to this plan. Not introduced by our changes.
- Pre-existing e2e spec files with 0 tests (empty Playwright specs) -- not related.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 03 (Tech Debt) is now COMPLETE (all 4 plans executed)
- Phase 04 (Bugs) is unblocked and ready to begin
- The codebase has a cleaner module structure with no deprecated shim files

## Self-Check: PASSED

- VERIFIED: `convex/orders/mutations.ts` is deleted
- FOUND: `convex/orders/mutations/index.ts` (barrel export intact)
- FOUND: `src/hooks/convex/useOrders.ts`
- FOUND: `src/hooks/convex/useKitchenStats.ts`
- FOUND: `.planning/phases/03-tech-debt/03-04-SUMMARY.md`
- FOUND: commit `1273279`

---
*Phase: 03-tech-debt*
*Completed: 2026-02-13*

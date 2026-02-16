---
phase: 07-query-optimization
plan: 02
subsystem: database, ui
tags: [convex, cogs, cost-caching, internal-mutation, scheduler, react]

# Dependency graph
requires:
  - phase: 07-01
    provides: "Schema with unitCostStaleAt field on menuProducts, optimized query patterns"
  - phase: 06
    provides: "Unified BOM (menuProductComponents + componentTypes), production-only cost breakdown"
provides:
  - "invalidateMenuProductCosts internalMutation for automatic COGS cascade"
  - "recalculateAllCosts admin mutation with diff summary"
  - "Stale cost visual indicator (amber RefreshCw icon) in product listings"
  - "Admin Recalculate All Costs button with diff dialog"
  - "Production-only unitCost caching on menuProducts"
affects: [frontend-factories, schema-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Eager cost invalidation via ctx.scheduler.runAfter(0, internalMutation)"
    - "Stale marker pattern: set staleAt immediately, clear after recalculation"
    - "Production-only COGS caching (packaging excluded from unitCost)"

key-files:
  created: []
  modified:
    - "convex/lib/costInvalidation.ts"
    - "convex/componentTypes/mutations.ts"
    - "convex/menuProducts/mutations.ts"
    - "src/hooks/convex/useMenuProducts.ts"
    - "src/pages/MenuProductsManager.tsx"

key-decisions:
  - "unitCost stores production-only COGS (breakdown.production), packaging costs excluded per user decision"
  - "Stale marker (unitCostStaleAt) set immediately on componentType cost change, cleared after async recalculation"
  - "recalculateAllCosts returns diff array with productId, name, oldCost, newCost, delta"
  - "Stale badge shown in product list cards only (edit form calculates live, not from cached unitCost)"
  - "Recalculate button visible only to admin role"

patterns-established:
  - "Eager invalidation: mark stale -> schedule recalculation -> clear stale"
  - "Admin safety net mutation: recalculateAllCosts for bulk cost correction"

# Metrics
duration: 8min
completed: 2026-02-14
---

# Phase 7 Plan 02: Eager COGS Caching Summary

**Production-only COGS cached on menuProducts.unitCost with automatic recalculation cascade from componentType cost changes, stale indicator, and admin recalculate-all button with diff dialog**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-14T12:44:54Z
- **Completed:** 2026-02-14T12:56:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Automatic COGS cascade: changing a componentType's unitCostIdr marks affected menuProducts stale and schedules recalculation
- Production-only cost caching: unitCost stores sum of production-category component costs only (packaging excluded)
- Admin safety net: "Recalculate All Costs" button shows before/after diff summary dialog
- Visual stale indicator: amber spinning RefreshCw icon next to COGS when unitCostStaleAt is set

## Task Commits

Each task was committed atomically:

1. **Task 1: COGS cascade backend** - `af65a5a` (feat) + `7cb330f` (feat)
   - invalidateMenuProductCosts internalMutation, stale marking in componentTypes update, recalculateAllCosts mutation
   - create/update use breakdown.production for unitCost
2. **Task 2: COGS frontend** - `42c8147` (feat)
   - unitCostStaleAt in interfaces and transforms, stale badge, recalculate button, diff dialog

## Files Created/Modified
- `convex/lib/costInvalidation.ts` - Added invalidateMenuProductCosts internalMutation for COGS cascade
- `convex/componentTypes/mutations.ts` - Added stale marking and scheduler.runAfter cascade trigger in update
- `convex/menuProducts/mutations.ts` - Changed create/update to use breakdown.production, added recalculateAllCosts mutation
- `src/hooks/convex/useMenuProducts.ts` - Added unitCostStaleAt to interfaces/transforms, useConvexRecalculateAllCosts hook
- `src/pages/MenuProductsManager.tsx` - Added stale badge (amber RefreshCw), admin recalculate button, diff dialog

## Decisions Made
- unitCost stores production-only COGS (breakdown.production), not total including packaging -- per user decision
- Stale marker set synchronously (immediate visual feedback), recalculation happens async via scheduler
- recalculateAllCosts also clears stale markers on products with correct cost (staleAt set but cost unchanged)
- Stale badge in list cards only -- edit form uses live-calculated costs from component rows, not cached unitCost
- Recalculate button conditionally rendered for admin role only (via useAuth().hasRole)
- Diff dialog: delta colored red for cost increase, green for decrease

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Lucide RefreshCw title prop type error**
- **Found during:** Task 2 (stale badge implementation)
- **Issue:** `title` prop not accepted on Lucide React components (TS2322)
- **Fix:** Wrapped RefreshCw in a `<span title="...">` element instead
- **Files modified:** src/pages/MenuProductsManager.tsx
- **Verification:** npm run type-check passes, npm run build (vite) passes
- **Committed in:** 42c8147 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial fix for prop type compatibility. No scope creep.

## Issues Encountered
- Pre-existing bomBackfill.ts type error in `tsc -b` (not related to this plan, Phase 3 QFIX-05 artifact)
- Pre-existing fifo.test.ts failure from removed by_batch index (Phase 3 QFIX-05, documented in STATE.md)
- Task 1 backend code was partially committed in a prior agent's commit (7cb330f) -- work verified in codebase, additional api.d.ts committed as af65a5a

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- COGS caching foundation complete, ready for Phase 07-03 (remaining query optimizations)
- unitCost now eagerly maintained, reducing per-view cost calculation overhead
- recalculateAllCosts provides admin recovery path for any cost drift

## Self-Check: PASSED

- All 5 modified files exist on disk
- Commit af65a5a (Task 1 backend) found in git log
- Commit 42c8147 (Task 2 frontend) found in git log
- npm run type-check passes
- npm run test: 559/560 pass (1 pre-existing failure)
- vite build succeeds

---
*Phase: 07-query-optimization*
*Completed: 2026-02-14*

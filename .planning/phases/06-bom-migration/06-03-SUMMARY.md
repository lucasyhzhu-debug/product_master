---
phase: 06-bom-migration
plan: 03
subsystem: database
tags: [convex, bom, migration, strangler-fig, frontend, schema-cleanup, deprecated-fields]

# Dependency graph
requires:
  - phase: 06-02
    provides: Dual-read pattern in queries/packaging, stop-writes in mutations
provides:
  - All frontend files stop reading deprecated productionType/productionUnits
  - Schema fields marked v.optional() with DEPRECATED comments
  - menuProducts mutations no longer write deprecated fields
  - BOM-05 documented as already complete (QFIX-05 in Phase 3)
  - Entire 6-step BOM migration complete
affects: [08-schema-cleanup, 07-query-optimization, 09-frontend-factories]

# Tech tracking
tech-stack:
  added: []
  patterns: [deprecated-field-optional-schema, frontend-deprecated-field-removal]

key-files:
  created: []
  modified:
    - src/hooks/convex/useMenuProducts.ts
    - src/hooks/convex/useKitchenStats.ts
    - src/components/orders/PackageStatusDisplay.tsx
    - src/components/orders/ProductButtons.tsx
    - src/lib/types.ts
    - convex/schema.ts
    - convex/menuProducts/mutations.ts

key-decisions:
  - "Frontend type definitions retain deprecated fields as optional with @deprecated JSDoc for TypeScript compatibility"
  - "PackageStatusDisplay replaces productionUnits prop with ballsPerPackage for BOM-derived ball count display"
  - "MenuProduct create/update mutations no longer propagate deprecated fields to database"
  - "Seed data retains deprecated fields with DEPRECATED comments for dev environment backward compatibility"
  - "Seed update patches no longer write deprecated fields to existing products"
  - "BOM-05 already complete from Phase 3 QFIX-05 (by_production_type index removal on orderItems)"

patterns-established:
  - "Deprecated field schema pattern: v.optional() with Phase 8 removal comment for fields scheduled for cleanup"
  - "Frontend deprecated field pattern: mark as optional with @deprecated JSDoc, remove from all active code paths"

# Metrics
duration: 9min
completed: 2026-02-14
---

# Phase 6 Plan 3: BOM Frontend Migration + Schema Cleanup Summary

**Frontend stops reading deprecated productionType/productionUnits, schema fields marked optional, entire 6-step BOM strangler fig migration complete**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-14T04:01:45Z
- **Completed:** 2026-02-14T04:11:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Removed all active reads of deprecated productionType/productionUnits from 5 frontend files (9+ occurrences in useMenuProducts, 2 in useKitchenStats, 2 in PackageStatusDisplay, 2 in ProductButtons)
- Changed menuProducts schema fields to v.optional() with DEPRECATED comments, completing BOM-04
- Cleaned up menuProducts mutations: create omits deprecated fields, update stops propagating them, seed update no longer writes them
- Verified BOM-05 already done (QFIX-05 in Phase 3) and by_production_type on orderItemProduction (NEW system) is intact
- Entire 6-step BOM migration roadmap now complete: BOM-00 (backfill), BOM-01 (dual-read), BOM-02 (stop-writes), BOM-03 (frontend), BOM-04 (schema optional), BOM-05 (index removal)

## Task Commits

Each task was committed atomically:

1. **Task 1: BOM-03 -- Frontend migration** - `ab27d26` (feat)
2. **Task 2: BOM-04 Schema + BOM-05 Documentation + mutation cleanup** - `db019ad` (feat)

## Files Created/Modified
- `src/hooks/convex/useMenuProducts.ts` - Removed deprecated fields from 6 interfaces and 4 transform functions
- `src/hooks/convex/useKitchenStats.ts` - Removed deprecated fields from ConvexKitchenOrderItem type and transform
- `src/components/orders/PackageStatusDisplay.tsx` - Replaced productionUnits/productionType with ballsPerPackage prop
- `src/components/orders/ProductButtons.tsx` - Removed deprecated fields from ProductButtonProduct interface
- `src/lib/types.ts` - Marked production_type/production_units as optional with @deprecated JSDoc in MenuProduct and KitchenOrderItem
- `convex/schema.ts` - menuProducts.productionType/productionUnits changed to v.optional() with DEPRECATED comments
- `convex/menuProducts/mutations.ts` - Create omits deprecated fields, update stops propagating, seed update stops writing them

## Decisions Made
- Retained deprecated fields in TypeScript type definitions (types.ts) as optional with @deprecated JSDoc comments for backward compatibility with historical data structures
- Replaced `productionUnits` prop with `ballsPerPackage` in PackageStatusDisplay for BOM-derived ball count display
- Kept deprecated field args in create/update mutation validators for backward API compatibility, but they are no longer written to the database
- Seed data retains deprecated field values with DEPRECATED comments since it is dev-only setup code
- Seed patch (updating existing products) now skips writing deprecated fields
- Verified EnhancedCancellationDialog and OrderDetail `productionUnitsAffected` uses `item.quantity`, not deprecated fields

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed rebase dependency on Plan 02 branch**
- **Found during:** Task 2 (schema change)
- **Issue:** Feature branch was created from main which did not include Plan 01/02 commits. Schema and mutation files were in pre-Plan-02 state, causing conflicts
- **Fix:** Rebased feature branch onto `feature/06-02-bom-dual-read-stop-writes` to include all prior BOM migration work
- **Files modified:** All (rebase operation)
- **Verification:** Build passes, all Plan 02 changes present
- **Committed in:** Rebase operation (no separate commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Branch rebase was necessary to establish correct dependency chain. No scope creep.

## Issues Encountered
- Pre-existing test failures (5 test files, 1 test) confirmed identical before and after changes: 4 Playwright/Vitest incompatibility errors and 1 `componentTransactions` missing index in `fifo.test.ts`. Not related to BOM migration.

## User Setup Required
None - no external service configuration required. After deployment, the schema change (required -> optional) is safe for existing data. All 8 menuProducts currently have values for both deprecated fields.

## Next Phase Readiness
- BOM migration complete: all 6 steps executed successfully
- Phase 6 is fully done, unblocking Phases 7 (Query Optimization), 8 (Schema Cleanup), 9 (Frontend Factories), and 10 (Infrastructure)
- Phase 8 Schema Cleanup will do the final removal of deprecated fields from schema and all remaining fallback code
- All frontend code paths now use BOM-derived data; deprecated fields are invisible to users

## Self-Check: PASSED

All 7 modified files exist on disk. Both task commits (`ab27d26`, `db019ad`) verified in git log. Summary file exists.

---
*Phase: 06-bom-migration*
*Completed: 2026-02-14*

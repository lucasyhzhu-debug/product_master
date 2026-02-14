---
phase: 08-schema-cleanup
plan: 04
subsystem: database, frontend
tags: [convex, schema, tightening, deprecated-fields, Category-B, Category-C, type-safety]

# Dependency graph
requires:
  - phase: 08-schema-cleanup
    provides: "08-01 field audit, 08-02 code cleanup, 08-03 migration functions (backfill + cleanup)"
provides:
  - "Strict schema with 13 fields tightened from optional to required"
  - "5 deprecated fields removed from schema (productionType/productionUnits/isFixed on menuProducts, productionType/productionUnits on orderItems)"
  - "Clean frontend type definitions without deprecated fields"
  - "Generated API types free of deprecated field references"
affects: [09-frontend-factories, 10-infrastructure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AnyDoc cast pattern for migration files referencing removed schema fields"
    - "Required field defaults in create mutations (0 for numbers, empty string for strings, 'food' for productType)"

key-files:
  created: []
  modified:
    - convex/schema.ts
    - convex/menuProducts/mutations.ts
    - convex/migrations/schemaCleanup.ts
    - convex/migrations/bomBackfill.ts
    - convex/migrations/bomVerification.ts
    - convex/orders/migrations.ts
    - convex/orders/mutations/migrations.ts
    - convex/orders/mutations/kitchen.ts
    - convex/productionUnitTypes/mutations.ts
    - src/lib/types.ts
    - src/hooks/convex/useMenuProducts.ts

key-decisions:
  - "orders.completedAt stays v.optional() (Category A) -- active orders legitimately lack it"
  - "Migration files use AnyDoc cast pattern to reference removed fields without type errors"
  - "menuProducts create defaults: unitCost=0, cachedProductionSummary='', productType='food'"
  - "kitchenInventory create defaults: updatedBy='system'"
  - "productionUnitTypes create defaults: color='#93C572' (green)"
  - "seedFixedProducts updated with required cachedProductionSummary and productType fields"
  - "updateCachedProductionSummary sets empty string (not undefined) when no components exist"

patterns-established:
  - "AnyDoc cast pattern: `const doc = item as AnyDoc` for migration code accessing removed schema fields"

# Metrics
duration: 4min
completed: 2026-02-14
---

# Phase 8 Plan 04: Schema Tightening (Deploy 2) Summary

**13 optional fields tightened to required, 5 deprecated fields removed from schema, all mutation validators and type definitions updated -- zero type errors**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-14T07:11:38Z
- **Completed:** 2026-02-14T07:15:40Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Tightened 13 Category B fields from `v.optional()` to required across 6 tables: ingredients, packagingMaterials, menuProducts, orders, kitchenInventory, productionUnitTypes
- Removed 5 Category C deprecated fields from schema: menuProducts.productionType/productionUnits/isFixed, orderItems.productionType/productionUnits
- Updated all migration files (5 files) with AnyDoc cast pattern to preserve compilation with removed fields
- Cleaned frontend type definitions: removed deprecated fields from MenuProduct and KitchenOrderItem interfaces

## Task Commits

Each task was committed atomically:

1. **Task 1: Tighten Category B fields and remove Category C fields in schema.ts** - `dc52bb2` (feat)
2. **Task 2: Fix type errors from schema changes in mutations and types** - `defdbc8` (feat)

## Files Created/Modified
- `convex/schema.ts` - 13 fields tightened (optional -> required), 5 deprecated fields removed
- `convex/menuProducts/mutations.ts` - Required field defaults in create/seed, empty string for cachedProductionSummary
- `convex/migrations/schemaCleanup.ts` - AnyDoc cast for deprecated field references in cleanup/verify
- `convex/migrations/bomBackfill.ts` - AnyDoc cast for productionType/productionUnits reads
- `convex/migrations/bomVerification.ts` - AnyDoc cast for deprecated field comparison
- `convex/orders/migrations.ts` - AnyDoc cast for productionType verification
- `convex/orders/mutations/migrations.ts` - AnyDoc cast for backfill production record creation
- `convex/orders/mutations/kitchen.ts` - Added updatedBy: "system" to kitchenInventory insert
- `convex/productionUnitTypes/mutations.ts` - Default color "#93C572" when not provided
- `src/lib/types.ts` - Removed production_type/production_units from MenuProduct and KitchenOrderItem
- `src/hooks/convex/useMenuProducts.ts` - Added cached_production_summary to transform function

## Decisions Made
- `orders.completedAt` stays `v.optional()` (Category A) -- non-terminal orders legitimately have undefined
- Migration files use `AnyDoc` cast pattern (`Record<string, any>`) to reference removed schema fields without type errors, since these migrations only run before the schema tightening deploy
- `menuProducts.create` defaults: `unitCost: 0`, `cachedProductionSummary: ""`, `productType: "food"` when no components provided
- `kitchenInventory` insert defaults: `updatedBy: "system"` for auto-created daily records
- `productionUnitTypes.create` defaults: `color: "#93C572"` (green) when color not provided
- `seedFixedProducts` updated with explicit `cachedProductionSummary` and `productType: "food"` per product
- `updateCachedProductionSummary` sets empty string (not undefined) when no components exist

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed seedFixedProducts missing required fields**
- **Found during:** Task 1 (schema tightening)
- **Issue:** seedFixedProducts insert objects lacked now-required `cachedProductionSummary` and `productType`
- **Fix:** Added `cachedProductionSummary` (e.g., "1 Big Ball") and `productType: "food"` to all 4 seed products
- **Files modified:** convex/menuProducts/mutations.ts
- **Committed in:** dc52bb2

**2. [Rule 1 - Bug] Fixed create mutation setting undefined for required fields**
- **Found during:** Task 1 (schema tightening)
- **Issue:** `create` mutation could insert `unitCost: undefined` and `productType: undefined` when no components provided
- **Fix:** Changed defaults to `unitCost: 0` and `productType: "food"`, added `cachedProductionSummary: ""`
- **Files modified:** convex/menuProducts/mutations.ts
- **Committed in:** dc52bb2

**3. [Rule 1 - Bug] Fixed update mutation clearing required fields**
- **Found during:** Task 1 (schema tightening)
- **Issue:** `update` mutation set `unitCost: undefined` and `productType: undefined` when components array was empty
- **Fix:** Changed to `unitCost: 0` and `cachedProductionSummary: ""` (productType not cleared)
- **Files modified:** convex/menuProducts/mutations.ts
- **Committed in:** dc52bb2

**4. [Rule 3 - Blocking] Fixed migration files referencing removed schema fields**
- **Found during:** Task 1 (schema tightening)
- **Issue:** 5 migration files referenced `productionType`, `productionUnits`, `isFixed` which no longer exist in schema types
- **Fix:** Added `AnyDoc` type alias and cast pattern to all 5 migration files
- **Files modified:** convex/migrations/schemaCleanup.ts, bomBackfill.ts, bomVerification.ts, convex/orders/migrations.ts, convex/orders/mutations/migrations.ts
- **Committed in:** dc52bb2

**5. [Rule 1 - Bug] Fixed kitchenInventory insert missing required updatedBy**
- **Found during:** Task 1 (schema tightening)
- **Issue:** `getOrCreateTodayInventory` helper inserted kitchenInventory without now-required `updatedBy` field
- **Fix:** Added `updatedBy: "system"` to the insert
- **Files modified:** convex/orders/mutations/kitchen.ts
- **Committed in:** dc52bb2

**6. [Rule 1 - Bug] Fixed productionUnitTypes create allowing undefined color**
- **Found during:** Task 1 (schema tightening)
- **Issue:** `create` mutation passed `args.color` which could be undefined (v.optional in validator) to now-required schema field
- **Fix:** Added `?? "#93C572"` default (green, matching Plan 03 backfill default)
- **Files modified:** convex/productionUnitTypes/mutations.ts
- **Committed in:** dc52bb2

**7. [Rule 1 - Bug] Fixed useMenuProducts transform missing cached_production_summary**
- **Found during:** Task 2 (type fixes)
- **Issue:** `transformMenuProduct` function did not include now-required `cached_production_summary` field
- **Fix:** Added `cached_production_summary: product.cachedProductionSummary` to transform output
- **Files modified:** src/hooks/convex/useMenuProducts.ts
- **Committed in:** defdbc8

---

**Total deviations:** 7 auto-fixed (6 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. Schema tightening inherently requires fixing all code that inserts or writes to affected tables. No scope creep.

## Issues Encountered
None.

## User Setup Required
**CRITICAL:** Before deploying this schema change to production, the Plan 03 migration functions MUST have been run successfully. The `verifyCleanupComplete` query should return `{ ready: true, issues: [] }`. Without running the migrations first, existing documents without backfilled values will violate the new required constraints.

## Next Phase Readiness
- Phase 08 (Schema Cleanup) is now COMPLETE: all 4 plans executed
- Schema is strict and clean: 13 fewer v.optional() wrappers, 5 deprecated fields removed
- Generated types (`convex/_generated/dataModel.d.ts`) reflect all changes
- Phase 09 (Frontend Factories) and Phase 10 (Infrastructure) are now unblocked

## Self-Check: PASSED

All files exist, all commits verified, all content assertions validated.

---
*Phase: 08-schema-cleanup*
*Completed: 2026-02-14*

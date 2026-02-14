---
phase: 08-schema-cleanup
plan: 03
subsystem: database, migrations
tags: [backfill, cleanup, migration, schema-tightening, deprecated-fields, Category-B, Category-C]

# Dependency graph
requires:
  - phase: 08-schema-cleanup
    provides: "08-02 removed all deprecated field code references; fields safe to clear from data"
provides:
  - "9 migration functions (6 backfill + 2 cleanup + 1 verification query) in convex/migrations/schemaCleanup.ts"
  - "Dashboard-callable admin-only mutations for Deploy 1 of schema pipeline"
  - "verifyCleanupComplete query: go/no-go safety check before schema tightening"
affects: [08-04-schema-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backfill mutation pattern: admin auth, collect-all, conditional patch, structured report"
    - "Cleanup mutation pattern: set deprecated fields to undefined via ctx.db.patch"
    - "Verification query pattern: count documents with missing/present fields, return ready + issues"

key-files:
  created:
    - convex/migrations/schemaCleanup.ts
  modified: []

key-decisions:
  - "costPerBaseUnit for ingredients/materials: (priceExclShipping + shippingCost) / volumePurchased then convert to base unit"
  - "menuProducts default productType is 'food' (all current products are food)"
  - "completedAt for terminal orders backfilled with _creationTime (best-guess for historical data)"
  - "finalTotal computed as totalAmount - orderLevelDiscount (0 if no discount)"
  - "isKitchenVisible computed from same status set as statusTransitions.ts"
  - "kitchenInventory updatedBy defaults to 'system' for historical records"
  - "productionUnitTypes color defaults to #93C572 (green)"
  - "verifyCleanupComplete checks both Category B (backfilled) and Category C (cleared) fields"

patterns-established:
  - "Migration file pattern: admin-auth mutation with structured report return for dashboard visibility"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 8 Plan 03: Schema Cleanup Migrations Summary

**9 migration functions for backfilling Category B defaults and clearing Category C deprecated field data, with verification query for schema tightening readiness**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T07:06:03Z
- **Completed:** 2026-02-14T07:08:53Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments
- Created 6 backfill mutations covering all Category B fields: ingredients costPerBaseUnit/baseUnit, packagingMaterials costPerBaseUnit/baseUnit, menuProducts unitCost/cachedProductionSummary/productType, orders isKitchenVisible/completedAt/finalTotal, kitchenInventory totalProducedOriginal/totalProducedBiteSized/updatedBy, productionUnitTypes color
- Created 2 cleanup mutations for Category C deprecated fields: menuProducts productionType/productionUnits/isFixed, orderItems productionType/productionUnits
- Created verifyCleanupComplete query that checks all B+C fields and returns { ready, issues } for go/no-go before schema deploy

## Task Commits

Each task was committed atomically:

1. **Task 1: Create backfill migration mutations for Category B fields** - `6505942` (feat)
2. **Task 2: Create cleanup migration mutations for deprecated field removal** - `336a7d5` (feat)

## Files Created/Modified
- `convex/migrations/schemaCleanup.ts` - 9 migration functions (6 backfill + 2 cleanup + 1 verification query), all admin-authenticated and dashboard-callable

## Decisions Made
- costPerBaseUnit computed from (priceExclShipping + shippingCost) / volumePurchased with unit conversion (kg->g: *0.001, l->ml: *0.001)
- baseUnit derived from unitType using same logic as existing app (kg->g, l->ml, m->cm)
- menuProducts.productType defaults to "food" (all existing products are food products)
- orders.completedAt for terminal historical orders uses _creationTime as best-guess
- orders.finalTotal computed as totalAmount - (orderLevelDiscount ?? 0)
- isKitchenVisible uses same status set as statusTransitions.ts computeIsKitchenVisible()
- kitchenInventory.updatedBy defaults to "system" for backfilled records
- productionUnitTypes.color defaults to "#93C572" (green) per plan spec
- verifyCleanupComplete also checks packagingMaterials (Category B) beyond what plan listed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All migration functions ready for Deploy 1 execution from Convex dashboard
- Execution order: run 6 backfill mutations, then 2 cleanup mutations, then verifyCleanupComplete
- verifyCleanupComplete must return { ready: true } before proceeding to Plan 04 (schema tightening)
- Plan 04 will change v.optional() to required for Category B fields and remove Category C fields from schema

## Self-Check: PASSED

- convex/migrations/schemaCleanup.ts exists on disk
- Task 1 commit (6505942) verified in git log
- Task 2 commit (336a7d5) verified in git log
- 9 exported functions (6 backfill + 2 cleanup + 1 query) confirmed
- npm run type-check passes
- npm run build passes

---
*Phase: 08-schema-cleanup*
*Completed: 2026-02-14*

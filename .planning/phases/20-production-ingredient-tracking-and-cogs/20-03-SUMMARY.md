---
phase: 20-production-ingredient-tracking-and-cogs
plan: 03
subsystem: inventory
tags: [convex, inventory, fifo, ingredients, bom, hierarchy, cogs]

requires:
  - phase: 20-01
    provides: hierarchyTraversal utility, ingredientComponentTypeId schema field
  - phase: 16-inventory-management
    provides: componentTypes table, FIFO batch tracking, componentStock
provides:
  - createIngredientComponentType mutation for linking ingredients to BOM inventory
  - consumeIngredientMaterialsInternal for order fulfillment ingredient deduction
  - isIngredient flag on inventory report/alert queries
  - Kitchen location auto-creation for ingredient inventory
affects: [20-04, 20-05, 20-06]

tech-stack:
  added: []
  patterns: [ingredient-inventory-tracking, negative-stock-allowance, hierarchy-based-deduction]

key-files:
  created: []
  modified:
    - convex/componentTypes/mutations.ts
    - convex/inventory/queries.ts
    - convex/orders/mutations/inventoryIntegration.ts
    - convex/orders/mutations/statusUpdates.ts

key-decisions:
  - "Removed production+trackInventory restriction entirely rather than adding isIngredientTracker flag"
  - "Negative stock handled via adjustment transaction on shortfall rather than blocking fulfillment"
  - "Ingredient deduction fires at BeingPrepared transition matching existing material consumption pattern"

patterns-established:
  - "Ingredient identification pattern: category=production AND trackInventory=true"
  - "Negative stock pattern: consume available via FIFO, then negative adjustment for shortfall"

duration: 4min
completed: 2026-02-17
---

# Phase 20 Plan 03: Ingredient Inventory & Fulfillment Deduction Summary

**FIFO ingredient inventory tracking via componentTypes with hierarchy-based deduction on order fulfillment, negative stock allowed with warnings**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T10:50:49Z
- **Completed:** 2026-02-17T10:54:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Ingredient componentTypes can now be created with category=production + trackInventory=true (restriction removed)
- createIngredientComponentType mutation auto-generates ING_ codes and bidirectionally links ingredients to componentTypes
- consumeIngredientMaterialsInternal walks full production hierarchy, aggregates leaf ingredient requirements, and deducts from FIFO inventory
- All three BeingPrepared transition points (updateStatus, moveForward, expediteOrder) now call ingredient consumption
- Insufficient ingredient stock produces warnings but never blocks order fulfillment
- Inventory queries now include isIngredient flag for frontend type badges

## Task Commits

Each task was committed atomically:

1. **Task 1: Ingredient inventory infrastructure -- componentTypes entries + receiving** - `7f1e248` (feat)
2. **Task 2: Ingredient deduction on order fulfillment** - `b2bda67` (feat)

## Files Created/Modified
- `convex/componentTypes/mutations.ts` - Removed production+trackInventory restriction, added createIngredientComponentType mutation
- `convex/inventory/queries.ts` - Added isIngredient flag to inventory report, location inventory, and low-stock alerts
- `convex/orders/mutations/inventoryIntegration.ts` - Added consumeIngredientMaterialsInternal with hierarchy traversal and negative stock handling
- `convex/orders/mutations/statusUpdates.ts` - Integrated ingredient consumption at all 3 BeingPrepared transition points

## Decisions Made
- Removed the production+trackInventory restriction entirely rather than adding an isIngredientTracker flag -- simpler approach since trackInventory is explicitly set at creation time
- Negative stock handled via adjustment transaction for the shortfall amount rather than blocking order fulfillment
- Ingredient deduction fires at BeingPrepared transition (same trigger point as existing production/boxing/sticker consumption)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ingredient inventory tracking fully operational for Plans 04-06
- COGS calculation (Plan 04-05) can now leverage both hierarchy traversal and ingredient inventory data
- Frontend ingredient management UI (Plan 06) can use isIngredient flags and createIngredientComponentType mutation
- No blockers

## Self-Check: PASSED

All files exist. All commit hashes verified.

---
*Phase: 20-production-ingredient-tracking-and-cogs*
*Completed: 2026-02-17*

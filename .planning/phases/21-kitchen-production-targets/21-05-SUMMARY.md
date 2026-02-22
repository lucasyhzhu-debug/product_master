---
phase: 21-kitchen-production-targets
plan: "05"
subsystem: inventory
tags: [convex, fifo, inventory, kitchen, bom, ingredients, production]

# Dependency graph
requires:
  - phase: 21-02
    provides: submitShiftRecord and updateShiftRecord mutations that update productInventory at shift end
  - phase: 21-01
    provides: kitchenShiftRecords schema, productionTargets, production BOM via menuProductComponents
  - phase: 17
    provides: componentStock/inventoryBatches/componentTransactions FIFO infrastructure
provides:
  - deductIngredientsForShift: FIFO raw ingredient deduction from shift produced quantities via BOM traversal
  - restoreIngredientsForShift: inverse ingredient restore when shift edits reduce production
  - submitShiftRecord now returns ingredientWarnings for low-stock UI display
  - updateShiftRecord adjusts ingredient stock for production diffs (deduct added, restore removed)
affects: [phase-22-sales-analytics, future-inventory-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shift ingredient deduction mirrors consumeIngredientMaterialsInternal pattern (soft failure, FIFO, BOM traversal)"
    - "buildIngredientNeeds private helper shared by deduct and restore to avoid BOM traversal duplication"
    - "Try/catch at mutation call site prevents ingredient errors from rolling back shift record writes"

key-files:
  created:
    - convex/kitchenShiftRecords/ingredientDeduction.ts
  modified:
    - convex/kitchenShiftRecords/mutations.ts
    - docs/CHANGELOG.md

key-decisions:
  - "buildIngredientNeeds extracted as private helper so deductIngredientsForShift and restoreIngredientsForShift share same BOM traversal without duplication"
  - "restoreIngredientsForShift adds back to newest active batch (best-effort) rather than exact FIFO reversal — exact batch accuracy not required for shift edits"
  - "Ingredient adjustment for updateShiftRecord uses produced[] arrays (not net maps) to correctly compute raw-ingredient diff independent of waste changes"

patterns-established:
  - "Shift ingredient deduction: producedItems.filter(q > 0) -> deductIngredientsForShift -> soft failure with warnings"
  - "Shift edit ingredient adjustment: per-product produced diff -> addedProduction -> deduct / removedProduction -> restore"

requirements-completed:
  - KIT-14

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 21 Plan 05: Ingredient Deduction Summary

**Raw ingredient FIFO deduction wired into shift record submission and editing via shared BOM traversal helper — closes ingredient inventory loop for kitchen production**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-22T16:41:33Z
- **Completed:** 2026-02-22T16:44:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `ingredientDeduction.ts` with `deductIngredientsForShift`, `restoreIngredientsForShift`, and private `buildIngredientNeeds` — full BOM traversal from menuProductComponents to leaf ingredients via collectLeafIngredients
- Wired ingredient deduction into `submitShiftRecord` (step 7) after productInventory upserts — waste items excluded, soft failure returns `ingredientWarnings: string[]`
- Wired ingredient diff-adjustment into `updateShiftRecord` (step 5) — per-product produced diff routes positive changes to deduct and negative changes to restore, both wrapped in try/catch to never block the shift patch

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ingredientDeduction.ts helper** - `4e9e4bc` (feat)
2. **Task 2: Wire ingredient deduction into mutations** - `1e4be5c` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `convex/kitchenShiftRecords/ingredientDeduction.ts` — new: `buildIngredientNeeds` (private), `deductIngredientsForShift` (exported), `restoreIngredientsForShift` (exported)
- `convex/kitchenShiftRecords/mutations.ts` — import added; `submitShiftRecord` step 7 + return type updated; `updateShiftRecord` step 5 ingredient diff logic added
- `docs/CHANGELOG.md` — v1.3.1 entry added

## Decisions Made

- `buildIngredientNeeds` extracted as shared private helper: both deduct and restore need the same BOM traversal, so this avoids duplication and keeps logic DRY.
- `restoreIngredientsForShift` uses best-effort batch restore (add to newest active batch): exact FIFO reversal is not feasible without knowing which batches were originally consumed. For shift edits, best-effort is sufficient.
- Ingredient adjustment in `updateShiftRecord` uses the `produced[]` arrays (not the net maps that include waste) to compute raw-ingredient diff — this correctly scopes ingredient changes to production quantities only, independent of waste adjustments.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 21 is complete (5/5 plans done). All kitchen production target features shipped:
- Plan 01: productionTargets schema + getKitchenTargetsForDate query
- Plan 02: submitShiftRecord + updateShiftRecord mutations (Finished Goods inventory)
- Plan 03: EndOfShiftForm UI wired into KitchenViewV2
- Plan 04: ManagerTargetSettings, ShiftHistoryList, ShiftEditDialog
- Plan 05: Raw ingredient FIFO deduction at shift end (this plan)

Ready to merge `feature/kitchen-production-targets` to main.

## Self-Check: PASSED

- FOUND: `convex/kitchenShiftRecords/ingredientDeduction.ts`
- FOUND: `convex/kitchenShiftRecords/mutations.ts`
- FOUND: `.planning/phases/21-kitchen-production-targets/21-05-SUMMARY.md`
- FOUND commit: `4e9e4bc` (feat(21-05): add ingredientDeduction helper)
- FOUND commit: `1e4be5c` (feat(21-05): wire ingredient deduction into mutations)

---
*Phase: 21-kitchen-production-targets*
*Completed: 2026-02-22*

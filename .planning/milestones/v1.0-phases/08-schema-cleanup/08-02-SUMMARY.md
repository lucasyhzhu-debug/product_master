---
phase: 08-schema-cleanup
plan: 02
subsystem: database, api, ui
tags: [deprecated-fields, productionType, productionUnits, isFixed, BOM, posSlot]

# Dependency graph
requires:
  - phase: 06-bom-migration
    provides: "BOM system (menuProductComponents + componentTypes) as source of truth for ball composition"
provides:
  - "Zero code references to productionType/productionUnits outside migration files"
  - "isFixed replaced by posSlot/packagingPosSlot for deletion protection"
  - "useConvexFixedProducts dead code removed"
  - "Seed data cleaned of deprecated fields"
affects: [08-03-schema-cleanup, 08-04-schema-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "posSlot/packagingPosSlot as deletion guard (replaces isFixed boolean)"

key-files:
  created: []
  modified:
    - convex/orders/queries.ts
    - convex/orders/mutations/packaging.ts
    - convex/orders/whatsapp.ts
    - convex/menuProducts/mutations.ts
    - convex/migrations/bomBackfill.ts
    - src/pages/MenuProductsManager.tsx
    - src/hooks/convex/useMenuProducts.ts
    - src/hooks/convex/index.ts

key-decisions:
  - "Items without production records contribute 0 balls (no fallback to deprecated fields)"
  - "getBallsPerPackageForItem returns 1 as default when no production records exist (same behavior without reading deprecated field)"
  - "hasProductionData returns false when no active records exist (no fallback to productionType)"
  - "Deletion protection uses posSlot/packagingPosSlot check instead of isFixed"
  - "POS badge replaces Fixed badge in UI (Pin icon instead of Lock)"
  - "productionType/productionUnits removed from create/update mutation args"

patterns-established:
  - "posSlot !== undefined || packagingPosSlot !== undefined as deletion guard pattern"

# Metrics
duration: 7min
completed: 2026-02-14
---

# Phase 8 Plan 02: Remove Deprecated Field Code References Summary

**All code references to productionType/productionUnits/isFixed removed from non-migration files; deletion protection now uses posSlot/packagingPosSlot**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-14T06:55:43Z
- **Completed:** 2026-02-14T07:02:47Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Removed all 6 deprecated field fallback blocks from orders/queries.ts (calculateBallStatsFromItems, getKitchenStats pending, getKitchenStats completed, getCompletedToday, debugProductionRecords)
- Cleaned packaging.ts helpers (getBallsPerPackageForItem, hasProductionData) to use only orderItemProduction records
- Cleaned whatsapp.ts to derive production units from BOM only (removed p.productionUnits fallback)
- Replaced isFixed deletion protection with posSlot/packagingPosSlot check in backend and frontend
- Deleted useConvexFixedProducts dead hook and its barrel export
- Cleaned seed data to remove productionType, productionUnits, isFixed from all 4 fixed product definitions
- Removed productionType/productionUnits from create and update mutation args

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove deprecated field fallback code from backend** - `1af511d` (feat)
2. **Task 2: Remove deprecated field references from frontend** - `b7adbc3` (feat)

## Files Created/Modified
- `convex/orders/queries.ts` - Removed 6 deprecated fallback blocks, ball stats from orderItemProduction only
- `convex/orders/mutations/packaging.ts` - Cleaned dual-read helpers to use production records only
- `convex/orders/whatsapp.ts` - Removed p.productionUnits fallback from order template
- `convex/menuProducts/mutations.ts` - posSlot deletion guard, cleaned seed data, removed deprecated args
- `convex/migrations/bomBackfill.ts` - Fixed type error (productionUnits now optional, added ?? 1)
- `src/pages/MenuProductsManager.tsx` - Replaced isFixed with posSlot/packagingPosSlot in UI
- `src/hooks/convex/useMenuProducts.ts` - Deleted useConvexFixedProducts, removed isFixed from interfaces
- `src/hooks/convex/index.ts` - Removed useConvexFixedProducts and FixedProduct exports

## Decisions Made
- Items without production records contribute 0 balls (correct -- they were never tracked in BOM)
- getBallsPerPackageForItem returns 1 as default (same behavior, just not reading deprecated field)
- hasProductionData returns false without fallback (clean separation)
- POS badge (Pin icon) replaces Fixed badge (Lock icon) in product cards
- productionType/productionUnits removed from create/update mutation validator args

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed bomBackfill.ts type error**
- **Found during:** Task 2 (build verification)
- **Issue:** `mp.productionUnits` is now `v.optional(v.number())` in schema, causing type error in migration file where it is assigned to `number` typed variable
- **Fix:** Added `?? 1` default: `let targetQuantity = mp.productionUnits ?? 1;`
- **Files modified:** convex/migrations/bomBackfill.ts
- **Verification:** npm run build passes
- **Committed in:** b7adbc3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix for type safety in migration file. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All code references to deprecated fields removed (except migration files which intentionally read them)
- Plan 03 (data migration to clear deprecated field values from documents) can proceed safely
- Plan 04 (schema field removal) will follow after Plan 03 clears data

## Self-Check: PASSED

- All 8 modified files exist on disk
- Both task commits (1af511d, b7adbc3) verified in git log
- npm run build passes
- Zero non-migration backend references to productionType/productionUnits
- Zero backend references to isFixed (except schema definition)
- Zero frontend references to isFixed or useConvexFixedProducts

---
*Phase: 08-schema-cleanup*
*Completed: 2026-02-14*

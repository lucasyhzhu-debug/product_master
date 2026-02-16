---
phase: 06-bom-migration
plan: 02
subsystem: database
tags: [convex, bom, migration, strangler-fig, dual-read, deprecated-fields]

# Dependency graph
requires:
  - phase: 06-01
    provides: BOM backfill migration and verification query
provides:
  - calculateBallStatsFromItems dual-read helper in queries.ts
  - getBallsPerPackageForItem and hasProductionData helpers in packaging.ts
  - BOM-derived gram descriptions in WhatsApp catalog template
  - orderCrud/itemCrud no longer stamp deprecated productionType/productionUnits
  - menuProducts create uses empty defaults for deprecated schema fields
affects: [06-03 schema-cleanup, 07-query-optimization, 08-schema-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [dual-read-fallback, bom-derived-helpers, deprecated-field-empty-defaults]

key-files:
  created: []
  modified:
    - convex/orders/queries.ts
    - convex/orders/whatsapp.ts
    - convex/orders/mutations/packaging.ts
    - convex/orders/mutations/orderCrud.ts
    - convex/orders/mutations/itemCrud.ts
    - convex/menuProducts/mutations.ts

key-decisions:
  - "Dual-read pattern: BOM production records first, deprecated fields as fallback for historical orders"
  - "productionByItem batch fetch moved before stats calculation to support dual-read in getKitchenStats"
  - "Packaging mutations use async getBallsPerPackageForItem/hasProductionData helpers with per-item DB lookups"
  - "menuProducts.create uses empty string/zero defaults for required schema fields (BOM-04 will make optional)"
  - "Debug query labels deprecated fields as deprecated_productionType/deprecated_productionUnits for clarity"
  - "getCompletedToday adds separate batch fetch of production records for dual-read support"

patterns-established:
  - "Dual-read fallback: check production records first, fall back to deprecated fields for historical orders without BOM data"
  - "BOM-derived helpers: async functions that query orderItemProduction with index, with fallback"
  - "Deprecated field empty defaults: use empty string and zero when schema still requires fields but code no longer writes meaningful values"

# Metrics
duration: 8min
completed: 2026-02-14
---

# Phase 6 Plan 2: BOM Dual-Read and Stop-Writes Summary

**Backend queries use dual-read pattern (BOM first, deprecated fallback) and all mutations stop writing deprecated productionType/productionUnits fields**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-14T03:51:06Z
- **Completed:** 2026-02-14T03:58:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Replaced `calculateOldSystemBallStats` with `calculateBallStatsFromItems` dual-read helper that reads from BOM production records first, falling back to deprecated fields for historical orders
- Added `getBallsPerPackageForItem` and `hasProductionData` async helpers to packaging.ts, replacing all 9 direct reads of deprecated fields
- WhatsApp catalog template (`getOrderTemplate`) derives gram descriptions from `menuProductComponents` + `componentTypes` instead of `menuProducts.productionUnits`
- Updated `getKitchenStats`, `getKitchenOrders`, `getCompletedToday`, and `debugProductionRecords` to use dual-read pattern
- Removed all deprecated field stamps from `orderCrud.ts` (create), `itemCrud.ts` (addItem, replaceItems)
- `menuProducts.create` now writes empty defaults (`""`, `0`) for required schema fields pending BOM-04

## Task Commits

Each task was committed atomically:

1. **Task 1: BOM-01 -- Dual-read in backend queries + packaging mutations** - `6f2ee22` (feat)
2. **Task 2: BOM-02 -- Stop writing deprecated fields in all mutations** - `d7cf60a` (feat)

## Files Created/Modified
- `convex/orders/queries.ts` - Dual-read `calculateBallStatsFromItems`, updated `getKitchenStats`/`getKitchenOrders`/`getCompletedToday`/debug query
- `convex/orders/whatsapp.ts` - BOM-derived gram descriptions in `getOrderTemplate`
- `convex/orders/mutations/packaging.ts` - `getBallsPerPackageForItem` and `hasProductionData` helpers, all 6 mutations updated
- `convex/orders/mutations/orderCrud.ts` - Removed `menuProductsMap` for deprecated fields, removed stamps from `create`
- `convex/orders/mutations/itemCrud.ts` - Removed deprecated field fetch/stamp from `addItem` and `replaceItems`
- `convex/menuProducts/mutations.ts` - Empty defaults for create, DEPRECATED comments on seed data

## Decisions Made
- Moved `productionByItem` batch fetch before stats calculation loops in `getKitchenStats` (was after in original code, causing use-before-declaration error with dual-read)
- Packaging helpers use per-item `orderItemProduction` index lookup rather than batch fetch (mutations operate on single items, not bulk)
- `menuProducts.update` still accepts `productionType`/`productionUnits` in args but marks them as DEPRECATED -- prevents breaking existing callers while discouraging new usage
- `seedFixedProducts` keeps deprecated values because schema still requires them -- each annotated with `// DEPRECATED: kept for schema compliance`
- Debug query renames fields to `deprecated_productionType`/`deprecated_productionUnits` with `hasBOMData` boolean flag

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed variable declaration order in getKitchenStats**
- **Found during:** Task 2 (build verification)
- **Issue:** `productionByItem` Map was used in pending/completed order loops (added by Task 1) but declared later in the function (original code had it below the NEW system section)
- **Fix:** Moved batch fetch of `allProductionRecords` and `productionByItem` Map construction to before the stats calculation loops, removed the duplicate declaration
- **Files modified:** `convex/orders/queries.ts`
- **Verification:** `npm run build` passes
- **Committed in:** `d7cf60a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Variable ordering fix was necessary for correctness. No scope creep.

## Issues Encountered
- Pre-existing test failures (5 test files, 1 test) confirmed identical before and after changes: 4 Playwright/Vitest incompatibility errors and 1 `componentTransactions` missing index in `fifo.test.ts`. Not related to BOM migration.

## User Setup Required
None - no external service configuration required. After deployment, existing orders with BOM backfill data will automatically use the new dual-read path. Historical orders without production records will seamlessly fall back to deprecated fields.

## Next Phase Readiness
- Dual-read and stop-writes complete: the deprecated fields are now read-only historical artifacts
- Plan 06-03 can proceed to make schema fields optional and add frontend migration indicators
- All 6 backend files modified are ready for deployment
- The dual-read pattern is invisible to users -- kitchen stats, packaging workflow, and WhatsApp templates produce identical output

## Self-Check: PASSED

All 6 modified files exist on disk. Both task commits (`6f2ee22`, `d7cf60a`) verified in git log. Summary file exists.

---
*Phase: 06-bom-migration*
*Completed: 2026-02-14*

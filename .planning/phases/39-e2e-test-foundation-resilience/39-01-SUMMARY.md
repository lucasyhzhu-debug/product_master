---
phase: 39-e2e-test-foundation-resilience
plan: 01
subsystem: backend
tags: [convex, auto-seed, inventory, gofood, depot, testing]

requires:
  - phase: 17.1-product-inventory-tracker
    provides: productInventory table and processGofoodSales mutation
  - phase: 19-gofood-depot-management
    provides: seedFinishedGoodsLocations migration pattern
provides:
  - ensureDepotLocation shared helper for auto-seeding depot storage locations
  - processGofoodSales no longer silently skips unlinked outlets
  - Unit tests for depot auto-seed behavior (6 tests)
affects: [gofood-depot, product-inventory, e2e-tests]

tech-stack:
  added: []
  patterns: [auto-seed-on-first-use, idempotent-depot-creation]

key-files:
  created:
    - convex/productInventory/depotAutoSeed.ts
    - tests/unit/depotAutoSeed.test.ts
  modified:
    - convex/productInventory/mutations.ts

key-decisions:
  - "Auto-seed creates depot location + links outlet + seeds zero-stock inventory in a single call"
  - "DEPOT_CONFIG array makes adding new depot patterns trivial (pattern match on outlet name)"
  - "Unknown outlets still skip with warning log (no auto-seed for unmapped outlets)"

patterns-established:
  - "Auto-seed on first use: create missing infrastructure at runtime rather than requiring manual setup"
  - "Idempotent upsert: check by name before creating, reuse existing location if found"

requirements-completed: [RES-04]

duration: 5min
completed: 2026-03-06
---

# Phase 39 Plan 01: Tamtem Depot Auto-Seed Summary

**Auto-seed helper replaces silent skip in processGofoodSales -- creates depot locations, links outlets, seeds zero-stock inventory on first GoFood sale**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T16:06:47Z
- **Completed:** 2026-03-06T16:12:31Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `ensureDepotLocation` shared helper that auto-creates Tamtem Depot or Legato Goldfinch storage locations when missing
- Fixed `processGofoodSales` to call auto-seed instead of silently skipping items when outlet has no `linkedStorageLocationId`
- Added 6 unit tests covering: both depot types, normal flow, idempotency, unknown outlets, and zero-stock inventory seeding
- All 690 tests pass (684 existing + 6 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create depot auto-seed helper and fix processGofoodSales** - `5a4fd11` (feat)
2. **Task 2: Add unit test for depot auto-seed logic** - `c0d9faa` (test)

## Files Created/Modified
- `convex/productInventory/depotAutoSeed.ts` - Shared helper with ensureDepotLocation function and DEPOT_CONFIG pattern matching
- `convex/productInventory/mutations.ts` - processGofoodSales now calls ensureDepotLocation instead of silently continuing
- `tests/unit/depotAutoSeed.test.ts` - 6 unit tests via convex-test covering all auto-seed scenarios

## Decisions Made
- Used pattern matching on outlet name (case-insensitive `includes`) rather than hardcoded externalId mapping -- more resilient to outlet renames
- `createdBy: "auto-seed"` distinguishes auto-seeded locations from manual seeds (`createdBy: "seed"`) in audit trails
- Zero-stock inventory seeding resolves menuProduct IDs through componentTypes -> menuProductComponents join (not direct menuProduct enumeration) to stay BOM-consistent

## Deviations from Plan

### Deviation: Task 1 was already committed by a prior execution

Task 1's changes (depotAutoSeed.ts + mutations.ts modification) were found already committed in `5a4fd11` by a previous execution that combined them with an E2E spec. The code matched the plan exactly. Only Task 2 (unit tests) required new work.

## Issues Encountered
- Plan specified `tests/unit/` directory which didn't exist (existing tests live in `tests/convex/`). Created the directory as specified by the plan since `vitest.config.ts` includes `tests/**/*.test.ts` glob.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auto-seed helper available for any future depot integration
- processGofoodSales now handles all known outlets (Tamtem, Goldfinch) and gracefully warns on unknown ones
- Ready for plans 39-02 (E2E order lifecycle) and 39-03 (E2E sales analytics)

## Self-Check: PASSED

All files verified present:
- convex/productInventory/depotAutoSeed.ts
- convex/productInventory/mutations.ts
- tests/unit/depotAutoSeed.test.ts
- .planning/phases/39-e2e-test-foundation-resilience/39-01-SUMMARY.md

All commits verified:
- 5a4fd11 (Task 1)
- c0d9faa (Task 2)

---
*Phase: 39-e2e-test-foundation-resilience*
*Completed: 2026-03-06*

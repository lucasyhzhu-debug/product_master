---
phase: 06-bom-migration
plan: 01
subsystem: database
tags: [convex, migration, bom, backfill, strangler-fig]

# Dependency graph
requires:
  - phase: 05-backend-factories
    provides: protectedMutation pattern and auth helpers
provides:
  - Idempotent BOM backfill mutation (backfillMenuProductBOM)
  - BOM verification comparison query (verifyBOMConsistency)
  - PRODUCTION_TYPE_TO_BOM_CODE mapping table
  - Brochure reclassification from menuProducts to packaging componentType
affects: [06-02 dual-read, 06-03 stop-writes, 08-schema-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [idempotent-migration-with-report, known-correction-overrides]

key-files:
  created:
    - convex/migrations/bomBackfill.ts
    - convex/migrations/bomVerification.ts
  modified: []

key-decisions:
  - "PRODUCTION_TYPE_TO_BOM_CODE mapping: original->BIG_BALL, bite_sized->MID_BALL (counterintuitive but correct per CLAUDE.md Pitfall #11)"
  - "Known corrections auto-applied: Original Single -> 1 MID_BALL, Original Triple -> 3 MID_BALL (overrides standard mapping)"
  - "Brochure reclassification deletes menuProduct record but warns about referencing orderItems (snapshot data preserved)"
  - "Verification query compares against standard mapping only (not corrections), so corrected products will show as mismatches (expected)"

patterns-established:
  - "Idempotent migration with structured report: delete existing entries before recreating, return { total, backfilled, skipped, removed, corrected, errors, details[] }"
  - "Known correction override table: apply product-name-based overrides after standard mapping to handle unreliable field values"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 6 Plan 1: BOM Backfill Migration Summary

**Idempotent BOM backfill mutation with auto-corrections for Original Single/Triple and Brochure reclassification, plus verification comparison query**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T03:46:02Z
- **Completed:** 2026-02-14T03:48:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `backfillMenuProductBOM` mutation that maps deprecated productionType/productionUnits to BOM entries with correct counterintuitive mapping (original->BIG_BALL, bite_sized->MID_BALL)
- Built auto-correction system for known mismatches: Original Single (1 MID_BALL) and Original Triple (3 MID_BALL) override the standard mapping
- Brochure reclassification removes "Brochure - How to eat" from menuProducts while preserving it in componentTypes/inventory
- Created `verifyBOMConsistency` query that compares BOM data against deprecated fields for every menuProduct
- Both functions require admin auth via `requireRole(ctx, args.token, ["admin"])`
- Both functions callable from Convex dashboard Functions tab

## Task Commits

Each task was committed atomically:

1. **Task 1: Create idempotent BOM backfill migration** - `27a0491` (feat)
2. **Task 2: Create BOM verification comparison query** - `6899b52` (feat)

## Files Created/Modified
- `convex/migrations/bomBackfill.ts` - Backfill mutation: maps deprecated fields to BOM entries with corrections, reclassifies Brochure, returns structured report
- `convex/migrations/bomVerification.ts` - Verification query: compares BOM vs deprecated fields, reports match/mismatch/no_bom/no_deprecated status

## Decisions Made
- Used the same `PRODUCTION_TYPE_TO_BOM_CODE` mapping in both files (duplicated with cross-reference comment rather than shared module, since migration files should be self-contained)
- Brochure deletion includes a warning log if orderItems reference it (preserves snapshot data in orderItems, no cascading deletes)
- Verification query uses standard mapping only for comparison, meaning corrected products (Original Single, Original Triple) will show as "mismatch" status (expected behavior -- confirms corrections were applied)
- Pre-fetched all componentTypes into a Map for O(1) lookups during backfill (optimization for idempotent re-runs)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. After deployment, run the backfill from the Convex dashboard Functions tab, then run the verification query to confirm results.

## Next Phase Readiness
- Backfill and verification functions ready for deployment and execution
- Plan 06-02 (dual-read fallback) can proceed once backfill has been run and verified
- The verification query provides the safety net needed before switching code to read from BOM

---
*Phase: 06-bom-migration*
*Completed: 2026-02-14*

---
phase: 08-schema-cleanup
plan: 01
subsystem: database
tags: [convex, schema, audit, denormalization, documentation]

# Dependency graph
requires:
  - phase: 06-bom-migration
    provides: BOM system as source of truth, deprecated field identification
  - phase: 07-query-optimization
    provides: isKitchenVisible denormalization, completedAt field
provides:
  - Comprehensive field audit categorizing all 215 v.optional() fields (SCHEMA_AUDIT.md)
  - Formal denormalization annotations on all 55 denormalized fields in schema.ts
  - Denormalization Patterns summary section in SCHEMA.md
  - Removal log documenting 5 deprecated fields + 1 dead code item for cleanup
  - Category B list with backfill defaults for 14 fields
affects: [08-02-backfill, 08-03-removal, 08-04-tightening]

# Tech tracking
tech-stack:
  added: []
  patterns: [SNAPSHOT/CACHE/DERIVED inline annotation format for denormalized fields]

key-files:
  created: [docs/SCHEMA_AUDIT.md]
  modified: [convex/schema.ts, docs/SCHEMA.md]

key-decisions:
  - "orders.completedAt stays v.optional() (Category A, not B) because active orders legitimately lack it"
  - "55 denormalization annotations total: 18 SNAPSHOT, 25 CACHE, 12 DERIVED"
  - "menuProducts.isFixed classified as Category C (removable) with posSlot/packagingPosSlot as replacement for deletion protection"
  - "useConvexFixedProducts hook identified as dead code (exported but never imported)"

patterns-established:
  - "SNAPSHOT: Copied from {source} at {event}. Never updated after."
  - "CACHE: {what is cached}. Source: {source}. Updated: {when/how}."
  - "DERIVED: Computed as {formula}. Updated: {when}."

# Metrics
duration: 7min
completed: 2026-02-14
---

# Phase 8 Plan 01: Field Audit & Denormalization Documentation Summary

**Comprehensive audit of 215 v.optional() fields into A/B/C/D categories with 55 formal SNAPSHOT/CACHE/DERIVED annotations in schema.ts**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-14T06:55:47Z
- **Completed:** 2026-02-14T07:02:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `docs/SCHEMA_AUDIT.md` covering all 37+ tables with field-by-field categorization into A (legitimately optional), B (candidate for required), C (deprecated), and D (table-level) categories
- Annotated all 55 denormalized fields in `convex/schema.ts` with formal SNAPSHOT/CACHE/DERIVED comments including source-of-truth references and update timing
- Added Denormalization Patterns summary section to `docs/SCHEMA.md` with complete tables for all three categories
- Documented removal log: 5 deprecated schema fields + 1 dead code hook

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SCHEMA_AUDIT.md field audit document** - `01ebe7e` (docs)
2. **Task 2: Add denormalization comments to schema.ts and SCHEMA.md** - `82c72f5` (docs)

## Files Created/Modified
- `docs/SCHEMA_AUDIT.md` - Comprehensive field audit with categories A/B/C/D, removal log, denormalization inventory (created)
- `convex/schema.ts` - 55 formal SNAPSHOT/CACHE/DERIVED inline annotations replacing generic comments (modified)
- `docs/SCHEMA.md` - Denormalization Patterns summary section with SNAPSHOT/CACHE/DERIVED tables (modified)

## Decisions Made
- `orders.completedAt` classified as Category A (legitimately optional), not Category B, because active orders correctly lack this value. Backfill fills historical terminal orders but field stays optional.
- `menuProducts.isFixed` classified as Category C (removable) with deletion protection migrating to `posSlot !== undefined || packagingPosSlot !== undefined` check
- `useConvexFixedProducts` hook identified as dead code for removal (exported from useMenuProducts.ts but never imported by any component)
- 55 denormalization annotations (18 SNAPSHOT + 25 CACHE + 12 DERIVED) covering all denormalized fields across 15 tables

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SCHEMA_AUDIT.md provides the canonical reference for Plans 02 (backfill), 03 (removal), and 04 (tightening)
- Category B list with defaults ready for backfill migration implementation
- Category C removal log with code references ready for cleanup
- All denormalization patterns documented for future developers

## Self-Check: PASSED

All files exist, all commits verified, all content assertions validated.

---
*Phase: 08-schema-cleanup*
*Completed: 2026-02-14*

---
phase: 31-tech-debt-cleanup
plan: 01
subsystem: api
tags: [typescript, type-guard, convex, grabfood, bigseller, external-source]

# Dependency graph
requires:
  - phase: 28-bigseller-integration
    provides: BigSeller order queries with externalProductMappings index usage
  - phase: 27-grabfood-pos-integration
    provides: GrabFood adapter with pauseStore action
provides:
  - ExternalSource runtime type guard (convex/lib/externalSource.ts)
  - Contract test for EXTERNAL_SOURCES array drift detection
  - Type-safe source narrowing pattern for Convex withIndex queries
affects: [bigseller, grabfood, externalData, future-platform-integrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ExternalSource type guard: use isExternalSource() before passing string to Convex withIndex source fields"
    - "Local const extraction: after type guard narrows args.source, assign to local const for closure capture (tsc -b requires this)"

key-files:
  created:
    - convex/lib/externalSource.ts
    - convex/lib/__tests__/externalSource.test.ts
  modified:
    - convex/bigsellerOrders/queries.ts
    - convex/integrations/bigseller/queries.ts
    - convex/externalData/queries.ts
    - convex/integrations/grabfood/adapter.ts
    - src/pages/GrabFoodManager.tsx
    - tests/convex/helpers.ts

key-decisions:
  - "Extract args.source to local const after isExternalSource guard — TypeScript tsc -b does not narrow property access through callback closures"
  - "SKU index evaluation: no schema change needed — existing by_source_code composite index covers the lookup pattern at current volume"

patterns-established:
  - "isExternalSource guard pattern: import from convex/lib/externalSource, guard before withIndex, extract to local const"
  - "PAUSE_DURATION_MAP naming: use self-documenting SCREAMING_SNAKE for config maps, keys in real units (1440 minutes = 24 hours)"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 31 Plan 01: Tech Debt Cleanup Summary

**ExternalSource runtime type guard replacing 3 unsafe `as any` casts, GrabFood pause duration fix (120->1440), dead code removal**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T09:35:04Z
- **Completed:** 2026-03-01T09:40:28Z
- **Tasks:** 3
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments
- Created `convex/lib/externalSource.ts` with EXTERNAL_SOURCES const array, ExternalSource type, and isExternalSource runtime type guard matching all 8 schema literals
- Replaced 3 `as any` casts across BigSeller and externalData queries with proper type narrowing via isExternalSource guard
- Added contract test catching schema/array drift (validates 8 sources match, tests guard behavior)
- Fixed GrabFood pause duration map: key 120 (misleading 2h) replaced with 1440 (correct 24h in minutes)
- Human-readable pause success message ("paused for 24h" instead of "paused for 1440 min")
- Removed dead `createTag` export from test helpers (no imports existed after Phase 29.1 test suite repair)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ExternalSource type guard + fix as-any casts + add contract test** - `1839c9a` (refactor)
2. **Task 2: Fix GrabFood pause duration map + frontend buttons** - `c6fd514` (fix)
3. **Task 3: Remove dead createTag export + fix type narrowing in closures** - `0e16b38` (chore)

## Files Created/Modified
- `convex/lib/externalSource.ts` - NEW: EXTERNAL_SOURCES array, ExternalSource type, isExternalSource guard
- `convex/lib/__tests__/externalSource.test.ts` - NEW: Contract test (8 sources, guard true/false cases)
- `convex/bigsellerOrders/queries.ts` - Added isExternalSource import + guard in getUnmappedSkus, removed as any
- `convex/integrations/bigseller/queries.ts` - Added isExternalSource import + guard with early return in checkProductMapping, removed as any, extracted source to local const
- `convex/externalData/queries.ts` - Added isExternalSource import + guard in getLatestWebhookError, removed as any, extracted source to local const
- `convex/integrations/grabfood/adapter.ts` - Renamed durationMap to PAUSE_DURATION_MAP, changed key 120 to 1440, added human-readable label in success message
- `src/pages/GrabFoodManager.tsx` - Changed mins:120 to mins:1440 for "24 hours" pause button
- `tests/convex/helpers.ts` - Removed dead createTag function (lines 55-65)

## Decisions Made
- **Local const extraction for type narrowing:** TypeScript's `tsc -b` (used by `npm run build`) does not narrow `args.source` through callback closures in Convex's `.withIndex()`. The fix is to extract `const source = args.source` after the `isExternalSource()` guard, so the closure captures the narrowed local variable.
- **SKU index evaluation (documentation-only):** No schema change needed. The existing `externalProductMappings.by_source_code` composite index covers the lookup pattern used by `getUnmappedSkus`. Documented in 31-RESEARCH.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript tsc -b narrowing failure in withIndex closures**
- **Found during:** Task 3 (final build verification)
- **Issue:** `tsc --noEmit` (type-check) passed but `tsc -b` (build) failed with TS2345 — `args.source` not narrowed to ExternalSource inside `.withIndex()` callback closures, even after `isExternalSource()` guard
- **Fix:** Extracted `const source = args.source` after guard in both `integrations/bigseller/queries.ts` and `externalData/queries.ts`
- **Files modified:** convex/integrations/bigseller/queries.ts, convex/externalData/queries.ts
- **Verification:** `npm run build` passes
- **Committed in:** 0e16b38 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary fix for build to pass. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v1.4 milestone tech debt items resolved
- Ready for milestone completion and merge to main
- All 646 tests passing, build green

---
*Phase: 31-tech-debt-cleanup*
*Completed: 2026-03-01*

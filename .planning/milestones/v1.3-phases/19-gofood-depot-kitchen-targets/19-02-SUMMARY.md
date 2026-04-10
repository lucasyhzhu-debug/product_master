---
phase: 19-gofood-depot-kitchen-targets
plan: 02
subsystem: api
tags: [convex, gofood, depot, restock, product-mapping, wib-timezone]

requires:
  - phase: 19-01
    provides: gofoodOutletProductMappings schema table, by_outlet_product index

provides:
  - computeRestockSuggestion pure function (Mon=Thu reset, Fri/Sat=n+2, weekday=n+1)
  - getWibDateString, getWibDayOfWeek, getWibDateStringDaysAgo timezone helpers
  - isSeedRequired query (GF-05 seed detection)
  - getRestockSuggestions query (GF-04 per-outlet per-product restock suggestions)
  - getOutletProductMappings query (GF-02 per-outlet mappings with unmapped detection)
  - saveOutletProductMappings mutation (GF-02 explicit-save upsert)
  - initOutletMappingsFromPrevious mutation (GF-02 copy from previous depot)

affects: [phase-19-03, phase-19-04, phase-19-05, gofood-depot-frontend]

tech-stack:
  added: []
  patterns:
    - "Pure helper functions extracted to helpers.ts for testability (no ctx dependency)"
    - "WIB timezone via offset arithmetic: new Date(ts + 7*60*60*1000).toISOString()"
    - "Explicit-save product mapping pattern (not auto-save)"
    - "Upsert via by_outlet_product composite index lookup then patch/insert"
    - "New depot init: find most recently updated peer outlet, copy its mappings"

key-files:
  created:
    - convex/gofoodDepot/helpers.ts
  modified:
    - convex/gofoodDepot/queries.ts
    - convex/gofoodDepot/mutations.ts

key-decisions:
  - "computeRestockSuggestion uses Math.ceil on avg+buffer (rounds up partial items)"
  - "salesLast3Days uses validDays filter (>= 0) to handle missing data gracefully"
  - "getRestockSuggestions excludes today from 3-day average (only past days)"
  - "ctx.db.get typed workaround: use filter query on menuProducts to avoid union type error"
  - "initOutletMappingsFromPrevious: no-op if target outlet already has mappings (idempotent)"

requirements-completed: [GF-02, GF-04]

duration: 4min
completed: 2026-02-22
---

# Phase 19 Plan 02: Restock Suggestion Algorithm and Product Mapping CRUD Summary

**Day-of-week restock computation pure function (Mon=Thu total, Fri/Sat=n+2, weekday=n+1) with per-outlet GoBiz sales lookback, product mapping upsert mutation, and previous-depot initialization**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-22T07:19:04Z
- **Completed:** 2026-02-22T07:22:50Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `computeRestockSuggestion` pure function handles all day-of-week rules correctly with Monday reset, Fri/Sat n+2 buffer, and weekday n+1 buffer
- `getRestockSuggestions` query aggregates per-outlet GoBiz revenue items over 14-day lookback window and computes per-product suggestions with breakdown text
- `getOutletProductMappings` query returns all mappings with menu product names enriched, plus detects unmapped products from last 30 days of revenue data
- `saveOutletProductMappings` mutation uses explicit-save pattern (admin only), upserts via composite index
- `initOutletMappingsFromPrevious` mutation copies from most recently updated peer outlet, idempotent (no-op if already initialized

## Task Commits

Each task was committed atomically:

1. **Task 1: Restock suggestion helper and query** - `96e2b4d` (feat)
2. **Task 2: Product mapping CRUD mutations and queries** - `7c42567` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `convex/gofoodDepot/helpers.ts` - Pure restock computation and WIB timezone helpers (no Convex context dependency)
- `convex/gofoodDepot/queries.ts` - Added imports from helpers; added isSeedRequired, getRestockSuggestions, getOutletProductMappings queries
- `convex/gofoodDepot/mutations.ts` - Added saveOutletProductMappings and initOutletMappingsFromPrevious mutations

## Decisions Made
- `computeRestockSuggestion` uses `Math.ceil` on avg+buffer so partial daily averages always round up (conservative/safe for restocking)
- `salesLast3Days` filter uses `v >= 0` to treat missing data days as 0 (graceful degradation when no sales history)
- Today excluded from 3-day average in `getRestockSuggestions` (we suggest for tomorrow based on past days)
- Used typed filter query `ctx.db.query("menuProducts").filter(...)` instead of `ctx.db.get(mpId as any)` to avoid union type error from generic `get()`
- `initOutletMappingsFromPrevious` is idempotent: returns early if target outlet already has mappings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript union type error in getRestockSuggestions**
- **Found during:** Task 1 (build verification)
- **Issue:** `ctx.db.get(mpId as any)` returned union of all table doc types; accessing `.name` failed type check because `sessions` table doesn't have `name`
- **Fix:** Changed to `ctx.db.query("menuProducts").filter(q => q.eq(q.field("_id"), mpId)).first()` for proper typed result
- **Files modified:** convex/gofoodDepot/queries.ts
- **Verification:** `npm run build` passes with no type errors
- **Committed in:** 96e2b4d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type bug)
**Impact on plan:** Minor type fix, no behavioral change.

## Issues Encountered
None beyond the auto-fixed type error above.

## Next Phase Readiness
- Plan 03 (frontend GoFood Depot page) can now call:
  - `api.gofoodDepot.queries.getRestockSuggestions` for cockpit table restock column
  - `api.gofoodDepot.queries.getOutletProductMappings` for mapping section
  - `api.gofoodDepot.mutations.saveOutletProductMappings` for explicit-save button
  - `api.gofoodDepot.mutations.initOutletMappingsFromPrevious` on new outlet creation
  - `api.gofoodDepot.queries.isSeedRequired` for full-page seed blocker (GF-05)
- No blockers for next plans

---
*Phase: 19-gofood-depot-kitchen-targets*
*Completed: 2026-02-22*

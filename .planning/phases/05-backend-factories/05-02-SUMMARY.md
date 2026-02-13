---
phase: 05-backend-factories
plan: 02
subsystem: auth
tags: [protectedMutation, session-auth, query-helpers, useSessionMutation, convex-helpers]

# Dependency graph
requires:
  - phase: 05-backend-factories
    plan: 01
    provides: "protectedMutation/publicMutation wrappers, listAll/textSearch query helpers, createTestSession test helper, SessionProvider"
provides:
  - "Auth-protected ingredient CRUD mutations with manager/admin role enforcement"
  - "Auth-protected material CRUD mutations with manager/admin role enforcement"
  - "Auth-protected tag create/update/remove with manager/admin role enforcement"
  - "Public tag seedDefaults mutation (no auth required)"
  - "Ingredient/material/tag queries using listAll and textSearch helpers"
  - "Frontend hooks using useSessionMutation for auto sessionId injection"
  - "Tags test suite updated with session-based auth fixtures"
affects: [05-03, 06-bom-migration, 09-frontend-factories]

# Tech tracking
tech-stack:
  added: []
  patterns: [protectedMutation-entity-migration, useSessionMutation-hook-pattern, createTestSession-in-tests]

key-files:
  created: []
  modified:
    - convex/ingredients/mutations.ts
    - convex/ingredients/queries.ts
    - convex/materials/mutations.ts
    - convex/materials/queries.ts
    - convex/tags/mutations.ts
    - convex/tags/queries.ts
    - src/hooks/convex/useIngredients.ts
    - src/hooks/convex/useMaterials.ts
    - src/hooks/convex/useTags.ts
    - tests/convex/tags.test.ts

key-decisions:
  - "Tags seedDefaults uses publicMutation (not protectedMutation) to remain callable from dashboard without auth"
  - "createdBy derived from ctx.user.name on server side, removed from frontend create input types"
  - "Tags seedDefaults hook uses useMutation (not useSessionMutation) since it is a public mutation"
  - "Query files kept as public query (no auth) since page-level ProtectedRoute already guards access"

patterns-established:
  - "Entity mutation migration: replace mutation import with protectedMutation from lib/functions, add roles metadata"
  - "Entity query migration: replace manual list/search with listAll/textSearch from lib/queryHelpers"
  - "Frontend hook migration: replace useMutation with useSessionMutation, remove createdBy from input types"
  - "Test auth migration: add createTestSession(t, { role }) before calling protected mutations, pass sessionId in args"

# Metrics
duration: 5min
completed: 2026-02-13
---

# Phase 5 Plan 02: Simple Entity Migration Summary

**Migrated ingredients/materials/tags to protectedMutation auth wrappers with session-based role enforcement, query helpers, useSessionMutation frontend hooks, and updated test fixtures**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T16:07:17Z
- **Completed:** 2026-02-13T16:13:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Migrated 3 entity mutation files from bare `mutation` to `protectedMutation` with manager/admin role enforcement
- Migrated 3 entity query files to use `listAll` and `textSearch` helpers from `lib/queryHelpers`
- Updated 3 frontend hook files to use `useSessionMutation` for automatic sessionId injection
- Updated tags test suite with `createTestSession` auth fixtures (12 tests pass, seedDefaults tests unchanged)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate ingredients/materials/tags backend (mutations + queries)** - `11d6ed9` (feat)
2. **Task 2: Update frontend hooks and fix tags tests** - `8bf94b3` (feat)

## Files Created/Modified
- `convex/ingredients/mutations.ts` - protectedMutation with manager/admin roles, createdBy from ctx.user.name
- `convex/ingredients/queries.ts` - listAll and textSearch helpers
- `convex/materials/mutations.ts` - protectedMutation with manager/admin roles, createdBy from ctx.user.name
- `convex/materials/queries.ts` - listAll and textSearch helpers
- `convex/tags/mutations.ts` - protectedMutation for CRUD, publicMutation for seedDefaults
- `convex/tags/queries.ts` - listAll helper with ascending order
- `src/hooks/convex/useIngredients.ts` - useSessionMutation, removed createdBy from IngredientCreateInput
- `src/hooks/convex/useMaterials.ts` - useSessionMutation, removed createdBy from MaterialCreateInput
- `src/hooks/convex/useTags.ts` - useSessionMutation for CRUD, useMutation kept for seedDefaults
- `tests/convex/tags.test.ts` - createTestSession for CRUD tests, seedDefaults tests unchanged

## Decisions Made
- Tags seedDefaults uses publicMutation (not protectedMutation) since it is a dashboard utility run without user context
- createdBy field removed from frontend create input types -- now derived from ctx.user.name on the server side
- Tags seedDefaults hook kept on useMutation (not useSessionMutation) because the public mutation does not accept sessionId
- Query files remain public queries (no auth needed on reads) since ProtectedRoute already guards page access

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 3 simple entities fully migrated: ingredients, materials, tags (mutations + queries + hooks + tests)
- Pattern validated end-to-end: protectedMutation -> useSessionMutation -> createTestSession
- Ready for Plan 05-03 to migrate remaining simple entities (customers, storageLocations, shipping)
- Pattern established for future entity migrations in Phase 6+ (BOM migration)

## Self-Check: PASSED

All 10 modified files verified present. Both commit hashes (11d6ed9, 8bf94b3) found in git log.

---
*Phase: 05-backend-factories*
*Completed: 2026-02-13*

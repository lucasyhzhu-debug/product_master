---
phase: 05-backend-factories
plan: 01
subsystem: auth
tags: [convex-helpers, customMutation, customQuery, session-auth, query-helpers]

# Dependency graph
requires:
  - phase: 01-test-infrastructure
    provides: "Test framework and fixtures for convex-test"
provides:
  - "protectedMutation/protectedQuery wrappers with session-based role auth"
  - "publicMutation/publicQuery re-exports for unauthenticated functions"
  - "listAll/getById/textSearch query helper functions"
  - "createTestSession helper for convex-test auth fixtures"
  - "SessionProvider integration in frontend component tree"
  - "Auth token synced to SessionProvider storage on all auth state changes"
affects: [05-02, 05-03, 06-bom-migration, 09-frontend-factories]

# Tech tracking
tech-stack:
  added: [convex-helpers@0.1.112]
  patterns: [customMutation-with-role-metadata, localStorage-session-bridge, session-based-auth]

key-files:
  created:
    - convex/lib/functions.ts
    - convex/lib/queryHelpers.ts
    - tests/helpers/authTestHelper.ts
  modified:
    - src/main.tsx
    - src/contexts/AuthContext.tsx
    - package.json

key-decisions:
  - "Used customMutation role metadata pattern (3rd arg) for per-function role declarations"
  - "Generic Unauthorized error on all auth failures (no role details leaked)"
  - "Custom useLocalStorage hook for SessionProvider to persist across tabs"
  - "Auth token written to malo_session_id localStorage key on all 5 state transitions"

patterns-established:
  - "protectedMutation({ roles: [...], args: {...}, handler }): session-based auth with role metadata"
  - "protectedQuery({ roles: [...], args: {...}, handler }): same pattern for queries"
  - "createTestSession(t, { role }): test helper returning sessionId for auth-required tests"
  - "SessionProvider + useLocalStorage: localStorage-based session bridge between AuthContext and convex-helpers"

# Metrics
duration: 8min
completed: 2026-02-13
---

# Phase 5 Plan 01: Foundation Wrappers Summary

**convex-helpers auth wrappers (protectedMutation/protectedQuery) with role metadata, query helpers (listAll/getById/textSearch), test auth helper, and SessionProvider frontend integration**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-13T15:56:03Z
- **Completed:** 2026-02-13T16:04:15Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Installed convex-helpers v0.1.112 and created protectedMutation/protectedQuery wrappers using customMutation with role metadata pattern
- Created listAll, getById, textSearch query helpers with full generic type safety
- Created createTestSession helper for convex-test auth fixtures
- Integrated SessionProvider into frontend with localStorage-based session bridge synced to AuthContext on login, logout, mount, expiry, and server invalidation

## Task Commits

Each task was committed atomically:

1. **Task 1: Install convex-helpers and create backend wrappers + query helpers + test helper** - `e0ef039` (feat)
2. **Task 2: Integrate SessionProvider into frontend and sync auth token** - `6ea5db1` (feat)

## Files Created/Modified
- `convex/lib/functions.ts` - Auth wrapper exports: protectedMutation, protectedQuery, publicMutation, publicQuery
- `convex/lib/queryHelpers.ts` - Query helper exports: listAll, getById, textSearch
- `tests/helpers/authTestHelper.ts` - Test auth helper export: createTestSession
- `src/main.tsx` - SessionProvider wrapping AuthProvider with useLocalStorage hook
- `src/contexts/AuthContext.tsx` - Auth token synced to malo_session_id localStorage key
- `package.json` - convex-helpers@0.1.112 added to dependencies

## Decisions Made
- Used customMutation role metadata pattern (third argument) for per-function role declarations -- roles are declared at the function definition site and never travel over the wire
- Generic "Unauthorized" error for all auth failures (no role details, no active status details) per locked decision
- Created custom useLocalStorage hook for SessionProvider instead of default sessionStorage (needed for cross-tab persistence and AuthContext sync)
- Auth token synced to malo_session_id on all 5 state change paths: login success, logout, mount (valid), mount (expired), server-side invalidation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed UseStorage type mismatch in useLocalStorage hook**
- **Found during:** Task 2 (SessionProvider integration)
- **Issue:** SessionProvider's UseStorage type expects setter to accept `SessionId | undefined`, but initial implementation accepted only `SessionId`. Build failed with TS2322.
- **Fix:** Widened setter parameter to `SessionId | undefined`, added localStorage.removeItem branch for undefined values
- **Files modified:** src/main.tsx
- **Verification:** npm run build passes
- **Committed in:** 6ea5db1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking type error)
**Impact on plan:** Type fix necessary for build to pass. No scope creep.

## Issues Encountered
None beyond the type fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundation wrappers ready for Plans 02 (simple entity mutation migration) and 03 (simple entity query migration + frontend hook updates)
- protectedMutation/protectedQuery are ready for use by any entity mutation/query
- createTestSession helper ready for auth-required entity tests
- SessionProvider active in frontend -- useSessionMutation/useSessionQuery can be adopted incrementally

## Self-Check: PASSED

All 6 files verified present. Both commit hashes (e0ef039, 6ea5db1) found in git log.

---
*Phase: 05-backend-factories*
*Completed: 2026-02-13*

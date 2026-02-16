---
phase: 05-backend-factories
plan: 03
subsystem: auth
tags: [protectedMutation, useSessionMutation, customers, storageLocations, shipping, query-helpers]

# Dependency graph
requires:
  - phase: 05-backend-factories
    plan: 01
    provides: "protectedMutation/protectedQuery wrappers, query helpers, SessionProvider"
provides:
  - "Auth-protected customer CRUD mutations (manager/admin)"
  - "Auth-protected storage location CRUD mutations (manager/admin)"
  - "Shipping mutations documented as internal system pattern"
  - "Customer queries using listAll and textSearch helpers"
  - "Frontend hooks for customers and storageLocations using useSessionMutation"
affects: [06-bom-migration, 09-frontend-factories]

# Tech tracking
tech-stack:
  added: []
  patterns: [protectedMutation-entity-migration, useSessionMutation-hook-migration, internal-system-mutation-pattern]

key-files:
  created: []
  modified:
    - convex/customers/mutations.ts
    - convex/customers/queries.ts
    - convex/storageLocations/mutations.ts
    - convex/shipping/mutations.ts
    - src/hooks/convex/useCustomers.ts
    - src/hooks/convex/useStorageLocations.ts
    - src/pages/LocationsManager.tsx

key-decisions:
  - "Shipping mutations remain bare mutation() -- internal system calls, auth enforced by calling order mutations"
  - "StorageLocations queries left as-is -- custom index/sort patterns too specific for generic helpers"
  - "Shipping queries left as-is -- unique usage tracking patterns not suited to generic helpers"

patterns-established:
  - "Internal system mutation pattern: bare mutation() with JSDoc explaining why no auth wrapper (Pitfall 6)"
  - "Entity migration pattern: protectedMutation + remove createdBy from args + derive from ctx.user.name"

# Metrics
duration: 6min
completed: 2026-02-13
---

# Phase 5 Plan 03: Customers/StorageLocations/Shipping Migration Summary

**Customers and storageLocations wrapped with protectedMutation (manager/admin), frontend hooks migrated to useSessionMutation, shipping documented as internal system pattern with bare mutation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-13T16:07:51Z
- **Completed:** 2026-02-13T16:14:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Migrated customers mutations (create/update/remove) to protectedMutation with manager/admin role enforcement
- Migrated storageLocations mutations (create/update/remove) to protectedMutation with manager/admin role enforcement
- Replaced manual createdBy arg with ctx.user.name derivation in both entity create mutations
- Migrated customer queries to use listAll and textSearch helpers from queryHelpers
- Migrated 6 frontend mutation hooks (3 customers, 3 storageLocations) to useSessionMutation
- Documented shipping mutations as internal system pattern (bare mutation with JSDoc)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate customers, storageLocations, shipping backend (mutations + queries)** - `6abf8c6` (feat)
2. **Task 2: Update frontend hooks for customers and storageLocations** - `f99bc32` (feat)

## Files Created/Modified
- `convex/customers/mutations.ts` - protectedMutation wrapper, createdBy from ctx.user.name
- `convex/customers/queries.ts` - listAll and textSearch helpers replace manual implementations
- `convex/storageLocations/mutations.ts` - protectedMutation wrapper, createdBy from ctx.user.name
- `convex/shipping/mutations.ts` - JSDoc header documenting internal system pattern
- `src/hooks/convex/useCustomers.ts` - useSessionMutation for 3 mutation hooks, createdBy removed from input type
- `src/hooks/convex/useStorageLocations.ts` - useSessionMutation for 3 mutation hooks, createdBy removed from input type
- `src/pages/LocationsManager.tsx` - Removed createdBy arg from create call, removed unused useAuth import

## Decisions Made
- Shipping mutations (incrementAgencyUsage, decrementAgencyUsage, seedFromExistingOrders) remain as bare mutation() -- they are internal system calls invoked by order mutations, not user-facing CRUD. Auth is enforced by the calling order mutations.
- StorageLocations queries left as-is (custom .withIndex("by_active") + sort logic is entity-specific, not a generic helper pattern)
- Shipping queries left as-is (unique usage tracking by index, not suited for generic helpers)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed createdBy from LocationsManager.tsx create call**
- **Found during:** Task 2 (frontend hook migration)
- **Issue:** LocationsManager.tsx passed `createdBy: user?.name ?? "unknown"` to the create mutation, but the backend no longer accepts createdBy as an arg (derived from session). Dead code that would be silently ignored at runtime.
- **Fix:** Removed createdBy from the create call args. Also removed the now-unused `useAuth()` destructuring and import since `user` was only used for createdBy.
- **Files modified:** src/pages/LocationsManager.tsx
- **Verification:** npm run build passes, npm run type-check passes
- **Committed in:** f99bc32 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dead code cleanup)
**Impact on plan:** Necessary cleanup to avoid dead code. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 simple entities are now addressed:
  - 5 entities (ingredients, materials, tags, customers, storageLocations) fully migrated with auth + helpers + frontend (Plans 02 + 03)
  - 1 entity (shipping) documented as internal system pattern, intentionally unwrapped
- Phase 5 (Backend Factories) is complete when Plan 02 also finishes (parallel execution)
- Foundation ready for Phase 6 (BOM Migration) and Phase 9 (Frontend Factories)

## Self-Check: PASSED

All 7 modified files verified present. Both commit hashes (6abf8c6, f99bc32) found in git log.

---
*Phase: 05-backend-factories*
*Completed: 2026-02-13*

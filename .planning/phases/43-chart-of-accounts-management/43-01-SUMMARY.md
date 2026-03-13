---
phase: 43-chart-of-accounts-management
plan: 01
subsystem: ui, api
tags: [convex, react, entitymanager, psak, chart-of-accounts, admin]

# Dependency graph
requires:
  - phase: 41-schema-seed-counters
    provides: accounts table schema, by_code/by_type/by_active_type indexes, seedDefaults mutation
provides:
  - accounts list and getById queries with activeOnly filtering
  - accounts create/update/remove mutations with PSAK validation
  - useAccounts hook layer with factory mutation hooks
  - AccountsManager admin page at /accounts using EntityManager
  - EntityManager canDelete prop for per-item delete visibility
affects: [44-expense-submission, 48-permissions-routing, 49-pnl-queries]

# Tech tracking
tech-stack:
  added: []
  patterns: [canDelete prop on EntityManager for conditional delete button visibility]

key-files:
  created:
    - convex/accounts/queries.ts
    - src/hooks/convex/useAccounts.ts
    - src/pages/AccountsManager.tsx
  modified:
    - convex/accounts/mutations.ts
    - src/components/shared/EntityManager.tsx
    - src/hooks/convex/index.ts
    - src/App.tsx
    - convex/_generated/api.d.ts

key-decisions:
  - "canDelete prop on EntityManager is backward-compatible (no canDelete = all items deletable)"
  - "Account code immutable after creation (stripped from update payload)"
  - "Double toast suppressed via empty successMessage on mutation hooks (EntityManager handles toast)"
  - "Lock icon uses aria-label not title prop (Lucide React type constraint)"

patterns-established:
  - "canDelete prop: EntityManager now supports per-item delete visibility via callback"
  - "Code-only type derivation: account type/category auto-derived from PSAK code prefix"

requirements-completed: [COA-01, COA-02, COA-03]

# Metrics
duration: 7min
completed: 2026-03-13
---

# Phase 43 Plan 01: Chart of Accounts Management Summary

**Admin CRUD page for 36+ PSAK-aligned GL accounts with auto-type derivation, system account protection, and EntityManager canDelete enhancement**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-13T06:35:38Z
- **Completed:** 2026-03-13T06:42:43Z
- **Tasks:** 6
- **Files modified:** 8

## Accomplishments
- EntityManager enhanced with canDelete prop for per-item delete button visibility (backward compatible)
- Full CRUD backend for GL accounts: 4-digit code validation, PSAK prefix auto-derivation, uniqueness enforcement, system account protection, journal/expense dependency checks
- AccountsManager page with color-coded type badges, lock icons for system accounts, and search by code/name/category
- Route registered at /accounts with admin-only role guard

## Task Commits

Each task was committed atomically:

1. **Task 0: Add canDelete prop to EntityManager** - `f3a1797` (feat)
2. **Task 1: Create accounts queries** - `394f107` (feat)
3. **Task 2: Add create, update, remove mutations** - `028e4f3` (feat)
4. **Task 3: Create useAccounts hook + barrel export** - `47278b2` (feat)
5. **Task 4: Create AccountsManager page** - `ee9d6e7` (feat)
6. **Task 5: Register route in App.tsx** - `3127558` (feat)

## Files Created/Modified
- `convex/accounts/queries.ts` - list (with activeOnly) and getById queries
- `convex/accounts/mutations.ts` - Added create, update, remove mutations with protectedMutation
- `src/components/shared/EntityManager.tsx` - Added canDelete prop to hide delete per-item
- `src/hooks/convex/useAccounts.ts` - Query and mutation hooks for accounts
- `src/hooks/convex/index.ts` - Barrel export for accounts hooks
- `src/pages/AccountsManager.tsx` - Admin page with EntityManager pattern
- `src/App.tsx` - Lazy import and /accounts route with admin guard
- `convex/_generated/api.d.ts` - Regenerated to include accounts module

## Decisions Made
- canDelete prop on EntityManager is backward-compatible: no existing pages affected
- Account code is immutable after creation for ALL accounts (not just system) to prevent PSAK range inconsistency
- Double toast suppressed by passing empty successMessage to createMutationHook (EntityManager already toasts)
- Lock icon uses aria-label instead of title prop due to Lucide React TypeScript constraints
- Description clearing: empty string passed to backend triggers field removal from document

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Convex codegen required for api.d.ts**
- **Found during:** Task 5 (build verification)
- **Issue:** `npm run build` failed because `convex/_generated/api.d.ts` did not include the new accounts module. `tsc --noEmit` passed but `tsc -b` (used by build) was stricter.
- **Fix:** Ran `npx convex codegen` to regenerate API types
- **Files modified:** convex/_generated/api.d.ts
- **Verification:** `npm run build` passes
- **Committed in:** 3127558

**2. [Rule 1 - Bug] Lock icon title prop not valid in Lucide React**
- **Found during:** Task 5 (build verification)
- **Issue:** `<Lock title="System account" />` fails type check; Lucide React icons don't accept `title` prop
- **Fix:** Changed to `aria-label="System account"` which is semantically correct and valid
- **Files modified:** src/pages/AccountsManager.tsx
- **Verification:** `npm run build` passes
- **Committed in:** 3127558

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for build to pass. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Accounts CRUD is complete; expense submission (Phase 44) can now reference accounts via accountId
- No nav link to /accounts yet (deferred to Phase 48 Finance hub navigation)
- No canAccessAccounting permission (deferred to Phase 48 - uses allowedRoles directly)

---
*Phase: 43-chart-of-accounts-management*
*Completed: 2026-03-13*

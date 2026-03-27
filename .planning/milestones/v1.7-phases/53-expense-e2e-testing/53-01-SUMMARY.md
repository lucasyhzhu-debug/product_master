---
phase: 53-expense-e2e-testing
plan: 01
subsystem: testing
tags: [playwright, e2e, multi-role-auth, csv-fixture]

# Dependency graph
requires:
  - phase: 39-e2e-test-foundation
    provides: initial global-setup.ts, helpers.ts, playwright.config.ts
provides:
  - 4 idempotent E2E test users (E2E-Admin, E2E-Manager, E2E-Kitchen, E2E-OrderStaff)
  - loginAsRole(page, role) helper for multi-role testing
  - logout(page) helper for role switching mid-test
  - fillExpenseForm(page, data) helper for expense creation flows
  - waitForAppReady now exported publicly
  - CSV fixture with 5 valid + 3 invalid rows for import testing
affects: [53-02, 53-03, 53-04, 53-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [check-before-create idempotent user setup, role-switching via logout+loginAsRole]

key-files:
  modified:
    - tests/e2e/global-setup.ts
    - tests/e2e/helpers.ts
  created:
    - tests/e2e/fixtures/test-expenses.csv

key-decisions:
  - "ensureTestUser checks existing users by name before creating to prevent duplicates (createUser has no unique-name constraint)"
  - "loginAsManager kept unchanged for backward compat with 12 existing spec files"
  - "waitForAppReady exported publicly as loginAsRole and future specs need direct access"
  - "logout clears localStorage+sessionStorage then navigates to /login (no /logout route exists)"

patterns-established:
  - "ROLE_USER_NAMES record maps TestRole to E2E user names for consistent avatar grid selection"
  - "ensureTestUser pattern: check-before-create with unlock+resetPin for existing users"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 53 Plan 01: E2E Infrastructure Summary

**Multi-role E2E test infrastructure with 4 idempotent test users, loginAsRole/logout/fillExpenseForm helpers, and CSV import fixture**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T04:59:06Z
- **Completed:** 2026-03-15T05:02:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended global-setup.ts to create 4 E2E test users (Admin, Manager, Kitchen, OrderStaff) idempotently with check-before-create pattern
- Added loginAsRole, logout, fillExpenseForm helpers to helpers.ts with waitForAppReady now publicly exported
- Created CSV fixture file (5 valid + 3 invalid rows) with realistic GL codes for import testing
- Preserved full backward compatibility with existing 12 spec files (loginAsManager unchanged, E2E_TEST_USER_NAME env var still set)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend global-setup.ts with multi-role test user creation** - `07b5b3b` (feat)
2. **Task 2: Extend helpers.ts with loginAsRole, logout, fillExpenseForm + CSV fixture** - `1ed2f85` (feat)

## Files Created/Modified
- `tests/e2e/global-setup.ts` - Extended with 4 E2E test users, ensureTestUser helper, backward compat preserved
- `tests/e2e/helpers.ts` - Added loginAsRole, logout, fillExpenseForm, exported waitForAppReady; loginAsManager unchanged
- `tests/e2e/fixtures/test-expenses.csv` - 9-line CSV fixture (header + 5 valid + 3 invalid rows)

## Decisions Made
- ensureTestUser checks existing users by name before creating to prevent duplicates (createUser has no unique-name constraint)
- loginAsManager kept unchanged for backward compat -- 12 existing spec files depend on it
- waitForAppReady made a public export since loginAsRole and future spec files need direct access
- logout uses localStorage.clear() + sessionStorage.clear() + navigate to /login (no /logout route exists)
- CSV fixture uses GL codes from seeded Chart of Accounts (6200, 6300, 6500, 6700, 6900) and one invalid code (9999)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All E2E infrastructure ready for Plan 02 (permission guard tests)
- loginAsRole enables testing all 4 roles against all 9 expense routes
- fillExpenseForm enables expense creation flows in lifecycle tests (Plan 03)
- CSV fixture ready for import validation tests (Plan 03)

## Self-Check: PASSED

All files verified present, all commit hashes confirmed in git log.

---
*Phase: 53-expense-e2e-testing*
*Completed: 2026-03-15*

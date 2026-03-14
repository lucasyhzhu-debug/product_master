---
phase: 48-frontend-permissions-routes
plan: 01
subsystem: ui
tags: [permissions, routes, protected-route, navigation, react]

# Dependency graph
requires:
  - phase: 44-expense-submission
    provides: Expense pages (MyExpenses, ExpenseSubmit) and bare ProtectedRoute guards
  - phase: 45-expense-approval-void
    provides: ExpenseApproval page with allowedRoles guard
  - phase: 46-reimbursement
    provides: ReimbursementManager and BankAccountsManager pages with allowedRoles guards
  - phase: 47-payroll
    provides: PayrollManager page with allowedRoles guard
provides:
  - 4 new permission flags in ROLE_PERMISSIONS (canSubmitExpenses, canApproveExpenses, canManageReimbursements, canAccessExpenseAnalytics)
  - All finance routes migrated from allowedRoles/bare to requiredPermission guards
  - ExpenseAnalytics stub page for Phase 50
  - Expense navigation links in Header and MobileBottomNav
affects: [49-opex-pnl, 50-expense-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [permission-flag-based-route-guards]

key-files:
  created:
    - src/pages/ExpenseAnalytics.tsx
    - tests/unit/permissions.test.ts
  modified:
    - src/lib/types.ts
    - src/App.tsx
    - src/components/layout/Header.tsx
    - src/components/layout/MobileBottomNav.tsx

key-decisions:
  - "canManageReimbursements used for /reimbursements, /bank-accounts, /payroll, /accounts (all admin-only, semantically correct)"
  - "Expenses nav link in mainNavItems after Financials (high-frequency for all roles)"
  - "Admin dropdown items migrated from canAccessUsers to canManageReimbursements for semantic correctness"

patterns-established:
  - "Permission-first route guards: all finance routes use requiredPermission instead of allowedRoles"

requirements-completed: [PERM-01, PERM-02, PERM-03, PERM-04]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 48 Plan 01: Frontend Permissions & Routes Summary

**4 expense permission flags with requiredPermission route guards replacing all allowedRoles on finance routes, plus ExpenseAnalytics stub and nav links**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-14T11:37:21Z
- **Completed:** 2026-03-14T11:42:38Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added 4 permission flags to ROLE_PERMISSIONS (18 total: 14 existing + 4 new) with correct per-role values
- Migrated all 7 finance routes (expenses, expenses/new, expenses/approve, reimbursements, bank-accounts, payroll, accounts) from allowedRoles/bare to requiredPermission guards
- Created ExpenseAnalytics stub page and registered /expense-analytics route
- Added Expenses and Exp. Analytics to desktop Header and mobile MobileBottomNav
- 838 tests passing (822 existing + 16 new permission tests)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing permission tests** - `162cc19` (test)
2. **Task 1 (GREEN): Add permission flags** - `23a12b1` (feat)
3. **Task 2: Routes, stub page, navigation** - `1c01c04` (feat)

## Files Created/Modified
- `src/lib/types.ts` - Added 4 permission flags to ROLE_PERMISSIONS Record type and all 4 role objects
- `src/App.tsx` - Migrated 7 finance routes to requiredPermission, added ExpenseAnalytics lazy import and /expense-analytics route
- `src/pages/ExpenseAnalytics.tsx` - Stub page with PageHeader (Phase 50 placeholder)
- `src/components/layout/Header.tsx` - Added Expenses + Exp. Analytics to mainNavItems, migrated admin items to canManageReimbursements
- `src/components/layout/MobileBottomNav.tsx` - Added Expenses + Exp. Analytics to moreItems
- `tests/unit/permissions.test.ts` - 16 assertions testing all 4 new flags across all 4 roles

## Decisions Made
- canManageReimbursements used for /reimbursements, /bank-accounts, /payroll, /accounts -- all admin-only, semantically more correct than canAccessUsers
- Expenses nav link placed after Financials in mainNavItems since it's high-frequency for all roles
- Admin dropdown items migrated from canAccessUsers to canManageReimbursements for semantic correctness (same effective access since both are admin-only)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Permission flags ready for use by Phase 49 (OpEx P&L) and Phase 50 (Expense Analytics)
- ExpenseAnalytics stub page ready to be replaced with full implementation in Phase 50
- All finance routes now consistently use requiredPermission pattern

## Self-Check: PASSED

All 6 files verified present. All 3 commits verified in git history.

---
*Phase: 48-frontend-permissions-routes*
*Completed: 2026-03-14*

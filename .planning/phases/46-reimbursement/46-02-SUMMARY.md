---
phase: 46-reimbursement
plan: 02
subsystem: ui
tags: [react, convex-hooks, reimbursement, admin-ui, entity-manager, tabs, dialog]

# Dependency graph
requires:
  - phase: 46-01
    provides: "Reimbursement backend (queries, mutations, bank accounts CRUD, audit trail)"
  - phase: 44-02
    provides: "useSessionQuery pattern for protected queries, expense hooks pattern"
  - phase: 45-02
    provides: "allowedRoles pattern for route guards, approval UI patterns"
  - phase: 43-01
    provides: "EntityManager component, AccountsManager pattern"
provides:
  - "useReimbursements.ts hook (4 query + 3 mutation hooks)"
  - "useBankAccounts.ts hook (2 query + 4 mutation hooks including useUpdateBankDetails)"
  - "ReimbursementManager page with pending queue and batch history tabs"
  - "BankAccountsManager page using EntityManager CRUD"
  - "PendingExpensesGroup, ConfirmBatchDialog, BatchCard components"
  - "Route registrations for /reimbursements and /bank-accounts (admin-only)"
  - "Navigation links in Header admin dropdown"
affects: [48-permissions, 50-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useSessionQuery for admin-only protectedQuery endpoints"
    - "Auto-open confirm dialog after batch creation for streamlined workflow"
    - "Debounced search input (300ms) for batch history"
    - "Status filter button group for batch history"

key-files:
  created:
    - src/hooks/convex/useReimbursements.ts
    - src/hooks/convex/useBankAccounts.ts
    - src/components/reimbursements/PendingExpensesGroup.tsx
    - src/components/reimbursements/ConfirmBatchDialog.tsx
    - src/components/reimbursements/BatchCard.tsx
    - src/pages/ReimbursementManager.tsx
    - src/pages/BankAccountsManager.tsx
  modified:
    - src/hooks/convex/index.ts
    - src/App.tsx
    - src/components/layout/Header.tsx
    - convex/reimbursements/queries.ts
    - convex/_generated/api.d.ts

key-decisions:
  - "useUpdateBankDetails lives in useBankAccounts.ts (domain grouping) not useExpenses.ts"
  - "EntityManager mutation hooks suppress toasts (empty successMessage/errorMessage) to avoid double toast"
  - "canAccessUsers permission for nav items since canManageReimbursements deferred to Phase 48"
  - "Auto-open ConfirmBatchDialog after batch creation for streamlined admin workflow"
  - "Debounced search (300ms) for batch history to reduce query frequency"

patterns-established:
  - "Reimbursement hook domain grouping: bank-related hooks in useBankAccounts.ts regardless of backend API path"
  - "Auto-open confirm dialog pattern for multi-step admin workflows"

requirements-completed: [RMB-01, RMB-02, RMB-03, RMB-04, RMB-05, RMB-06, RMB-07, RMB-08]

# Metrics
duration: 12min
completed: 2026-03-14
---

# Phase 46 Plan 02: Reimbursement Frontend Summary

**Admin reimbursement UI with pending expense queue, batch creation/confirm/void workflow, searchable batch history, and company bank accounts CRUD**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-13T21:42:46Z
- **Completed:** 2026-03-13T21:54:42Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Complete reimbursement frontend with 2 pages, 3 components, 2 hook files (13 hooks total)
- ReimbursementManager page with Pending tab (grouped expense queue) and Batches tab (searchable history with status filter)
- BankAccountsManager page using EntityManager pattern for company bank accounts CRUD
- Streamlined workflow: batch creation auto-opens confirm dialog for immediate confirmation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create hooks, reimbursement components, and BankAccountsManager page** - `186cdbc` (feat)
2. **Task 2: Create ReimbursementManager page, register routes, and add navigation links** - `3d20ec1` (feat)

## Files Created/Modified
- `src/hooks/convex/useReimbursements.ts` - 4 query + 3 mutation hooks for reimbursement batches
- `src/hooks/convex/useBankAccounts.ts` - 2 query + 4 mutation hooks for bank accounts + user bank details
- `src/hooks/convex/index.ts` - Barrel exports for all new hooks
- `src/components/reimbursements/PendingExpensesGroup.tsx` - Employee expense group card with selection and batch creation
- `src/components/reimbursements/ConfirmBatchDialog.tsx` - Dialog for BCA reference, transfer date, source bank account with JE preview
- `src/components/reimbursements/BatchCard.tsx` - Batch summary card with expandable expenses, confirm/void actions
- `src/pages/ReimbursementManager.tsx` - Main page with Pending and Batches tabs, void dialog
- `src/pages/BankAccountsManager.tsx` - EntityManager CRUD for company bank accounts
- `src/App.tsx` - Route registrations for /reimbursements and /bank-accounts with allowedRoles={["admin"]}
- `src/components/layout/Header.tsx` - Admin dropdown links for Reimburse and Bank Accts
- `convex/reimbursements/queries.ts` - Fixed type bug (as never -> Id<"users">)
- `convex/_generated/api.d.ts` - Regenerated API types for new backend modules

## Decisions Made
- useUpdateBankDetails hook placed in useBankAccounts.ts (bank-domain grouping, not useExpenses.ts) per I4 fix
- EntityManager mutation hooks use empty toast messages to prevent double-toast (EntityManager handles its own)
- canAccessUsers permission used for nav items since canManageReimbursements deferred to Phase 48 (PERM-03)
- Auto-open ConfirmBatchDialog after successful batch creation for streamlined admin workflow
- Debounced search input (300ms) in batch history to reduce Convex query frequency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed type cast in reimbursement queries**
- **Found during:** Task 1 (build verification)
- **Issue:** `ctx.db.get(group.userId as never)` returned a union of all document types, causing TS errors for `.name`, `.bankAccountNumber`, `.bankName` properties
- **Fix:** Changed `as never` to `as Id<"users">` and added `import type { Id }` from `_generated/dataModel`
- **Files modified:** `convex/reimbursements/queries.ts`
- **Verification:** npm run build passes cleanly
- **Committed in:** 186cdbc (Task 1 commit)

**2. [Rule 3 - Blocking] Regenerated Convex API types**
- **Found during:** Task 1 (build verification)
- **Issue:** `convex/_generated/api.d.ts` did not include `reimbursements` or `bankAccounts` module types (new modules from Plan 01 not yet in generated types)
- **Fix:** Ran `npx convex codegen` to regenerate type bindings
- **Files modified:** `convex/_generated/api.d.ts`
- **Verification:** Hook imports resolve correctly, build passes
- **Committed in:** 186cdbc (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Reimbursement UI complete; admin can manage the full batch lifecycle (create, confirm, void)
- Phase 47 (Expense Reports) can proceed with reimbursement data available
- Phase 48 (Permissions) can add dedicated canManageReimbursements permission flag
- Phase 50 (Analytics) can aggregate reimbursement batch data

## Self-Check: PASSED

- All 10 key files: FOUND
- Commit 186cdbc (Task 1): FOUND
- Commit 3d20ec1 (Task 2): FOUND
- Build: PASSED (0 errors)
- Tests: PASSED (804/804)

---
*Phase: 46-reimbursement*
*Completed: 2026-03-14*

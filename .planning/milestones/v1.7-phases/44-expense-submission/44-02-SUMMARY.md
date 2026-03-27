---
phase: 44-expense-submission
plan: 02
subsystem: ui
tags: [react, expenses, forms, timeline, receipt-upload, sha256]

# Dependency graph
requires:
  - phase: 44-expense-submission
    provides: Expense mutations (createDraft, updateDraft, submitExpense, generateUploadUrl) and queries (listMyExpenses, getById, getStatusHistory) from Plan 01
  - phase: 43-chart-of-accounts-management
    provides: useAccounts hook for GL category dropdown
provides:
  - Expense React hooks (useMyExpenses, useExpense, useExpenseStatusHistory, mutation hooks)
  - ExpenseSubmit form page at /expenses/new (create/edit draft)
  - MyExpenses list page at /expenses (status tabs, timeline tracker)
  - Shared expense components (StatusBadge, ReceiptUpload, ExpenseCard)
  - Route registration in App.tsx for all authenticated roles
affects: [45-expense-approval, 46-reimbursement, 48-permission-flags]

# Tech tracking
tech-stack:
  added: []
  patterns: [useSessionQuery-for-protectedQuery, client-side-sha256-receipt-hashing, expense-status-timeline]

key-files:
  created:
    - src/hooks/convex/useExpenses.ts
    - src/components/expenses/StatusBadge.tsx
    - src/components/expenses/ReceiptUpload.tsx
    - src/components/expenses/ExpenseCard.tsx
    - src/pages/ExpenseSubmit.tsx
    - src/pages/MyExpenses.tsx
  modified:
    - src/hooks/convex/index.ts
    - src/App.tsx
    - convex/_generated/api.d.ts

key-decisions:
  - "useSessionQuery instead of useQuery for protectedQuery-backed endpoints (first usage in codebase)"
  - "ReceiptUpload is self-contained: accepts generateUploadUrl prop, handles full upload flow including SHA-256 hashing internally"
  - "Lucide icons use aria-label instead of title prop (Lucide React type constraint, consistent with Phase 43 decision)"

patterns-established:
  - "useSessionQuery pattern: protectedQuery endpoints require useSessionQuery from convex-helpers (not useQuery from convex/react) because protectedQuery auto-adds sessionId to args"
  - "Receipt upload pattern: client-side SHA-256 via Web Crypto API, Convex storage via generateUploadUrl, hash stored for dedup"

requirements-completed: [EXP-01, EXP-02, EXP-03, EXP-04, EXP-05]

# Metrics
duration: 9min
completed: 2026-03-13
---

# Phase 44 Plan 02: Expense Submission Frontend Summary

**Expense submission UI with draft/submit form, receipt upload with SHA-256 hashing, status filter tabs, and chronological audit trail timeline tracker**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-13T08:12:22Z
- **Completed:** 2026-03-13T08:21:04Z
- **Tasks:** 2
- **Files created:** 6
- **Files modified:** 3

## Accomplishments
- Complete expense submission workflow: create/edit draft form with 7 fields (description, amount, GL category, date, vendor, payment method, receipt), save draft, submit for approval
- Self-contained ReceiptUpload component with client-side SHA-256 hashing via Web Crypto API and Convex storage upload
- MyExpenses page with 5 status filter tabs (All/Drafts/Pending/Approved/Rejected) and inline timeline tracker panel showing chronological audit trail
- Full test suite green: 758 tests, 0 failures, 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useExpenses hook, barrel export, and shared expense components** - `11a948d` (feat)
2. **Task 2: Create ExpenseSubmit page, MyExpenses page, and register routes** - `9aff550` (feat)

## Files Created/Modified
- `src/hooks/convex/useExpenses.ts` - Query hooks (useSessionQuery for protectedQuery), mutation hooks via createMutationHook factory, ExpenseStatus type union
- `src/hooks/convex/index.ts` - Barrel export for all expense hooks and types
- `src/components/expenses/StatusBadge.tsx` - Color-coded badge for 7 expense statuses (draft/submitted/approved/rejected/awaiting_payment/reimbursed/voided)
- `src/components/expenses/ReceiptUpload.tsx` - Self-contained file upload with SHA-256 hashing, Convex storage, file type/size validation, hash preview
- `src/components/expenses/ExpenseCard.tsx` - List card with expense number, description, amount, vendor, date, status badge, fraud warning icons
- `src/pages/ExpenseSubmit.tsx` - Create/edit expense form at /expenses/new with all required fields, duplicate warning banner, receipt requirement warning
- `src/pages/MyExpenses.tsx` - Personal expense list at /expenses with status filter tabs and timeline tracker panel for non-draft expenses
- `src/App.tsx` - Lazy-loaded routes for /expenses and /expenses/new with bare ProtectedRoute (all authenticated roles)
- `convex/_generated/api.d.ts` - Regenerated to include expenses module types

## Decisions Made
- Used `useSessionQuery` from `convex-helpers/react/sessions` instead of `useQuery` from `convex/react` for expense query hooks. This is because the expense queries use `protectedQuery` which auto-injects `sessionId` into args. This is the first usage of `useSessionQuery` in the codebase -- all prior query hooks used bare `query` (not `protectedQuery`).
- ReceiptUpload component is fully self-contained: parent passes `generateUploadUrl` function prop and receives `{ storageId, hash }` callback. No external upload logic needed.
- Used `aria-label` instead of `title` on Lucide icons for fraud warning indicators (consistent with Phase 43 decision about Lucide React type constraints).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed query hooks to use useSessionQuery instead of useQuery**
- **Found during:** Task 2 (build verification)
- **Issue:** `useQuery` from `convex/react` doesn't auto-inject `sessionId`, but `protectedQuery` endpoints require it. The `tsc -b` build caught type errors: `Property 'sessionId' is missing`.
- **Fix:** Changed imports from `useQuery` to `useSessionQuery` from `convex-helpers/react/sessions` in useExpenses.ts
- **Files modified:** src/hooks/convex/useExpenses.ts
- **Verification:** `npm run build` passes
- **Committed in:** 9aff550 (Task 2 commit)

**2. [Rule 3 - Blocking] Regenerated Convex API types to include expenses module**
- **Found during:** Task 2 (build verification)
- **Issue:** `convex/_generated/api.d.ts` did not include the expenses module types from Plan 01 backend, causing `Property 'expenses' does not exist on type` errors during `tsc -b` build
- **Fix:** Ran `npx convex codegen` to regenerate types
- **Files modified:** convex/_generated/api.d.ts
- **Verification:** `npm run build` passes
- **Committed in:** 9aff550 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correct build. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 44 complete: full expense submission workflow (backend + frontend)
- Ready for Phase 45 (expense approval): approver views, approve/reject mutations, multi-step approval flow
- Ready for Phase 46 (reimbursement): payment tracking, reimbursement mutations
- Phase 48 will add proper permission flags (currently bare ProtectedRoute = any authenticated user)

## Self-Check: PASSED

All 8 files verified on disk. Both task commits (11a948d, 9aff550) verified in git log.

---
*Phase: 44-expense-submission*
*Completed: 2026-03-13*

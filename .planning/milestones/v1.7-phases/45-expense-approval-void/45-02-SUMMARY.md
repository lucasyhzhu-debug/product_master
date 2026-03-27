---
phase: 45-expense-approval-void
plan: 02
subsystem: ui
tags: [react, expenses, approval, fraud-flags, rejection-chain, dialog]

# Dependency graph
requires:
  - phase: 45-expense-approval-void
    provides: "approveExpense, rejectExpense, voidExpense mutations; listPendingForApproval, getRejectionChain queries (Plan 01)"
  - phase: 44-expense-submission
    provides: "useExpenses hook base, ExpenseCard, StatusBadge, ExpenseSubmit/MyExpenses pages, createMutationHook factory"
  - phase: 43-chart-of-accounts-management
    provides: "useAccounts hook for GL category lookup in approval cards"
provides:
  - "usePendingForApproval, useRejectionChain query hooks"
  - "useApproveExpense, useRejectExpense, useVoidExpense mutation hooks"
  - "FraudFlags component (duplicate/late/rejection badges)"
  - "ApprovalActions component (approve/reject/void dialogs with DoA comment enforcement)"
  - "RejectionChain component (timeline rejection history)"
  - "ExpenseApproval page at /expenses/approve with real-time approval queue"
  - "Review Approvals navigation link on MyExpenses page for manager/admin"
affects: [46-expense-reimbursement, 48-permission-flags]

# Tech tracking
tech-stack:
  added: []
  patterns: [approval-queue-ui, fraud-flag-badges, dialog-action-pattern, rejection-chain-timeline]

key-files:
  created:
    - src/components/expenses/FraudFlags.tsx
    - src/components/expenses/ApprovalActions.tsx
    - src/components/expenses/RejectionChain.tsx
    - src/pages/ExpenseApproval.tsx
  modified:
    - src/hooks/convex/useExpenses.ts
    - src/hooks/convex/index.ts
    - src/App.tsx
    - src/pages/MyExpenses.tsx

key-decisions:
  - "FraudFlags uses Badge variant='outline' with amber styling for consistency with existing expense card warning icons"
  - "ApprovalActions uses Dialog pattern (not inline form) for approve/reject/void to prevent accidental actions"
  - "RejectionChain renders revision numbering in reverse (newest first) with destructive dot color"
  - "Route uses allowedRoles=['manager','admin'] pattern (not requiredPermission) since canApproveExpenses permission flag deferred to Phase 48"
  - "Receipt display deferred -- shows 'Receipt attached' badge instead of image thumbnail (storage URL resolution not in expense queries)"

patterns-established:
  - "Approval dialog pattern: each action (approve/reject/void) gets its own Dialog with required/optional textarea"
  - "FraudFlags inline badge pattern: reusable component accepting boolean/string flags"
  - "Approver navigation: 'Review Approvals' link conditional on role check in MyExpenses header"

requirements-completed: [EXP-07, EXP-08, EXP-09, EXP-10, EXP-11, EXP-12, EXP-13, FRAUD-01, FRAUD-03, FRAUD-04]

# Metrics
duration: 6min
completed: 2026-03-13
---

# Phase 45 Plan 02: Expense Approval Frontend Summary

**Expense approval queue page with fraud flag badges, approve/reject/void dialog actions, rejection chain timeline, and real-time queue updates via Convex**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-13T14:02:21Z
- **Completed:** 2026-03-13T14:08:31Z
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 4

## Accomplishments
- 5 new hooks (2 query + 3 mutation) extending useExpenses.ts for full approval workflow
- 3 new UI components: FraudFlags (badge indicators), ApprovalActions (dialog-based approve/reject/void), RejectionChain (timeline display)
- ExpenseApproval page at /expenses/approve showing FIFO-ordered pending expense queue with inline fraud flags, GL category, payment method, and receipt indicators
- Comment mandatory for expenses >= Rp 500K (dialog enforcement), rejection reason always required, void admin-only
- Full test suite: 782 tests, zero regressions; build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend useExpenses hook and create approval UI components** - `747b6c9` (feat)
2. **Task 2: Create ExpenseApproval page and register route** - `a56c1c9` (feat)

## Files Created/Modified
- `src/hooks/convex/useExpenses.ts` - Added usePendingForApproval, useRejectionChain, useApproveExpense, useRejectExpense, useVoidExpense hooks + PendingExpense/RejectionChainEntry types
- `src/hooks/convex/index.ts` - Barrel export updated with all 5 new hooks and 2 new types
- `src/components/expenses/FraudFlags.tsx` - Inline badge row for duplicate warning, late submission, rejection count
- `src/components/expenses/ApprovalActions.tsx` - Approve/reject/void button group with Dialog-based comment/reason input
- `src/components/expenses/RejectionChain.tsx` - Timeline display of prior rejected expense versions
- `src/pages/ExpenseApproval.tsx` - Full approval queue page with account lookup, fraud flags, approval actions, rejection chain
- `src/App.tsx` - Lazy-loaded route registration at /expenses/approve with manager/admin role guard
- `src/pages/MyExpenses.tsx` - Added "Review Approvals" navigation link for approver roles

## Decisions Made
- Used `allowedRoles={["manager", "admin"]}` on ProtectedRoute instead of `requiredPermission` since the `canApproveExpenses` permission flag doesn't exist yet (deferred to Phase 48). This is consistent with the `accounts` route pattern.
- FraudFlags component renders amber-styled outline badges to match the existing warning icons in ExpenseCard (AlertTriangle, Clock).
- ApprovalActions uses separate Dialog instances for each action type rather than a single dialog with mode switching, for clarity and simpler state management.
- Receipt thumbnail display was deferred -- expense queries don't resolve storage URLs. Instead, a "Receipt attached" badge is shown when `receiptFileId` exists. A future enhancement can add a storage URL query.
- RejectionChain numbers revisions in descending order (Revision N = oldest rejection) to match chronological reading order.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 45 complete: full expense approval workflow (backend + frontend)
- Ready for Phase 46 (expense reimbursement): payment tracking, reimbursement batch mutations
- Phase 48 will add proper permission flags (currently using role-based guard)
- 782 tests passing, build clean

## Self-Check: PASSED

All 8 files verified on disk. Both task commits (747b6c9, a56c1c9) verified in git log.

---
*Phase: 45-expense-approval-void*
*Completed: 2026-03-13*

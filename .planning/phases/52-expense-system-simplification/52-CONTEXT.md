# Phase 52: Expense System Simplification - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/phases/52-expense-system-simplification/SIMPLIFICATION-REPORT.md)

<domain>
## Phase Boundary

Refactor v1.7 expense system code (phases 41-50) based on 3-agent simplification review. Scope: F1-F14 (14 findings). F15-F17 explicitly deferred. Zero behavior changes — all existing tests must pass unchanged. Estimated ~225 lines saved, 6 fewer DB round-trips on analytics hot path.

</domain>

<decisions>
## Implementation Decisions

### Backend Consolidation (F1-F5)
- F1: `getFraudFlags` in `convex/expenses/analyticsQueries.ts` MUST query 4 statuses x 1 window (90 days) in single `Promise.all`, then slice in memory for 7d/30d subsets. Extract `toExpenseForFraud()` helper. Target: 10 DB reads → 4.
- F2: All sequential `for...of` + `await ctx.db.get()` loops in payroll/reimbursement files MUST be replaced with `Promise.all` parallel fetches (6 call sites across `convex/payroll/queries.ts`, `convex/payroll/mutations.ts`, `convex/reimbursements/queries.ts`, `convex/reimbursements/mutations.ts`).
- F3: `rejectExpense` and `voidExpense` in `convex/expenses/mutations.ts` MUST use `validateRequiredReason` from `convex/lib/validation.ts` instead of inline trim+check.
- F4: `DOA_ADMIN_ONLY_THRESHOLD` and `COMMENT_REQUIRED_THRESHOLD` in `convex/expenses/helpers.ts` MUST be unified to `EXPENSE_HIGH_VALUE_THRESHOLD = 500_000` with aliases. Frontend `ApprovalActions.tsx` must use `formatCurrency(COMMENT_REQUIRED_THRESHOLD)` instead of hardcoded "500K".
- F5: `convex/bankAccounts/mutations.ts` referential integrity check MUST run both reimbursement batch queries with `Promise.all` instead of sequential.

### Frontend Shared Components (F6-F9)
- F6: Extract `VoidReasonDialog` from `PayrollManager.tsx` and `ReimbursementManager.tsx` into `src/components/shared/VoidReasonDialog.tsx` with `onConfirm: (reason: string) => Promise<void>` callback.
- F7: Extract `ActionDialog` from `ApprovalActions.tsx` with props: `title, description, placeholder, submitLabel, submitVariant, onSubmit, requireComment?`. Three dialogs become three `<ActionDialog />` invocations.
- F8: Extract `MarginRow` component from `FinancialStatement.tsx` for the 3 repeated margin percentage rows (Gross, EBIT, Net).
- F9: Add `className?: string` prop to `ExpenseCard.tsx`, merge with `cn()`. Remove wrapper `<div>` in `MyExpenses.tsx`.

### Utility Cleanup (F10-F14)
- F10: Consolidate `wibMidnightToUtc` into `src/lib/dateUtils.ts`. Delete copies from `src/lib/expenseAnalyticsPeriod.ts`, `src/hooks/convex/useFinancials.ts`, `src/pages/FinancialStatement.tsx`.
- F11: Consolidate `fmtDelta` and `formatDeltaPct` in `src/lib/csvExport.ts` into one function.
- F12: Replace `any` types in `ReimbursementManager.tsx` (lines 222, 329) with proper `AwaitingPaymentGroup` and `Batch` types.
- F13: Initialize `getCurrentWibMonth()` once in `ExpenseAnalytics.tsx`, not 3-4 times. Optionally collapse to single state object.
- F14: Add `useMemo` for `accountMap` in `ExpenseApproval.tsx`.

### Claude's Discretion
- Internal naming of extracted components (e.g., `ActionDialog` vs `ConfirmActionDialog`)
- Whether F13 collapses to single state object or just deduplicates the init call
- Import organization and barrel export decisions for new shared components
- Whether `MarginRow` is a local component or shared component

</decisions>

<specifics>
## Specific Ideas

- `toExpenseForFraud()` helper extracts the identical `.map(e => ({...}))` cast pattern (F1)
- `EXPENSE_HIGH_VALUE_THRESHOLD = 500_000` as the single constant name (F4)
- `VoidReasonDialog` callback signature: `onConfirm: (reason: string) => Promise<void>` (F6)
- `ActionDialog` props: `title, description, placeholder, submitLabel, submitVariant, onSubmit, requireComment?` (F7)
- `MarginRow` props: `label, currentPct, previousPct, deltaPp, showComparison` (F8)
- Parallel fetch pattern: collect IDs → `Promise.all(ids.map(id => ctx.db.get(id)))` → build Map (F2)

</specifics>

<deferred>
## Deferred Ideas

- F15: Payroll file upload reimplements ReceiptUpload pattern — lower priority, UX may intentionally differ
- F16: csvExport.ts interface drift risk — `WeekData`, `ChannelData`, `IncomeStatementData` manual duplication from backend types
- F17: Seed function sequential lookups (39 accounts) — one-time admin operation, negligible impact

</deferred>

---

*Phase: 52-expense-system-simplification*
*Context gathered: 2026-03-15 via PRD Express Path*

---
status: awaiting_human_verify
trigger: "When an expense is converted to capex, it disappears from reimbursement tracking"
created: 2026-04-01T00:00:00Z
updated: 2026-04-01T12:00:00Z
---

## Current Focus

hypothesis: confirmed - convertToCapex voided all expenses regardless of paymentMethod
test: code review + type check
expecting: employee_paid expenses stay in awaiting_payment after capex conversion
next_action: awaiting human verification

## Symptoms

expected: When an expense is converted to capex, it should still appear in reimbursement tracking for payment.
actual: The expense gets status "voided" and disappears from the awaiting_payment query.
errors: No error messages - silent feature gap.
reproduction: Convert any employee_paid expense to capex -> check reimbursement tracker -> expense is gone.
started: Feature integration gap since capex transfer was built after reimbursement tracking.

## Eliminated

(none needed - root cause found on first investigation)

## Evidence

- timestamp: 2026-04-01T00:01:00Z
  checked: convex/expenses/mutations.ts convertToCapex mutation (line 789-915)
  found: Step 4 (line 888-904) patches expense to status "voided" with voidReason "Converted to fixed asset: {assetNumber}"
  implication: This is the direct cause - voiding removes the expense from reimbursement pipeline

- timestamp: 2026-04-01T00:02:00Z
  checked: convex/reimbursements/queries.ts listAwaitingPayment (line 25-101)
  found: Query filters exclusively by status "awaiting_payment" (line 31)
  implication: Voided expenses are invisible to the reimbursement system

- timestamp: 2026-04-01T00:03:00Z
  checked: convertToCapex allowed statuses (line 785-786)
  found: CAPEX_CONVERTIBLE_STATUSES includes "awaiting_payment" - so an expense could be mid-reimbursement-pipeline when converted
  implication: Converting an employee_paid expense that's awaiting_payment will silently remove it from reimbursement

- timestamp: 2026-04-01T00:04:00Z
  checked: Journal entry logic in convertToCapex (line 825-826)
  found: For employee_paid expenses, the acquisition JE credits account 2200 (Employee Reimbursements Payable). The accounting is correct - the liability is recorded. But the reimbursement UI won't show it for batching.
  implication: The accounting knows a reimbursement is owed, but the operational workflow (batching/payment) doesn't

- timestamp: 2026-04-01T12:00:00Z
  checked: Fix implementation - branched Step 4 by paymentMethod
  found: employee_paid expenses now stay in awaiting_payment with convertedToAssetId set; company_paid/payment_request still voided. Added reimbursement note in CapexConversionModal for employee_paid. TypeScript type check passes.
  implication: Fix correctly preserves reimbursement pipeline for employee-paid equipment purchases

## Resolution

root_cause: The `convertToCapex` mutation in `convex/expenses/mutations.ts` unconditionally set the expense status to "voided". The reimbursement system (`listAwaitingPayment` query) only shows expenses with status "awaiting_payment". For employee_paid expenses, the capex conversion correctly creates a JE crediting 2200 (Reimbursements Payable), so the accounting knows a reimbursement is owed, but the expense was operationally invisible to the reimbursement batching workflow.

fix: Branched Step 4 of convertToCapex by paymentMethod. Employee-paid expenses now stay in "awaiting_payment" status (or are transitioned to it) with `convertedToAssetId` set, so they remain visible in the reimbursement queue. Company-paid and payment_request expenses are still voided as before. Also added an informational note in the CapexConversionModal UI for employee-paid expenses.

verification: TypeScript type check passes. Build failure is pre-existing (missing vitest/vite type defs in environment).

files_changed:
- convex/expenses/mutations.ts (Step 4 of convertToCapex: branch by paymentMethod)
- src/components/expenses/CapexConversionModal.tsx (added reimbursement info note for employee-paid)

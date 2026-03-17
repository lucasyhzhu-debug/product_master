# Triple Review: Phase 59 - Expense Payment Method Overhaul

**Date:** 2026-03-17
**Branch:** `gsd/phase-59-expense-payment-method-overhaul`
**Base:** `origin/main` (e37285d)
**Head:** ed741d8
**Commits:** 16 phase-59 implementation commits
**Reviewers:** requirements-reviewer, code-quality-reviewer, staffreview (principal engineer)

---

## Summary

Phase 59 implements a payment method overhaul for the expense system, replacing 3 old payment methods (`personal_cash`, `personal_transfer`, `company_card`) with 3 new semantically clearer ones (`employee_paid`, `company_paid`, `payment_request`). Each has distinct journal entry timing and status transitions. The implementation also removes Phase 57 code (invoices, businessSettings) that was on the same branch.

**Overall Assessment: GOOD with minor issues**

The implementation closely follows the 4 plans (59-01 through 59-04) and addresses all critical issues raised in the prior staffreview (2026-03-16). The `sourceType` issue was resolved by reusing `expense_approval`. The double-write concern was resolved with clean branching logic. Analytics queries were properly updated with `recorded` and `paid` statuses. TypeScript compiles cleanly. All 1006 tests pass.

---

## 1. Requirements & Business Logic Review

### Plan Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| 3 new payment method literals | DONE | `employee_paid`, `company_paid`, `payment_request` |
| 2 new status literals | DONE | `recorded`, `paid` |
| 7 new optional fields | DONE | transactionReference, flaggedForReview, flaggedBy, flaggedAt, flagReason, paidAt, paidBy |
| company_paid auto-JE on submit | DONE | DR expense GL, CR 1100 Cash, status -> recorded |
| employee_paid unchanged submit flow | DONE | status -> submitted, no JE |
| payment_request submit flow | DONE | status -> submitted, no JE |
| acknowledgeExpense mutation | DONE | recorded -> approved, no new JE |
| flagExpense mutation | DONE | Sets flag fields, no status change |
| markAsPaid mutation | DONE | approved -> paid, creates JE with transaction ref |
| approveExpense company_paid guard | DONE | Guard placed BEFORE status check |
| approveExpense payment_request JE skip | DONE | Approval only, JE at markAsPaid |
| Unified approval queue | DONE | submitted + recorded + approved-payment_request |
| Self-exclusion on submitted only | DONE | recorded and approved items visible to submitter |
| DoA on submitted only | DONE | Managers can acknowledge/mark-as-paid regardless of amount |
| Analytics updated | DONE | recorded and paid in metrics and fraud flags |
| Receipt enforcement payment-aware | DONE | Always required for company money |
| Frontend form with 3 options | DONE | With inline descriptions |
| StatusBadge for recorded/paid | DONE | sky and teal colors respectively |
| Context-aware approval actions | DONE | Different buttons per paymentMethod + status |
| Flagged badge in FraudFlags | DONE | Red flag badge with reason tooltip |
| MyExpenses tabs for all statuses | DONE | 10 tabs including recorded, paid, voided |

### Missing or Incomplete

- No backend integration tests for the 3 new mutations (acknowledgeExpense, flagExpense, markAsPaid) -- noted in prior review, still missing
- No frontend validation to block company_paid submit without receipt (backend catches it, UX could be better)

---

## 2. Code Quality Review

### Positive Observations

1. Clean branching logic in `submitExpense` -- no double-write
2. Defensive assertion in `approveExpense` catches unexpected payment methods
3. Thorough comments explaining createdBy semantics for each JE creation point
4. `sourceType: "expense_approval"` correctly reused (addresses prior review Critical #1)
5. `requiresReceipt` backward-compatible with optional 2nd param
6. Promise.all used properly for parallel index queries in approval queue
7. Old payment method literals completely cleaned from codebase (grep confirms zero occurrences)
8. Phase 57 removal (invoices, businessSettings) is clean -- no dangling references

### Issues Found

#### Self-Acknowledgment Not Blocked (Important)
`acknowledgeExpense` has no self-acknowledgment guard. A manager who submits a company_paid expense can acknowledge their own expense. The prior review's CONTEXT.md justifies this ("acknowledge is confirmation, not authorization"), and the plan explicitly notes "DoA does NOT apply to acknowledge." However, allowing a submitter to both create the JE (at submit) and confirm it (at acknowledge) bypasses any separation of duties. This is a business decision, but worth flagging.

**Location:** `convex/expenses/mutations.ts` lines 619-646

#### `getTargetStatusAfterApproval` Partially Dead Code (Minor)
After the payment_request early return and the employee_paid assertion, only `employee_paid` reaches `getTargetStatusAfterApproval(expense.paymentMethod)` on line 459. The function will always return `"awaiting_payment"` at that point. The function still works correctly but the dynamic dispatch is no longer needed -- it could be replaced with a hardcoded `"awaiting_payment"`.

**Location:** `convex/expenses/mutations.ts` line 459

#### `rejectExpense` Error Message Unchanged (Minor)
`rejectExpense` still says "Expense has already been processed" for non-submitted statuses. A recorded company_paid expense that reaches `rejectExpense` would get this generic message. It cannot be rejected (correct), but the message could be more helpful: "Only submitted expenses can be rejected."

**Location:** `convex/expenses/mutations.ts` line 504

#### `ExpenseApproval` PAYMENT_METHODS Labels Inconsistent with Form (Nitpick)
The form uses "Reimburse Employee" / "Paid by Company" / "Payment Request" labels but the approval queue map uses "Employee Paid" / "Company Paid" / "Payment Request". The labels should be consistent. The approval queue labels are shorter which is fine for badges, but the full labels would be more user-friendly in the detail row where the map is used.

**Location:** `src/pages/ExpenseApproval.tsx` line 37-41 vs `src/pages/ExpenseSubmit.tsx` line 46-61

---

## 3. Staff/Principal Engineer Review

### Architecture Assessment

The payment method overhaul is well-structured with clear separation:
- **Schema layer:** Clean literal replacements, additive fields
- **Helper layer:** Pure functions updated with backward compatibility
- **Mutation layer:** Clear branching by payment method with explicit guards
- **Query layer:** Unified queue with correct filtering semantics
- **Frontend layer:** Context-aware rendering based on paymentMethod + status

### JE Timing Design

| Payment Method | JE Created At | JE Credit Account | Status Flow |
|---|---|---|---|
| employee_paid | approve | 2200 (Payable) | draft -> submitted -> approved -> awaiting_payment -> reimbursed |
| company_paid | submit | 1100 (Cash) | draft -> recorded -> approved (acknowledged) |
| payment_request | markAsPaid | 1100 (Cash) | draft -> submitted -> approved -> paid |

This is clean and correctly models the accounting reality:
- Employee paid: obligation recognized at approval (DR Expense, CR Payable)
- Company paid: cash outflow already happened (DR Expense, CR Cash)
- Payment request: cash outflow at payment execution (DR Expense, CR Cash)

### Phase 57 Removal Assessment

The branch includes removal of Phase 57 code (invoices, businessSettings, customer invoice fields). This is a clean removal with:
- Schema tables removed (businessSettings, invoices, invoiceCounters)
- Backend files deleted (mutations.ts, queries.ts, tests)
- Frontend files deleted (BusinessSettings.tsx, LogoUploader.tsx, etc.)
- Routes, nav items, and hooks cleaned up
- Permission flags removed from types.ts
- No dangling references found

This appears intentional (Phase 57 was on the same branch and these tables/features were added but then reverted).

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Self-acknowledgment bypass | Low | Documented decision; money already left bank |
| No integration tests for new mutations | Medium | Type system + unit tests cover logic; manual testing gate in Plan 04 |
| `recorded` expense void leaves JE reversal orphaned | Low | `voidExpense` correctly creates reversal entry when `journalEntryId` exists |
| Flag can be overwritten silently | Low | No user-facing issue; latest flag wins |
| Approval queue performance (3 parallel queries) | Low | Zero expenses in production currently |

---

## 4. Consensus Issues (2+ reviewers)

| # | Issue | Reviewers | Tier |
|---|-------|-----------|------|
| 1 | No backend integration tests for new mutations | requirements, staffreview | Important |
| 2 | Self-acknowledgment not blocked | code-quality, staffreview | Minor (documented design decision) |

---

## 5. Verification Results

| Check | Result |
|-------|--------|
| `npm run type-check` | PASS |
| `npm run test -- --run` | PASS (1006 tests, 58 files) |
| Old literal grep (`personal_cash`, `personal_transfer`, `company_card`) | Zero occurrences |
| Phase 57 dangling references | Zero occurrences |

---

*Generated by triple-review skill (2026-03-17)*
*Requirements Reviewer + Code Quality Reviewer + Staff/Principal Engineer Reviewer*

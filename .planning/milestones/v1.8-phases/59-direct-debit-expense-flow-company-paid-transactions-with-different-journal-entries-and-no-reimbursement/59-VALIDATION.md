---
phase: 59
slug: direct-debit-expense-flow-company-paid-transactions-with-different-journal-entries-and-no-reimbursement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 + convex-test |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run type-check && npx vitest run convex/expenses/__tests__/helpers.test.ts -x` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check && npx vitest run convex/expenses/__tests__/helpers.test.ts -x`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green + `npm run build`
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | DEXP-01 | type-check | `npm run type-check` | N/A (schema) | ⬜ pending |
| 59-01-02 | 01 | 1 | DEXP-02 | type-check | `npm run type-check` | N/A (schema) | ⬜ pending |
| 59-01-03 | 01 | 1 | DEXP-03 | type-check | `npm run type-check` | N/A (schema) | ⬜ pending |
| 59-01-04 | 01 | 1 | DEXP-04 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | ✅ (update) | ⬜ pending |
| 59-01-05 | 01 | 1 | DEXP-05 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | ✅ (update) | ⬜ pending |
| 59-01-06 | 01 | 1 | DEXP-06 | integration | `npx vitest run tests/convex/expenseAnalytics.test.ts -x` | ✅ (extend) | ⬜ pending |
| 59-01-07 | 01 | 1 | DEXP-07 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | ✅ | ⬜ pending |
| 59-02-01 | 02 | 1 | DEXP-08 | integration | Manual or new test | ❌ W0 | ⬜ pending |
| 59-02-02 | 02 | 1 | DEXP-09 | integration | Manual or new test | ❌ W0 | ⬜ pending |
| 59-02-03 | 02 | 1 | (new) | integration | Manual or new test | ❌ W0 | ⬜ pending |
| 59-03-01 | 03 | 2 | DEXP-10 | manual | Visual verification | N/A (UI) | ⬜ pending |
| 59-03-02 | 03 | 2 | DEXP-11 | manual | Visual verification | N/A (UI) | ⬜ pending |
| 59-04-01 | 04 | 2 | DEXP-12 | manual | Visual verification | N/A (UI) | ⬜ pending |
| 59-04-02 | 04 | 2 | DEXP-13 | manual | Visual verification | N/A (UI) | ⬜ pending |
| 59-04-03 | 04 | 2 | DEXP-14 | manual | Visual verification | N/A (UI) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/expenses/__tests__/helpers.test.ts` — update existing tests for 3 new payment method literals, `recorded`/`paid` statuses, receipt requirements, and `getTargetStatusAfterApproval` branching
- [ ] Integration test stubs for `acknowledgeExpense`, `flagExpense`, `markAsPaid` mutations — could be added but not blocking (straightforward CRUD, verified via type-check + build)

*Existing infrastructure covers framework and fixture needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3 payment options in form dropdown | DEXP-10 | UI visual -- dropdown with tooltip/helper text | Open ExpenseSubmit, verify 3 options with correct labels and helper text |
| Conditional transactionReference field | DEXP-11 | UI conditional visibility | Select company_paid → field visible at submit; select payment_request → field hidden at submit; select employee_paid → field hidden |
| Approval queue badges | DEXP-12 | UI visual -- badge rendering | Submit expenses of each type, verify "Company Paid" and "Payment Request" badges appear in approval queue |
| Flagged badge in approval list | DEXP-13 | UI visual -- flag state rendering | Flag a company_paid expense, verify warning badge appears |
| `recorded` and `paid` StatusBadge | DEXP-14 | UI visual -- new status colors | Create expenses reaching `recorded` and `paid` statuses, verify badge colors/labels |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

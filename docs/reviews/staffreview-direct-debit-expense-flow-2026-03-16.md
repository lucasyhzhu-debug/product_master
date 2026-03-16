# Staff Review: Phase 59 - Direct Debit Expense Flow

**Date:** 2026-03-16
**Plans:** `59-01-PLAN.md` (Backend), `59-02-PLAN.md` (Frontend)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST
=========================

[!] Git Workflow section exists?
  -> Branch name: NOT specified in either plan
  -> Checkpoint strategy: NOT specified (no commit boundaries)

[~] Implementation Waves section exists?
  -> Agents assigned: Plans use wave/task structure but no specific agents
  -> File paths specified: YES
  -> PARALLEL/SEQUENTIAL marked: YES (wave 1 = backend, wave 2 = frontend)

[!] Documentation Updates section exists?
  -> CHANGELOG.md checkbox: NOT present

[~] Success Criteria section exists?
  -> Type check requirement: YES (npm run type-check)
  -> Build requirement: YES (npm run build)

=========================
```

**Assessment: INCOMPLETE** -- Missing Git Workflow section, missing Documentation Updates section.

### Plan Structure Additions

**Git Workflow (added):**
```
Branch: feature/59-direct-debit-expense-flow
Checkpoints:
  1. After schema + helpers update -> feat(59): schema and helper updates for company_paid flow
  2. After mutations + queries -> feat(59): company_paid auto-JE, acknowledge/flag mutations
  3. After hooks + StatusBadge + form -> feat(59): frontend payment method UI and recorded status
  4. After approval queue + actions -> feat(59): acknowledge/flag actions in approval queue
```

**Documentation Updates (added):**
```
- [ ] CHANGELOG.md (ALWAYS required)
- [ ] docs/SCHEMA.md (new fields, new status, changed validators)
- [ ] docs/API_REFERENCE.md (new mutations: acknowledgeExpense, flagExpense)
```

---

## 1. Summary

**Overall Assessment: Revise**

The plans are well-structured, clearly reasoned, and demonstrate solid understanding of the existing expense system. The 2-plan wave structure (backend-first, frontend-second) is correct. The CONTEXT.md decisions are thorough. However, there is one **critical blocker** (the `sourceType` schema literal for journal entries), one **critical gap** in the mutation status flow logic, and several important improvements needed around testing, analytics queries, and the approval queue DoA logic.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | `expense_submission` is not a valid `sourceType` in journalEntries schema | Schema | 59-01-PLAN, Task 2.4 |
| 2 | `submitExpense` mutation status flow has a double-write race | Logic | 59-01-PLAN, Task 2.4 |
| 3 | Missing tests for new mutations (acknowledgeExpense, flagExpense, modified submitExpense) | Testing | 59-01-PLAN |
| 4 | `getExpenseMetrics` analytics query does not include `recorded` status | Logic | 59-01-PLAN, Task 2.10 |

**Details:**

### Issue 1: `expense_submission` sourceType Not in Schema

The plan instructs `submitExpense` to call `createJournalEntryWithLines` with `sourceType: "expense_submission"`. However, the `journalEntries` table schema (`convex/schema.ts` line 1736-1744) defines a closed union for `sourceType`:

```typescript
sourceType: v.union(
  v.literal("expense_approval"),
  v.literal("expense_void"),
  v.literal("reimbursement"),
  v.literal("reimbursement_void"),
  v.literal("payroll"),
  v.literal("payroll_void"),
  v.literal("manual")
),
```

`"expense_submission"` is NOT in this union. The `ctx.db.insert("journalEntries", ...)` call inside `createJournalEntryWithLines` will throw a Convex validation error at runtime.

Furthermore, the `VALID_VOID_PAIRS` map in `journalEngine.ts` only maps `expense_approval -> expense_void`. If `expense_submission` is added to the schema, a corresponding void pair must also be registered, otherwise voiding a `recorded` expense (which the plan says should work) will fail with "Unknown source type".

**Recommendation:** Either:
- (A) **Preferred:** Reuse `"expense_approval"` as the sourceType for company_paid auto-JE (since both are expense JEs, just with different timing). The description field already distinguishes them (`"[Company Paid]"` marker). This avoids schema + void-pair changes.
- (B) Add `v.literal("expense_submission")` to the `journalEntries.sourceType` union in schema.ts, AND add `expense_submission: "expense_void"` to `VALID_VOID_PAIRS` in journalEngine.ts. Update docs/SCHEMA.md accordingly.

### Issue 2: submitExpense Status Flow Double-Write

The plan says (Task 2.4):
1. Patch expense to `status: "submitted"` (existing logic, line 288-296)
2. Then check if `company_paid`, and "Set status to `recorded` instead of `submitted` in the patch"

But the existing code builds a `patch` object with `status: "submitted"`, then calls `await ctx.db.patch(args.expenseId, patch)`, then calls `recordStatusChange(..., "draft", "submitted", ...)`. The plan's wording implies overwriting the status in the same patch object BEFORE the db.patch call, but the audit trail instruction says to "use the correct target status". This could easily be misinterpreted as two separate patches (first "submitted", then "recorded"), causing a wasteful double-write and incorrect audit trail.

**Recommendation:** Refactor the patch construction to determine `targetStatus` BEFORE building the patch:
```typescript
const targetStatus = expense.paymentMethod === "company_paid" ? "recorded" : "submitted";
// ... company_paid JE creation if needed ...
const patch = { status: targetStatus, submittedAt: now, lateSubmission, ... };
await ctx.db.patch(args.expenseId, patch);
await recordStatusChange(ctx, args.expenseId, "draft", targetStatus, ctx.user._id);
```

### Issue 3: Missing Backend Tests for New Mutations

Plan 59-01 Task 1 mentions TDD (`tdd="true"`) and "Write tests in a new or existing test file for the updated behaviors" for helpers. However, Task 2 (which adds `acknowledgeExpense`, `flagExpense`, and modifies `submitExpense` with JE creation) has NO test plan at all -- only `npm run build` as verification. This is a critical gap:

- `acknowledgeExpense`: needs tests for happy path, wrong status, wrong paymentMethod, non-approver role
- `flagExpense`: needs tests for happy path, wrong status, empty reason
- `submitExpense` auto-JE: needs tests verifying JE creation for company_paid, NO JE for employee_paid, receipt enforcement for company_paid at low amounts
- Void flow for recorded expenses: needs test confirming reversal works

**Recommendation:** Add a dedicated test task between Task 1 and Task 2, or add test cases to Task 2 verification. At minimum, add `convex-test` integration tests for the three modified/new mutations.

### Issue 4: `getExpenseMetrics` Missing `recorded` Status

Plan 59-01 Task 2.10 says to add `"recorded"` to `APPROVED_STATUSES` in `fraudHelpers.ts`. But the plan does NOT update `getExpenseMetrics` in `analyticsQueries.ts`, which queries expenses by specific statuses (`approved`, `awaiting_payment`, `reimbursed`) for employee spend and approval time metrics. Company-paid expenses that are in `recorded` status (before admin acknowledgment) have JEs and represent real spend, but they won't appear in the analytics.

**Recommendation:** Add `recorded` status to the `getExpenseMetrics` query:
- Add a parallel query: `ctx.db.query("expenses").withIndex("by_status_expenseDate", q => q.eq("status", "recorded").gte(...).lt(...))`
- Include recorded expenses in `periodExpenses` for employee spend aggregation
- For `avgApprovalDays`: recorded expenses don't have `approvedAt` yet, so they should be excluded from the approval time calculation (which they will be naturally since `approvedAt` is undefined)

Also add `recorded` to the `getFraudFlags` query which currently only queries `submitted`, `approved`, `awaiting_payment`, `reimbursed` -- recorded expenses should be included in split detection and concentration analysis.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Credit account for company_paid JE should be confirmed | High | Low |
| 2 | `requiresReceipt` signature change is unnecessarily breaking | Medium | Low |
| 3 | Approval queue DoA filter logic for recorded expenses is incorrect | High | Low |
| 4 | `listMyExpenses` query needs `recorded` in status validator | Medium | Low |
| 5 | Frontend validation should block company_paid submit without receipt | Medium | Low |

**Details:**

### Improvement 1: Credit Account for company_paid JE

Plan 59-01 Task 2.4 says: "Look up credit account: code `1100` (Cash) -- company_paid always credits Cash directly". The existing `approveExpense` code already does this for `company_card`:

```typescript
const creditCode = expense.paymentMethod === "company_card" ? "1100" : "2200";
```

The CONTEXT.md confirms: "Both employee_paid and company_paid use same JE: DR Expense Account, CR 1100 (Cash/Bank)". However, this means BOTH types credit Cash, which is incorrect for `employee_paid` -- the employee fronted the money, so the credit should be to `2200` (Employee Reimbursements Payable), not Cash.

Wait -- re-reading the context: "employee_paid JE created on approval (existing behavior)". The existing approval JE for `personal_cash`/`personal_transfer` credits `2200`. The plan keeps this unchanged (employee_paid approval still credits `2200`). The CONTEXT.md statement about "both use same JE" appears to be about the debit side only. The plan's Task 2.4 correctly credits `1100` for company_paid only. This is fine but the CONTEXT.md language is misleading.

**Recommendation:** Verify the CONTEXT.md statement is not taken literally by the executor. Add a clarifying comment in the plan: "company_paid credits 1100 (Cash -- money already left bank). employee_paid credits 2200 (Payable -- still owed to employee). This matches existing approveExpense logic."

### Improvement 2: `requiresReceipt` Signature Change

Plan 59-01 Task 1.2 changes `requiresReceipt(amount: number)` to `requiresReceipt(amount: number, paymentMethod?: string)`. While backward-compatible, this is an awkward API. The function name suggests it's about the receipt, but the second parameter changes behavior fundamentally (always-true vs threshold).

**Recommendation:** Instead of modifying the existing function, add a separate predicate or handle the company_paid check inline in `submitExpense`:
```typescript
// In submitExpense, before existing receipt check:
if (expense.paymentMethod === "company_paid" && !expense.receiptFileId) {
  throw new Error("Receipt is always required for company-paid expenses");
}
// Existing check (only runs for employee_paid since company_paid already threw above):
if (requiresReceipt(expense.amount) && !expense.receiptFileId) { ... }
```
This keeps `requiresReceipt` as a pure amount-threshold function and avoids the confusing dual-behavior signature. The plan already describes this ordering in Task 2.4 step 4 but still also modifies the helper signature.

### Improvement 3: Approval Queue DoA Filter Logic

Plan 59-01 Task 2.9 proposes this filter for managers:
```typescript
if (ctx.user.role === "manager") {
  pending = pending.filter(e => e.status === "recorded" || e.amount <= DOA_ADMIN_ONLY_THRESHOLD);
}
```

This means a manager can see ALL recorded expenses (company_paid) regardless of amount, but only employee_paid expenses under 500K. The CONTEXT.md says "company_paid acknowledge has no threshold", which supports this. However, this is a subtle security consideration: should a manager be able to acknowledge a Rp 10,000,000 company_paid expense? The DoA design was specifically to prevent lower-authority roles from approving high-value expenses.

**Recommendation:** This is a business decision, not a code bug. But the plan should explicitly call this out as a deliberate design choice with a comment explaining the rationale (e.g., "Acknowledge is not a financial approval -- the JE is already created. It's just a confirmation that the record is correct. No financial authority is being exercised."). If the business disagrees, add a threshold for acknowledge too.

### Improvement 4: `listMyExpenses` Status Validator Missing `recorded`

The `expenseStatusValidator` in `queries.ts` (line 16-24) is used by `listMyExpenses` for the optional status filter arg. Plan 59-01 Task 2.9 adds `recorded` to this validator, but a user calling `useMyExpenses("recorded")` will now work at the query level. The frontend `ExpenseStatus` type in `useExpenses.ts` needs to be updated too (Plan 59-02 handles this). However, the `listMyExpenses` query uses the `by_submitter_status` index for filtering, and this index includes `status`. The plan should verify this works correctly for the new `recorded` value (it should, since it's a valid status in the union).

**Recommendation:** No code change needed, but confirm that `listMyExpenses` with `status="recorded"` will correctly use the `by_submitter_status` compound index.

### Improvement 5: Frontend Submit Validation for company_paid Receipt

Plan 59-02 Task 1.3 updates the receipt label and warning text for `company_paid`, but the `handleSubmit` function in `ExpenseSubmit.tsx` does NOT add a frontend validation check to block submission without a receipt for company_paid. The backend will reject it, but the user experience would be better with a client-side guard.

**Recommendation:** In `validateForm()` or `handleSubmit()`, add:
```typescript
if (form.paymentMethod === "company_paid" && !form.receiptFileId) {
  return "Receipt is required for company-paid expenses";
}
```

---

## 4. Refinements (Minor Suggestions)

- Plan 59-02 Task 2.1 uses raw Tailwind dark mode classes for badges (`bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200`). Per CODE_STYLE.md, prefer CSS variable tokens. However, the existing codebase (StatusBadge.tsx) also uses raw Tailwind classes, so this is consistent with current practice.
- The `flagExpense` mutation does not record an audit trail entry. While the flag is stored as fields on the expense record, there's no `recordStatusChange` call since the status doesn't change. Consider adding a custom audit event for traceability (e.g., "flagged_for_review" action).
- Plan 59-02 Task 1.3 suggests changing the Submit button label to "Submit & Record" for company_paid. Consider also disabling the "Save Draft" button label doesn't change -- this is fine since drafts are the same for both types.
- The `transactionReference` field is optional for `company_paid` with only a soft warning. Consider making it more prominent (e.g., amber border on the input when empty) since bank reconciliation will depend on it later.
- Plan 59-01 Task 2.6 (`acknowledgeExpense`) stores `approvedBy`, `approvedAt`, `approverComment` on the expense. These field names were designed for the "approval" flow. Consider whether `acknowledgedBy`/`acknowledgedAt` would be clearer semantically. Trade-off: reusing existing fields is simpler and avoids schema changes, and the status transition is still to `approved`, so reuse is justified.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `createJournalEntryWithLines` | `convex/lib/journalEngine.ts` | Reuse for auto-JE on submission (already planned) |
| `buildDebitLine` / `buildCreditLine` | `convex/lib/journalEngine.ts` | Reuse for JE line construction (already planned) |
| `createReversalEntry` | `convex/lib/journalEngine.ts` | Already used by `voidExpense` -- works for recorded expenses too |
| `ActionDialog` component | `src/components/expenses/ApprovalActions.tsx` | Reuse for acknowledge/flag dialogs (already planned) |
| `protectedMutation` pattern | `convex/lib/functions.ts` | Pattern for new mutations (already planned) |
| `recordStatusChange` | `convex/expenses/auditTrail.ts` | For acknowledge audit trail (already planned) |
| `createMutationHook` | `src/hooks/convex/createMutationHook.ts` | For new mutation hooks (already planned) |

### Potential Duplication Risks
- The JE creation logic in `submitExpense` will partially duplicate what's in `approveExpense` (account lookup, JE creation). Consider extracting a shared helper `createExpenseJournalEntry(ctx, expense, creditCode)` to avoid duplicating the account lookup + JE creation pattern. This is minor since it's only ~10 lines.
- The `paymentMethodValidator` is defined in `mutations.ts` and must stay in sync with the schema. After the change, ensure no other files reference the old literals (`personal_cash`, `personal_transfer`, `company_card`).

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Plan 59-01 (Backend) | Needs Adjustment | Missing: schema sourceType fix, analytics update gaps, test plan |
| Plan 59-02 (Frontend) | Good | Well-structured, clear tasks, human verification gate |

**Ordering Issues:**
- Plan 59-01 Task 1 (schema + helpers) before Task 2 (mutations) is correct
- Plan 59-02 depends on 59-01 -- correct dependency chain
- Human verification gate in 59-02 Task 3 is excellent practice

**Missing Phases:**
- A test-focused task should be added to 59-01 (or test expectations added to each task's verify block)
- A data migration note should clarify: "Zero production expense records" should be verified at execution time, not just assumed from CONTEXT.md (a quick count query at the start of implementation)

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| 59-01 Task 1 (Schema + helpers) | `convex-backend` | Schema changes + pure helper updates |
| 59-01 Task 2 (Mutations + queries) | `convex-backend` | Backend mutations, JE integration |
| 59-02 Task 1 (Hooks + form) | `react-ui-builder` | Frontend form updates, hooks |
| 59-02 Task 2 (Approval queue) | `react-ui-builder` | Component updates, conditional rendering |
| Pre-merge verification | `code-auditor` | Type check + pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Not specified in plans |
| Branch naming convention | Not specified (should be `feature/59-direct-debit-expense-flow`) |
| Merge strategy documented | Not specified |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| 59-01 Task 1 | 1 | feat | Schema + helpers (atomic) |
| 59-01 Task 2 | 1 | feat | Mutations + queries (atomic) |
| 59-02 Task 1 | 1 | feat | Hooks + form + StatusBadge |
| 59-02 Task 2 | 1 | feat | Approval actions + queue |

### Recommended Commit Checkpoints
1. After schema + helpers -> `feat(59): update expense schema for company_paid flow`
2. After mutations + queries -> `feat(59): add auto-JE submission, acknowledge/flag mutations`
3. After frontend hooks + form -> `feat(59): update expense form with 2-option payment model`
4. After approval actions -> `feat(59): add acknowledge/flag UI for company-paid expenses`
5. After all tests pass -> `test(59): add tests for company_paid expense flow`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [ ] Plan includes `npm run test` check (only partial -- helpers tests in Task 1, not mutations)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Missing |
| Deployment order | Correct (backend before frontend, schema first) |
| Data backup needed | No (zero production expense records) |
| Migration safety | Safe (no existing data to migrate) |

### Git Workflow Issues Found
- No feature branch creation step at the start of either plan
- No commit checkpoints between tasks
- Missing CHANGELOG.md update requirement
- No `npm run test` in Task 2 verification (only `npm run build`)

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| 59-01 | `docs/SCHEMA.md` (new fields, new status, changed payment method union) |
| 59-01 | `docs/API_REFERENCE.md` (new mutations: acknowledgeExpense, flagExpense) |
| Post-merge | `docs/CHANGELOG.md` (ALWAYS required) |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-03-16 - Phase 59: Direct Debit Expense Flow

**Company-paid expense flow with auto-journaling and admin acknowledgment**

- Simplified payment methods from 3 to 2: Employee Paid and Company Paid
- Company-paid expenses auto-create journal entries on submission (recorded status)
- New Acknowledge action for admins to confirm company-paid expenses
- New Flag for Review action to mark expenses for investigation
- Transaction reference field for future bank reconciliation
- Updated approval queue with conditional Acknowledge/Flag vs Approve/Reject buttons
- Receipt always required for company-paid expenses regardless of amount

**Files Modified:**
- convex/schema.ts (expenses table: payment method union, recorded status, 5 new fields)
- convex/expenses/helpers.ts, mutations.ts, queries.ts, analyticsQueries.ts, fraudHelpers.ts
- src/hooks/convex/useExpenses.ts, src/pages/ExpenseSubmit.tsx, src/pages/ExpenseApproval.tsx
- src/components/expenses/ApprovalActions.tsx, StatusBadge.tsx
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Insufficient**

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | helpers (requiresReceipt, getTargetStatus, isVoidable) | Unit (vitest) | Planned (Task 1) |
| Backend | acknowledgeExpense mutation | convex-test | Missing |
| Backend | flagExpense mutation | convex-test | Missing |
| Backend | submitExpense auto-JE for company_paid | convex-test | Missing |
| Backend | voidExpense for recorded status | convex-test | Missing |
| Frontend | ExpenseSubmit form (2 options, conditional field) | Manual | Planned (Task 3 gate) |
| Frontend | ApprovalActions (acknowledge/flag buttons) | Manual | Planned (Task 3 gate) |
| Integration | Full company_paid flow | Manual | Planned (Task 3 gate) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `submitExpense` with company_paid creates JE | Financial integrity -- auto-JE is the core feature | `convex-test`: create draft with company_paid + receipt, submit, verify JE exists and expense status is "recorded" |
| 2 | `submitExpense` with employee_paid does NOT create JE | Regression -- must not change existing flow | `convex-test`: create draft with employee_paid, submit, verify NO JE and status is "submitted" |
| 3 | `submitExpense` company_paid without receipt throws | Receipt enforcement is a must-have | `convex-test`: create draft with company_paid, no receipt, verify submit throws |
| 4 | `acknowledgeExpense` happy path | New mutation needs verification | `convex-test`: create recorded expense, acknowledge, verify status is "approved" |
| 5 | `acknowledgeExpense` rejects non-recorded expense | Status guard must work | `convex-test`: submitted expense, attempt acknowledge, expect error |
| 6 | `flagExpense` sets fields without changing status | Core behavior | `convex-test`: recorded expense, flag with reason, verify fields set, status unchanged |
| 7 | `voidExpense` on recorded expense reverses JE | Financial integrity | `convex-test`: recorded expense with JE, void, verify reversal JE created |
| 8 | Existing `approveExpense` rejects recorded expenses | Guard must prevent approve on wrong status | Verify existing guard `status !== "submitted"` catches recorded |

### Test Execution Checkpoints
1. After Task 1 (schema + helpers): `npm run test -- --filter=helpers` (existing + new helper tests)
2. After Task 2 (mutations + queries): `npm run test` (all tests including new mutation tests)
3. Before merge: Full `npm run test && npm run build` verification

### Regression Risk
- Existing `convex/expenses/__tests__/helpers.test.ts` -- will need updates for changed `requiresReceipt` signature (if approach B taken) and `isVoidableStatus("recorded")` test
- Existing `convex/expenses/__tests__/fraudHelpers.test.ts` -- if `APPROVED_STATUSES` changes, verify existing test expectations still hold
- `tests/convex/expenseAnalytics.test.ts` -- may need updating for new `recorded` status in analytics queries
- Frontend: existing expense form behavior should be smoke-tested for employee_paid flow (regression)

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] What happens if the account lookup for code `"1100"` fails in `submitExpense`? (Account not seeded) -- need same error message pattern as `approveExpense`
- [ ] What if a `company_paid` expense in `recorded` status is rejected via `rejectExpense`? The existing guard is `status !== "submitted"` which blocks this, but the error message "Expense has already been processed" is confusing for recorded expenses. Consider a more specific message.
- [ ] What if admin voids a `recorded` expense and then the same admin tries to acknowledge it? The void should have changed status to `voided`, so the acknowledge guard catches it. Verify this path.
- [ ] What if `company_paid` expense has zero amount? `validateExpenseAmount` should catch this (positive integer validation), but verify.
- [ ] `flagExpense` allows flagging the same expense multiple times (overwriting previous flag). Is this intentional? Consider tracking flag history or blocking re-flag.
- [ ] The `listPendingForApproval` query uses `Promise.all` for two status queries. If there are many expenses, this could be slow. Current system has zero expenses so this is fine for now, but note for future.
- [ ] What happens to the duplicate warning check on submission for `company_paid`? The plan doesn't change the FRAUD-01 soft duplicate check -- it should still run for both types (it does, since the check runs before the company_paid branch).

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical:** Fix `sourceType` for journal entries -- either reuse `"expense_approval"` or add `"expense_submission"` to schema + void pairs
2. **Critical:** Clarify `submitExpense` status flow to avoid double-write (determine target status before building patch)
3. **Critical:** Add backend test plan for new/modified mutations
4. **Critical:** Include `recorded` status in `getExpenseMetrics` and `getFraudFlags` analytics queries

**Recommended before implementation:**
1. Add frontend receipt validation for company_paid in `validateForm()`
2. Verify credit account assumption (1100 for company_paid, 2200 for employee_paid)
3. Add git workflow section with branch name and commit checkpoints
4. Add CHANGELOG.md update requirement to documentation section

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

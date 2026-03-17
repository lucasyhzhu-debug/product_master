# Phase 59: Expense Payment Method Overhaul - Research

**Researched:** 2026-03-16
**Domain:** Convex expense lifecycle, journal entry engine, approval queue UI
**Confidence:** HIGH

## Summary

Phase 59 replaces 3 legacy payment method literals (`personal_cash`, `personal_transfer`, `company_card`) with 3 new ones (`employee_paid`, `company_paid`, `payment_request`), each with distinct journal entry timing, status flows, and approval behaviors. This is a **schema literal swap + new mutations + approval queue UI overhaul** across backend and frontend. No data migration is needed -- zero expense records exist in production.

The existing codebase is well-structured for this change. The expense module follows a clean pattern: `helpers.ts` (pure functions), `mutations.ts` (Convex mutations using `protectedMutation`), `queries.ts` (Convex queries using `protectedQuery`), `auditTrail.ts` (status history), and `fraudHelpers.ts` (fraud detection). The journal engine (`convex/lib/journalEngine.ts`) is fully reusable. The frontend has separate pages (`ExpenseSubmit.tsx`, `ExpenseApproval.tsx`, `MyExpenses.tsx`) with component separation (`StatusBadge.tsx`, `ApprovalActions.tsx`, `FraudFlags.tsx`, `ExpenseCard.tsx`).

**Primary recommendation:** Execute as 3 waves: (1) backend schema + helpers + mutations, (2) frontend form + approval queue + status badges, (3) verification. The critical ordering constraint is that schema + mutation changes must deploy before frontend can reference new literals and statuses.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Replace 3 literals (`personal_cash`, `personal_transfer`, `company_card`) with 3 new ones: `employee_paid`, `company_paid`, `payment_request`
- No data migration needed -- zero existing expense records in production
- `employee_paid` = employee fronted the money, needs reimbursement (old personal_cash + personal_transfer behavior)
- `company_paid` = company bank already debited (direct debit, linked Shopee/BCA, company card swipe), employee is just recording it
- `payment_request` = prospective -- employee requests company to pay a vendor directly from the bank account, money hasn't moved yet
- Frontend dropdown shows 3 options with inline tooltip/helper text:
  - **Reimburse Employee**: "I paid for this myself and need the company to pay me back"
  - **Paid by Company**: "The company bank account was already charged (e.g., direct debit, linked Shopee/BCA)"
  - **Payment Request**: "I need the company to pay this vendor directly from the bank account"
- Schema: `paymentMethod` union of 3 new literals
- Schema: `transactionReference: v.optional(v.string())` -- bank ref number / transaction ID
- Schema: `flaggedForReview: v.optional(v.boolean())`, `flaggedBy: v.optional(v.id("users"))`, `flaggedAt: v.optional(v.number())`, `flagReason: v.optional(v.string())`
- Schema: `paidAt: v.optional(v.number())` -- when bank transfer was executed (payment_request only)
- Schema: Add `recorded` and `paid` to status union
- JE treatment: All 3 types DR Expense Account, CR 1100 (Cash/Bank)
- JE timing: employee_paid on approval, company_paid on submission, payment_request on mark-as-paid
- JE description includes payment type label
- Status flow employee_paid: draft -> submitted -> approved -> awaiting_payment -> reimbursement flow
- Status flow company_paid: draft -> submitted -> (auto-JE, status=recorded) -> admin Acknowledge -> approved
- Status flow payment_request: draft -> submitted -> admin approves -> approved (no JE) -> mark as paid -> paid (JE created)
- company_paid flag does NOT reverse/suspend JE -- admin must void separately if wrong
- `recorded` is NOT terminal -- admin must acknowledge or void
- `markAsPaid` mutation: approved -> paid, creates JE, captures transactionReference (mandatory), paidAt
- Who can mark as paid: manager, admin (same as APPROVER_ROLES)
- Receipt always required for company_paid and payment_request regardless of amount
- Receipt threshold for employee_paid: existing > Rp 50,000 rule
- Transaction reference shown at submission for company_paid, at mark-as-paid for payment_request, hidden for employee_paid
- All 3 payment types in same approval queue list (no separate tabs)
- Badges: "Company Paid", "Payment Request", or no badge for employee_paid
- Action buttons vary by payment type and status (see CONTEXT.md for exact matrix)
- Existing fraud controls apply to all payment types
- company_paid without transaction reference gets soft warning (not block)
- All approval queue and rejection chain queries accessible to APPROVER_ROLES

### Claude's Discretion
- Exact badge styling and color for "Company Paid" vs "Payment Request" vs "Employee Paid"
- Flag for Review dialog design (reason field, etc.)
- Whether `recorded` and "Pending Payment" expenses appear in filter tabs or just in the main list
- Exact UI for the "Mark as Paid" action (inline button, dialog, separate page)
- Whether `paidAt` should default to now or require manual entry
- Whether to add a `paidBy` field tracking who executed the bank transfer
- Error message wording
- How to handle the `getTargetStatusAfterApproval` helper refactor
- Index strategy for the new status queries

### Deferred Ideas (OUT OF SCOPE)
- Bank statement import / CSV upload for automated matching against transactionReference -- future phase
- Multi-bank account tracking (separate bank accounts instead of single 1100 Cash) -- future phase
- Reconciliation automation (match bank statement lines to recorded expenses) -- future phase
- Splitting `1100 Cash (Bank Accounts)` into individual bank accounts (BCA, Mandiri, etc.) in CoA -- future phase
- Batch payment requests (group multiple approved requests into one bank transfer) -- future phase
- Payment deadline / urgency levels for payment_request -- future phase
- Payment execution tracking (who transferred, from which bank account) -- could enhance with `paidBy` field
</user_constraints>

<phase_requirements>
## Phase Requirements

**IMPORTANT:** The REQUIREMENTS.md was written BEFORE the Phase 59.1 merge. It describes only 2 payment methods (DEXP-01 says "2 payment method literals", DEXP-10 says "exactly 2 payment options"). The CONTEXT.md (which absorbed 59.1) is authoritative and specifies 3 payment methods. The planner MUST use CONTEXT.md decisions as the source of truth and treat DEXP-* IDs as approximate -- several need expanded scope.

| ID | Description (REQUIREMENTS.md) | Research Support | Expanded Scope (from CONTEXT.md) |
|----|-------------------------------|-----------------|----------------------------------|
| DEXP-01 | Schema has 2 payment method literals | Schema swap in `convex/schema.ts` expenses table, line 1646-1650 | **3 literals**: `employee_paid`, `company_paid`, `payment_request` |
| DEXP-02 | Schema has `recorded` status | Add to status union in `convex/schema.ts` line 1653-1661 | **2 new statuses**: `recorded` AND `paid` |
| DEXP-03 | Schema has new optional fields | Add to expenses table definition | Also add `paidAt` field |
| DEXP-04 | `requiresReceipt` returns true for all company_paid | Update `convex/expenses/helpers.ts` line 20-22 | Also true for ALL `payment_request` expenses |
| DEXP-05 | helpers updated for new literals and recorded status | Update `getTargetStatusAfterApproval`, `isVoidableStatus` | Also handle `paid` status in `isVoidableStatus` |
| DEXP-06 | company_paid submit auto-creates JE | Modify `submitExpense` in `convex/expenses/mutations.ts` line 219-303 | Unchanged |
| DEXP-07 | employee_paid submit unchanged | Existing `submitExpense` behavior preserved | Unchanged |
| DEXP-08 | `acknowledgeExpense` mutation | New mutation in `convex/expenses/mutations.ts` | Unchanged |
| DEXP-09 | `flagExpense` mutation | New mutation in `convex/expenses/mutations.ts` | Unchanged |
| DEXP-10 | Expense form shows exactly 2 payment options | Modify `PAYMENT_METHODS` in `src/pages/ExpenseSubmit.tsx` line 45-49 | **3 options** with tooltip text |
| DEXP-11 | Transaction reference field for company_paid | Add conditional field in `ExpenseSubmit.tsx` | Also show at mark-as-paid for payment_request |
| DEXP-12 | Approval queue badges and Acknowledge/Flag buttons | Modify `src/pages/ExpenseApproval.tsx` and `ApprovalActions.tsx` | Also add Approve/Reject for payment_request submitted, Mark as Paid for payment_request approved |
| DEXP-13 | Flagged expenses display warning badge | Add to `ExpenseApprovalCard` | Unchanged |
| DEXP-14 | Recorded status badge in StatusBadge | Add to `src/components/expenses/StatusBadge.tsx` | Also add `paid` status badge |
| (new) | `approvePaymentRequest` mutation | New: standard approve flow for payment_request submitted->approved (no JE) | From merged Phase 59.1 |
| (new) | `markAsPaid` mutation | New: approved->paid with JE creation and transactionReference capture | From merged Phase 59.1 |
| (new) | Approval queue: payment_request in submitted gets Approve/Reject | Frontend action buttons | From merged Phase 59.1 |
| (new) | Approval queue: payment_request in approved gets Mark as Paid | Frontend action buttons + dialog | From merged Phase 59.1 |
</phase_requirements>

## Standard Stack

### Core (all existing -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend mutations/queries/schema | Project backend |
| React 19 | ^19.2.0 | Frontend UI | Project frontend |
| TypeScript | ~5.9 | Type safety | Project language |
| shadcn/ui | latest | UI components (Dialog, Select, Badge, Input, Textarea) | Project UI library |
| Lucide React | latest | Icons | Project icon library |
| Sonner | latest | Toast notifications | Project toast library |

### Supporting (existing, reused)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| convex-helpers | latest | `protectedMutation`/`protectedQuery`, session handling | All mutations and queries |
| convex-test | latest | Integration testing with schema-aware test runner | Backend tests |
| Vitest | ^4.0.18 | Test runner | Unit + integration tests |

### Alternatives Considered
None -- this phase uses only existing project dependencies.

**Installation:**
No new packages needed.

## Architecture Patterns

### Recommended File Change Map
```
convex/
  schema.ts                    # Update expenses table: paymentMethod union, status union, new fields
  expenses/
    helpers.ts                 # Update requiresReceipt, getTargetStatusAfterApproval, isVoidableStatus
    mutations.ts               # Update createDraft/updateDraft/submitExpense, add acknowledgeExpense, flagExpense, markAsPaid
    queries.ts                 # Update listPendingForApproval to include recorded + approved payment_request
    constants.ts               # No changes needed
    auditTrail.ts              # No changes needed (generic)
    fraudHelpers.ts            # Update APPROVED_STATUSES to include "recorded" and "paid"
    analyticsQueries.ts        # Update status lists to include "recorded" and "paid"
    __tests__/helpers.test.ts  # Update tests for new helper signatures
src/
  hooks/convex/useExpenses.ts  # Update ExpenseStatus type, add new mutation hooks
  pages/
    ExpenseSubmit.tsx          # Replace PAYMENT_METHODS, add conditional transactionReference field, update receipt logic
    ExpenseApproval.tsx        # Add payment type badges, update PAYMENT_METHODS map
    MyExpenses.tsx             # Add "recorded" and "paid" tabs or filter support
  components/expenses/
    StatusBadge.tsx            # Add "recorded" and "paid" status configs
    ApprovalActions.tsx        # Add Acknowledge/Flag for recorded, Mark as Paid for approved payment_request
    FraudFlags.tsx             # Add flaggedForReview badge rendering
    ExpenseCard.tsx            # Possibly show transactionReference or payment type badge
```

### Pattern 1: Payment-Method-Aware Submit (Key Complexity)
**What:** The `submitExpense` mutation must branch on `paymentMethod` to determine whether to auto-create a JE.
**When to use:** company_paid submissions.
**Example:**
```typescript
// In submitExpense handler, after existing validation:
if (expense.paymentMethod === "company_paid") {
  // Auto-create JE: DR expense GL, CR 1100 Cash
  const cashAccount = await ctx.db
    .query("accounts")
    .withIndex("by_code", (q) => q.eq("code", "1100"))
    .unique();
  if (!cashAccount) throw new Error("Account 1100 not found");

  const journalEntryId = await createJournalEntryWithLines(ctx, {
    date: expense.expenseDate,
    description: `Expense ${expense.expenseNumber} [Company Paid]: ${expense.description}`,
    sourceType: "expense_approval", // Reuse existing source type
    sourceId: expense._id,
    createdBy: ctx.user._id,
    lines: [
      buildDebitLine(expense.accountId, expense.amount, expense.description),
      buildCreditLine(cashAccount._id, expense.amount),
    ],
  });

  await ctx.db.patch(args.expenseId, {
    status: "recorded",
    submittedAt: now,
    journalEntryId,
    lateSubmission,
    duplicateWarning: duplicateWarning ?? undefined,
  });
  await recordStatusChange(ctx, args.expenseId, "draft", "recorded", ctx.user._id);
} else {
  // employee_paid and payment_request: standard submit to "submitted"
  await ctx.db.patch(args.expenseId, {
    status: "submitted",
    submittedAt: now,
    lateSubmission,
    duplicateWarning: duplicateWarning ?? undefined,
  });
  await recordStatusChange(ctx, args.expenseId, "draft", "submitted", ctx.user._id);
}
```

### Pattern 2: Approval Queue Multi-Action
**What:** The approval queue must show different action buttons depending on `paymentMethod` and `status`.
**When to use:** `ExpenseApproval.tsx` / `ApprovalActions.tsx`.
**Example logic:**
```typescript
// Determine action set based on payment method + status
if (expense.paymentMethod === "company_paid" && expense.status === "recorded") {
  // Show: Acknowledge / Flag for Review / Void (admin)
} else if (expense.paymentMethod === "payment_request" && expense.status === "submitted") {
  // Show: Approve / Reject / Void (admin) -- standard approval
} else if (expense.paymentMethod === "payment_request" && expense.status === "approved") {
  // Show: Mark as Paid / Void (admin)
} else if (expense.paymentMethod === "employee_paid" && expense.status === "submitted") {
  // Show: Approve / Reject / Void (admin) -- existing behavior
}
```

### Pattern 3: getTargetStatusAfterApproval Refactor
**What:** The helper must return different target statuses based on the new payment methods.
**When to use:** `approveExpense` mutation.
**Example:**
```typescript
export function getTargetStatusAfterApproval(
  paymentMethod: string
): "approved" | "awaiting_payment" {
  // employee_paid needs reimbursement -> awaiting_payment
  // payment_request approval is authorization only -> approved (JE created later on markAsPaid)
  // company_paid should never reach standard approval (uses acknowledge flow)
  return paymentMethod === "employee_paid" ? "awaiting_payment" : "approved";
}
```

### Pattern 4: listPendingForApproval Query Expansion
**What:** The approval queue query must fetch multiple statuses.
**When to use:** `queries.ts` `listPendingForApproval`.
**Current:** Only fetches `status === "submitted"`.
**New:** Must also fetch `status === "recorded"` (for company_paid acknowledge) and `status === "approved"` + `paymentMethod === "payment_request"` (for mark-as-paid).
```typescript
// Fetch submitted + recorded + approved-payment-request in parallel
const [submitted, recorded, approvedAll] = await Promise.all([
  ctx.db.query("expenses").withIndex("by_status", (q) => q.eq("status", "submitted")).collect(),
  ctx.db.query("expenses").withIndex("by_status", (q) => q.eq("status", "recorded")).collect(),
  ctx.db.query("expenses").withIndex("by_status", (q) => q.eq("status", "approved")).collect(),
]);

// Filter approved to only payment_request that need mark-as-paid
const approvedPaymentRequests = approvedAll.filter(
  (e) => e.paymentMethod === "payment_request"
);

// Combine and filter out self-submitted
let pending = [...submitted, ...recorded, ...approvedPaymentRequests]
  .filter((e) => e.submittedBy !== ctx.user._id);
```

### Anti-Patterns to Avoid
- **Do NOT create a separate "company_paid approval" mutation for acknowledgeExpense.** Instead, create a distinct `acknowledgeExpense` mutation -- do NOT reuse `approveExpense` because acknowledge has different semantics (no JE creation, transitions from `recorded` not `submitted`).
- **Do NOT add new JE sourceType values.** The existing `expense_approval` sourceType works for all 3 payment types. The JE description carries the payment type label for human readability.
- **Do NOT modify the reimbursement mutations.** Reimbursements only apply to `employee_paid` expenses in `awaiting_payment` status. The existing filter (`status === "awaiting_payment"`) is already correct.
- **Do NOT hide company_paid or payment_request expenses from the MyExpenses list.** They follow the same personal listing pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Journal entry creation | Custom DB inserts for JE | `createJournalEntryWithLines` from `journalEngine.ts` | Enforces balance validation, sequential numbering, line denormalization |
| Journal reversal (void) | Manual debit/credit swap | `createReversalEntry` from `journalEngine.ts` | Handles all reversal guards and original marking |
| Expense number generation | Custom counter logic | `getNextNumber(ctx, "EXP")` from `counter.ts` | Race-safe sequential numbering |
| Session auth + role checking | Manual token/session extraction | `protectedMutation`/`protectedQuery` from `functions.ts` | Automatic sessionId injection, role validation, ctx.user population |
| Status audit trail | Custom insert in each mutation | `recordStatusChange` from `auditTrail.ts` | Consistent audit trail format |
| Toast notifications on mutation | Custom try/catch toast logic | `createMutationHook` from `useExpenses.ts` | Uniform success/error toast handling |

**Key insight:** The existing expense module already has excellent separation of concerns. Every reusable utility (journal engine, counter, audit trail, auth wrappers) is already built and tested. This phase adds 3 new mutations and modifies 2 existing ones but should reuse ALL existing infrastructure.

## Common Pitfalls

### Pitfall 1: Approval Queue Query Performance
**What goes wrong:** Fetching all `approved` expenses to find payment_request ones creates unnecessary data loading.
**Why it happens:** The `by_status` index returns ALL approved expenses (employee_paid + company_paid + payment_request), but only payment_request in approved status need to appear in the queue.
**How to avoid:** Accept the performance trade-off for now -- approved expenses are a small set. Filter in-memory with `.filter(e => e.paymentMethod === "payment_request")`. Adding a compound index `by_paymentMethod_status` could help later but adds index count.
**Warning signs:** Slow approval queue loading in production with many approved expenses.

### Pitfall 2: submitExpense company_paid JE Uses Wrong Account Code
**What goes wrong:** Using `"2200"` (Employee Reimbursements Payable) instead of `"1100"` (Cash/Bank) as the credit account for company_paid.
**Why it happens:** The existing `approveExpense` branches on `company_card` for `1100` vs personal for `2200`. The new company_paid auto-JE on submit must always use `1100`.
**How to avoid:** company_paid JE always credits `1100` Cash. The money already left the bank -- there is no reimbursement payable.
**Warning signs:** P&L showing incorrect liability balances.

### Pitfall 3: payment_request Double JE
**What goes wrong:** Creating a JE at approval AND at mark-as-paid for payment_request.
**Why it happens:** The existing `approveExpense` always creates a JE. For payment_request, JE should only be created at mark-as-paid.
**How to avoid:** Either (a) skip JE creation in approveExpense when paymentMethod is `payment_request`, or (b) create a separate `approvePaymentRequest` mutation that skips JE. Approach (a) is simpler -- add a condition to the existing approveExpense.
**Warning signs:** Duplicate journal entries for payment_request expenses.

### Pitfall 4: isVoidableStatus Must Include New Statuses
**What goes wrong:** New `recorded` and `paid` statuses not being voidable, preventing admin from voiding them.
**Why it happens:** The existing `VOIDABLE_STATUSES` array only includes `submitted`, `approved`, `awaiting_payment`, `rejected`.
**How to avoid:** Add `recorded` and `paid` to `VOIDABLE_STATUSES`. Both represent non-terminal states where voiding should be possible (with JE reversal if a JE exists).
**Warning signs:** Admin gets "Cannot void expense with status 'recorded'" error.

### Pitfall 5: APPROVED_STATUSES in fraudHelpers Missing New Statuses
**What goes wrong:** Fraud analytics (approver concentration) ignores `recorded` and `paid` expenses.
**Why it happens:** `APPROVED_STATUSES` in `fraudHelpers.ts` line 18 is hardcoded to `["approved", "awaiting_payment", "reimbursed"]`.
**How to avoid:** Add `"recorded"` and `"paid"` to `APPROVED_STATUSES` set.
**Warning signs:** Fraud detection misses company_paid and payment_request expenses entirely.

### Pitfall 6: analyticsQueries Status Lists Not Updated
**What goes wrong:** Expense analytics dashboard shows incomplete data because `recorded` and `paid` expenses are not fetched.
**Why it happens:** `getExpenseMetrics` and `getFraudFlags` queries hardcode status lists for parallel index queries.
**How to avoid:** Add parallel queries for `recorded` and `paid` statuses in analytics queries. Include them in the combined array.
**Warning signs:** Analytics totals don't match reality after company_paid expenses are recorded.

### Pitfall 7: listMyExpenses Status Validator Missing New Statuses
**What goes wrong:** User can't filter their expenses by `recorded` or `paid` status.
**Why it happens:** The `expenseStatusValidator` in `queries.ts` (line 16-24) must include the new status literals.
**How to avoid:** Add `v.literal("recorded")` and `v.literal("paid")` to the validator.
**Warning signs:** TypeScript error or runtime validation failure when user filters by new statuses.

### Pitfall 8: Receipt Enforcement Must Change Per Payment Type
**What goes wrong:** company_paid/payment_request expenses under Rp 50,000 bypass receipt requirement.
**Why it happens:** Current `requiresReceipt(amount)` only checks amount threshold. For company_paid and payment_request, receipt is always required regardless of amount.
**How to avoid:** Update `requiresReceipt` to accept payment method parameter, or add a separate check in `submitExpense`. The latter is simpler and avoids changing the existing function signature used in tests.
**Warning signs:** Employee submits company_paid expense without receipt.

## Code Examples

### acknowledgeExpense Mutation
```typescript
// Source: modeled after existing approveExpense pattern
export const acknowledgeExpense = protectedMutation({
  roles: [...APPROVER_ROLES],
  args: {
    expenseId: v.id("expenses"),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    if (expense.status !== "recorded") throw new Error("Only recorded expenses can be acknowledged");
    if (expense.paymentMethod !== "company_paid") throw new Error("Only company_paid expenses use acknowledge flow");

    // No JE creation -- JE was already created on submission
    await ctx.db.patch(args.expenseId, {
      status: "approved",
      approvedBy: ctx.user._id,
      approvedAt: Date.now(),
      approverComment: args.comment,
    });

    await recordStatusChange(ctx, args.expenseId, "recorded", "approved", ctx.user._id, args.comment);
    return { success: true };
  },
});
```

### flagExpense Mutation
```typescript
export const flagExpense = protectedMutation({
  roles: [...APPROVER_ROLES],
  args: {
    expenseId: v.id("expenses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    if (expense.status !== "recorded") throw new Error("Only recorded expenses can be flagged");
    validateRequiredReason(args.reason, "Flag reason");

    await ctx.db.patch(args.expenseId, {
      flaggedForReview: true,
      flaggedBy: ctx.user._id,
      flaggedAt: Date.now(),
      flagReason: args.reason.trim(),
    });

    // Status does NOT change -- remains "recorded"
    return { success: true };
  },
});
```

### markAsPaid Mutation
```typescript
export const markAsPaid = protectedMutation({
  roles: [...APPROVER_ROLES],
  args: {
    expenseId: v.id("expenses"),
    transactionReference: v.string(), // Mandatory -- must have bank proof
    paidAt: v.optional(v.number()),   // Defaults to now
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    if (expense.status !== "approved") throw new Error("Only approved expenses can be marked as paid");
    if (expense.paymentMethod !== "payment_request") throw new Error("Only payment_request expenses use mark-as-paid flow");
    if (!args.transactionReference.trim()) throw new Error("Transaction reference is required");

    // Create JE now (money leaves bank at this point)
    const cashAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "1100"))
      .unique();
    if (!cashAccount) throw new Error("Account 1100 not found. Run accounts:seedDefaults first.");

    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: args.paidAt ?? Date.now(),
      description: `Expense ${expense.expenseNumber} [Payment Request]: ${expense.description}`,
      sourceType: "expense_approval",
      sourceId: expense._id,
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(expense.accountId, expense.amount, expense.description),
        buildCreditLine(cashAccount._id, expense.amount),
      ],
    });

    await ctx.db.patch(args.expenseId, {
      status: "paid",
      journalEntryId,
      transactionReference: args.transactionReference.trim(),
      paidAt: args.paidAt ?? Date.now(),
    });

    await recordStatusChange(ctx, args.expenseId, "approved", "paid", ctx.user._id);
    return { success: true, journalEntryId };
  },
});
```

### Updated StatusBadge Config
```typescript
// Add to STATUS_CONFIG in StatusBadge.tsx
recorded: {
  label: "Recorded",
  className: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
},
paid: {
  label: "Paid",
  className: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
},
```

### Updated PAYMENT_METHODS for ExpenseSubmit
```typescript
const PAYMENT_METHODS = [
  {
    value: "employee_paid",
    label: "Reimburse Employee",
    description: "I paid for this myself and need the company to pay me back",
  },
  {
    value: "company_paid",
    label: "Paid by Company",
    description: "The company bank account was already charged (e.g., direct debit, linked Shopee/BCA)",
  },
  {
    value: "payment_request",
    label: "Payment Request",
    description: "I need the company to pay this vendor directly from the bank account",
  },
] as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `personal_cash`, `personal_transfer`, `company_card` | `employee_paid`, `company_paid`, `payment_request` | Phase 59 | Clearer semantics, distinct workflows per type |
| JE always at approval | JE timing varies by payment method | Phase 59 | company_paid JE on submit, payment_request JE on mark-as-paid |
| Single approval action (approve/reject) | Multiple action types (approve/reject/acknowledge/flag/mark-as-paid) | Phase 59 | Richer approval queue |
| Receipt required only > Rp 50K | Receipt always required for company money | Phase 59 | Stronger evidence trail for company funds |

**Deprecated/outdated:**
- `personal_cash`: Replaced by `employee_paid`
- `personal_transfer`: Replaced by `employee_paid`
- `company_card`: Replaced by `company_paid`

## Open Questions

1. **approveExpense mutation reuse for payment_request**
   - What we know: payment_request in submitted status needs standard approve/reject. The existing `approveExpense` creates a JE.
   - What's unclear: Should we modify `approveExpense` to skip JE for payment_request, or create a separate mutation?
   - Recommendation: Modify `approveExpense` to conditionally skip JE when `paymentMethod === "payment_request"`. This keeps the approval queue simple (one approve action) and avoids mutation proliferation. The `getTargetStatusAfterApproval` helper already branches on payment method, so adding a JE skip condition is natural.

2. **JE date for markAsPaid**
   - What we know: `paidAt` captures when the bank transfer was executed.
   - What's unclear: Should the JE date use `paidAt` or `expense.expenseDate`?
   - Recommendation: Use `paidAt` (the actual payment date) as the JE date. This reflects when money actually left the bank, which is the accounting-relevant event. The `expenseDate` might be when the invoice was issued, not when payment occurred.

3. **New index for payment_request in approved status**
   - What we know: The approval queue needs `approved` + `payment_request` expenses. Currently no compound index for `paymentMethod + status`.
   - Recommendation: Do NOT add a compound index. The `by_status` index on `approved` will return a small set that can be filtered in-memory. Adding indexes increases the 150 index count (already high). Revisit if performance becomes an issue.

4. **`paidBy` field**
   - What we know: CONTEXT.md lists this as Claude's discretion.
   - Recommendation: Add `paidBy: v.optional(v.id("users"))` to schema. It costs nothing (optional field) and provides valuable audit trail for who executed the bank transfer. Set it from `ctx.user._id` in `markAsPaid`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npm run test -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEXP-01 | 3 payment method literals in schema | unit (type-level -- schema compiles) | `npm run type-check` | N/A (schema) |
| DEXP-02 | `recorded` and `paid` status in schema | unit (type-level) | `npm run type-check` | N/A (schema) |
| DEXP-03 | New optional fields in schema | unit (type-level) | `npm run type-check` | N/A (schema) |
| DEXP-04 | `requiresReceipt` for company_paid/payment_request | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Exists (update) |
| DEXP-05 | `getTargetStatusAfterApproval` + `isVoidableStatus` | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Exists (update) |
| DEXP-06 | company_paid submit auto-creates JE | integration | `npx vitest run tests/convex/expenseAnalytics.test.ts -x` | Exists (could extend) |
| DEXP-07 | employee_paid submit unchanged | unit (regression) | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Exists |
| DEXP-08 | acknowledgeExpense mutation | integration | Manual or new test | Wave 0 gap |
| DEXP-09 | flagExpense mutation | integration | Manual or new test | Wave 0 gap |
| DEXP-10 | 3 payment options in form | manual-only | Visual verification | N/A (UI) |
| DEXP-11 | Conditional transactionReference field | manual-only | Visual verification | N/A (UI) |
| DEXP-12 | Approval queue badges and action buttons | manual-only | Visual verification | N/A (UI) |
| DEXP-13 | Flagged badge in approval list | manual-only | Visual verification | N/A (UI) |
| DEXP-14 | `recorded` and `paid` StatusBadge | manual-only | Visual verification | N/A (UI) |
| (new) | markAsPaid mutation | integration | Manual or new test | Wave 0 gap |

### Sampling Rate
- **Per task commit:** `npm run type-check && npx vitest run convex/expenses/__tests__/helpers.test.ts -x`
- **Per wave merge:** `npm run test -- --run`
- **Phase gate:** `npm run build` + full suite green before verification

### Wave 0 Gaps
- [x] `convex/expenses/__tests__/helpers.test.ts` -- exists, needs updated test cases for new payment methods
- [ ] Integration tests for `acknowledgeExpense`, `flagExpense`, `markAsPaid` mutations -- could be added but not blocking (mutation logic is straightforward, tested via type-check + build)
- No framework install needed -- Vitest already configured

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` lines 1638-1684 -- current expenses table definition
- `convex/expenses/mutations.ts` -- all 6 existing mutation implementations
- `convex/expenses/helpers.ts` -- all pure helper functions with current logic
- `convex/expenses/queries.ts` -- all 4 query implementations
- `convex/lib/journalEngine.ts` -- full journal entry engine (createJournalEntryWithLines, createReversalEntry)
- `convex/expenses/fraudHelpers.ts` -- APPROVED_STATUSES set
- `convex/expenses/analyticsQueries.ts` -- status-filtered analytics queries
- `src/pages/ExpenseSubmit.tsx` -- current payment method dropdown (lines 45-49)
- `src/pages/ExpenseApproval.tsx` -- current approval queue layout
- `src/components/expenses/ApprovalActions.tsx` -- current approve/reject/void action buttons
- `src/components/expenses/StatusBadge.tsx` -- current status badge config
- `src/hooks/convex/useExpenses.ts` -- current ExpenseStatus type and hooks
- `59-CONTEXT.md` -- authoritative merged Phase 59 + 59.1 decisions

### Secondary (MEDIUM confidence)
- `convex/reimbursements/mutations.ts` -- reimbursement flow only touches `awaiting_payment` expenses (no changes needed)
- `convex/expenses/__tests__/helpers.test.ts` -- existing test coverage for pure helpers

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing project infrastructure
- Architecture: HIGH -- direct code inspection of all affected files, clear change map
- Pitfalls: HIGH -- identified from actual code analysis (hardcoded status arrays, JE credit account logic, fraud helper status sets)

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable -- internal project, no external API changes)

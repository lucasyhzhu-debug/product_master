# Phase 45: Expense Approval & Void - Research

**Researched:** 2026-03-13
**Domain:** Expense approval workflow, Delegation of Authority, journal entry generation, fraud detection UI (Convex backend + React frontend)
**Confidence:** HIGH

## Summary

Phase 45 extends the expense submission workflow (Phase 44) with approval, rejection, resubmission, void, and fraud detection capabilities. The schema is already fully defined in `convex/schema.ts` -- all fields needed for approval (`approvedBy`, `approvedAt`, `approverComment`, `rejectedBy`, `rejectedAt`, `rejectionReason`, `voidedBy`, `voidedAt`, `voidReason`, `journalEntryId`, `previousExpenseId`) are present on the `expenses` table. The `journalEntries` and `journalEntryLines` tables are ready, and the `createJournalEntryWithLines` and `createReversalEntry` helpers in `convex/lib/journalEngine.ts` provide the complete double-entry engine.

The core challenge is implementing Delegation of Authority (DoA) rules correctly: expenses <= Rp 500K are approvable by Manager or Admin, expenses > Rp 500K require Admin only, self-approval is always blocked. The approval mutation must atomically generate a journal entry (DR OpEx, CR 2200 or CR 1100) while transitioning status. The void mutation must generate a reversing JE via the existing `createReversalEntry` helper. The approval queue uses broadcast routing (all eligible approvers see pending items, first to act wins), which is a simple query pattern. Fraud flags (duplicate warning, late submission, rejection chain) are already computed and stored on expense records -- the approver UI just needs to display them.

The frontend needs: (1) an approval queue page showing pending expenses with fraud flags, (2) approve/reject actions with DoA enforcement, (3) void action for admin, (4) updated `getById` query to allow approver access, and (5) expense detail view for approvers showing receipt, fraud flags, and rejection chain.

**Primary recommendation:** Add 3 new mutations (`approveExpense`, `rejectExpense`, `voidExpense`) to `convex/expenses/mutations.ts`, 2 new queries (`listPendingForApproval`, `getRejectionChain`) to `convex/expenses/queries.ts`, extend `getById` to allow manager/admin access, add DoA pure helpers to `convex/expenses/helpers.ts`, and build an `ExpenseApproval.tsx` page with an `ExpenseDetail.tsx` component. Extract account lookup helpers for 1100/2200 to avoid hardcoding account IDs.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXP-07 | Eligible approvers see pending expenses in their approval queue (broadcast routing -- first to act wins) | `by_status` index on expenses table enables efficient query for `status === "submitted"`; filter out self-submitted in query handler; `by_role` index on users table not needed since protectedQuery already has `ctx.user` |
| EXP-08 | Expenses <= Rp 500K can be approved by Manager or Admin (except submitter) | Pure DoA helper: `canApprove(userRole, amount, submittedBy, userId)` returns boolean; threshold constant `DOA_ADMIN_ONLY_THRESHOLD = 500_000` |
| EXP-09 | Expenses > Rp 500K can only be approved by Admin (except submitter) | Same DoA helper; role check `admin` when `amount > 500_000` |
| EXP-10 | Self-approval is blocked at the backend level regardless of role | Backend guard in `approveExpense` mutation: `if (expense.submittedBy === ctx.user._id) throw` |
| EXP-11 | Approver comment is mandatory for expenses >= Rp 500K | Backend validation in `approveExpense`: `if (amount >= 500_000 && !comment) throw`; note: >= threshold, not just > |
| EXP-12 | Approving an expense auto-generates a journal entry (DR OpEx account, CR 2200 or CR 1100 for company_card) | `createJournalEntryWithLines` from `convex/lib/journalEngine.ts`; look up account IDs by code "1100"/"2200" via `by_code` index; `expense.accountId` is the DR account |
| EXP-13 | Rejected expenses include a reason and can be revised and resubmitted (linked via previousExpenseId) | `rejectExpense` mutation sets `rejectedBy`, `rejectionReason`, status to "rejected"; existing `createDraft` already accepts `previousExpenseId` arg; new query `getRejectionChain` walks the `previousExpenseId` chain |
| EXP-14 | Approved expenses with personal payment method auto-transition to AwaitingPayment status | In `approveExpense`: if `paymentMethod !== "company_card"`, set `status = "awaiting_payment"` (not "approved") |
| EXP-15 | Company card expenses go directly to Approved as terminal status (no reimbursement needed) | In `approveExpense`: if `paymentMethod === "company_card"`, set `status = "approved"` (terminal) |
| EXP-16 | Admin can void any non-terminal expense with a reason, generating a reversing journal entry | `voidExpense` mutation: admin-only role check; terminal statuses = `["reimbursed"]`; if expense has `journalEntryId`, call `createReversalEntry` with `"expense_void"` sourceType |
| EXP-17 | Reimbursed expenses cannot be voided directly -- the reimbursement batch must be voided instead | Guard in `voidExpense`: `if (expense.status === "reimbursed") throw "Cannot void reimbursed expense -- void the reimbursement batch instead"` |
| FRAUD-01 | System warns on duplicate detection (same employee + amount + date within 7 days) | Already computed and stored as `duplicateWarning` string on expense record by Phase 44 `createDraft`/`updateDraft`/`submitExpense`; approver UI displays the warning |
| FRAUD-02 | System hard-blocks submission of receipts with duplicate SHA-256 hash | Already enforced in Phase 44 `submitExpense` mutation via `by_receipt_hash` index; no new backend work needed |
| FRAUD-03 | Late submission flag shown to approver when expense date > 14 days before submission | Already computed as `lateSubmission` boolean on expense record by Phase 44 `submitExpense`; approver UI displays flag |
| FRAUD-04 | Rejection history with full chain shown to approver (count badge + reasons) | New `getRejectionChain` query walks `previousExpenseId` chain; approver UI shows count badge and inline rejection reasons |
| FRAUD-05 | Approved expenses are immutable -- no field edits allowed, only void + resubmit | Phase 44 `updateDraft` already guards `status !== "draft"` throws; `voidExpense` is the only mutation that can change approved expenses; void + resubmit is the correction path |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend mutations/queries, real-time subscriptions | Project backend; all expense data flows through Convex |
| convex-helpers | (installed) | `protectedMutation`/`protectedQuery`, `SessionIdArg`, `useSessionQuery`/`useSessionMutation` | Auth pattern for all protected endpoints |
| React 19 | ^19.2.0 | UI framework | Project frontend |
| React Router 7 | ^7.13.0 | Client-side routing, `useNavigate`, `useParams` | Route registration and navigation |
| Tailwind CSS 4 + shadcn/ui | ^4.1.18 | Styling + accessible components (Card, Badge, Button, Dialog, Tabs, Textarea) | Project UI standard |
| Sonner | (installed) | Toast notifications for approve/reject/void actions | Error/success feedback |
| Lucide React | (installed) | Icons (Shield, AlertTriangle, Clock, X, Check, Ban) | Project icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `convex/lib/journalEngine.ts` | N/A (internal) | `createJournalEntryWithLines`, `createReversalEntry`, `buildDebitLine`, `buildCreditLine` | Approval JE generation and void reversal |
| `convex/lib/counter.ts` | N/A (internal) | `getNextNumber` | Already used for EXP numbers; JE numbers generated by journalEngine |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Broadcast routing (query all submitted) | Assignment-based routing (assign to specific approver) | Broadcast is simpler, correct for 5-10 user team, requirements specify it |
| Inline fraud flags | Separate fraud dashboard | Inline is requirements-specified; dashboard is Phase 50 scope |

**Installation:** No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure
```
convex/expenses/
  helpers.ts           # Extended with DoA helpers (pure, testable)
  __tests__/
    helpers.test.ts    # Extended with DoA helper tests
  mutations.ts         # Extended with approveExpense, rejectExpense, voidExpense
  queries.ts           # Extended with listPendingForApproval, getRejectionChain; getById access relaxed
  constants.ts         # Extended with APPROVER_ROLES, DOA_ADMIN_ONLY_THRESHOLD, etc.

src/hooks/convex/
  useExpenses.ts       # Extended with approval queue hooks + mutation hooks

src/pages/
  ExpenseApproval.tsx  # New: Approval queue page
  ExpenseDetail.tsx    # New: Expense detail view (for approvers + submitters)

src/components/expenses/
  FraudFlags.tsx       # New: Fraud flag badges (duplicate, late, rejection count)
  ApprovalActions.tsx  # New: Approve/Reject/Void button group with DoA logic
  RejectionChain.tsx   # New: Rejection history timeline
```

### Pattern 1: Delegation of Authority (DoA) Pure Helper
**What:** Pure function that determines if a user can approve a specific expense.
**When to use:** Called in both `approveExpense` mutation (backend enforcement) and frontend (UI enable/disable).
**Example:**
```typescript
// convex/expenses/helpers.ts
export const DOA_ADMIN_ONLY_THRESHOLD = 500_000; // Rp 500K
export const COMMENT_REQUIRED_THRESHOLD = 500_000; // Rp 500K

export type ApproverRole = "manager" | "admin";
export const APPROVER_ROLES: ApproverRole[] = ["manager", "admin"];

export function canApproveExpense(
  userRole: string,
  expenseAmount: number,
  expenseSubmittedBy: string,
  userId: string
): { allowed: boolean; reason?: string } {
  // Self-approval always blocked (EXP-10)
  if (expenseSubmittedBy === userId) {
    return { allowed: false, reason: "Cannot approve your own expense" };
  }
  // High-value: admin only (EXP-09)
  if (expenseAmount > DOA_ADMIN_ONLY_THRESHOLD && userRole !== "admin") {
    return { allowed: false, reason: "Expenses over Rp 500,000 require Admin approval" };
  }
  // Standard: manager or admin (EXP-08)
  if (!APPROVER_ROLES.includes(userRole as ApproverRole)) {
    return { allowed: false, reason: "Only Manager or Admin can approve expenses" };
  }
  return { allowed: true };
}

export function requiresApproverComment(amount: number): boolean {
  return amount >= COMMENT_REQUIRED_THRESHOLD;
}
```

### Pattern 2: Atomic Approval with Journal Entry
**What:** `approveExpense` mutation that atomically transitions status AND creates a journal entry in a single Convex transaction.
**When to use:** On approval action.
**Example:**
```typescript
// convex/expenses/mutations.ts
export const approveExpense = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    expenseId: v.id("expenses"),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    if (expense.status !== "submitted") throw new Error("Expense is not pending approval");

    // DoA validation (calls pure helper)
    const doaResult = canApproveExpense(ctx.user.role, expense.amount, expense.submittedBy, ctx.user._id);
    if (!doaResult.allowed) throw new Error(doaResult.reason!);

    // EXP-11: Mandatory comment for >= 500K
    if (requiresApproverComment(expense.amount) && !args.comment?.trim()) {
      throw new Error("Comment is required for expenses >= Rp 500,000");
    }

    // Determine credit account: 1100 (Cash) for company_card, 2200 (Reimbursements Payable) for personal
    const creditAccountCode = expense.paymentMethod === "company_card" ? "1100" : "2200";
    const creditAccount = await ctx.db.query("accounts").withIndex("by_code", q => q.eq("code", creditAccountCode)).unique();
    if (!creditAccount) throw new Error(`Account ${creditAccountCode} not found`);

    // Create journal entry (EXP-12)
    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: expense.expenseDate,
      description: `Expense ${expense.expenseNumber}: ${expense.description}`,
      sourceType: "expense_approval",
      sourceId: expense._id,
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(expense.accountId, expense.amount, expense.description),
        buildCreditLine(creditAccount._id, expense.amount),
      ],
    });

    // Determine target status (EXP-14, EXP-15)
    const targetStatus = expense.paymentMethod === "company_card" ? "approved" : "awaiting_payment";

    await ctx.db.patch(args.expenseId, {
      status: targetStatus,
      approvedBy: ctx.user._id,
      approvedAt: Date.now(),
      approverComment: args.comment,
      journalEntryId,
    });

    await recordStatusChange(ctx, args.expenseId, "submitted", targetStatus, ctx.user._id, args.comment);
  },
});
```

### Pattern 3: Void with Reversing Journal Entry
**What:** `voidExpense` mutation that transitions to voided and creates a reversing JE.
**When to use:** Admin void action.
**Example:**
```typescript
// convex/expenses/mutations.ts
export const voidExpense = protectedMutation({
  roles: ["admin"],
  args: {
    expenseId: v.id("expenses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");

    // EXP-17: Cannot void reimbursed expenses
    if (expense.status === "reimbursed") {
      throw new Error("Cannot void a reimbursed expense. Void the reimbursement batch instead.");
    }

    // Cannot void already voided or draft expenses
    const VOIDABLE_STATUSES = ["submitted", "approved", "awaiting_payment", "rejected"];
    if (!VOIDABLE_STATUSES.includes(expense.status)) {
      throw new Error(`Cannot void expense with status '${expense.status}'`);
    }

    // If approved/awaiting_payment with journalEntryId, create reversing JE
    if (expense.journalEntryId) {
      await createReversalEntry(ctx, expense.journalEntryId, "expense_void", ctx.user._id);
    }

    await ctx.db.patch(args.expenseId, {
      status: "voided",
      voidedBy: ctx.user._id,
      voidedAt: Date.now(),
      voidReason: args.reason,
    });

    await recordStatusChange(ctx, args.expenseId, expense.status, "voided", ctx.user._id, args.reason);
  },
});
```

### Pattern 4: Rejection Chain Query
**What:** Walk the `previousExpenseId` chain to build rejection history for fraud display.
**When to use:** Approver views an expense that has been previously rejected and resubmitted.
**Example:**
```typescript
// convex/expenses/queries.ts
export const getRejectionChain = protectedQuery({
  roles: ["manager", "admin"],
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const chain: Array<{ expenseId: Id<"expenses">; rejectionReason?: string; rejectedAt?: number }> = [];
    let currentId: Id<"expenses"> | undefined = args.expenseId;
    const MAX_CHAIN = 20; // Safety limit

    while (currentId && chain.length < MAX_CHAIN) {
      const expense = await ctx.db.get(currentId);
      if (!expense) break;
      if (expense.previousExpenseId) {
        const prev = await ctx.db.get(expense.previousExpenseId);
        if (prev && prev.status === "rejected") {
          chain.push({
            expenseId: prev._id,
            rejectionReason: prev.rejectionReason,
            rejectedAt: prev.rejectedAt,
          });
        }
        currentId = expense.previousExpenseId;
      } else {
        break;
      }
    }
    return chain;
  },
});
```

### Pattern 5: Approval Queue Query (Broadcast Routing)
**What:** Query all submitted expenses visible to the current approver, excluding self-submitted.
**When to use:** Approval queue page.
**Example:**
```typescript
// convex/expenses/queries.ts
export const listPendingForApproval = protectedQuery({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    const pendingExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "submitted"))
      .collect();

    // Filter: exclude self-submitted (EXP-10 display-level)
    const eligible = pendingExpenses.filter(
      (e) => e.submittedBy !== ctx.user._id
    );

    // For managers: also filter out > 500K (EXP-09 display-level)
    const visible = ctx.user.role === "manager"
      ? eligible.filter((e) => e.amount <= DOA_ADMIN_ONLY_THRESHOLD)
      : eligible;

    // Sort by submittedAt ascending (oldest first -- FIFO queue)
    return visible.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
  },
});
```

### Anti-Patterns to Avoid
- **Hardcoding account IDs:** Never store or pass literal `Id<"accounts">` values for 1100/2200. Always look up by `by_code` index at runtime. Account IDs differ between dev and prod environments.
- **Double-write audit trail:** The `recordStatusChange` helper is internal to mutations.ts. Do NOT call it from queries or external helpers.
- **Frontend-only DoA enforcement:** Always enforce DoA at the backend mutation level. Frontend checks are for UX only (disable buttons) -- backend is the source of truth.
- **Polling for race conditions:** Convex is real-time. If Approver A acts on an expense, Approver B's query auto-updates. No optimistic locking or polling needed -- just guard `status === "submitted"` in the mutation.
- **Modifying approved expenses:** FRAUD-05 requires immutability. Never add a mutation that patches approved expense fields. The only valid operation on an approved expense is void.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Journal entry creation | Custom `ctx.db.insert("journalEntries", ...)` + lines | `createJournalEntryWithLines` from `convex/lib/journalEngine.ts` | Enforces balance validation, number generation, date denormalization (JE-01 through JE-06) |
| Journal entry reversal | Custom reversal logic | `createReversalEntry` from `convex/lib/journalEngine.ts` | Handles line fetching, swap, original marking, sourceId passthrough, void pairing validation |
| Auth wrappers | Custom `requireRole` calls | `protectedMutation` / `protectedQuery` from `convex/lib/functions.ts` | Handles session validation, role checking, `ctx.user` injection -- established project pattern |
| Mutation hooks with toast | Manual `useSessionMutation` + try/catch | `createMutationHook` factory from `src/hooks/convex/createMutationHook.ts` | Consistent error handling, toast patterns across the app |
| Sequential numbering | Custom counter logic | `getNextNumber(ctx, prefix)` from `convex/lib/counter.ts` | Atomic daily counter with MMDD-NNN format -- already used for EXP and JE numbers |

**Key insight:** The journal engine and auth infrastructure are the most critical pieces. Phase 42 built the engine specifically to be consumed by approval/void mutations. Using it correctly means passing `expense.expenseDate` as the JE `date` (business date, not `Date.now()`), using `expense._id` as `sourceId`, and `"expense_approval"` or `"expense_void"` as `sourceType`.

## Common Pitfalls

### Pitfall 1: Wrong Credit Account Selection
**What goes wrong:** Using 2200 (Employee Reimbursements Payable) for company card expenses, which should use 1100 (Cash).
**Why it happens:** The requirements distinguish payment methods -- personal payment creates a liability (2200), company card directly reduces cash (1100).
**How to avoid:** Branch on `expense.paymentMethod === "company_card"` to select "1100" vs "2200" credit account code. Look up by `by_code` index, never hardcode IDs.
**Warning signs:** Company card expenses showing up as reimbursement payables; cash account never debited for company card purchases.

### Pitfall 2: Self-Approval Race Condition
**What goes wrong:** Two users race to approve the same expense.
**Why it happens:** Broadcast routing means multiple approvers see the same expense.
**How to avoid:** In the `approveExpense` mutation, always re-check `expense.status === "submitted"` at execution time. Convex serializes mutations, so if Approver A acts first, Approver B's mutation sees the updated status and throws. This is correct behavior -- no additional locking needed.
**Warning signs:** Error messages about "Expense is not pending approval" -- this is expected and correct.

### Pitfall 3: Mixing Up >= vs > for Thresholds
**What goes wrong:** Comment requirement uses `>` instead of `>=` for the 500K threshold.
**Why it happens:** EXP-08/09 use `<=` and `>` for approval authority, but EXP-11 uses `>=` for mandatory comment.
**How to avoid:** Define constants: `DOA_ADMIN_ONLY_THRESHOLD = 500_000` (for DoA: `amount > threshold`), `COMMENT_REQUIRED_THRESHOLD = 500_000` (for comment: `amount >= threshold`). The numeric value is the same but the comparison operators differ: DoA is strict-greater, comment is greater-or-equal.
**Warning signs:** 500K expense approved without comment, or 500K expense requiring admin when manager should suffice.

### Pitfall 4: Journal Entry Date Using Date.now()
**What goes wrong:** JE posts to insertion time instead of business date.
**Why it happens:** Natural instinct to use `Date.now()` as the JE date.
**How to avoid:** Always use `expense.expenseDate` as the JE `date` parameter. This is the business date (when the expense occurred), not when it was approved. JE-03/JE-05 mandate business date usage.
**Warning signs:** JE entries dated on approval day rather than expense day; P&L period mismatch.

### Pitfall 5: Forgetting to Update getById Access
**What goes wrong:** Approvers cannot view expense details because `getById` only allows owner access (Phase 44 implementation).
**Why it happens:** Phase 44 scoped `getById` to owner-only with a comment "Phase 45 will extend access to approvers."
**How to avoid:** Relax `getById` to also allow manager/admin roles to view any expense (not just their own). Keep owner access for all roles.
**Warning signs:** Null return when manager/admin tries to view a pending expense they need to approve.

### Pitfall 6: Void of Unapproved Expenses With No JE
**What goes wrong:** `voidExpense` tries to create a reversing JE for an expense that was never approved (no `journalEntryId`).
**Why it happens:** Submitted or rejected expenses can be voided but have no JE to reverse.
**How to avoid:** Guard JE reversal behind `if (expense.journalEntryId)`. Only approved/awaiting_payment expenses have JEs.
**Warning signs:** "Original journal entry not found" error when voiding a submitted expense.

## Code Examples

### Account Lookup by Code (Runtime)
```typescript
// Pattern for looking up system accounts by code
async function getAccountByCode(ctx: MutationCtx, code: string): Promise<Id<"accounts">> {
  const account = await ctx.db
    .query("accounts")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!account) {
    throw new Error(`System account ${code} not found. Run accounts:seedDefaults.`);
  }
  return account._id;
}
```

### Rejection Chain Count Badge Pattern
```typescript
// Frontend: Show rejection count badge
function RejectionCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge variant="destructive" className="text-xs">
      {count}x rejected
    </Badge>
  );
}
```

### Fraud Flags Display Pattern
```typescript
// Frontend: Compact fraud flag row for approver view
function FraudFlags({ expense }: { expense: Expense }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {expense.duplicateWarning && (
        <Badge variant="outline" className="text-amber-600 border-amber-300">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Duplicate
        </Badge>
      )}
      {expense.lateSubmission && (
        <Badge variant="outline" className="text-amber-600 border-amber-300">
          <Clock className="h-3 w-3 mr-1" />
          Late ({">"}14 days)
        </Badge>
      )}
    </div>
  );
}
```

### Resubmission from Rejection
```typescript
// Frontend: Resubmit button navigates to create form with previousExpenseId
function handleResubmit(rejectedExpense: Expense) {
  // Navigate to create form, pre-filling from rejected expense
  navigate(`/expenses/new?resubmit=${rejectedExpense._id}`);
}

// In ExpenseSubmit.tsx, read resubmit param and set previousExpenseId
const resubmitId = searchParams.get("resubmit");
// Load rejected expense, pre-fill form fields, pass previousExpenseId to createDraft
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Token-based auth (requireRole) | Session-based auth (protectedMutation) | v1.6 / Phase 40 | All new mutations use protectedMutation, not raw requireRole |
| Manual JE insert | journalEngine helpers | v1.7 / Phase 42 | All JE creation goes through createJournalEntryWithLines (JE-06) |
| useQuery for protected endpoints | useSessionQuery | v1.7 / Phase 44 | protectedQuery requires sessionId auto-injection via useSessionQuery |

**Deprecated/outdated:**
- Direct `requireRole(ctx, args.token, roles)` calls: Use `protectedMutation` wrapper instead
- `useQuery` for protected endpoints: Use `useSessionQuery` from `convex-helpers/react/sessions`
- Manual journal entry creation: All JE must go through `createJournalEntryWithLines`

## Open Questions

1. **Manager visibility of > 500K expenses in queue**
   - What we know: Managers cannot APPROVE expenses > 500K (EXP-09), but the requirements don't explicitly say whether managers should SEE them in their queue.
   - Recommendation: Hide > 500K expenses from manager's queue (shown only to admins). A manager seeing an expense they cannot act on is confusing. If they need to view it for other reasons, they can use the "All Expenses" view (Phase 48).

2. **Rejection reason display to submitter**
   - What we know: FRAUD-04 shows rejection chain to approvers. The requirements also say rejected expenses can be revised and resubmitted (EXP-13).
   - Recommendation: Show the rejection reason to the submitter on their MyExpenses page so they know what to fix before resubmitting. This is implied by the workflow.

3. **Void of rejected expenses**
   - What we know: EXP-16 says "Admin can void any non-terminal expense." Rejected expenses are non-terminal (they can be resubmitted). But rejected expenses have no JE.
   - Recommendation: Allow void of rejected expenses (sets status to voided, prevents resubmission) but skip JE reversal since there's no JE to reverse.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run convex/expenses` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-08 | Manager can approve <= 500K | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Extend existing |
| EXP-09 | Only admin can approve > 500K | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Extend existing |
| EXP-10 | Self-approval blocked | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Extend existing |
| EXP-11 | Comment required >= 500K | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Extend existing |
| EXP-12 | JE auto-generated on approval | manual-only | N/A -- requires Convex runtime (ctx-dependent) | N/A |
| EXP-14 | Personal -> AwaitingPayment | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Extend existing |
| EXP-15 | Company card -> Approved terminal | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Extend existing |
| EXP-16 | Admin void with reversing JE | manual-only | N/A -- requires Convex runtime (ctx-dependent) | N/A |
| EXP-17 | Reimbursed block on void | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Extend existing |
| FRAUD-01 | Duplicate warning display | unit (existing) | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Already exists |
| FRAUD-04 | Rejection chain logic | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Extend existing |
| FRAUD-05 | Immutability guard | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Extend existing |

### Sampling Rate
- **Per task commit:** `npx vitest run convex/expenses`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. The `convex/expenses/__tests__/helpers.test.ts` file exists and will be extended with DoA helper tests. No new test files or framework config needed.

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` lines 1635-1691 -- expenses and expenseStatusHistory table schemas with all approval/void fields pre-defined
- `convex/lib/journalEngine.ts` -- complete journal engine with `createJournalEntryWithLines`, `createReversalEntry`, `buildDebitLine`, `buildCreditLine`
- `convex/expenses/mutations.ts` -- existing Phase 44 mutations (createDraft, updateDraft, submitExpense) with `recordStatusChange` helper
- `convex/expenses/queries.ts` -- existing Phase 44 queries (listMyExpenses, getById, getStatusHistory)
- `convex/expenses/helpers.ts` -- existing pure helpers (duplicate check, late submission, receipt validation)
- `convex/accounts/mutations.ts` lines 64-75 -- seed data confirms account codes 1100 (Cash) and 2200 (Employee Reimbursements Payable)
- `convex/lib/functions.ts` -- protectedMutation/protectedQuery wrappers with role-based auth
- `.planning/REQUIREMENTS.md` -- full requirement definitions for EXP-07 through EXP-17 and FRAUD-01 through FRAUD-05

### Secondary (MEDIUM confidence)
- Phase 44 RESEARCH.md and PLAN.md -- established patterns for expense module architecture

### Tertiary (LOW confidence)
- None -- all findings derived from direct codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing project dependencies
- Architecture: HIGH -- extends existing expense module with well-defined schema, uses established journalEngine helpers
- Pitfalls: HIGH -- all pitfalls identified from concrete code inspection (schema fields, mutation guards, JE date rules)
- DoA logic: HIGH -- requirements are explicit about thresholds (500K) and role rules (manager vs admin)
- Frontend patterns: HIGH -- follows existing page/component patterns (MyExpenses, ExpenseCard, StatusBadge)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- internal project patterns, no external API dependencies)

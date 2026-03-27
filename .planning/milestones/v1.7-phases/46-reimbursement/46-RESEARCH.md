# Phase 46: Reimbursement - Research

**Researched:** 2026-03-13
**Domain:** Reimbursement batch management, bank transfer tracking, company bank accounts (Convex backend + React frontend)
**Confidence:** HIGH

## Summary

Phase 46 is the final step in the expense accounting pipeline, building on Phases 43 (Chart of Accounts), 44 (Expense Submission), and 45 (Expense Approval & Void). It enables admin users to batch approved expenses by employee, confirm bank transfers with reference numbers, and track reimbursement history. The phase also includes company bank account management (CRUD) and optional user bank detail storage.

All schema tables needed are already defined in `convex/schema.ts`: `reimbursementBatches` (lines 1693-1717), `reimbursementBatchItems` (lines 1719-1725), and `bankAccounts` (lines 1765-1774). The `users` table already has `bankAccountNumber` and `bankName` optional fields (added in Phase 41). The counter helper already supports the "RMB" prefix for RMB-MMDD-NNN number generation. The journal engine already declares `"reimbursement"` and `"reimbursement_void"` as valid source types. Every infrastructure piece is in place -- this phase is purely assembly.

The core technical challenge is the atomic batch confirmation: when an admin confirms a reimbursement batch, the mutation must (1) create a journal entry (DR 2200 Accrued Expenses, CR 1100 Cash), (2) mark all linked expenses as "reimbursed" with audit trail entries, and (3) update the batch status -- all within a single Convex transaction. This follows the exact same pattern as `approveExpense` in Phase 45 but operates on multiple expenses at once.

**Primary recommendation:** Create `convex/reimbursements/` directory with queries.ts, mutations.ts, and helpers.ts. Create `convex/bankAccounts/` directory with queries.ts and mutations.ts. Extend `convex/auth/mutations.ts` with `updateBankDetails` for user self-service bank detail updates. Frontend: ReimbursementManager page (admin-only) with batch creation/confirmation workflow, BankAccountsManager page (admin-only, EntityManager pattern), and a small profile bank details section. Follow all existing patterns from Phase 44-45.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RMB-01 | Admin can view approved expenses grouped by employee with bank details and running totals | Query expenses with `status === "awaiting_payment"` via `by_status` index, group in memory by `submittedBy`, join users table for bank details (`bankAccountNumber`, `bankName`), compute running totals per employee |
| RMB-02 | Admin can create reimbursement batches (one per employee) with auto-generated RMB-MMDD-NNN number | `getNextNumber(ctx, "RMB")` for batch number; insert into `reimbursementBatches` with `status: "pending"`; insert `reimbursementBatchItems` linking selected expenses; update expense status to prevent double-batching |
| RMB-03 | Admin can confirm a batch by entering BCA reference number, transfer date, and source bank account | `confirmBatch` mutation: validate batch exists and is pending, validate bankAccountId references active `bankAccounts` record, patch batch with `bankReference`, `transferDate`, `bankAccountId`, `confirmedBy`, `confirmedAt`, `status: "confirmed"` |
| RMB-04 | Confirming a batch auto-generates a journal entry (DR 2200, CR 1100) and marks all linked expenses as Reimbursed | Atomic in `confirmBatch`: (1) `createJournalEntryWithLines(ctx, { sourceType: "reimbursement", lines: [buildDebitLine(acct2200, total), buildCreditLine(acct1100, total)] })`, (2) patch each linked expense `status: "reimbursed"` + write `recordStatusChange` audit trail, (3) store `journalEntryId` on batch |
| RMB-05 | Admin can void a confirmed batch with reason, generating a reversing journal entry and returning expenses to AwaitingPayment | `voidBatch` mutation: (1) `createReversalEntry(ctx, batch.journalEntryId, "reimbursement_void", ctx.user._id)`, (2) patch each linked expense back to `status: "awaiting_payment"` + clear reimbursement fields + write audit trail, (3) patch batch `status: "voided"` with void metadata |
| RMB-06 | Batch history is searchable by RMB code or BCA reference | Query with `by_batch_number` index for RMB code search; for BCA reference search, collect all batches and filter by `bankReference` (scan acceptable -- low volume table); frontend search input with debounce |
| RMB-07 | Admin can manage company bank accounts (name, bank, account number, active status) | New `convex/bankAccounts/` module with CRUD mutations using `protectedMutation({ roles: ["admin"] })`; list query with optional `activeOnly` filter via `by_active` index; EntityManager page pattern (matching AccountsManager from Phase 43) |
| RMB-08 | Users can optionally store their bank account details on their profile for reimbursement | New `updateBankDetails` mutation in `convex/auth/mutations.ts` using `protectedMutation({ roles: [...ALL_ROLES] })`; updates `bankAccountNumber` and `bankName` on user record; frontend: small card/form in user profile or on MyExpenses page |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend mutations/queries, real-time subscriptions | Project backend; atomic transactions for batch confirmation |
| convex-helpers | (installed) | `protectedMutation`/`protectedQuery`, `useSessionQuery`/`useSessionMutation` | Auth pattern for all protected endpoints |
| React 19 | ^19.2.0 | UI framework | Project frontend |
| React Router 7 | ^7.13.0 | Client-side routing | Route registration for new pages |
| Tailwind CSS 4 + shadcn/ui | ^4.1.18 | Styling + accessible components (Card, Badge, Button, Dialog, Tabs, Input) | Project UI standard |
| Sonner | (installed) | Toast notifications | Error/success feedback |
| Lucide React | (installed) | Icons (Banknote, Building2, CheckCircle, XCircle, Search) | Project icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `convex/lib/journalEngine.ts` | N/A (internal) | `createJournalEntryWithLines`, `createReversalEntry`, `buildDebitLine`, `buildCreditLine` | Batch confirmation JE generation and batch void reversal |
| `convex/lib/counter.ts` | N/A (internal) | `getNextNumber(ctx, "RMB")` | RMB-MMDD-NNN batch number generation |
| Vitest | ^4.0.18 | Unit tests for pure helpers | Testing batch validation logic |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One batch per employee (auto) | Multi-employee batches | Per-employee is simpler, matches bank transfer reality (one transfer per employee), reduces error risk |
| Scan for BCA reference search | New index on bankReference | Low-volume table (dozens of batches), scan is acceptable; index adds schema complexity for no benefit |
| EntityManager for bank accounts | Custom page | EntityManager is the established pattern for simple CRUD; no reason to deviate |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
convex/
  reimbursements/
    queries.ts          # listAwaitingPayment, listBatches, getBatchById, getBatchItems, searchBatches
    mutations.ts        # createBatch, confirmBatch, voidBatch
    helpers.ts          # Pure validation functions (validateBatchForConfirmation, etc.)
    __tests__/
      helpers.test.ts   # Unit tests for pure helpers
  bankAccounts/
    queries.ts          # list, getById
    mutations.ts        # create, update, remove
  auth/
    mutations.ts        # EXTEND: add updateBankDetails

src/
  hooks/convex/
    useReimbursements.ts  # Query + mutation hooks for reimbursement batches
    useBankAccounts.ts    # Query + mutation hooks for company bank accounts
  pages/
    ReimbursementManager.tsx  # Main reimbursement page: pending queue + batch history
    BankAccountsManager.tsx   # Company bank accounts CRUD (EntityManager pattern)
  components/
    reimbursements/
      BatchCard.tsx           # Batch summary card (number, employee, amount, status)
      ConfirmBatchDialog.tsx  # Dialog for entering BCA reference, date, source account
      PendingExpensesGroup.tsx # Grouped expenses by employee with select + batch creation
```

### Pattern 1: Atomic Batch Confirmation (Core Pattern)
**What:** Single Convex mutation that atomically creates a JE, marks all expenses as reimbursed, and confirms the batch.
**When to use:** On batch confirmation action.
**Why atomic:** Partial success (JE created but expenses not updated) would corrupt accounting state. Convex serializes mutations automatically.

```typescript
// convex/reimbursements/mutations.ts
export const confirmBatch = protectedMutation({
  roles: ["admin"],
  args: {
    batchId: v.id("reimbursementBatches"),
    bankAccountId: v.id("bankAccounts"),
    bankReference: v.string(),
    transferDate: v.number(),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Batch not found");
    if (batch.status !== "pending") throw new Error("Batch is not pending");

    // Validate bank account is active
    const bankAccount = await ctx.db.get(args.bankAccountId);
    if (!bankAccount || !bankAccount.isActive) {
      throw new Error("Bank account not found or inactive");
    }

    // Validate bank reference is non-empty
    if (!args.bankReference.trim()) {
      throw new Error("Bank reference number is required");
    }

    // Get linked expenses
    const batchItems = await ctx.db
      .query("reimbursementBatchItems")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();

    if (batchItems.length === 0) {
      throw new Error("Batch has no expenses");
    }

    // Look up accounts by code (never hardcode IDs)
    const accrued = await ctx.db.query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "2200")).unique();
    const cash = await ctx.db.query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "1100")).unique();
    if (!accrued || !cash) {
      throw new Error("System accounts 1100/2200 not found. Run accounts:seedDefaults.");
    }

    // Create journal entry: DR 2200 (Accrued Expenses), CR 1100 (Cash)
    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: args.transferDate,
      description: `Reimbursement ${batch.batchNumber}: bank transfer to employee`,
      sourceType: "reimbursement",
      sourceId: batch._id,
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(accrued._id, batch.totalAmount, `Reimburse ${batch.batchNumber}`),
        buildCreditLine(cash._id, batch.totalAmount),
      ],
    });

    // Mark all linked expenses as reimbursed
    for (const item of batchItems) {
      const expense = await ctx.db.get(item.expenseId);
      if (expense && expense.status === "awaiting_payment") {
        await ctx.db.patch(item.expenseId, { status: "reimbursed" });
        await recordStatusChange(ctx, item.expenseId, "awaiting_payment", "reimbursed", ctx.user._id, `Reimbursed via ${batch.batchNumber}`);
      }
    }

    // Confirm batch
    await ctx.db.patch(args.batchId, {
      status: "confirmed",
      bankAccountId: args.bankAccountId,
      bankReference: args.bankReference.trim(),
      transferDate: args.transferDate,
      confirmedBy: ctx.user._id,
      confirmedAt: Date.now(),
      journalEntryId,
    });
  },
});
```

### Pattern 2: Batch Void with Expense Reversion
**What:** Void a confirmed batch, creating a reversing JE and returning expenses to AwaitingPayment.
**When to use:** Admin needs to correct a reimbursement error.

```typescript
export const voidBatch = protectedMutation({
  roles: ["admin"],
  args: {
    batchId: v.id("reimbursementBatches"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Batch not found");
    if (batch.status !== "confirmed") throw new Error("Only confirmed batches can be voided");
    if (!args.reason.trim()) throw new Error("Void reason is required");

    // Create reversing JE
    if (batch.journalEntryId) {
      await createReversalEntry(ctx, batch.journalEntryId, "reimbursement_void", ctx.user._id);
    }

    // Return linked expenses to awaiting_payment
    const batchItems = await ctx.db
      .query("reimbursementBatchItems")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();

    for (const item of batchItems) {
      const expense = await ctx.db.get(item.expenseId);
      if (expense && expense.status === "reimbursed") {
        await ctx.db.patch(item.expenseId, { status: "awaiting_payment" });
        await recordStatusChange(ctx, item.expenseId, "reimbursed", "awaiting_payment", ctx.user._id, `Batch ${batch.batchNumber} voided: ${args.reason.trim()}`);
      }
    }

    // Void batch
    await ctx.db.patch(args.batchId, {
      status: "voided",
      voidedBy: ctx.user._id,
      voidedAt: Date.now(),
      voidReason: args.reason.trim(),
    });
  },
});
```

### Pattern 3: Grouped Expenses Query (Awaiting Payment)
**What:** Query all expenses in `awaiting_payment` status, grouped by employee with totals and bank details.
**When to use:** Admin views the reimbursement queue to decide which employees to batch.

```typescript
export const listAwaitingPayment = protectedQuery({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_payment"))
      .collect();

    // Group by employee
    const byEmployee = new Map<string, typeof expenses>();
    for (const e of expenses) {
      const key = e.submittedBy;
      const group = byEmployee.get(key) || [];
      group.push(e);
      byEmployee.set(key, group);
    }

    // Join user details
    const groups = [];
    for (const [userId, userExpenses] of byEmployee) {
      const user = await ctx.db.get(userId as Id<"users">);
      const total = userExpenses.reduce((sum, e) => sum + e.amount, 0);
      groups.push({
        userId,
        userName: user?.name ?? "Unknown",
        bankAccountNumber: user?.bankAccountNumber,
        bankName: user?.bankName,
        expenses: userExpenses.sort((a, b) => a.expenseDate - b.expenseDate),
        totalAmount: total,
        expenseCount: userExpenses.length,
      });
    }

    // Sort by total amount descending (largest first)
    return groups.sort((a, b) => b.totalAmount - a.totalAmount);
  },
});
```

### Pattern 4: Company Bank Accounts CRUD (EntityManager)
**What:** Simple CRUD for company bank accounts using the established EntityManager page pattern.
**When to use:** Admin manages source bank accounts for reimbursement transfers.
**Reference:** Exact same pattern as `AccountsManager.tsx` (Phase 43) and `LocationsManager.tsx`.

### Pattern 5: User Bank Details Self-Service
**What:** Any authenticated user can update their own bank details (bankAccountNumber, bankName) on their profile.
**When to use:** Employee wants to set/update their bank info for reimbursement.

```typescript
// convex/auth/mutations.ts (EXTEND -- add new mutation)
export const updateBankDetails = protectedMutation({
  roles: [...ALL_ROLES],
  args: {
    bankAccountNumber: v.optional(v.string()),
    bankName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.bankAccountNumber !== undefined) {
      patch.bankAccountNumber = args.bankAccountNumber.trim() || undefined;
    }
    if (args.bankName !== undefined) {
      patch.bankName = args.bankName.trim() || undefined;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(ctx.user._id, patch);
    }
  },
});
```

NOTE: The existing `updateUser` mutation in `convex/auth/mutations.ts` does NOT support bank fields. It uses raw `mutation` (not `protectedMutation`), and takes `userId` as an arg (admin editing another user). The new `updateBankDetails` should use `protectedMutation` so the user can only update their own bank details (via `ctx.user._id`).

### Anti-Patterns to Avoid
- **Hardcoding account IDs:** Always look up "1100" and "2200" by code via `by_code` index at runtime. Account IDs differ between dev and prod.
- **Double-batching:** Guard against the same expense appearing in multiple pending batches. Use `by_expense` index on `reimbursementBatchItems` to check if an expense is already in a pending batch before adding it.
- **Using Date.now() as JE date:** The JE date for batch confirmation should be `args.transferDate` (the actual bank transfer date), not `Date.now()`. This is the business date for accounting purposes.
- **Patching expenses that changed status:** In confirmBatch, always re-verify `expense.status === "awaiting_payment"` before patching. A concurrent void could have changed it.
- **Modifying batch items after creation:** Batch items should be immutable once the batch is created. If changes are needed, void the batch and create a new one.
- **Allowing non-admin access:** All reimbursement mutations and queries are admin-only (per PERM-03). Company bank accounts are also admin-only. Only bank details self-service is all-roles.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Journal entry creation | Custom `ctx.db.insert("journalEntries", ...)` | `createJournalEntryWithLines` from `convex/lib/journalEngine.ts` | Enforces balance validation, number generation, date denormalization (JE-01 through JE-06) |
| Journal entry reversal | Custom reversal logic | `createReversalEntry` from `convex/lib/journalEngine.ts` | Handles line fetching, swap, original marking, void pairing validation |
| Batch number generation | Manual counter | `getNextNumber(ctx, "RMB")` from `convex/lib/counter.ts` | Atomic via OCC, WIB timezone, RMB-MMDD-NNN format |
| Auth wrappers | `requireRole` with token | `protectedMutation` / `protectedQuery` from `convex/lib/functions.ts` | Session auto-injected, ctx.user auto-populated |
| Mutation hooks with toast | Manual `useSessionMutation` + try/catch | `createMutationHook` factory from `src/hooks/convex/createMutationHook.ts` | Consistent error handling across app |
| Bank accounts CRUD page | Custom form + list | `EntityManager` from `src/components/shared/EntityManager.tsx` | Established pattern for simple CRUD (matching AccountsManager, LocationsManager) |
| Expense status audit trail | Custom audit writes | Import `recordStatusChange` pattern from `convex/expenses/mutations.ts` | Consistent audit trail format; must be called on every status change |

**Key insight:** This phase re-uses EVERY infrastructure piece built in Phases 41-45. The journal engine, counter helper, auth wrappers, expense status management, and UI patterns are all proven. The implementation is purely assembly.

## Common Pitfalls

### Pitfall 1: Expense Already in Another Pending Batch
**What goes wrong:** An expense that is already included in one pending batch gets included in another, causing double reimbursement.
**Why it happens:** The `reimbursementBatchItems` table has no unique constraint on `expenseId` across pending batches.
**How to avoid:** In `createBatch`, before inserting batch items, query `reimbursementBatchItems` by each `expenseId` (using `by_expense` index), join to parent batch, and check if any batch with `status === "pending"` already includes this expense. Throw if found.
**Warning signs:** Two pending batches showing the same expense.

### Pitfall 2: Wrong JE Date for Batch Confirmation
**What goes wrong:** JE posts to `Date.now()` instead of `args.transferDate`, misaligning the accounting period.
**Why it happens:** Natural instinct to use creation time as JE date.
**How to avoid:** Always use `args.transferDate` as the JE `date` parameter. This is when the bank transfer happened -- the business date.
**Warning signs:** JE entries dated on confirmation click rather than actual transfer date.

### Pitfall 3: Audit Trail Missing for Expense Status Changes
**What goes wrong:** Expenses change status (awaiting_payment -> reimbursed, or reimbursed -> awaiting_payment on void) without audit trail records.
**Why it happens:** The `recordStatusChange` helper is internal to `expenses/mutations.ts` and not directly accessible from `reimbursements/mutations.ts`.
**How to avoid:** Either (a) extract `recordStatusChange` to a shared location (e.g., `convex/expenses/auditTrail.ts`), or (b) duplicate the pattern in reimbursements/mutations.ts, or (c) import the internal function from expenses/mutations.ts. Option (a) is cleanest -- extract to a shared file. NOTE: The `recordStatusChange` function in `convex/expenses/mutations.ts` is currently NOT exported. It must be exported or extracted.
**Warning signs:** Expense status history timeline shows gaps (jumps from awaiting_payment to reimbursed with no record).

### Pitfall 4: Void Batch But Expenses Not Reverted
**What goes wrong:** Batch is voided but linked expenses stay in "reimbursed" status.
**Why it happens:** Forgetting to iterate batch items and revert each expense.
**How to avoid:** `voidBatch` must (1) create reversing JE, (2) iterate ALL batch items and patch each expense back to "awaiting_payment" with audit trail, (3) void the batch record. All three steps are essential.
**Warning signs:** Voided batch but expenses still show "Reimbursed" status.

### Pitfall 5: Bank Account Deletion While Referenced by Batches
**What goes wrong:** Admin deletes a bank account that is referenced by confirmed batches, losing traceability.
**Why it happens:** No referential integrity check on deletion.
**How to avoid:** In `bankAccounts/mutations.ts` remove mutation, check if any `reimbursementBatches` reference this `bankAccountId` before allowing deletion. If referenced, throw "Cannot delete bank account referenced by reimbursement batches."
**Warning signs:** Batch detail shows null bank account.

### Pitfall 6: Missing recordStatusChange Export
**What goes wrong:** Cannot import `recordStatusChange` from `expenses/mutations.ts` because it is an internal (non-exported) function.
**Why it happens:** Phase 44 intentionally kept it internal to expenses. Phase 46 needs the same audit trail pattern for expense status changes triggered by reimbursement actions.
**How to avoid:** Extract `recordStatusChange` to `convex/expenses/auditTrail.ts` (or similar shared location) and export it. Update `expenses/mutations.ts` to import from the shared location. Then `reimbursements/mutations.ts` can also import it.
**Warning signs:** TypeScript import errors when trying to use `recordStatusChange` from `reimbursements/mutations.ts`.

## Code Examples

### Schema Tables (Already Defined -- Source of Truth)

```typescript
// Source: convex/schema.ts lines 1693-1725
// reimbursementBatches -- group approved expenses for bank transfer
reimbursementBatches: defineTable({
  batchNumber: v.string(),             // RMB-MMDD-NNN
  employeeUserId: v.id("users"),       // Employee being reimbursed
  totalAmount: v.number(),             // Sum of all linked expenses
  status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("voided")),
  bankAccountId: v.optional(v.id("bankAccounts")),  // Source bank account
  bankReference: v.optional(v.string()),             // BCA reference number
  transferDate: v.optional(v.number()),              // Transfer date
  confirmedBy: v.optional(v.id("users")),
  confirmedAt: v.optional(v.number()),
  voidedBy: v.optional(v.id("users")),
  voidedAt: v.optional(v.number()),
  voidReason: v.optional(v.string()),
  journalEntryId: v.optional(v.id("journalEntries")),
  createdBy: v.id("users"),
  createdAt: v.number(),
})
  .index("by_batch_number", ["batchNumber"])
  .index("by_employee_status", ["employeeUserId", "status"])
  .index("by_status", ["status"])

// reimbursementBatchItems -- link expenses to batches
reimbursementBatchItems: defineTable({
  batchId: v.id("reimbursementBatches"),
  expenseId: v.id("expenses"),
})
  .index("by_batch", ["batchId"])
  .index("by_expense", ["expenseId"])

// bankAccounts -- company bank accounts for reimbursement transfers
bankAccounts: defineTable({
  name: v.string(),            // Friendly name (e.g., "BCA Primary")
  bankName: v.string(),        // Bank name (e.g., "BCA")
  accountNumber: v.string(),   // Account number
  isActive: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
})
  .index("by_active", ["isActive"])
```

### User Bank Details (Already in Schema)

```typescript
// Source: convex/schema.ts lines 440-443
// Fields on users table (added in Phase 41)
bankAccountNumber: v.optional(v.string()),
bankName: v.optional(v.string()),
```

### Counter Helper for RMB Numbers

```typescript
// Source: convex/lib/counter.ts -- already supports "RMB" prefix
// Comment at top of file: "Used by: expenses (EXP), journal entries (JE), reimbursement batches (RMB)."
const batchNumber = await getNextNumber(ctx, "RMB");
// Returns: "RMB-0313-001", "RMB-0313-002", etc.
```

### Journal Engine Source Types (Already Registered)

```typescript
// Source: convex/lib/journalEngine.ts lines 33-40
export type JournalSourceType =
  | "expense_approval"
  | "expense_void"
  | "reimbursement"       // <-- Used by confirmBatch
  | "reimbursement_void"  // <-- Used by voidBatch
  | "payroll"
  | "payroll_void"
  | "manual";

// Source: convex/lib/journalEngine.ts lines 43-46
export type VoidSourceType = "expense_void" | "reimbursement_void" | "payroll_void";

// Source: convex/lib/journalEngine.ts lines 70-74
const VALID_VOID_PAIRS: Record<string, VoidSourceType> = {
  expense_approval: "expense_void",
  reimbursement: "reimbursement_void",  // <-- Pairing for batch void
  payroll: "payroll_void",
};
```

### Seeded Account Codes (From Phase 41)

```typescript
// Key accounts for reimbursement JE:
// "1100" = Cash & Cash Equivalents (CR on confirmation -- money goes out)
// "2200" = Employee Reimbursements Payable (DR on confirmation -- liability reduced)
// Both seeded by accounts:seedDefaults and confirmed present in schema
```

### Hook Pattern (Matching Phase 44/45)

```typescript
// src/hooks/convex/useReimbursements.ts
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import { createMutationHook } from "./createMutationHook";

export function useAwaitingPayment() {
  return useSessionQuery(api.reimbursements.queries.listAwaitingPayment, {});
}

export function useBatches(status?: "pending" | "confirmed" | "voided") {
  return useSessionQuery(api.reimbursements.queries.listBatches, status ? { status } : {});
}

export const useCreateBatch = createMutationHook(
  api.reimbursements.mutations.createBatch,
  { successMessage: "Batch created", errorMessage: "Failed to create batch" }
);

export const useConfirmBatch = createMutationHook(
  api.reimbursements.mutations.confirmBatch,
  { successMessage: "Batch confirmed", errorMessage: "Failed to confirm batch" }
);

export const useVoidBatch = createMutationHook(
  api.reimbursements.mutations.voidBatch,
  { successMessage: "Batch voided", errorMessage: "Failed to void batch" }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Token-based auth (`requireRole`) | Session-based auth (`protectedMutation`) | v1.6 / Phase 40 | All new mutations use protectedMutation |
| Manual JE insert | `createJournalEntryWithLines` | v1.7 / Phase 42 | All JE creation goes through single helper |
| `useQuery` for protected endpoints | `useSessionQuery` | v1.7 / Phase 44 | protectedQuery requires sessionId auto-injection |
| Raw `useMutation` + manual toast | `createMutationHook` factory | v1.7 / Phase 44 | Consistent error handling |

## Open Questions

1. **Create-and-Confirm vs Two-Step Flow**
   - What we know: The requirements describe a two-step process (RMB-02: create batch, RMB-03: confirm batch). This implies a pending state where the admin reviews before confirming.
   - Recommendation: Keep the two-step flow. Step 1: Admin selects expenses per employee and creates a pending batch. Step 2: Admin enters BCA reference, date, and source bank account to confirm. This mirrors real-world bank transfer workflows where you prepare then execute.

2. **Expense Selection UI**
   - What we know: RMB-01 says "grouped by employee with running totals." This implies the admin sees a grouped view and can create a batch for a specific employee.
   - Recommendation: Show a "select all" checkbox per employee group, plus individual expense checkboxes. The "Create Batch" button creates a batch for ONE employee with selected expenses. This matches RMB-02: "one per employee."

3. **Partial Employee Batching**
   - What we know: An employee might have 10 awaiting_payment expenses. Should the admin be forced to batch ALL of them, or can they select a subset?
   - Recommendation: Allow subset selection. The admin might want to batch only certain expenses (e.g., only this month's). The "select all" checkbox is a convenience, not a requirement.

4. **recordStatusChange Extraction**
   - What we know: The `recordStatusChange` function in `convex/expenses/mutations.ts` is not exported. Phase 46 needs it for expense status changes.
   - Recommendation: Extract to `convex/expenses/auditTrail.ts` and export. Update both `expenses/mutations.ts` and `reimbursements/mutations.ts` to import from the shared location. This is a minor refactor (move function, update import) with zero risk.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run convex/reimbursements` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RMB-01 | Grouped expenses by employee with totals | manual-only (ctx-dependent) | N/A | N/A |
| RMB-02 | Batch creation with RMB-MMDD-NNN number | manual-only (ctx-dependent) | N/A | N/A |
| RMB-03 | Batch confirmation with bank details | manual-only (ctx-dependent) | N/A | N/A |
| RMB-04 | Atomic JE creation + expense status update | manual-only (ctx-dependent) | N/A | N/A |
| RMB-05 | Batch void with reversing JE + expense reversion | manual-only (ctx-dependent) | N/A | N/A |
| RMB-06 | Batch search by RMB code or BCA reference | manual-only (ctx-dependent) | N/A | N/A |
| RMB-07 | Bank account CRUD | manual-only (ctx-dependent) | N/A | N/A |
| RMB-08 | User bank details self-service | manual-only (ctx-dependent) | N/A | N/A |

NOTE: Most reimbursement logic is ctx-dependent (requires database reads/writes for batch + expense + JE operations). Pure helper extraction opportunities are limited compared to Phase 44/45 because the batch workflow is inherently transactional. If any pure validation functions emerge during planning (e.g., `validateBankReference`, `validateTransferDate`), they should be tested.

### Sampling Rate
- **Per task commit:** `npm run type-check`
- **Per wave merge:** `npm run test -- --run` (full suite, no regressions)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `convex/reimbursements/helpers.ts` -- pure validation functions (if any emerge during planning)
- [ ] `convex/reimbursements/__tests__/helpers.test.ts` -- tests for pure helpers

*(Most logic is ctx-dependent. Pure function extraction limited but should be attempted for any validation that doesn't need database access.)*

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` lines 1693-1774 -- reimbursementBatches, reimbursementBatchItems, bankAccounts table definitions (verified in codebase)
- `convex/schema.ts` lines 424-445 -- users table with bankAccountNumber, bankName fields (verified in codebase)
- `convex/lib/journalEngine.ts` -- complete journal engine with reimbursement/reimbursement_void source types already registered (verified in codebase)
- `convex/lib/counter.ts` -- getNextNumber with "RMB" prefix support documented (verified in codebase)
- `convex/expenses/mutations.ts` -- complete expense mutations including recordStatusChange pattern, approveExpense/voidExpense JE patterns (verified in codebase)
- `convex/expenses/queries.ts` -- listPendingForApproval pattern with user name join and by_status index (verified in codebase)
- `convex/expenses/helpers.ts` -- pure helpers for expense validation (verified in codebase)
- `convex/expenses/constants.ts` -- ALL_ROLES, APPROVER_ROLES constants (verified in codebase)
- `convex/auth/mutations.ts` -- existing updateUser mutation structure, no bank field support (verified in codebase)
- `convex/lib/functions.ts` -- protectedMutation/protectedQuery wrappers (verified in codebase)
- `src/hooks/convex/useExpenses.ts` -- hook patterns with useSessionQuery and createMutationHook (verified in codebase)
- `src/hooks/convex/useAccounts.ts` -- EntityManager hook pattern (verified in codebase)
- `src/pages/AccountsManager.tsx` -- EntityManager page pattern (verified via plan reference)
- `.planning/REQUIREMENTS.md` -- RMB-01 through RMB-08 requirement definitions (verified in codebase)
- `.planning/ROADMAP.md` -- Phase 46 scope and dependencies (verified in codebase)

### Secondary (MEDIUM confidence)
- Phase 44-45 RESEARCH.md and PLAN.md files -- established patterns for expense module architecture
- `docs/plans/2026-03-01-income-statement-design.md` -- accounting pattern reference (JE structure, account codes)

### Tertiary (LOW confidence)
- None -- all findings derived from direct codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing project dependencies
- Architecture: HIGH -- extends existing expense pipeline with well-defined schema tables, uses proven journalEngine and counter helpers
- Pitfalls: HIGH -- all pitfalls identified from concrete code inspection (double-batching guard, JE date, audit trail extraction, referential integrity)
- Schema: HIGH -- all three tables (reimbursementBatches, reimbursementBatchItems, bankAccounts) already defined with indexes
- JE integration: HIGH -- journal engine already has "reimbursement" and "reimbursement_void" source types with proper void pairing

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- internal project patterns, no external API dependencies)

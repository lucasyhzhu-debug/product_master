# Architecture Patterns

**Domain:** Expense management and double-entry accounting integrated into existing Convex + React FMCG system
**Researched:** 2026-03-12
**Confidence:** HIGH -- based on direct inspection of existing codebase (65 tables, 150 indexes), design spec, and staff review findings

---

## Recommended Architecture

### High-Level Integration Diagram

```
                        EXISTING SYSTEM                          NEW SYSTEM
                   +-----------------------+              +-------------------------+
                   | externalRevenue       |              | accounts (CoA)          |
                   | consignmentSettlements|              | expenses                |
                   | BOM (menuProduct      |              | expenseStatusHistory    |
                   |   Components + CT)    |              | reimbursementBatches    |
                   +-----------+-----------+              | reimbursementBatchItems |
                               |                          | journalEntries          |
                               |                          | journalEntryLines       |
             Revenue + COGS    |                          | bankAccounts            |
             (virtual/real-    |     OpEx + Other          | payrollEntries          |
              time aggregation)|     (stored JE lines)    | counters                |
                               |                          +-----------+-------------+
                               v                                      |
                   +-----------+----------------------------------+   |
                   |          fetchAndAggregate()                  |   |
                   |  Revenue    COGS      OpEx       Other       |<--+
                   |  (4xxx)    (5xxx)    (6xxx)     (7xxx)       |
                   |  virtual   virtual   from JE    from JE     |
                   +--+-------------------------------------------+
                      |
                      v
                   P&L View (FinancialStatement.tsx)
                   Revenue -> COGS -> Gross Profit -> OpEx -> EBIT -> Net Income
```

### Integration Philosophy: Hybrid Real-Time + Stored

The existing P&L computes Revenue (4xxx) and COGS (5xxx) via real-time aggregation from `externalRevenue` + BOM tables. The new expense/accounting system introduces OpEx (6xxx) and Other (7xxx) as **stored journal entry lines**. This hybrid is correct because:

1. Revenue/COGS change frequently (every sale) and are already computed reactively
2. OpEx changes infrequently (a few expenses per week) and benefits from auditability via journal entries
3. The journal entry model provides an immutable audit trail required for accounting compliance

The P&L page becomes the single consumer that unifies both data sources.

---

## Component Boundaries

### New Backend Modules (Convex)

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `convex/accounts/` | CoA CRUD, seedDefaults | Schema only (reference data) |
| `convex/expenses/` | Expense CRUD, submission, approval, void | `accounts`, `users`, `journal/helpers`, `expenseStatusHistory`, `_storage` |
| `convex/reimbursements/` | Batch creation, confirmation, void | `expenses`, `journal/helpers`, `bankAccounts`, `users` |
| `convex/journal/` | Journal entry creation, reversal, period queries | `accounts`, `journalEntryLines`, `counters` |
| `convex/payroll/` | Payroll entry, void | `journal/helpers`, `users` |
| `convex/counters/` | Sequential ID generation (EXP, RMB, JE) | Self-contained |
| `convex/bankAccounts/` | Bank account CRUD | Schema only (reference data) |

### New Frontend Modules (React)

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `src/pages/ExpenseManager.tsx` | Expense submission, approval queue, audit view | `useExpenses` hook, `useProtectedMutation` |
| `src/pages/ReimbursementManager.tsx` | Batch creation, confirmation, void | `useReimbursements` hook |
| `src/pages/ExpenseAnalytics.tsx` | OpEx dashboards, trend charts | `useExpenseAnalytics` hook, Recharts (existing) |
| `src/hooks/convex/useExpenses.ts` | Expense queries + mutations | Convex API |
| `src/hooks/convex/useReimbursements.ts` | Reimbursement queries + mutations | Convex API |
| `src/hooks/convex/useExpenseAnalytics.ts` | Analytics aggregation queries | Convex API |
| `src/components/expenses/` | ExpenseForm, ExpenseCard, ApprovalQueue, FraudFlags | Shared UI components |
| `src/components/reimbursements/` | BatchCard, ConfirmationForm, BatchHistory | Shared UI components |

### Modified Existing Files

| File | Change | Risk |
|------|--------|------|
| `convex/schema.ts` | Add 10 new tables, 2 optional fields on `users` | LOW -- additive only |
| `convex/reports/incomeStatement.ts` | Extend `fetchAndAggregate` + `WeekData` with OpEx/Other | MEDIUM -- modifying hot path |
| `src/lib/types.ts` | Add 4 permission flags to `ROLE_PERMISSIONS` | LOW -- additive |
| `src/App.tsx` | Add 3 lazy routes + imports | LOW -- additive |
| `src/pages/HubPage.tsx` | Add "Finance" area card | LOW -- additive |
| `src/pages/FinancialStatement.tsx` | Render OpEx breakdown, EBIT, Net Income sections | MEDIUM -- extending existing UI |
| `src/hooks/convex/useFinancials.ts` | No change needed -- data flows through extended `WeekData` | NONE |
| `src/components/financials/` | May add new PLRow variants for OpEx | LOW |

---

## Data Flow

### Expense Lifecycle Data Flow

```
Employee submits expense
    |
    v
saveDraft mutation
    |--> expenses table (status: "draft")
    |
    v
submitExpense mutation
    |--> expenses table (status: "submitted")
    |--> expenseStatusHistory (draft -> submitted)
    |--> duplicate detection query (by_amount_date_submitter index)
    |--> receipt hash check (by_receipt_hash index)
    |
    v
approveExpense mutation (DoA-gated)
    |--> expenses table (status: "approved" or "awaiting_payment")
    |--> expenseStatusHistory (submitted -> approved/awaiting_payment)
    |--> journalEntries table (DR OpEx, CR 2200 or 1100)
    |--> journalEntryLines table (2 lines per entry)
    |--> counters table (JE counter increment)
    |
    v
createReimbursementBatch mutation
    |--> reimbursementBatches table
    |--> reimbursementBatchItems table (links)
    |--> counters table (RMB counter increment)
    |
    v
confirmReimbursement mutation
    |--> reimbursementBatches table (status: "confirmed")
    |--> expenses table (all linked: status -> "reimbursed")
    |--> journalEntries table (DR 2200, CR 1100)
    |--> journalEntryLines table (2 lines)
```

### P&L Query Data Flow (Extended)

```
fetchAndAggregate(ctx, periodStart, periodEnd, ...)
    |
    +--> [EXISTING] externalRevenue + items    --> Revenue (4xxx)
    +--> [EXISTING] consignmentSettlements      --> Consignment Revenue
    +--> [EXISTING] BOM (menuProductComponents  --> COGS (5xxx)
    |              + componentTypes)
    |
    +--> [NEW] journalEntryLines                --> OpEx (6xxx)
    |    .withIndex("by_entryDate",             --> Other (7xxx)
    |      q => q.gte(...).lt(...))
    |    + in-memory group by accountId
    |
    +--> [NEW] accounts table                   --> Account code/name lookup
    |
    v
    aggregateWeek() pure function
    |--> channels[], totals (existing)
    |--> opex[] array by account (NEW)
    |--> totalOpEx, ebit, netIncome (NEW)
```

---

## Critical Architecture Decisions

### Decision 1: Single-Query OpEx Aggregation (Addresses C2 + I1)

**Problem (from staff review C2):** The plan's `getOpExByPeriod` loops through 11 OpEx accounts, issuing one indexed query per account (N+1 pattern). With 14 accounts total (11 OpEx + 3 Other), this adds 14 sequential DB reads to the P&L query.

**Solution:** Add `by_entryDate` index on `journalEntryLines`. Fetch ALL journal lines in the period with a single indexed range scan, then group by `accountId` in memory.

```typescript
// GOOD: Single query, in-memory grouping
const allLines = await ctx.db
  .query("journalEntryLines")
  .withIndex("by_entryDate", (q) =>
    q.gte("entryDate", periodStart).lt("entryDate", periodEnd)
  )
  .collect();

// Build accountId -> { debitTotal, creditTotal } map
const accountTotals = new Map<string, { debits: number; credits: number }>();
for (const line of allLines) {
  const existing = accountTotals.get(line.accountId as string) ?? { debits: 0, credits: 0 };
  existing.debits += line.debitAmount;
  existing.credits += line.creditAmount;
  accountTotals.set(line.accountId as string, existing);
}
```

**Why this is correct:** At current scale (few expenses/payroll per week), the period scan returns ~20-200 lines. In-memory grouping is O(n) with negligible overhead. This pattern mirrors the existing `aggregateWeek` approach where revenue records are grouped by source in memory.

**Index cost:** 1 additional index. Total: 150 + 24 (new tables) = 174. Well under Convex per-table limit of 32.

### Decision 2: Reversal Date Policy (Addresses C1)

**Problem (from staff review C1):** The plan uses `Date.now()` for reversal journal entry dates. This posts reversals to the wrong accounting period.

**Solution:** Reversals MUST use the original entry's business date. This is the standard accounting practice ("same-period reversal").

```typescript
async function createReversingEntry(
  ctx: MutationCtx,
  originalEntry: Doc<"journalEntries">,
  sourceType: string,
  sourceId: string,
  userId: Id<"users">
): Promise<Id<"journalEntries">> {
  // Key: use original entry's date, NOT Date.now()
  const reversalDate = originalEntry.date;

  const reversalId = await createJournalEntryWithLines(ctx, {
    date: reversalDate,  // Same period as original
    description: `Reversal: ${originalEntry.description}`,
    sourceType,
    sourceId,
    createdBy: userId,
  }, reversedLines);

  // Mark original as reversed
  await ctx.db.patch(originalEntry._id, {
    isReversed: true,
    reversedByEntryId: reversalId,
  });

  return reversalId;
}
```

**Accounting policy:** "Reversals always post to the same period as the original entry." This ensures period-correct P&L. The `voidedAt` timestamp on the batch/expense record captures when the void action happened for audit purposes, but the accounting entry itself posts to the original period.

### Decision 3: Journal Entry Lines Denormalization -- Single Creation Path

**Problem:** Convex indexes cannot span tables. To query journal lines by date range, the date must be on the `journalEntryLines` table itself.

**Solution:** Denormalize `journalEntries.date` into `journalEntryLines.entryDate`. The architecture enforcement is:

1. The `createJournalEntryWithLines` helper is the ONLY code path that creates journal entry lines
2. This helper copies `date` to `entryDate` atomically
3. No direct `ctx.db.insert("journalEntryLines", ...)` calls outside this helper

```typescript
// convex/journal/helpers.ts -- single source of truth for JE creation
export async function createJournalEntryWithLines(
  ctx: MutationCtx,
  header: {
    date: number;
    description: string;
    sourceType: string;
    sourceId?: string;
    createdBy: Id<"users">;
  },
  lines: Array<{
    accountId: Id<"accounts">;
    debitAmount: number;
    creditAmount: number;
    description?: string;
  }>
): Promise<Id<"journalEntries">> {
  // Validate balance
  const totalDebits = lines.reduce((sum, l) => sum + l.debitAmount, 0);
  const totalCredits = lines.reduce((sum, l) => sum + l.creditAmount, 0);
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(
      `Journal entry unbalanced: debits=${totalDebits}, credits=${totalCredits}`
    );
  }

  const entryNumber = await getNextSequence(ctx, "JE");
  const entryId = await ctx.db.insert("journalEntries", {
    entryNumber,
    ...header,
    sourceId: header.sourceId,
    isReversed: false,
    createdAt: Date.now(),
  });

  for (const line of lines) {
    await ctx.db.insert("journalEntryLines", {
      journalEntryId: entryId,
      accountId: line.accountId,
      entryDate: header.date,  // CRITICAL: denormalized from parent
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
      description: line.description,
    });
  }

  return entryId;
}
```

### Decision 4: Accounts Table as Preloaded Lookup

The `accounts` table has 36 rows and changes extremely rarely (only when admin adds a custom GL account). For the P&L query, preload ALL accounts once and use an in-memory map for code/name lookups.

```typescript
// In fetchAndAggregate, add to Phase 1 parallel fetch:
const allAccounts = await ctx.db.query("accounts").collect();
const accountMap = new Map(allAccounts.map(a => [a._id as string, a]));
```

This adds exactly 1 DB read (36 docs) to the parallel fetch phase. No additional round trips.

### Decision 5: System Account Constants -- No Hardcoded IDs

Define system account codes as constants, then look up by code at runtime via the `by_code` index:

```typescript
// convex/journal/constants.ts
export const SYSTEM_ACCOUNTS = {
  CASH: "1100",
  REIMBURSEMENTS_PAYABLE: "2200",
  SALARIES: "6100",
} as const;

// In mutations:
async function getSystemAccount(
  ctx: MutationCtx,
  code: string
): Promise<Doc<"accounts">> {
  const account = await ctx.db
    .query("accounts")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!account) {
    throw new Error(
      `System account ${code} not found. Run accounts:seedDefaults first.`
    );
  }
  return account;
}
```

This provides actionable error messages when `seedDefaults` hasn't been run (addresses staff review I6).

---

## Patterns to Follow

### Pattern 1: Consistent Auth via requireRole + useProtectedMutation

**What:** All expense/reimbursement/payroll mutations use `requireRole()` from `convex/lib/auth.ts`. Frontend uses `useProtectedMutation()` to auto-inject tokens.

**Why:** Established pattern across 30+ mutations in the codebase. Deviation would be inconsistent.

**Example:**
```typescript
// Backend
export const approve = mutation({
  args: {
    token: v.string(),
    expenseId: v.id("expenses"),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    // Self-approval check
    const expense = await ctx.db.get(args.expenseId);
    if (expense?.submittedBy === user._id) {
      throw new Error("Cannot approve own expense");
    }
    // DoA check
    if (expense!.amount > 500000 && user.role !== "admin") {
      throw new Error("Amount exceeds your approval authority");
    }
    // ...
  },
});

// Frontend
const approve = useProtectedMutation(api.expenses.mutations.approve);
await approve({ expenseId, comment });
```

### Pattern 2: File Upload via generateUploadUrl + Client SHA-256

**What:** Receipt upload follows the existing feedback/grabfood pattern: mutation returns upload URL, client uploads file, then passes `storageId` to the save mutation.

**Why:** Existing pattern in `convex/feedback/mutations.ts` and `convex/grabfoodMenu/mutations.ts`.

**Frontend flow:**
```typescript
// 1. Generate upload URL (requires auth)
const generateUrl = useProtectedMutation(api.expenses.mutations.generateUploadUrl);
const url = await generateUrl({});

// 2. Upload file
const result = await fetch(url, { method: "POST", body: file });
const { storageId } = await result.json();

// 3. Compute SHA-256 client-side
const buffer = await file.arrayBuffer();
const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
const hashHex = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, "0")).join("");

// 4. Pass to mutation
await saveDraft({ ...fields, receiptFileId: storageId, receiptImageHash: hashHex });
```

### Pattern 3: Status History as Immutable Append-Only Log

**What:** Every expense status transition creates an `expenseStatusHistory` record. Mirrors the order audit trail pattern.

**Why:** Financial operations require complete audit trails. The append-only pattern ensures no history rewriting.

### Pattern 4: Counter Table for Sequential IDs

**What:** The `counters` table generates sequential IDs (EXP-MMDD-NNN, RMB-MMDD-NNN, JE-MMDD-NNN) using atomic mutation increment. Matches the existing `orderNumber` format (MMDD-NNN).

**Why:** Convex mutation serialization prevents race conditions. The counter table is small (~3 rows/day) and bounded.

### Pattern 5: Lazy Route Loading with Permission Gates

**What:** New pages use `lazyWithPreload()` + `ProtectedRoute` with `requiredPermission`, matching all 21 existing routes in `App.tsx`.

**Note:** `canSubmitExpenses` is granted to ALL roles (kitchen, order_staff, manager, admin). The page itself renders different tabs based on role (all see "My Expenses", manager/admin see "Approvals", admin sees "All Expenses").

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: N+1 Journal Line Queries

**What:** Querying journal lines per-account inside a loop.
**Why bad:** 14 sequential DB reads instead of 1. Scales linearly with number of GL accounts.
**Instead:** Single `by_entryDate` range query + in-memory grouping (see Decision 1).

### Anti-Pattern 2: Direct journalEntryLines Insertion

**What:** Creating journal entry lines outside the `createJournalEntryWithLines` helper.
**Why bad:** Risks `entryDate` denormalization drift and unbalanced entries.
**Instead:** All JE creation goes through the single helper function that validates balance and copies date.

### Anti-Pattern 3: Using Date.now() for Reversal Business Dates

**What:** Stamping reversals with the current timestamp instead of the original entry's business date.
**Why bad:** Moves the reversal to a different accounting period, corrupting P&L for both periods.
**Instead:** Copy the original entry's `date` to the reversal (see Decision 2).

### Anti-Pattern 4: Separate OpEx Queries Outside fetchAndAggregate

**What:** Creating a standalone `getOpExByPeriod` query function that the frontend calls independently.
**Why bad:** Two reactive queries for the same page means inconsistent data during transition states. The P&L should be a single atomic view.
**Instead:** Extend `fetchAndAggregate` to include OpEx data in the same query. The frontend receives a single consistent snapshot.

### Anti-Pattern 5: Hardcoding Account IDs

**What:** Using string literals like `"2200"` or `"1100"` scattered across mutations.
**Why bad:** If account codes change, every reference breaks.
**Instead:** Define system account codes as constants and look up by code at runtime (see Decision 5).

---

## Schema Integration Details

### New Tables: Index Budget

| Table | Indexes | Notes |
|-------|---------|-------|
| `accounts` | 3 (by_code, by_type, by_active_type) | 36 seeded rows, rarely changes |
| `expenses` | 5 (by_submitter_status, by_status, by_amount_date_submitter, by_receipt_hash, by_expense_number) | Highest index count; all justified by query patterns |
| `expenseStatusHistory` | 1 (by_expense) | Append-only audit log |
| `reimbursementBatches` | 3 (by_batch_number, by_employee_status, by_status) | |
| `reimbursementBatchItems` | 2 (by_batch, by_expense) | Junction table |
| `journalEntries` | 3 (by_entry_number, by_source, by_date) | |
| `journalEntryLines` | 3 (by_journal_entry, by_account_entryDate, **by_entryDate**) | by_entryDate is the C2/I1 fix |
| `bankAccounts` | 1 (by_active) | Simple reference table |
| `payrollEntries` | 2 (by_period, by_employee_type) | |
| `counters` | 1 (by_prefix_date) | Atomic counter, ~3 rows/day |

**Total new indexes: 24** (including the recommended `by_entryDate`)
**New total: 150 + 24 = 174 indexes across 75 tables**

Per-table maximums: `expenses` has 5 (highest), well under Convex limit of 32 per table. No risk.

### Modified Table: users

```typescript
// Add 2 optional fields (non-breaking)
users: defineTable({
  // ...existing fields...
  bankAccountNumber: v.optional(v.string()),  // NEW: for reimbursement payments
  bankName: v.optional(v.string()),           // NEW: bank name (BCA, Mandiri, etc.)
})
```

This is safe: `v.optional()` means existing documents need no migration.

### Schema Migration Risk: NONE

Adding 10 new tables and 2 new optional fields to `users` is a Convex-safe operation:
- New tables: created on deploy with no data migration needed
- New optional fields on `users`: safe because `v.optional()` means existing documents need no migration
- No fields removed, no fields changed type

**Deployment sequence:** Push schema first (`npx convex deploy`), then run `accounts:seedDefaults` from dashboard, then deploy frontend.

---

## P&L Integration Architecture

### How OpEx Data Enters fetchAndAggregate

The existing `fetchAndAggregate` function in `convex/reports/incomeStatement.ts` follows a pattern: parallel fetch, then pure computation. The extension adds two more parallel fetches:

```typescript
async function fetchAndAggregate(ctx, currentStart, currentEnd, previousStart, previousEnd) {
  // Phase 1: Parallel fetch of all base data
  const [
    currentRevenue,      // EXISTING
    previousRevenue,     // EXISTING
    currentConsignments, // EXISTING
    previousConsignments,// EXISTING
    bomComponents,       // EXISTING
    allComponentTypes,   // EXISTING
    allAccounts,         // NEW -- 36 rows, tiny
    currentJournalLines, // NEW -- single indexed query
    previousJournalLines,// NEW -- single indexed query
  ] = await Promise.all([
    // ...existing 6 queries unchanged...
    ctx.db.query("accounts").collect(),
    ctx.db.query("journalEntryLines")
      .withIndex("by_entryDate", q => q.gte("entryDate", currentStart).lt("entryDate", currentEnd))
      .collect(),
    ctx.db.query("journalEntryLines")
      .withIndex("by_entryDate", q => q.gte("entryDate", previousStart).lt("entryDate", previousEnd))
      .collect(),
  ]);

  // ...existing Phase 2 + Phase 3 unchanged...

  // Phase 4: Build account lookup map
  const accountMap = new Map(allAccounts.map(a => [a._id as string, a]));

  // Phase 5: Aggregate OpEx from journal lines (pure function)
  const currentOpEx = aggregateJournalLines(currentJournalLines, accountMap, "opex");
  const previousOpEx = aggregateJournalLines(previousJournalLines, accountMap, "opex");
  const currentOther = aggregateJournalLines(currentJournalLines, accountMap, "other");
  const previousOther = aggregateJournalLines(previousJournalLines, accountMap, "other");

  // Pass to aggregateWeek (pure) -- extended with new fields
  // ...
}

// Pure helper: group journal lines by account, filter by type
function aggregateJournalLines(
  lines: Doc<"journalEntryLines">[],
  accountMap: Map<string, Doc<"accounts">>,
  accountType: string
): Array<{ code: string; name: string; total: number }> {
  const totals = new Map<string, { code: string; name: string; debits: number; credits: number }>();

  for (const line of lines) {
    const account = accountMap.get(line.accountId as string);
    if (!account || account.type !== accountType) continue;

    const existing = totals.get(account.code) ?? {
      code: account.code,
      name: account.name,
      debits: 0,
      credits: 0,
    };
    existing.debits += line.debitAmount;
    existing.credits += line.creditAmount;
    totals.set(account.code, existing);
  }

  // For expense accounts (6xxx, 7xxx), net = debits - credits
  // (Normal balance for expenses is debit; reversals are credits)
  return Array.from(totals.values())
    .map(t => ({ code: t.code, name: t.name, total: t.debits - t.credits }))
    .filter(t => t.total !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
}
```

### WeekData Type Extension

```typescript
interface WeekData {
  // ...existing fields unchanged...
  channels: ChannelData[];
  totalGross: number;
  // ... 10 more existing fields ...
  grossProfit: number;
  grossMarginPercent: number | null;
  gapAnalysis: GapAnalysis;

  // NEW fields below Gross Profit
  opex: Array<{ code: string; name: string; total: number }>;
  totalOpEx: number;
  ebit: number;
  ebitMarginPercent: number | null;
  otherIncome: Array<{ code: string; name: string; total: number }>;
  totalOtherIncome: number;
  netIncome: number;
  netMarginPercent: number | null;
}
```

This is a **non-breaking extension** -- existing fields remain unchanged, new fields are added. The existing `FinancialStatement.tsx` frontend ignores unknown fields until the rendering code is added.

### Query Performance Impact

The existing `fetchAndAggregate` issues ~10 parallel reads. Adding OpEx adds 3 more to the parallel batch (accounts + 2 journal line period queries). Total parallel batch: 13 queries. Since these run in parallel via `Promise.all`, the wall-clock time increase is minimal (bounded by the slowest query, which remains the revenue/BOM queries). The journal line queries are indexed and return small result sets at current scale.

---

## Real-Time Subscription Analysis

### New Reactive Queries

| Query | Subscribers | Table Dependencies | Re-fire Frequency |
|-------|-------------|-------------------|-------------------|
| `expenses.listMyExpenses` | 1-5 users | `expenses` | On own expense change |
| `expenses.listPendingApprovals` | 1-2 managers/admins | `expenses` (status = submitted) | On any submission |
| `expenses.listAllExpenses` | 1 admin | `expenses` | On any expense change |
| `reports.incomeStatement.*` (extended) | 1-2 admins on /financials | `journalEntryLines`, `accounts` + existing | On JE creation (rare) |
| `reimbursements.listPending` | 1 admin | `expenses`, `reimbursementBatches` | On batch/expense change |

**Assessment:** At 5-10 concurrent users, this adds negligible subscription load. The P&L extension adds dependency on `journalEntryLines`, but JE creation is rare (tied to expense approval, which happens a few times per week).

**No real-time subscription risk at current scale.**

---

## Build Order (Convex Deploy Sequence)

The build order must respect three constraints:
1. Schema deploys before mutations that reference new tables
2. Seed data (accounts) deploys before mutations that look up system accounts
3. Frontend deploys after backend APIs are available

### Recommended Phase Structure

```
Phase 1: Schema + Seed + Counters          [Foundation]
  - Add 10 tables + 2 user fields to schema.ts
  - Deploy schema (npx convex deploy)
  - Implement accounts:seedDefaults mutation
  - Deploy and run seedDefaults from dashboard
  - Implement counters helper (sequential ID generation)
  - Tests: counter generation, account seeding

Phase 2: Journal Engine                    [Core Accounting]
  - createJournalEntryWithLines helper
  - createReversingEntry helper
  - System account lookup helper
  - Journal queries (by_entryDate single-query pattern)
  - Tests: balance validation, denormalization, reversal date policy

Phase 3: Expense Lifecycle                 [Main Feature]
  - Expense CRUD mutations (draft, submit, approve, reject, void)
  - Status transition guards (canTransition map)
  - expenseStatusHistory writes
  - Duplicate detection + receipt hash dedup
  - DoA routing logic
  - Self-approval blocking
  - Auto JE generation on approval (company_card vs personal)
  - Receipt upload generateUploadUrl
  - Tests: ~20 tests covering all transitions, DoA, fraud controls

Phase 4: Reimbursement + Payroll           [PARALLEL pair]
  4A: Reimbursement
    - Batch create, confirm, void mutations
    - Batch -> expense linking
    - JE generation on confirm/void
    - Tests: batch integrity, linked expense status
  4B: Payroll
    - Entry create, void mutations
    - JE generation (DR 6100, CR 1100)
    - Tests: payroll JE generation, void reversal

Phase 5: Frontend Foundation               [SEQUENTIAL]
  Step 1: Permissions
    - Add 4 permissions to ROLE_PERMISSIONS in types.ts
    - canSubmitExpenses (all roles)
    - canApproveExpenses (manager, admin)
    - canManageReimbursements (admin)
    - canAccessExpenseAnalytics (manager, admin)
  Step 2 (after Step 1): Hooks + Routes
    - Create hooks (useExpenses, useReimbursements, useExpenseAnalytics)
    - Add lazy routes to App.tsx
    - Add "Finance" card to HubPage

Phase 6: Frontend Pages                    [PARALLEL trio]
  6A: ExpenseManager page
    - Submit form with receipt upload + SHA-256 hashing
    - My Expenses list with status filters
    - Approval queue with fraud flags
    - Approve/Reject actions
  6B: ReimbursementManager page
    - Batch view grouped by employee
    - Confirmation form (bank ref, date, source bank)
    - Batch history with void action
  6C: ExpenseAnalytics page
    - Total OpEx card
    - Spend by Category (PieChart)
    - Monthly Trend (LineChart)
    - Spend by Employee (BarChart)

Phase 7: P&L Integration + Verification    [Final]
  - Extend fetchAndAggregate with OpEx/Other aggregation
  - Extend WeekData type
  - Extend FinancialStatement.tsx to render OpEx -> EBIT -> Net Income
  - Extend deltas for new totals
  - Integration tests: OpEx flows through P&L correctly
  - npm run build verification
```

### Why This Order

1. **Schema first** -- mandatory for Convex: mutations can't reference undefined tables
2. **Journal engine before expenses** -- expense approval creates JEs; the helper must exist
3. **Counters before expenses** -- expense submission generates EXP-MMDD-NNN
4. **Reimbursement and payroll are parallel** -- independent modules both consuming the journal helper
5. **Permissions before hooks/routes** (addresses staff review I3) -- route guards reference permission names that must exist in the type
6. **P&L integration last** -- depends on all data flowing correctly through the journal system; requires end-to-end verification

---

## Scalability Considerations

| Concern | At current scale (~5 users) | At 50 users | At 500+ users |
|---------|---------------------------|-------------|---------------|
| Journal lines per P&L query | ~20-200 lines/period | ~500-2000 | Consider snapshot/cache table |
| Expense approval latency | Negligible (< 100ms) | Negligible | Negligible (indexed queries) |
| Counter contention | None (3 rows/day) | Minimal | Consider UUID-based IDs |
| Receipt storage | ~20 files/month | ~200 files/month | Add retention policy |
| Subscription fan-out | 1-2 P&L subscribers | 5-10 | Consider on-demand queries |

At Frollie's current and projected scale (5-10 users, SME operation), none of these are concerns. The architecture is correct for 10x growth without changes.

---

## Staff Review Findings: Architectural Resolution

| Finding | ID | Resolution |
|---------|-----|-----------|
| Reversal JE uses Date.now() | C1 | Decision 2: Use original entry's business date |
| N+1 query in getOpExByPeriod | C2 | Decision 1: Add by_entryDate index, single query + in-memory grouping |
| Should-Have fraud controls missing | C3 | Defer to future phase. Remove phantom UI badges until backend exists. |
| canTransition approved->voided edge case | C4 | Add comment: "only reachable for company_card" |
| Missing by_entryDate index | I1 | Included in Decision 1. Total indexes: 174. |
| Wave 4 parallelism invalid | I3 | Phase 5 made sequential: permissions first, then hooks+routes |
| Receipt upload flow missing | I5 | Pattern 2 documents the complete 4-step flow |
| seedDefaults deployment step | I6 | Decision 5 provides actionable error message |

---

## Sources

- `convex/schema.ts`: 65 tables, 150 indexes (verified via grep count)
- `convex/reports/incomeStatement.ts`: existing `fetchAndAggregate` pattern (direct inspection)
- `convex/lib/auth.ts`: requireRole pattern (direct inspection)
- `convex/feedback/mutations.ts`: generateUploadUrl pattern (direct inspection)
- `convex/grabfoodMenu/mutations.ts`: authenticated generateUploadUrl pattern (direct inspection)
- `src/lib/types.ts`: ROLE_PERMISSIONS structure (direct inspection)
- `src/App.tsx`: route structure with ProtectedRoute (direct inspection)
- `src/pages/HubPage.tsx`: HUB_AREAS card pattern (direct inspection)
- `src/hooks/convex/useFinancials.ts`: P&L data flow (direct inspection)
- Staff review: `docs/reviews/staffreview-expense-accounting-plan-2026-03-12.md`
- Design spec: `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md`

---

*Architecture research for: Frollie Recipe Master v1.7 -- Expense & Accounting*
*Researched: 2026-03-12*

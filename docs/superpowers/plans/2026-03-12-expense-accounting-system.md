# Expense & Accounting System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end employee expense management system with Chart of Accounts, double-entry journal entries, approval workflows, reimbursement batching, and P&L extension.

**Architecture:** 10 new Convex tables + 2 user table fields. Backend split into 7 new directories under `convex/`. Frontend adds 3 new pages + extends existing Financial Statement page. All mutations auto-generate balanced journal entries. TDD throughout.

**Tech Stack:** Convex ^1.31.7, React 19, TypeScript ~5.9, Vite, Tailwind CSS + shadcn/ui, Recharts (already installed), Vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md`

**Spec addenda (implementation decisions not in original spec):**
- `payrollEntries` table adds `status` (active/voided), `voidedBy`, `voidedAt` fields to support the void behavior described in spec
- `journalSourceType` adds `"payroll_void"` to distinguish payroll reversals from other reversal types
- `rejected` status is terminal for the original expense; resubmission always creates a new expense record

---

## Git Workflow

**Branch:** `feature/expense-accounting`
**Base:** `main` (after `git switch main && git pull`)
**Checkpoints:** Commit after each task. Merge to main after full verification.

## File Structure

### New Backend Files (convex/)

| File | Responsibility |
|------|---------------|
| `convex/accounts/mutations.ts` | CoA CRUD + seedDefaults |
| `convex/accounts/queries.ts` | List/get accounts, filtered by type/active |
| `convex/expenses/mutations.ts` | Expense CRUD, submit, approve, reject, void |
| `convex/expenses/queries.ts` | List own expenses, approval queue, all expenses (admin), duplicate detection |
| `convex/expenses/helpers.ts` | Pure functions: ID generation, DoA eligibility, duplicate check, receipt validation |
| `convex/reimbursements/mutations.ts` | Batch creation, confirmation, void |
| `convex/reimbursements/queries.ts` | Pending queue (grouped by employee), batch history |
| `convex/journal/mutations.ts` | Journal entry creation (internal — called by expense/reimbursement mutations) |
| `convex/journal/queries.ts` | GL balance by account+period, entry listing |
| `convex/payroll/mutations.ts` | Payroll entry creation, void |
| `convex/payroll/queries.ts` | Payroll listing by period |
| `convex/bankAccounts/mutations.ts` | Bank account CRUD |
| `convex/bankAccounts/queries.ts` | List active bank accounts |
| `convex/counters/helpers.ts` | Sequential ID generation (EXP-MMDD-NNN, RMB-MMDD-NNN, JE-MMDD-NNN) |

### New Frontend Files (src/)

| File | Responsibility |
|------|---------------|
| `src/pages/ExpenseManager.tsx` | Expense submission, my expenses, approval queue, admin audit view |
| `src/pages/ReimbursementManager.tsx` | Batch creation, confirmation, history (admin only) |
| `src/pages/ExpenseAnalytics.tsx` | OpEx dashboards with Recharts |
| `src/hooks/convex/useExpenses.ts` | Expense queries/mutations hook |
| `src/hooks/convex/useReimbursements.ts` | Reimbursement queries/mutations hook |
| `src/hooks/convex/useAccounts.ts` | Chart of Accounts hook |
| `src/hooks/convex/usePayroll.ts` | Payroll hook |
| `src/hooks/convex/useJournal.ts` | Journal entry queries hook |
| `src/components/expenses/ExpenseForm.tsx` | Expense submission/edit form |
| `src/components/expenses/ExpenseCard.tsx` | Expandable expense card for approval queue |
| `src/components/expenses/StatusBadge.tsx` | Expense status badge with colors |
| `src/components/expenses/FraudFlags.tsx` | Fraud flag indicators (late, duplicate, new vendor, split) |
| `src/components/reimbursements/BatchCard.tsx` | Reimbursement batch card |
| `src/components/reimbursements/ConfirmationForm.tsx` | Bank transfer confirmation form |

### Modified Files

| File | Changes |
|------|---------|
| `convex/schema.ts` | Add 10 new tables + 2 fields on `users` |
| `src/lib/types.ts` | Add 4 new permission flags to ROLE_PERMISSIONS |
| `src/App.tsx` | Add 3 new routes |
| `src/hooks/convex/index.ts` | Re-export new hooks |
| `src/pages/FinancialStatement.tsx` | Extend P&L below Gross Profit with OpEx section |
| `src/hooks/convex/useFinancials.ts` | Add OpEx data fetching |
| `convex/reports/incomeStatement.ts` | Add OpEx aggregation from journal entries |
| `src/components/auth/ProtectedRoute.tsx` | Add new permission types (if needed) |

### New Test Files

| File | Scope |
|------|-------|
| `tests/convex/expenses.test.ts` | Expense submission, validation, duplicate detection, receipt rules |
| `tests/convex/expenseApproval.test.ts` | DoA routing, self-approval block, concurrency, journal entries |
| `tests/convex/reimbursements.test.ts` | Batching, confirmation, void, journal entries |
| `tests/convex/payroll.test.ts` | Payroll creation, void, journal entries |
| `tests/convex/journalIntegrity.test.ts` | Debit=credit balance, reversal linkage, immutability |
| `tests/convex/counterGeneration.test.ts` | Sequential ID generation, daily reset |

---

## Chunk 1: Schema + CoA + Counter Infrastructure

### Task 1: Add Schema Tables

**Files:**
- Modify: `convex/schema.ts` (after line 1602, before closing `});`)

- [ ] **Step 1: Add shared validators for expense system**

Add above the `export default defineSchema({` block, alongside existing shared validators:

```typescript
/** Expense status union — shared across schema and mutations. */
export const expenseStatus = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("awaiting_payment"),
  v.literal("reimbursed"),
  v.literal("rejected"),
  v.literal("voided")
);

/** Account type union for Chart of Accounts. */
export const accountType = v.union(
  v.literal("asset"),
  v.literal("liability"),
  v.literal("equity"),
  v.literal("revenue"),
  v.literal("cogs"),
  v.literal("opex"),
  v.literal("other")
);

/** Payment method for expenses. */
export const expensePaymentMethod = v.union(
  v.literal("personal_cash"),
  v.literal("personal_transfer"),
  v.literal("company_card")
);

/** Journal entry source type. */
export const journalSourceType = v.union(
  v.literal("expense_approval"),
  v.literal("expense_void"),
  v.literal("reimbursement"),
  v.literal("reimbursement_void"),
  v.literal("payroll"),
  v.literal("payroll_void"),
  v.literal("manual")
);
```

- [ ] **Step 2: Add 10 new tables to schema**

Add inside `defineSchema({})` before the closing `});`:

```typescript
  // ============================================
  // EXPENSE & ACCOUNTING SYSTEM
  // Chart of Accounts, expenses, journal entries, reimbursements
  // ============================================

  accounts: defineTable({
    code: v.string(),
    name: v.string(),
    type: accountType,
    category: v.string(),
    isActive: v.boolean(),
    isSystem: v.boolean(),
    description: v.optional(v.string()),
  })
    .index("by_code", ["code"])
    .index("by_type", ["type"])
    .index("by_active_type", ["isActive", "type"]),

  expenses: defineTable({
    expenseNumber: v.string(),
    submittedBy: v.id("users"),
    amount: v.number(),
    accountId: v.id("accounts"),
    expenseDate: v.number(),
    description: v.string(),
    vendorName: v.string(),
    paymentMethod: expensePaymentMethod,
    receiptFileId: v.optional(v.id("_storage")),
    receiptImageHash: v.optional(v.string()),
    status: expenseStatus,
    lateSubmission: v.boolean(),
    duplicateWarning: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    approverComment: v.optional(v.string()),
    rejectedBy: v.optional(v.id("users")),
    rejectedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    previousExpenseId: v.optional(v.id("expenses")),
  })
    .index("by_submitter_status", ["submittedBy", "status"])
    .index("by_status", ["status"])
    .index("by_amount_date_submitter", ["amount", "expenseDate", "submittedBy"])
    .index("by_receipt_hash", ["receiptImageHash"])
    .index("by_expense_number", ["expenseNumber"]),

  expenseStatusHistory: defineTable({
    expenseId: v.id("expenses"),
    fromStatus: v.string(),
    toStatus: v.string(),
    changedBy: v.id("users"),
    changedAt: v.number(),
    comment: v.optional(v.string()),
  })
    .index("by_expense", ["expenseId"]),

  reimbursementBatches: defineTable({
    batchNumber: v.string(),
    employeeUserId: v.id("users"),
    totalAmount: v.number(),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("voided")),
    bankAccountId: v.optional(v.id("bankAccounts")),
    bankReference: v.optional(v.string()),
    transferDate: v.optional(v.number()),
    confirmedBy: v.optional(v.id("users")),
    confirmedAt: v.optional(v.number()),
    voidedBy: v.optional(v.id("users")),
    voidedAt: v.optional(v.number()),
    voidReason: v.optional(v.string()),
  })
    .index("by_batch_number", ["batchNumber"])
    .index("by_employee_status", ["employeeUserId", "status"])
    .index("by_status", ["status"]),

  reimbursementBatchItems: defineTable({
    batchId: v.id("reimbursementBatches"),
    expenseId: v.id("expenses"),
  })
    .index("by_batch", ["batchId"])
    .index("by_expense", ["expenseId"]),

  journalEntries: defineTable({
    entryNumber: v.string(),
    date: v.number(),
    description: v.string(),
    sourceType: journalSourceType,
    sourceId: v.optional(v.string()),
    isReversed: v.boolean(),
    reversedByEntryId: v.optional(v.id("journalEntries")),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_entry_number", ["entryNumber"])
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_date", ["date"]),

  journalEntryLines: defineTable({
    journalEntryId: v.id("journalEntries"),
    accountId: v.id("accounts"),
    entryDate: v.number(),
    debitAmount: v.number(),
    creditAmount: v.number(),
    description: v.optional(v.string()),
  })
    .index("by_journal_entry", ["journalEntryId"])
    .index("by_account_entryDate", ["accountId", "entryDate"]),

  bankAccounts: defineTable({
    name: v.string(),
    bankName: v.string(),
    accountNumber: v.string(),
    isActive: v.boolean(),
  })
    .index("by_active", ["isActive"]),

  payrollEntries: defineTable({
    employeeType: v.union(v.literal("contractor"), v.literal("staff")),
    frequency: v.union(v.literal("weekly"), v.literal("monthly")),
    amount: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    description: v.string(),
    attachmentFileId: v.optional(v.id("_storage")),
    status: v.union(v.literal("active"), v.literal("voided")),
    voidedBy: v.optional(v.id("users")),
    voidedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_period", ["periodStart"])
    .index("by_employee_type", ["employeeType"]),

  counters: defineTable({
    prefix: v.string(),
    date: v.string(),
    lastSequence: v.number(),
  })
    .index("by_prefix_date", ["prefix", "date"]),
```

- [ ] **Step 3: Add bank fields to users table**

In the `users: defineTable({...})` block, add after `lastLoginAt`:

```typescript
    bankAccountNumber: v.optional(v.string()),
    bankName: v.optional(v.string()),
```

- [ ] **Step 4: Run type-check to verify schema compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): add 10 expense/accounting tables + user bank fields"
```

---

### Task 2: Counter Helper (Sequential ID Generation)

**Files:**
- Create: `convex/counters/helpers.ts`
- Test: `tests/convex/counterGeneration.test.ts`

- [ ] **Step 1: Write failing tests for counter generation**

```typescript
// tests/convex/counterGeneration.test.ts
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "../../convex/schema";

describe("counter generation", () => {
  test("first ID of the day returns 001", async () => {
    const t = convexTest(schema);
    // Directly test via run() since helpers need MutationCtx
    const result = await t.run(async (ctx) => {
      // Import inline to get the helper
      const { generateSequentialId } = await import("../../convex/counters/helpers");
      return await generateSequentialId(ctx, "EXP", "0312");
    });
    expect(result).toBe("EXP-0312-001");
  });

  test("second ID of the day returns 002", async () => {
    const t = convexTest(schema);
    const result = await t.run(async (ctx) => {
      const { generateSequentialId } = await import("../../convex/counters/helpers");
      await generateSequentialId(ctx, "EXP", "0312");
      return await generateSequentialId(ctx, "EXP", "0312");
    });
    expect(result).toBe("EXP-0312-002");
  });

  test("different prefix on same day is independent", async () => {
    const t = convexTest(schema);
    const result = await t.run(async (ctx) => {
      const { generateSequentialId } = await import("../../convex/counters/helpers");
      await generateSequentialId(ctx, "EXP", "0312");
      return await generateSequentialId(ctx, "JE", "0312");
    });
    expect(result).toBe("JE-0312-001");
  });

  test("different day resets to 001", async () => {
    const t = convexTest(schema);
    const result = await t.run(async (ctx) => {
      const { generateSequentialId } = await import("../../convex/counters/helpers");
      await generateSequentialId(ctx, "EXP", "0312");
      return await generateSequentialId(ctx, "EXP", "0313");
    });
    expect(result).toBe("EXP-0313-001");
  });

  test("getDateMMDD formats timestamp to MMDD in WIB", async () => {
    // March 12, 2026 at noon WIB = March 12 05:00 UTC
    const { getDateMMDD } = await import("../../convex/counters/helpers");
    const ts = Date.UTC(2026, 2, 12, 5, 0, 0); // noon WIB
    expect(getDateMMDD(ts)).toBe("0312");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/convex/counterGeneration.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement counter helper**

```typescript
// convex/counters/helpers.ts
import type { MutationCtx } from "../_generated/server";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Convert a UTC timestamp to MMDD string in WIB timezone.
 */
export function getDateMMDD(timestampMs: number): string {
  const wib = new Date(timestampMs + WIB_OFFSET_MS);
  const month = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const day = String(wib.getUTCDate()).padStart(2, "0");
  return `${month}${day}`;
}

/**
 * Generate a sequential ID like EXP-0312-001.
 * Atomically increments the counter for the given prefix+date.
 * Convex mutation serialization prevents race conditions.
 */
export async function generateSequentialId(
  ctx: MutationCtx,
  prefix: string,
  dateMMDD: string
): Promise<string> {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_prefix_date", (q) =>
      q.eq("prefix", prefix).eq("date", dateMMDD)
    )
    .first();

  let sequence: number;
  if (existing) {
    sequence = existing.lastSequence + 1;
    await ctx.db.patch(existing._id, { lastSequence: sequence });
  } else {
    sequence = 1;
    await ctx.db.insert("counters", {
      prefix,
      date: dateMMDD,
      lastSequence: sequence,
    });
  }

  return `${prefix}-${dateMMDD}-${String(sequence).padStart(3, "0")}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/convex/counterGeneration.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add convex/counters/helpers.ts tests/convex/counterGeneration.test.ts
git commit -m "feat(counters): sequential ID generation helper with tests"
```

---

### Task 3: Chart of Accounts — Queries, Mutations, Seed

**Files:**
- Create: `convex/accounts/queries.ts`
- Create: `convex/accounts/mutations.ts`

- [ ] **Step 1: Write accounts queries**

```typescript
// convex/accounts/queries.ts
import { v } from "convex/values";
import { query } from "../_generated/server";
import { accountType } from "../schema";

export const list = query({
  args: {
    type: v.optional(accountType),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.type && args.activeOnly) {
      return await ctx.db
        .query("accounts")
        .withIndex("by_active_type", (q) =>
          q.eq("isActive", true).eq("type", args.type!)
        )
        .collect();
    }
    if (args.type) {
      return await ctx.db
        .query("accounts")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .collect();
    }
    const all = await ctx.db.query("accounts").collect();
    if (args.activeOnly) {
      return all.filter((a) => a.isActive);
    }
    return all;
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});

/** List only OpEx accounts (6xxx) for expense category dropdown. */
export const listOpEx = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("accounts")
      .withIndex("by_active_type", (q) =>
        q.eq("isActive", true).eq("type", "opex")
      )
      .collect();
  },
});
```

- [ ] **Step 2: Write accounts mutations with seedDefaults**

```typescript
// convex/accounts/mutations.ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { accountType } from "../schema";
import { requireRole } from "../lib/auth";

/** Seed the default Chart of Accounts. Idempotent — skips existing codes. */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const DEFAULT_ACCOUNTS: Array<{
      code: string;
      name: string;
      type: "asset" | "liability" | "equity" | "revenue" | "cogs" | "opex" | "other";
      category: string;
      description?: string;
    }> = [
      // Assets (1xxx)
      { code: "1100", name: "Cash (Bank Accounts)", type: "asset", category: "Current Assets" },
      { code: "1200", name: "Accounts Receivable", type: "asset", category: "Current Assets" },
      { code: "1300", name: "Inventory (Raw Materials)", type: "asset", category: "Current Assets" },
      { code: "1400", name: "Prepaid Expenses", type: "asset", category: "Current Assets" },
      { code: "1500", name: "Fixed Assets", type: "asset", category: "Non-Current Assets" },
      { code: "1600", name: "Accumulated Depreciation", type: "asset", category: "Non-Current Assets" },
      // Liabilities (2xxx)
      { code: "2100", name: "Accounts Payable", type: "liability", category: "Current Liabilities" },
      { code: "2200", name: "Employee Reimbursements Payable", type: "liability", category: "Current Liabilities" },
      { code: "2300", name: "Accrued Expenses", type: "liability", category: "Current Liabilities" },
      { code: "2400", name: "Tax Payable", type: "liability", category: "Current Liabilities" },
      { code: "2500", name: "Loans Payable", type: "liability", category: "Non-Current Liabilities" },
      // Equity (3xxx)
      { code: "3100", name: "Owner's Capital", type: "equity", category: "Equity" },
      { code: "3200", name: "Retained Earnings", type: "equity", category: "Equity" },
      { code: "3300", name: "Current Period P&L", type: "equity", category: "Equity" },
      // Revenue (4xxx) — virtual, values from externalRevenue
      { code: "4100", name: "Direct Sales", type: "revenue", category: "Revenue", description: "Virtual — from externalRevenue" },
      { code: "4200", name: "GoFood Revenue", type: "revenue", category: "Revenue", description: "Virtual — from externalRevenue" },
      { code: "4300", name: "Shopee Revenue", type: "revenue", category: "Revenue", description: "Virtual — from externalRevenue" },
      { code: "4400", name: "TikTok Revenue", type: "revenue", category: "Revenue", description: "Virtual — from externalRevenue" },
      { code: "4500", name: "K3Mart Revenue", type: "revenue", category: "Revenue", description: "Virtual — from externalRevenue" },
      { code: "4600", name: "Consignment Revenue", type: "revenue", category: "Revenue", description: "Virtual — from externalRevenue" },
      { code: "4700", name: "GrabFood Revenue", type: "revenue", category: "Revenue", description: "Virtual — from externalRevenue" },
      // COGS (5xxx) — virtual, values from BOM
      { code: "5100", name: "Production COGS", type: "cogs", category: "Cost of Goods Sold", description: "Virtual — from BOM" },
      { code: "5200", name: "Packaging COGS", type: "cogs", category: "Cost of Goods Sold", description: "Virtual — from BOM" },
      { code: "5300", name: "Commissions & Fees", type: "cogs", category: "Cost of Goods Sold", description: "Virtual — from externalRevenue" },
      { code: "5400", name: "Platform Ad Burn", type: "cogs", category: "Cost of Goods Sold", description: "Virtual — from externalRevenue" },
      // OpEx (6xxx) — stored journal entries
      { code: "6100", name: "Salaries & Wages", type: "opex", category: "Operating Expenses" },
      { code: "6200", name: "Rent & Utilities", type: "opex", category: "Operating Expenses" },
      { code: "6300", name: "Transportation (Local)", type: "opex", category: "Operating Expenses" },
      { code: "6350", name: "Travel & Visa", type: "opex", category: "Operating Expenses" },
      { code: "6400", name: "Marketing & Promotion", type: "opex", category: "Operating Expenses" },
      { code: "6500", name: "Office & Supplies", type: "opex", category: "Operating Expenses" },
      { code: "6600", name: "Equipment & Maintenance", type: "opex", category: "Operating Expenses" },
      { code: "6700", name: "Software & Subscriptions", type: "opex", category: "Operating Expenses" },
      { code: "6800", name: "Professional Services", type: "opex", category: "Operating Expenses" },
      { code: "6900", name: "Meals & Entertainment", type: "opex", category: "Operating Expenses" },
      { code: "6990", name: "Miscellaneous OpEx", type: "opex", category: "Operating Expenses" },
      // Other (7xxx)
      { code: "7100", name: "Interest Income", type: "other", category: "Other Income/Expense" },
      { code: "7200", name: "Interest Expense", type: "other", category: "Other Income/Expense" },
      { code: "7900", name: "Other Non-Operating", type: "other", category: "Other Income/Expense" },
    ];

    let created = 0;
    for (const acct of DEFAULT_ACCOUNTS) {
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_code", (q) => q.eq("code", acct.code))
        .first();
      if (!existing) {
        await ctx.db.insert("accounts", {
          ...acct,
          isActive: true,
          isSystem: true,
        });
        created++;
      }
    }
    return { created, total: DEFAULT_ACCOUNTS.length };
  },
});

/** Create a custom account (admin only). */
export const create = mutation({
  args: {
    token: v.string(),
    code: v.string(),
    name: v.string(),
    type: accountType,
    category: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (existing) {
      throw new Error(`Account with code "${args.code}" already exists`);
    }

    return await ctx.db.insert("accounts", {
      code: args.code,
      name: args.name,
      type: args.type,
      category: args.category,
      description: args.description,
      isActive: true,
      isSystem: false,
    });
  },
});

/** Deactivate an account (admin only). System accounts cannot be deleted. */
export const deactivate = mutation({
  args: {
    token: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error("Account not found");
    if (account.isSystem) throw new Error("System accounts cannot be deactivated");

    await ctx.db.patch(args.accountId, { isActive: false });
  },
});
```

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add convex/accounts/queries.ts convex/accounts/mutations.ts
git commit -m "feat(accounts): Chart of Accounts queries, mutations, and seedDefaults"
```

---

### Task 4: Bank Accounts CRUD

**Files:**
- Create: `convex/bankAccounts/queries.ts`
- Create: `convex/bankAccounts/mutations.ts`

- [ ] **Step 1: Write bank accounts queries**

```typescript
// convex/bankAccounts/queries.ts
import { query } from "../_generated/server";

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("bankAccounts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});
```

- [ ] **Step 2: Write bank accounts mutations**

```typescript
// convex/bankAccounts/mutations.ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    bankName: v.string(),
    accountNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    return await ctx.db.insert("bankAccounts", {
      name: args.name,
      bankName: args.bankName,
      accountNumber: args.accountNumber,
      isActive: true,
    });
  },
});

export const deactivate = mutation({
  args: {
    token: v.string(),
    id: v.id("bankAccounts"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    await ctx.db.patch(args.id, { isActive: false });
  },
});
```

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add convex/bankAccounts/queries.ts convex/bankAccounts/mutations.ts
git commit -m "feat(bankAccounts): bank account CRUD for reimbursement tracking"
```

---

### Task 5: Journal Entry Creation Helper

**Files:**
- Create: `convex/journal/mutations.ts`
- Create: `convex/journal/queries.ts`
- Test: `tests/convex/journalIntegrity.test.ts`

- [ ] **Step 1: Write failing tests for journal entry integrity**

```typescript
// tests/convex/journalIntegrity.test.ts
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";

describe("journal entry integrity", () => {
  test("balanced entry creates successfully", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      // Seed accounts
      const opexId = await ctx.db.insert("accounts", {
        code: "6500", name: "Office", type: "opex", category: "OpEx",
        isActive: true, isSystem: true,
      });
      const apId = await ctx.db.insert("accounts", {
        code: "2200", name: "Reimb Payable", type: "liability", category: "Liabilities",
        isActive: true, isSystem: true,
      });
      const userId = await ctx.db.insert("users", {
        name: "Admin", pinHash: "x:y", role: "admin",
        isActive: true, failedAttempts: 0, createdAt: Date.now(),
      });

      const { createJournalEntry } = await import("../../convex/journal/mutations");
      const entryId = await createJournalEntry(ctx, {
        date: Date.now(),
        description: "Test expense",
        sourceType: "expense_approval",
        sourceId: "test123",
        createdBy: userId,
        lines: [
          { accountId: opexId, debitAmount: 50000, creditAmount: 0 },
          { accountId: apId, debitAmount: 0, creditAmount: 50000 },
        ],
      });

      const entry = await ctx.db.get(entryId);
      expect(entry).not.toBeNull();
      expect(entry!.isReversed).toBe(false);

      const lines = await ctx.db
        .query("journalEntryLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entryId))
        .collect();
      expect(lines).toHaveLength(2);

      const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
      const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
      expect(totalDebit).toBe(totalCredit);
    });
  });

  test("unbalanced entry throws error", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const opexId = await ctx.db.insert("accounts", {
        code: "6500", name: "Office", type: "opex", category: "OpEx",
        isActive: true, isSystem: true,
      });
      const apId = await ctx.db.insert("accounts", {
        code: "2200", name: "Reimb Payable", type: "liability", category: "Liabilities",
        isActive: true, isSystem: true,
      });
      const userId = await ctx.db.insert("users", {
        name: "Admin", pinHash: "x:y", role: "admin",
        isActive: true, failedAttempts: 0, createdAt: Date.now(),
      });

      const { createJournalEntry } = await import("../../convex/journal/mutations");
      await expect(
        createJournalEntry(ctx, {
          date: Date.now(),
          description: "Unbalanced",
          sourceType: "expense_approval",
          createdBy: userId,
          lines: [
            { accountId: opexId, debitAmount: 50000, creditAmount: 0 },
            { accountId: apId, debitAmount: 0, creditAmount: 40000 },
          ],
        })
      ).rejects.toThrow("must balance");
    });
  });

  test("entryDate is denormalized onto lines", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const acctId = await ctx.db.insert("accounts", {
        code: "6500", name: "Office", type: "opex", category: "OpEx",
        isActive: true, isSystem: true,
      });
      const userId = await ctx.db.insert("users", {
        name: "Admin", pinHash: "x:y", role: "admin",
        isActive: true, failedAttempts: 0, createdAt: Date.now(),
      });

      const entryDate = Date.UTC(2026, 2, 12);
      const { createJournalEntry } = await import("../../convex/journal/mutations");
      const entryId = await createJournalEntry(ctx, {
        date: entryDate,
        description: "Test",
        sourceType: "manual",
        createdBy: userId,
        lines: [
          { accountId: acctId, debitAmount: 1000, creditAmount: 0 },
          { accountId: acctId, debitAmount: 0, creditAmount: 1000 },
        ],
      });

      const lines = await ctx.db
        .query("journalEntryLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entryId))
        .collect();
      for (const line of lines) {
        expect(line.entryDate).toBe(entryDate);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/convex/journalIntegrity.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement journal mutations (internal helper + registered mutations)**

```typescript
// convex/journal/mutations.ts
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { generateSequentialId, getDateMMDD } from "../counters/helpers";

interface JournalLine {
  accountId: Id<"accounts">;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

interface CreateJournalEntryArgs {
  date: number;
  description: string;
  sourceType: "expense_approval" | "expense_void" | "reimbursement" | "reimbursement_void" | "payroll" | "payroll_void" | "manual";
  sourceId?: string;
  createdBy: Id<"users">;
  lines: JournalLine[];
}

/**
 * Create a balanced journal entry with lines.
 * Called internally by expense/reimbursement/payroll mutations.
 * Validates debit/credit balance before writing.
 * Denormalizes `date` onto each line as `entryDate` for Convex index queries.
 */
export async function createJournalEntry(
  ctx: MutationCtx,
  args: CreateJournalEntryArgs
): Promise<Id<"journalEntries">> {
  // Validate balance
  const totalDebit = args.lines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredit = args.lines.reduce((s, l) => s + l.creditAmount, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Journal entry must balance: debits (${totalDebit}) != credits (${totalCredit})`
    );
  }

  if (args.lines.length === 0) {
    throw new Error("Journal entry must have at least one line");
  }

  const dateMMDD = getDateMMDD(args.date);
  const entryNumber = await generateSequentialId(ctx, "JE", dateMMDD);

  const entryId = await ctx.db.insert("journalEntries", {
    entryNumber,
    date: args.date,
    description: args.description,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    isReversed: false,
    createdBy: args.createdBy,
    createdAt: Date.now(),
  });

  // Create lines with denormalized entryDate
  for (const line of args.lines) {
    await ctx.db.insert("journalEntryLines", {
      journalEntryId: entryId,
      accountId: line.accountId,
      entryDate: args.date,
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
      description: line.description,
    });
  }

  return entryId;
}

/**
 * Create a reversing journal entry for an existing entry.
 * Marks the original as reversed and links via reversedByEntryId.
 */
export async function createReversingEntry(
  ctx: MutationCtx,
  originalEntryId: Id<"journalEntries">,
  sourceType: "expense_void" | "reimbursement_void" | "payroll_void",
  sourceId: string,
  createdBy: Id<"users">
): Promise<Id<"journalEntries">> {
  const original = await ctx.db.get(originalEntryId);
  if (!original) throw new Error("Original journal entry not found");
  if (original.isReversed) throw new Error("Journal entry already reversed");

  // Get original lines
  const originalLines = await ctx.db
    .query("journalEntryLines")
    .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", originalEntryId))
    .collect();

  // Swap debits and credits
  const reversedLines = originalLines.map((line) => ({
    accountId: line.accountId,
    debitAmount: line.creditAmount,
    creditAmount: line.debitAmount,
    description: `Reversal: ${line.description ?? ""}`.trim(),
  }));

  const reversalId = await createJournalEntry(ctx, {
    date: Date.now(),
    description: `Reversal of ${original.entryNumber}: ${original.description}`,
    sourceType,
    sourceId,
    createdBy,
    lines: reversedLines,
  });

  // Mark original as reversed
  await ctx.db.patch(originalEntryId, {
    isReversed: true,
    reversedByEntryId: reversalId,
  });

  return reversalId;
}
```

- [ ] **Step 4: Implement journal queries**

```typescript
// convex/journal/queries.ts
import { v } from "convex/values";
import { query } from "../_generated/server";

/** Get OpEx totals by account for a period. Used by P&L extension. */
export const getOpExByPeriod = query({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    // Get all OpEx accounts (6xxx)
    const opexAccounts = await ctx.db
      .query("accounts")
      .withIndex("by_type", (q) => q.eq("type", "opex"))
      .collect();

    const results: Array<{
      accountId: string;
      code: string;
      name: string;
      total: number;
    }> = [];

    for (const account of opexAccounts) {
      const lines = await ctx.db
        .query("journalEntryLines")
        .withIndex("by_account_entryDate", (q) =>
          q
            .eq("accountId", account._id)
            .gte("entryDate", args.periodStart)
            .lt("entryDate", args.periodEnd)
        )
        .collect();

      // OpEx = debit - credit (expenses increase with debits)
      const total = lines.reduce(
        (sum, l) => sum + l.debitAmount - l.creditAmount,
        0
      );

      if (total !== 0) {
        results.push({
          accountId: account._id as string,
          code: account.code,
          name: account.name,
          total,
        });
      }
    }

    // Sort by account code
    results.sort((a, b) => a.code.localeCompare(b.code));
    return results;
  },
});

/** Get Other Income/Expense totals (7xxx) for a period. */
export const getOtherByPeriod = query({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const otherAccounts = await ctx.db
      .query("accounts")
      .withIndex("by_type", (q) => q.eq("type", "other"))
      .collect();

    const results: Array<{
      accountId: string;
      code: string;
      name: string;
      total: number;
    }> = [];

    for (const account of otherAccounts) {
      const lines = await ctx.db
        .query("journalEntryLines")
        .withIndex("by_account_entryDate", (q) =>
          q
            .eq("accountId", account._id)
            .gte("entryDate", args.periodStart)
            .lt("entryDate", args.periodEnd)
        )
        .collect();

      // Other expense = debit - credit, Other income = credit - debit
      // Using standard: debit - credit for expense accounts
      const total = lines.reduce(
        (sum, l) => sum + l.debitAmount - l.creditAmount,
        0
      );

      if (total !== 0) {
        results.push({
          accountId: account._id as string,
          code: account.code,
          name: account.name,
          total,
        });
      }
    }

    results.sort((a, b) => a.code.localeCompare(b.code));
    return results;
  },
});

/** List journal entries for a source (e.g., all JEs for an expense). */
export const getBySource = query({
  args: {
    sourceType: v.string(),
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", args.sourceType as any).eq("sourceId", args.sourceId)
      )
      .collect();

    // Fetch lines for each entry
    return await Promise.all(
      entries.map(async (entry) => {
        const lines = await ctx.db
          .query("journalEntryLines")
          .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
          .collect();

        // Resolve account names
        const linesWithAccounts = await Promise.all(
          lines.map(async (line) => {
            const account = await ctx.db.get(line.accountId);
            return {
              ...line,
              accountCode: account?.code ?? "???",
              accountName: account?.name ?? "Unknown",
            };
          })
        );

        return { ...entry, lines: linesWithAccounts };
      })
    );
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/convex/journalIntegrity.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add convex/journal/mutations.ts convex/journal/queries.ts tests/convex/journalIntegrity.test.ts
git commit -m "feat(journal): journal entry creation with balance validation and period queries"
```

---

## Chunk 2: Expense Lifecycle — Submission, Approval, Void

### Task 6: Expense Helpers (Pure Functions)

**Files:**
- Create: `convex/expenses/helpers.ts`

- [ ] **Step 1: Implement expense pure helpers**

```typescript
// convex/expenses/helpers.ts
import type { Doc } from "../_generated/dataModel";

const LATE_SUBMISSION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECEIPT_THRESHOLD = 50000;
const DOA_THRESHOLD = 500000;
const DUPLICATE_WINDOW_DAYS = 7;

/** Check if expense is a late submission (> 14 days). */
export function isLateSubmission(expenseDateMs: number, nowMs: number): boolean {
  const daysDiff = (nowMs - expenseDateMs) / DAY_MS;
  return daysDiff > LATE_SUBMISSION_DAYS;
}

/** Check if receipt is required (amount > 50,000 IDR). */
export function isReceiptRequired(amount: number): boolean {
  return amount > RECEIPT_THRESHOLD;
}

/** Get eligible approver roles based on DoA threshold. */
export function getEligibleRoles(amount: number): Array<"manager" | "admin"> {
  if (amount > DOA_THRESHOLD) {
    return ["admin"];
  }
  return ["manager", "admin"];
}

/** Check if a user is eligible to approve an expense. */
export function isEligibleApprover(
  approver: Doc<"users">,
  submitterId: string,
  amount: number
): boolean {
  // Self-approval blocked
  if ((approver._id as string) === submitterId) return false;
  // Must be active
  if (!approver.isActive) return false;
  // Check role against DoA
  const eligibleRoles = getEligibleRoles(amount);
  return eligibleRoles.includes(approver.role as "manager" | "admin");
}

/** Check for duplicate: same employee + amount + date within 7 days. */
export function isDuplicateCandidate(
  existingExpenses: Array<{ amount: number; expenseDate: number; _id: string }>,
  amount: number,
  expenseDate: number
): { isDuplicate: boolean; matchingExpenseId?: string } {
  for (const existing of existingExpenses) {
    if (
      existing.amount === amount &&
      Math.abs(existing.expenseDate - expenseDate) < DUPLICATE_WINDOW_DAYS * DAY_MS
    ) {
      return { isDuplicate: true, matchingExpenseId: existing._id };
    }
  }
  return { isDuplicate: false };
}

/** Validate expense can transition to target status. */
export function canTransition(
  currentStatus: string,
  targetStatus: string
): boolean {
  // NOTE: rejected is terminal for the original expense. Resubmission creates
  // a NEW expense record with previousExpenseId linking to the rejected one.
  const transitions: Record<string, string[]> = {
    draft: ["submitted", "voided"],
    submitted: ["approved", "rejected", "voided"],
    approved: ["awaiting_payment", "voided"],
    awaiting_payment: ["reimbursed", "voided"],
    // Terminal states — no outbound transitions
    rejected: [],
    reimbursed: [],
    voided: [],
  };
  return (transitions[currentStatus] ?? []).includes(targetStatus);
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/expenses/helpers.ts
git commit -m "feat(expenses): pure helper functions for DoA, duplicates, receipt rules"
```

---

### Task 7: Expense Mutations — Create, Submit, Approve, Reject, Void

**Files:**
- Create: `convex/expenses/mutations.ts`
- Test: `tests/convex/expenses.test.ts`
- Test: `tests/convex/expenseApproval.test.ts`

- [ ] **Step 1: Write failing tests for expense submission**

```typescript
// tests/convex/expenses.test.ts
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";

// Helper: seed a user and return { userId, token }
async function seedUserWithSession(
  t: ReturnType<typeof convexTest>,
  overrides: { role?: "kitchen" | "order_staff" | "manager" | "admin"; name?: string } = {}
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: overrides.name ?? "Test User",
      pinHash: "salt:hash",
      role: overrides.role ?? "order_staff",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    const token = "test-token-" + Math.random();
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      createdAt: Date.now(),
    });
    return { userId, token };
  });
}

// Helper: seed OpEx account
async function seedOpExAccount(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("accounts", {
      code: "6500", name: "Office & Supplies", type: "opex",
      category: "Operating Expenses", isActive: true, isSystem: true,
    });
  });
}

describe("expense submission", () => {
  test("valid draft save creates expense", async () => {
    const t = convexTest(schema);
    const { token } = await seedUserWithSession(t);
    const accountId = await seedOpExAccount(t);

    await t.mutation(api.expenses.mutations.saveDraft, {
      token,
      amount: 25000,
      accountId,
      expenseDate: Date.now(),
      description: "Office pens",
      vendorName: "Tokopedia",
      paymentMethod: "personal_cash",
    });

    const expenses = await t.run(async (ctx) => {
      return await ctx.db.query("expenses").collect();
    });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].status).toBe("draft");
  });

  test("amount must be > 0", async () => {
    const t = convexTest(schema);
    const { token } = await seedUserWithSession(t);
    const accountId = await seedOpExAccount(t);

    await expect(
      t.mutation(api.expenses.mutations.saveDraft, {
        token,
        amount: 0,
        accountId,
        expenseDate: Date.now(),
        description: "Zero",
        vendorName: "Test",
        paymentMethod: "personal_cash",
      })
    ).rejects.toThrow();
  });

  test("future expense date rejected", async () => {
    const t = convexTest(schema);
    const { token } = await seedUserWithSession(t);
    const accountId = await seedOpExAccount(t);

    await expect(
      t.mutation(api.expenses.mutations.saveDraft, {
        token,
        amount: 25000,
        accountId,
        expenseDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        description: "Future",
        vendorName: "Test",
        paymentMethod: "personal_cash",
      })
    ).rejects.toThrow("future");
  });

  test("receipt required for amount > 50,000", async () => {
    const t = convexTest(schema);
    const { token } = await seedUserWithSession(t);
    const accountId = await seedOpExAccount(t);

    // 50,001 without receipt should fail on submit
    const expenseId = await t.mutation(api.expenses.mutations.saveDraft, {
      token,
      amount: 50001,
      accountId,
      expenseDate: Date.now(),
      description: "No receipt",
      vendorName: "Test",
      paymentMethod: "personal_cash",
    });

    await expect(
      t.mutation(api.expenses.mutations.submit, { token, expenseId })
    ).rejects.toThrow("Receipt required");
  });

  test("50,000 exactly without receipt is allowed on submit", async () => {
    const t = convexTest(schema);
    const { token } = await seedUserWithSession(t);
    const accountId = await seedOpExAccount(t);

    const expenseId = await t.mutation(api.expenses.mutations.saveDraft, {
      token,
      amount: 50000,
      accountId,
      expenseDate: Date.now(),
      description: "At threshold",
      vendorName: "Test",
      paymentMethod: "personal_cash",
    });

    // Should not throw
    await t.mutation(api.expenses.mutations.submit, { token, expenseId });

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense!.status).toBe("submitted");
  });

  test("late submission flag set for > 14 days", async () => {
    const t = convexTest(schema);
    const { token } = await seedUserWithSession(t);
    const accountId = await seedOpExAccount(t);

    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    const expenseId = await t.mutation(api.expenses.mutations.saveDraft, {
      token,
      amount: 25000,
      accountId,
      expenseDate: fifteenDaysAgo,
      description: "Late expense",
      vendorName: "Test",
      paymentMethod: "personal_cash",
    });

    await t.mutation(api.expenses.mutations.submit, { token, expenseId });

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense!.lateSubmission).toBe(true);
  });
});
```

- [ ] **Step 2: Write failing tests for expense approval**

```typescript
// tests/convex/expenseApproval.test.ts
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";

async function seedUserWithSession(
  t: ReturnType<typeof convexTest>,
  overrides: { role?: "kitchen" | "order_staff" | "manager" | "admin"; name?: string } = {}
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: overrides.name ?? "Test User",
      pinHash: "salt:hash",
      role: overrides.role ?? "order_staff",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    const token = "test-token-" + Math.random();
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      createdAt: Date.now(),
    });
    return { userId, token };
  });
}

async function seedAccountAndExpense(
  t: ReturnType<typeof convexTest>,
  submitterToken: string,
  amount: number = 100000,
  paymentMethod: "personal_cash" | "personal_transfer" | "company_card" = "personal_cash"
) {
  const accountId = await t.run(async (ctx) => {
    const existing = await ctx.db.query("accounts").withIndex("by_code", (q) => q.eq("code", "6500")).first();
    if (existing) return existing._id;
    return await ctx.db.insert("accounts", {
      code: "6500", name: "Office", type: "opex", category: "OpEx",
      isActive: true, isSystem: true,
    });
  });
  // Also seed 2200 and 1100 for journal entries
  await t.run(async (ctx) => {
    const existing2200 = await ctx.db.query("accounts").withIndex("by_code", (q) => q.eq("code", "2200")).first();
    if (!existing2200) {
      await ctx.db.insert("accounts", {
        code: "2200", name: "Reimb Payable", type: "liability", category: "Liabilities",
        isActive: true, isSystem: true,
      });
    }
    const existing1100 = await ctx.db.query("accounts").withIndex("by_code", (q) => q.eq("code", "1100")).first();
    if (!existing1100) {
      await ctx.db.insert("accounts", {
        code: "1100", name: "Cash", type: "asset", category: "Assets",
        isActive: true, isSystem: true,
      });
    }
  });

  const expenseId = await t.mutation(api.expenses.mutations.saveDraft, {
    token: submitterToken,
    amount,
    accountId,
    expenseDate: Date.now(),
    description: "Test expense",
    vendorName: "Test Vendor",
    paymentMethod,
  });
  await t.mutation(api.expenses.mutations.submit, { token: submitterToken, expenseId });
  return { expenseId, accountId };
}

describe("expense approval", () => {
  test("self-approval is blocked", async () => {
    const t = convexTest(schema);
    const { token: adminToken } = await seedUserWithSession(t, { role: "admin", name: "Admin" });
    const { expenseId } = await seedAccountAndExpense(t, adminToken);

    await expect(
      t.mutation(api.expenses.mutations.approve, {
        token: adminToken,
        expenseId,
      })
    ).rejects.toThrow("Cannot approve your own expense");
  });

  test("manager can approve ≤ 500K", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff", name: "Staff" });
    const { token: managerToken } = await seedUserWithSession(t, { role: "manager", name: "Manager" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken, 500000);

    await t.mutation(api.expenses.mutations.approve, {
      token: managerToken,
      expenseId,
    });

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense!.status).toBe("awaiting_payment");
  });

  test("manager cannot approve > 500K", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff", name: "Staff" });
    const { token: managerToken } = await seedUserWithSession(t, { role: "manager", name: "Manager" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken, 500001);

    await expect(
      t.mutation(api.expenses.mutations.approve, {
        token: managerToken,
        expenseId,
      })
    ).rejects.toThrow("Not authorized");
  });

  test("approval creates journal entry (personal_cash)", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff", name: "Staff" });
    const { token: adminToken } = await seedUserWithSession(t, { role: "admin", name: "Admin" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken, 100000, "personal_cash");

    await t.mutation(api.expenses.mutations.approve, {
      token: adminToken,
      expenseId,
    });

    // Check journal entry was created
    const entries = await t.run(async (ctx) => {
      return await ctx.db
        .query("journalEntries")
        .withIndex("by_source", (q) =>
          q.eq("sourceType", "expense_approval").eq("sourceId", expenseId as string)
        )
        .collect();
    });
    expect(entries).toHaveLength(1);

    // Check debit = OpEx, credit = 2200
    const lines = await t.run(async (ctx) => {
      return await ctx.db
        .query("journalEntryLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entries[0]._id))
        .collect();
    });
    expect(lines).toHaveLength(2);
    const debitLine = lines.find((l) => l.debitAmount > 0)!;
    const creditLine = lines.find((l) => l.creditAmount > 0)!;
    expect(debitLine.debitAmount).toBe(100000);
    expect(creditLine.creditAmount).toBe(100000);
  });

  test("company_card approval goes to terminal Approved (no AwaitingPayment)", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff", name: "Staff" });
    const { token: adminToken } = await seedUserWithSession(t, { role: "admin", name: "Admin" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken, 100000, "company_card");

    await t.mutation(api.expenses.mutations.approve, {
      token: adminToken,
      expenseId,
    });

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense!.status).toBe("approved");
  });

  test("already-approved expense cannot be approved again", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff", name: "Staff" });
    const { token: admin1Token } = await seedUserWithSession(t, { role: "admin", name: "Admin1" });
    const { token: admin2Token } = await seedUserWithSession(t, { role: "admin", name: "Admin2" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken);

    await t.mutation(api.expenses.mutations.approve, { token: admin1Token, expenseId });

    await expect(
      t.mutation(api.expenses.mutations.approve, { token: admin2Token, expenseId })
    ).rejects.toThrow("already processed");
  });

  test("approval without comment for ≥ 500K is rejected", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff", name: "Staff" });
    const { token: adminToken } = await seedUserWithSession(t, { role: "admin", name: "Admin" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken, 500000);

    await expect(
      t.mutation(api.expenses.mutations.approve, {
        token: adminToken,
        expenseId,
        // No approverComment provided
      })
    ).rejects.toThrow("Comment required");
  });

  test("approval with comment for ≥ 500K succeeds", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff", name: "Staff" });
    const { token: adminToken } = await seedUserWithSession(t, { role: "admin", name: "Admin" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken, 500000);

    await t.mutation(api.expenses.mutations.approve, {
      token: adminToken,
      expenseId,
      approverComment: "Verified with vendor receipt",
    });

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense!.status).toBe("awaiting_payment");
    expect(expense!.approverComment).toBe("Verified with vendor receipt");
  });

  test("rejection requires reason for ≥ 500K", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff", name: "Staff" });
    const { token: adminToken } = await seedUserWithSession(t, { role: "admin", name: "Admin" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken, 500000);

    await expect(
      t.mutation(api.expenses.mutations.reject, {
        token: adminToken,
        expenseId,
        reason: "", // empty reason
      })
    ).rejects.toThrow("Reason required");
  });
});
```

- [ ] **Step 2b: Write additional test cases for spec coverage gaps**

Add these to `tests/convex/expenseApproval.test.ts`:

```typescript
describe("receipt hash dedup", () => {
  test("same image hash hard blocks submission", async () => {
    const t = convexTest(schema);
    const { token } = await seedUserWithSession(t);
    const accountId = await t.run(async (ctx) =>
      ctx.db.insert("accounts", {
        code: "6500", name: "Office", type: "opex", category: "OpEx",
        isActive: true, isSystem: true,
      })
    );

    // First expense with hash
    await t.mutation(api.expenses.mutations.saveDraft, {
      token, amount: 60000, accountId, expenseDate: Date.now(),
      description: "First", vendorName: "V", paymentMethod: "personal_cash",
      receiptImageHash: "abc123hash",
    });

    // Second expense with same hash
    await expect(
      t.mutation(api.expenses.mutations.saveDraft, {
        token, amount: 30000, accountId, expenseDate: Date.now(),
        description: "Second", vendorName: "V", paymentMethod: "personal_cash",
        receiptImageHash: "abc123hash",
      })
    ).rejects.toThrow("Receipt image already used");
  });

  test("same hash from different employee still blocks", async () => {
    const t = convexTest(schema);
    const { token: token1 } = await seedUserWithSession(t, { name: "User1" });
    const { token: token2 } = await seedUserWithSession(t, { name: "User2" });
    const accountId = await t.run(async (ctx) =>
      ctx.db.insert("accounts", {
        code: "6500", name: "Office", type: "opex", category: "OpEx",
        isActive: true, isSystem: true,
      })
    );

    await t.mutation(api.expenses.mutations.saveDraft, {
      token: token1, amount: 60000, accountId, expenseDate: Date.now(),
      description: "First", vendorName: "V", paymentMethod: "personal_cash",
      receiptImageHash: "shared_hash",
    });

    await expect(
      t.mutation(api.expenses.mutations.saveDraft, {
        token: token2, amount: 60000, accountId, expenseDate: Date.now(),
        description: "Second", vendorName: "V", paymentMethod: "personal_cash",
        receiptImageHash: "shared_hash",
      })
    ).rejects.toThrow("Receipt image already used");
  });
});

describe("expense void", () => {
  test("void company_card expense creates correct reversing JE (CR OpEx, DR Cash)", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff" });
    const { token: adminToken } = await seedUserWithSession(t, { role: "admin" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken, 100000, "company_card");

    await t.mutation(api.expenses.mutations.approve, { token: adminToken, expenseId });
    await t.mutation(api.expenses.mutations.void, { token: adminToken, expenseId, reason: "Error" });

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense!.status).toBe("voided");

    // Check reversing JE exists
    const reversals = await t.run(async (ctx) =>
      ctx.db.query("journalEntries")
        .withIndex("by_source", (q) => q.eq("sourceType", "expense_void").eq("sourceId", expenseId as string))
        .collect()
    );
    expect(reversals).toHaveLength(1);
  });

  test("cannot void a Reimbursed expense", async () => {
    const t = convexTest(schema);
    const { token: staffToken } = await seedUserWithSession(t, { role: "order_staff" });
    const { token: adminToken } = await seedUserWithSession(t, { role: "admin" });
    const { expenseId } = await seedAccountAndExpense(t, staffToken, 100000);

    await t.mutation(api.expenses.mutations.approve, { token: adminToken, expenseId });

    // Manually set to reimbursed for this test
    await t.run(async (ctx) => ctx.db.patch(expenseId, { status: "reimbursed" }));

    await expect(
      t.mutation(api.expenses.mutations.void, { token: adminToken, expenseId, reason: "Error" })
    ).rejects.toThrow("Cannot void");
  });
});

describe("DoA edge cases", () => {
  test("single admin submitting > 500K gets 'No eligible approver' on submit", async () => {
    const t = convexTest(schema);
    // Only one admin exists, no other admins or managers
    const { token: adminToken } = await seedUserWithSession(t, { role: "admin", name: "Solo Admin" });
    const accountId = await t.run(async (ctx) =>
      ctx.db.insert("accounts", {
        code: "6500", name: "Office", type: "opex", category: "OpEx",
        isActive: true, isSystem: true,
      })
    );

    const expenseId = await t.mutation(api.expenses.mutations.saveDraft, {
      token: adminToken, amount: 600000, accountId, expenseDate: Date.now(),
      description: "Big expense", vendorName: "Test", paymentMethod: "personal_cash",
      receiptImageHash: "hash1",
    });

    await expect(
      t.mutation(api.expenses.mutations.submit, { token: adminToken, expenseId })
    ).rejects.toThrow("No eligible approver");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/convex/expenses.test.ts tests/convex/expenseApproval.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 4: Implement expense mutations**

Create `convex/expenses/mutations.ts` with these registered mutations:
- `saveDraft` — create/update draft expense with validation
- `submit` — transition draft → submitted, validate receipt requirement, detect duplicates
- `approve` — DoA check, self-approval block, concurrency guard, journal entry creation
- `reject` — with required reason for ≥ 500K
- `void` — admin only, creates reversing journal entry if approved

The mutations should:
- Use `requireRole(ctx, args.token, [...])` for auth
- Call `generateSequentialId` from `convex/counters/helpers.ts` for expense numbers
- Call `createJournalEntry` from `convex/journal/mutations.ts` for accounting entries
- Record status changes in `expenseStatusHistory`
- Look up accounts by code ("2200", "1100") for journal entry lines — throw clear error if system accounts missing (requires `seedDefaults` to have been run)
- Check `expense.status === "submitted"` before approve (concurrency guard)
- **Approve mutation auto-transitions**: For personal_cash/personal_transfer, atomically set status to `awaiting_payment` (not `approved` then separate transition). For company_card, set status to `approved` (terminal). This is a single mutation, NOT two separate steps.
- **Mandatory approver comment for >= 500K**: If `amount >= 500000` and no `approverComment` provided, throw "Comment required for expenses >= Rp 500,000"
- **Receipt hash dedup in saveDraft**: If `receiptImageHash` provided, query `by_receipt_hash` index. If any existing expense has the same hash, throw "Receipt image already used by EXP-XXXX"
- **Zero eligible approver check in submit**: Query all active users with eligible roles (per DoA), exclude submitter. If zero remain, throw "No eligible approver for this amount"

Full implementation should be ~250 lines following the patterns in `convex/orders/mutations/orderCrud.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/convex/expenses.test.ts tests/convex/expenseApproval.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add convex/expenses/mutations.ts tests/convex/expenses.test.ts tests/convex/expenseApproval.test.ts
git commit -m "feat(expenses): expense submission, approval, rejection, void with TDD"
```

---

### Task 8: Expense Queries

**Files:**
- Create: `convex/expenses/queries.ts`

- [ ] **Step 1: Implement expense queries**

Queries to implement:
- `listMyExpenses` — by submitter, optional status filter
- `listPendingApprovals` — submitted expenses visible to current user based on DoA
- `listAllExpenses` — admin only, with status/date filters
- `getById` — single expense with status history and rejection chain
- `getStatusHistory` — immutable audit trail for an expense
- `checkDuplicate` — detect same employee + amount + date within 7 days
- `checkReceiptHash` — detect same image hash across all expenses

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/expenses/queries.ts
git commit -m "feat(expenses): queries for own expenses, approval queue, admin audit"
```

---

## Chunk 3: Reimbursement Batching + Payroll

### Task 9: Reimbursement Mutations & Queries

**Files:**
- Create: `convex/reimbursements/mutations.ts`
- Create: `convex/reimbursements/queries.ts`
- Test: `tests/convex/reimbursements.test.ts`

- [ ] **Step 1: Write failing tests for reimbursement batching**

Key test cases:
- Only `awaiting_payment` expenses can be batched
- Cannot mix employees in one batch
- Batch total = sum of included expenses
- Empty batch rejected
- Confirmation generates JE (DR 2200, CR 1100)
- All linked expenses → Reimbursed status
- Cannot confirm already-confirmed batch
- Void generates reversing JE
- Void sends expenses back to `awaiting_payment`
- Batch with 1 expense is valid

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/convex/reimbursements.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement reimbursement mutations**

Mutations:
- `createBatch` — admin only, groups expenses by employee, generates RMB code
- `confirmBatch` — records bank reference, generates JE, marks expenses reimbursed
- `voidBatch` — admin only, requires reason, reversing JE, expenses → awaiting_payment

- [ ] **Step 4: Implement reimbursement queries**

Queries:
- `listPendingByEmployee` — groups awaiting_payment expenses by employee with running totals
- `listBatches` — batch history with status filter, searchable by RMB code or bank reference
- `getBatchDetail` — single batch with linked expenses

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/convex/reimbursements.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add convex/reimbursements/mutations.ts convex/reimbursements/queries.ts tests/convex/reimbursements.test.ts
git commit -m "feat(reimbursements): batch creation, confirmation, void with TDD"
```

---

### Task 10: Payroll Mutations & Queries

**Files:**
- Create: `convex/payroll/mutations.ts`
- Create: `convex/payroll/queries.ts`
- Test: `tests/convex/payroll.test.ts`

- [ ] **Step 1: Write failing tests for payroll**

Key test cases:
- Admin-only (other roles rejected)
- Creates correct JE (DR 6100, CR 1100)
- Amount > 0 required
- Void creates reversing JE (CR 6100, DR 1100)
- Cannot void already-voided entry

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/convex/payroll.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement payroll mutations**

Mutations:
- `create` — admin only, creates payroll entry + journal entry
- `void` — admin only, creates reversing JE

- [ ] **Step 4: Implement payroll queries**

Queries:
- `list` — by period, optional employee type filter
- `getById` — single payroll entry with JE details

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/convex/payroll.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add convex/payroll/mutations.ts convex/payroll/queries.ts tests/convex/payroll.test.ts
git commit -m "feat(payroll): payroll entry creation and void with TDD"
```

---

## Chunk 4: Frontend — Permissions, Hooks, Routing

### Task 11: Add Permission Flags

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add 4 new permission flags to ROLE_PERMISSIONS type and all role objects**

Add to the type definition (around line 709):
```typescript
  canSubmitExpenses: boolean;
  canApproveExpenses: boolean;
  canManageReimbursements: boolean;
  canAccessExpenseAnalytics: boolean;
```

Set values per role:
- `kitchen`: `canSubmitExpenses: true`, all others `false`
- `order_staff`: `canSubmitExpenses: true`, all others `false`
- `manager`: `canSubmitExpenses: true`, `canApproveExpenses: true`, `canAccessExpenseAnalytics: true`, `canManageReimbursements: false`
- `admin`: all four `true`

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(auth): add expense permission flags to ROLE_PERMISSIONS"
```

---

### Task 12: Create Frontend Hooks

**Files:**
- Create: `src/hooks/convex/useExpenses.ts`
- Create: `src/hooks/convex/useReimbursements.ts`
- Create: `src/hooks/convex/useAccounts.ts`
- Create: `src/hooks/convex/usePayroll.ts`
- Create: `src/hooks/convex/useJournal.ts`
- Modify: `src/hooks/convex/index.ts`

- [ ] **Step 1: Create hooks following existing patterns (useFinancials.ts, useOrders.ts)**

Each hook wraps `useQuery` / `useMutation` calls with the appropriate API paths. Follow the pattern in `src/hooks/convex/useFinancials.ts` for query hooks and existing mutation patterns.

`useExpenses.ts` should include:
- `useMyExpenses(token, statusFilter?)` — own expenses
- `usePendingApprovals(token)` — approval queue
- `useAllExpenses(token, filters?)` — admin audit view
- `useExpenseDetail(expenseId)` — single expense
- Mutation hooks: `useSaveDraft`, `useSubmitExpense`, `useApproveExpense`, `useRejectExpense`, `useVoidExpense`

`useReimbursements.ts`:
- `usePendingReimbursements(token)` — grouped by employee
- `useBatchHistory(token, filters?)` — batch list
- Mutation hooks: `useCreateBatch`, `useConfirmBatch`, `useVoidBatch`

`useAccounts.ts`:
- `useOpExAccounts()` — for expense form dropdown
- `useAllAccounts()` — for admin settings

`usePayroll.ts`:
- `usePayrollEntries(periodStart, periodEnd)` — list
- Mutation hooks: `useCreatePayroll`, `useVoidPayroll`

`useJournal.ts`:
- `useOpExByPeriod(periodStart, periodEnd)` — for P&L extension
- `useOtherByPeriod(periodStart, periodEnd)` — for P&L extension

- [ ] **Step 2: Update index.ts barrel export**

Add new hook exports to `src/hooks/convex/index.ts`.

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/hooks/convex/useExpenses.ts src/hooks/convex/useReimbursements.ts src/hooks/convex/useAccounts.ts src/hooks/convex/usePayroll.ts src/hooks/convex/useJournal.ts src/hooks/convex/index.ts
git commit -m "feat(hooks): frontend hooks for expenses, reimbursements, payroll, journal"
```

---

### Task 13: Add Routes to App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add lazy imports for 3 new pages**

```typescript
const ExpenseManager = lazyWithPreload(() =>
  import('./pages/ExpenseManager').then(m => ({ default: m.ExpenseManager }))
);
const ReimbursementManager = lazyWithPreload(() =>
  import('./pages/ReimbursementManager').then(m => ({ default: m.ReimbursementManager }))
);
const ExpenseAnalytics = lazyWithPreload(() =>
  import('./pages/ExpenseAnalytics').then(m => ({ default: m.ExpenseAnalytics }))
);
```

- [ ] **Step 2: Add routes inside the standard Layout section**

```tsx
{/* Expenses - All roles can submit */}
<Route
  path="expenses"
  element={
    <ProtectedRoute requiredPermission="canSubmitExpenses">
      <ExpenseManager />
    </ProtectedRoute>
  }
/>

{/* Reimbursements - Admin only */}
<Route
  path="reimbursements"
  element={
    <ProtectedRoute requiredPermission="canManageReimbursements">
      <ReimbursementManager />
    </ProtectedRoute>
  }
/>

{/* Expense Analytics - Manager and Admin */}
<Route
  path="expense-analytics"
  element={
    <ProtectedRoute requiredPermission="canAccessExpenseAnalytics">
      <ExpenseAnalytics />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Add ProtectedRoute permission type support (if needed)**

Check if `ProtectedRoute` component's `requiredPermission` prop type needs updating to include the new permission names. If it reads from `ROLE_PERMISSIONS` dynamically, no change needed. If it has a static union type, add the 4 new permissions.

- [ ] **Step 4: Add navigation links to sidebar/header**

Add links to `/expenses`, `/reimbursements`, and `/expense-analytics` in the navigation component (likely `src/components/layout/Header.tsx` or similar). Follow existing navigation patterns:
- Expenses: visible to all roles (canSubmitExpenses)
- Reimbursements: admin only (canManageReimbursements)
- Expense Analytics: manager + admin (canAccessExpenseAnalytics)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/auth/ProtectedRoute.tsx
git commit -m "feat(routing): add expense, reimbursement, and analytics routes"
```

---

## Chunk 5: Frontend Pages — Expense Manager

### Task 14: Expense Form Component

**Files:**
- Create: `src/components/expenses/ExpenseForm.tsx`
- Create: `src/components/expenses/StatusBadge.tsx`
- Create: `src/components/expenses/FraudFlags.tsx`

- [ ] **Step 1: Build ExpenseForm with shadcn/ui components**

Form fields:
- Description (Input)
- Amount in IDR (Input type=number)
- Category/GL Account (Select dropdown from `useOpExAccounts()`)
- Expense Date (Input type=date, max=today)
- Payment Method (Select: personal_cash, personal_transfer, company_card)
- Vendor Name (Input)
- Receipt Upload (file input for images, client-side SHA-256 hash via `crypto.subtle`)
- Receipt hint: "Required" badge if amount > 50K, "Recommended" if ≤ 50K

Follow existing form patterns in the codebase (e.g., OrderCreate form structure).

- [ ] **Step 2: Build StatusBadge component**

Map expense statuses to colors:
- draft → gray
- submitted → blue
- approved → green
- awaiting_payment → amber
- reimbursed → emerald
- rejected → red
- voided → slate

- [ ] **Step 3: Build FraudFlags component**

Display contextual badges:
- Late submission → amber "Late (X days)"
- Duplicate warning → amber "Possible duplicate: EXP-XXXX"
- New vendor → blue "New vendor"
- Split detection → red "Split alert"

- [ ] **Step 4: Commit**

```bash
git add src/components/expenses/ExpenseForm.tsx src/components/expenses/StatusBadge.tsx src/components/expenses/FraudFlags.tsx
git commit -m "feat(ui): expense form, status badge, and fraud flag components"
```

---

### Task 15: Expense Manager Page

**Files:**
- Create: `src/pages/ExpenseManager.tsx`
- Create: `src/components/expenses/ExpenseCard.tsx`

- [ ] **Step 1: Build ExpenseManager page with tab navigation**

Tabs (conditional visibility):
1. **My Expenses** — all roles see this. Expense list with status filter + "New Expense" button
2. **Approvals** — manager, admin. Pending approval queue with expandable ExpenseCards
3. **All Expenses** — admin only. Full audit view with date/status/employee filters

Each tab uses the corresponding query from `useExpenses.ts`.

- [ ] **Step 2: Build ExpenseCard for approval queue**

Expandable card showing:
- Expense number, date, amount, vendor, category
- StatusBadge
- FraudFlags (if any)
- Receipt image (if attached, via `ctx.storage.getUrl`)
- Rejection chain (if `previousExpenseId` exists)
- Approve / Reject buttons with confirmation dialog
- Comment field (mandatory for ≥ 500K approval)

- [ ] **Step 3: Wire up mutations**

- "Save Draft" → `saveDraft` mutation
- "Submit" → `submit` mutation
- "Approve" → `approve` mutation with optimistic UI
- "Reject" → `reject` mutation with reason dialog
- "Void" → `void` mutation with confirmation

- [ ] **Step 4: Run build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/ExpenseManager.tsx src/components/expenses/ExpenseCard.tsx
git commit -m "feat(ui): ExpenseManager page with submission, approval queue, and admin audit"
```

---

## Chunk 6: Frontend Pages — Reimbursement + Analytics

### Task 16: Reimbursement Manager Page

**Files:**
- Create: `src/pages/ReimbursementManager.tsx`
- Create: `src/components/reimbursements/BatchCard.tsx`
- Create: `src/components/reimbursements/ConfirmationForm.tsx`

- [ ] **Step 1: Build ReimbursementManager page**

Two sections:
1. **Pending Queue** — approved expenses grouped by employee, with bank details and running totals. "Create Batch" button per employee.
2. **Batch History** — searchable by RMB code or BCA reference. Each batch shows status, linked expenses, void button.

- [ ] **Step 2: Build BatchCard**

Shows: RMB code, employee name, total, status, transfer date, BCA reference. Expandable to show linked expenses.

- [ ] **Step 3: Build ConfirmationForm**

Fields:
- BCA Reference Number (Input)
- Transfer Date (Input type=date)
- Source Bank Account (Select from `useBankAccounts()`)
- Journal Entry preview (read-only: DR 2200, CR 1100 with amounts)
- Confirm button

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/ReimbursementManager.tsx src/components/reimbursements/BatchCard.tsx src/components/reimbursements/ConfirmationForm.tsx
git commit -m "feat(ui): ReimbursementManager page with batch creation and confirmation"
```

---

### Task 17: Expense Analytics Page

**Files:**
- Create: `src/pages/ExpenseAnalytics.tsx`

- [ ] **Step 1: Build ExpenseAnalytics dashboard**

Dashboard cards (using Recharts — already in `package.json`):
- Total OpEx (period) — big number card
- Spend by Category — bar chart (Recharts BarChart)
- Spend by Employee — horizontal bar
- Monthly Trend — line chart (6-month)
- Pending Reimbursements total — big number
- Average Approval Time — big number (days)
- Active Fraud Flags count — with link to details

Data from `useJournal.ts` (OpEx by period) + `useExpenses.ts` (approval time, fraud flags).

Follow the charting patterns in `src/pages/SalesAnalytics.tsx` which already uses Recharts.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/ExpenseAnalytics.tsx
git commit -m "feat(ui): ExpenseAnalytics dashboard with Recharts visualizations"
```

---

## Chunk 7: P&L Extension + Final Verification

### Task 18: Extend Income Statement with OpEx

**Files:**
- Modify: `convex/reports/incomeStatement.ts`
- Modify: `src/hooks/convex/useFinancials.ts`
- Modify: `src/pages/FinancialStatement.tsx`

- [ ] **Step 1: Add OpEx + Other to income statement return type**

In `convex/reports/incomeStatement.ts`, extend the `WeekData` and return types to include:

```typescript
opex: Array<{ code: string; name: string; total: number }>;
totalOpEx: number;
ebit: number;
ebitMarginPercent: number | null;
otherItems: Array<{ code: string; name: string; total: number }>;
totalOther: number;
netIncome: number;
netMarginPercent: number | null;
```

In `fetchAndAggregate`, after computing grossProfit, add parallel queries for OpEx and Other from `journalEntryLines` (same pattern as `convex/journal/queries.ts:getOpExByPeriod`). Compute EBIT = Gross Profit - Total OpEx, Net Income = EBIT - Other Expense.

- [ ] **Step 2: Update useFinancials.ts**

The existing hook should already pass through the new return fields since it uses a generic shape. Verify the `data` merge handles the new fields.

- [ ] **Step 3: Extend FinancialStatement.tsx P&L table**

Below Gross Profit row, add:

```
─────────────────────────────────────────────────
- Operating Expenses
    6100 Salaries & Wages           Rp X,XXX,XXX
    6200 Rent & Utilities           Rp X,XXX,XXX
    ...each OpEx account with non-zero balance...
  TOTAL OPERATING EXPENSES          Rp X,XXX,XXX
= EBIT (Operating Profit)          Rp X,XXX,XXX
  EBIT MARGIN                      XX.X%
- Other Income/Expense (7xxx)
    ...each Other account with non-zero balance...
= NET INCOME                        Rp X,XXX,XXX
  NET MARGIN                        XX.X%
```

Use the existing `PLRow`, `SectionHeaderRow` components from `@/components/financials/`.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/reports/incomeStatement.ts src/hooks/convex/useFinancials.ts src/pages/FinancialStatement.tsx
git commit -m "feat(financials): extend P&L with OpEx, EBIT, Other, Net Income"
```

---

### Task 19: Full Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (existing 690 + new ~60 tests)

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 5: Commit any fixes**

If any verification step fails, fix and commit:
```bash
git commit -m "fix: resolve type/lint/test issues from verification"
```

---

### Task 20: Documentation Updates

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/SCHEMA.md`
- Modify: `docs/API_REFERENCE.md`

- [ ] **Step 1: Update CHANGELOG.md**

Add entry for the expense & accounting system feature.

- [ ] **Step 2: Update SCHEMA.md**

Document 10 new tables, their fields, indexes, and relationships.

- [ ] **Step 3: Update API_REFERENCE.md**

Document new queries and mutations across all 7 new backend directories.

- [ ] **Step 4: Commit**

```bash
git add docs/CHANGELOG.md docs/SCHEMA.md docs/API_REFERENCE.md
git commit -m "docs: add expense & accounting system to changelog, schema, and API reference"
```

---

## Implementation Waves

### Wave 1: Backend Foundation [SEQUENTIAL]
| Task | Description | Files |
|------|------------|-------|
| Task 1 | Schema tables | `convex/schema.ts` |
| Task 2 | Counter helper | `convex/counters/helpers.ts` |
| Task 3 | Chart of Accounts | `convex/accounts/` |
| Task 4 | Bank accounts | `convex/bankAccounts/` |
| Task 5 | Journal entries | `convex/journal/` |

### Wave 2: Expense Lifecycle [SEQUENTIAL after Wave 1]
| Task | Description | Files |
|------|------------|-------|
| Task 6 | Expense helpers | `convex/expenses/helpers.ts` |
| Task 7 | Expense mutations | `convex/expenses/mutations.ts` |
| Task 8 | Expense queries | `convex/expenses/queries.ts` |

### Wave 3: Reimbursement + Payroll [PARALLEL after Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| Agent A | Task 9: Reimbursements | `convex/reimbursements/` |
| Agent B | Task 10: Payroll | `convex/payroll/` |

### Wave 4: Frontend Foundation [PARALLEL after Wave 3]
| Agent | Task | Files |
|-------|------|-------|
| Agent A | Task 11: Permissions | `src/lib/types.ts` |
| Agent B | Task 12: Hooks | `src/hooks/convex/` |
| Agent C | Task 13: Routes | `src/App.tsx` |

### Wave 5: Frontend Pages [PARALLEL after Wave 4]
| Agent | Task | Files |
|-------|------|-------|
| Agent A | Tasks 14-15: Expense Manager | `src/pages/ExpenseManager.tsx`, `src/components/expenses/` |
| Agent B | Task 16: Reimbursement Manager | `src/pages/ReimbursementManager.tsx`, `src/components/reimbursements/` |
| Agent C | Task 17: Expense Analytics | `src/pages/ExpenseAnalytics.tsx` |

### Wave 6: Integration + Verification [SEQUENTIAL after Wave 5]
| Task | Description |
|------|------------|
| Task 18 | P&L extension |
| Task 19 | Full verification |
| Task 20 | Documentation |

## Documentation Updates
- [ ] CHANGELOG.md (always required)
- [ ] SCHEMA.md (10 new tables)
- [ ] API_REFERENCE.md (7 new backend directories)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] `npx vitest run` — all tests pass (existing + ~60 new)
- [ ] `npm run lint` passes
- [ ] All 10 new schema tables have at least one query and one mutation
- [ ] Expense lifecycle: Draft → Submit → Approve → AwaitingPayment → Reimbursed works end-to-end
- [ ] Company card path: Draft → Submit → Approve (terminal) with correct JE (DR OpEx, CR Cash)
- [ ] Self-approval is blocked at backend level
- [ ] DoA threshold enforced (≤500K manager, >500K admin only)
- [ ] Receipt required for >50K enforced at backend
- [ ] Journal entries always balance (debits = credits)
- [ ] Reimbursement batching: create → confirm → verify JE → expenses marked reimbursed
- [ ] Batch void: reversing JE → expenses back to AwaitingPayment
- [ ] P&L extends through Net Income with OpEx from journal entries
- [ ] All 4 new permission flags wired into ROLE_PERMISSIONS and routes

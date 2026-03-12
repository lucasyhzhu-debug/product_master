# Phase 41: Schema, Seed & Counters - Research

**Researched:** 2026-03-12
**Domain:** Convex schema definition, seed functions, atomic counter patterns
**Confidence:** HIGH

## Summary

This phase delivers the foundational data layer for the v1.7 Expense & Accounting system: 10 new Convex tables, 1 modified table (users), a Chart of Accounts seed function with 36 PSAK-aligned accounts, and an atomic daily counter helper for sequential ID generation (EXP-MMDD-NNN, RMB-MMDD-NNN, JE-MMDD-NNN).

The codebase has well-established patterns for all three concerns. Schema definition follows `defineTable` + `v.union(v.literal(...))` patterns already used in 65 tables. Seed functions follow the idempotent check-by-unique-key-then-insert-or-update pattern used by `productionUnitTypes:seedDefaults`, `menuProducts:seedFixedProducts`, and `dispatchPlanner:seedDefaults`. The counter pattern is new to the codebase but straightforward given Convex's serializable mutation guarantees (OCC with automatic retry prevents counter collisions without any manual locking).

**Primary recommendation:** Follow existing codebase patterns exactly. The `counters` table with a compound `by_prefix_date` index + a `getNextNumber(ctx, prefix)` helper function that atomically reads-increments-returns is the core new infrastructure. Use `getWibComponents` from `convex/lib/periodRange.ts` for WIB-correct MMDD date formatting in the counter.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `accounts` table: code (string, unique indexed), name, type (7 union literals), category, isActive, isSystem, description (optional). Indexes: by_code, by_type, by_active_type
- `expenses` table: full field list per PRD spec including expenseNumber, submittedBy, amount, accountId, expenseDate, description, vendorName, paymentMethod (3 literals), receiptFileId, receiptImageHash, status (7 literals), lateSubmission, duplicateWarning, plus approval/rejection/resubmission fields. Indexes: by_submitter_status, by_status, by_amount_date_submitter, by_receipt_hash, by_expense_number
- `expenseStatusHistory` table: expenseId, fromStatus, toStatus, changedBy, changedAt, comment. Index: by_expense
- `reimbursementBatches` table: batchNumber, employeeUserId, totalAmount, status (3 literals), bank fields, confirmation/void fields. Indexes: by_batch_number, by_employee_status, by_status
- `reimbursementBatchItems` table: batchId, expenseId. Indexes: by_batch, by_expense
- `journalEntries` table: entryNumber, date, description, sourceType (6 literals), sourceId, isReversed, reversedByEntryId, createdBy, createdAt. Indexes: by_entry_number, by_source, by_date
- `journalEntryLines` table: journalEntryId, accountId, entryDate (denormalized from parent), debitAmount, creditAmount, description. Indexes: by_journal_entry, by_account_entryDate
- `bankAccounts` table: name, bankName, accountNumber, isActive. Index: by_active
- `payrollEntries` table: employeeType (2 literals), frequency (2 literals), amount, periodStart, periodEnd, description, attachmentFileId, createdBy, createdAt. Indexes: by_period, by_employee_type
- `counters` table: prefix (string), date (string MMDD), lastSequence (number). Index: by_prefix_date (unique compound)
- `users` table modification: add bankAccountNumber (optional string), bankName (optional string)
- 36 accounts total: 7 Revenue (4100-4700), 4 COGS (5100-5400), 11 OpEx (6100-6990), 3 Other (7100-7900), 6 Assets (1100-1600), 5 Liabilities (2100-2500), 3 Equity (3100-3300)
- Seed function must be idempotent (check by code before inserting)
- System accounts cannot be deleted via any mutation
- Counter format: PREFIX-MMDD-NNN (e.g., EXP-0312-001)
- journalEntryLines.entryDate copied from parent journalEntries.date

### Claude's Discretion
- Schema validator organization (inline vs extracted helpers)
- File organization for new table modules (flat vs nested directories)
- Specific test structure for seed idempotency and counter atomicity
- Whether to create empty query/mutation stubs or just schema + seed

### Deferred Ideas (OUT OF SCOPE)
- Balance Sheet view (query journalEntryLines by 1xxx-3xxx accounts) -- future milestone
- Cash Flow Statement (query entries touching 1100) -- future milestone
- Monthly budgets per GL -- add budgets table later
- OCR receipt extraction -- receipt images stored, extraction step added later
- Bank statement import/matching -- bankAccounts + bankReference fields ready
- Multi-currency support -- IDR-only for now
- Recurring expenses -- add recurrence fields later
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COA-04 | System seeds 36 default accounts (4xxx Revenue, 5xxx COGS, 6xxx OpEx, 7xxx Other, 1xxx-3xxx Balance Sheet) on first run via `accounts:seedDefaults` | Seed pattern from `productionUnitTypes:seedDefaults` -- idempotent check-by-code-then-upsert. Full 36-account list in PRD Section 2. |
| COA-05 | System accounts (isSystem: true) cannot be deleted by users | Schema includes `isSystem: boolean` field. Delete mutation must check `isSystem` and throw. No delete mutation in this phase (schema-only), but seed must set `isSystem: true` on all 36 defaults. |
| EXP-06 | Expense numbers follow EXP-MMDD-NNN format with atomic daily counter | `counters` table + `getNextNumber(ctx, "EXP")` helper. Convex OCC guarantees atomicity. Uses WIB timezone for MMDD. |
| JE-04 | Journal entry lines denormalize entryDate from parent for Convex index-based period queries | `journalEntryLines.entryDate` field + `by_account_entryDate` compound index. Documented in schema definition. |
| JE-05 | Journal entries use JE-MMDD-NNN format with atomic daily counter | Same `counters` table + `getNextNumber(ctx, "JE")` helper reused from EXP-06 infrastructure. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Schema definition, mutations, queries | Already in use -- 65 existing tables |
| convex/values | (bundled) | `v.string()`, `v.union()`, `v.literal()` validators | Only way to define Convex schema types |
| Vitest | ^4.0.18 | Unit tests for counter helper and seed | Already configured in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| convex/lib/periodRange.ts | (internal) | `getWibComponents()` for WIB-correct MMDD dates | Counter MMDD date generation |
| convex/lib/auth.ts | (internal) | `requireRole()` for protected mutations | Seed function auth (admin-only) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `counters` table | Scan-and-count like orders | Orders pattern scans all same-day records. Counter table is O(1) read + atomic increment -- better for high-throughput prefixes |
| WIB date in counter | UTC date | Project uses WIB everywhere (periodRange.ts, order numbers). Must stay consistent |

**Installation:**
No new packages needed. All infrastructure exists.

## Architecture Patterns

### Recommended File Structure
```
convex/
  accounts/
    mutations.ts        # seedDefaults (+ future CRUD in Phase 43)
    queries.ts          # (empty stub or omit -- Phase 43 adds list/getById)
  expenses/             # (empty directory or omit -- Phase 44+)
  journalEntries/       # (empty directory or omit -- Phase 42+)
  bankAccounts/         # (empty directory or omit -- Phase 46+)
  payrollEntries/       # (empty directory or omit -- Phase 47+)
  reimbursementBatches/ # (empty directory or omit -- Phase 46+)
  lib/
    counter.ts          # getNextNumber(ctx, prefix) helper
    periodRange.ts      # (existing -- has getWibComponents)
    auth.ts             # (existing -- has requireRole)
  schema.ts             # Add 10 new tables + modify users
```

**Recommendation for discretion items:**
- **File organization:** Create only `convex/accounts/mutations.ts` and `convex/lib/counter.ts` in this phase. Do NOT create empty directories or stubs for future phases -- they add noise and will be created when needed.
- **Validator organization:** Define union validators inline in schema.ts (matching existing `externalSource` pattern). Extract to shared constants only if the same union is used in 3+ places. For this phase, `accountType` is the main candidate for extraction (used in schema + seed), but inline is fine for 1-2 uses.

### Pattern 1: Idempotent Seed Function
**What:** Mutation that inserts default records, skipping any that already exist by unique key.
**When to use:** First-run setup of reference data (accounts, unit types, channels).
**Example:**
```typescript
// Source: convex/productionUnitTypes/mutations.ts (existing pattern)
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const defaults = [
      { code: "6100", name: "Salaries & Wages", type: "opex" as const, ... },
      // ...35 more
    ];
    const results = [];
    for (const account of defaults) {
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_code", (q) => q.eq("code", account.code))
        .first();
      if (existing) {
        results.push({ code: account.code, action: "already_exists" });
      } else {
        const id = await ctx.db.insert("accounts", account);
        results.push({ code: account.code, action: "created", id });
      }
    }
    return results;
  },
});
```

### Pattern 2: Atomic Daily Counter
**What:** Read counter row, increment, return formatted number -- all in one mutation.
**When to use:** Generating sequential IDs like EXP-MMDD-NNN, JE-MMDD-NNN, RMB-MMDD-NNN.
**Example:**
```typescript
// Source: New pattern for convex/lib/counter.ts
import type { MutationCtx } from "../_generated/server";
import { getWibComponents } from "./periodRange";

export async function getNextNumber(
  ctx: MutationCtx,
  prefix: string
): Promise<string> {
  const { month, day } = getWibComponents(Date.now());
  const dateStr = `${String(month + 1).padStart(2, "0")}${String(day).padStart(2, "0")}`;

  const counter = await ctx.db
    .query("counters")
    .withIndex("by_prefix_date", (q) =>
      q.eq("prefix", prefix).eq("date", dateStr)
    )
    .unique();

  let sequence: number;
  if (counter) {
    sequence = counter.lastSequence + 1;
    await ctx.db.patch(counter._id, { lastSequence: sequence });
  } else {
    sequence = 1;
    await ctx.db.insert("counters", {
      prefix,
      date: dateStr,
      lastSequence: sequence,
    });
  }

  return `${prefix}-${dateStr}-${String(sequence).padStart(3, "0")}`;
}
```

### Pattern 3: Schema Union Types
**What:** Use `v.union(v.literal(...))` for fixed-set string fields.
**When to use:** Status fields, type fields, category enums.
**Example:**
```typescript
// Source: convex/schema.ts (externalSource pattern)
type: v.union(
  v.literal("asset"),
  v.literal("liability"),
  v.literal("equity"),
  v.literal("revenue"),
  v.literal("cogs"),
  v.literal("opex"),
  v.literal("other")
),
```

### Anti-Patterns to Avoid
- **Using `new Date()` for MMDD without WIB offset:** Convex runs in UTC. `new Date()` gives UTC date, which is 7 hours behind WIB. At 1am WIB the UTC date is still yesterday. Use `getWibComponents(Date.now())` instead.
- **Scanning all records for sequence number:** The existing order number generation scans all same-day orders. This is O(n). The new counter pattern is O(1) read + write.
- **Creating empty directories/stubs "for future phases":** Adds noise, causes confusion about what's implemented vs planned. Create files only when they contain real code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WIB date components | Custom UTC+7 math | `getWibComponents()` from `convex/lib/periodRange.ts` | Already tested, handles edge cases (midnight rollover, month boundaries) |
| Auth checks | Manual session/token validation | `requireRole(ctx, args.token, [...])` from `convex/lib/auth.ts` | Established pattern, handles expiry, lockout, role checks |
| Unique constraint on code | Manual check + insert | Convex `withIndex("by_code", q => q.eq("code", x)).first()` + conditional insert | Convex has no native unique constraint -- index + check-first is the established pattern |
| Atomic counter increment | Locking / external service | Convex OCC serializable mutations | Convex mutations are automatically serializable with retry on conflict |

**Key insight:** Convex OCC provides serializable execution for all mutations. A single mutation that reads a counter row and increments it is guaranteed atomic without any manual locking. If two mutations race, one retries automatically. This is a fundamental Convex guarantee, not a workaround.

## Common Pitfalls

### Pitfall 1: Schema deployment adds ALL tables at once
**What goes wrong:** Adding 10 tables to schema.ts in one push can temporarily break the dev environment if there are typos in validators.
**Why it happens:** `npx convex dev` validates entire schema on push. One bad `v.literal` breaks all tables.
**How to avoid:** Ensure each table definition compiles locally with `npm run type-check` before deploying. Add tables in a single well-tested commit.
**Warning signs:** Red errors in `npx convex dev` terminal after schema change.

### Pitfall 2: Index count approaching limits
**What goes wrong:** Each Convex table can have up to 32 indexes. Currently at 150 indexes across 65 tables. Adding 10 tables with ~18 new indexes brings total to ~168.
**Why it happens:** Each new table has between 1-5 indexes. This is well within Convex per-table limits (max 32/table).
**How to avoid:** Count indexes per table. The tables with most indexes are `expenses` (5) and `journalEntries` (3). All well under 32.
**Warning signs:** Convex deploy error mentioning index limits.

### Pitfall 3: Users table modification requires backward compatibility
**What goes wrong:** Adding `bankAccountNumber` and `bankName` as required fields would break existing user records.
**Why it happens:** Existing users don't have bank details.
**How to avoid:** Both fields are `v.optional(v.string())`. Existing records are unaffected. No migration needed.
**Warning signs:** Deploy error on users table, or runtime errors on user queries.

### Pitfall 4: Counter MMDD date uses UTC instead of WIB
**What goes wrong:** At 1:00 AM WIB (6:00 PM UTC previous day), counter date is off by one day. Expense numbers show yesterday's date.
**Why it happens:** `Date.now()` returns UTC epoch. `new Date()` formats in UTC on Convex server.
**How to avoid:** Use `getWibComponents(Date.now())` which applies +7 hour offset before extracting month/day.
**Warning signs:** Counter numbers with wrong date, especially between midnight and 7am WIB.

### Pitfall 5: Seed function not truly idempotent
**What goes wrong:** Running seed twice creates duplicates.
**Why it happens:** Using `ctx.db.insert()` without checking for existing records first.
**How to avoid:** Always query by unique key (code) before inserting. The pattern is: query by_code index, if exists skip/update, if not insert.
**Warning signs:** Duplicate accounts in the database after re-running seed.

### Pitfall 6: payrollEntries missing void fields in schema
**What goes wrong:** Phase 47 (PAY-03) needs to void payroll entries but the schema has no status/void fields.
**Why it happens:** The PRD data model section lists only the "happy path" fields. The void behavior is described in a note below but the fields aren't in the schema definition.
**How to avoid:** Add `status`, `voidedBy`, `voidedAt`, `voidReason`, and `journalEntryId` fields to `payrollEntries` NOW. This prevents a schema migration later. The PRD Section 10 describes payroll void functionality that requires these fields.
**Warning signs:** Phase 47 needs to add fields to an existing table.

### Pitfall 7: journalEntries.sourceId as string vs Id type
**What goes wrong:** Using `v.string()` for sourceId loses type safety but using `v.id()` requires knowing the table at compile time.
**Why it happens:** sourceId can reference expenses, reimbursement batches, or payroll entries (different tables).
**How to avoid:** Use `v.optional(v.string())` as specified in the PRD. Store the Convex ID string value. The sourceType field disambiguates which table to look up. This is the pragmatic approach when a field references multiple tables.
**Warning signs:** TypeScript errors trying to use a string where `Id<"expenses">` is expected. Cast at lookup time.

## Code Examples

### Full accounts table schema definition
```typescript
// Source: PRD Section 3 + CONTEXT.md locked decisions
accounts: defineTable({
  code: v.string(),
  name: v.string(),
  type: v.union(
    v.literal("asset"),
    v.literal("liability"),
    v.literal("equity"),
    v.literal("revenue"),
    v.literal("cogs"),
    v.literal("opex"),
    v.literal("other")
  ),
  category: v.string(),
  isActive: v.boolean(),
  isSystem: v.boolean(),
  description: v.optional(v.string()),
})
  .index("by_code", ["code"])
  .index("by_type", ["type"])
  .index("by_active_type", ["isActive", "type"]),
```

### Full counters table schema definition
```typescript
// Source: PRD Section 3
counters: defineTable({
  prefix: v.string(),
  date: v.string(),       // MMDD format, WIB timezone
  lastSequence: v.number(),
})
  .index("by_prefix_date", ["prefix", "date"]),
```

### journalEntryLines with denormalized entryDate
```typescript
// Source: PRD Section 3 + JE-04 requirement
journalEntryLines: defineTable({
  journalEntryId: v.id("journalEntries"),
  accountId: v.id("accounts"),
  entryDate: v.number(), // Denormalized from journalEntries.date -- required for Convex index queries
  debitAmount: v.number(),
  creditAmount: v.number(),
  description: v.optional(v.string()),
})
  .index("by_journal_entry", ["journalEntryId"])
  .index("by_account_entryDate", ["accountId", "entryDate"]),
```

### Users table modification (add bank details)
```typescript
// Source: PRD Section 3
users: defineTable({
  // ...existing fields unchanged...
  name: v.string(),
  pinHash: v.string(),
  role: v.union(v.literal("kitchen"), v.literal("order_staff"), v.literal("manager"), v.literal("admin")),
  avatarUrl: v.optional(v.string()),
  isActive: v.boolean(),
  locationId: v.optional(v.string()),
  failedAttempts: v.number(),
  lockedUntil: v.optional(v.number()),
  lastLoginAt: v.optional(v.number()),
  createdAt: v.number(),
  // NEW: Bank details for reimbursement
  bankAccountNumber: v.optional(v.string()),
  bankName: v.optional(v.string()),
})
  .index("by_role", ["role"])
  .index("by_active", ["isActive"]),
```

### Chart of Accounts seed data (all 36 accounts)
```typescript
// Source: PRD Section 2
const DEFAULT_ACCOUNTS = [
  // Revenue (4xxx) -- virtual accounts (values from real-time aggregation)
  { code: "4100", name: "Direct Sales", type: "revenue", category: "Revenue" },
  { code: "4200", name: "GoFood Revenue", type: "revenue", category: "Revenue" },
  { code: "4300", name: "Shopee Revenue", type: "revenue", category: "Revenue" },
  { code: "4400", name: "TikTok Revenue", type: "revenue", category: "Revenue" },
  { code: "4500", name: "K3Mart Revenue", type: "revenue", category: "Revenue" },
  { code: "4600", name: "Consignment Revenue", type: "revenue", category: "Revenue" },
  { code: "4700", name: "GrabFood Revenue", type: "revenue", category: "Revenue" },
  // COGS (5xxx) -- virtual accounts
  { code: "5100", name: "Production COGS", type: "cogs", category: "Cost of Goods Sold" },
  { code: "5200", name: "Packaging COGS", type: "cogs", category: "Cost of Goods Sold" },
  { code: "5300", name: "Commissions & Fees", type: "cogs", category: "Cost of Goods Sold" },
  { code: "5400", name: "Platform Ad Burn", type: "cogs", category: "Cost of Goods Sold" },
  // OpEx (6xxx) -- stored journal entries
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
  // Assets (1xxx)
  { code: "1100", name: "Cash (Bank Accounts)", type: "asset", category: "Assets" },
  { code: "1200", name: "Accounts Receivable", type: "asset", category: "Assets" },
  { code: "1300", name: "Inventory (Raw Materials)", type: "asset", category: "Assets" },
  { code: "1400", name: "Prepaid Expenses", type: "asset", category: "Assets" },
  { code: "1500", name: "Fixed Assets", type: "asset", category: "Assets" },
  { code: "1600", name: "Accumulated Depreciation", type: "asset", category: "Assets" },
  // Liabilities (2xxx)
  { code: "2100", name: "Accounts Payable", type: "liability", category: "Liabilities" },
  { code: "2200", name: "Employee Reimbursements Payable", type: "liability", category: "Liabilities" },
  { code: "2300", name: "Accrued Expenses", type: "liability", category: "Liabilities" },
  { code: "2400", name: "Tax Payable", type: "liability", category: "Liabilities" },
  { code: "2500", name: "Loans Payable", type: "liability", category: "Liabilities" },
  // Equity (3xxx)
  { code: "3100", name: "Owner's Capital", type: "equity", category: "Equity" },
  { code: "3200", name: "Retained Earnings", type: "equity", category: "Equity" },
  { code: "3300", name: "Current Period P&L", type: "equity", category: "Equity" },
];
// All default accounts: isSystem: true, isActive: true
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Order numbers via full-table scan | Dedicated counter table with atomic increment | This phase (new) | O(1) vs O(n) for ID generation |
| `new Date()` on Convex server (UTC) | `getWibComponents(Date.now())` for WIB dates | Established in v1.4 | Correct date boundaries for Indonesian timezone |
| Flat validators inline | Shared validators exported from schema.ts | Established in v1.3 | `externalSource`, `syncType` reused across modules |

**Note on existing order numbers:** The current `generateNextOrderNumber` in `convex/orders/helpers/customerResolution.ts` uses `new Date()` which gives UTC, not WIB. This is a pre-existing inconsistency. The new counter system should use WIB correctly from the start.

## Open Questions

1. **payrollEntries void fields**
   - What we know: PRD Section 10 describes void functionality (PAY-03: "Admin can void a payroll entry"). The schema definition in PRD Section 3 omits void fields.
   - What's unclear: Whether to add `status`, `voidedBy`, `voidedAt`, `voidReason`, `journalEntryId` fields now or defer to Phase 47.
   - Recommendation: **Add them now.** The schema is defined in this phase. Adding optional fields later is safe but requires a separate schema push. Including them now (as optional fields) is zero-cost and prevents a schema-modification step in Phase 47. Fields to add: `status: v.optional(v.union(v.literal("active"), v.literal("voided")))`, `voidedBy: v.optional(v.id("users"))`, `voidedAt: v.optional(v.number())`, `voidReason: v.optional(v.string())`, `journalEntryId: v.optional(v.id("journalEntries"))`.

2. **expenses.journalEntryId linkage**
   - What we know: Approval creates a journal entry linked to the expense via `journalEntries.sourceId`. But there's no reverse link from expense to its journal entry.
   - What's unclear: Whether to add `journalEntryId` to expenses table for direct lookup.
   - Recommendation: **Add `journalEntryId: v.optional(v.id("journalEntries"))` to expenses.** The `sourceId` approach on journalEntries requires a reverse lookup. A direct forward reference on expenses is cleaner for void operations (need to find the JE to mark as reversed).

3. **Seed function auth: token vs no token**
   - What we know: Existing seed functions are mixed -- `productionUnitTypes:seedDefaults` has no auth, `dispatchPlanner:seedDefaults` requires admin token.
   - What's unclear: Whether `accounts:seedDefaults` should require auth.
   - Recommendation: **No auth (args: {}).** Seed functions are run from Convex Dashboard Functions tab during initial setup. Requiring a token makes Dashboard execution awkward. The `productionUnitTypes:seedDefaults` pattern (no auth) is the simpler and more practical approach for initial setup functions.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COA-04 | seedDefaults creates 36 accounts, idempotent on re-run | unit | `npx vitest run convex/accounts/__tests__/seed.test.ts -x` | Wave 0 |
| COA-05 | System accounts (isSystem: true) cannot be deleted | unit | `npx vitest run convex/accounts/__tests__/seed.test.ts -x` | Wave 0 |
| EXP-06 | Counter generates EXP-MMDD-NNN format | unit | `npx vitest run convex/lib/__tests__/counter.test.ts -x` | Wave 0 |
| JE-04 | journalEntryLines schema includes entryDate field | unit (schema validation) | Schema compilation via `npm run type-check` | N/A (schema) |
| JE-05 | Counter generates JE-MMDD-NNN format | unit | `npx vitest run convex/lib/__tests__/counter.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run type-check`
- **Per wave merge:** `npm run test && npm run build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `convex/accounts/__tests__/seed.test.ts` -- covers COA-04, COA-05 (seed idempotency, isSystem flag)
- [ ] `convex/lib/__tests__/counter.test.ts` -- covers EXP-06, JE-05 (counter format, daily reset, WIB date, sequential increment)

Note: Counter atomicity (race condition prevention) is guaranteed by Convex OCC and does not need a unit test. The pure formatting logic (prefix + MMDD + NNN padding) is testable as a pure function.

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` -- Current 65-table schema with 150 indexes, union validator patterns
- `convex/productionUnitTypes/mutations.ts` -- Seed function pattern (idempotent, check-by-code)
- `convex/menuProducts/mutations.ts` -- Alternative seed pattern (seedFixedProducts)
- `convex/dispatchPlanner/mutations.ts` -- Auth-protected seed pattern
- `convex/lib/periodRange.ts` -- `getWibComponents()` for WIB timezone handling
- `convex/lib/auth.ts` -- `requireRole()` auth helper
- `convex/orders/helpers/customerResolution.ts` -- Existing order number generation (scan pattern)
- `convex/orders/helpers.ts` -- `generateOrderNumber()` pure formatting function
- `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md` -- Full PRD with all 36 accounts, schema definitions, and counter design
- [Convex OCC Documentation](https://docs.convex.dev/database/advanced/occ) -- Serializable mutation guarantee

### Secondary (MEDIUM confidence)
- Memory context (MEMORY.md) -- 150 index count, 65 tables, WIB patterns confirmed

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries and patterns already in codebase
- Architecture: HIGH -- extends existing Convex schema patterns with well-documented new tables
- Pitfalls: HIGH -- identified from direct codebase analysis and PRD inconsistency detection
- Counter pattern: HIGH -- Convex OCC documentation confirms serializable mutation guarantees

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- Convex schema patterns don't change rapidly)

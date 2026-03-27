# Phase 42: Journal Engine - Research

**Researched:** 2026-03-13
**Domain:** Double-entry accounting journal engine (Convex serverless backend)
**Confidence:** HIGH

## Summary

Phase 42 delivers the core double-entry journal engine: a `createJournalEntryWithLines` internal helper function and a `createReversalEntry` helper function, both located in `convex/lib/journalEngine.ts`. The helper validates debit/credit balance, denormalizes `entryDate` into journal entry lines, generates sequential JE-MMDD-NNN numbers via the `getNextNumber` counter infrastructure (Phase 41), and creates entries atomically. It also establishes the immutability contract: no update mutation exists for journalEntries or journalEntryLines -- the only correction path is creating a reversing entry.

This is a pure backend phase with no UI. The helpers are internal functions (not Convex-registered mutations/queries) that accept `MutationCtx` and are called by downstream mutation code in Phases 44-47 (expense approval, expense void, reimbursement confirm/void, payroll create/void). The scope is narrow and well-defined: two exported functions, comprehensive validation, and thorough unit tests.

The codebase has established patterns for exactly this type of helper. The `convex/orders/helpers/` directory contains 12 helper files that accept `MutationCtx` and encapsulate domain logic. The `convex/lib/` directory contains 11 utility modules. Both patterns demonstrate how to structure internal helpers that are called by registered mutations but not directly exposed as API endpoints.

**Primary recommendation:** Create `convex/lib/journalEngine.ts` with two exported async functions: `createJournalEntryWithLines(ctx, params)` and `createReversalEntry(ctx, originalEntryId, sourceType, createdBy)`. Use pure helper functions for validation (testable without `MutationCtx`). Import `getNextNumber` from `convex/lib/counter.ts` (Phase 41 dependency). Test the pure validation logic with Vitest; test the full creation flow with convex-test if feasible, otherwise rely on pure function tests + type checking.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `createJournalEntryWithLines` must validate that sum of all debit amounts equals sum of all credit amounts
- Validation happens before any database writes -- reject with clear error if imbalanced
- Each line has either debitAmount > 0 or creditAmount > 0 (not both)
- Minimum 2 lines per entry (at least one debit and one credit)
- No `update` or `patch` mutation exists for journalEntries or journalEntryLines
- The only way to correct an entry is to create a reversing entry
- Once created, journal entry fields and lines are permanent
- Reversal entries MUST post to the same accounting period (date) as the original entry
- Do NOT use `Date.now()` for the reversal entry date
- The reversal copies the original entry's `date` field
- Original entry is marked `isReversed: true` and linked via `reversedByEntryId`
- ALL journal entry creation goes through `createJournalEntryWithLines`
- No direct `ctx.db.insert("journalEntries")` or `ctx.db.insert("journalEntryLines")` anywhere else
- `sourceType`: "expense_approval" | "expense_void" | "reimbursement" | "reimbursement_void" | "payroll" | "payroll_void" (6 downstream types; "manual" exists in schema but no mutation this phase)
- `sourceId`: optional string referencing the source record
- entryNumber: JE-MMDD-NNN format via `getNextNumber(ctx, "JE")` from `convex/lib/counter.ts`
- Lines should NOT require entryDate -- the helper copies it from the parent entry's `date` field
- Auth is NOT checked in the helper -- the calling mutation handles auth
- Error messages should be clear: "Journal entry imbalanced: debits (X) != credits (Y)"

### Claude's Discretion
- Internal function organization (single file vs multiple helpers)
- Whether to export line-building convenience functions (e.g., `buildDebitLine`, `buildCreditLine`)
- Test granularity for balance validation edge cases
- Whether `createReversalEntry` is a separate exported function or part of `createJournalEntryWithLines`

### Deferred Ideas (OUT OF SCOPE)
- Manual journal entries (sourceType: "manual") -- the type exists in schema but no UI or mutation in this phase
- GL balance queries (sum debits/credits by account for a period) -- Phase 49
- Journal entry listing UI -- Phase 43+ or later
- Audit report export -- future milestone
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| JE-01 | All journal entries enforce double-entry integrity (total debits = total credits) | Pure validation function `validateJournalLines` that checks sum equality before any db writes. Throws with clear error including both totals. Also validates: min 2 lines, each line has exactly one nonzero amount, no negative amounts. |
| JE-02 | Journal entries are immutable -- no update mutation exists; corrections require reversing entries | No update/patch mutation is created. `createReversalEntry` creates a new entry with swapped debit/credit amounts and marks the original as reversed. Enforced by convention + code review (no `ctx.db.patch` on journalEntries/journalEntryLines in codebase). |
| JE-03 | Reversal entries post to the same accounting period as the original entry (not Date.now()) | `createReversalEntry` reads the original entry's `date` field and uses it as the reversal entry's `date`. The `createdAt` field uses `Date.now()` (insertion timestamp), but the business `date` matches the original. |
| JE-06 | All JE creation goes through a single `createJournalEntryWithLines` helper that enforces balance validation and denormalization | Single function is the only code path that calls `ctx.db.insert("journalEntries")` and `ctx.db.insert("journalEntryLines")`. `createReversalEntry` delegates to `createJournalEntryWithLines` internally. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Database operations via `MutationCtx` | Already in use -- 75 tables in schema |
| TypeScript | ~5.9 | Type-safe function signatures and return types | Project standard |
| Vitest | ^4.0.18 | Unit tests for validation logic | Already configured in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `convex/lib/counter.ts` | (Phase 41) | `getNextNumber(ctx, "JE")` for entry number generation | Called by `createJournalEntryWithLines` |
| `convex/lib/periodRange.ts` | (internal) | WIB timezone helpers (used by counter.ts) | Indirect dependency via counter |
| `convex-test` | ^0.0.41 | Integration tests with mocked Convex DB | Optional -- for testing full creation flow |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Internal helper function | Registered Convex `internalMutation` | Helper is simpler -- no API registration overhead, no separate function call overhead, and `internalMutation` is unnecessary since the helper is always called within an existing mutation context |
| Single file (`journalEngine.ts`) | Directory (`journalEntries/helpers/`) | Single file is cleaner for 2 exported functions + 2-3 pure validation helpers. A directory is overkill for this scope. |
| Pure validation + ctx creation | All-in-one validated insert | Separating pure validation enables easy unit testing without ctx mocking |

**Installation:** No new packages needed. All dependencies are already in the project.

## Architecture Patterns

### Recommended Project Structure
```
convex/
  lib/
    journalEngine.ts         # createJournalEntryWithLines, createReversalEntry
    __tests__/
      journalEngine.test.ts  # Pure validation tests + optional convex-test integration
    counter.ts               # getNextNumber (Phase 41 dependency)
```

### Pattern 1: Internal Helper with MutationCtx
**What:** A non-registered function that accepts `MutationCtx` as first argument and performs database operations. Not exposed as an API endpoint.
**When to use:** When domain logic should be shared across multiple registered mutations but should not be callable externally.
**Example:**
```typescript
// Source: convex/orders/helpers/statusTransitions.ts (existing codebase pattern)
import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

export async function transitionOrderStatus(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  newStatus: OrderStatus,
  // ...
): Promise<void> {
  // Reads from ctx.db, validates, writes to ctx.db
}
```

**Applied to journal engine:**
```typescript
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getNextNumber } from "./counter";

// Types for the helper's input
interface JournalLine {
  accountId: Id<"accounts">;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

interface CreateJournalEntryParams {
  date: number;
  description: string;
  sourceType: "expense_approval" | "expense_void" | "reimbursement"
    | "reimbursement_void" | "payroll" | "payroll_void";
  sourceId?: string;
  createdBy: Id<"users">;
  lines: JournalLine[];
}

export async function createJournalEntryWithLines(
  ctx: MutationCtx,
  params: CreateJournalEntryParams,
): Promise<Id<"journalEntries">> {
  // 1. Validate lines (pure function call)
  validateJournalLines(params.lines);

  // 2. Generate entry number
  const entryNumber = await getNextNumber(ctx, "JE");

  // 3. Insert journal entry header
  const entryId = await ctx.db.insert("journalEntries", {
    entryNumber,
    date: params.date,
    description: params.description,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    isReversed: false,
    createdBy: params.createdBy,
    createdAt: Date.now(),
  });

  // 4. Insert lines with denormalized entryDate
  for (const line of params.lines) {
    await ctx.db.insert("journalEntryLines", {
      journalEntryId: entryId,
      accountId: line.accountId,
      entryDate: params.date,  // Denormalized from parent (JE-04)
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
      description: line.description,
    });
  }

  return entryId;
}
```

### Pattern 2: Pure Validation Function (Testable Without Ctx)
**What:** A pure function that validates input data and throws descriptive errors. No database access.
**When to use:** When validation logic needs thorough unit testing without mocking Convex context.
**Example:**
```typescript
// Exported for testing, called internally by createJournalEntryWithLines
export function validateJournalLines(lines: JournalLine[]): void {
  if (lines.length < 2) {
    throw new Error("Journal entry requires at least 2 lines");
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const line of lines) {
    if (line.debitAmount < 0 || line.creditAmount < 0) {
      throw new Error("Journal entry line amounts must be non-negative");
    }
    if (line.debitAmount > 0 && line.creditAmount > 0) {
      throw new Error("Journal entry line must have either debit or credit, not both");
    }
    if (line.debitAmount === 0 && line.creditAmount === 0) {
      throw new Error("Journal entry line must have a non-zero debit or credit amount");
    }
    totalDebits += line.debitAmount;
    totalCredits += line.creditAmount;
  }

  if (totalDebits !== totalCredits) {
    throw new Error(
      `Journal entry imbalanced: debits (${totalDebits}) != credits (${totalCredits})`
    );
  }
}
```

### Pattern 3: Reversal Entry Creation
**What:** Creates a new journal entry that exactly reverses an existing entry by swapping debit/credit amounts.
**When to use:** When voiding an expense, reimbursement batch, or payroll entry.
**Example:**
```typescript
export async function createReversalEntry(
  ctx: MutationCtx,
  originalEntryId: Id<"journalEntries">,
  sourceType: "expense_void" | "reimbursement_void" | "payroll_void",
  createdBy: Id<"users">,
): Promise<Id<"journalEntries">> {
  const original = await ctx.db.get(originalEntryId);
  if (!original) {
    throw new Error("Original journal entry not found");
  }
  if (original.isReversed) {
    throw new Error("Journal entry has already been reversed");
  }

  // Fetch original lines
  const originalLines = await ctx.db
    .query("journalEntryLines")
    .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", originalEntryId))
    .collect();

  // Swap debits and credits
  const reversedLines = originalLines.map((line) => ({
    accountId: line.accountId,
    debitAmount: line.creditAmount,  // Swap
    creditAmount: line.debitAmount,  // Swap
    description: line.description,
  }));

  // Create reversal using the SAME date as original (JE-03)
  const reversalId = await createJournalEntryWithLines(ctx, {
    date: original.date,  // NOT Date.now()
    description: `Reversal of ${original.entryNumber}: ${original.description}`,
    sourceType,
    sourceId: original.sourceId,
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

### Anti-Patterns to Avoid
- **Direct `ctx.db.insert("journalEntries")` outside the helper:** Every downstream phase MUST use `createJournalEntryWithLines`. Grep verification: no `ctx.db.insert("journalEntries")` outside `journalEngine.ts`.
- **Using `Date.now()` for reversal dates:** The reversal entry's `date` field must equal the original entry's `date` field. Only `createdAt` uses `Date.now()`.
- **Update/patch on journalEntries data fields:** No mutation should ever `ctx.db.patch` on a journalEntries record except to set `isReversed: true` and `reversedByEntryId` during reversal. Field immutability is enforced by convention (no update mutation exists).
- **Floating-point comparison for balance check:** IDR amounts are whole numbers (integers). However, use exact equality (`!==`) for the sum comparison since all amounts should be integers. Do NOT round before comparing -- if amounts are fractional, that indicates a bug in the caller.
- **`ctx: { db: any }` instead of `MutationCtx`:** The project has a documented lesson: use the typed `MutationCtx` from `convex/_generated/server`, never `{ db: any }`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential ID generation | Custom counter logic | `getNextNumber(ctx, "JE")` from `convex/lib/counter.ts` | Phase 41 provides this with WIB timezone, atomic OCC, and tested formatting |
| WIB timezone date handling | Manual UTC+7 math | `getWibComponents()` from `convex/lib/periodRange.ts` (via counter.ts) | Established helper already handles timezone offset correctly |
| Double-entry validation | Inline validation in each consumer | `validateJournalLines` exported from journalEngine.ts | Single enforcement point prevents validation drift across 6+ consumers |
| Convex mutation types | `{ db: any }` | `MutationCtx` from `convex/_generated/server` | Typed context catches schema mismatches at compile time |

**Key insight:** The journal engine is a pure infrastructure helper. It should be minimal, well-tested, and stable. All business logic (what accounts to debit/credit, when to create entries, what sourceType to use) belongs in downstream phases, not here.

## Common Pitfalls

### Pitfall 1: Floating-Point Arithmetic in Balance Check
**What goes wrong:** JavaScript floating-point math can produce results like `0.1 + 0.2 = 0.30000000000000004`, causing valid entries to fail balance validation.
**Why it happens:** IEEE 754 double-precision floating-point representation.
**How to avoid:** All amounts in the system are IDR (Indonesian Rupiah), which are whole numbers -- no cents/fractional amounts. Document this constraint. If a future extension adds fractional amounts, convert to integer arithmetic (e.g., store in smallest unit).
**Warning signs:** Balance check failing on entries where debits visually equal credits.

### Pitfall 2: Reversal Using Date.now() Instead of Original Date
**What goes wrong:** A reversal entry posts to today's date instead of the original entry's accounting period, corrupting period-based financial reports.
**Why it happens:** Natural instinct to use `Date.now()` for timestamps. The `date` field is a business date (accounting period), not a creation timestamp.
**How to avoid:** `createReversalEntry` explicitly reads `original.date` and passes it to `createJournalEntryWithLines`. The `createdAt` field (insertion timestamp) correctly uses `Date.now()`. This distinction is documented in the code.
**Warning signs:** Reversal entries showing up in wrong periods in P&L reports (Phase 49).

### Pitfall 3: Forgetting to Denormalize entryDate
**What goes wrong:** Journal entry lines are inserted without `entryDate`, breaking the `by_account_entryDate` and `by_entryDate` indexes used by P&L aggregation queries (Phase 49).
**Why it happens:** Caller might try to set entryDate themselves, or the helper might forget to copy it from the parent.
**How to avoid:** The helper always sets `entryDate: params.date` on every line. Lines input type does NOT include `entryDate` -- it is auto-populated by the helper. This is documented in the interface.
**Warning signs:** P&L queries returning empty results for periods that should have data.

### Pitfall 4: Allowing Both Debit and Credit on Same Line
**What goes wrong:** A line with both `debitAmount: 5000` and `creditAmount: 3000` is ambiguous -- is this a net debit of 2000? Standard accounting requires each line to be either a debit OR a credit.
**Why it happens:** Schema allows both fields as `v.number()` without mutual exclusivity constraint.
**How to avoid:** Validate that each line has exactly one nonzero amount: `(debitAmount > 0 && creditAmount === 0) || (debitAmount === 0 && creditAmount > 0)`.
**Warning signs:** Balance check passing but GL account balances being wrong.

### Pitfall 5: Reversing an Already-Reversed Entry
**What goes wrong:** Double-reversal creates phantom transactions that corrupt financial statements.
**Why it happens:** No guard against calling `createReversalEntry` on an entry where `isReversed === true`.
**How to avoid:** `createReversalEntry` checks `original.isReversed` and throws if already reversed. This is a hard guard, not just a warning.
**Warning signs:** Journal entries with `isReversed: true` having multiple `reversedByEntryId` references.

### Pitfall 6: Missing Counter Dependency (Phase 41 Not Complete)
**What goes wrong:** `import { getNextNumber } from "./counter"` fails because `convex/lib/counter.ts` doesn't exist yet.
**Why it happens:** Phase 42 depends on Phase 41, which creates the counter helper.
**How to avoid:** Phase 41 MUST be fully implemented before Phase 42 begins. Verify `convex/lib/counter.ts` exists and exports `getNextNumber`.
**Warning signs:** Import errors at compile time.

## Code Examples

### Complete createJournalEntryWithLines Interface
```typescript
// Source: Derived from PRD Section 3-4, CONTEXT.md decisions, and existing codebase patterns

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Input line -- note: NO entryDate field. Helper auto-populates it. */
export interface JournalLine {
  accountId: Id<"accounts">;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

/** Valid source types for journal entries (excludes "manual" -- no mutation this phase) */
export type JournalSourceType =
  | "expense_approval"
  | "expense_void"
  | "reimbursement"
  | "reimbursement_void"
  | "payroll"
  | "payroll_void";

export interface CreateJournalEntryParams {
  date: number;              // Business date (accounting period), NOT Date.now()
  description: string;       // Human-readable description
  sourceType: JournalSourceType;
  sourceId?: string;         // Id of source record (expense, batch, payroll entry)
  createdBy: Id<"users">;   // User who triggered the action
  lines: JournalLine[];     // Min 2 lines, debits must equal credits
}

/** Returns the ID of the created journal entry */
export async function createJournalEntryWithLines(
  ctx: MutationCtx,
  params: CreateJournalEntryParams,
): Promise<Id<"journalEntries">>;
```

### Downstream Consumer Pattern (How Phase 45 Will Use This)
```typescript
// Source: PRD Section 4, expense approval auto-JE pattern

// In convex/expenses/mutations.ts (Phase 45):
import { createJournalEntryWithLines } from "../lib/journalEngine";

// Inside the approve mutation handler:
const jeId = await createJournalEntryWithLines(ctx, {
  date: expense.expenseDate,
  description: `Expense ${expense.expenseNumber}: ${expense.description}`,
  sourceType: "expense_approval",
  sourceId: expense._id,
  createdBy: approver._id,
  lines: [
    {
      accountId: expense.accountId,  // e.g., 6500 Office & Supplies
      debitAmount: expense.amount,
      creditAmount: 0,
    },
    {
      accountId: reimbursablesPayableAccountId,  // 2200
      debitAmount: 0,
      creditAmount: expense.amount,
    },
  ],
});
// Store JE reference on expense for traceability
await ctx.db.patch(expense._id, { journalEntryId: jeId });
```

### Downstream Void Pattern (How Phase 45 Will Void)
```typescript
// Source: PRD Section 4, expense void reversal pattern

import { createReversalEntry } from "../lib/journalEngine";

// Inside the void mutation handler:
if (expense.journalEntryId) {
  const reversalId = await createReversalEntry(
    ctx,
    expense.journalEntryId,
    "expense_void",
    admin._id,
  );
}
```

### Test Pattern for Pure Validation
```typescript
// Source: Existing test pattern from convex/lib/__tests__/externalSource.test.ts

import { describe, it, expect } from "vitest";
import { validateJournalLines, type JournalLine } from "../journalEngine";

describe("validateJournalLines", () => {
  const accountA = "abc123" as any; // Mock Id<"accounts">
  const accountB = "def456" as any;

  it("accepts balanced entry with 2 lines", () => {
    const lines: JournalLine[] = [
      { accountId: accountA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accountB, debitAmount: 0, creditAmount: 50000 },
    ];
    expect(() => validateJournalLines(lines)).not.toThrow();
  });

  it("rejects imbalanced entry", () => {
    const lines: JournalLine[] = [
      { accountId: accountA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accountB, debitAmount: 0, creditAmount: 49999 },
    ];
    expect(() => validateJournalLines(lines)).toThrow(
      "Journal entry imbalanced: debits (50000) != credits (49999)"
    );
  });

  it("rejects single line", () => {
    const lines: JournalLine[] = [
      { accountId: accountA, debitAmount: 50000, creditAmount: 0 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("at least 2 lines");
  });

  it("rejects line with both debit and credit", () => {
    const lines: JournalLine[] = [
      { accountId: accountA, debitAmount: 50000, creditAmount: 30000 },
      { accountId: accountB, debitAmount: 0, creditAmount: 20000 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("either debit or credit, not both");
  });

  it("rejects line with zero debit and zero credit", () => {
    const lines: JournalLine[] = [
      { accountId: accountA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accountB, debitAmount: 0, creditAmount: 0 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("non-zero debit or credit");
  });

  it("rejects negative amounts", () => {
    const lines: JournalLine[] = [
      { accountId: accountA, debitAmount: -50000, creditAmount: 0 },
      { accountId: accountB, debitAmount: 0, creditAmount: -50000 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("non-negative");
  });

  it("accepts multi-line balanced entry", () => {
    const accountC = "ghi789" as any;
    const lines: JournalLine[] = [
      { accountId: accountA, debitAmount: 30000, creditAmount: 0 },
      { accountId: accountB, debitAmount: 20000, creditAmount: 0 },
      { accountId: accountC, debitAmount: 0, creditAmount: 50000 },
    ];
    expect(() => validateJournalLines(lines)).not.toThrow();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct `ctx.db.insert` per consumer | Centralized helper function | Phase 42 (this phase) | All 6+ downstream consumers use single validated code path |
| Mutable journal entries | Immutable entries + reversal pattern | Phase 42 (this phase) | Corrections create audit trail instead of silently overwriting |
| UTC timestamps for accounting dates | WIB-correct dates via `getWibComponents` | Phase 41 (counter) | MMDD in entry numbers matches Indonesian business day |

**Deprecated/outdated:** None -- this is new infrastructure. No prior journal entry system exists in the codebase.

## Open Questions

1. **Floating-point edge case: Can amounts ever be fractional?**
   - What we know: IDR has no fractional units. All expense amounts in the PRD are whole numbers. All example JE patterns show integer amounts.
   - What's unclear: Whether future extensions (multi-currency, proration) could introduce fractional amounts.
   - Recommendation: Validate that amounts are non-negative numbers. Do NOT add integer-only validation (too restrictive for future). Use exact equality for balance check. Document that IDR amounts should be integers.

2. **Should `createReversalEntry` accept custom `sourceId` or always inherit from original?**
   - What we know: PRD Section 4 shows reversal source patterns -- `expense_void` uses `expense._id`, `reimbursement_void` uses `batch._id`. These match the original entry's `sourceId`.
   - What's unclear: Whether any void pattern needs a different sourceId from the original.
   - Recommendation: `createReversalEntry` inherits `sourceId` from the original entry. If a downstream consumer needs a different sourceId, they can call `createJournalEntryWithLines` directly with reversed lines. Keep `createReversalEntry` simple.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| JE-01 | Balanced entry passes; imbalanced entry throws | unit | `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x` | Wave 0 |
| JE-01 | Minimum 2 lines; each line single-sided; no negatives | unit | `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x` | Wave 0 |
| JE-02 | No update/patch mutation exists on journalEntries | grep-audit | `grep -r "ctx.db.patch.*journalEntries" convex/ --include="*.ts"` only in journalEngine.ts reversal | manual |
| JE-03 | Reversal uses original entry date, not Date.now() | unit | `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x` | Wave 0 |
| JE-06 | No direct ctx.db.insert("journalEntries") outside helper | grep-audit | `grep -r 'insert("journalEntries")' convex/ --include="*.ts"` only in journalEngine.ts | manual |

### Sampling Rate
- **Per task commit:** `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x`
- **Per wave merge:** `npm run test && npm run build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `convex/lib/__tests__/journalEngine.test.ts` -- covers JE-01 (validation), JE-03 (reversal dating via pure function tests)
- Phase 41 must be complete first: `convex/lib/counter.ts` must exist

## Discretion Recommendations

Based on the Claude's Discretion areas from CONTEXT.md:

1. **File organization: Single file.** Create `convex/lib/journalEngine.ts` as one file. Two exported async functions (`createJournalEntryWithLines`, `createReversalEntry`) plus 1-2 exported pure functions (`validateJournalLines`) and type interfaces. Total estimated size: ~100-130 lines. A directory structure would be overkill.

2. **Convenience functions: Yes, export `buildDebitLine` and `buildCreditLine`.** These are tiny one-liners that make downstream code more readable. They reduce errors from accidentally swapping debit/credit fields. Example: `buildDebitLine(accountId, amount, desc?)` returns `{ accountId, debitAmount: amount, creditAmount: 0, description: desc }`.

3. **Test granularity: Thorough edge cases for validation, minimal for creation.** The `validateJournalLines` pure function should have 8-10 test cases covering: balanced, imbalanced, single line, both-sided line, zero-zero line, negative amounts, multi-line balanced, empty lines array, large amounts. The `createReversalEntry` logic depends on ctx and is harder to unit test -- test the "swapped lines" logic via a pure helper if extracted.

4. **createReversalEntry: Separate exported function.** It has distinct responsibilities (fetch original, swap lines, mark reversed) and distinct error cases (entry not found, already reversed). Keeping it separate improves readability and makes the API self-documenting. It delegates to `createJournalEntryWithLines` internally.

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` lines 1727-1762 -- actual journalEntries and journalEntryLines table definitions (verified in codebase)
- `.planning/phases/41-schema-seed-counters/41-02-PLAN.md` -- counter.ts interface contract (`getNextNumber`, `formatCounterNumber`, `getWibDateStr`)
- `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md` Section 3-4 -- data model and auto-generated JE patterns
- `convex/orders/helpers/statusTransitions.ts` -- existing MutationCtx helper pattern
- `convex/lib/auth.ts` -- MutationCtx import pattern
- `.planning/phases/42-journal-engine/42-CONTEXT.md` -- user decisions and locked constraints

### Secondary (MEDIUM confidence)
- Standard double-entry accounting rules (debits = credits, immutability, reversal patterns) -- well-established accounting principles, not library-specific

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing project infrastructure
- Architecture: HIGH -- follows established `convex/lib/` and `convex/orders/helpers/` patterns exactly
- Pitfalls: HIGH -- all pitfalls derived from specific project lessons (floating point, WIB dates, Convex types) and standard accounting rules
- Validation: HIGH -- pure function testing pattern well-established in codebase

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- accounting principles don't change, Convex patterns well-established)

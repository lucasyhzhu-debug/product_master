# Phase 42: Journal Engine - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md)

<domain>
## Phase Boundary

This phase delivers the core double-entry journal engine: a single `createJournalEntryWithLines` helper function that validates debit/credit balance, denormalizes `entryDate` into journal entry lines, generates sequential JE-MMDD-NNN numbers via the counter infrastructure (Phase 41), and creates journal entries atomically. It also provides a `createReversalEntry` helper for void workflows. There is NO update mutation for journal entries -- corrections are only through reversals.

No UI. No expense, reimbursement, or payroll mutations. This phase is purely the journal entry creation and reversal backend infrastructure that all downstream phases (44-47) will consume.

</domain>

<decisions>
## Implementation Decisions

### Double-Entry Validation (from PRD Section 3 & 4, JE-01)
- `createJournalEntryWithLines` must validate that sum of all debit amounts equals sum of all credit amounts
- Validation happens before any database writes -- reject with clear error if imbalanced
- Each line has either debitAmount > 0 or creditAmount > 0 (not both)
- Minimum 2 lines per entry (at least one debit and one credit)

### Immutability (from PRD Section 4, JE-02)
- No `update` or `patch` mutation exists for journalEntries or journalEntryLines
- The only way to correct an entry is to create a reversing entry
- Once created, journal entry fields and lines are permanent

### Reversal Dating (from PRD Section 4, JE-03, staff review fix C1)
- Reversal entries MUST post to the same accounting period (date) as the original entry
- Do NOT use `Date.now()` for the reversal entry date
- The reversal copies the original entry's `date` field
- Original entry is marked `isReversed: true` and linked via `reversedByEntryId`

### Single Creation Helper (from PRD Section 4, JE-06)
- ALL journal entry creation goes through `createJournalEntryWithLines`
- No direct `ctx.db.insert("journalEntries")` or `ctx.db.insert("journalEntryLines")` anywhere else
- This helper is the single enforcement point for: balance validation, entryDate denormalization, entry number generation
- Downstream consumers: expense approval, expense void, reimbursement, reimbursement void, payroll, payroll void

### Journal Entry Structure (from PRD Section 3)
- `sourceType`: "expense_approval" | "expense_void" | "reimbursement" | "reimbursement_void" | "payroll" | "payroll_void"
- `sourceId`: optional string referencing the source record (expense._id, batch._id, payrollEntry._id)
- entryNumber: JE-MMDD-NNN format via `getNextNumber(ctx, "JE")` from `convex/lib/counter.ts` (Phase 41)

### Entry Date Denormalization (from PRD Section 3, JE-04)
- journalEntryLines.entryDate is copied from parent journalEntries.date
- Required for Convex index-based period queries (by_account_entryDate index)
- The helper handles this automatically -- callers don't need to pass entryDate per line

### Auto-Generated Journal Entry Patterns (from PRD Section 4)
- **Expense approval (personal):** DR [expense GL account], CR 2200 Employee Reimbursements Payable
- **Expense approval (company_card):** DR [expense GL account], CR 1100 Cash
- **Reimbursement confirmation:** DR 2200, CR 1100
- **Reimbursement void:** DR 1100, CR 2200 (reversal)
- **Expense void:** DR 2200, CR [expense GL account] (reversal)
- **Payroll:** DR 6100 Salaries & Wages, CR 1100 Cash
- **Payroll void:** CR 6100, DR 1100 (reversal)

### Claude's Discretion
- Internal function organization (single file vs multiple helpers)
- Whether to export line-building convenience functions (e.g., `buildDebitLine`, `buildCreditLine`)
- Test granularity for balance validation edge cases
- Whether `createReversalEntry` is a separate exported function or part of `createJournalEntryWithLines`

</decisions>

<specifics>
## Specific Ideas

- Use `getNextNumber(ctx, "JE")` from `convex/lib/counter.ts` (Phase 41) for entry numbers
- Use `MutationCtx` type from `convex/_generated/server` (not `{ db: any }`)
- The helper should accept: `ctx`, `date`, `description`, `sourceType`, `sourceId`, `createdBy`, `lines[]` (each with accountId, debitAmount, creditAmount, optional description)
- Lines should NOT require entryDate -- the helper copies it from the parent entry's `date` field
- Auth is NOT checked in the helper -- the calling mutation handles auth
- Error messages should be clear: "Journal entry imbalanced: debits (X) != credits (Y)"

</specifics>

<deferred>
## Deferred Ideas

- Manual journal entries (sourceType: "manual") -- the type exists in schema but no UI or mutation in this phase
- GL balance queries (sum debits/credits by account for a period) -- Phase 49
- Journal entry listing UI -- Phase 43+ or later
- Audit report export -- future milestone

</deferred>

---

*Phase: 42-journal-engine*
*Context gathered: 2026-03-13 via PRD Express Path*

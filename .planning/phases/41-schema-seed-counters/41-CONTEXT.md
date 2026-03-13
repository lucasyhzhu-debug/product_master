# Phase 41: Schema, Seed & Counters - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md)

<domain>
## Phase Boundary

This phase delivers the foundational data layer for the expense & accounting system: 10 new Convex tables (accounts, expenses, expenseStatusHistory, reimbursementBatches, reimbursementBatchItems, journalEntries, journalEntryLines, bankAccounts, payrollEntries, counters), 1 modified table (users + bank details), a Chart of Accounts seed function with 36 PSAK-aligned accounts, and an atomic daily counter helper for ID generation (EXP-MMDD-NNN, RMB-MMDD-NNN, JE-MMDD-NNN).

No UI, no mutations beyond seeding and counter generation, no expense lifecycle logic. This is purely schema + seed + counter infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Schema Design (from PRD Section 3)
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

### Chart of Accounts Seed (from PRD Section 2)
- 36 accounts total: 7 Revenue (4100-4700), 4 COGS (5100-5400), 11 OpEx (6100-6990), 3 Other (7100-7900), 6 Assets (1100-1600), 5 Liabilities (2100-2500), 3 Equity (3100-3300)
- Revenue/COGS accounts (4xxx-5xxx) are "virtual" — exist in CoA for classification but values come from real-time aggregation, not stored journal entries
- All default accounts: isSystem = true, isActive = true
- Seed function must be idempotent (check by code before inserting)
- System accounts cannot be deleted via any mutation

### Counter/ID Generation (from PRD Section 3)
- Format: PREFIX-MMDD-NNN (e.g., EXP-0312-001)
- Separate counters per prefix (EXP, RMB, JE)
- Counter resets daily
- `counters` table with by_prefix_date compound index
- Mutations atomically increment lastSequence
- Convex mutation serialization prevents race conditions

### Journal Entry Line Denormalization (from PRD Section 3)
- journalEntryLines.entryDate copied from parent journalEntries.date
- Required because Convex indexes cannot span tables
- Used for GL balance/period queries via by_account_entryDate index

### Claude's Discretion
- Schema validator organization (inline vs extracted helpers)
- File organization for new table modules (flat vs nested directories)
- Specific test structure for seed idempotency and counter atomicity
- Whether to create empty query/mutation stubs or just schema + seed

</decisions>

<specifics>
## Specific Ideas

- Follow existing seed patterns: `tags:seedDefaults`, `menuProducts:seedDefaults`
- Use `v.union(v.literal(...), ...)` for union types, following `externalSource` pattern in schema.ts
- Auth pattern: `token: v.string()` + `requireRole(ctx, args.token, [...])` from `convex/lib/auth.ts`
- Use `ctx.storage.getUrl(receiptFileId)` pattern from `convex/feedback/queries.ts` for receipt URLs
- Account numbering follows Indonesian PSAK conventions (1xxx-7xxx)

</specifics>

<deferred>
## Deferred Ideas

- Balance Sheet view (query journalEntryLines by 1xxx-3xxx accounts) — future milestone
- Cash Flow Statement (query entries touching 1100) — future milestone
- Monthly budgets per GL — add `budgets` table later
- OCR receipt extraction — receipt images stored, extraction step added later
- Bank statement import/matching — bankAccounts + bankReference fields ready
- Multi-currency support — IDR-only for now
- Recurring expenses — add recurrence fields later

</deferred>

---

*Phase: 41-schema-seed-counters*
*Context gathered: 2026-03-12 via PRD Express Path*

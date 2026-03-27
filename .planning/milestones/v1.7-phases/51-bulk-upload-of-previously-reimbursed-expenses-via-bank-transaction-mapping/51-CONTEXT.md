# Phase 51: Bulk Upload of Previously Reimbursed Expenses via Bank Transaction Mapping - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-03-14-historical-expense-journal-import-design.md + docs/superpowers/plans/2026-03-14-historical-expense-journal-import.md)

<domain>
## Phase Boundary

One-off CSV import tool that converts historical employee expense records (350+ from Jan 2026 onward) into journal entries. Admin downloads a template, maps existing Excel data (including GL account codes), uploads CSV, reviews validation summary, and confirms to bulk-create journal entries. This backfills OpEx in the P&L for periods before the accounting system existed.

</domain>

<decisions>
## Implementation Decisions

### Data Source & JE Treatment
- Source data is employee expense forms (not bank transactions) — expense forms have per-item granularity
- JE treatment: DR OpEx/expense account, CR 1100 (Cash) — cash already left the company
- One JE per CSV row for maximum traceability
- sourceType: `"manual"` with `[Historical Import]` description prefix
- No expense/reimbursement records created — JEs are sufficient for P&L accuracy
- Import batch traceability via `importBatchId` (UUID) stored as `sourceId` on every JE

### Schema Change
- Add optional `metadata` field to `journalEntries` table: `metadata: v.optional(v.object({ receiptUrl: v.optional(v.string()) }))`
- Backward-compatible — no existing data affected

### Journal Engine Change
- Extend `CreateJournalEntryParams` with `metadata?: { receiptUrl?: string }`
- `ctx.db.insert` call spreads metadata conditionally: `...(params.metadata ? { metadata: params.metadata } : {})`

### CSV Template Format
- Columns: `date` (YYYY-MM-DD, required), `amount` (positive integer IDR, required), `description` (string, required), `vendorName` (optional), `accountCode` (must match active CoA code, required), `receiptUrl` (optional URL)
- CoA reference CSV generated client-side from `accounts.list({ activeOnly: true })`

### Backend Mutation
- `convex/journalImport/mutations.ts` → `bulkCreateJournalEntries`
- Auth: `protectedMutation({ roles: ["admin"] })` — session-based auth, `ctx.user._id` for createdBy
- Batch size: max 50 rows per call (enforced at mutation level)
- Backend validation (defense in depth): `amount > 0` and `Number.isInteger(amount)` even though client validates
- Per-row: look up accountCode → accountId, look up Cash 1100 → cashAccountId, call createJournalEntryWithLines
- Returns `{ created: number }`
- Fail-fast: if any row fails validation, entire batch rejected with row-level error details
- 350 rows / 50 per batch = 7 mutation calls, ~200 DB ops per batch — within Convex limits

### Frontend Architecture
- New page: `src/pages/HistoricalImportPage.tsx` — linear wizard
- New hook: `src/hooks/convex/useJournalImport.ts` — uses createMutationHook factory
- Route: `/import` (flat route, admin only via ProtectedRoute)
- Navigation: linked from AccountsManager page
- CSV parsing: Papa Parse (new dependency)

### Wizard Flow
- States: Upload → Validating → Review → Importing → Complete
- Upload: file drop zone (.csv), template download buttons
- Validating: client-side CSV parsing via Papa Parse, validation against account map
- Review: error table (blocks confirm), warning table (duplicates, informational), summary cards, summary by GL account, summary by period
- Importing: sequential batches of 50, progress bar, resume-from-failure support
- Complete: success message with link to /financials

### Validation Rules
- Required fields (date, amount, description, accountCode): error if missing
- accountCode not found or inactive: error
- amount <= 0 or non-integer: error
- date not YYYY-MM-DD: error
- Duplicate (same date+amount+description): warning only
- Any errors block confirm button

### Date Conversion
- Client parses YYYY-MM-DD → WIB midnight epoch ms before sending to mutation
- Use dateToWibEpoch helper function

### Undo & Safety
- No special undo mechanism — void individual JEs manually using existing infrastructure
- No date boundaries enforced — trust the admin
- Any active account is valid — no type restriction
- No fraud checks (historical, already paid)

### Claude's Discretion
- Exact CSS styling and dark mode tokens for the wizard page
- Error message wording details
- Exact file drop zone interaction pattern
- Whether to use Framer Motion for wizard transitions

</decisions>

<specifics>
## Specific Ideas

- Template download via `Blob` + `URL.createObjectURL` + synthetic anchor click
- `escapeCsv` helper for CoA reference with proper CSV quoting
- `crypto.randomUUID()` for importBatchId generation before first batch
- `completedBatches` and `failedAtBatch` in component state for resume-from-failure
- Discriminated union for WizardState type with 6 variants
- Pure validation helper `validateImportRow` exported for unit testing
- 13 atomic commits across 5 chunks (Schema+Engine, Backend TDD, Client Validation TDD, Frontend, Verification)

</specifics>

<deferred>
## Deferred Ideas

None — spec covers full phase scope. The spec explicitly notes what the feature does NOT do (no expenses table records, no reimbursement batches, no fraud checks, no batch undo, no date boundaries, no account type restrictions).

</deferred>

---

*Phase: 51-bulk-upload-of-previously-reimbursed-expenses-via-bank-transaction-mapping*
*Context gathered: 2026-03-14 via PRD Express Path*

# Phase 44: Expense Submission - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning
**Source:** PRD Express Path (inline arguments)

<domain>
## Phase Boundary

Phase 44 delivers the expense submission workflow: any authenticated user can create expense drafts, attach receipts via Convex file storage, and submit for approval. Covers backend mutations/queries, fraud detection helpers, hook layer, and two frontend pages (ExpenseSubmit form + MyExpenses list).

Does NOT include: approval queue UI, journal entry creation, void, reimbursement tracking, admin "all expenses" view, or analytics.

</domain>

<decisions>
## Implementation Decisions

### Authentication & Authorization
- All roles can submit expenses — use `requireAuth` (any authenticated user), not `requireRole`
- `submittedBy` derived from auth context (current user)

### Status Transitions
- Draft -> Submitted is the ONLY transition in Phase 44
- Approval, rejection, void deferred to Phase 45

### Receipt Handling
- Receipt upload uses Convex file storage (`generateUploadUrl` action + `ctx.storage.store()`)
- SHA-256 hash computed client-side, sent as `receiptImageHash` field
- Receipt required for expenses > Rp 50,000 (backend enforced), optional for <= Rp 50,000

### Expense Numbers
- Generated on creation (not on submit) via `getNextNumber(ctx, "EXP")` from convex/lib/counter.ts
- Format: EXP-MMDD-NNN

### Fraud Controls (Backend Only in Phase 44)
- FRAUD-01: Soft duplicate warning (same employee + amount + date within 7 days) — sets `duplicateWarning` field, does NOT block
- FRAUD-02: Hard block if receipt SHA-256 hash matches existing expense — uses `by_receipt_hash` index
- FRAUD-03: Auto-set `lateSubmission=true` when `expenseDate` + 14 days < submission timestamp

### Resubmission Linking
- `previousExpenseId` links resubmissions — new expense created from rejected one links back
- Create mutation accepts optional `previousExpenseId`

### GL Category Dropdown
- Use `useAccounts(activeOnly: true)` from Phase 43 for expense category selection
- Deactivated accounts hidden per COA-03

### My Expenses Page
- Shows current user's expenses with status filter tabs
- Follow OrderManager.tsx pattern for list view with tab filters

### Claude's Discretion
- Component decomposition within ExpenseSubmit form
- Specific tab labels and filter UX for MyExpenses
- Error message wording for fraud blocks
- Loading/empty state designs
- Form validation UX (inline vs. toast)

</decisions>

<specifics>
## Specific Ideas

### Prior Phase Artifacts (Ground Truth)
- **expenses table** in schema.ts (lines 1635-1679): All fields pre-defined including indexes
- **expenseStatusHistory table** (lines 1681-1690): Audit trail with by_expense index
- **Counter helper** (convex/lib/counter.ts): `getNextNumber(ctx, "EXP")` for EXP-MMDD-NNN
- **Journal Engine** (convex/lib/journalEngine.ts): NOT used in Phase 44 but schema has `journalEntryId` for later
- **Accounts queries** (convex/accounts/queries.ts): `list(activeOnly?)` for GL category dropdown

### File Structure
Backend:
- convex/expenses/queries.ts — listMyExpenses, getById, getStatusHistory
- convex/expenses/mutations.ts — createDraft, updateDraft, submitExpense, generateUploadUrl
- convex/expenses/helpers.ts — pure helpers (duplicate detection, late submission check)

Frontend:
- src/hooks/convex/useExpenses.ts — query + mutation hooks
- src/pages/ExpenseSubmit.tsx — create/edit expense form with receipt upload
- src/pages/MyExpenses.tsx — personal expense list with status tabs
- src/components/expenses/ — shared expense components (StatusBadge, ReceiptUpload, etc.)

### Patterns to Follow
- protectedMutation from convex/lib/functions.ts
- useAccounts.ts hook pattern (query hooks + createMutationHook factory)
- OrderManager.tsx for list with tabs/filters
- Lazy import in src/App.tsx, ProtectedRoute for route registration
- Barrel exports in src/hooks/convex/index.ts

</specifics>

<deferred>
## Deferred Ideas

- Approval queue UI (Phase 45)
- Journal entry creation on approval (Phase 45)
- Void functionality (Phase 45)
- Reimbursement tracking (Phase 46)
- Admin "all expenses" view (Phase 48)
- Expense analytics (Phase 50)

</deferred>

---

*Phase: 44-expense-submission*
*Context gathered: 2026-03-13 via PRD Express Path*

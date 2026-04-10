# Phase 62: Manual Journal Entry Page - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning
**Source:** Design spec (`docs/superpowers/specs/2026-03-16-manual-journal-entry-design.md`)

<domain>
## Phase Boundary

Template-based manual journal entry page for balance sheet transactions. 6 pre-wired transaction templates (equipment purchase, loan repayment, dividend payment, capital injection, receive loan, tax payment) that map to specific debit/credit account pairs. Inline accordion form below selected template card, period-filtered recent entries table. Hub navigation restructured to split Financials into Financials + Accounting sections.

</domain>

<decisions>
## Implementation Decisions

### Page Structure
- Route: `/journal`, file: `src/pages/ManualJournalEntry.tsx`
- Access: `canManageReimbursements` (admin + manager)
- Layout top to bottom: PageHeader, template cards grid, inline accordion form, recent entries table
- Template cards: 6 cards in responsive grid (3x2 desktop, 2x3 tablet, 1x6 mobile)
- Only one template form open at a time — clicking another collapses current

### Template Cards
- 6 templates with specific Lucide icons and debit/credit account pairs:
  1. Equipment Purchase (Wrench) — DR 1500 Fixed Assets / CR 1100 Cash
  2. Loan Repayment (Coins) — DR 2500 Loans Payable / CR 1100 Cash
  3. Dividend Payment (Users) — DR 3200 Retained Earnings / CR 1100 Cash
  4. Capital Injection (Building) — DR 1100 Cash / CR 3100 Owner's Capital
  5. Receive a Loan (Landmark) — DR 1100 Cash / CR 2500 Loans Payable
  6. Tax Payment (FileCheck) — DR 2400 Tax Payable / CR 1100 Cash
- PT entity: dividends from Retained Earnings (3200), not owner draws from Owner's Capital (3100)

### Inline Form
- Fields: Date (default today WIB), Amount (integer IDR), Description (required free text)
- Read-only accounting preview: "DR {debit account name} / CR {credit account name}"
- Save button creates JE and collapses form; Cancel collapses without saving
- Entry appears in table immediately after save (Convex real-time)

### Backend
- Schema: add `templateType: v.optional(v.string())` to `journalEntries.metadata` object
- Also update `CreateJournalEntryParams.metadata` in `convex/lib/journalEngine.ts`
- New `convex/manualJournal/mutations.ts` — `create` mutation (admin + manager)
  - Validates templateType is one of 6 valid types
  - Validates `amount > 0` and `Number.isInteger(amount)`
  - Resolves template to debit/credit account codes via constant map
  - Looks up account IDs via `by_code` index
  - Calls `createJournalEntryWithLines` with `sourceType: "manual"`, `metadata: { templateType }`
- New `convex/manualJournal/queries.ts` — `listByPeriod` query
  - Uses `by_source` index prefix scan (sourceType === "manual")
  - Post-filters by date range
  - Filters to entries with `metadata.templateType` present (excludes CSV imports)
  - Joins `journalEntryLines` + `accounts` for display
  - Returns sorted by date descending with `metadata.templateType` for badge rendering
- Template type union: `"equipment_purchase" | "loan_repayment" | "dividend_payment" | "capital_injection" | "receive_loan" | "tax_payment"`

### Frontend Hook
- New `src/hooks/convex/useManualJournal.ts`
- `useManualJournalEntries(periodStart, periodEnd)` wraps `listByPeriod`
- `useCreateManualJournalEntry()` wraps `create` via `createMutationHook`

### Recent Entries Table
- Period controls reuse `ExpensePeriodMode` pattern from `src/lib/expenseAnalyticsPeriod.ts`
  - Monthly / Custom Range toggle, month navigation with chevrons + "Today" reset
- Columns: Entry # (JE-MMDD-NNN blue text, no navigation), Date, Type (color badge), Description, Amount (IDR)
- Type badge colors: Equipment=Blue, Loan Repayment=Green, Dividend=Yellow, Capital Injection=Purple, Receive Loan=Violet, Tax Payment=Pink
- Empty state: "No manual journal entries for {month}. Use the templates above to create one."

### Hub Navigation Restructuring
- Split current "Financials" hub card into two sections:
  - **Financials** (reports + expense flow): Income Statement, Expenses, Exp. Analytics, Reimbursements, Payroll
    - Visibility: `canAccessDashboard || canSubmitExpenses || canManageReimbursements`
  - **Accounting** (ledger operations — NEW): Manual Journal Entry (`/journal`), Chart of Accounts (`/accounts`), Bank Accounts (`/bank-accounts`), Historical Import (`/import`)
    - Visibility: `canManageReimbursements` (admin + manager only)
- Bank Accounts moves from Financials to Accounting

### No Reversal/Void UI
- Manual entries are non-reversible (`NON_REVERSIBLE_TYPES` includes "manual")
- Mistakes corrected by creating another entry — void/correction UI deferred

### Claude's Discretion
- Accordion animation style (Framer Motion or CSS transitions)
- Form validation feedback UX (inline errors, toast, or both)
- Save confirmation feedback (toast vs inline success)
- Table loading skeleton design
- Mobile form layout details within the accordion
- Card hover/selected state styling

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/lib/journalEngine.ts`: `createJournalEntryWithLines` — single entry point for all JEs. Already supports `sourceType: "manual"` and `metadata` field
- `src/lib/expenseAnalyticsPeriod.ts`: `computePeriodRange`, `prevMonth`, `nextMonth`, `ExpensePeriodMode` — reuse for period controls
- `src/lib/dateUtils.ts`: `wibMidnightToUtc`, `getCurrentWibMonth` — WIB timezone helpers
- `convex/lib/auth.ts`: `requireRole` — authorization helper
- `src/hooks/convex/` pattern: `createMutationHook` factory for mutation hooks
- Hub page: `src/pages/HubPage.tsx` — `HUB_AREAS` array with `AreaCard` interface, `LINK_ICONS` map

### Established Patterns
- Journal engine enforces balance validation, immutability, sequential numbering (JE-MMDD-NNN), integer amounts
- `NON_REVERSIBLE_TYPES` already includes `"manual"` — no changes needed there
- Period controls pattern: monthly toggle + custom range, used in Expense Analytics
- Hub cards: `visible` callback with `hasPermission`, icon + color + links array
- Lazy loading: `lazyWithPreload` for route components in `App.tsx`

### Integration Points
- Schema: `journalEntries.metadata` object needs `templateType` field added
- `CreateJournalEntryParams.metadata` type in journalEngine needs `templateType`
- `App.tsx`: new `/journal` route with `ProtectedRoute requiredPermission="canManageReimbursements"`
- `HubPage.tsx`: split Financials card, add Accounting card, move Bank Accounts
- `accounts` table: templates depend on accounts 1100, 1500, 2400, 2500, 3100, 3200 (seeded by `accounts:seedDefaults`)
- Existing routes: `/bank-accounts` and `/import` already exist — just newly surfaced in hub

</code_context>

<specifics>
## Specific Ideas

- Design spec is the authoritative source: `docs/superpowers/specs/2026-03-16-manual-journal-entry-design.md`
- Template card interaction: accordion expansion below selected card, pushing table down
- Badge colors are specified per template type (Blue, Green, Yellow, Purple, Violet, Pink)
- JE number format matches existing journal engine: JE-MMDD-NNN (sequential via counter helper)
- Query filters `metadata.templateType` present to exclude historical CSV imports that also use `sourceType: "manual"`

</specifics>

<deferred>
## Deferred Ideas

- Void/correction UI for manual journal entries — future phase if needed
- Phase 60: Asset Register & Depreciation — tracks fixed assets purchased via Equipment Purchase template
- Additional template types (e.g., prepaid expenses, depreciation) — future phases as needed

</deferred>

---

*Phase: 62-manual-journal-entry*
*Context gathered: 2026-03-18*

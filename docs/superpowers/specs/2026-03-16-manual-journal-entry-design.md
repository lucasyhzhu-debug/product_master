# Manual Journal Entry Page — Design Spec

**Date:** 2026-03-16
**Status:** Approved
**Access:** Admin + Manager (`canManageReimbursements`)
**Route:** `/journal`

## Problem

The expense form only allows COGS (5xxx), OpEx (6xxx), and Other (7xxx) GL accounts. Transactions that hit balance sheet accounts — equipment purchases (assets), loan repayments (liabilities), dividends (equity) — have no UI. The only alternative is CSV bulk import, which is overkill for individual entries.

## Solution

A template-based manual journal entry page with 6 pre-wired transaction types. Each template maps to a specific debit/credit account pair, eliminating the risk of user error in double-entry bookkeeping.

## Page Structure

**Route:** `/journal`
**File:** `src/pages/ManualJournalEntry.tsx`
**Access:** `canManageReimbursements` (admin + manager)

Layout (top to bottom):
1. `PageHeader` — "Manual Journal Entry"
2. Template cards — 6 cards in responsive grid (3x2 desktop, 2x3 tablet, 1x6 mobile)
3. Inline form — accordion expansion below selected card
4. Recent entries — period-filtered table of manual JEs

## Template Cards

6 templates, each pre-wiring debit and credit accounts:

| # | Template | Icon (Lucide) | Debit Account | Credit Account |
|---|----------|---------------|--------------|----------------|
| 1 | Equipment Purchase | Wrench | 1500 Fixed Assets | 1100 Cash |
| 2 | Loan Repayment | Coins | 2500 Loans Payable | 1100 Cash |
| 3 | Dividend Payment | Users | 3200 Retained Earnings | 1100 Cash |
| 4 | Capital Injection | Building | 1100 Cash | 3100 Owner's Capital |
| 5 | Receive a Loan | Landmark | 1100 Cash | 2500 Loans Payable |
| 6 | Tax Payment | FileCheck | 2400 Tax Payable | 1100 Cash |

**Note:** Frollie is a PT (Perseroan Terbatas). Owner withdrawals are dividends from Retained Earnings (3200), not owner draws from Owner's Capital (3100).

## Inline Form (Accordion)

Clicking a card expands an inline form below it (pushing the table down). Only one template can be open at a time. Fields:

- **Date** — date picker, defaults to today (WIB)
- **Amount** — integer IDR input (whole numbers only, no decimals)
- **Description** — free text (required)
- **Accounting preview** — read-only line: "DR {debit account name} / CR {credit account name}"
- **Save** button — creates JE and collapses form; entry appears in table below
- **Cancel** button — collapses form without saving

## Backend

### Schema Change

Add `templateType` to the existing optional `metadata` object on `journalEntries`:

```typescript
// convex/schema.ts — journalEntries.metadata
metadata: v.optional(v.object({
  receiptUrl: v.optional(v.string()),
  templateType: v.optional(v.string()),  // NEW
})),
```

Also update the `CreateJournalEntryParams` interface in `convex/lib/journalEngine.ts`:

```typescript
// convex/lib/journalEngine.ts — CreateJournalEntryParams.metadata
metadata?: { receiptUrl?: string; templateType?: string };  // ADD templateType
```

### New Files

**`convex/manualJournal/mutations.ts`**

`create` — protected mutation (admin + manager):
- Args: `token`, `templateType` (string union), `date` (number), `amount` (number), `description` (string)
- Validates `templateType` is one of the 6 valid types
- Validates `amount > 0` and `Number.isInteger(amount)`
- Resolves template to debit/credit account codes
- Looks up account IDs via `by_code` index
- Resolves `createdBy` from `requireRole` return value (`user._id`)
- Calls `createJournalEntryWithLines` from `convex/lib/journalEngine.ts` with:
  - `sourceType: "manual"`
  - `createdBy: user._id`
  - `metadata: { templateType }`
  - Two lines: debit line + credit line
- Returns created journal entry ID

Template type union:
```
"equipment_purchase" | "loan_repayment" | "dividend_payment" |
"capital_injection" | "receive_loan" | "tax_payment"
```

Template → account code mapping (defined as a constant):
```typescript
const TEMPLATES = {
  equipment_purchase: { debit: "1500", credit: "1100" },
  loan_repayment:     { debit: "2500", credit: "1100" },
  dividend_payment:   { debit: "3200", credit: "1100" },
  capital_injection:  { debit: "1100", credit: "3100" },
  receive_loan:       { debit: "1100", credit: "2500" },
  tax_payment:        { debit: "2400", credit: "1100" },
};
```

**`convex/manualJournal/queries.ts`**

`listByPeriod` — query:
- Args: `periodStart` (number), `periodEnd` (number)
- Fetches journal entries where `sourceType === "manual"` using `by_source` index (scans `["sourceType", "sourceId"]` — all manual entries share the same sourceType, so this is a prefix scan; acceptable for low-volume manual entries)
- Post-filters by date range (periodStart <= date < periodEnd)
- **Filters to entries with `metadata.templateType` present** — excludes historical CSV imports which also use `sourceType: "manual"` but lack `templateType`
- Joins with `journalEntryLines` via `by_journal_entry` index for debit/credit display
- Joins with `accounts` for account names
- Returns entries sorted by date descending
- Includes `metadata.templateType` for badge rendering

### Frontend Hook

**`src/hooks/convex/useManualJournal.ts`**

- `useManualJournalEntries(periodStart, periodEnd)` — wraps `listByPeriod` query
- `useCreateManualJournalEntry()` — wraps `create` mutation via `createMutationHook`

## Recent Entries Table

### Period Controls

Reuses the `ExpensePeriodMode` pattern from `src/lib/expenseAnalyticsPeriod.ts`:
- **Monthly / Custom Range** toggle badges
- Month navigation with chevron buttons + "Today" reset
- Custom mode shows two date inputs
- `computePeriodRange()` generates `periodStart`/`periodEnd`

### Table Columns

| Column | Content |
|--------|---------|
| Entry # | JE number (e.g., JE-0316-004), blue text, display-only (no navigation) |
| Date | Formatted date (e.g., 16 Mar 2026) |
| Type | Color-coded badge from `metadata.templateType` |
| Description | Free text from entry |
| Amount | Formatted IDR amount |

### Type Badge Colors

| Template | Badge Color |
|----------|-------------|
| Equipment Purchase | Blue |
| Loan Repayment | Green |
| Dividend Payment | Yellow |
| Capital Injection | Purple |
| Receive a Loan | Violet |
| Tax Payment | Pink |

### Empty State

"No manual journal entries for {month}. Use the templates above to create one."

## Hub Navigation Update

Split current "Financials" hub section into two:

### Financials (reports + expense flow)
- Income Statement (`/financials`)
- Expenses (`/expenses`)
- Exp. Analytics (`/expense-analytics`)
- Reimbursements (`/reimbursements`)
- Payroll (`/payroll`)

**Visibility:** `canAccessDashboard` || `canSubmitExpenses` || `canManageReimbursements`

### Accounting (ledger operations) — NEW section
- Manual Journal Entry (`/journal`) — **new page**
- Chart of Accounts (`/accounts`) — existing page (has route in App.tsx), newly surfaced in hub
- Bank Accounts (`/bank-accounts`) — moved from Financials section
- Historical Import (`/import`) — existing page (has route in App.tsx), newly surfaced in hub

**Visibility:** `canManageReimbursements` (admin + manager only)

## Dependencies

- `convex/lib/journalEngine.ts` — `createJournalEntryWithLines` (existing)
- `src/lib/expenseAnalyticsPeriod.ts` — period calculation helpers (existing)
- `src/lib/dateUtils.ts` — WIB date helpers (existing)
- Accounts 1100, 1500, 2400, 2500, 3100, 3200 must exist (seeded by `accounts:seedDefaults`)

## Known Limitations

- **No reversal/void UI** — if a user makes a mistake, they must create a correcting entry via another template. The journal engine explicitly prevents reversing `manual` source type entries (`NON_REVERSIBLE_TYPES` includes `"manual"`). A void/correction UI can be added in a future phase if needed.

## Future Phases

- **Phase 60: Asset Register & Depreciation** — tracks fixed assets purchased via Equipment Purchase template, auto-generates monthly depreciation JEs

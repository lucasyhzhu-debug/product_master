# Vendor Bank Details for Payment Requests — Design

**Date:** 2026-04-17
**Status:** Approved, ready for implementation planning
**Target milestone:** v2.0 (decimal phase between 74 and 76)

---

## Problem

Expense submissions with `paymentMethod = "payment_request"` (where Frollie pays a vendor directly from the company bank account) currently capture only a free-text `vendorName`. The admin who executes the bank transfer at Mark-as-Paid time has no bank account details on the expense record. Today this is resolved by the submitter WhatsApping the admin with bank name, account number, and account holder name — an out-of-band workflow that:

- Delays payment execution
- Breaks the audit trail (payee details live in chat, not in the accounting system)
- Forces repeat entry for recurring vendors

## Goal

Make payment requests self-contained: submitter captures vendor bank details at submission time, admin sees everything needed to execute the transfer on the expense approval card, and recurring vendors are stored in a reusable directory.

## Scope

**In scope:**
- New `vendors` table (directory of payee bank accounts)
- New snapshot fields on `expenses` for payment_request rows
- Inline vendor picker + create in `ExpenseSubmitForm`
- Vendor payment details block on `ExpenseApproval` + `MyExpenses` + Mark-as-Paid dialog
- Small `VendorsManager` admin page
- Tests (backend + E2E) + docs updates

**Out of scope (deferred):**
- Bank code / account number checksum validation (brittle for Indonesian banks)
- Vendor merge tool for duplicate cleanup (manual for now)
- Per-vendor spend analytics
- Bank reconciliation auto-match integration (Phase 73 follow-up — snapshot account number *could* feed match rules later)
- Contact info (phone, email) on vendor — user chose "notes only" in brainstorm

---

## Data Model

### New table: `vendors`

```ts
vendors: defineTable({
  name: v.string(),                    // Display name, e.g. "PT Kemasan Jaya"
  bankName: v.string(),                // "BCA", "Mandiri", "BRI", etc.
  accountNumber: v.string(),           // Digits only, normalized on insert
  accountHolderName: v.string(),       // Exact name on bank account
  notes: v.optional(v.string()),       // Free text — "pays weekly", etc.
  isActive: v.boolean(),               // Soft-delete via deactivate
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_active_name", ["isActive", "name"])
  .searchIndex("search_name", {
    searchField: "name",
    filterFields: ["isActive"],
  }),
```

### New fields on `expenses` (snapshot at submit time)

```ts
vendorId: v.optional(v.id("vendors")),
vendorBankName: v.optional(v.string()),
vendorAccountNumber: v.optional(v.string()),
vendorAccountHolderName: v.optional(v.string()),
```

**Shape rules:**
- All snapshot fields are optional at the schema level because they only apply to `paymentMethod === "payment_request"`.
- Existing `vendorName` field remains the display label across all payment methods (no migration of existing rows needed).
- Mutation layer enforces the conditional: payment_request MUST have all three snapshot fields (bank + account # + holder name); other payment methods MUST have none.
- `vendorId` can be absent even for payment_request (ad-hoc one-off vendors that submitter chose not to save to directory).

**Why snapshot + directory, not FK-only:**
Past "paid" expenses must remain audit-accurate. If a vendor's bank number changes later, the original transfer record must still reflect the account that was actually paid. This mirrors the existing `recipes`→`products` pattern in the codebase (template + pinned snapshot).

**Why not reuse `bankAccounts`:**
`bankAccounts` represents Frollie's own source-of-funds accounts (money flows *from*). Vendor accounts are payees (money flows *to*). Different semantics — separate tables prevent overloading.

---

## Submitter UX

### Form layout when `paymentMethod === "payment_request"`

A new "Vendor Bank Details (required)" section appears in `ExpenseSubmitForm.tsx` between the "Vendor *" field and the "Receipt" field.

Interaction elements:
- **Vendor picker combobox** — search-as-you-type powered by Convex `searchIndex` on `vendors.name` (filtered to `isActive = true`). Selecting a vendor auto-fills the four bank fields.
- **"+ Add new vendor" button** — clears the picker, shows empty editable bank fields.
- **"Save to vendor directory for next time" checkbox** — defaults to ON for new vendors. Unchecking produces a one-off snapshot with no `vendors` row created.
- **Bank Name, Account Number, Account Holder Name** — required text fields.
- **Notes** — optional free text.

### Three submission flows

1. **Pick existing vendor** — Combobox → vendor selected → fields auto-fill read-only. Submitter can toggle "Edit details" if the bank info changed. Editing prompts: "Update the vendor record for future expenses, or use these values just this time?"

2. **Add new vendor (save to directory)** — Fill fields + checkbox ON. Mutation inserts `vendors` row AND snapshots onto the expense in one transaction.

3. **Ad-hoc one-off (skip directory)** — Fill fields + checkbox OFF. Snapshot only; no `vendors` row.

### Validation (submitter-side)

- Bank name, account holder name: `.trim()` required, non-empty.
- Account number: digits-only after normalization (strip spaces, dashes, periods), min 6, max 20.
- Duplicate detection: if typed vendor name exactly matches an existing active vendor (case-insensitive), show "Did you mean: PT Kemasan Jaya?" with one-click apply.
- All three snapshot fields required before submit — blocks submission if any missing.

### Edit-existing-draft behavior

Drafts aren't part of the audit trail yet, so re-selecting a vendor in a draft overwrites the snapshot fresh each save. Once the expense is `submitted` or beyond, snapshot fields are immutable (enforced in the update mutation).

---

## Approver / Admin UX

### Vendor Payment Details block

A `<VendorPaymentDetails />` component reused across:
- `ExpenseApproval.tsx` — shown on each pending payment_request card.
- `MyExpenses.tsx` — shown on submitter's own expense detail view.
- `ExpenseSubmit.tsx` — shown as preview on draft payment_request expenses.

Block contents:
- **Bank:** value + single-field copy-to-clipboard button
- **Acct #:** value + copy button
- **Holder:** value + copy button
- **Notes:** value (no copy)
- **Copy all** button at block header — copies a WhatsApp-ready multi-line block including amount and expense number, for users who execute transfers on a different device.

Copy uses `navigator.clipboard.writeText()` + Sonner toast ("Account number copied").

Block visibility: only rendered when `paymentMethod === "payment_request"` AND snapshot fields are populated. Hidden on `employee_paid` and `company_paid` expenses.

### Mark-as-Paid dialog enhancement

When admin clicks "Mark as Paid" on an approved payment_request, the dialog renders the payee block prominently at the top so admin can read details while switching to BCA mobile:

```
Pay to:
  BCA · 1234567890                      [copy]
  Budi Santoso
  Rp 2,450,000

Transaction Reference *
[ BCA ref number after transfer... ]
```

### Drift-detection tooltip

If the snapshot fields on the expense differ from the current `vendors` row (i.e., the vendor was edited between submit and pay), a small warning icon appears next to the snapshot: "Vendor's current bank details differ — verify with submitter before paying." The snapshot wins (audit integrity); the tooltip is informational only.

---

## Vendors Manager Page

**Route:** `/vendors`
**File:** `src/pages/VendorsManager.tsx`
**Access:** `canAccessVendors` → `manager`, `admin`

Features:
- List of active vendors (default tab) + inactive vendors (separate tab)
- Edit vendor name, bank name, account number, account holder name, notes
- Deactivate (soft-delete) — preserves history, hides from picker in new submissions
- Usage count per vendor: "Used in N expenses" (derived from `expenses.vendorId` index)
- Cannot hard-delete a vendor with any expense references — matches FK-protection pattern used elsewhere (Phase 78 lesson in session memory).

**Navigation:** Add "Vendors" link under the Finance section of the sidebar (same group as Expenses, Bank Reconciliation, Asset Register).

---

## Access Control

| Action | Roles | Enforcement |
|---|---|---|
| Create vendor inline (during expense submit) | kitchen, order_staff, manager, admin | `requireRole` in `createVendor` mutation |
| List / search active vendors | kitchen, order_staff, manager, admin | `requireRole` in list/search queries |
| Edit vendor bank details | manager, admin | `requireRole` in `updateVendor` mutation |
| Deactivate vendor | manager, admin | `requireRole` in `deactivateVendor` mutation |
| Access `/vendors` page | manager, admin (`canAccessVendors`) | `ProtectedRoute` in `App.tsx` |

Submitters can create new vendors but cannot edit/deactivate existing ones. This prevents one submitter from changing another's vendor data mid-flight.

---

## Validation & Edge Cases

### Backend validation (Convex mutations)

1. **Schema-level conditional** (`convex/expenses/helpers.ts`): payment_request requires all three snapshot fields; other payment methods forbid them. Violation throws with clear message.
2. **Account number normalization** (`convex/vendors/helpers.ts`): strip whitespace, dashes, periods on insert. Store digits only. Validate min 6, max 20 chars.
3. **Duplicate vendor prevention** (`createVendor`): case-insensitive name match among active vendors. If exact match found, return existing record. If match with different bank details, throw with "Vendor already exists — pick existing or update it instead."
4. **FK protection on delete** (`deleteVendor`): throw if any `expenses.vendorId` references this vendor. Only `deactivateVendor` succeeds in that case.
5. **Snapshot immutability** (`updateExpense`): once `status !== "draft"`, cannot patch any of the four snapshot fields. Must `void` + resubmit to correct.

### Edge cases handled

- **Vendor edited after submission, before payment** — admin sees snapshot, not current vendor row. Drift tooltip surfaces the diff.
- **Vendor deactivated with pending expenses** — pending expenses keep snapshot and remain payable. Picker excludes deactivated vendor for new submissions.
- **CSV import of historical expenses** (`HistoricalImportPage.tsx`) — if `paymentMethod = payment_request`, the three snapshot fields must be present in the CSV row. Validator enforces. No `vendors` row auto-created (directory is forward-looking only).
- **Draft edits** — re-picking vendor overwrites snapshot; no drift on drafts.
- **Ad-hoc vendor with no `vendorId`** — renders fine in block; no directory linkage, no edit button.

### Deliberately NOT handled in v1

- Bank-specific account number pattern/checksum validation — Indonesian banks vary too widely, high false-positive risk.
- Vendor merge tool — manual data cleanup sufficient initially.
- Per-vendor spend analytics.
- Bank reconciliation auto-match using payee account number — deferred; sensible follow-up.
- Vendor contact info (phone, email).

---

## Backend API Surface

### New Convex files

- `convex/vendors/schema-fragment.ts` (or added directly to `convex/schema.ts`)
- `convex/vendors/mutations.ts`
  - `createVendor({ token, name, bankName, accountNumber, accountHolderName, notes? })`
  - `updateVendor({ token, vendorId, ...fields })`
  - `deactivateVendor({ token, vendorId })`
  - `reactivateVendor({ token, vendorId })`
- `convex/vendors/queries.ts`
  - `list({ includeInactive? })`
  - `search({ queryString, includeInactive? })`
  - `getById({ vendorId })`
  - `getUsageCount({ vendorId })`
- `convex/vendors/helpers.ts` — pure functions (normalize account number, validate payment_request snapshot)
- `convex/vendors/__tests__/mutations.test.ts`

### Modified Convex files

- `convex/schema.ts` — add `vendors` table + snapshot fields on `expenses`
- `convex/expenses/mutations.ts` — extend `submitExpense` / `updateDraft` to accept optional `createVendorWithDetails` args + snapshot on expense row
- `convex/expenses/helpers.ts` — extend validation for payment_request snapshot rule
- `convex/lib/auth.ts` — add `canAccessVendors` permission helper

---

## Frontend Surface

### New files

- `src/pages/VendorsManager.tsx`
- `src/components/vendors/VendorPicker.tsx` — combobox with search + inline create
- `src/components/vendors/VendorPaymentDetails.tsx` — display block with copy buttons
- `src/components/vendors/VendorForm.tsx` — shared create/edit form
- `src/hooks/convex/useVendors.ts`

### Modified files

- `src/App.tsx` — add `/vendors` route
- `src/components/layout/Sidebar` (or equivalent) — add Vendors nav link
- `src/components/expense/ExpenseSubmitForm.tsx` — render VendorPicker when `paymentMethod === "payment_request"`
- `src/pages/ExpenseApproval.tsx` — render VendorPaymentDetails in each card
- `src/pages/MyExpenses.tsx` — render VendorPaymentDetails in detail view
- `src/components/expenses/ApprovalActions.tsx` — render VendorPaymentDetails in Mark-as-Paid dialog
- `src/lib/csvImportValidation.ts` — enforce snapshot presence for payment_request rows

---

## Tests

### Backend (Vitest + convex-test)

- `convex/vendors/__tests__/mutations.test.ts`
  - Create vendor — happy path, normalizes account number
  - Duplicate name prevention — same bank → returns existing; different bank → throws
  - Update vendor — updates fields, bumps `updatedAt`
  - Deactivate with FK reference — succeeds (soft-delete); hard delete throws
  - Role gates — submitter cannot update/deactivate

- `convex/expenses/__tests__/helpers.test.ts` (extended)
  - payment_request with all snapshot fields → valid
  - payment_request missing any snapshot field → throws
  - employee_paid with snapshot fields → throws (both-or-neither rule)

### Frontend E2E (Playwright)

- Submit payment_request expense with new vendor → approve → mark as paid
- Verify VendorPaymentDetails renders correctly on each status
- Verify copy buttons fire clipboard write (stub `navigator.clipboard`)
- Verify new vendor appears in VendorsManager list
- Verify deactivated vendor doesn't appear in picker

---

## Documentation Updates

- `docs/SCHEMA.md` — new `vendors` table + snapshot fields on `expenses`
- `docs/API_REFERENCE.md` — new vendor mutations/queries
- `docs/CHANGELOG.md` — "Payment requests now capture vendor bank details inline — vendor directory with snapshot-on-submit"
- `CLAUDE.md` Quick File Finder — add Vendors row
- Help Center walkthrough (if scope permits) — 3-step walkthrough for submitters on using the picker

---

## Success Criteria

- [ ] Submitter can pick or create a vendor inline while submitting a payment_request expense
- [ ] Vendor bank details appear on ExpenseApproval, MyExpenses, and Mark-as-Paid dialog with copy buttons
- [ ] "Copy all" button produces a WhatsApp-ready payment block
- [ ] Vendors Manager page lists, edits, and deactivates vendors (manager/admin only)
- [ ] Snapshot fields are immutable after draft; vendor edits do not retro-change paid expenses
- [ ] Drift warning appears when vendor was edited between submit and pay
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Backend tests pass (vendor CRUD + snapshot validation)
- [ ] E2E test: submit→approve→pay payment_request flow

---

## Open Questions (resolved during brainstorm)

| Question | Resolution |
|---|---|
| Vendor frequency? | Mix of regulars + one-offs — directory + ad-hoc both needed |
| Who enters bank details? | Always the submitter — blocking |
| Required fields? | name, bankName, accountNumber, accountHolderName, notes |
| Admin payment UX? | Display + copy buttons (v1); Copy-all added as 10-LOC extra |
| Reuse `bankAccounts`? | No — different semantics (source-of-funds vs payee) |
| FK-only vs snapshot? | Snapshot — audit integrity required |

---

## Phase Placement

Decimal phase between Phase 74 (Staff Attendance) and Phase 75 (Full P&L). Self-contained, no blockers.

Suggested: **Phase 74.5 — Vendor Bank Details for Payment Requests**.

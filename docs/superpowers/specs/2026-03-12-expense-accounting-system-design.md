# Frollie Expense & Accounting System — Design Spec

**Date:** 2026-03-12
**Status:** Approved
**Author:** Claude (CFO/CPA advisory mode) + Irfan

---

## 1. Overview

An end-to-end employee expense management and accounting system for Frollie Recipe Master. Introduces a Chart of Accounts backbone, auto-generated double-entry journal entries, expense submission with approval workflows, reimbursement batching with bank transfer tracking, and extended financial reporting (P&L through Net Income + Expense Analytics dashboard).

**Architecture approach:** Hybrid CoA + Smart Defaults (Option C). Business users interact with simple forms; the system auto-generates proper accounting entries behind the scenes. No manual journal posting required for day-to-day operations.

**Integration principle:** Zero regression to existing systems. Revenue (4xxx) and COGS (5xxx) continue using real-time aggregation from `externalRevenue` + BOM. OpEx (6xxx) entries are stored journal entries created by expense/payroll workflows. The P&L page extends below Gross Profit to show OpEx → EBIT → Net Income.

---

## 2. Chart of Accounts

Account numbering follows Indonesian PSAK conventions:

### Income Statement Accounts (4xxx–7xxx)

| Code | Name | Statement | Status |
|------|------|-----------|--------|
| 4100 | Direct Sales | P&L — Revenue | Existing (virtual from externalRevenue) |
| 4200 | GoFood Revenue | P&L — Revenue | Existing (virtual) |
| 4300 | Shopee Revenue | P&L — Revenue | Existing (virtual) |
| 4400 | TikTok Revenue | P&L — Revenue | Existing (virtual) |
| 4500 | K3Mart Revenue | P&L — Revenue | Existing (virtual) |
| 4600 | Consignment Revenue | P&L — Revenue | Existing (virtual) |
| 4700 | GrabFood Revenue | P&L — Revenue | Existing (virtual) |
| 5100 | Production COGS | P&L — COGS | Existing (virtual from BOM) |
| 5200 | Packaging COGS | P&L — COGS | Existing (virtual from BOM) |
| 5300 | Commissions & Fees | P&L — COGS | Existing (virtual) |
| 5400 | Platform Ad Burn | P&L — COGS | Existing (virtual) |
| 6100 | Salaries & Wages | P&L — OpEx | **New** |
| 6200 | Rent & Utilities | P&L — OpEx | **New** |
| 6300 | Transportation (Local) | P&L — OpEx | **New** |
| 6350 | Travel & Visa | P&L — OpEx | **New** |
| 6400 | Marketing & Promotion | P&L — OpEx | **New** |
| 6500 | Office & Supplies | P&L — OpEx | **New** |
| 6600 | Equipment & Maintenance | P&L — OpEx | **New** |
| 6700 | Software & Subscriptions | P&L — OpEx | **New** |
| 6800 | Professional Services | P&L — OpEx | **New** |
| 6900 | Meals & Entertainment | P&L — OpEx | **New** |
| 6990 | Miscellaneous OpEx | P&L — OpEx | **New** |
| 7100 | Interest Income | P&L — Other | **New** |
| 7200 | Interest Expense | P&L — Other | **New** |
| 7900 | Other Non-Operating | P&L — Other | **New** |

### Balance Sheet Accounts (1xxx–3xxx)

| Code | Name | Statement | Status |
|------|------|-----------|--------|
| 1100 | Cash (Bank Accounts) | BS — Assets | **New** |
| 1200 | Accounts Receivable | BS — Assets | **New** |
| 1300 | Inventory (Raw Materials) | BS — Assets | **New** |
| 1400 | Prepaid Expenses | BS — Assets | **New** |
| 1500 | Fixed Assets | BS — Assets | **New** |
| 1600 | Accumulated Depreciation | BS — Assets | **New** |
| 2100 | Accounts Payable | BS — Liabilities | **New** |
| 2200 | Employee Reimbursements Payable | BS — Liabilities | **New** |
| 2300 | Accrued Expenses | BS — Liabilities | **New** |
| 2400 | Tax Payable | BS — Liabilities | **New** |
| 2500 | Loans Payable | BS — Liabilities | **New** |
| 3100 | Owner's Capital | BS — Equity | **New** |
| 3200 | Retained Earnings | BS — Equity | **New** |
| 3300 | Current Period P&L | BS — Equity | **New** |

**Design for 3-statement model:** All accounts exist in the `accounts` table from day one. Balance Sheet and Cash Flow views are deferred to a future milestone but the data model supports them. Revenue/COGS accounts (4xxx–5xxx) are "virtual" — they exist in the CoA for classification but their values come from existing real-time aggregation, not stored journal entries.

---

## 3. Data Model

### New Tables (10)

#### `accounts` — Chart of Accounts
```
code: string (e.g., "6500") — unique, indexed
name: string (e.g., "Office & Supplies")
type: "asset" | "liability" | "equity" | "revenue" | "cogs" | "opex" | "other"
category: string (for P&L sub-grouping, e.g., "Operating Expenses")
isActive: boolean (default true, deactivated accounts hidden from dropdowns)
isSystem: boolean (default accounts cannot be deleted)
description: optional string
```
Indexes: `by_code` (unique), `by_type`, `by_active_type`

#### `expenses` — Individual Expense Claims
```
expenseNumber: string (EXP-MMDD-NNN)
submittedBy: Id<"users">
amount: number (IDR, must be > 0)
accountId: Id<"accounts"> (GL account link)
expenseDate: number (timestamp, the date money was spent)
description: string
vendorName: string
paymentMethod: "personal_cash" | "personal_transfer" | "company_card"
receiptFileId: optional Id<"_storage">
receiptImageHash: optional string (SHA-256)
status: "draft" | "submitted" | "approved" | "awaiting_payment" | "reimbursed" | "rejected" | "voided"
lateSubmission: boolean (expense date > 14 days before submission)
duplicateWarning: optional string (reference to similar expense)
submittedAt: optional number
approvedBy: optional Id<"users">
approvedAt: optional number
approverComment: optional string
rejectedBy: optional Id<"users">
rejectedAt: optional number
rejectionReason: optional string
previousExpenseId: optional Id<"expenses"> (resubmission chain)
```
Indexes: `by_submitter_status`, `by_status`, `by_amount_date_submitter` (duplicate detection), `by_receipt_hash`, `by_expense_number`

#### `expenseStatusHistory` — Immutable Audit Trail
```
expenseId: Id<"expenses">
fromStatus: string
toStatus: string
changedBy: Id<"users">
changedAt: number
comment: optional string
```
Indexes: `by_expense`

#### `reimbursementBatches` — Batch Payment Groups
```
batchNumber: string (RMB-MMDD-NNN)
employeeUserId: Id<"users">
totalAmount: number
status: "pending" | "confirmed" | "voided"
bankAccountId: optional Id<"bankAccounts"> (source bank)
bankReference: optional string (BCA transaction ID)
transferDate: optional number
confirmedBy: optional Id<"users">
confirmedAt: optional number
voidedBy: optional Id<"users">
voidedAt: optional number
voidReason: optional string
```
Indexes: `by_batch_number`, `by_employee_status`, `by_status`

#### `reimbursementBatchItems` — Batch → Expense Links
```
batchId: Id<"reimbursementBatches">
expenseId: Id<"expenses">
```
Indexes: `by_batch`, `by_expense`

#### `journalEntries` — Accounting Ledger
```
entryNumber: string (JE-MMDD-NNN)
date: number
description: string
sourceType: "expense_approval" | "expense_void" | "reimbursement" | "reimbursement_void" | "payroll" | "manual"
sourceId: optional string (Id of the source record)
isReversed: boolean
reversedByEntryId: optional Id<"journalEntries">
createdBy: Id<"users">
createdAt: number
```
Indexes: `by_entry_number`, `by_source`, `by_date`

#### `journalEntryLines` — Debit/Credit Lines
```
journalEntryId: Id<"journalEntries">
accountId: Id<"accounts">
entryDate: number (denormalized from parent journalEntries.date — required for Convex indexing)
debitAmount: number (0 if credit line)
creditAmount: number (0 if debit line)
description: optional string
```
Indexes: `by_journal_entry`, `by_account_entryDate` (for GL balance/period queries — Convex indexes can only reference fields on own table, hence denormalized `entryDate`)

**Note:** When creating journal entry lines, always copy `journalEntries.date` into `journalEntryLines.entryDate`. This denormalization is required because Convex indexes cannot span tables.

#### `bankAccounts` — Company Bank Accounts
```
name: string (e.g., "BCA Frollie Ops")
bankName: string (e.g., "BCA")
accountNumber: string
isActive: boolean
```
Indexes: `by_active`

#### `payrollEntries` — Payroll Tracking
```
employeeType: "contractor" | "staff"
frequency: "weekly" | "monthly"
amount: number (IDR, must be > 0)
periodStart: number (start of pay period)
periodEnd: number (end of pay period)
description: string (e.g., "March 2026 — Production Staff")
attachmentFileId: optional Id<"_storage"> (payroll summary/slip)
createdBy: Id<"users"> (admin who entered it)
createdAt: number
```
Indexes: `by_period`, `by_employee_type`

**Note:** Payroll entries are admin-only, no approval flow. Each entry auto-generates a journal entry on creation. Payroll does not track individual employee salaries — it records the total amount per payment period as entered by admin.

**Payroll void:** Admin can void a payroll entry entered in error. This generates a reversing JE (CR 6100, DR 1100) and marks the original entry as voided. Corrections require creating a new payroll entry with the correct amount.

### Modified Tables (1)

#### `users` — Add Bank Details
```
+ bankAccountNumber: optional string
+ bankName: optional string
```

### ID Generation

All IDs follow existing order number pattern: `MMDD-NNN` with daily sequential counter. Separate counters per prefix (EXP, RMB, JE). Counter resets daily.

### File Storage

Receipt images stored via Convex file storage (`_storage`). SHA-256 hash computed **client-side** before upload (using Web Crypto API `crypto.subtle.digest("SHA-256", arrayBuffer)`) and passed as a mutation argument alongside the storage ID. This avoids reading large files in Convex mutation context.

### Receipt Requirement

- **Amount > Rp 50,000:** `receiptFileId` is required. Backend mutation rejects submission without receipt.
- **Amount ≤ Rp 50,000:** `receiptFileId` is optional. UI shows "Receipt recommended" hint but allows submission without.
- Frontend validates before submission; backend enforces as hard rule.

### ID Counter Table

A `counters` table tracks daily sequential numbers for each ID prefix:
```
prefix: string ("EXP" | "RMB" | "JE")
date: string ("0312" — MMDD format)
lastSequence: number
```
Index: `by_prefix_date` (unique compound). Mutations atomically increment `lastSequence` to generate the next number. Convex mutation serialization prevents race conditions.

### Concurrency Guards

Approval mutations must check `expense.status === "submitted"` before writing. If the status has already changed (another approver acted first), the mutation throws "Expense already processed." Convex's optimistic concurrency control ensures the read-then-write is atomic within a single mutation.

---

## 4. Expense Lifecycle

### Status Flow

```
Draft → Submitted → Approved → AwaitingPayment → Reimbursed
                  → Rejected → (Revised) → Submitted
Any non-terminal → Voided
```

**Status transitions:**
- `Draft → Submitted`: Employee clicks "Submit for Approval." Expense appears in eligible approvers' queues.
- `Submitted → Approved`: An eligible approver clicks "Approve." Journal entry auto-generated. Status moves to `AwaitingPayment` for personal_cash/personal_transfer expenses (needing reimbursement) or directly to `Approved` terminal for company_card expenses (no reimbursement needed).
- `Submitted → Rejected`: An approver clicks "Reject" with reason. Employee can revise and resubmit.
- `Approved → AwaitingPayment`: Automatic for expenses requiring reimbursement (paymentMethod = personal_cash or transfer).
- `AwaitingPayment → Reimbursed`: Admin confirms bank transfer via reimbursement batch.
- `Any non-terminal → Voided`: Admin voids with reason. If approved, generates reversing journal entry (CR OpEx, DR 2200). If reimbursed, must void the batch instead.

**Company card expenses:** When `paymentMethod = "company_card"`, the expense is a company payment, not an employee reimbursement. On approval, the journal entry is DR [OpEx account], CR 1100 Cash (not CR 2200 Reimbursements Payable). Status goes directly to `Approved` as terminal — no AwaitingPayment or Reimbursed steps needed.

### Delegation of Authority (DoA)

| Expense Amount | Eligible Approvers |
|---------------|-------------------|
| ≤ Rp 500,000 | Manager or Admin (except submitter) |
| > Rp 500,000 | Admin only (except submitter) |

Self-approval is blocked at the backend level regardless of frontend guards.

### Routing: Broadcast

All eligible approvers see pending expenses in their approval queue. First to act (approve/reject) wins. Approved/rejected expenses are removed from other approvers' queues via Convex real-time updates.

### Auto-Generated Journal Entries

**On approval (personal_cash / transfer — needs reimbursement):**
- DR [expense GL account] (e.g., 6500 Office & Supplies) — expense amount
- CR 2200 Employee Reimbursements Payable — expense amount
- Source: `expense_approval`, sourceId: expense._id

**On approval (company_card — no reimbursement):**
- DR [expense GL account] (e.g., 6500 Office & Supplies) — expense amount
- CR 1100 Cash (company bank account) — expense amount
- Source: `expense_approval`, sourceId: expense._id

**On reimbursement confirmation:**
- DR 2200 Employee Reimbursements Payable — batch total
- CR 1100 Cash (linked bank account) — batch total
- Source: `reimbursement`, sourceId: batch._id

**On reimbursement void:**
- DR 1100 Cash — batch total (reversal)
- CR 2200 Employee Reimbursements Payable — batch total (reversal)
- Source: `reimbursement_void`, sourceId: batch._id
- Original entry marked `isReversed: true`, linked via `reversedByEntryId`

**On expense void (approved but not yet reimbursed):**
- DR 2200 Employee Reimbursements Payable — expense amount (reversal)
- CR [expense GL account] — expense amount (reversal)
- Source: `expense_void`, sourceId: expense._id
- Original approval entry marked `isReversed: true`

**On payroll entry:**
- DR 6100 Salaries & Wages — payroll amount
- CR 1100 Cash — payroll amount
- Source: `payroll`, sourceId: payrollEntry._id

### Reimbursement Batching

1. Admin views approved expenses grouped by employee
2. Selects employees/expenses to include in batch
3. System generates one RMB batch per employee with auto-generated batch number
4. Admin transfers via BCA mobile, pastes RMB code in transfer notes
5. Admin returns to Frollie, enters BCA reference number, transfer date, source bank account
6. System confirms batch, generates journal entry, marks all linked expenses as Reimbursed

### Payroll Entries

- Admin-only, no approval pipeline
- Fields: employee type (contractor/staff), frequency (weekly/monthly), amount, period covered, optional attachment
- Direct journal entry generation: DR 6100, CR 1100

---

## 5. Fraud Controls

### Must-Have (v1)

| Control | Trigger | Action |
|---------|---------|--------|
| Duplicate detection | Same employee + amount + date within 7 days | Warning to submitter + flag for approver. Submission allowed. |
| Receipt hash dedup | Same SHA-256 image hash exists in system | Hard block — cannot submit. Shows reference to existing expense. |
| Submission deadline | Expense date > 14 days before submission | Late flag visible to approver. Submission allowed. |
| Approver comment | Amount ≥ Rp 500,000 | Comment mandatory on approval. Optional below threshold. |
| Rejection history | Expense has `previousExpenseId` | Full rejection chain shown to approver with reasons. Rejection count badge. |
| Void/reversal | Failed bank transfer | Admin voids batch → reversing JE → expenses return to AwaitingPayment. |
| Immutability | Expense status ≥ Approved | No field edits. Only void + resubmit as new expense. |

### Should-Have (v1, lighter implementation)

| Control | Trigger | Action |
|---------|---------|--------|
| Split detection | Same employee + same GL + multiple expenses within 48hrs summing > Rp 500K | Alert badge on approver view. |
| Approver concentration | Same approver approved >80% of one employee's expenses in rolling 30 days | Alert in expense analytics dashboard. |
| Unfamiliar vendor | Vendor name not seen in system in last 90 days | Flag for approver: "New vendor." |

### Nice-to-Have (design for, build later)

| Control | Description |
|---------|-------------|
| Monthly budget caps | Per GL category with warning at 80%/100% |
| Per-role spend limits | Monthly ceiling per role |
| OCR receipt extraction | Auto-extract amount from receipt photo for comparison |

---

## 6. UI Pages & Access Control

### New Pages (3)

#### Expense Manager (`/expenses`)
- **All roles** can submit their own expenses and view their history
- **Manager, Admin** see an "Approvals" tab with pending expenses (filtered by DoA eligibility)
- **Admin** additionally sees "All Expenses" tab for full audit view

Key components:
- Expense submission form (description, amount, category/GL, date, payment method, vendor, receipt upload)
- My Expenses list with status filters and timeline tracker
- Approval queue with expandable cards showing receipt, GL mapping, fraud flags
- Approve / Reject / Ask for Info actions

#### Reimbursement Manager (`/reimbursements`)
- **Admin only**

Key components:
- Queue view: approved expenses grouped by employee with bank details and running totals
- Batch creation: one-click RMB code generation per employee, GL breakdown shown
- Confirmation form: BCA reference, transfer date, source bank account, journal entry preview
- Batch history: searchable by RMB code or BCA reference, void action

#### Expense Analytics (`/expense-analytics`)
- **Manager, Admin**

Key dashboard cards:
- Total OpEx (period)
- Spend by Category (bar/pie chart)
- Spend by Employee
- Monthly Trend (6-month line chart)
- Pending Reimbursements total
- Average Approval Time (days)
- Active Fraud Flags (split detection, concentration, unfamiliar vendor)
- Budget vs Actual (placeholder for future budgets feature)

### Extended Page (1)

#### Financial Statement (`/financials`) — P&L Extension
Extends existing Income Statement below Gross Profit:

```
NET REVENUE                               (existing)
- TOTAL COGS                              (existing)
= GROSS PROFIT                            (existing)
─────────────────────────────────────────────────────
- Operating Expenses
    6100 Salaries & Wages                 Rp X,XXX,XXX
    6200 Rent & Utilities                 Rp X,XXX,XXX
    6300 Transportation (Local)           Rp X,XXX,XXX
    6350 Travel & Visa                    Rp X,XXX,XXX
    6400 Marketing & Promotion            Rp X,XXX,XXX
    6500 Office & Supplies                Rp X,XXX,XXX
    6600 Equipment & Maintenance          Rp X,XXX,XXX
    6700 Software & Subscriptions         Rp X,XXX,XXX
    6800 Professional Services            Rp X,XXX,XXX
    6900 Meals & Entertainment            Rp X,XXX,XXX
    6990 Miscellaneous OpEx               Rp X,XXX,XXX
  TOTAL OPERATING EXPENSES                Rp X,XXX,XXX
= EBIT (Operating Profit)                Rp X,XXX,XXX
  EBIT MARGIN                            XX.X%
- Other Income/Expense (7xxx)
= NET INCOME                              Rp X,XXX,XXX
  NET MARGIN                              XX.X%
```

OpEx data sourced from `journalEntryLines` aggregated by `accountId` + `entryDate` for the selected period. **Period filtering uses `entryDate`** (the business date of the expense/payroll, denormalized from `journalEntries.date`), NOT `_creationTime` (insertion time). This follows the project's established lesson that `_creationTime` is not business event time. Confidence level: `exact` (all entries come from approved claims or admin payroll entries).

**Charting library:** The Expense Analytics dashboard requires a charting library. Check if the existing Sales Analytics page already has one; if not, add Recharts (most popular React charting lib, tree-shakeable).

### Access Control Summary

| Page | Kitchen | Order Staff | Manager | Admin |
|------|---------|-------------|---------|-------|
| Expense Manager (own) | Submit + view own | Submit + view own | Submit + view own | Submit + view own |
| Expense Manager (approve) | — | — | ≤ 500K | All amounts |
| Expense Manager (audit) | — | — | — | All Expenses tab |
| Reimbursement Manager | — | — | — | Full access |
| Expense Analytics | — | — | View | Full access |
| Financial Statement (extended) | — | — | View | Full access |

New permission flags to add to `ROLE_PERMISSIONS`:
- `canSubmitExpenses` — all roles
- `canApproveExpenses` — manager, admin
- `canManageReimbursements` — admin
- `canAccessExpenseAnalytics` — manager, admin

---

## 7. Testing

### Unit Tests (Vitest + convex-test)

**Expense Submission:**
- Valid submission creates expense + status history entry
- Draft save doesn't trigger routing
- Missing required fields rejected
- Amount must be > 0
- Expense date cannot be in the future
- Expense date > 14 days ago sets `lateSubmission` flag
- Receipt required for amount > Rp 50,000 (no receiptFileId = rejection)
- Receipt optional for amount ≤ Rp 50,000

**Receipt Requirement Edge Cases:**
- Rp 50,000 exactly without receipt = allowed
- Rp 50,001 without receipt = rejected with "Receipt required for expenses over Rp 50,000"
- Rp 50,001 with receipt = allowed
- Draft save without receipt = always allowed (validation only on submit)

**Company Card Accounting:**
- company_card expense approved: JE is DR OpEx, CR 1100 Cash (not CR 2200)
- company_card expense: status goes to Approved as terminal (no AwaitingPayment)
- company_card expense: does not appear in reimbursement queue

**Expense Void (approved, not reimbursed):**
- Voiding approved expense creates reversing JE (CR OpEx, DR 2200)
- Voiding company_card approved expense creates reversing JE (CR OpEx, DR 1100)
- Cannot void a Reimbursed expense (must void the batch instead)

**Duplicate Detection:**
- Same employee + amount + date within 7 days returns warning with matching expense ID
- Different employee + same amount + date = no warning
- Same employee + same amount + 8 days apart = no warning

**Receipt Hash Dedup:**
- Same image hash hard blocks with reference to existing expense
- Different image = no block
- Same image from different employee = still blocks

**DoA Routing:**
- ≤ 500K: managers and admins eligible (minus submitter)
- \> 500K: admins only eligible (minus submitter)
- Admin submitting: excluded from own approval
- Single remaining eligible approver: auto-assigned
- Zero eligible approvers: block submission with error message

**Self-Approval Block:**
- Backend rejects `approvedBy === submittedBy` regardless of frontend
- Direct mutation call with matching IDs = hard rejection

**Approval Mutations:**
- Approve creates journal entry (DR OpEx, CR 2200)
- Reject requires reason for ≥ 500K
- Already-approved expense cannot be approved again (concurrency guard)

**Resubmission:**
- Only Rejected expenses can be resubmitted
- New expense links to rejected via `previousExpenseId`
- Approver view shows full rejection chain

**Reimbursement Batching:**
- Only Approved expenses can be batched
- Batch total = sum of included expenses
- Cannot mix employees in one batch
- RMB number format correct
- Empty batch rejected

**Batch Confirmation:**
- Generates journal entry (DR 2200, CR 1100)
- All linked expenses → Reimbursed status
- Cannot confirm already-confirmed batch

**Batch Void:**
- Generates reversing journal entry
- Linked expenses → AwaitingPayment
- Requires reason
- Cannot void already-voided or never-confirmed batch

**Journal Entry Integrity:**
- Every entry balances (debits = credits)
- Entries immutable (no update mutation)
- Reversal creates new entry with correct linkage

**Split Detection:**
- Same employee + same GL + 48hrs + sum > 500K = flag
- Different GL accounts = no flag
- 72hrs apart = no flag
- Exactly 500K sum = no flag

**Payroll Entries:**
- Admin-only (other roles rejected)
- Creates correct journal entry (DR 6100, CR 1100)
- Amount > 0 required

**P&L Integration:**
- OpEx total matches approved expenses + payroll for period
- Voided reimbursements don't affect OpEx
- EBIT = Gross Profit - Total OpEx
- Net Income = EBIT - Other Expense + Other Income

### Edge Cases

| Case | Expected |
|------|----------|
| Rp 500,000 exactly | Manager CAN approve |
| Rp 500,001 | Admin only |
| Rp 0 | Rejected |
| Expense date = today | Allowed, no late flag |
| Expense date = 14 days ago | Allowed, no late flag (inclusive) |
| Expense date = 15 days ago | Allowed with late flag |
| Single admin submits > 500K | Block: "No eligible approver" |
| Two approvers click simultaneously | First write wins, second gets error |
| Batch with 1 expense | Valid |
| Confirmed batch, bank transfer failed | Void → reversing JE → expenses re-batchable |
| Employee deactivated with pending expenses | Expenses stay visible, approvable, reimbursable |
| GL account deactivated | Existing expenses keep link, new submissions can't select it |
| Rp 50,000 without receipt | Allowed (threshold is >) |
| Rp 50,001 without receipt | Rejected |
| Company card Rp 300K approved | JE: DR OpEx, CR Cash. No reimbursement queue entry. |
| Company card expense voided after approval | Reversing JE: CR OpEx, DR Cash |
| Void approved expense (personal_cash) | Reversing JE: CR OpEx, DR 2200. Status → Voided. |
| Void AwaitingPayment expense | Same as above — must void the expense, not the batch |
| Void Reimbursed expense | Blocked — must void the batch instead |

### E2E Tests (Playwright)

1. **Happy path:** order staff submits → manager approves → admin batches → confirms → all statuses verified
2. **Rejection → resubmit:** submit → reject with reason → verify visible → resubmit → chain shown → approve
3. **Void reimbursement:** full happy path → void → verify reversing JE → expenses back to AwaitingPayment
4. **DoA enforcement:** submit Rp 600K → manager queue empty → admin queue has it
5. **Self-approval prevention:** admin submits → own approval queue doesn't show it

---

## 8. Governance Rules Summary

| Rule | Enforcement |
|------|------------|
| No self-approval | Backend mutation rejects `approvedBy === submittedBy` |
| DoA thresholds | Backend filters eligible approvers before routing |
| Receipt required > Rp 50K | Frontend validation + backend enforcement |
| Immutability after approval | No update mutation exists for approved expenses |
| Mandatory approver comment ≥ 500K | Backend validation on approve mutation |
| Submission deadline (14 days) | Soft flag, not hard block |
| Full audit trail | `expenseStatusHistory` records every transition with actor and timestamp |
| Receipt permanence | Receipt files linked to journal entries, not deletable after approval |
| Journal entry integrity | Sum of debits must equal sum of credits — validated on creation |

---

## 9. Future Extensions (Designed For, Not Built)

| Feature | Data Model Ready? | Notes |
|---------|------------------|-------|
| Balance Sheet view | Yes | Query `journalEntryLines` by account type 1xxx–3xxx |
| Cash Flow Statement | Yes | Query entries touching account 1100 |
| Monthly budgets per GL | Add `budgets` table | Compare against `journalEntryLines` aggregation |
| OCR receipt extraction | Receipt images stored | Add extraction step on upload |
| Bank statement import/matching | `bankAccounts` + `bankReference` fields exist | Add CSV parser + fuzzy matching |
| Multi-currency | Add `currency` + `exchangeRate` to expenses | IDR-only for now |
| Recurring expenses | Add `recurrence` fields to expenses | For subscriptions auto-creation |

---

## 10. Implementation Notes

### Seeding
Following existing patterns (`tags:seedDefaults`, `menuProducts:seedDefaults`), implement `accounts:seedDefaults` to pre-populate the Chart of Accounts with all accounts listed in Section 2. System accounts (`isSystem: true`) cannot be deleted by users.

### Auth Pattern
All protected mutations must include `token: v.string()` in args and call `requireRole(ctx, args.token, [...])` from `convex/lib/auth.ts`. This is the established auth pattern across the codebase.

### Convex Validators
Use `v.union(v.literal("asset"), v.literal("liability"), ...)` for union type fields (account type, expense status, payment method, etc.), following the `externalSource` pattern in `convex/schema.ts`.

### Receipt URL Serving
Use `ctx.storage.getUrl(receiptFileId)` in queries to generate temporary URLs for receipt display, following the pattern in `convex/feedback/queries.ts`.

# Phase 59: Expense Payment Method Overhaul - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning (re-plan — absorbs Phase 59.1)

<domain>
## Phase Boundary

Overhaul the expense payment method model: replace 3 legacy literals with 3 new ones (`employee_paid`, `company_paid`, `payment_request`) covering all company expense flows. Each has distinct JE timing and approval behavior:

1. **employee_paid** (retrospective) — employee fronted money, needs reimbursement
2. **company_paid** (retrospective) — company bank already debited, employee records it, admin acknowledges
3. **payment_request** (prospective) — employee requests company to pay vendor, admin approves, someone executes bank transfer

Adds `recorded` and `paid` statuses, `transactionReference` field, Acknowledge/Flag actions for company_paid, and Mark as Paid flow for payment_request.

Does NOT include: bank statement import/matching, multi-bank account tracking, reconciliation automation, batch payment requests, or payment deadlines.

</domain>

<decisions>
## Implementation Decisions

### Payment Method Simplification
- Replace 3 literals (`personal_cash`, `personal_transfer`, `company_card`) with 3 new ones: `employee_paid`, `company_paid`, `payment_request`
- No data migration needed — zero existing expense records in production
- `employee_paid` = employee fronted the money, needs reimbursement (old personal_cash + personal_transfer behavior)
- `company_paid` = company bank already debited (direct debit, linked Shopee/BCA, company card swipe), employee is just recording it
- `payment_request` = prospective — employee requests company to pay a vendor directly from the bank account, money hasn't moved yet
- Frontend dropdown shows 3 options with inline tooltip/helper text:
  - **Reimburse Employee**: "I paid for this myself and need the company to pay me back"
  - **Paid by Company**: "The company bank account was already charged (e.g., direct debit, linked Shopee/BCA)"
  - **Payment Request**: "I need the company to pay this vendor directly from the bank account"

### Schema Changes
- `paymentMethod` union: `v.literal("employee_paid")` | `v.literal("company_paid")` | `v.literal("payment_request")`
- New optional field: `transactionReference: v.optional(v.string())` — bank ref number / transaction ID
- New optional field: `flaggedForReview: v.optional(v.boolean())` — admin soft flag for company_paid
- New optional field: `flaggedBy: v.optional(v.id("users"))`
- New optional field: `flaggedAt: v.optional(v.number())`
- New optional field: `flagReason: v.optional(v.string())`
- New optional field: `paidAt: v.optional(v.number())` — when bank transfer was executed (payment_request only)
- Add `recorded` to status union: `v.literal("recorded")` — for company_paid expenses after submission
- Add `paid` to status union: `v.literal("paid")` — for payment_request expenses after bank transfer executed

### Journal Entry Treatment
- All 3 types use same JE structure: DR Expense Account (user-selected GL code), CR 1100 (Cash/Bank)
- **Timing differs by payment type:**
  - `employee_paid`: JE created on approval (existing behavior)
  - `company_paid`: JE created on submission (auto-journaled, money already left bank)
  - `payment_request`: JE created on "mark as paid" (money leaves bank at that point)
- JE description indicates payment type: e.g., "Expense EXP-0316-001 [Company Paid]: Office supplies" or "Expense EXP-0316-002 [Payment Request]: Vendor payment for X"

### Status Flow: employee_paid (unchanged beyond rename)
- `draft` → `submitted` → admin approves → `approved` → JE created → `awaiting_payment` → reimbursement flow
- No changes to existing flow beyond the literal rename

### Status Flow: company_paid
- `draft` → `submitted` (employee submits) → system auto-creates JE, status set to `recorded` → admin clicks Acknowledge → `approved`
- Admin can also "Flag for Review" — sets `flaggedForReview=true`, status stays `recorded`, badge shown
- Flagging does NOT reverse or suspend the JE — the JE reflects reality (money already left bank)
- If admin determines expense is truly wrong, they void it separately using existing void flow (which reverses the JE)
- `recorded` is NOT a terminal status — admin must acknowledge or void

### Status Flow: payment_request
- `draft` → `submitted` → admin approves → `approved` (no JE yet — money hasn't moved)
- After bank transfer executed: someone marks it as paid → status `paid` → JE created at this point
- The "mark as paid" step captures `transactionReference` (bank ref number) and `paidAt` timestamp
- Admin can reject the request (standard reject flow) — no money moves, no JE
- Admin approves = authorization to make the bank transfer, NOT confirmation that payment happened
- Admin can approve it "straight away" — but the approval gate exists for control

### Mark as Paid (payment_request only)
- New mutation: `markAsPaid` — transitions `approved` → `paid`, creates JE, captures transaction reference
- Who can mark as paid: manager, admin (same roles that can approve)
- Required fields: `transactionReference` (mandatory — must have bank proof), `paidAt` (defaults to now)
- This is the step where the JE gets created for payment_request

### Receipt / Evidence Requirements
- `company_paid`: receipt ALWAYS required regardless of amount (company money = mandatory evidence)
- `payment_request`: receipt ALWAYS required regardless of amount (company money = mandatory evidence)
- `employee_paid`: existing threshold applies (receipt required for > Rp 50,000)

### Transaction Reference Field
- Optional text field `transactionReference` on expense form
- For `company_paid`: shown at submission time (debit already happened, employee knows the ref)
- For `payment_request`: captured at "mark as paid" step (bank transfer hasn't happened yet at submission)
- For `employee_paid`: not shown (not relevant)
- Stores bank ref number, Shopee order ID, BCA transaction ID, etc.

### Approval Queue (ExpenseApproval page)
- All 3 payment types appear in the SAME list (no separate tabs per type)
- Visually distinguished with badges: "Company Paid", "Payment Request", or no badge for employee_paid
- Action buttons vary by payment type and status:
  - `employee_paid` in `submitted`: Approve / Reject (existing)
  - `company_paid` in `recorded`: Acknowledge / Flag for Review
  - `payment_request` in `submitted`: Approve / Reject (standard approval)
  - `payment_request` in `approved`: Mark as Paid (after bank transfer executed)
- Flagged expenses show a warning badge in the list

### Fraud Controls
- Existing fraud controls (duplicate detection, receipt hash, late submission) apply to ALL payment types
- Additional: company_paid submissions without transaction reference get a soft warning (not a block)

### Claude's Discretion
- Exact badge styling and color for "Company Paid" vs "Payment Request" vs "Employee Paid"
- Flag for Review dialog design (reason field, etc.)
- Whether `recorded` and "Pending Payment" expenses appear in filter tabs or just in the main list
- Exact UI for the "Mark as Paid" action (inline button, dialog, separate page)
- Whether `paidAt` should default to now or require manual entry
- Whether to add a `paidBy` field tracking who executed the bank transfer
- Error message wording
- How to handle the `getTargetStatusAfterApproval` helper refactor
- Index strategy for the new status queries

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/expenses/helpers.ts`: `getTargetStatusAfterApproval()` — needs update for 3 new literals
- `convex/expenses/mutations.ts`: `approveExpense` — journal creation logic reusable for company_paid auto-journal and payment_request mark-as-paid
- `convex/lib/journalEngine.ts`: `createJournalEntryWithLines`, `buildDebitLine`, `buildCreditLine` — unchanged
- `src/pages/ExpenseSubmit.tsx`: `PAYMENT_METHODS` array — replace with 3 new options + tooltips
- `src/pages/ExpenseApproval.tsx`: approval queue — add Acknowledge/Flag for company_paid + Mark as Paid for payment_request

### Established Patterns
- `paymentMethodValidator` in mutations.ts — update union literals
- `getTargetStatusAfterApproval()` helper — currently returns "approved" or "awaiting_payment" based on method
- Status badges in `src/components/expenses/StatusBadge.tsx` — add `recorded` and `paid` statuses
- `protectedMutation` pattern for all mutations
- `recordStatusChange()` for audit trail on every transition

### Integration Points
- Schema: `convex/schema.ts` expenses table — add fields, update unions
- Mutations: `convex/expenses/mutations.ts` — update createDraft, submitExpense, add acknowledgeExpense, flagExpense, markAsPaid
- Helpers: `convex/expenses/helpers.ts` — update getTargetStatusAfterApproval for 3 types
- Queries: `convex/expenses/queries.ts` — may need recorded/paid status filters
- Analytics: `convex/expenses/analyticsQueries.ts` — include recorded + approved + paid in analytics
- Frontend form: `src/pages/ExpenseSubmit.tsx` — 3-option dropdown with tooltips, conditional transactionReference field
- Frontend approval: `src/pages/ExpenseApproval.tsx` — badges, Acknowledge/Flag/Mark as Paid buttons
- Frontend analytics: `src/pages/ExpenseAnalytics.tsx` — may need to account for new statuses

</code_context>

<specifics>
## Specific Ideas

- "It's just 2 types of flows: employee pays and gets reimbursed, or company bank already debited and employee records it" — expanded to 3 with payment_request
- "There's a 3rd type of workflow where someone actively pays someone using the bank account — like we need to pay a vendor straight away"
- "It still needs a flow for approval but an admin should just approve it straight away"
- "Admins should see it in their approvals queue but not to approve since it's already approved — they can mark it for review if something looks wrong" (company_paid)
- Example: Shopee purchase linked to BCA bank account — employee records the expense, attaches Shopee receipt, enters BCA transaction reference
- The key distinction for payment_request: this is the only prospective flow — money hasn't moved at submission time
- Transaction reference for payment_request is captured AFTER payment execution, not at submission (unlike company_paid where it's captured at submission)
- The `expenseDate` field already captures when the transaction occurred — no new date field needed

</specifics>

<deferred>
## Deferred Ideas

- Bank statement import / CSV upload for automated matching against transactionReference — future phase
- Multi-bank account tracking (separate bank accounts instead of single 1100 Cash) — future phase
- Reconciliation automation (match bank statement lines to recorded expenses) — future phase
- Splitting `1100 Cash (Bank Accounts)` into individual bank accounts (BCA, Mandiri, etc.) in CoA — future phase
- Batch payment requests (group multiple approved requests into one bank transfer) — future phase
- Payment deadline / urgency levels for payment_request — future phase
- Payment execution tracking (who transferred, from which bank account) — could enhance with `paidBy` field

</deferred>

---

*Phase: 59-direct-debit-expense-flow-company-paid-transactions-with-different-journal-entries-and-no-reimbursement*
*Context gathered: 2026-03-16 (merged with Phase 59.1)*

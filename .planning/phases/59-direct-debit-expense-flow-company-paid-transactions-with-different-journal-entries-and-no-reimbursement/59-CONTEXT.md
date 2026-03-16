# Phase 59: Direct Debit Expense Flow - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Simplify the payment method model from 3 literals to 2 (`employee_paid`, `company_paid`), add a "company-paid" expense flow where JEs are auto-created on submission (no approval gate), introduce a new `recorded` status for admin review, and update the approval queue to handle Acknowledge/Flag actions for company-paid expenses. Adds `transactionReference` field for future bank statement reconciliation.

Does NOT include: bank statement import/matching, multi-bank account tracking, reconciliation automation, or changes to the reimbursement flow beyond renaming.

</domain>

<decisions>
## Implementation Decisions

### Payment Method Simplification
- Replace 3 literals (`personal_cash`, `personal_transfer`, `company_card`) with 2: `employee_paid` and `company_paid`
- No data migration needed — zero existing expense records in production
- `employee_paid` = employee fronted the money, needs reimbursement (old personal_cash + personal_transfer behavior)
- `company_paid` = company bank already debited (direct debit, linked Shopee/BCA, company card swipe), employee is just recording it
- Frontend dropdown shows exactly 2 options with clear labels

### Schema Changes
- `paymentMethod` union: `v.literal("employee_paid")` | `v.literal("company_paid")`
- New optional field: `transactionReference: v.optional(v.string())` — bank ref number / transaction ID for future reconciliation
- New optional field: `flaggedForReview: v.optional(v.boolean())` — admin soft flag
- New optional field: `flaggedBy: v.optional(v.id("users"))`
- New optional field: `flaggedAt: v.optional(v.number())`
- New optional field: `flagReason: v.optional(v.string())`
- Add `recorded` to status union: `v.literal("recorded")` — new status for company_paid expenses after submission

### Journal Entry Treatment
- Both `employee_paid` and `company_paid` use same JE: DR Expense Account (user-selected GL code), CR 1100 (Cash/Bank)
- **Key difference in timing**: `employee_paid` JE created on approval (existing behavior). `company_paid` JE created on submission (auto-journaled, money already left bank)
- JE description should indicate payment type: e.g., "Expense EXP-0316-001 [Company Paid]: Office supplies"

### Status Flow: company_paid
- `draft` → `submitted` (employee submits) → system auto-creates JE, status set to `recorded` → admin clicks Acknowledge → `approved`
- Admin can also "Flag for Review" — sets `flaggedForReview=true`, status stays `recorded`, badge shown
- Flagging does NOT reverse or suspend the JE — the JE reflects reality (money already left bank)
- If admin determines expense is truly wrong, they void it separately using existing void flow (which reverses the JE)
- `recorded` is NOT a terminal status — admin must acknowledge or void

### Status Flow: employee_paid (unchanged)
- `draft` → `submitted` → (admin approves) → `approved` → JE created → `awaiting_payment` → reimbursement flow
- No changes to existing employee_paid flow beyond the literal rename

### Receipt / Evidence Requirements
- `company_paid`: receipt ALWAYS required regardless of amount (company money = mandatory evidence)
- `employee_paid`: existing threshold applies (receipt required for > Rp 50,000)

### Transaction Reference Field
- Optional text field `transactionReference` shown on expense form ONLY when `company_paid` is selected
- For bank ref number, Shopee order ID, BCA transaction ID, etc.
- Stored on expense record for future bank statement matching (Phase TBD)

### Approval Queue (ExpenseApproval page)
- Company_paid expenses appear in the SAME list as employee_paid (no separate tab)
- Visually distinguished with a "Company Paid" badge on the expense card
- Different action buttons for company_paid in `recorded` status: "Acknowledge" and "Flag for Review" (instead of Approve/Reject)
- Flagged expenses show a warning badge in the list
- Existing Approve/Reject actions remain for employee_paid expenses

### Fraud Controls
- Existing fraud controls (duplicate detection, receipt hash, late submission) apply to BOTH payment types
- Additional: company_paid submissions without transaction reference get a soft warning (not a block)

### Claude's Discretion
- Exact badge styling and color for "Company Paid" vs "Employee Paid"
- Flag for Review dialog design (reason field, etc.)
- Whether `recorded` expenses appear in a "Pending Review" filter tab or just in the main list
- Error message wording
- How to handle the `getTargetStatusAfterApproval` helper refactor
- Index strategy for the new `recorded` status queries

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/expenses/helpers.ts`: `getTargetStatusAfterApproval()` — needs update for new literals
- `convex/expenses/mutations.ts`: `approveExpense` — journal creation logic reusable for company_paid auto-journal
- `convex/lib/journalEngine.ts`: `createJournalEntryWithLines`, `buildDebitLine`, `buildCreditLine` — unchanged
- `src/pages/ExpenseSubmit.tsx`: `PAYMENT_METHODS` array — replace with 2 new options
- `src/pages/ExpenseApproval.tsx`: approval queue — add Acknowledge/Flag actions for company_paid

### Established Patterns
- `paymentMethodValidator` in mutations.ts — update union literals
- `getTargetStatusAfterApproval()` helper — currently returns "approved" or "awaiting_payment" based on method
- Status badges in `src/components/expenses/StatusBadge.tsx` — add `recorded` status
- `protectedMutation` pattern for all mutations
- `recordStatusChange()` for audit trail on every transition

### Integration Points
- Schema: `convex/schema.ts` expenses table — add fields, update union
- Mutations: `convex/expenses/mutations.ts` — update createDraft, submitExpense, add acknowledgeExpense, flagExpense
- Helpers: `convex/expenses/helpers.ts` — update getTargetStatusAfterApproval
- Queries: `convex/expenses/queries.ts` — may need recorded status filter
- Analytics: `convex/expenses/analyticsQueries.ts` — include recorded + approved in analytics
- Frontend form: `src/pages/ExpenseSubmit.tsx` — 2-option dropdown, conditional transactionReference field
- Frontend approval: `src/pages/ExpenseApproval.tsx` — badge, Acknowledge/Flag buttons
- Frontend analytics: `src/pages/ExpenseAnalytics.tsx` — may need to account for new statuses

</code_context>

<specifics>
## Specific Ideas

- "It's just 2 types of flows: employee pays and gets reimbursed, or company bank already debited and employee records it"
- "Admins should see it in their approvals queue but not to approve since it's already approved — they can mark it for review if something looks wrong"
- Example: Shopee purchase linked to BCA bank account — employee records the expense, attaches Shopee receipt, enters BCA transaction reference
- The `expenseDate` field already captures when the transaction occurred — no new date field needed

</specifics>

<deferred>
## Deferred Ideas

- Bank statement import / CSV upload for automated matching against transactionReference — future phase
- Multi-bank account tracking (separate bank accounts instead of single 1100 Cash) — future phase
- Reconciliation automation (match bank statement lines to recorded expenses) — future phase
- Splitting `1100 Cash (Bank Accounts)` into individual bank accounts (BCA, Mandiri, etc.) in CoA — future phase

</deferred>

---

*Phase: 59-direct-debit-expense-flow-company-paid-transactions-with-different-journal-entries-and-no-reimbursement*
*Context gathered: 2026-03-16*

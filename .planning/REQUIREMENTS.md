# Requirements: v1.7 Expense & Accounting

## Chart of Accounts
- [ ] **COA-01**: Admin can view the full Chart of Accounts with account code, name, type, and active status
- [ ] **COA-02**: Admin can add custom GL accounts with unique codes following PSAK numbering conventions
- [ ] **COA-03**: Admin can deactivate GL accounts (hidden from new expense dropdowns, existing references preserved)
- [x] **COA-04**: System seeds 36 default accounts (4xxx Revenue, 5xxx COGS, 6xxx OpEx, 7xxx Other, 1xxx-3xxx Balance Sheet) on first run via `accounts:seedDefaults`
- [x] **COA-05**: System accounts (isSystem: true) cannot be deleted by users

## Expense Submission
- [ ] **EXP-01**: Any authenticated user can create and save expense drafts with description, amount, GL category, date, payment method, vendor, and optional receipt
- [ ] **EXP-02**: User can submit a draft expense for approval, triggering routing to eligible approvers
- [ ] **EXP-03**: Receipt image upload is required for expenses > Rp 50,000 and optional for ≤ Rp 50,000
- [ ] **EXP-04**: Receipt images are stored via Convex file storage with client-side SHA-256 hash for deduplication
- [ ] **EXP-05**: User can view their own expense history with status filters and timeline tracker
- [x] **EXP-06**: Expense numbers follow EXP-MMDD-NNN format with atomic daily counter

## Expense Approval
- [ ] **EXP-07**: Eligible approvers see pending expenses in their approval queue (broadcast routing — first to act wins)
- [ ] **EXP-08**: Expenses ≤ Rp 500,000 can be approved by Manager or Admin (except submitter)
- [ ] **EXP-09**: Expenses > Rp 500,000 can only be approved by Admin (except submitter)
- [ ] **EXP-10**: Self-approval is blocked at the backend level regardless of role
- [ ] **EXP-11**: Approver comment is mandatory for expenses ≥ Rp 500,000
- [ ] **EXP-12**: Approving an expense auto-generates a journal entry (DR OpEx account, CR 2200 or CR 1100 for company_card)
- [ ] **EXP-13**: Rejected expenses include a reason and can be revised and resubmitted (linked via previousExpenseId)
- [ ] **EXP-14**: Approved expenses with personal payment method auto-transition to AwaitingPayment status
- [ ] **EXP-15**: Company card expenses go directly to Approved as terminal status (no reimbursement needed)

## Expense Void
- [ ] **EXP-16**: Admin can void any non-terminal expense with a reason, generating a reversing journal entry
- [ ] **EXP-17**: Reimbursed expenses cannot be voided directly — the reimbursement batch must be voided instead
- [ ] **EXP-18**: Every status transition is recorded in an immutable audit trail (expenseStatusHistory)

## Fraud Controls — Must-Have
- [ ] **FRAUD-01**: System warns on duplicate detection (same employee + amount + date within 7 days)
- [ ] **FRAUD-02**: System hard-blocks submission of receipts with duplicate SHA-256 hash (shows reference to existing expense)
- [ ] **FRAUD-03**: Late submission flag shown to approver when expense date > 14 days before submission
- [ ] **FRAUD-04**: Rejection history with full chain shown to approver (count badge + reasons)
- [ ] **FRAUD-05**: Approved expenses are immutable — no field edits allowed, only void + resubmit

## Fraud Controls — Should-Have
- [ ] **FRAUD-06**: Split detection alert when same employee + same GL + multiple expenses within 48hrs sum > Rp 500K
- [ ] **FRAUD-07**: Approver concentration alert when same approver approved >80% of one employee's expenses in rolling 30 days
- [ ] **FRAUD-08**: Unfamiliar vendor flag when vendor name not seen in system in last 90 days

## Reimbursement
- [ ] **RMB-01**: Admin can view approved expenses grouped by employee with bank details and running totals
- [ ] **RMB-02**: Admin can create reimbursement batches (one per employee) with auto-generated RMB-MMDD-NNN number
- [ ] **RMB-03**: Admin can confirm a batch by entering BCA reference number, transfer date, and source bank account
- [ ] **RMB-04**: Confirming a batch auto-generates a journal entry (DR 2200, CR 1100) and marks all linked expenses as Reimbursed
- [ ] **RMB-05**: Admin can void a confirmed batch with reason, generating a reversing journal entry and returning expenses to AwaitingPayment
- [ ] **RMB-06**: Batch history is searchable by RMB code or BCA reference

## Bank Accounts
- [ ] **RMB-07**: Admin can manage company bank accounts (name, bank, account number, active status)
- [ ] **RMB-08**: Users can optionally store their bank account details on their profile for reimbursement

## Payroll
- [ ] **PAY-01**: Admin can create payroll entries with employee type (contractor/staff), frequency (weekly/monthly), amount, period, and optional attachment
- [ ] **PAY-02**: Each payroll entry auto-generates a journal entry (DR 6100 Salaries & Wages, CR 1100 Cash)
- [ ] **PAY-03**: Admin can void a payroll entry, generating a reversing journal entry
- [ ] **PAY-04**: Payroll entries are viewable by period and employee type

## Journal Entries
- [ ] **JE-01**: All journal entries enforce double-entry integrity (total debits = total credits)
- [ ] **JE-02**: Journal entries are immutable — no update mutation exists; corrections require reversing entries
- [ ] **JE-03**: Reversal entries post to the same accounting period as the original entry (not Date.now())
- [x] **JE-04**: Journal entry lines denormalize entryDate from parent for Convex index-based period queries
- [x] **JE-05**: Journal entries use JE-MMDD-NNN format with atomic daily counter
- [ ] **JE-06**: All JE creation goes through a single `createJournalEntryWithLines` helper that enforces balance validation and denormalization

## P&L Extension
- [ ] **PNL-01**: Income statement extends below Gross Profit to show Operating Expenses broken down by GL account (6xxx)
- [ ] **PNL-02**: Income statement shows EBIT (Operating Profit) = Gross Profit - Total OpEx, with EBIT margin %
- [ ] **PNL-03**: Income statement shows Other Income/Expense (7xxx) and Net Income with net margin %
- [ ] **PNL-04**: OpEx data sourced from journalEntryLines aggregated by accountId + entryDate using single indexed query (not N+1)
- [ ] **PNL-05**: Period filtering uses entryDate (business date), not _creationTime (insertion time)

## Expense Analytics
- [ ] **XANL-01**: Manager/Admin can view total OpEx for selected period
- [ ] **XANL-02**: Manager/Admin can view spend breakdown by GL category (bar/pie chart)
- [ ] **XANL-03**: Manager/Admin can view spend breakdown by employee
- [ ] **XANL-04**: Manager/Admin can view monthly spend trend (6-month line chart)
- [ ] **XANL-05**: Manager/Admin can view pending reimbursement total and average approval time
- [ ] **XANL-06**: Manager/Admin can view active fraud flags (split detection, approver concentration, unfamiliar vendor)

## Access Control
- [ ] **PERM-01**: All roles can submit expenses and view their own expense history
- [ ] **PERM-02**: Manager and Admin can approve expenses (within DoA thresholds)
- [ ] **PERM-03**: Admin-only access to Reimbursement Manager, bank accounts, payroll entries, and All Expenses audit view
- [ ] **PERM-04**: Manager and Admin can access Expense Analytics dashboard

## Future Requirements (Deferred)
- Monthly budget caps per GL category — Requires budget input system
- Per-role spend limits — Requires policy configuration UI
- OCR receipt extraction — Auto-extract amount from receipt photo
- Balance Sheet view — Query journalEntryLines by account type 1xxx-3xxx
- Cash Flow Statement — Query entries touching account 1100
- Bank statement import/matching — CSV parser + fuzzy matching
- Multi-currency support — IDR-only for v1.7
- Recurring expenses — Auto-creation for subscriptions
- Accounting period close/lock — Prevent retroactive entries
- Audit report PDF/Excel export — Formatted journal entry reports
- E2E Playwright tests — Happy path, rejection flow, DoA enforcement

## Out of Scope
| Feature | Reason |
|---------|--------|
| Full GL trial balance | SME tool, not enterprise ERP — P&L view is sufficient |
| Multi-level approval chains | 5-10 user team — single-level DoA with broadcast routing is correct |
| Indonesian PPh 21 tax withholding | Accountant handles externally; payroll records total amounts only |
| Accounting period close/lock | Acceptable for v1.7; add if retroactive entries become a problem |
| Receipt OCR extraction | Nice-to-have; manual entry is sufficient at current expense volume |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COA-01 | Phase 43 | Pending |
| COA-02 | Phase 43 | Pending |
| COA-03 | Phase 43 | Pending |
| COA-04 | Phase 41 | Complete |
| COA-05 | Phase 41 | Complete |
| EXP-01 | Phase 44 | Pending |
| EXP-02 | Phase 44 | Pending |
| EXP-03 | Phase 44 | Pending |
| EXP-04 | Phase 44 | Pending |
| EXP-05 | Phase 44 | Pending |
| EXP-06 | Phase 41 | Complete |
| EXP-07 | Phase 45 | Pending |
| EXP-08 | Phase 45 | Pending |
| EXP-09 | Phase 45 | Pending |
| EXP-10 | Phase 45 | Pending |
| EXP-11 | Phase 45 | Pending |
| EXP-12 | Phase 45 | Pending |
| EXP-13 | Phase 45 | Pending |
| EXP-14 | Phase 45 | Pending |
| EXP-15 | Phase 45 | Pending |
| EXP-16 | Phase 45 | Pending |
| EXP-17 | Phase 45 | Pending |
| EXP-18 | Phase 44 | Pending |
| FRAUD-01 | Phase 45 | Pending |
| FRAUD-02 | Phase 45 | Pending |
| FRAUD-03 | Phase 45 | Pending |
| FRAUD-04 | Phase 45 | Pending |
| FRAUD-05 | Phase 45 | Pending |
| FRAUD-06 | Phase 50 | Pending |
| FRAUD-07 | Phase 50 | Pending |
| FRAUD-08 | Phase 50 | Pending |
| RMB-01 | Phase 46 | Pending |
| RMB-02 | Phase 46 | Pending |
| RMB-03 | Phase 46 | Pending |
| RMB-04 | Phase 46 | Pending |
| RMB-05 | Phase 46 | Pending |
| RMB-06 | Phase 46 | Pending |
| RMB-07 | Phase 46 | Pending |
| RMB-08 | Phase 46 | Pending |
| PAY-01 | Phase 47 | Pending |
| PAY-02 | Phase 47 | Pending |
| PAY-03 | Phase 47 | Pending |
| PAY-04 | Phase 47 | Pending |
| JE-01 | Phase 42 | Pending |
| JE-02 | Phase 42 | Pending |
| JE-03 | Phase 42 | Pending |
| JE-04 | Phase 41 | Complete |
| JE-05 | Phase 41 | Complete |
| JE-06 | Phase 42 | Pending |
| PNL-01 | Phase 49 | Pending |
| PNL-02 | Phase 49 | Pending |
| PNL-03 | Phase 49 | Pending |
| PNL-04 | Phase 49 | Pending |
| PNL-05 | Phase 49 | Pending |
| XANL-01 | Phase 50 | Pending |
| XANL-02 | Phase 50 | Pending |
| XANL-03 | Phase 50 | Pending |
| XANL-04 | Phase 50 | Pending |
| XANL-05 | Phase 50 | Pending |
| XANL-06 | Phase 50 | Pending |
| PERM-01 | Phase 48 | Pending |
| PERM-02 | Phase 48 | Pending |
| PERM-03 | Phase 48 | Pending |
| PERM-04 | Phase 48 | Pending |

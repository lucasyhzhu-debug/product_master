# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2026-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2026-02-16)
- ✅ **v1.2 Unified Planning & Revenue** — Phases 17-18 (shipped 2026-02-21)
- ✅ **v1.3 GoFood, Kitchen & Legacy Cleanup** — Phases 19-25 (shipped 2026-02-24)
- ✅ **v1.4 Sales & Channel Integration** — Phases 26-31 (shipped 2026-03-01)
- ✅ **v1.5 Financial Statements** — Phases 32-34 (shipped 2026-03-03)
- ✅ **v1.6 Tech Debt & Resilience** — Phases 35-40 (shipped 2026-03-09)
- ✅ **v1.7 Expense & Accounting** — Phases 41-54 (shipped 2026-03-16)
- **v1.8 Support & Quality of Life** — Phases 55-58 (in progress)

## Phases

<details>
<summary>✅ v1.0 Concerns Cleanup & Refactor (Phases 1-11) — SHIPPED 2026-02-15</summary>

- [x] Phase 1: Test Infrastructure (4/4 plans) — completed 2026-02-13
- [x] Phase 2: Quick Fixes — Security & Docs (2/2 plans) — completed 2026-02-13
- [x] Phase 3: Quick Fixes — Tech Debt (4/4 plans) — completed 2026-02-13
- [x] Phase 4: Quick Fixes — Bugs (2/2 plans) — completed 2026-02-13
- [x] Phase 5: Backend Factories (3/3 plans) — completed 2026-02-13
- [x] Phase 6: BOM Migration (3/3 plans) — completed 2026-02-14
- [x] Phase 7: Query Optimization (3/3 plans) — completed 2026-02-14
- [x] Phase 8: Schema Cleanup (4/4 plans) — completed 2026-02-14
- [x] Phase 9: UI Brand Consolidation (5/5 plans) — completed 2026-02-14
- [x] Phase 10: Frontend Factories (3/3 plans) — completed 2026-02-14
- [x] Phase 11: Infrastructure & Consolidation (3/3 plans) — completed 2026-02-14

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Stabilization & QoL (Phases 12-16) — SHIPPED 2026-02-16</summary>

- [x] Phase 12: UI Brand Verification (1/1 plan) — completed 2026-02-15
- [x] Phase 13: API Audit & Auth Architecture (5/5 plans) — completed 2026-02-15
- [x] Phase 14: Order QoL (8/8 plans) — completed 2026-02-16
- [x] Phase 14.1: Draft Order Update (3/3 plans) — completed 2026-02-16
- [x] Phase 15: Kitchen Overhaul (4/4 plans) — completed 2026-02-16
- [x] Phase 16: K3Mart Cockpit (6/6 plans) — completed 2026-02-16
- ~~Phase 16.1: GoBiz OpenAPI Audit~~ — DROPPED (GoBiz stopped issuing OAuth2 keys)

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Unified Planning & Revenue (Phases 17-18) — SHIPPED 2026-02-21</summary>

- [x] Phase 17: Unified Dispatch Planner & 3rd Outlet (6/6 plans) — completed 2026-02-17
- [x] Phase 17.1: Product Inventory Tracker (5/5 plans) — completed 2026-02-21 (inserted)
- [x] Phase 18: Production Ingredient Tracking & COGS (9/9 plans) — completed 2026-02-21

**Known gaps (deferred to v1.3):** GF-02, GF-03, GF-04 (GoFood depot management), KIT-09, KIT-12 (kitchen targets)

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 GoFood, Kitchen & Legacy Cleanup (Phases 19-25) — SHIPPED 2026-02-24</summary>

- [x] Phase 19: GoFood Depot Management (9/9 plans) — completed 2026-02-22
- [x] Phase 20: Optimize Convex query reads (8/8 plans) — completed 2026-02-22
- [x] Phase 20.1: Delivery fee reporting separation (1/1 plan) — completed 2026-02-22 (inserted)
- [x] Phase 21: Kitchen Production Targets & Overhaul (10/11 plans + UAT gap closure) — completed 2026-02-23
- [x] Phase 22: Remove legacy editors, tags & Dashboard (5/5 plans) — completed 2026-02-23
- [x] Phase 23: Bundle Size & Lazy Routes (3/3 plans) — completed 2026-02-23
- [x] Phase 24: Ingredient Simulation Fix + Restock-Kitchen Integration (7/7 plans) — completed 2026-02-23
- [x] Phase 25: Codebase Cleanup (6/6 plans) — completed 2026-02-24

**Known gaps (deferred to v1.4+):** CON-01-05 (consignment upload), ANLY-01-03 (Sales Analytics consignment)

Full details: `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v1.4 Sales & Channel Integration (Phases 26-31) — SHIPPED 2026-03-01</summary>

- [x] Phase 26: Platform Auth & Schema Foundation (5/5 plans) — completed 2026-02-25
- [x] Phase 27: GrabFood POS Integration (3/3 plans) — completed 2026-02-28
- [x] Phase 27.1: GrabFood Webhooks & Partner Configuration (2/2 plans) — completed 2026-02-28 (inserted)
- [x] Phase 27.2: GrabFood Menu Simulator (2/2 plans) — completed 2026-02-28 (inserted)
- [x] Phase 28: BigSeller Integration (2/2 plans) — completed 2026-02-27
- [x] Phase 29: Consignment Settlements (2/2 plans) — completed 2026-02-28
- [x] Phase 29.1: Test Suite Repair (1/1 plan) — completed 2026-02-28 (inserted)
- [x] Phase 30: Unified Sales Analytics (2/2 plans) — completed 2026-03-01
- [x] Phase 31: Tech Debt Cleanup (1/1 plan) — completed 2026-03-01

**External blockers (not code defects):** GrabFood orders:read scope gap, BigSeller COGS = 0

Full details: `.planning/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>✅ v1.5 Financial Statements (Phases 32-34) — SHIPPED 2026-03-03</summary>

- [x] Phase 32: Income Statement Backend (3/3 plans) — completed 2026-03-02
- [x] Phase 33: Income Statement Frontend (5/5 plans) — completed 2026-03-02
- [x] Phase 34: Income Statement Testing (1/1 plan) — completed 2026-03-02

Full details: `.planning/milestones/v1.5-ROADMAP.md`

</details>

<details>
<summary>✅ v1.6 Tech Debt & Resilience (Phases 35-40) — SHIPPED 2026-03-09</summary>

- [x] Phase 35: Schema Review & Audit (2/2 plans) — completed 2026-03-05
- [x] Phase 36: Sales Analytics Backend Simplification (3/3 plans) — completed 2026-03-05
- [x] Phase 37: Order & Dispatch Backend Simplification (3/3 plans) — completed 2026-03-06
- [x] Phase 38: Frontend Giant File Splits (4/4 plans) — completed 2026-03-06
- [x] Phase 39: E2E Test Foundation & Resilience (3/3 plans) — completed 2026-03-06
- [x] Phase 40: Retroactive Verification Gap Closure (1/1 plan) — completed 2026-03-09

Full details: `.planning/milestones/v1.6-ROADMAP.md`

</details>

### v1.7 Expense & Accounting (In Progress)

**Milestone Goal:** Add employee expense management with approval workflows, double-entry journal entries, reimbursement batching, payroll tracking, and extend the P&L to Net Income with OpEx breakdown.

- [x] **Phase 41: Schema, Seed & Counters** - Foundation tables, Chart of Accounts seed data, atomic counter infrastructure (completed 2026-03-13)
- [x] **Phase 42: Journal Engine** - Double-entry journal entry system with balance validation and reversal support (completed 2026-03-13)
- [x] **Phase 43: Chart of Accounts Management** - Admin UI for viewing, adding, and deactivating GL accounts (completed 2026-03-13)
- [x] **Phase 44: Expense Submission** - Expense CRUD with receipt upload, SHA-256 dedup, and audit trail (completed 2026-03-13)
- [x] **Phase 45: Expense Approval & Void** - Approval queue with DoA routing, auto-JE, rejection flow, void, and fraud controls (completed 2026-03-13)
- [x] **Phase 46: Reimbursement** - Batch reimbursement with bank transfer tracking and company bank account management (completed 2026-03-13)
- [x] **Phase 47: Payroll** - Payroll entry with auto-generated journal entries and void support (completed 2026-03-14)
- [x] **Phase 48: Frontend Permissions & Routes** - Permission flags, route guards, hooks, and Finance hub integration (completed 2026-03-14)
- [x] **Phase 49: P&L Integration** - Extend income statement with OpEx breakdown, EBIT, and Net Income (completed 2026-03-14)
- [x] **Phase 50: Expense Analytics** - OpEx analytics dashboard with spend breakdowns and fraud flag monitoring (completed 2026-03-14)
- [ ] **Phase 51: Bulk Upload of Previously Reimbursed Expenses** - CSV import of 350+ historical expense records as journal entries
- [x] **Phase 52: Expense System Simplification** - Refactor expense code based on simplification review (zero behavior changes) (completed 2026-03-15)
- [x] **Phase 53: Expense E2E Testing** - Playwright E2E tests for all 9 expense pages with multi-role auth and bug-fix loop (completed 2026-03-15)

## Phase Details

### Phase 41: Schema, Seed & Counters
**Goal**: All accounting tables exist in the database and the Chart of Accounts is seeded with 36 PSAK-aligned default accounts
**Depends on**: Nothing (first phase of v1.7)
**Requirements**: COA-04, COA-05, EXP-06, JE-04, JE-05
**Success Criteria** (what must be TRUE):
  1. Running `accounts:seedDefaults` creates 36 GL accounts (4xxx Revenue, 5xxx COGS, 6xxx OpEx, 7xxx Other, 1xxx-3xxx Balance Sheet) and is idempotent on re-run
  2. System accounts (isSystem: true) cannot be deleted via any mutation
  3. Atomic daily counter helper generates sequential EXP-MMDD-NNN and JE-MMDD-NNN formatted numbers without collisions
  4. Journal entry lines denormalize `entryDate` from their parent entry for direct index-based period queries
**Plans:** 2/2 plans complete

Plans:
- [ ] 41-01-PLAN.md -- Schema (10 tables + users bank fields) + Chart of Accounts seed function
- [ ] 41-02-PLAN.md -- Atomic daily counter helper (EXP/JE/RMB-MMDD-NNN)

### Phase 42: Journal Engine
**Goal**: All journal entry creation goes through a single validated helper that enforces double-entry integrity and correct reversal dating
**Depends on**: Phase 41
**Requirements**: JE-01, JE-02, JE-03, JE-06
**Success Criteria** (what must be TRUE):
  1. `createJournalEntryWithLines` helper rejects any entry where total debits != total credits
  2. No update mutation exists for journal entries -- the only correction path is creating a reversing entry
  3. Reversal entries post to the same accounting period (date) as the original entry, not Date.now()
  4. All downstream JE consumers (expense approval, reimbursement, payroll, void) use the single creation helper -- no direct `ctx.db.insert` on journalEntryLines
**Plans:** 1/1 plans complete

Plans:
- [ ] 42-01-PLAN.md -- Journal engine helper (createJournalEntryWithLines, createReversalEntry, validation, tests)

### Phase 43: Chart of Accounts Management
**Goal**: Admin can manage the Chart of Accounts without touching the database directly
**Depends on**: Phase 41
**Requirements**: COA-01, COA-02, COA-03
**Success Criteria** (what must be TRUE):
  1. Admin can view the full Chart of Accounts with account code, name, type (Asset/Liability/Equity/Revenue/Expense), and active status
  2. Admin can add custom GL accounts with unique codes following PSAK numbering conventions (4xxx, 5xxx, 6xxx, 7xxx, 1xxx-3xxx)
  3. Deactivated accounts are hidden from new expense dropdowns but existing journal entries referencing them are preserved and visible
**Plans:** 1/1 plans complete

Plans:
- [ ] 43-01-PLAN.md -- Backend queries/mutations + useAccounts hook + AccountsManager page + route

### Phase 44: Expense Submission
**Goal**: Any authenticated user can create expense drafts, attach receipts, and submit them for approval
**Depends on**: Phase 42
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-18
**Success Criteria** (what must be TRUE):
  1. User can create and save expense drafts with description, amount, GL category, date, payment method, vendor, and optional receipt
  2. Submitting a draft transitions it to Pending status and makes it visible in the approval queue
  3. Receipt upload is enforced for expenses > Rp 50,000 (blocked at backend) and optional for <= Rp 50,000
  4. Uploading a receipt with a SHA-256 hash matching an existing receipt hard-blocks submission with a reference to the duplicate expense
  5. Every status transition (Draft, Pending, Approved, Rejected, AwaitingPayment, Reimbursed, Voided) is recorded in an immutable audit trail with actor, timestamp, and optional comment
**Plans:** 2/2 plans complete

Plans:
- [ ] 44-01-PLAN.md -- Backend helpers + tests, expense mutations + queries (CRUD, fraud controls, audit trail)
- [ ] 44-02-PLAN.md -- Frontend hooks, shared components, ExpenseSubmit page, MyExpenses page, route registration

### Phase 45: Expense Approval & Void
**Goal**: Managers and admins can approve or reject expenses following Delegation of Authority rules, with fraud detection flags shown inline
**Depends on**: Phase 44
**Requirements**: EXP-07, EXP-08, EXP-09, EXP-10, EXP-11, EXP-12, EXP-13, EXP-14, EXP-15, EXP-16, EXP-17, FRAUD-01, FRAUD-02, FRAUD-03, FRAUD-04, FRAUD-05
**Success Criteria** (what must be TRUE):
  1. Eligible approvers see pending expenses in their queue (broadcast routing -- first to act wins), with self-submitted expenses excluded
  2. Expenses <= Rp 500K are approvable by Manager or Admin; expenses > Rp 500K require Admin approval; approver comment is mandatory for expenses >= Rp 500K
  3. Approving an expense atomically generates a journal entry (DR OpEx account, CR 2200 Accrued Expenses or CR 1100 Cash for company_card) and transitions to AwaitingPayment (personal) or Approved-terminal (company card)
  4. Rejected expenses include a reason, and the submitter can revise and resubmit (linked via previousExpenseId chain with rejection count badge visible to approvers)
  5. Admin can void non-terminal expenses with a reason, generating a reversing JE; reimbursed expenses cannot be voided directly (must void the reimbursement batch instead); approved expenses are immutable (no field edits)
  6. Fraud flags are visible to approvers: duplicate detection (same employee + amount + date within 7 days), late submission (> 14 days old), and rejection history chain
**Plans:** 2/2 plans complete

Plans:
- [ ] 45-01-PLAN.md -- DoA pure helpers (TDD), approve/reject/void mutations, approval queue + rejection chain queries
- [ ] 45-02-PLAN.md -- Frontend hooks, FraudFlags/ApprovalActions/RejectionChain components, ExpenseApproval page, route

### Phase 46: Reimbursement
**Goal**: Admin can batch approved expenses by employee, confirm bank transfers, and track reimbursement history
**Depends on**: Phase 45
**Requirements**: RMB-01, RMB-02, RMB-03, RMB-04, RMB-05, RMB-06, RMB-07, RMB-08
**Success Criteria** (what must be TRUE):
  1. Admin can view approved expenses grouped by employee with bank details and running totals
  2. Admin can create a reimbursement batch (one per employee) with auto-generated RMB-MMDD-NNN number and confirm it by entering BCA reference number, transfer date, and source bank account
  3. Confirming a batch atomically generates a journal entry (DR 2200, CR 1100) and marks all linked expenses as Reimbursed
  4. Admin can void a confirmed batch with reason, generating a reversing JE and returning linked expenses to AwaitingPayment status
  5. Admin can manage company bank accounts (name, bank, account number, active status) and users can optionally store their bank details on their profile for reimbursement
**Plans**: 2 plans

Plans:
- [ ] 46-01-PLAN.md -- Backend: extract auditTrail helper, bank accounts CRUD, user bank details, reimbursement mutations + queries
- [ ] 46-02-PLAN.md -- Frontend: hooks, ReimbursementManager page, BankAccountsManager page, components, routes

### Phase 47: Payroll
**Goal**: Admin can record payroll entries that auto-generate journal entries for salary expense tracking
**Depends on**: Phase 42
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04
**Success Criteria** (what must be TRUE):
  1. Admin can create payroll entries with employee type (contractor/staff), frequency (weekly/monthly), amount, period, and optional attachment
  2. Each payroll entry auto-generates a journal entry (DR 6100 Salaries & Wages, CR 1100 Cash)
  3. Admin can void a payroll entry, generating a reversing journal entry posted to the same period as the original
  4. Payroll entries are viewable by period and employee type with filtering
**Plans**: 2 plans

Plans:
- [ ] 47-01-PLAN.md -- Backend: schema update (payrollNumber), pure helpers (TDD), mutations (create + void + upload), queries (list + getById)
- [ ] 47-02-PLAN.md -- Frontend: hooks, PayrollManager page, route registration, header navigation

### Phase 48: Frontend Permissions & Routes
**Goal**: All expense, reimbursement, payroll, and analytics pages are accessible through the app with correct role-based guards
**Depends on**: Phase 44, Phase 45, Phase 46, Phase 47
**Requirements**: PERM-01, PERM-02, PERM-03, PERM-04
**Success Criteria** (what must be TRUE):
  1. All authenticated roles (kitchen, order_staff, manager, admin) can submit expenses and view their own expense history
  2. Manager and Admin can access the approval queue and approve expenses within their DoA thresholds
  3. Admin-only pages (Reimbursement Manager, bank accounts, payroll entries, All Expenses audit view) are blocked for non-admin roles
  4. Manager and Admin can access the Expense Analytics dashboard; Finance hub card on HubPage links to all accounting sub-pages
**Plans**: 1 plan

Plans:
- [ ] 48-01-PLAN.md -- Permission flags, route migration, ExpenseAnalytics stub, nav updates

### Phase 49: P&L Integration
**Goal**: The income statement extends below Gross Profit to show OpEx breakdown, EBIT, and Net Income sourced from journal entries
**Depends on**: Phase 42, Phase 48
**Requirements**: PNL-01, PNL-02, PNL-03, PNL-04, PNL-05
**Success Criteria** (what must be TRUE):
  1. Income statement shows Operating Expenses broken down by GL account name (6xxx accounts) below Gross Profit
  2. EBIT (Operating Profit) = Gross Profit - Total OpEx is displayed with EBIT margin percentage
  3. Other Income/Expense section (7xxx accounts) and Net Income with net margin percentage are displayed below EBIT
  4. OpEx data is sourced from a single indexed query on journalEntryLines by entryDate (business date, not _creationTime), with in-memory grouping by accountId -- no N+1 pattern
**Plans**: 1 plan

Plans:
- [ ] 49-01-PLAN.md -- Backend query extension (single-query journal aggregation), frontend P&L sections, CSV export

### Phase 50: Expense Analytics
**Goal**: Managers and admins can monitor OpEx trends, spend distribution, and fraud flags from a dedicated analytics dashboard
**Depends on**: Phase 48, Phase 49
**Requirements**: XANL-01, XANL-02, XANL-03, XANL-04, XANL-05, XANL-06, FRAUD-06, FRAUD-07, FRAUD-08
**Success Criteria** (what must be TRUE):
  1. Dashboard shows total OpEx for the selected period with spend breakdown by GL category (bar or pie chart) and by employee
  2. Monthly spend trend is displayed as a 6-month line chart showing OpEx trajectory
  3. Pending reimbursement total and average approval time are displayed as summary metrics
  4. Active fraud flags are surfaced: split detection (same employee + same GL + multiple expenses within 48hrs summing > Rp 500K), approver concentration (> 80% of one employee's expenses approved by same person in 30 days), and unfamiliar vendor (vendor not seen in 90 days)
**Plans**: 2 plans

Plans:
- [ ] 50-01-PLAN.md -- Backend: fraud detection helpers (TDD), analytics queries (OpEx, metrics, fraud flags)
- [ ] 50-02-PLAN.md -- Frontend: hooks, chart/card sub-components, ExpenseAnalytics dashboard page

### Phase 51: Bulk Upload of Previously Reimbursed Expenses via Bank Transaction Mapping
**Goal**: Admin can bulk-import 350+ historical employee expense records as journal entries via CSV upload, backfilling OpEx in the P&L for periods before the accounting system existed
**Depends on:** Phase 50
**Requirements**: None (one-off import tool)
**Success Criteria** (what must be TRUE):
  1. Admin can download a CSV template and a Chart of Accounts reference file
  2. Admin can upload a CSV and see row-level validation errors with clear messages
  3. Admin can review summaries (by GL account, by period, total) before confirming
  4. Confirming creates one JE per valid row (DR expense account, CR 1100 Cash) with sourceType "manual" and [Historical Import] prefix
  5. All JEs from one import share the same sourceId (importBatchId) for traceability
  6. Receipt URLs from CSV are preserved in journalEntries.metadata.receiptUrl
  7. Import handles 350+ rows via batched mutation calls (50/batch) with progress indication
**Plans:** 4/4 plans complete

Plans:
- [x] 51-01-PLAN.md -- Schema metadata field + journal engine extension
- [x] 51-02-PLAN.md -- Backend mutation (TDD) + client CSV validation (TDD)
- [x] 51-03-PLAN.md -- Frontend hook + wizard page + route registration
- [x] 51-04-PLAN.md -- Verification + documentation + smoke test

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 Concerns Cleanup & Refactor | 1-11 | 36 | Complete | 2026-02-15 |
| v1.1 Stabilization & QoL | 12-16 | 27 | Complete | 2026-02-16 |
| v1.2 Unified Planning & Revenue | 17-18 | 20 | Complete | 2026-02-21 |
| v1.3 GoFood, Kitchen & Legacy Cleanup | 19-25 | 49 | Complete | 2026-02-24 |
| v1.4 Sales & Channel Integration | 26-31 | 20 | Complete | 2026-03-01 |
| v1.5 Financial Statements | 32-34 | 9 | Complete | 2026-03-03 |
| v1.6 Tech Debt & Resilience | 35-40 | 16 | Complete | 2026-03-09 |
| v1.7 Expense & Accounting | 41-52 | TBD | In progress | - |

**Total: 40 phases, 177 plans shipped across 7 milestones + 12 phases planned for v1.7**

### Phase 52: Expense System Simplification

**Goal:** Refactor v1.7 expense system code (phases 41-50) based on 3-agent simplification review. Consolidate duplicated patterns, parallelize sequential DB reads, extract shared UI components, and unify scattered utility functions. Zero behavior changes -- all existing tests must pass unchanged.
**Requirements**: F1-F14 (14 findings from SIMPLIFICATION-REPORT.md; F15-F17 deferred)
**Depends on:** Phase 50
**Plans:** 3/3 plans complete

Plans:
- [ ] 52-01-PLAN.md -- Backend consolidation: parallel fraud queries (F1), Promise.all for sequential reads (F2, F5), shared validation (F3), threshold unification (F4)
- [ ] 52-02-PLAN.md -- Frontend component extraction: VoidReasonDialog (F6), ActionDialog (F7), ExpenseCard className (F9), fix any types (F12)
- [ ] 52-03-PLAN.md -- Utility cleanup: wibMidnightToUtc consolidation (F10), delta formatter merge (F11), MarginRow extraction (F8), WIB init dedup (F13), useMemo (F14)

### Phase 53: Expense E2E Testing
**Goal**: All 9 expense pages have Playwright E2E coverage with multi-role auth testing, full lifecycle flows (submit -> approve -> reimburse -> P&L), CSV import validation, and a bug-fix loop that fixes or documents discovered issues
**Depends on:** Phase 52
**Requirements**: None (testing phase)
**Success Criteria** (what must be TRUE):
  1. Multi-role test users (E2E-Admin, E2E-Manager, E2E-Kitchen, E2E-OrderStaff) created idempotently in global-setup.ts
  2. Full expense lifecycle test passes: create expense as OrderStaff -> approve as Admin -> reimburse as Admin -> verify amount on P&L
  3. All 9 expense routes tested for page load, basic CRUD, and permission guards
  4. CSV import test with mixed valid/invalid rows verifies validation errors and successful import through to P&L
  5. Fraud flag visibility verified in approval queue
  6. Bug report (53-BUG-REPORT.md) delivered with resolution status for each discovered issue
  7. All existing 690+ unit tests remain green
**Plans:** 5/5 plans complete

Plans:
- [ ] 53-01-PLAN.md -- E2E infrastructure (global-setup multi-user, loginAsRole helper, CSV fixture)
- [ ] 53-02-PLAN.md -- Permission guard tests (9 routes x 4 roles) + analytics/admin page tests
- [ ] 53-03-PLAN.md -- Expense lifecycle test (submit -> approve -> reimburse -> P&L) + CSV import test
- [ ] 53-04-PLAN.md -- Approval edge cases (self-approval block, DoA, rejection, fraud flags)
- [ ] 53-05-PLAN.md -- Full suite verification, unit test check, bug report, human approval

### Phase 53.1: Fix GoBiz Promo Discount Net Revenue Inflation
**Goal**: Dashboard uses stored `revenueNet` instead of recalculating net, and sync extracts `variables.voucher_amount` for promo discount visibility in Sales Analytics
**Depends on:** Phase 53
**Requirements**: None (bug fix, HAR-verified)
**Success Criteria** (what must be TRUE):
  1. GOFOOD channel Net in Sales Analytics = sum of `revenueNet` from externalRevenue (not recalculated from gross - commission)
  2. Promo discount amount extracted during GoBiz sync and stored in `externalRevenue.promoBurn`
  3. Sales Analytics shows promo discount as separate deduction line for GoFood channels
  4. Non-promo orders (Crystal Timur A, G347061572) show unchanged net values
  5. BigSeller channels unaffected by aggregation refactor
  6. All existing tests pass, npm run build succeeds
**Plans:** 2/2 plans complete
Plans:
- [ ] 53.1-01-PLAN.md -- Backend: TDD aggregation fix (use revenueNet) + GoBiz promo extraction (voucher_amount) + adapter wiring
- [ ] 53.1-02-PLAN.md -- Frontend: PeriodData type extension + ChannelSummary promo discount display + human verify

### Phase 54: Fix BigSeller platform-specific endpoint schema mismatches
**Goal**: All 6 HAR-confirmed bugs in BigSeller integration are fixed: normalizePlatformFees handles platform-specific schemas correctly, platform is injected from config (not API), and calculatedProfit uses BigSeller's authoritative profit field
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, CASE-01
**Depends on:** Phase 53.1
**Success Criteria** (what must be TRUE):
  1. Shopee orders have saleAmount populated from originalPrice (not 0)
  2. TikTok orders have saleAmount from revenueAmount, platformIncome from settlementAmount, commissionFee from 6-field sum
  3. Normalization triggers for undefined/null fields (not just === 0)
  4. Shopee fees are negated via -Math.abs() to match negative convention
  5. Platform is set from BIGSELLER_SHOP_PLATFORM_MAP config, not from API's null value
  6. calculatedProfit uses order.profit (BigSeller authoritative), not double-subtracting formula
  7. otherfee/otherFee case mismatch handled
  8. All existing and new tests pass, npm run build succeeds
**Plans:** 2/2 plans complete

Plans:
- [ ] 54-01-PLAN.md -- TDD: normalizePlatformFees tests + rewrite (Bugs 1, 3, 4, 5, case mismatch)
- [ ] 54-02-PLAN.md -- Wire platform param through sync pipeline + fix profit formula (Bugs 2, 6)

</details>

### v1.8 Support & Quality of Life (Phases 55-58)

**Spec documents:**
- `docs/superpowers/specs/2026-03-16-help-center-design.md`
- `docs/superpowers/specs/2026-03-16-invoice-generation-design.md`

### Phase 55: Help Center Infrastructure & Landing Page
**Goal**: Build the Help Center landing page, guide registry, reusable help components, and navigation integration so all authenticated users can access `/help` and browse guides
**Requirements**: HELP-01, HELP-02, HELP-03, HELP-04, HELP-05, HELP-06, HELP-07, HELP-08, HCMP-01, HCMP-02, HCMP-03, HCMP-04, HCMP-05, HCMP-06, HCMP-07
**Depends on:** None
**Success Criteria** (what must be TRUE):
  1. `/help` renders landing page with guide cards grid (responsive 1/2/3 cols)
  2. Search bar filters guides and FAQ questions (case-insensitive)
  3. Guide registry in `helpGuides.ts` drives landing page and router
  4. "Coming Soon" cards are dimmed and non-clickable
  5. GuideRouter renders component by ID or "Guide not found" state
  6. Help link in Header nav (desktop + mobile) and HubPage card
  7. All 7 reusable help components work: WorkflowDiagram, StepCard, CalloutBox, FaqAccordion, RoleTag, GuideSection, GuideLayout
  8. Staggered fade-up animation on landing page
  9. `npm run build` succeeds
**Plans:** 3/3 plans complete

Plans:
- [ ] 55-01-PLAN.md -- Guide registry + searchGuides tests + 5 help components (RoleTag, CalloutBox, StepCard, GuideSection, FaqAccordion) + barrel export
- [ ] 55-02-PLAN.md -- WorkflowDiagram (CSS variable SVG fills + animation) + GuideLayout (TOC + useActiveSection hook)
- [ ] 55-03-PLAN.md -- HelpCenter landing page + GuideRouter + navigation integration (App.tsx, Header.tsx, HubPage.tsx)

### Phase 56: Expense Training Guide
**Goal**: Create the first live guide — a comprehensive Expense, Reimbursement & Payroll walkthrough with flowcharts, step cards, callout boxes, and FAQ covering all 8 sections
**Requirements**: EGUIDE-01, EGUIDE-02, EGUIDE-03, EGUIDE-04, EGUIDE-05, EGUIDE-06, EGUIDE-07, EGUIDE-08, EGUIDE-09
**Depends on:** Phase 55
**Success Criteria** (what must be TRUE):
  1. `/help/expenses` renders full guide with all 8 sections
  2. Overview: lifecycle flowchart with color-coded nodes + role summary table
  3. Submitting: 4 step cards, 3 callout boxes, mini FAQ
  4. Approving: DoA workflow diagram, 3 step cards, 3 callout boxes
  5. Reimbursement: batch workflow diagram, 6 step cards, 2 callout boxes
  6. Payroll: 4 step cards, 3 callout boxes, 4 FAQ items
  7. Analytics: dashboard card descriptions + fraud flags explanation
  8. P&L: journal entry diagram with DR/CR flow
  9. FAQ: full accordion with 16 questions across 5 groups
  10. TOC sidebar tracks active section on scroll
  11. Deep linking works (e.g., `/help/expenses#submitting`)
  12. `npm run build` succeeds
**Plans:** 2 plans

Plans:
- [ ] 56-01-PLAN.md -- ExpenseGuide.tsx sections 1-4 (Overview, Submitting, Approving, Reimbursement) + registry wiring + test update
- [ ] 56-02-PLAN.md -- ExpenseGuide.tsx sections 5-8 (Payroll, Analytics, P&L, FAQ) + visual verification

### Phase 57: Invoice Backend & Business Settings
**Goal**: Build the invoice data model (3 new tables + customer extension), backend API, and Business Settings page so admins can configure seller identity before generating invoices
**Requirements**: BSET-01, BSET-02, BSET-03, BSET-04, BSET-05, IDAT-01, IDAT-02, IDAT-03, IDAT-04
**Depends on:** Phase 56
**Success Criteria** (what must be TRUE):
  1. Schema: `businessSettings` singleton, `invoiceCounters` with `by_prefix` index, `invoices` with 3 indexes, `customers` extended with 3 optional fields
  2. Business Settings page at `/settings/business` (admin only)
  3. Logo upload via Convex file storage works
  4. Default bank account selector from `bankAccounts` table
  5. Live invoice header preview reflects saved settings
  6. Invoice backend API: createDraft, updateDraft, discardDraft, finalize, getByOrder, getById
  7. Race-safe sequential numbering via `invoiceCounters` (INV-YYMM-NNN)
  8. Customer write-back on finalize (company, NPWP, billing address)
  9. `npm run build` succeeds
**Plans:** 2 plans

Plans:
- [ ] 57-01-PLAN.md -- Schema (3 tables + customer extension) + businessSettings backend + invoice backend API
- [ ] 57-02-PLAN.md -- Permission flags + hooks + Business Settings page + nav link + visual verification

### Phase 58: Invoice Form, Print View & Order Integration
**Goal**: Build the WYSIWYG invoice form page, print view, and Order Detail sidebar card so managers/admins can generate, preview, finalize, and print invoices from any qualifying order
**Requirements**: INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, INV-08, INV-09, INV-10, INV-11, IPRNT-01, IPRNT-02, IPRNT-03, IPRNT-04
**Depends on:** Phase 57
**Success Criteria** (what must be TRUE):
  1. Invoice form at `/orders/:orderId/invoice` auto-fills from order + customer + business settings
  2. Field color coding: blue (auto-filled), yellow (needs input), white (user-edited)
  3. Draft auto-saves on field change (debounced 2s), persists across navigation
  4. Preview mode (read-only clean render) without finalizing
  5. Finalize: snapshot data, assign INV-YYMM-NNN, status→final, customer write-back
  6. Multiple finalized invoices per order (revision pattern)
  7. Print view at `/orders/:orderId/invoice/:invoiceNumber` renders cleanly
  8. `@media print` hides navigation/controls, shows clean black-on-white
  9. Indonesian date format (e.g., "Senin, 16 Maret 2026")
  10. Order Detail sidebar: invoice card with 3 states (none/draft/final)
  11. Access control: manager + admin only, PaymentReceived+ orders only
  12. `npm run build` succeeds

### Phase 59: Expense Payment Method Overhaul
**Goal**: Replace 3 legacy payment literals with 3 new ones (employee_paid, company_paid, payment_request) covering all expense flows -- retrospective employee reimbursement, retrospective company direct debit with admin acknowledgement, and prospective vendor payment requests with approval + mark-as-paid
**Requirements**: DEXP-01, DEXP-02, DEXP-03, DEXP-04, DEXP-05, DEXP-06, DEXP-07, DEXP-08, DEXP-09, DEXP-10, DEXP-11, DEXP-12, DEXP-13, DEXP-14
**Depends on:** None (independent of invoice phases 57-58)
**Success Criteria** (what must be TRUE):
  1. Schema has 3 payment method literals (employee_paid, company_paid, payment_request) and 2 new statuses (recorded, paid)
  2. company_paid submit auto-creates JE (DR expense GL, CR 1100 Cash) and sets status to recorded
  3. employee_paid submit unchanged (status submitted, no JE)
  4. payment_request approval creates no JE; mark-as-paid creates JE and transitions to paid
  5. acknowledgeExpense transitions recorded to approved; flagExpense sets flag without status change
  6. Approval queue shows all 3 types with correct action buttons per payment method and status
  7. Receipt always required for company_paid and payment_request regardless of amount
  8. All existing tests pass, npm run build succeeds
**Plans:** 4 plans

Plans:
- [ ] 59-01-PLAN.md -- Schema + helpers + tests (payment literals, statuses, fields, pure helpers, TDD)
- [ ] 59-02-PLAN.md -- Mutations + queries (submitExpense branching, 3 new mutations, expanded approval queue, analytics)
- [ ] 59-03-PLAN.md -- Frontend form + hooks + status badges (3-option dropdown, conditional fields, ExpenseStatus type)
- [ ] 59-04-PLAN.md -- Approval queue UI (multi-action buttons, payment badges, flag display, visual verification)

### Phase 60: Asset Register & Depreciation -- Fixed asset tracking with auto-calculated monthly straight-line depreciation and one-click JE generation

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 59
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 60 to break down)

### Phase 61: Help File Indexing Architecture -- Automatic discovery, content indexing, refresh triggers on doc/feature changes, and search interface for help content

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 55 (Help Center Infrastructure)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 61 to break down)

### Phase 62: Manual Journal Entry Page -- Template-based balance sheet transaction recording with 6 pre-wired templates

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 61
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 62 to break down)

# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2026-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2026-02-16)
- ✅ **v1.2 Unified Planning & Revenue** — Phases 17-18 (shipped 2026-02-21)
- ✅ **v1.3 GoFood, Kitchen & Legacy Cleanup** — Phases 19-25 (shipped 2026-02-24)
- ✅ **v1.4 Sales & Channel Integration** — Phases 26-31 (shipped 2026-03-01)
- ✅ **v1.5 Financial Statements** — Phases 32-34 (shipped 2026-03-03)
- ✅ **v1.6 Tech Debt & Resilience** — Phases 35-40 (shipped 2026-03-09)
- **v1.7 Expense & Accounting** — Phases 41-50 (in progress)

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
- [x] **Phase 43: Chart of Accounts Management** - Admin UI for viewing, adding, and deactivating GL accounts (completed 2026-03-13)
- [ ] **Phase 44: Expense Submission** - Expense CRUD with receipt upload, SHA-256 dedup, and audit trail
- [ ] **Phase 45: Expense Approval & Void** - Approval queue with DoA routing, auto-JE, rejection flow, void, and fraud controls
- [ ] **Phase 46: Reimbursement** - Batch reimbursement with bank transfer tracking and company bank account management
- [ ] **Phase 47: Payroll** - Payroll entry with auto-generated journal entries and void support
- [ ] **Phase 48: Frontend Permissions & Routes** - Permission flags, route guards, hooks, and Finance hub integration
- [ ] **Phase 49: P&L Integration** - Extend income statement with OpEx breakdown, EBIT, and Net Income
- [ ] **Phase 50: Expense Analytics** - OpEx analytics dashboard with spend breakdowns and fraud flag monitoring

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
**Plans:** 1/2 plans executed

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
**Plans**: TBD

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
**Plans**: TBD

### Phase 47: Payroll
**Goal**: Admin can record payroll entries that auto-generate journal entries for salary expense tracking
**Depends on**: Phase 42
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04
**Success Criteria** (what must be TRUE):
  1. Admin can create payroll entries with employee type (contractor/staff), frequency (weekly/monthly), amount, period, and optional attachment
  2. Each payroll entry auto-generates a journal entry (DR 6100 Salaries & Wages, CR 1100 Cash)
  3. Admin can void a payroll entry, generating a reversing journal entry posted to the same period as the original
  4. Payroll entries are viewable by period and employee type with filtering
**Plans**: TBD

### Phase 48: Frontend Permissions & Routes
**Goal**: All expense, reimbursement, payroll, and analytics pages are accessible through the app with correct role-based guards
**Depends on**: Phase 44, Phase 45, Phase 46, Phase 47
**Requirements**: PERM-01, PERM-02, PERM-03, PERM-04
**Success Criteria** (what must be TRUE):
  1. All authenticated roles (kitchen, order_staff, manager, admin) can submit expenses and view their own expense history
  2. Manager and Admin can access the approval queue and approve expenses within their DoA thresholds
  3. Admin-only pages (Reimbursement Manager, bank accounts, payroll entries, All Expenses audit view) are blocked for non-admin roles
  4. Manager and Admin can access the Expense Analytics dashboard; Finance hub card on HubPage links to all accounting sub-pages
**Plans**: TBD

### Phase 49: P&L Integration
**Goal**: The income statement extends below Gross Profit to show OpEx breakdown, EBIT, and Net Income sourced from journal entries
**Depends on**: Phase 42, Phase 48
**Requirements**: PNL-01, PNL-02, PNL-03, PNL-04, PNL-05
**Success Criteria** (what must be TRUE):
  1. Income statement shows Operating Expenses broken down by GL account name (6xxx accounts) below Gross Profit
  2. EBIT (Operating Profit) = Gross Profit - Total OpEx is displayed with EBIT margin percentage
  3. Other Income/Expense section (7xxx accounts) and Net Income with net margin percentage are displayed below EBIT
  4. OpEx data is sourced from a single indexed query on journalEntryLines by entryDate (business date, not _creationTime), with in-memory grouping by accountId -- no N+1 pattern
**Plans**: TBD

### Phase 50: Expense Analytics
**Goal**: Managers and admins can monitor OpEx trends, spend distribution, and fraud flags from a dedicated analytics dashboard
**Depends on**: Phase 48, Phase 49
**Requirements**: XANL-01, XANL-02, XANL-03, XANL-04, XANL-05, XANL-06, FRAUD-06, FRAUD-07, FRAUD-08
**Success Criteria** (what must be TRUE):
  1. Dashboard shows total OpEx for the selected period with spend breakdown by GL category (bar or pie chart) and by employee
  2. Monthly spend trend is displayed as a 6-month line chart showing OpEx trajectory
  3. Pending reimbursement total and average approval time are displayed as summary metrics
  4. Active fraud flags are surfaced: split detection (same employee + same GL + multiple expenses within 48hrs summing > Rp 500K), approver concentration (> 80% of one employee's expenses approved by same person in 30 days), and unfamiliar vendor (vendor not seen in 90 days)
**Plans**: TBD

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
| v1.7 Expense & Accounting | 41-50 | TBD | In progress | - |

**Total: 40 phases, 177 plans shipped across 7 milestones + 10 phases planned for v1.7**

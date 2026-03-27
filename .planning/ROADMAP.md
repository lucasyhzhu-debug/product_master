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
- **v1.8 Support & Quality of Life** — Phases 55-63 (in progress)

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

<details>
<summary>v1.7 Expense & Accounting (Phases 41-54) — SHIPPED 2026-03-16</summary>

- [x] Phase 41: Schema, Seed & Counters (2/2 plans) — completed 2026-03-13
- [x] Phase 42: Journal Engine (1/1 plan) — completed 2026-03-13
- [x] Phase 43: Chart of Accounts Management (1/1 plan) — completed 2026-03-13
- [x] Phase 44: Expense Submission (2/2 plans) — completed 2026-03-13
- [x] Phase 45: Expense Approval & Void (2/2 plans) — completed 2026-03-13
- [x] Phase 46: Reimbursement (2/2 plans) — completed 2026-03-13
- [x] Phase 47: Payroll (2/2 plans) — completed 2026-03-14
- [x] Phase 48: Frontend Permissions & Routes (1/1 plan) — completed 2026-03-14
- [x] Phase 49: P&L Integration (1/1 plan) — completed 2026-03-14
- [x] Phase 50: Expense Analytics (2/2 plans) — completed 2026-03-14
- [x] Phase 51: Bulk Upload (4/4 plans) — completed 2026-03-15
- [x] Phase 52: Expense System Simplification (3/3 plans) — completed 2026-03-15
- [x] Phase 53: Expense E2E Testing (5/5 plans) — completed 2026-03-15
- [x] Phase 53.1: Fix GoBiz Promo Discount (2/2 plans) — completed 2026-03-16
- [x] Phase 54: Fix BigSeller Schema (2/2 plans) — completed 2026-03-16

Full details: `.planning/milestones/v1.7-ROADMAP.md`

</details>

## Phase Details

<!-- v1.7 phase details archived to milestones/v1.7-ROADMAP.md -->

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
**Plans:** 2/2 plans complete

Plans:
- [x] 57-01-PLAN.md -- Schema (3 tables + customer extension) + businessSettings backend + invoice backend API
- [x] 57-02-PLAN.md -- Permission flags + hooks + Business Settings page + nav link + visual verification

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
**Plans:** 3/3 plans complete

Plans:
- [x] 58-01-PLAN.md -- formatIndonesianDate + InvoiceFieldInput + InvoicePrintView + @media print CSS
- [x] 58-02-PLAN.md -- InvoiceForm (WYSIWYG + auto-save) + InvoicePage (3 modes) + App.tsx routes
- [ ] 58-03-PLAN.md -- InvoiceSidebarCard (3 states) + OrderDetail integration + visual verification

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
**Plans:** 4/4 plans complete

Plans:
- [x] 59-01-PLAN.md -- Schema + helpers + tests (payment literals, statuses, fields, pure helpers, TDD)
- [x] 59-02-PLAN.md -- Mutations + queries (submitExpense branching, 3 new mutations, expanded approval queue, analytics)
- [x] 59-03-PLAN.md -- Frontend form + hooks + status badges (3-option dropdown, conditional fields, ExpenseStatus type)
- [x] 59-04-PLAN.md -- Approval queue UI (multi-action buttons, payment badges, flag display, visual verification)


### Phase 60: Asset Register & Depreciation -- Fixed asset tracking with auto-calculated monthly straight-line depreciation and one-click JE generation

**Goal**: Manager/admin can register fixed assets with PSAK-aligned categories, auto-calculated straight-line depreciation, batch "Catch Up to Now" JE generation with preview, per-asset disposal with gain/loss JE, and depreciation reminder on Income Statement
**Requirements**: ASSET-01, ASSET-02, ASSET-03, ASSET-04, ASSET-05, ASSET-06, ASSET-07, ASSET-08, DEPR-01, DEPR-02, DEPR-03, DEPR-04, DEPR-05, DEPR-06, DEPR-07, DEPR-08, DEPR-09, DEPR-10, GL-01, DISP-01, DISP-02, DISP-03, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, REMIND-01, REMIND-02, REMIND-03
**Depends on:** Phase 59
**Success Criteria** (what must be TRUE):
  1. fixedAssets table in schema with PSAK-aligned categories, denormalized depreciation fields, and 3 indexes
  2. journalEntries sourceType extended with "depreciation" and "depreciation_void" (synchronized across schema + journalEngine types)
  3. 10 new GL accounts seeded: 6150 Depreciation Expense, 1610-1670 per-category Accum Depr, 7300/7400 disposal gain/loss
  4. Pure helpers tested: calculateMonthlyDepreciation (with final-month remainder), computeMissingMonths, calculateDisposalGainLoss, parseCharacteristicsCSV
  5. Asset CRUD with FA-{ABBR}-YYMM-NNN numbering and PSAK default auto-population
  6. "Catch Up to Now" batch depreciation: preview → confirm → atomic JE creation for all missing months
  7. Disposal workflow: sold/scrapped/written_off with compound gain/loss JE
  8. Asset Register page at /assets with table/card toggle, status filters, admin-only Catch Up and Dispose
  9. Income Statement depreciation reminder: yellow banner + inline note for unposted current month
  10. npm run build succeeds, all tests pass
**Plans:** 3/3 plans complete

Plans:
- [x] 60-01-PLAN.md -- Schema + journal engine sync + pure helpers (TDD) + GL account seeding
- [x] 60-02-PLAN.md -- Backend mutations/queries (CRUD, depreciation batch, disposal, void) + frontend hooks
- [ ] 60-03-PLAN.md -- Asset Register page + Income Statement reminder + navigation + visual verification

### Phase 61: Help File Indexing Architecture -- Automatic discovery, content indexing, refresh triggers on doc/feature changes, and search interface for help content

**Goal**: Build developer-side tooling to detect tutorial documentation drift: a feature-to-docs manifest mapping source modules to tutorial sections, validation script, ExpenseGuide refactored into section files, and two GSD skills (/gsd:check-docs, /gsd:update-docs) for detecting and fixing stale sections
**Requirements**: HIDX-01, HIDX-02, HIDX-03, HIDX-04, HIDX-05
**Depends on:** Phase 63 (Interactive Visual Expense Tutorials)
**Success Criteria** (what must be TRUE):
  1. docs-manifest.json maps source file globs to tutorial section files with per-mapping lastReviewedCommit
  2. npm run validate:docs-manifest confirms every guide section has at least one source mapping
  3. ExpenseGuide.tsx is split into 8 section files under src/pages/guides/ExpenseGuide/ with identical rendering
  4. /gsd:check-docs skill detects stale sections via git log against lastReviewedCommit
  5. /gsd:update-docs skill reads stale section + git diff, proposes edits, supports --ack flag
  6. npm run build succeeds after all changes
**Plans:** 2/2 plans complete

Plans:
- [x] 61-01-PLAN.md -- Docs manifest + validation script + ExpenseGuide refactor into 6 section files
- [x] 61-02-PLAN.md -- /gsd:check-docs and /gsd:update-docs GSD skills

### Phase 62: Manual Journal Entry Page -- Template-based balance sheet transaction recording with 6 pre-wired templates

**Goal**: Admins and managers can record balance sheet transactions (equipment purchases, loan repayments, dividends, capital injections, loan receipts, tax payments) through 6 pre-wired templates with inline accordion form and period-filtered recent entries table, plus hub navigation restructured into Financials + Accounting sections
**Requirements**: MJE-01, MJE-02, MJE-03, MJE-04, MJE-05, MJE-06, MJE-07
**Depends on:** Phase 49 (P&L Integration)
**Success Criteria** (what must be TRUE):
  1. create mutation validates 6 template types, positive integer amounts, and resolves account codes via by_code index
  2. listByPeriod query returns only template-based manual entries (excludes CSV imports) filtered by period
  3. /journal page renders 6 template cards with inline accordion form for Date, Amount, Description
  4. Only one template form open at a time, save creates JE and entry appears in table immediately
  5. Period controls (monthly/custom) filter the recent entries table
  6. Hub page split: Financials (5 links) + Accounting (4 links including Journal Entry)
  7. npm run build succeeds, all tests pass
**Plans:** 2/2 plans complete

Plans:
- [x] 62-01-PLAN.md -- Schema update + pure helpers + TDD tests + create mutation + listByPeriod query + frontend hooks
- [x] 62-02-PLAN.md -- ManualJournalEntry page + route registration + hub navigation restructuring + visual verification


### Phase 63: Interactive Visual Expense Tutorials

**Goal:** Replace text-heavy expense guide sections (Submit, Approve, Reimburse) with click-through visual walkthroughs using mock UI panels and a generic reusable WalkthroughPlayer engine
**Requirements**: VWT-01, VWT-02, VWT-03, VWT-04, VWT-05, VWT-06, VWT-07, VWT-08, VWT-09, VWT-10
**Depends on:** Phase 55 (Help Center Infrastructure)
**Success Criteria** (what must be TRUE):
  1. Generic WalkthroughPlayer component renders workflow tabs with free step navigation and keyboard support
  2. 11 mock UI primitives (MockFrame through MockNavDropdown) with shared indigo highlight styling
  3. Submit Expense walkthrough: 4 steps with mock form, receipt upload, action buttons
  4. Approve Expense walkthrough: 3 steps with approval queue table, detail card, action buttons
  5. Reimburse walkthrough: 6 steps from opening page through success state
  6. ExpenseGuide consolidated from 8 sections to 6 (submit+approve+reimburse merged into single walkthrough)
  7. helpGuides.ts registry, POPULAR_QUESTIONS anchors, and tests updated for new structure
  8. AnimatePresence crossfade (150ms) on step change, mobile horizontal pill bar
  9. 5 documentation files updated (help center spec, UI brand ref, CODE_STYLE, CLAUDE.md, CHANGELOG)
  10. `npm run build` succeeds, all tests pass
**Plans:** 2/2 plans complete

Plans:
- [x] 63-01-PLAN.md -- Types + MockElements (11 primitives) + WalkthroughPlayer engine + barrel exports
- [x] 63-02-PLAN.md -- 3 mock workflow components + ExpenseGuide integration + registry + tests + docs + visual verification

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
| v1.7 Expense & Accounting | 41-54 | 32 | Complete | 2026-03-16 |
| v1.8 Support & Quality of Life | 55-63 | 23 | In progress | - |

**Total: 54 phases, 209 plans shipped across 8 milestones + 9 phases in v1.8 (9 complete, 0 remaining in original scope)**

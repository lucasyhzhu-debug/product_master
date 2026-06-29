# Roadmap & Development Progress

> **Purpose:** Future plans and development progress for Frollie Recipe Master.
> **When to read:** When planning new features or understanding project status.

## Table of Contents
- [Planned Slices (spec+plan landed, awaiting execution)](#planned-slices-specplan-landed-awaiting-execution)
- [Development Progress](#development-progress)
- [Not Yet Implemented](#not-yet-implemented)
- [Future Roadmap](#future-roadmap)

---

## Planned Slices (spec+plan landed, awaiting execution)

> Forward queue for the **Subscription & Credit** milestone. Spec + plan + two staffreviews are on `main`; execution happens in a fresh worktree via the per-slice handoff under `.claude/handoff/`. Remove a row when its CHANGELOG entry lands.

| Slice | Spec | Plan | Target |
|-------|------|------|--------|

---

## Development Progress

### Phase 1: Backend Foundation (Completed)
- [x] Initial FastAPI backend with SQLite
- [x] All model files (Ingredient, PackagingMaterial, Tag, Recipe, Packaging, Product)
- [x] Cost calculator service
- [x] All API routers (41 endpoints)

### Phase 2: Frontend Development (Completed)
- [x] Vite + React 19 + TypeScript setup
- [x] Tailwind CSS with custom theme
- [x] shadcn/ui component library
- [x] React Query for server state
- [x] Dashboard with carousels
- [x] Recipe/Packaging/Product editors with versioning
- [x] Cost calculations and COGS display

### Phase 3: Order Management (Completed)
- [x] Customer entity with phone, source tracking
- [x] Order entity with MMDD-NNN format
- [x] Order items with combobox autocomplete
- [x] WhatsApp receipt generation
- [x] Kitchen View for production
- [x] 11-status order workflow (including InProduction status)
- [x] POS-style order form with template parser
- [x] Order detail accordion stepper UI
- [x] Kitchen ball distribution system
- [x] Production tracking with visual feedback
- [x] Usage-based channel and shipping selectors

### Phase 4: Production Deployment - FastAPI (Completed)
- [x] Monolithic restructure for Vercel
- [x] PostgreSQL support (dual database)
- [x] Migration script (SQLite → PostgreSQL)
- [x] Vercel configuration

### Phase 5: Convex Migration (Completed)
- [x] Full backend migration to Convex
- [x] Schema definition with 19 tables
- [x] All queries and mutations implemented
- [x] Real-time data sync enabled
- [x] Frontend migrated from React Query to Convex hooks
- [x] Removed FastAPI/PostgreSQL dependencies
- [x] Documentation updated for Convex architecture

**Migration Benefits Realized:**
- Real-time updates across all clients
- Simplified architecture (no separate API server)
- Type-safe database operations
- Automatic scaling
- Reduced deployment complexity

### Phase 6: Testing & Quality Assurance (Completed)
- [x] Comprehensive test suite (184 tests across 11 files)
- [x] Backend unit tests (costCalculator, orderHelpers, whatsapp)
- [x] Convex integration tests (recipes, products, orders, tags)
- [x] Frontend tests (utils, components, hooks)
- [x] 100% coverage for critical business logic
- [x] Test infrastructure (Vitest, Testing Library, convex-test)

### v1.5 Financial Statements (In Progress)

#### Phase 32: Income Statement Backend (Completed)
- [x] Weekly income statement query (`getWeeklyIncomeStatement`) with Revenue → COGS → Gross Profit
- [x] Multi-channel revenue aggregation (GoBiz, Shopee, TikTok, GrabFood, BigSeller, Consignment, Internal, K3Mart)
- [x] BOM COGS resolution via `buildProductCOGSMap` (production + packaging split)
- [x] Confidence classification on every figure (exact/calculated/inferred/missing)
- [x] Data quality gap analysis (unmapped products, zero-cost components, missing channels)
- [x] Previous week comparison with delta amounts and percentages
- [x] Backend integration tests (18 new tests: edge cases, COGS accuracy, multi-channel)

#### Phase 33: Income Statement Frontend (Completed)
- [x] Standalone `/financials` page with P&L table (Revenue → Deductions → COGS → Gross Profit)
- [x] Per-channel breakdown with colored dots from platform color system
- [x] Week navigation (prev/next/today) with WIB timezone Monday-start boundaries
- [x] Week-over-week comparison columns with delta indicators
- [x] Confidence indicators: calc icon (calculated), ~ prefix (inferred), -- with warning (missing)
- [x] Collapsible Data Quality Panel: unmapped products, zero-cost components, coverage stat
- [x] CSV export with flat-format output and formula injection sanitization
- [x] Mobile responsive: comparison columns hidden by default with toggle
- [x] Component extraction: PLRow, ChannelRow, ConfidenceIndicator, DataQualityPanel, financialHelpers
- [x] Dark mode using CSS variable tokens (per CODE_STYLE.md)
- [x] E2E UAT: 11 automated tests (page load, navigation, collapsible sections, CSV, permission guard)
- [x] Route: `/financials` with `canAccessDashboard` permission (Manager, Admin)

#### Phase 34: Income Statement Testing (Planned)
- [ ] Multi-channel revenue aggregation integration test (gobiz + consignment + internal)
- [ ] Success criteria audit trail mapping tests to requirements

#### Phase 41: Accounting Schema, Seed & Counters (Completed)
- [x] 10 new accounting tables (accounts, expenses, journalEntries, journalEntryLines, etc.)
- [x] 39 PSAK-aligned default GL accounts seeded via `accounts:seedDefaults`
- [x] Atomic daily counter helper (`convex/lib/counter.ts`) for sequential numbering (JE-MMDD-NNN)

#### Phase 42: Double-Entry Journal Engine (Completed)
- [x] `convex/lib/journalEngine.ts` — single entry point for all journal creation (7 exports, 347 LOC)
- [x] Balance validation (debits = credits), IDR integer enforcement, sequential JE numbering
- [x] Reversal workflow with sourceType pairing and debit/credit swap
- [x] 27 unit tests for validation and builder logic

#### Phase 43: Chart of Accounts Management (Completed)
- [x] Admin-only AccountsManager page at `/accounts` with EntityManager pattern
- [x] CRUD mutations with PSAK code validation, system account protection, dependency checks
- [x] 39 seeded accounts viewable with type-colored badges, search, bulk operations
- [x] EntityManager `canDelete` prop enhancement (reusable for all entity pages)
- [x] Two rounds of triple-review fixes applied

### v2.0 Financial Management & Data Quality (In Progress)

#### Phase 75: Full P&L Extension (Completed 2026-04-21)

**Requirements:** FIN-01 (P&L extends Net Income → D/A → CapEx → Free Cash Flow), FIN-02 (per-channel flows through Contribution Margin)

**Plans:** 5/5 complete — Status: **Complete**

- [x] 75-00: Wave 0 TDD scaffolding — 14 failing tests across 4 files (CapEx/FCF, missingReversals, CSV rows, ChannelRow)
- [x] 75-01: Backend CapEx / FCF / D/A extraction — extends `getIncomeStatement` with 5 new `WeekData` fields + `gapAnalysis.missingReversals`
- [x] 75-02: Frontend EBITDA-first canonical layout — `/financials` page reorganised; D/A row between EBITDA and EBIT; CapEx + FCF rows; `DataQualityPanel` surfaces missingReversals
- [x] 75-03: CSV export extension — `generateIncomeStatementCSV` emits canonical rows matching on-screen layout; channel column `All` below Contribution Margin
- [x] 75-04: Wave 3 verification + docs — full test suite green (1727 pass), `npm run build` clean, CHANGELOG / ROADMAP / API_REFERENCE updated

**Delivered:**
- [x] Canonical EBITDA-first P&L layout (Revenue → Net Revenue → COGS → Contribution Margin → OpEx excl. D/A → EBITDA → D/A → EBIT → Net Income → CapEx → Free Cash Flow)
- [x] FCF formula tooltip: `Free Cash Flow = Net Income + Depreciation & Amortization − CapEx`
- [x] Zero-CapEx helper text: `No asset acquisitions this period`
- [x] Per-channel rows stop at Contribution Margin (label renamed from Gross Margin)
- [x] `missingReversals` gap check flags Phase 71 converted expenses whose reversal JE is missing (silent double-count guard)
- [x] CSV export mirrors on-screen layout 1:1

#### Phase 76: Financial Data Export (Completed 2026-05-09)

**Requirements:** FIN-03 (raw transaction CSV export for a date range), FIN-04 (multi-period P&L summary CSV export — weekly / monthly / custom)

**Plans:** 5/5 complete — Status: **Complete**

- [x] 76-01: Refactor `csvExport.ts` + re-export Phase 75 helpers — `buildIncomeStatementRows` extracted; `fetchAndAggregate` exported with `includePrevious` opt-out; `WeekData` / `GapAnalysis` / `WIB_OFFSET_MS` exported for cross-tier reuse
- [x] 76-02: Backend financial export queries — `getRawTransactionsExport` + `getMultiPeriodPLExport` + `getExportPreflight` in `convex/reports/financialExport.ts`; shared `convex/lib/periodBuckets.ts` (single source of truth across tiers); 14 convex-test bodies
- [x] 76-03: Frontend helpers + CSV serializers — `src/lib/financialExportHelpers.ts` with `buildExportFilenames` (path-traversal-safe), `presetToRange` (prior-ISO-week semantics), `formatWeekLabel/MonthLabel/CustomLabel`, `generateRawTransactionsCSV`, `generateMultiPeriodPLCSV`; 30 Vitest helper tests
- [x] 76-04: Page UI + route — `FinancialExportPage` at `/financials/export` (manager+admin gated), `PreflightPanel` component, `useDebouncedValue` hook, "Export range…" button on `/financials`; 6 RTL tests
- [x] 76-05: E2E + UAT + docs sweep + merge — 6 Playwright tests (happy-path multi-file, role-gate redirect, filename-WIB-date M6); manual UAT signed off; triple-review clean (no Critical findings)

**Delivered:**
- [x] **FIN-03**: Raw transaction CSV export (12-column GL line schema, WIB-correct filenames, formula-injection mitigated, integer rupiah)
- [x] **FIN-04**: Multi-period P&L summary CSV export (single header + per-period bodies + range-aggregated footer; weekly / monthly / custom granularity; first-period no-delta semantics)
- [x] `/financials/export` page (manager + admin) — 4-section form with 5 preset chips + preflight panel + filename preview
- [x] Soft warnings: `isLargeRange` (>10k journal lines) and `isTooManyBuckets` (>26 buckets) — no hard caps
- [x] Three role-gate enforcement layers: `<ProtectedRoute>` (UX), `requireRole()` per query (security boundary), Playwright E2E redirect tests for kitchen + order_staff

#### Phase 81: Domain Vocabulary Deepening (Completed 2026-05-11)

**Type:** Tech-debt / architecture deepening — collapses 3 duplicated/inconsistent domain rule clusters into single sources of truth per the 2026-05-08 graph-primed architecture review.

**Plans:** 4/4 complete + 7 triple-review fix commits — Status: **Complete**

- [x] 81-01 (C4): `isProductionUnit(ct)` canonical predicate at `convex/reports/productionUnitHelpers.ts` — replaces 5 hand-rolled production-component filters across 4 files (D-01 drops `unit === "pcs"` and `gramsPerUnit !== undefined` clauses); ESLint `no-restricted-imports` scaffold introduced
- [x] 81-02 (C3): `getWibDateStr(ms)` canonical at `convex/lib/periodRange.ts` (with NaN-guard invariant); 4 doomed WIB helpers DELETED outright per D-10 (no shims); counter.ts's `getWibDateStr` MMDD-format renamed to `getWibMonthDayStr`; ~30 caller import sites migrated; ESLint guard extended with 5 banned exports
- [x] 81-03 (C1): `convex/reports/platform.ts` exports `Platform` literal union (8 literals, no 'Other' per D-04) + `resolvePlatform({source, underlyingSource?, orderChannel?}) → {platform, confidence}` + `platformDisplay()` + `isPlatform()` runtime guard; 21 callsites migrated (12 backend + 9 frontend); 3 legacy mappers DELETED (`sourceToPlatform`, `toDisplayChannel` + `DisplayChannel` + `DISPLAY_CHANNELS`, `sourceToDisplayChannel`); D-02 user-visible rename shipped (Tokopedia→TikTok red→violet, K3 Mart→K3Mart); ESLint guard extended with 5 banned exports (10 cumulative); triple-review GATED per D-09
- [x] 81-03 triple-review fixes (7 commits): orderChannel literal coverage gap (silent regression — flagged by 2 reviewers), stale `_generated/api.d.ts` (3-reviewer consensus, Phase-76 lesson recurring), `resolvePlatform` undefined-source fallback, K3 Mart→K3Mart sweep across 7 user-visible surfaces, confidence downgrade on fallback, dead `SalesChannel` union deletion, `buildChartColorMap` parameter rename, +14 tests
- [x] 81-04: docs sweep — CONTEXT.md ambiguities 134/138/139/141 closed; `isProductionUnit` cross-referenced in CLAUDE.md Pitfall #11; new Pitfall #18 with all 10 ESLint-banned imports; CHANGELOG includes Breaking changes section (D-02 rename impacts saved URLs + Phase 76 CSVs); SCHEMA + API_REFERENCE updated; review artifacts committed

**Delivered:**
- [x] 1 typed Platform literal union + `resolvePlatform()` resolver (forward-compatible with ADR-0001 `underlyingSource` schema field; deferred linkedMenuProductId branch documented per staffreview I1)
- [x] 1 BOM `isProductionUnit(ct)` predicate (mechanically observable per CLAUDE.md rules 10 + 13)
- [x] 1 canonical WIB `getWibDateStr(ms)` helper with NaN-guard invariant
- [x] ESLint `no-restricted-imports` rule with 10 banned legacy exports — prevents reintroduction
- [x] User-visible rename: Tokopedia → TikTok (analytics color shift red→violet), K3 Mart → K3Mart everywhere
- [x] Native consignment-channel + K3Mart-GF orders no longer mis-bucketed as Direct (Critical regression caught by triple-review)
- [x] CONTEXT.md flagged ambiguities 134, 138, 139, 141 closed

#### v2.0 Closeout (2026-05-11)

**Phase 77 (Data Health Dashboard) deferred to v2.1.** Originally scoped into v2.0 alongside the financial reporting and export work, Phase 77 never received a phase directory or spec — it remained a placeholder while the milestone's scope shifted toward channel routing (74.5.1/74.5.2), cascade fixes (80.x), and financial export polish (75/76). Phase 76's deferred-items file punts orphan-JE detection to Phase 77, which is the most concrete signal of what 77 should cover when it lands. Phase 81 closed several preconditions Phase 77 depends on: typed `Platform` literal union, confidence-tagged resolver, mechanically-observable production-component predicate.

**v2.0 closes with:** 70, 70.1, 71, 72, 73, 74, 74.5.1, 74.5.2, 75, 76, 78, 79, 80, 80.1, 80.2, 80.3, 81 shipped — 17 phases.

---

## Not Yet Implemented

### Infrastructure
- [ ] Structured logging with error tracking service
- [ ] Error boundaries in React
- [ ] Pagination for large lists
- [ ] Performance monitoring and analytics

### Order Management Backlog
- [ ] Orders Dashboard carousel on main Dashboard
- [ ] Customer management dedicated page
- [ ] Order editing for Draft status (currently create-only)
- [ ] Bulk status updates
- [ ] Product Integration - link OrderItem to ProductVersion when ready

### Technical Debt
- [ ] Update `src/lib/types.ts` to use Convex-generated types
- [ ] Remove legacy comments and unused code
- [ ] Add comprehensive error handling

---

## Future Roadmap

### Priority 1: Authentication & Access Control
- [ ] Add Convex Auth or Clerk integration
- [ ] Role-based visibility:
  - `admin` - Full access (recipes, costs, margins, orders)
  - `kitchen` - Kitchen View only (orders, production status)
  - `sales` - Orders and products (no cost/margin data)
- [ ] Audit trail - track `createdBy` and `updatedBy` with real user IDs
- [ ] Rate limiting (Convex built-in)

### Priority 2: Multi-Location Support
- [ ] Location entity (id, name, address)
- [ ] Assign orders to production location
- [ ] Location-specific Kitchen View
- [ ] Location-based inventory tracking (future)

### Priority 3: Offline/PWA Support
- [ ] Progressive Web App (PWA) configuration
- [ ] Service worker for Kitchen View caching
- [ ] Offline order status updates with sync
- [ ] Add to home screen prompt on mobile

### Priority 4: Enhanced UX
- [ ] Message copy improvements (currently copies to clipboard)
- [ ] Customer contact channel tracking (WA vs IG vs other)
- [ ] Order templates for repeat customers
- [ ] Bulk order status updates
- [ ] Dashboard metrics and charts

### Priority 5: Data & Reporting
- [x] CSV/Excel export for reports (Income Statement CSV export, Phase 33)
- [x] Sales analytics dashboard (K3Mart stock sync + GoBiz revenue sync)
- [x] GoBiz journal-level sync (5-metric revenue: gross, net, commission, ad burn, promo burn)
- [ ] Cost trend analysis
- [ ] Inventory forecasting based on orders
- [ ] Shopee Open Platform adapter (Phase 2)
- [ ] Consignment manual entry + CSV upload (Phase 2)
- [ ] Scheduled cron sync (Phase 2)
- [ ] 90-day snapshot retention cleanup (Phase 2)

### v2.1 Candidates (planning queue, not yet committed)
- [ ] **Subscription credit drawdown in the order slide-over** (planned 2026-06-29; patch bump). Lets staff fulfil an ad-hoc order from a subscription customer's prepaid weekly credit (eligible products only, re-priced to partner `unitPrice`), with at-delivery drawdown + reservation-via-order-row (no new ledger type), partial-credit (credit + pay-rest), a manual `SUBSCRIPTION_CREDIT_TOPUP` WhatsApp summary, and reflection in the subscription week's credit ledger (planned-day quantities stay frozen). Refactors the existing eager Path B (`applyPartialCreditToAdHocOrder`) onto the same reservation model, resolving IMP-4. Wired into BOTH `OrderSlideOver` + `OrderDetail` (Pitfall #20). 1 additive optional schema field (`orders.subscriptionCreditApplied`), 3 new Convex functions, manager+admin gated. Spec `docs/superpowers/specs/2026-06-29-subscription-credit-drawdown-order-slideover-design.md`; plan `docs/superpowers/plans/2026-06-29-subscription-credit-drawdown-order-slideover.md`; reviews `docs/reviews/staffreview-subscription-credit-drawdown-2026-06-29.md` (+ `-plan-`). Execution handoff `.claude/handoff/execute_2026-06-29-subscription-credit-drawdown-order-slideover.md`.
- [ ] **Subscription Phase E · Slice 2 — rule-enforcement layer** (planned 2026-06-26; patch bump). Enforces supply-agreement clauses 3/4/5/10 on the merged subscription backend: per-day 13:00 cutoff lock (warn+flag via the date-relative `flipDayLocksAtCutoff` cron), above-baseline `needsSupplierConfirmation` flag (warn-only), effective-dated permanent baseline change (+14d, `applyPendingBaselineChanges` cron), effective-dated termination (+30d guard in `seedWeek`/`confirmWeek` stopping future weeks), plus a verify-only confidential-price-strip audit and minimal scheduler/settings UI. 2 additive optional schema fields, 2 idempotent internal crons, manager+admin gated. Clause 8 COGS-rise alerting stays DROPPED. Spec `docs/superpowers/specs/2026-06-26-subscription-rule-enforcement-design.md`; plan `docs/superpowers/plans/2026-06-26-subscription-rule-enforcement.md`.
- [ ] **Phase 77 — Data Health Dashboard** (deferred from v2.0). Surfaces orphan JEs (Phase 76 backlog), unmapped products, zero-cost components, missing reversals, and confidence-coverage stats in a single admin view. Concrete starting point: orphan-JE detection from Phase 76's deferred-items file. Phase 81's confidence-tagged `resolvePlatform()` is the per-row primitive Phase 77's "platform consistency" check should consume. Estimated 3-5 plans.
- [ ] **`externalRevenue.underlyingSource` schema field** (ADR-0001 follow-on). `resolvePlatform()` ships forward-compatible per Phase 81 D-03 with a graceful "missing → BigSeller transitional + inferred confidence" fallback. Adding the schema field unlocks Test 10 (currently `it.skip` per staffreview I1), enables full BigSeller→underlying-platform resolution, and lets the deferred `linkedMenuProductId.source` lookup branch land. Small phase (1-2 plans).

---

## Version History

| Version | Date | Major Changes |
|---------|------|---------------|
| 6.1 | 2026-05-09 | Financial Data Export: raw GL transaction CSV + multi-period P&L summary CSV (weekly/monthly/custom) at `/financials/export` (v2.0 Phase 76, closes FIN-03 / FIN-04) |
| 6.0 | 2026-04-21 | Full P&L Extension: canonical EBITDA-first layout, CapEx + Free Cash Flow, Contribution Margin rename (v2.0 Phase 75, closes FIN-01 / FIN-02) |
| 5.0 | 2026-03-13 | Accounting foundation: schema + journal engine + Chart of Accounts UI (v1.7 Phases 41-43) |
| 4.0 | 2026-03-02 | Income Statement: backend query + frontend P&L page + CSV export (v1.5 Phases 32-33) |
| 3.4 | 2026-02-09 | GoBiz journal-level integration (5-metric revenue + item details) |
| 3.3 | 2026-02-07 | Multi-platform sales integration (K3Mart + GoBiz) |
| 3.2 | 2026-02-02 | Production tracking refactor, UX improvements |
| 3.1 | 2026-02-02 | Order System V2 (PRD-0 through PRD-7), Testing suite |
| 3.0 | 2026-01-30 | Convex migration complete |
| 2.0 | 2026-01-30 | Order management, Kitchen View |
| 1.0 | 2025-01-27 | Initial release (FastAPI + React) |

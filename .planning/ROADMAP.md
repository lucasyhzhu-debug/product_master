# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2026-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2026-02-16)
- ✅ **v1.2 Unified Planning & Revenue** — Phases 17-18 (shipped 2026-02-21)
- ✅ **v1.3 GoFood, Kitchen & Legacy Cleanup** — Phases 19-25 (shipped 2026-02-24)
- ✅ **v1.4 Sales & Channel Integration** — Phases 26-31 (shipped 2026-03-01)
- 🚧 **v1.5 Financial Statements** — Phases 32-34 (in progress)

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

### v1.5 Financial Statements (In Progress)

**Milestone Goal:** Provide a unified weekly income statement (Revenue -> COGS -> Gross Profit) with per-channel breakdown, BOM-resolved COGS, and data quality visibility.

**Design doc:** `docs/plans/2026-03-01-income-statement-design.md`

- [x] **Phase 32: Income Statement Backend** (3/3 plans) - COGS resolver, revenue aggregation, confidence classification, gap analysis query, backend tests (680 passing), documentation
- [ ] **Phase 33: Income Statement Frontend** (0/3 plans) - P&L page with week navigation, comparison deltas, confidence indicators, data quality panel, and CSV export
- [ ] **Phase 34: Income Statement Testing** - Backend tests for BOM COGS accuracy and multi-channel revenue edge cases

## Phase Details

### Phase 32: Income Statement Backend
**Goal**: System can compute a complete weekly income statement from existing data -- revenue per channel, deductions, full BOM COGS, gross profit, with confidence classification and data quality gap identification
**Depends on**: Nothing (first phase of v1.5; builds on existing externalRevenue + BOM infrastructure from v1.4)
**Requirements**: IS-01, IS-02, IS-03, IS-04, IS-05, IS-06
**Success Criteria** (what must be TRUE):
  1. Calling `getWeeklyIncomeStatement({ weekStart })` returns per-channel gross revenue aggregated from `externalRevenue` and `consignmentSettlements` for the target week
  2. Revenue deductions (customer discounts, platform commissions, ad/promo burn, consignment rev share) are computed and subtracted to produce net revenue per channel
  3. Full BOM COGS (production balls + packaging) is resolved via `buildProductCOGSMap` for every revenue item with a `linkedMenuProductId`, and unmapped items get COGS = 0
  4. Every financial figure carries a confidence level (exact/calculated/inferred/missing) in the query response
  5. The query response includes a gap analysis section listing unmapped product names, zero-cost component types, and missing channel warnings
**Plans**: 32.1 (BOM COGS Resolver & Week Range Helper), 32.2 (Weekly Income Statement Query), 32.3 (Verification & Documentation)

### Phase 33: Income Statement Frontend
**Goal**: Users can view, navigate, and export a weekly income statement with full channel breakdown and data quality transparency
**Depends on**: Phase 32
**Requirements**: IS-07, IS-08, IS-09, IS-10, IS-11, IS-12
**Success Criteria** (what must be TRUE):
  1. User can navigate to `/financials` and see a P&L table showing Revenue -> Deductions -> Net Revenue -> COGS -> Gross Profit with per-channel breakdown
  2. User can navigate between weeks using prev/next controls, with WIB timezone Monday-start boundaries
  3. User sees previous week comparison with delta amounts and percentages on every line item
  4. User sees visual confidence indicators (solid for exact, calc icon for calculated, ~ for inferred, dash + warning for missing) on financial figures
  5. User sees a data quality panel listing unmapped products, missing channels, and zero-cost components with actionable guidance (e.g., "map in Sales Analytics > Mappings")
  6. User can click Export CSV and download a flat-format file with period, section, channel, line item, amount, confidence, prev week amount, and delta percentage
**Plans**: 33-01 (Income Statement Page, Hook & Route), 33-02 (Confidence Indicators, Comparison Deltas & Data Quality Panel), 33-03 (CSV Export & Verification)

### Phase 34: Income Statement Testing
**Goal**: Backend computations are verified correct with known-value test cases covering COGS accuracy and revenue aggregation edge cases
**Depends on**: Phase 33
**Requirements**: IS-13, IS-14
**Success Criteria** (what must be TRUE):
  1. Test suite includes known-value assertions for `buildProductCOGSMap` verifying production COGS, packaging COGS, and total per product match expected amounts
  2. Test suite includes multi-channel revenue aggregation test with at least 3 channels verifying gross, commissions, and net revenue
  3. Test suite covers edge cases: empty week (zero values, no crash), zero-revenue margin (N/A not NaN), negative net revenue, and unmapped product COGS = missing
  4. `npm run test` passes with all new tests and `npm run build` succeeds
**Plans**: TBD

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 Concerns Cleanup & Refactor | 1-11 | 36 | Complete | 2026-02-15 |
| v1.1 Stabilization & QoL | 12-16 | 27 | Complete | 2026-02-16 |
| v1.2 Unified Planning & Revenue | 17-18 | 20 | Complete | 2026-02-21 |
| v1.3 GoFood, Kitchen & Legacy Cleanup | 19-25 | 49 | Complete | 2026-02-24 |
| v1.4 Sales & Channel Integration | 26-31 | 20 | Complete | 2026-03-01 |
| v1.5 Financial Statements | 32-34 | TBD | In progress | - |

**Total: 31 phases, 152 plans shipped across 5 milestones + 3 phases planned for v1.5**

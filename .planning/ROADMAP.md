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
- ✅ **v1.8 Support & Quality of Life** — Phases 55-63 (shipped 2026-03-27)

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

<!-- v1.7 and v1.8 phase details archived to milestones/ -->

<details>
<summary>✅ v1.8 Support & Quality of Life (Phases 55-63) — SHIPPED 2026-03-27</summary>

- [x] Phase 55: Help Center Infrastructure & Landing Page (3/3 plans) — completed 2026-03-16
- [x] Phase 56: Expense Training Guide (2/2 plans) — completed 2026-03-16
- [x] Phase 57: Invoice Backend & Business Settings (2/2 plans) — completed 2026-03-17
- [x] Phase 58: Invoice Form, Print View & Order Integration (3/3 plans) — completed 2026-03-17
- [x] Phase 59: Expense Payment Method Overhaul (4/4 plans) — completed 2026-03-17
- [x] Phase 60: Asset Register & Depreciation (3/3 plans) — completed 2026-03-19
- [x] Phase 61: Help File Indexing Architecture (2/2 plans) — completed 2026-03-18
- [x] Phase 62: Manual Journal Entry Page (2/2 plans) — completed 2026-03-18
- [x] Phase 63: Interactive Visual Expense Tutorials (2/2 plans) — completed 2026-03-17

Full details: `.planning/milestones/v1.8-ROADMAP.md`

</details>

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
| v1.8 Support & Quality of Life | 55-63 | 23 | Complete | 2026-03-27 |

**Total: 63 phases, 232 plans shipped across 9 milestones**

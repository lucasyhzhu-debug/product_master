# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2026-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2026-02-16)
- ✅ **v1.2 Unified Planning & Revenue** — Phases 17-18 (shipped 2026-02-21)
- ✅ **v1.3 GoFood, Kitchen & Legacy Cleanup** — Phases 19-25 (shipped 2026-02-24)
- ✅ **v1.4 Sales & Channel Integration** — Phases 26-31 (shipped 2026-03-01)
- ✅ **v1.5 Financial Statements** — Phases 32-34 (shipped 2026-03-03)
- ◆ **v1.6 Tech Debt & Resilience** — Phases 35-39 (in progress)

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

### v1.6 Tech Debt & Resilience (Phases 35-39)

- [ ] **Phase 35: Schema Review & Audit** — Expert audit of 59 tables for duplication, waste, missing indexes
- [ ] **Phase 36: Sales & Analytics Backend Simplification** — Shared helpers + query file splits
- [ ] **Phase 37: Order & Dispatch Backend Simplification** — Order + dispatch query/mutation splits
- [ ] **Phase 38: Frontend Giant File Splits** — Split 4 components >1,200 LOC
- [ ] **Phase 39: E2E Test Foundation & Resilience** — Playwright setup + critical path tests + Tamtem fix

#### Phase 35: Schema Review & Audit

**Goal:** Expert audit of all 59 Convex tables to identify data duplication, unused/redundant tables, denormalization waste, missing indexes, and inefficient patterns. Produce actionable findings and execute safe quick-wins.

**Requirements:** SCH-01, SCH-02, SCH-03

**Agent:** `schema-architect` — Convex schema specialist

**Approach:**
- Read `convex/schema.ts` (1,600 LOC, 59 tables) end-to-end
- Cross-reference with actual query patterns in `convex/*/queries.ts` and `convex/*/mutations.ts`
- Identify: duplicate data across tables, unused tables/fields from legacy cleanup, missing indexes on frequently-queried fields, denormalization that's no longer needed
- Document findings as a structured report with severity and remediation recommendations
- Execute safe quick-wins (remove unused fields/tables, add missing indexes) that don't require data migration

**Success Criteria:**
1. Schema audit report produced with categorized findings (duplication, unused, missing indexes, inefficiency)
2. Each finding has severity (critical/moderate/low) and specific remediation recommendation
3. Safe quick-win cleanups executed (no data migration required)
4. `npm run build` passes after any schema changes
5. All existing tests pass after changes

---

#### Phase 36: Sales & Analytics Backend Simplification

**Goal:** Extract shared helpers (confidence, WIB timezone, sourceToPlatform) and split the largest analytics query files into slim orchestrators + pure helper modules. No API path changes.

**Requirements:** BSH-01, BSH-02, BSH-03, BFS-01, BFS-02, BFS-03

**Existing plan:** `docs/plans/2026-03-03-sales-analytics-simplification-plan.md`

**Approach:**
- Create `convex/lib/confidence.ts` — shared confidence types + `worstConfidence()`
- Consolidate WIB timezone helpers into `convex/lib/periodRange.ts`
- Move `sourceToPlatform()` to `convex/lib/externalSource.ts`
- Extract dashboard aggregation helpers from `externalData/queries.ts` (1,832 -> <1,300 LOC)
- Extract K3Mart cockpit helpers from `k3martCockpit/queries.ts` (985 -> <750 LOC)
- Update `incomeStatement.ts` to import shared modules (no local duplicates)
- All Convex function registrations stay in original files

**Success Criteria:**
1. `convex/lib/confidence.ts` is the single source of truth — no duplicate confidence types elsewhere
2. All WIB timezone helpers live in `convex/lib/periodRange.ts` — zero duplicates
3. `sourceToPlatform()` has one definition in `convex/lib/externalSource.ts`
4. `externalData/queries.ts` under 1,300 LOC
5. `k3martCockpit/queries.ts` under 750 LOC
6. `npm run build` passes, all tests pass, zero Convex API path changes

---

#### Phase 37: Order & Dispatch Backend Simplification

**Goal:** Split the order management and dispatch planner query/mutation files by extracting validation logic, enrichment helpers, and simulation code into pure helper modules.

**Requirements:** BFS-04, BFS-05, BFS-06

**Approach:**
- Extract order enrichment/aggregation helpers from `orders/queries.ts` (1,279 -> <800 LOC)
- Extract validation and business rule logic from `orders/mutations/orderCrud.ts` (1,085 -> <700 LOC)
- Extract simulation/forecast helpers from `dispatchPlanner/queries.ts` (1,228 -> <800 LOC)
- Keep Convex function registrations in place, move pure logic to `helpers/` directories

**Success Criteria:**
1. `orders/queries.ts` under 800 LOC with enrichment helpers extracted
2. `orders/mutations/orderCrud.ts` under 700 LOC with validation helpers extracted
3. `dispatchPlanner/queries.ts` under 800 LOC with simulation helpers extracted
4. `npm run build` passes, all tests pass
5. Zero changes to Convex API paths or mutation signatures

---

#### Phase 38: Frontend Giant File Splits

**Goal:** Split the 4 largest frontend components (all >1,200 LOC) into focused sub-components.

**Requirements:** FFS-01, FFS-02, FFS-03, FFS-04

**Approach:**
- Split `OverviewTab.tsx` (1,273 LOC): extract HeroCards, ChannelBreakdown, RevenueDetailsTable, PlatformHierarchy, LifetimeHero
- Split `GrabFoodManager.tsx` (1,486 LOC): extract per-tab components
- Split `FinishedGoodsTab.tsx` (1,474 LOC): extract dialog components, table sections
- Split `VouchersManager.tsx` (1,285 LOC): extract voucher form, usage table
- Each extracted component receives data via props

**Success Criteria:**
1. `OverviewTab.tsx` under 400 LOC
2. `GrabFoodManager.tsx` under 600 LOC
3. `FinishedGoodsTab.tsx` under 600 LOC
4. `VouchersManager.tsx` under 600 LOC
5. `npm run build` passes with no type errors

---

#### Phase 39: E2E Test Foundation & Resilience

**Goal:** Establish Playwright E2E test infrastructure and write tests for the 3 most critical user paths. Fix the Tamtem depot silent failure.

**Requirements:** RES-01, RES-02, RES-03, RES-04

**Approach:**
- Set up Playwright config, test fixtures, auth helpers (PIN login)
- E2E test: order lifecycle (create -> confirm -> produce -> complete)
- E2E test: kitchen production flow (view targets -> EoS recording)
- E2E test: sales analytics (period selector, channel breakdown)
- Fix Tamtem depot deduction silent skip

**Success Criteria:**
1. Playwright config and auth fixture working
2. Order lifecycle E2E test passes
3. Kitchen production E2E test passes
4. Sales analytics E2E test verifies page load and data
5. Tamtem depot deduction logs error or auto-seeds (no silent skip)

---

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 Concerns Cleanup & Refactor | 1-11 | 36 | Complete | 2026-02-15 |
| v1.1 Stabilization & QoL | 12-16 | 27 | Complete | 2026-02-16 |
| v1.2 Unified Planning & Revenue | 17-18 | 20 | Complete | 2026-02-21 |
| v1.3 GoFood, Kitchen & Legacy Cleanup | 19-25 | 49 | Complete | 2026-02-24 |
| v1.4 Sales & Channel Integration | 26-31 | 20 | Complete | 2026-03-01 |
| v1.5 Financial Statements | 32-34 | 9 | Complete | 2026-03-03 |
| v1.6 Tech Debt & Resilience | 35-39 | — | In Progress | — |

**Total: 34 phases, 161 plans shipped across 6 milestones + 5 new phases planned**

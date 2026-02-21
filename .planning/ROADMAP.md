# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2018-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2018-02-16)
- 🚧 **v1.2 Unified Planning & Revenue** — Phases 17-20 (in progress)

## Phases

<details>
<summary>✅ v1.0 Concerns Cleanup & Refactor (Phases 1-11) — SHIPPED 2018-02-15</summary>

- [x] Phase 1: Test Infrastructure (4/4 plans) — completed 2018-02-13
- [x] Phase 2: Quick Fixes — Security & Docs (2/2 plans) — completed 2018-02-13
- [x] Phase 3: Quick Fixes — Tech Debt (4/4 plans) — completed 2018-02-13
- [x] Phase 4: Quick Fixes — Bugs (2/2 plans) — completed 2018-02-13
- [x] Phase 5: Backend Factories (3/3 plans) — completed 2018-02-13
- [x] Phase 6: BOM Migration (3/3 plans) — completed 2018-02-14
- [x] Phase 7: Query Optimization (3/3 plans) — completed 2018-02-14
- [x] Phase 8: Schema Cleanup (4/4 plans) — completed 2018-02-14
- [x] Phase 9: UI Brand Consolidation (5/5 plans) — completed 2018-02-14
- [x] Phase 10: Frontend Factories (3/3 plans) — completed 2018-02-14
- [x] Phase 11: Infrastructure & Consolidation (3/3 plans) — completed 2018-02-14

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Stabilization & QoL (Phases 12-16) — SHIPPED 2018-02-16</summary>

- [x] Phase 12: UI Brand Verification (1/1 plan) — completed 2018-02-15
- [x] Phase 13: API Audit & Auth Architecture (5/5 plans) — completed 2018-02-15
- [x] Phase 14: Order QoL (8/8 plans) — completed 2018-02-16
- [x] Phase 14.1: Draft Order Update (3/3 plans) — completed 2018-02-16
- [x] Phase 15: Kitchen Overhaul (4/4 plans) — completed 2018-02-16
- [x] Phase 16: K3Mart Cockpit (6/6 plans) — completed 2018-02-16
- ~~Phase 16.1: GoBiz OpenAPI Audit~~ — DROPPED (GoBiz stopped issuing OAuth2 keys)

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### 🚧 v1.2 Unified Planning & Revenue (In Progress)

**Milestone Goal:** Unify production planning across all sales channels, add 3rd GoJek outlet, simplify kitchen targets, and enable cross-channel dispatch planning.

**Priority order:** Dispatch planner first (core value), then production ingredient tracking & COGS, then depot management, then kitchen link.

- [ ] **Phase 17: Unified Dispatch Planner & 3rd Outlet** - Multi-channel weekly planner with demand waterfall, direct order integration, channel config, and 3rd GoFood outlet (Tamtem). Inventory sufficiency check at end.
- [x] **Phase 18: Production Ingredient Tracking & COGS** - Extend BOM pattern to production components: ingredient recipes per ball type, FIFO inventory for food ingredients, calculated COGS from ingredient costs, and usage simulation for production planning (completed 2018-02-17)

## Phase Details

### Phase 17: Unified Dispatch Planner & 3rd Outlet
**Goal**: Manager can plan the entire week's production dispatch across all channels in one page, see demand waterfall, and the 3rd GoFood outlet (Tamtem) syncs transactions
**Depends on**: Nothing (first v1.2 phase)
**Requirements**: DSP-01, DSP-02, DSP-03, DSP-04, DSP-06, GF-01, DSP-05 (lower priority)
**Research**: Skip research-phase — extends proven K3Mart cockpit pattern
**Success Criteria** (what must be TRUE):
  1. Manager can configure channels with priority levels (Direct > GoFood > K3Mart > Other Consignment) and per-channel commission rates, and sees planned target for tomorrow and next 7 days at top of page
  2. A standalone weekly planner page shows all channels side-by-side (K3Mart dispatch, GoFood depot restock, Direct orders, other consignment) without replacing the existing K3Mart cockpit
  3. Direct orders with due dates automatically appear in the planner at due-date minus 2 days, each as its own sub-row showing product, quantity, and target day
  4. Demand waterfall visualization shows how the daily production capacity (default 200 balls) is allocated across channels by priority, with over-capacity days highlighted in red
  5. Tamtem (G958262444) transactions sync automatically alongside Goldfinch and Crystal on the existing cron schedule
  6. (Lower priority) When finalizing a day's plan, system checks sufficient boxes/stickers/packaging materials and flags insufficient dates
**Plans:** 6 plans
Plans:
- [x] 17-01-PLAN.md -- Tamtem 3rd outlet config + 4 new schema tables + seed mutation
- [x] 17-02-PLAN.md -- Backend queries, mutations, and pure helper functions
- [x] 17-03-PLAN.md -- Frontend hooks + Channel Settings Dialog
- [x] 17-04-PLAN.md -- Main planner grid page with all sub-components
- [x] 17-05-PLAN.md -- Routing, page wiring, documentation updates
- [x] 17-06-PLAN.md -- UAT gap closure: 7 fixes (timezone, editability, commission removal, tab merge, product filter, simulate inventory, tooltip)

### Phase 17.1: Product inventory tracker with location tracking and order fulfilment drawdown (INSERTED)

**Goal:** Staff can track finished goods inventory by location, add stock from kitchen, fulfill direct orders from inventory (skipping production), auto-deduct GoFood sales, and configure low-stock thresholds
**Depends on:** Phase 17
**Requirements:** FGI-01, FGI-02, FGI-03, FGI-04, FGI-05, FGI-06, FGI-07, FGI-08
**Plans:** 5/5 plans complete

Plans:
- [ ] 17.1-01-PLAN.md -- Schema + seed + stock CRUD backend (3 tables, locations, mutations, queries)
- [ ] 17.1-02-PLAN.md -- Order drawdown mutation + GoFood Phase D sync hook
- [ ] 17.1-03-PLAN.md -- Frontend: FinishedGoodsTab + stock cards + add/adjust dialogs + settings
- [ ] 17.1-04-PLAN.md -- OrderDetail drawdown UI + documentation updates
- [ ] 17.1-05-PLAN.md -- UAT gap closure: button placement, product filter, current stock display, location toggles, drawdown toast, settings labels, ProductionComponents category

### Phase 18: Production Ingredient Tracking & COGS
**Goal**: Extend the packaging BOM/inventory pattern to production components — each production component (Big Ball, Mid Ball) gets ingredient recipes with quantities, FIFO inventory tracking for food ingredients, auto-calculated COGS from ingredient costs, and usage simulation for production planning
**Depends on**: Phase 17 (dispatch planner needed for usage simulation); independent of 18/19
**Requirements**: TBD (new feature — derives from existing BOM architecture)
**Research**: Research-phase recommended — must audit current componentTypes, inventory, and costCalculator patterns
**Success Criteria** (what must be TRUE):
  1. Each production component (BIG_BALL, MID_BALL) can have one or more ingredient links specifying ingredient, unit, and quantity per component (e.g., Mid Ball = Xg marshmallow + Xg pistachio spread + Xg kunafa + Xg cocoa powder)
  2. Production component ingredients use the same modal flow as packaging components — click a production component, add existing or new ingredients with unit selection and quantity per component
  3. New ingredients appear in the Inventory page under the existing "Production" tab with the same UI/UX as packaging inventory (stock bars, batch tracking, FIFO)
  4. Production component COGS is auto-calculated from its ingredient costs (weighted average from FIFO batches) instead of manual number input; cached on the component and lazily updated
  5. Menu product COGS flows unchanged — links production + packaging components; production component COGS now comes from ingredients instead of manual entry
  6. Receiving new ingredient stock (batches) works identically to packaging inventory — same receive modal, vendor, cost per unit, FIFO tracking
  7. Dispatch planner usage simulation includes ingredient consumption alongside packaging consumption — shows projected ingredient depletion and resupply dates
  8. Historical orders are not impacted — COGS calculations apply forward only, no retroactive recalculation
**Plans:** 9 plans (6 original + 3 UAT gap closure)
Plans:
- [x] 18-01-PLAN.md -- Schema extensions (2 new tables + componentTypes fields) + hierarchy traversal utility
- [x] 18-02-PLAN.md -- Production recipe CRUD backend + COGS calculation + cost invalidation cascade
- [x] 18-03-PLAN.md -- Ingredient inventory infrastructure (FIFO tracking + order fulfillment deduction)
- [x] 18-04-PLAN.md -- Recipe editor modal frontend + ProductionComponentsManager tier sorting
- [x] 18-05-PLAN.md -- Inventory page ingredient display + COGS tooltip + dispatch planner simulation
- [x] 18-06-PLAN.md -- Materials Check panel wiring + build verification + documentation
- [x] 18-07-PLAN.md -- UAT gap closure (backend): hierarchy cost-leaf, production inventory mutation, dispatchPlans outletId union
- [x] 18-08-PLAN.md -- UAT gap closure (frontend): SubComponentSection UX, unit labels, ReceiveStockDialog categories, ingredient tracking button
- [x] 18-09-PLAN.md -- UAT gap closure (dispatch): Planned Manual posSlot filter, K3MartCockpit WeeklyPlannerGrid removal

# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2026-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2026-02-16)
- 🚧 **v1.2 Unified Planning & Revenue** — Phases 17-19 (in progress)

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

### 🚧 v1.2 Unified Planning & Revenue (In Progress)

**Milestone Goal:** Unify production planning across all sales channels, add 3rd GoJek outlet, simplify kitchen targets, and enable cross-channel dispatch planning.

**Priority order:** Dispatch planner first (core value), then 3rd outlet + depot management, then kitchen link.

- [ ] **Phase 17: Unified Dispatch Planner & 3rd Outlet** - Multi-channel weekly planner with demand waterfall, direct order integration, channel config, and 3rd GoFood outlet (Tamtem). Inventory sufficiency check at end.
- [ ] **Phase 18: GoFood Depot Management** - Per-outlet product mapping, depot stock tracking with alerts, and restock suggestion formula
- [ ] **Phase 19: Kitchen Target Link** - Default production targets and dispatch-driven kitchen display

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
- [ ] 17-06-PLAN.md -- UAT gap closure: 7 fixes (timezone, editability, commission removal, tab merge, product filter, simulate inventory, tooltip)

### Phase 18: GoFood Depot Management
**Goal**: Manager can track per-outlet depot stock, get restock suggestions, and receive low-stock alerts across all 3 GoFood outlets
**Depends on**: Phase 17 (3rd outlet must be syncing)
**Requirements**: GF-02, GF-03, GF-04
**Research**: Skip research-phase
**Success Criteria** (what must be TRUE):
  1. Manager can select an outlet in the product mapping tab and customize which internal products map to which GoFood menu items per outlet; new outlets default to previous depot's mapping
  2. Manager can set starting depot stock per outlet per day, and the system reduces it as synced sales arrive, showing current remaining stock per depot
  3. System alerts when any depot drops below 5 total products remaining
  4. Restock suggestion shows n+1 (avg last 3 days, rounded up) for normal days, n+2 for Fri/Sat, and resets to previous Thursday's total on Monday
**Plans**: TBD

### Phase 19: Kitchen Target Link
**Goal**: Kitchen staff see clear daily production targets driven by dispatch planning output
**Depends on**: Phase 17 (dispatch planner generates the targets kitchen displays)
**Requirements**: KIT-09, KIT-12
**Research**: Skip research-phase
**Success Criteria** (what must be TRUE):
  1. Default daily production target is 200 units (110 Original singles + 30 Original triples, no Jumbo), configurable by manager in kitchen settings
  2. Kitchen dashboard displays two numbers driven by dispatch planner output: total Original singles to produce today and total Original triples to produce today
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 17 → 18 → 19

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Test Infrastructure | v1.0 | 4/4 | Complete | 2026-02-13 |
| 2. Security & Docs | v1.0 | 2/2 | Complete | 2026-02-13 |
| 3. Tech Debt | v1.0 | 4/4 | Complete | 2026-02-13 |
| 4. Bugs | v1.0 | 2/2 | Complete | 2026-02-13 |
| 5. Backend Factories | v1.0 | 3/3 | Complete | 2026-02-13 |
| 6. BOM Migration | v1.0 | 3/3 | Complete | 2026-02-14 |
| 7. Query Optimization | v1.0 | 3/3 | Complete | 2026-02-14 |
| 8. Schema Cleanup | v1.0 | 4/4 | Complete | 2026-02-14 |
| 9. UI Brand Consolidation | v1.0 | 5/5 | Complete | 2026-02-14 |
| 10. Frontend Factories | v1.0 | 3/3 | Complete | 2026-02-14 |
| 11. Infrastructure | v1.0 | 3/3 | Complete | 2026-02-14 |
| 12. UI Brand Verification | v1.1 | 1/1 | Complete | 2026-02-15 |
| 13. API Audit & Auth | v1.1 | 5/5 | Complete | 2026-02-15 |
| 14. Order QoL | v1.1 | 8/8 | Complete | 2026-02-16 |
| 14.1. Draft Order Update | v1.1 | 3/3 | Complete | 2026-02-16 |
| 15. Kitchen Overhaul | v1.1 | 4/4 | Complete | 2026-02-16 |
| 16. K3Mart Cockpit | v1.1 | 6/6 | Complete | 2026-02-16 |
| ~~16.1. GoBiz OpenAPI~~ | v1.1 | — | Dropped | 2026-02-16 |
| 17. Dispatch Planner & 3rd Outlet | v1.2 | 5/6 | UAT Fixes | 2026-02-17 |
| 18. GoFood Depot Management | v1.2 | 0/? | Not started | - |
| 19. Kitchen Target Link | v1.2 | 0/? | Not started | - |

---
*Roadmap created: 2026-02-13*
*v1.0 shipped: 2026-02-15*
*v1.1 shipped: 2026-02-16*
*v1.2 roadmap created: 2026-02-17*

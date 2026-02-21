# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2026-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2026-02-16)
- ✅ **v1.2 Unified Planning & Revenue** — Phases 17-18 (shipped 2026-02-21)
- 📋 **v1.3 Depot Management & Revenue** — Phases 19-20+ (planned)

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

### 📋 v1.3 Depot Management & Revenue (Planned)

**Milestone Goal:** Close GoFood depot management gaps, link dispatch planning to kitchen targets, and enable cross-channel revenue tracking with consignment management.

- [ ] **Phase 19: GoFood Depot Management** — Per-outlet product mapping, per-outlet depot stock + alerts, restock algorithm, Tamtem silent-skip fix (GF-02, GF-03, GF-04)
- [ ] **Phase 20: Kitchen Production Targets** — Configurable default daily target, dispatch output drives kitchen display (KIT-09, KIT-12)

## Phase Details

### Phase 19: GoFood Depot Management (Gap Closure)

**Goal:** Admin can configure per-outlet product mappings for each GoFood depot, track per-depot stock levels with low-stock alerts, and get daily restock suggestions; Tamtem depot deduction silently skipping when seed not run is replaced with an admin-visible alert
**Depends on:** Phase 17.1 (builds on finished goods inventory + GoFood deduction infrastructure)
**Requirements:** GF-02, GF-03, GF-04
**Gap Closure:** Closes GF-02, GF-03, GF-04 from v1.2 audit; fixes Tamtem silent-skip integration gap
**Success Criteria** (what must be TRUE):
  1. Mapping tab has an outlet selector — admin can set per-outlet product mappings; new outlets default to previous depot's mapping
  2. Each GoFood depot shows current stock level; admin sets starting stock per depot per day; system auto-deducts based on synced GoFood sales
  3. Alert fires when any depot drops below 5 total products remaining
  4. Restock suggestion shown per depot: n+1 (avg last 3 days), n+2 on Fri/Sat, Monday reset to previous Thursday's total
  5. When `seedFinishedGoodsLocations` has not been run, an admin-visible warning appears on the GoFood depot page instead of a silent console.log skip
**Plans:** TBD (run /gsd:plan-phase 19 to break down)

Plans:
- [ ] TBD

### Phase 20: Kitchen Production Targets (Gap Closure)

**Goal:** Manager can configure default daily production targets, and the kitchen view displays today's production targets driven by dispatch planner output
**Depends on:** Phase 17 (dispatch planner), Phase 19 (depot management)
**Requirements:** KIT-09, KIT-12
**Gap Closure:** Closes KIT-09, KIT-12 from v1.2 audit
**Success Criteria** (what must be TRUE):
  1. Default daily production target is 200 units (110 Original singles + 30 Original triples, no Jumbo); manager can edit this in settings
  2. Kitchen view displays two numbers for today: (1) total Original singles to produce, (2) total Original triples to produce
  3. Kitchen display numbers are driven by dispatch planner output when a plan exists for today; fallback to configured default when no plan set
**Plans:** TBD (run /gsd:plan-phase 20 to break down)

Plans:
- [ ] TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|---------------|--------|-----------|
| 1-11. Foundation → Infrastructure | v1.0 | 36/36 | Complete | 2026-02-15 |
| 12-16. UI → K3Mart Cockpit | v1.1 | 27/27 | Complete | 2026-02-16 |
| 17. Unified Dispatch Planner & 3rd Outlet | v1.2 | 6/6 | Complete | 2026-02-17 |
| 17.1. Product Inventory Tracker | v1.2 | 5/5 | Complete | 2026-02-21 |
| 18. Production Ingredient Tracking & COGS | v1.2 | 9/9 | Complete | 2026-02-21 |
| 19. GoFood Depot Management | v1.3 | 0/TBD | Not started | - |
| 20. Kitchen Production Targets | v1.3 | 0/TBD | Not started | - |

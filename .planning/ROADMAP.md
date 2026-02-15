# Roadmap: Frollie Recipe Master

## Milestones

- **v1.0 Concerns Cleanup & Refactor** -- Phases 1-11 (shipped 2026-02-15)
- **v1.1 Stabilization & QoL** -- Phases 12-16 (in progress)

## Phases

<details>
<summary>v1.0 Concerns Cleanup & Refactor (Phases 1-11) -- SHIPPED 2026-02-15</summary>

- [x] Phase 1: Test Infrastructure (4/4 plans) -- completed 2026-02-13
- [x] Phase 2: Quick Fixes -- Security & Docs (2/2 plans) -- completed 2026-02-13
- [x] Phase 3: Quick Fixes -- Tech Debt (4/4 plans) -- completed 2026-02-13
- [x] Phase 4: Quick Fixes -- Bugs (2/2 plans) -- completed 2026-02-13
- [x] Phase 5: Backend Factories (3/3 plans) -- completed 2026-02-13
- [x] Phase 6: BOM Migration (3/3 plans) -- completed 2026-02-14
- [x] Phase 7: Query Optimization (3/3 plans) -- completed 2026-02-14
- [x] Phase 8: Schema Cleanup (4/4 plans) -- completed 2026-02-14
- [x] Phase 9: UI Brand Consolidation (5/5 plans) -- completed 2026-02-14
- [x] Phase 10: Frontend Factories (3/3 plans) -- completed 2026-02-14
- [x] Phase 11: Infrastructure & Consolidation (3/3 plans) -- completed 2026-02-14

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.1 Stabilization & QoL (In Progress)

**Milestone Goal:** Stabilize production workflows, integrate external APIs with auto-auth, and improve daily UX for kitchen staff, order managers, and K3Mart operators.

**Research note:** All phases flagged as "skip research-phase" -- internal system with complete codebase access, all patterns proven in v1.0, no external research needed. Use `/gsd:plan-phase` directly.

- [ ] **Phase 12: UI Brand Verification** - Verify brand reference doc covers v1.1 new pages
- [ ] **Phase 13: API Audit & Auth Architecture** - External API integration with token management, sync health, and multi-outlet support
- [ ] **Phase 14: Order QoL** - Order management UX overhaul with Kanban board, simplified statuses, and audit trail
- [ ] **Phase 15: Kitchen Overhaul** - Kitchen dashboard with production targets, due-date ranking, and K3Mart demand integration
- [ ] **Phase 16: K3Mart Cockpit** - Complete cockpit with outlet-first weekly planning, holiday awareness, and demand push to kitchen

## Phase Details

### Phase 12: UI Brand Verification
**Goal**: New v1.1 pages (Kanban board, kitchen dashboard header, outlet calendar) follow established teal brand, Inter typography, and dark mode patterns
**Depends on**: Nothing (verification of existing brand doc)
**Requirements**: UIB-01
**Research**: Skip research-phase
**Success Criteria** (what must be TRUE):
  1. Brand reference doc (`docs/UI_BRAND_REFERENCE.md`) is reviewed and confirmed current for v1.1 scope
  2. Brand doc includes guidance for new UI patterns introduced in v1.1 (Kanban columns, dashboard summary headers, calendar grids)
**Plans**: 1 plan
- [ ] 12-01-PLAN.md -- Audit brand doc and add v1.1 component patterns (Kanban, dashboard header, calendar grid)

### Phase 13: API Audit & Auth Architecture
**Goal**: Admin can monitor platform health, GoBiz token stays alive automatically, Crystal outlet syncs revenue, and all API integrations are documented
**Depends on**: Phase 12
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06
**Research**: Skip research-phase
**Success Criteria** (what must be TRUE):
  1. Admin sees token health and last-sync status for K3Mart and GoBiz on the Sales Analytics settings page
  2. GoBiz token auto-refreshes via cron every 30 minutes; manual re-paste only needed if refresh chain breaks
  3. Dashboard shows a sync health alert when GoFood or K3Mart sync fails for 6+ hours
  4. GoFood revenue syncs from both Crystal (G347061572) and Goldfinch (G293156297) outlets
  5. Unified product mapping system auto-matches external products to internal menuProducts by type (Original→Original, Triple→Triple, Jumbo→Jumbo) independent of price differences; admin can edit/add/delete mappings via UI; covers GoFood and K3Mart
  6. All external API integrations documented with SOPs, automation status, and refresh token flow in docs/apiS/
**Plans**: TBD

### Phase 14: Order QoL
**Goal**: Order staff can manage orders through a Kanban board, create orders in a dedicated form, and track every status change with an audit trail
**Depends on**: Phase 13 (status simplification affects API sync references)
**Requirements**: ORD-01, ORD-02, ORD-03, ORD-04, ORD-05, ORD-06, ORD-07, ORD-08
**Research**: Skip research-phase
**Success Criteria** (what must be TRUE):
  1. Order manager displays a horizontal-scrolling Kanban board with ~5-6 grouped columns (Awaiting Payment, Confirmed, In Kitchen, Waiting for Delivery, Complete)
  2. Order creation is a separate page/section from the Kanban board, with customer name and phone at the top of the form
  3. WaitingShipment/WaitingPickup merged into WaitingDelivery and CompleteShipped/PickedUp merged into Complete (schema migrated, all status references updated)
  4. Due date input offers day-name quick-tap pills (Today, Tomorrow, Saturday, Sunday, Monday...) with manual date fallback
  5. Order cards show discounted total prominently with discount amount and struck-through gross price, and every status change records who/when in a viewable audit trail
**Plans**: TBD

### Phase 15: Kitchen Overhaul
**Goal**: Kitchen staff see production targets, due-date-ranked orders, and K3Mart demand at a glance above the existing batch production panels
**Depends on**: Phase 14 (uses simplified statuses from ORD-03)
**Requirements**: KIT-01, KIT-02, KIT-03, KIT-04, KIT-05, KIT-06, KIT-07, KIT-08
**Research**: Skip research-phase
**Success Criteria** (what must be TRUE):
  1. New dashboard summary header appears above existing swipeable batch panels showing minimum target today, max production target, remaining balls needed, and orders left to complete
  2. Minimum target auto-calculates from confirmed/in-production orders due today; max target defaults to 200 balls with manager-configurable composition; both targets are adjustable by manager
  3. Kitchen orders are grouped by due-date headers ("Due Today", "Due Tomorrow", etc.) with per-item production checklists
  4. K3Mart demand appears as a synthetic order in the kitchen view, auto-generated from confirmed K3Mart dispatch plans with manager-adjustable quantity
  5. Manager can override "unavailable" inventory with a reason (manager role required)
**Plans**: TBD

### Phase 16: K3Mart Cockpit
**Goal**: Manager can plan weekly dispatches per outlet with holiday awareness, record manual stock movements, and push confirmed plans to kitchen
**Depends on**: Phase 15 (KIT-06 receives demand from K3M-05)
**Requirements**: K3M-01, K3M-02, K3M-03, K3M-04, K3M-05
**Research**: Skip research-phase
**Success Criteria** (what must be TRUE):
  1. All cockpit stub implementations (K3MART-01 through K3MART-06) show real data from backend queries
  2. Weekly calendar view is outlet-first: select/tab an outlet, then see all products for that outlet across a 7-day grid
  3. Holidays and weekends are visually highlighted in the weekly planning grid with adjusted suggested quantities
  4. Manager can record manual stock in/out during the day without full dispatch planning
  5. Confirmed dispatch plans automatically create/update synthetic kitchen orders (linked to KIT-06 in Phase 15)
**Plans**: TBD

## Progress

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
| 12. UI Brand Verification | v1.1 | 0/1 | Planned | - |
| 13. API Audit & Auth Architecture | v1.1 | 0/TBD | Not started | - |
| 14. Order QoL | v1.1 | 0/TBD | Not started | - |
| 15. Kitchen Overhaul | v1.1 | 0/TBD | Not started | - |
| 16. K3Mart Cockpit | v1.1 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-13*
*v1.0 shipped: 2026-02-15*
*v1.1 roadmap added: 2026-02-15*

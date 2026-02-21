# Frollie Recipe Master

## What This Is

A real-time recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, product concepts, orders, kitchen production, and inventory with full versioning, cost calculations, and margin analysis. Features Kanban order management, unified multi-channel dispatch planning (GoFood × 3 outlets + K3Mart + Direct + Consignment), finished goods inventory with order drawdown, production ingredient tracking with auto-calculated COGS, and multi-platform API integration (GoBiz/GoFood). Moving toward GoFood depot management, kitchen target automation, and consignment revenue tracking.

## Core Value

Production reliability — the system is the single source of truth for recipes, orders, kitchen production, and inventory. Every feature must work correctly under real kitchen conditions with real-time updates.

## Current Milestone: v1.3 GoFood, Kitchen & Consignment

**Goal:** Close GoFood depot management gaps, link dispatch planning to kitchen production targets, and add consignment sales tracking with manual Excel upload and unified lifetime sales analytics.

**Target features:**
- GoFood per-outlet product mapping, per-depot stock tracking, and restock suggestion algorithm
- Kitchen production targets driven by dispatch planner output
- Consignment sales upload (Excel, bulk + detail formats) for Legato and similar outlets
- Sales Analytics extended with consignment channel data and lifetime totals dashboard

## Requirements

### Validated

- ✓ Recipe management with versioning and cost calculations — existing
- ✓ Packaging recipe management with materials tracking — existing
- ✓ Product concept management with COGS and margin analysis — existing
- ✓ Order management with full status workflow (Draft → Complete) — existing
- ✓ Kitchen production tracking with ball distribution and tray allocation — existing
- ✓ Inventory management with FIFO batch tracking — existing
- ✓ Menu product system with BOM (Bill of Materials) components — existing
- ✓ PIN-based authentication with role-based access control — existing
- ✓ WhatsApp receipt generation with editable templates — existing
- ✓ Voucher system with usage tracking — existing
- ✓ K3 Mart integration for external stock management — existing
- ✓ Customer management — existing
- ✓ Real-time dashboard with reactive queries — existing
- ~~✓ Visual feedback overlay for user reporting — existing~~ (removed v1.2 — element identification too imprecise)
- ✓ BOM as single source of truth for ball composition — v1.0
- ✓ Comprehensive test coverage for ball distribution, FIFO, order lifecycle, vouchers — v1.0
- ✓ Security hardened: env files removed from VCS, credentials rotated, security patterns documented — v1.0
- ✓ N+1 queries eliminated, cursor pagination, kitchen denormalization, COGS caching — v1.0
- ✓ Schema tightened: 13 fields required, 5 deprecated removed, 55 denormalization annotations — v1.0
- ✓ UI brand unified: teal accent, Inter typography, dark mode, skeleton screens, mobile nav — v1.0
- ✓ Backend factories: protectedMutation wrappers, query helpers across simple entities — v1.0
- ✓ Frontend factories: EntityManager generic CRUD, createMutationHook factory — v1.0
- ✓ Production counts consolidated to productionLog as single source of truth — v1.0
- ✓ Automated weekly integrity checks for production data — v1.0
- ✓ Dependency audit with 6 safe upgrades applied — v1.0
- ✓ GoBiz token auto-refresh cron (30-min), Crystal+Goldfinch dual-outlet sync, sync health monitoring — v1.1
- ✓ Unified product mapping: auto-match by type across GoFood+K3Mart, admin-editable — v1.1
- ✓ Dashboard sync health alerts for stale API connections — v1.1
- ✓ API integration reference documentation (GoBiz, GoFood, K3Mart) — v1.1
- ✓ Kanban board order management with 7-status model (Draft→Complete) — v1.1
- ✓ Dedicated order creation page with customer-first layout, due date pills — v1.1
- ✓ Order audit trail: every status change records who/when — v1.1
- ✓ Draft order lifecycle with auto-save and edit-from-Kanban — v1.1
- ✓ Kitchen dashboard header: min/max targets, remaining balls, orders left — v1.1
- ✓ Due-date grouped kitchen orders with per-item production checklists — v1.1
- ✓ K3Mart synthetic demand in kitchen (auto from dispatch plans) — v1.1
- ✓ Manager inventory override with reason logging — v1.1
- ✓ K3Mart cockpit: outlet-first weekly planner with holiday awareness — v1.1
- ✓ Stock rotation shortcuts and manual stock in/out for K3Mart — v1.1
- ✓ Dispatch-to-kitchen pipeline (confirmDayPlan → production targets) — v1.1
- ✓ Sales analytics: Recharts, platform stacked charts, hourly/daily/weekly/monthly — v1.1
- ✓ Tamtem 3rd GoFood outlet (G958262444) syncs transactions automatically alongside Goldfinch and Crystal — v1.2
- ✓ Unified multi-channel dispatch planner: demand waterfall, direct order auto-population, over-capacity highlighting, inventory sufficiency check — v1.2 (DSP-01 to DSP-06)
- ✓ Finished goods inventory tracker: location-aware stock by product, order drawdown skipping production, GoFood auto-deduction, per-product low-stock alerts — v1.2
- ✓ Production ingredient tracking: ingredient recipes per ball type (BIG_BALL, MID_BALL), FIFO inventory for food ingredients, auto-calculated COGS replacing manual entry — v1.2
- ✓ Dispatch planner simulation: day-by-day packaging + ingredient shortage forecasts with "Runs Out By" resupply dates in Materials Check panel — v1.2

### Active

- [ ] GF-02: Per-outlet product mapping (outlet selector in mapping tab; new outlets default to previous depot's mapping) — Phase 19
- [ ] GF-03: Per-outlet GoFood depot stock tracking with alert when any depot < 5 products remaining — Phase 19
- [ ] GF-04: Depot restock suggestion algorithm: n+1 avg last 3 days; n+2 Fri/Sat; Mon reset to prev Thu total — Phase 19
- [ ] KIT-09: Default daily production target 200 units (110 Original singles + 30 Original triples), configurable by manager — Phase 20
- [ ] KIT-12: Dispatch planner output drives kitchen view — kitchen displays today's production targets as two numbers (singles + triples) — Phase 20
- [ ] CON-01: User can upload consignment sales via Excel (bulk summary: product + qty sold + qty returned + revenue per outlet per date range) — Phase 21
- [ ] CON-02: User can upload consignment sales via Excel (detail format: per-transaction with ID and line items) — Phase 21
- [ ] CON-03: System provides downloadable pre-formatted Excel template (summary + detail sheets) for consignment data entry — Phase 21
- [ ] ANLY-01: Sales Analytics shows consignment channel data alongside GoFood, K3Mart, and Direct channels — Phase 22
- [ ] ANLY-02: Sales Analytics displays lifetime totals: headline units sold counter + per-product breakdown table — Phase 22

### Out of Scope

| Feature | Reason |
|---------|--------|
| PIN hash migration to bcrypt/scrypt | SHA256 acceptable for 6-digit PINs with rate limiting on internal tool |
| Moving to HTTP-only cookies or Convex Auth | Token-in-args pattern acceptable for internal tool |
| Error monitoring integration (Sentry/LogRocket) | Separate initiative |
| Archival strategy for old orders | Separate initiative after backup automation is in place |
| GoBiz programmatic login (password grant) | API blocks non-browser clients; manual paste + refresh cron sufficient |
| Full GoFood POS integration (accept orders) | Requires GoFood Facilitator Model partnership; massive scope |
| GoBiz official OAuth2 migration | GoBiz stopped issuing new client credentials (Phase 16.1 dropped) |
| Mobile app (React Native) | Responsive web design covers kitchen mobile use |
| Multi-language i18n | All users are Indonesian staff comfortable with English UI |
| Kitchen integration from dispatch planner (auto-push) | Deferred until dispatch planner is validated; v1.3+ |
| Audio alerts for kitchen (KIT-11) | Deferred to v1.3+ |
| Automated settlement reconciliation | Metric flagging sufficient at this scale; CON-04 simplified |
| Full double-entry accounting for consignment | Production system, not accounting; export summaries to spreadsheets |
| Per-unit consignment serialization | Batch tracking sufficient for Rp 40-120k product |
| Line-item voucher codes (VCH-01) | Current order-level vouchers work; per-product discounts deferred |
| Customer CRM / Sales pipeline | Deferred |
| Notifications bell (NTF-01) | Deferred |
| Visual feedback overlay | Removed — element identification too imprecise |

## Context

Shipped v1.2 with ~97,824 lines TypeScript across 62 Convex tables.
Tech stack: Convex 1.31 + React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4 + shadcn/ui + Recharts.
Deployed via Vercel with GitHub Actions CI.

**Current state after v1.2:**
- 7/12 v1.2 requirements satisfied; 5 carried to v1.3 (GoFood depot management + kitchen targets)
- Dispatch planning: unified multi-channel weekly planner at /dispatch-planner with GoFood, K3Mart, Direct, Consignment
- Finished goods inventory: 3 new tables (productInventory, productInventoryTransactions, productInventorySettings)
- Production ingredients: 2 new tables (productionComponentLinks, productionComponentIngredients) with FIFO via inventoryBatches
- API: 3 GoFood outlets (Goldfinch, Crystal, Tamtem), GoBiz JSON blob token paste, auto-refresh cron
- Schema: 62 tables
- UI: 26 pages under teal brand with dark mode

**Known technical debt:**
- E2E Playwright tests not yet written (test infrastructure is Vitest + convex-test only)
- Generic query factory not applied to all query files (only simple entities)
- protectedMutation not applied to complex entities (orders, recipes, products)
- `useConvex` prefix not removed from hook names (cosmetic)
- 1.8MB JS bundle size triggers Vite warning
- Partial dark mode coverage in some K3Mart components
- Tamtem depot deduction silently skips when seedFinishedGoodsLocations not run (mitigation: run seed before Tamtem GoFood sales begin)
- Ingredient simulation uses name string matching — fragile if names diverge between ingredient and tracker componentType records

## Constraints

- **Tech Stack**: Convex + React 19 + TypeScript + Vite — no stack changes
- **Zero Downtime**: Production system — changes must not break existing features
- **Backward Compatibility**: Schema changes must handle existing data (migrations where needed)
- **Build Gate**: `npm run build` must pass after every phase
- **Git Workflow**: Feature branches, no direct commits to main

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep SHA256 for PIN hashing | 6-digit PINs with rate limiting sufficient for internal tool | ✓ Good — documented in SECURITY.md |
| Kill old KitchenView.tsx | V2 is production-ready, maintaining two UIs causes confusion | ✓ Good — deleted in Phase 3 |
| Build generic factories (queries, hooks, mutations, UI) | 2000+ lines of duplicate code, high maintenance burden | ✓ Good — EntityManager + createMutationHook reduce boilerplate significantly |
| Consolidate productionCounts to log-derived | Dual-write system risks inconsistency | ✓ Good — productionLog is sole source of truth, integrity checks validate |
| Include dependency upgrades | Staying current reduces future migration pain | ✓ Good — 6 safe upgrades applied, 7 major deferred with rationale |
| Include automated backup | Production data at risk without it | ✓ Good — weekly cron + integrity checks configured |
| Teal #0D9488 brand accent | Fresh, natural feel for snack brand; replaces terracotta | ✓ Good — applied across all 19 pages |
| Inter-only typography | Single font reduces FOUT, matches Notion-style reference | ✓ Good — Playfair Display removed entirely |
| BOM strangler fig migration | Gradual migration avoids breaking existing orders | ✓ Good — dual-read pattern worked cleanly |
| isKitchenVisible denormalization | Avoids multi-status loop in kitchen queries | ✓ Good — significant query simplification |
| Eager COGS caching on unitCost | Avoids recalculating on every product list view | ✓ Good — stale badge for transparency |
| 7-status Kanban model | 12+ statuses too complex; 7 covers all real workflows | ✓ Good — simpler schema, cleaner UI, audit trail built-in |
| GoBiz manual paste + cron refresh | Password grant blocked by API; refresh token keeps session alive | ✓ Good — 30-min cron works reliably |
| Outlet-first K3Mart calendar | Users think in outlets, not products across outlets | ✓ Good — natural workflow for dispatch planning |
| Kitchen dashboard above existing panels | Kitchen staff need both metrics and batch production | ✓ Good — non-disruptive addition to proven V2 layout |
| Unified product mapping by type | GoFood prices differ from internal; match by type not price | ✓ Good — auto-match + admin-editable covers all platforms |
| Drop Phase 16.1 GoBiz OAuth2 | GoBiz stopped issuing new client credentials | — Accepted — unofficial integration maintained |
| 4 separate dispatch planner tables | Separation of concerns over monolithic config object | ✓ Good — each table has distinct read/write patterns |
| Unified dispatch planner as standalone page | K3Mart cockpit stays for K3Mart-specific API workflows; planner reads from both | ✓ Good — no feature regression, clear separation of responsibilities |
| productInventory as simple aggregate (not FIFO) | GoFood outlets need negative stock for auto-deduction; FIFO adds complexity without value for finished goods | ✓ Good — simpler, predictable; negative stock flagged visually |
| fulfillFromInventory bypasses status transition guard | PaymentReceived→AwaitingDelivery requires special path outside normal forward-only transitions | ✓ Good — documented in statusTransitions.ts; intentional bypass with clear comment |
| Forward-only COGS for production ingredients | Historical orders keep original costs; recalculation would invalidate past profitability data | ✓ Good — clean separation of historical vs. new records |
| GoBiz token accepted as full JSON blob | Dual-field input caused paste errors; single JSON paste is safer and faster | ✓ Good — improved UX, no functional regression |
| commissionRate removed from dispatch schema | Net/gross revenue comes from external APIs; commission is API-derived, not locally stored | ✓ Good — avoided data duplication and sync mismatch |
| Direct Sales "Planned (Manual)" outlet | Managers need ad-hoc planning for non-confirmed direct orders | ✓ Good — flexible without polluting confirmed order data |

---
*Last updated: 2026-02-21 after milestone v1.3 started*

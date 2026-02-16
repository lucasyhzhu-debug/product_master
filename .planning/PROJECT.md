# Frollie Recipe Master

## What This Is

A real-time recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, product concepts, orders, kitchen production, and inventory with full versioning, cost calculations, and margin analysis. Now with Kanban order management, kitchen production targets, multi-platform API integration (GoBiz/GoFood), and K3Mart outlet dispatch planning.

## Core Value

Production reliability — the system is the single source of truth for recipes, orders, kitchen production, and inventory. Every feature must work correctly under real kitchen conditions with real-time updates.

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
- ✓ Visual feedback overlay for user reporting — existing
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

### Active

(Next milestone requirements to be defined via `/gsd:new-milestone`)

### Out of Scope

- PIN hash migration to bcrypt/scrypt — SHA256 acceptable for 6-digit PINs with rate limiting on internal tool
- Moving to HTTP-only cookies or Convex Auth — token-in-args pattern acceptable for internal tool
- Error monitoring integration (Sentry/LogRocket) — separate initiative
- Archival strategy for old orders — separate initiative after backup automation is in place
- GoBiz programmatic login (password grant) — API blocks non-browser clients; manual paste + refresh cron sufficient
- Full GoFood POS integration (accept orders) — requires GoFood Facilitator Model partnership; massive scope for 2 outlets
- GoBiz official OAuth2 migration — GoBiz stopped issuing new client credentials (Phase 16.1 dropped)
- Mobile app (React Native) — responsive web design covers kitchen mobile use
- Multi-language i18n — all users are Indonesian staff comfortable with English UI

## Context

Shipped v1.1 with ~100k lines of TypeScript across 59 Convex tables.
Tech stack: Convex 1.31 + React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4 + shadcn/ui + Recharts.
Deployed via Vercel with GitHub Actions CI.

**Current state after v1.1:**
- 29/29 v1.1 requirements satisfied, all integration paths verified
- Order management: 7-status Kanban model with audit trail, draft lifecycle, dedicated creation page
- Kitchen: dashboard header with production targets, due-date order grouping, K3Mart synthetic demand
- K3Mart: outlet-first weekly planner, holiday awareness, stock rotation, dispatch-to-kitchen pipeline
- API: GoBiz auto-refresh cron, dual-outlet GoFood sync, sync health monitoring, unified product mapping
- Sales analytics: Recharts with platform-colored stacked charts, hourly granularity
- Schema: 59 tables (expanded from 37 with kitchenConfig, orderEvents, platformCredentials, etc.)
- UI: 26 pages under teal brand with dark mode

**Known technical debt:**
- E2E Playwright tests not yet written
- Generic query factory not applied to all query files (only simple entities)
- protectedMutation not applied to complex entities (orders, recipes, products)
- `useConvex` prefix not removed from hook names (cosmetic)
- 1.8MB JS bundle size triggers Vite warning
- Partial dark mode coverage in some K3Mart components
- 27 deferred requirements tracked in v1.1 REQUIREMENTS archive

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

---
*Last updated: 2026-02-16 after v1.1 milestone*

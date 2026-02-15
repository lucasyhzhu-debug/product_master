# Frollie Recipe Master

## What This Is

A real-time recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, product concepts, orders, kitchen production, and inventory with full versioning, cost calculations, and margin analysis. Shipped v1.0 cleanup milestone resolving 41 concerns across security, performance, schema, testing, UI brand, and factories.

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

### Active

(Fresh for next milestone — define via `/gsd:new-milestone`)

### Out of Scope

- PIN hash migration to bcrypt/scrypt — SHA256 acceptable for 6-digit PINs with rate limiting on internal tool
- Moving to HTTP-only cookies or Convex Auth — token-in-args pattern acceptable for internal tool
- Error monitoring integration (Sentry/LogRocket) — separate initiative
- Archival strategy for old orders — separate initiative after backup automation is in place

## Context

Shipped v1.0 with 92,416 lines of TypeScript across 37 Convex tables.
Tech stack: Convex 1.31 + React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4 + shadcn/ui.
Deployed via Vercel with GitHub Actions CI.

**Current state after v1.0:**
- All 41 codebase concerns resolved or explicitly accepted
- Test coverage: ball distribution (25 tests), FIFO inventory (20 tests), order lifecycle (30 tests), vouchers (15 tests), plus existing status transitions (51 tests)
- Schema: 37 tables, all optional fields audited, denormalization documented
- UI: 19 pages unified under teal brand with dark mode, skeleton screens, mobile-first layout
- Frontend: EntityManager factory covers 5 simple CRUD entities; createMutationHook factory for typed hooks
- Backend: protectedMutation wrappers on simple entities; query helpers for list/getById/textSearch
- Performance: cursor pagination, indexed kitchen queries, cached COGS
- Infrastructure: weekly integrity checks, dependency audit complete

**Known technical debt:**
- K3 Mart cockpit queries are placeholder stubs (K3MART-01 through K3MART-06)
- E2E Playwright tests not yet written
- Generic query factory not applied to all 31 query files (only simple entities)
- protectedMutation not applied to complex entities (orders, recipes, products)
- `useConvex` prefix not removed from hook names (cosmetic, deferred)

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

---
*Last updated: 2026-02-15 after v1.0 milestone*

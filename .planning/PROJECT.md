# Frollie Recipe Master — Concerns Cleanup & Refactor

## What This Is

A comprehensive cleanup and refactoring effort for Frollie Recipe Master, an existing real-time recipe and product concept management system for an Indonesian FMCG snack company. This milestone addresses every concern identified during codebase mapping — tech debt, bugs, security gaps, performance bottlenecks, missing tests, redundant code, and schema issues — while building shared abstractions to reduce future maintenance burden.

## Core Value

Every concern in CONCERNS.md is resolved or explicitly accepted, the build passes, and no existing features regress.

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

### Active

**Tech Debt:**
- [ ] Complete BOM migration — remove all reads/writes to deprecated `productionType`/`productionUnits` fields on menuProducts and orderItems
- [ ] Remove deprecated order statuses (`ProductionComplete`, `Packaging`) from UI mappings; keep in schema for historical data only
- [ ] Replace hardcoded `"current-user"` with actual authenticated username from AuthContext in all inventory mutations
- [ ] Remove old `KitchenView.tsx` entirely — V2 is production-ready
- [ ] Remove `convex/orders/mutations.ts` shim — update all imports to use domain-specific mutation files directly
- [ ] Audit and remove redundant single-field indexes covered by compound indexes

**Known Bugs:**
- [ ] Fix stock shortage override dialog — add proper UI confirmation step when inventory is insufficient
- [ ] Resolve all TODO comments in production code (K3MartCockpit, OrderDetail, ingredient/material cost invalidation)

**Security:**
- [ ] Audit committed env files — move sensitive config out of version control, keep only `.env.example` template
- [ ] Token-in-args pattern: document as acceptable for internal tool (no code change needed)
- [ ] PIN hashing: SHA256 accepted for 6-digit PINs with rate limiting (no migration needed)

**Performance:**
- [ ] Add pagination to large queries in `externalData/queries.ts` (take/offset pattern with date range filters)
- [ ] Fix N+1 query pattern in `orders/queries.ts` — batch fetch items and customers, then merge
- [ ] Optimize kitchen queries — add compound index or denormalized `isKitchenVisible` field
- [ ] Cache COGS on `menuProducts.unitCost` — invalidate on component changes

**Test Coverage:**
- [ ] Write unit tests for ball distribution algorithm (`ballDistribution.ts`, 342 lines, zero tests)
- [ ] Write isolated FIFO tests for `convex/inventory/fifo.ts` batch selection logic
- [ ] Expand cost calculator BOM tests for complex multi-category component structures
- [ ] Add tests for K3 Mart adapter retry logic and error handling
- [ ] Add basic E2E tests for critical form submission flows

**Redundant Code — Generic Factories:**
- [ ] Create generic query factory (`makeEntityQueries`) and migrate all 31 query files
- [ ] Create generic hook factory (`makeEntityHooks`) and migrate all 21 hook files
- [ ] Create protected mutation wrapper (`protectedMutation`) and apply to all 27 mutation files
- [ ] Create generic `<EntityManager>` CRUD UI component and migrate IngredientsManager, MaterialsManager, CustomersManager
- [ ] Consolidate production tracking — make `productionCounts` derived from `productionLog` sums

**Database Schema:**
- [ ] Audit 167 `v.optional()` fields — require fields that should always exist, set defaults in mutations
- [ ] Document denormalization pattern as intentional for historical snapshots (no code change — add schema comments)
- [ ] Remove confirmed unused tables/fields (`menuProducts.isFixed`, `kitchenInventory` table)
- [ ] Remove deprecated `by_production_type` index on orderItems after BOM migration

**Infrastructure:**
- [ ] Set up automated Convex database backup (scheduled export)
- [ ] Audit and upgrade Convex SDK to latest compatible 1.x
- [ ] Verify React 19 compatibility across all dependencies
- [ ] Verify Tailwind CSS 4 migration completeness

### Out of Scope

- PIN hash migration to bcrypt/scrypt — SHA256 acceptable for 6-digit PINs with rate limiting on internal tool
- Moving to HTTP-only cookies or Convex Auth — token-in-args pattern acceptable for internal tool
- Error monitoring integration (Sentry/LogRocket) — separate initiative
- APM / performance metrics — Convex dashboard has basic metrics
- Archival strategy for old orders — separate initiative after backup automation is in place
- Frontend image compression for feedback screenshots — low priority
- New feature development — this milestone is cleanup only

## Context

Frollie Recipe Master is a production system actively used by kitchen staff, order staff, managers, and admins at an Indonesian FMCG snack company. It runs on Convex (serverless real-time backend) + React 19 + TypeScript + Vite, deployed via Vercel with GitHub Actions CI.

A codebase mapping exercise (2026-02-13) identified 40+ concerns across 11 categories. This milestone systematically addresses all of them while introducing shared abstractions (generic factories) to reduce the ~2000+ lines of duplicate code across queries, hooks, mutations, and CRUD UI components.

**Key risk:** The generic factory refactoring touches 80+ files across the entire codebase. It must be phased carefully — backend factories first (queries, mutations), then frontend (hooks, UI) — with build verification at each step.

**Existing test coverage:** Status transitions (51 tests), WhatsApp templates, inventory helpers, cost calculator BOM. Gaps in ball distribution, FIFO logic, K3 Mart adapter, and E2E flows.

## Constraints

- **Tech Stack**: Convex + React 19 + TypeScript + Vite — no stack changes
- **Zero Downtime**: Production system — changes must not break existing features
- **Backward Compatibility**: Schema changes must handle existing data (migrations where needed)
- **Build Gate**: `npm run build` must pass after every phase
- **Git Workflow**: Feature branches, no direct commits to main

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep SHA256 for PIN hashing | 6-digit PINs with rate limiting sufficient for internal tool | — Pending |
| Kill old KitchenView.tsx | V2 is production-ready, maintaining two UIs causes confusion | — Pending |
| Build generic factories (queries, hooks, mutations, UI) | 2000+ lines of duplicate code, high maintenance burden | — Pending |
| Consolidate productionCounts to log-derived | Dual-write system risks inconsistency | — Pending |
| Include dependency upgrades | Staying current reduces future migration pain | — Pending |
| Include automated backup | Production data at risk without it | — Pending |

---
*Last updated: 2026-02-13 after initialization*

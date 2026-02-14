# Roadmap: Frollie Recipe Master — Concerns Cleanup & Refactor

**Created:** 2026-02-13
**Milestone:** Concerns Cleanup & Refactor
**Phases:** 11
**Requirements:** 41 mapped

---

## Phase Overview

| # | Phase | Goal | Requirements | Status |
|---|-------|------|--------------|--------|
| 1 | Test Infrastructure | Critical business logic has comprehensive test coverage before any refactoring begins | 4 | Complete (2026-02-13) |
| 2 | Quick Fixes — Security & Docs | All security concerns resolved and documentation-only items completed | 3 | Complete (2026-02-13) |
| 3 | Quick Fixes — Tech Debt | Deprecated code, dead files, and redundant indexes removed from the codebase | 5 | Complete (2026-02-13) |
| 4 | Quick Fixes — Bugs | All known bugs fixed and TODO comments resolved | 2 | Complete (2026-02-13) |
| 5 | Backend Factories | Shared auth wrappers and query helpers established, proven on simple domains | 4 | Complete (2026-02-13) |
| 6 | BOM Migration | All ball composition reads/writes use BOM as single source of truth; deprecated fields retained only for historical data | 6 | Complete (2026-02-14) |
| 7 | Query Optimization | N+1 patterns eliminated, large queries paginated, kitchen queries indexed, COGS cached | 4 | Complete (2026-02-14) |
| 8 | Schema Cleanup | Optional fields audited and tightened, unused tables/fields removed, denormalization documented | 4 | Complete (2026-02-14) |
| 9 | UI Brand Consolidation | Brand/UI reference established, all 19 pages audited and consistent (margins, fonts, colors, spacing, responsive) | 2 | Pending |
| 10 | Frontend Factories | Generic hook and component factories applied to simple CRUD entities, reducing ~2,300 lines of boilerplate | 4 | Pending |
| 11 | Infrastructure & Consolidation | Automated backups configured, dependencies audited, production counts consolidated | 3 | Pending |

---

## Phase Details

### Phase 1: Test Infrastructure
**Goal:** Every critical business logic module (ball distribution, FIFO inventory, order lifecycle, voucher handling) has comprehensive unit/integration tests providing a safety net for all subsequent refactoring.
**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04
**Dependencies:** None
**Plans:** 4 plans (Wave 1: all parallel)

Plans:
- [x] 01-01-PLAN.md — Ball distribution algorithm tests (priority, partial fills, ghost ball prevention)
- [x] 01-02-PLAN.md — FIFO inventory consumption tests (oldest-first, expiry, batch depletion)
- [x] 01-03-PLAN.md — Order lifecycle integration tests (status transitions, inventory, cancellation)
- [x] 01-04-PLAN.md — Voucher handling tests (discounts, validation, expiry, usage limits)

**Success Criteria:**
1. `ballDistribution.ts` has tests covering allocation to multi-product orders, partial fills, tray exhaustion, priority ordering, and auto-status transitions
2. `fifo.ts` has tests covering oldest-first batch selection, partial batch depletion, batch boundary cases, and empty inventory edge case
3. Order lifecycle integration tests cover create -> status transitions -> inventory reservation -> consumption -> cancellation rollback as a complete chain
4. `voucherHandling.ts` has tests covering percentage discounts, fixed discounts, minimum order thresholds, and expired voucher rejection
5. `npm run test` passes with all new tests included

**Estimated scope:** 4 test files, ~600-800 lines of test code, zero production code changes

---

### Phase 2: Quick Fixes — Security & Docs
**Goal:** All security concerns (exposed env files, token pattern, PIN hashing) are resolved or formally documented as accepted, with no sensitive configuration remaining in version control.
**Requirements:** SEC-01, SEC-02, SEC-03
**Dependencies:** None (can run in parallel with Phase 1)
**Plans:** 2 plans (Wave 1: local cleanup + docs, Wave 2: history scrub + rotation)

Plans:
- [x] 02-01-PLAN.md — Gitignore fix, env file untracking, .env.example update, SECURITY.md creation
- [x] 02-02-PLAN.md — Git history scrub with git-filter-repo, secrets scan, credential rotation

**Success Criteria:**
1. `.env` and `.env.local.production` removed from git tracking; only `.env.example` template remains committed
2. `docs/SECURITY.md` or inline code comments document token-in-args as an accepted pattern for internal tool with rationale
3. `docs/SECURITY.md` or inline code comments document SHA256 PIN hashing as accepted for 6-digit PINs with rate limiting, with rationale
4. `git log` shows sensitive files removed from history (or `.gitignore` updated to prevent future commits)

**Estimated scope:** 3-5 files modified, documentation additions, gitignore updates

---

### Phase 3: Quick Fixes — Tech Debt
**Goal:** All straightforward tech debt items (hardcoded usernames, dead code, deprecated status mappings, shim files, redundant indexes) are cleaned up in a single focused phase.
**Requirements:** QFIX-01, QFIX-02, QFIX-03, QFIX-04, QFIX-05
**Dependencies:** None (can run in parallel with Phases 1-2)
**Plans:** 4 plans (Wave 1: 03-01, 03-02, 03-03 parallel; Wave 2: 03-04)

Plans:
- [x] 03-01-PLAN.md — Replace hardcoded "current-user" + delete KitchenView V1 (QFIX-01, QFIX-02)
- [x] 03-02-PLAN.md — Deprecated order status UI mapping cleanup (QFIX-04)
- [x] 03-03-PLAN.md — Index audit and removal (QFIX-05)
- [x] 03-04-PLAN.md — Remove orders/mutations.ts shim and update all callers (QFIX-03)

**Success Criteria:**
1. `"current-user"` string does not appear in any inventory mutation — all inventory operations use the authenticated username from AuthContext
2. `KitchenView.tsx` file is deleted; route in `App.tsx` points directly to `KitchenViewV2`
3. `convex/orders/mutations.ts` shim file is removed; all 19+ frontend imports updated to reference domain-specific mutation files (`orderCrud.ts`, `inventoryIntegration.ts`, etc.)
4. `ProductionComplete` and `Packaging` status values no longer appear in any UI status display (badges, colors, labels) — mapped to `Boxed` and `InProduction` respectively. Deprecated statuses remain as filter options for accounting/sales review. Schema validator keeps both values for historical data integrity.
5. Index audit document lists all removed indexes with justification; `npm run build` passes after removal

**Estimated scope:** 25-30 files modified across frontend and backend

---

### Phase 4: Quick Fixes — Bugs
**Goal:** Both known bugs (stock shortage dialog, unresolved TODOs) are fixed, ensuring no untracked issues remain in production code.
**Requirements:** BUG-01, BUG-02
**Dependencies:** Phase 3 (QFIX-03 removes mutations shim that BUG-02 TODO references may depend on)
**Plans:** 2 plans (Wave 1: both parallel)

Plans:
- [x] 04-01-PLAN.md — Stock shortage override dialog fix with English UX, reason requirement, expanded roles, audit trail (BUG-01)
- [x] 04-02-PLAN.md — TODO resolution: cost invalidation schedulers, production records query, K3Mart backlog conversion (BUG-02)

**Success Criteria:**
1. Stock shortage override dialog shows a clear confirmation step with warning message, override button, and cancel option when inventory is insufficient for an order
2. Zero `TODO` comments remain in production code (`src/` and `convex/` directories) — each is either resolved with code or converted to a tracked issue in REQUIREMENTS.md v2 section
3. `npm run build` passes with all bug fixes applied

**Estimated scope:** 5-10 files modified

---

### Phase 5: Backend Factories
**Goal:** `convex-helpers` auth wrappers and common query helper functions are established and proven across simple entity mutations, eliminating boilerplate and adding session-based auth where none existed.
**Requirements:** FACT-01, FACT-02, FACT-03, FACT-04
**Dependencies:** Phase 1 (tests must exist before refactoring mutation files)
**Plans:** 3 plans (Wave 1: 05-01 foundation; Wave 2: 05-02, 05-03 parallel entity migrations)

Plans:
- [x] 05-01-PLAN.md — Install convex-helpers, create auth wrappers + query helpers + test helper, integrate SessionProvider
- [x] 05-02-PLAN.md — Migrate ingredients, materials, tags (backend + frontend + tests)
- [x] 05-03-PLAN.md — Migrate customers, storageLocations, shipping (backend + frontend)

**Success Criteria:**
1. `convex-helpers` is installed and `convex/lib/functions.ts` exports `protectedMutation`/`protectedQuery`/`publicMutation`/`publicQuery` wrappers with auth enforcement
2. Simple entity mutations (ingredients, materials, tags, customers, storageLocations) use `protectedMutation` wrapper — session-based auth with per-mutation role enforcement
3. Common query helper functions (`listAll`, `getById`, `textSearch`) exist in `convex/lib/queryHelpers.ts` and are used by at least 4 entity query files
4. Simple entity mutation files (5 user-facing entities) use `protectedMutation` wrapper consistently; shipping documented as internal system pattern
5. Frontend hooks for 5 user-facing entities use `useSessionMutation` with SessionProvider integration
6. `npm run build` passes; existing tests still pass; `_generated/api.d.ts` types are preserved (no `any` leaks)

**Estimated scope:** 18 files modified/created (6 backend mutations, 6 backend queries, 5 frontend hooks, 1 test file) + 3 new lib files + 1 test helper

---

### Phase 6: BOM Migration
**Goal:** All ball composition data flows through BOM (`menuProductComponents` + `componentTypes`) as the single source of truth; deprecated `productionType`/`productionUnits` fields are retained as `v.optional()` for historical data only.
**Requirements:** BOM-01, BOM-02, BOM-03, BOM-04, BOM-05, BOM-06
**Dependencies:** Phase 1 (tests for ball distribution, order lifecycle), Phase 5 (backend factories simplify mutation files before migration)
**Success Criteria:**
1. All backend query files read ball composition from BOM first, with fallback to deprecated fields only for orders created before the migration cutoff date
2. No mutation file writes `productionType` or `productionUnits` to `menuProducts` or `orderItems` — grep for these field writes returns zero results in mutation files
3. All 19 frontend files that previously read `productionType`/`productionUnits` now use BOM-derived data — grep for these field reads in `src/` returns zero results (except type definitions with DEPRECATED comments)
4. `productionType` and `productionUnits` fields on `menuProducts` and `orderItems` in `schema.ts` are marked `v.optional()` with `// DEPRECATED` comments
5. `by_production_type` index on `orderItems` is removed from schema
6. Backfill migration has been run: every `menuProduct` has at least one corresponding entry in `menuProductComponents` with `category="production"`

**Plans:** 3 plans (Wave 1: 06-01; Wave 2: 06-02; Wave 3: 06-03)

Plans:
- [x] 06-01-PLAN.md — BOM-06 backfill migration + verification query
- [x] 06-02-PLAN.md — BOM-01 dual-read backend queries + BOM-02 stop writing deprecated fields
- [x] 06-03-PLAN.md — BOM-03 frontend migration + BOM-04 schema changes + BOM-05 documentation

**Migration sequence (must follow exactly):**
1. Deploy: BOM-06 backfill migration (ensure BOM data exists) [Plan 01]
2. Deploy: BOM-01 dual-read (BOM first, fallback to deprecated) [Plan 02]
3. Deploy: BOM-02 stop writing deprecated fields [Plan 02]
4. Deploy: BOM-03 frontend migration to BOM reads [Plan 03]
5. Deploy: BOM-04 mark fields as optional/deprecated in schema [Plan 03]
6. Deploy: BOM-05 remove deprecated index — ALREADY DONE (QFIX-05, Phase 3) [Plan 03 documents]

**Estimated scope:** ~15 files modified (6 frontend + 8 backend + 1 schema), 2 migration functions, 3 sequential plans

---

### Phase 7: Query Optimization
**Goal:** N+1 query patterns in orders and dashboard are eliminated, large external data queries are paginated, kitchen queries use proper indexes, and COGS is cached for fast product lookups.
**Requirements:** PERF-01, PERF-02, PERF-03, PERF-04
**Dependencies:** Phase 6 (BOM migration simplifies order queries before optimization)
**Success Criteria:**
1. `orders/queries.ts::list()` uses parallel indexed lookups (`Promise.all` with `by_order` index) instead of loading all order items into memory — verified by code review
2. `externalData/queries.ts` uses `take()`/offset pagination with date range filters — no unbounded `.collect()` calls remain
3. Kitchen queries use either a compound index on order status fields or a denormalized `isKitchenVisible` boolean — query plan avoids multi-status loop
4. `menuProducts` table has a `unitCost` field that caches COGS; it is recalculated when component prices change via a trigger or explicit invalidation
5. `npm run build` passes; existing tests still pass

**Plans:** 3 plans (Wave 1: 07-01; Wave 2: 07-02, 07-03 parallel)

Plans:
- [ ] 07-01-PLAN.md — N+1 query fixes + kitchen denormalization (isKitchenVisible) + dashboard optimization (PERF-01, PERF-03)
- [ ] 07-02-PLAN.md — COGS caching with eager recalculation + stale indicator + recalculate-all button (PERF-04)
- [ ] 07-03-PLAN.md — Cursor-based pagination with Load More for orders, inventory, production log, external data (PERF-02)

**Estimated scope:** ~15 files modified, 2 new schema fields, 1 new index, 4 new paginated queries

---

### Phase 8: Schema Cleanup
**Goal:** All 215 `v.optional()` fields are audited and categorized, fields that should be required are tightened, deprecated fields (productionType, productionUnits, isFixed) are removed, and denormalization is documented.
**Requirements:** SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04
**Dependencies:** Phase 6 (BOM migration must complete before deprecated field cleanup in schema), Phase 7 (new schema fields from PERF-04 should be included in audit)
**Plans:** 4 plans (Wave 1: 08-01, 08-02 parallel; Wave 2: 08-03; Wave 3: 08-04)

Plans:
- [ ] 08-01-PLAN.md -- Field audit document (SCHEMA_AUDIT.md) + denormalization comments in schema.ts + SCHEMA.md summary (SCHEMA-01, SCHEMA-04)
- [ ] 08-02-PLAN.md -- Remove all deprecated field code references + isFixed replacement + dead hook deletion (SCHEMA-03 prep)
- [ ] 08-03-PLAN.md -- Backfill + cleanup migration mutations for all Category B and C fields (SCHEMA-02, SCHEMA-03 data prep)
- [ ] 08-04-PLAN.md -- Schema tightening (optional->required) + deprecated field removal from schema (SCHEMA-02, SCHEMA-03)

**Success Criteria:**
1. Audit document exists listing all 215 `v.optional()` fields categorized as: (a) legitimately optional, (b) safe to make required, (c) deprecated/remove, (d) table-level assessment
2. Category (b) fields are changed to required in schema after backfill; deploy succeeds without data rejection
3. `menuProducts.isFixed`, `menuProducts.productionType`, `menuProducts.productionUnits`, `orderItems.productionType`, `orderItems.productionUnits` removed from schema (kitchenInventory table KEPT -- actively used)
4. Schema file has inline comments on all ~50 denormalized fields using SNAPSHOT/CACHE/DERIVED categories

**Two-step deploy pipeline:**
1. Deploy 1: Run backfill + cleanup migrations from dashboard (Plan 03)
2. Deploy 2: Tighten schema + remove fields (Plan 04)

**Estimated scope:** `schema.ts` heavily modified, 9 migration mutations, 2 sequential deploys, 7+ backend/frontend files cleaned

---

### Phase 9: UI Brand Consolidation
**Goal:** A universal brand/UI architecture reference is established and enforced across all 19 pages — consistent fonts, colors, spacing, margins, responsive layout, header/footer patterns, and mobile navigation. All UI work uses the `/frontend-design` skill.
**Requirements:** BRAND-01, BRAND-02
**Dependencies:** Phase 7 (query optimization complete — codebase stable for visual audit)
**Success Criteria:**
1. Brand/UI reference document exists (`docs/UI_BRAND_REFERENCE.md`) covering: color palette, typography, spacing scale, margin rules, component patterns, page layout conventions, dark mode tokens
2. All 19 pages audited for UI inconsistencies — every page uses consistent left margins, fonts, colors, and spacing per the brand reference
3. Pages with missing left margins are fixed to match the standard layout
4. Header/footer/mobile-nav components implemented per brand reference
5. `npm run build` passes; no visual or behavioral regression
6. All UI changes reviewed through the `/frontend-design` skill for design quality

**Estimated scope:** 1 brand reference doc, 4+ layout components (header, footer, mobile nav, page container), 19 pages audited, 10+ pages adjusted

---

### Phase 10: Frontend Factories
**Goal:** Generic hook and UI component factories are created and applied to all simple CRUD entities, reducing frontend boilerplate by ~2,300 lines. Factories follow the brand reference established in Phase 9. All UI work uses the `/frontend-design` skill.
**Requirements:** FHOOK-01, FHOOK-02, FUI-01, FUI-02
**Dependencies:** Phase 5 (backend factory patterns established), Phase 8 (schema finalized before building generic components), Phase 9 (brand reference established — factories must follow it)
**Success Criteria:**
1. `src/hooks/convex/createMutationHook.ts` exports a generic factory that produces typed mutation hooks with toast notifications
2. Simple entity hooks (ingredients, materials, tags, customers, locations) use the factory — each hook file is ~15 lines instead of ~115 lines
3. `src/components/shared/EntityManager.tsx` exports a generic CRUD component with pluggable columns, forms, and validation
4. IngredientsManager, MaterialsManager, CustomersManager, and LocationsManager pages use `EntityManager` — each page file shrinks by ~60%
5. `npm run build` passes; all entity CRUD operations work identically to before (no visual or behavioral regression)
6. All UI changes reviewed through the `/frontend-design` skill for design quality

**Estimated scope:** 2 new factory files, 10+ hook files simplified, 4 page files simplified

---

### Phase 11: Infrastructure & Consolidation
**Goal:** Automated database backups are running, all dependency compatibility is verified, and production counts use a single source of truth.
**Requirements:** INFRA-01, INFRA-02, INFRA-03
**Dependencies:** Phase 1 (tests needed for productionCounts consolidation), Phase 6 (BOM migration complete), Phase 8 (schema finalized)
**Success Criteria:**
1. Convex scheduled function runs automated database export on a configured schedule (daily or weekly); export logs confirm successful runs
2. Dependency audit document lists all packages with versions, confirms compatibility (React 19 + Convite 7 + Convex 1.31 + TypeScript 5.9), and flags any deprecation warnings
3. `productionCounts` table reads are replaced with `productionLog`-derived aggregates; dual-write to `productionCounts` is removed; kitchen page shows identical data to before consolidation
4. `npm run build` passes; kitchen production workflow is verified end-to-end

**Risk note:** INFRA-03 (productionCounts consolidation) is HIGH RISK per research. If kitchen performance degrades due to log aggregation, fall back to maintaining `productionCounts` as a materialized view updated by a Convex scheduled function.

**Estimated scope:** 1 scheduled function, 1 audit document, 5-8 files modified for production counts consolidation

---

## Phase Dependencies Graph

```
Phase 1 (Tests) ──────────────────┐
                                   ├──> Phase 5 (Backend Factories) ──> Phase 6 (BOM Migration) ──┐
Phase 2 (Security) ───(parallel)───┘                                                               │
                                                                                                    ├──> Phase 7 (Query Opt) ──┬──> Phase 8 (Schema Cleanup) ──┐
Phase 3 (Tech Debt) ──> Phase 4 (Bugs)                                                             │                          │                               │
                                                                                                    │                          └──> Phase 9 (UI Brand) ────────┤
                                                                                                    │                                                          ├──> Phase 10 (Frontend Factories)
                                                                                                    │                                                          │
                                                                                                    └──────────────────────────────────────────────────────────> Phase 11 (Infrastructure)
```

**Parallel opportunities:**
- Phases 1, 2, 3 can run in parallel (independent concerns)
- Phase 4 depends only on Phase 3
- Phase 5 depends only on Phase 1
- Phases 8 and 9 can run in parallel after Phase 7
- Phase 10 depends on both Phases 8 and 9

---

## Requirement Coverage

| Requirement | Phase | Description |
|-------------|-------|-------------|
| TEST-01 | 1 | Ball distribution algorithm unit tests |
| TEST-02 | 1 | FIFO inventory consumption unit tests |
| TEST-03 | 1 | Order lifecycle integration tests |
| TEST-04 | 1 | Voucher handling unit tests |
| SEC-01 | 2 | Environment variable audit and cleanup |
| SEC-02 | 2 | Token-in-args pattern documentation |
| SEC-03 | 2 | PIN hashing documentation |
| QFIX-01 | 3 | Replace hardcoded "current-user" with AuthContext |
| QFIX-02 | 3 | Remove old KitchenView.tsx |
| QFIX-03 | 3 | Remove orders/mutations.ts shim |
| QFIX-04 | 3 | Remove deprecated order status UI mappings |
| QFIX-05 | 3 | Audit and remove redundant indexes |
| BUG-01 | 4 | Fix stock shortage override dialog |
| BUG-02 | 4 | Resolve all TODO comments in production code |
| FACT-01 | 5 | Install convex-helpers, create auth wrappers |
| FACT-02 | 5 | Migrate simple entity mutations to customMutation |
| FACT-03 | 5 | Create common query helper functions |
| FACT-04 | 5 | Apply protectedMutation to 5 user-facing simple entities; document shipping as internal pattern |
| BOM-01 | 6 | Backend queries read ball composition from BOM |
| BOM-02 | 6 | Mutations stop writing deprecated fields |
| BOM-03 | 6 | Frontend migrated to BOM-derived data |
| BOM-04 | 6 | Deprecated fields marked optional with comments |
| BOM-05 | 6 | Deprecated by_production_type index removed |
| BOM-06 | 6 | Backfill migration for menuProduct BOM entries |
| PERF-01 | 7 | Fix N+1 in orders/queries.ts |
| PERF-02 | 7 | Paginate externalData queries |
| PERF-03 | 7 | Optimize kitchen queries with index |
| PERF-04 | 7 | Cache COGS on menuProducts.unitCost |
| SCHEMA-01 | 8 | Audit 167 v.optional() fields |
| SCHEMA-02 | 8 | Make safe-to-require fields required |
| SCHEMA-03 | 8 | Remove unused tables/fields |
| SCHEMA-04 | 8 | Document denormalization patterns |
| BRAND-01 | 9 | Brand/UI reference document with component-level guidelines |
| BRAND-02 | 9 | 19-page UI audit and consistency fixes (margins, fonts, colors, spacing, responsive) |
| FHOOK-01 | 10 | Create generic createMutationHook factory |
| FHOOK-02 | 10 | Migrate simple entity hooks to factory |
| FUI-01 | 10 | Create generic EntityManager component |
| FUI-02 | 10 | Migrate simple CRUD pages to EntityManager |
| INFRA-01 | 11 | Automated Convex database backup |
| INFRA-02 | 11 | Dependency compatibility audit |
| INFRA-03 | 11 | Production counts consolidation |

**Coverage: 41/41 (100%)**

---

## Risk Summary

| Phase | Risk Level | Key Risk | Mitigation |
|-------|------------|----------|------------|
| 1 | LOW | Additive only, no production changes | N/A |
| 2 | LOW | Git history rewrite for env files | Use .gitignore, avoid force-push |
| 3 | LOW | Import breakage from shim removal | Build verification after each change |
| 4 | LOW | UI behavior change in shortage dialog | Manual QA testing |
| 5 | MEDIUM | Type safety loss from factories | Use composition not runtime generation |
| 6 | HIGH | Dual tracking inconsistency, schema deploy rejection | Strangler fig pattern, 5-step schema sequence |
| 7 | MEDIUM | Query behavior changes visible to users | Performance benchmarking before/after |
| 8 | MEDIUM | Schema deploy rejection on field tightening | Dev environment testing, batched deploys |
| 9 | LOW | Frontend-only, no backend impact | Visual regression testing |
| 10 | LOW | Frontend-only, no backend impact | Visual regression testing |
| 11 | HIGH | productionCounts consolidation performance | Fallback to materialized view if slow |

---

*Roadmap created: 2026-02-13*
*Next action: Begin Phase 1 (Test Infrastructure)*

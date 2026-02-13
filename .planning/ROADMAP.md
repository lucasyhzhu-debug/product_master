# Roadmap: Frollie Recipe Master — Concerns Cleanup & Refactor

**Created:** 2026-02-13
**Milestone:** Concerns Cleanup & Refactor
**Phases:** 10
**Requirements:** 39 mapped

---

## Phase Overview

| # | Phase | Goal | Requirements | Status |
|---|-------|------|--------------|--------|
| 1 | Test Infrastructure | Critical business logic has comprehensive test coverage before any refactoring begins | 4 | Pending |
| 2 | Quick Fixes — Security & Docs | All security concerns resolved and documentation-only items completed | 3 | Pending |
| 3 | Quick Fixes — Tech Debt | Deprecated code, dead files, and redundant indexes removed from the codebase | 5 | Pending |
| 4 | Quick Fixes — Bugs | All known bugs fixed and TODO comments resolved | 2 | Pending |
| 5 | Backend Factories | Shared auth wrappers and query helpers established, proven on simple domains | 4 | Pending |
| 6 | BOM Migration | All ball composition reads/writes use BOM as single source of truth; deprecated fields retained only for historical data | 6 | Pending |
| 7 | Query Optimization | N+1 patterns eliminated, large queries paginated, kitchen queries indexed, COGS cached | 4 | Pending |
| 8 | Schema Cleanup | Optional fields audited and tightened, unused tables/fields removed, denormalization documented | 4 | Pending |
| 9 | Frontend Factories | Generic hook and UI component factories created and applied to simple CRUD entities | 4 | Pending |
| 10 | Infrastructure & Consolidation | Automated backups configured, dependencies audited, production counts consolidated | 3 | Pending |

---

## Phase Details

### Phase 1: Test Infrastructure
**Goal:** Every critical business logic module (ball distribution, FIFO inventory, order lifecycle, voucher handling) has comprehensive unit/integration tests providing a safety net for all subsequent refactoring.
**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04
**Dependencies:** None
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
**Success Criteria:**
1. `"current-user"` string does not appear in any inventory mutation — all inventory operations use the authenticated username from AuthContext
2. `KitchenView.tsx` file is deleted; route in `App.tsx` points directly to `KitchenViewV2`
3. `convex/orders/mutations.ts` shim file is removed; all 19+ frontend imports updated to reference domain-specific mutation files (`orderCrud.ts`, `inventoryIntegration.ts`, etc.)
4. `ProductionComplete` and `Packaging` status values no longer appear in any UI status mapping, color mapping, or filter — only in schema validator for historical data
5. Index audit document lists all removed indexes with justification; `npm run build` passes after removal

**Estimated scope:** 25-30 files modified across frontend and backend

---

### Phase 4: Quick Fixes — Bugs
**Goal:** Both known bugs (stock shortage dialog, unresolved TODOs) are fixed, ensuring no untracked issues remain in production code.
**Requirements:** BUG-01, BUG-02
**Dependencies:** Phase 3 (QFIX-03 removes mutations shim that BUG-02 TODO references may depend on)
**Success Criteria:**
1. Stock shortage override dialog shows a clear confirmation step with warning message, override button, and cancel option when inventory is insufficient for an order
2. Zero `TODO` comments remain in production code (`src/` and `convex/` directories) — each is either resolved with code or converted to a tracked issue in REQUIREMENTS.md v2 section
3. `npm run build` passes with all bug fixes applied

**Estimated scope:** 5-10 files modified

---

### Phase 5: Backend Factories
**Goal:** `convex-helpers` auth wrappers and common query helper functions are established and proven across all mutation files, eliminating repeated `requireRole` boilerplate.
**Requirements:** FACT-01, FACT-02, FACT-03, FACT-04
**Dependencies:** Phase 1 (tests must exist before refactoring mutation files)
**Success Criteria:**
1. `convex-helpers` is installed and `convex/lib/functions.ts` exports `customMutation`/`customQuery` wrappers with auth enforcement
2. Simple entity mutations (ingredients, materials, tags, customers) use `customMutation` wrapper — no direct `requireRole` calls remain in those files
3. Common query helper functions (`listAll`, `getById`, `getByField`) exist in `convex/lib/queryHelpers.ts` and are used by at least 4 entity query files
4. All 27 mutation files use `protectedMutation` wrapper consistently — grep for raw `requireRole` in mutation handlers returns zero results (except the wrapper definition itself)
5. `npm run build` passes; existing tests still pass; `_generated/api.d.ts` types are preserved (no `any` leaks)

**Estimated scope:** 30-40 files modified (all mutation + query files), 2 new library files

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

**Migration sequence (must follow exactly):**
1. Deploy: BOM-06 backfill migration (ensure BOM data exists)
2. Deploy: BOM-01 dual-read (BOM first, fallback to deprecated)
3. Deploy: BOM-02 stop writing deprecated fields
4. Deploy: BOM-03 frontend migration to BOM reads
5. Deploy: BOM-04 mark fields as optional/deprecated in schema
6. Deploy: BOM-05 remove deprecated index

**Estimated scope:** 29+ files modified (19 frontend + 10 backend), 1 migration mutation, 3-6 sequential deploys

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

**Estimated scope:** 5-8 files modified, 1-2 new indexes in schema, possible 1 schema field addition

---

### Phase 8: Schema Cleanup
**Goal:** All 167 `v.optional()` fields are audited and categorized, fields that should be required are tightened, unused tables/fields are removed, and denormalization is documented.
**Requirements:** SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04
**Dependencies:** Phase 6 (BOM migration must complete before deprecated field cleanup in schema), Phase 7 (new schema fields from PERF-04 should be included in audit)
**Success Criteria:**
1. Audit document exists listing all 167 `v.optional()` fields categorized as: (a) legitimately optional, (b) safe to make required, (c) needs backfill before requiring
2. Category (b) fields — where every existing document has the value — are changed to required in schema; deploy succeeds without data rejection
3. `menuProducts.isFixed` field and `kitchenInventory` table are removed from schema (with proper migration sequence: stop reads/writes, null out data, remove from schema)
4. Schema file has inline comments on all intentional denormalization patterns (e.g., `orderItems.productName` snapshot, `orderItems.unitPrice` snapshot) explaining why they exist

**Migration sequence for removals:**
1. Verify no code reads/writes `menuProducts.isFixed` or `kitchenInventory`
2. Run migration to null out `isFixed` values
3. Deploy schema without the field/table

**Estimated scope:** `schema.ts` heavily modified, 5-10 migration mutations, 2-4 sequential deploys

---

### Phase 9: Frontend Factories
**Goal:** Generic hook and UI component factories are created and applied to all simple CRUD entities, reducing frontend boilerplate by ~2,300 lines.
**Requirements:** FHOOK-01, FHOOK-02, FUI-01, FUI-02
**Dependencies:** Phase 5 (backend factory patterns established), Phase 6 (BOM migration complete so hooks read correct data), Phase 8 (schema finalized before building generic components)
**Success Criteria:**
1. `src/hooks/convex/createMutationHook.ts` exports a generic factory that produces typed mutation hooks with toast notifications
2. Simple entity hooks (ingredients, materials, tags, customers, locations, vouchers) use the factory — each hook file is ~15 lines instead of ~115 lines
3. `src/components/shared/EntityManager.tsx` exports a generic CRUD component with pluggable columns, forms, and validation
4. IngredientsManager, MaterialsManager, CustomersManager, and LocationsManager pages use `EntityManager` — each page file shrinks by ~60%
5. `npm run build` passes; all entity CRUD operations work identically to before (no visual or behavioral regression)

**Estimated scope:** 2 new factory files, 10+ hook files simplified, 4 page files simplified

---

### Phase 10: Infrastructure & Consolidation
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
                                                                                                    ├──> Phase 7 (Query Opt) ──> Phase 8 (Schema Cleanup) ──┐
Phase 3 (Tech Debt) ──> Phase 4 (Bugs)                                                             │                                                       │
                                                                                                    │                                                       ├──> Phase 9 (Frontend Factories)
                                                                                                    │                                                       │
                                                                                                    └───────────────────────────────────────────────────────> Phase 10 (Infrastructure)
```

**Parallel opportunities:**
- Phases 1, 2, 3 can run in parallel (independent concerns)
- Phase 4 depends only on Phase 3
- Phase 5 depends only on Phase 1
- Phases 6+ are sequential on the critical path

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
| FACT-04 | 5 | Apply protectedMutation across all 27 mutation files |
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
| FHOOK-01 | 9 | Create generic createMutationHook factory |
| FHOOK-02 | 9 | Migrate simple entity hooks to factory |
| FUI-01 | 9 | Create generic EntityManager component |
| FUI-02 | 9 | Migrate simple CRUD pages to EntityManager |
| INFRA-01 | 10 | Automated Convex database backup |
| INFRA-02 | 10 | Dependency compatibility audit |
| INFRA-03 | 10 | Production counts consolidation |

**Coverage: 39/39 (100%)**

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
| 10 | HIGH | productionCounts consolidation performance | Fallback to materialized view if slow |

---

*Roadmap created: 2026-02-13*
*Next action: Begin Phase 1 (Test Infrastructure)*

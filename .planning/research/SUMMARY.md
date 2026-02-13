# Research Synthesis: Codebase Cleanup & Refactoring

**Project:** Frollie Recipe Master
**Research Date:** 2026-02-13
**Researchers:** gsd-stack-researcher, gsd-feature-researcher, gsd-architecture-researcher, gsd-pitfall-researcher

---

## Key Findings

### 1. Dependencies Are Current, No Upgrades Needed

All major dependencies (Convex 1.31.7, React 19.2.0, TypeScript 5.9.3, Vite 7.2.4, Vitest 4.0.18) are already at latest stable versions. The only additions needed are:
- **convex-helpers** (0.1.107) for `customMutation`/`customQuery` auth factories
- **@convex-dev/eslint-plugin** (1.1.0) for explicit-table-ids enforcement

### 2. Critical Tech Debt: Dual Production Tracking Systems

The codebase maintains TWO parallel ball tracking systems causing confusion and risk:
- **Old system:** `menuProducts.productionType`/`productionUnits` + `orderItems.productionType`/`productionUnits` (deprecated but still actively read in 19 frontend + 10 backend files)
- **New system:** BOM (`menuProductComponents` + `componentTypes`) + `orderItemProduction` records

Migration is incomplete. The `backfillOrderItemProduction` function bootstraps from deprecated fields, making them the source of truth for the new system.

### 3. 2000+ Lines of Removable Boilerplate via Factories

| Layer | Files | Avg Duplication % | Potential Savings |
|-------|-------|------------------|-------------------|
| Frontend Hooks | 21 files | 70% identical | 1,120 lines via hook factory |
| Backend Queries | 30 files | 80% identical | 450 lines via helper functions |
| Backend Mutations | 27 files | 70% identical | 150 lines via `customMutation` auth |
| Manager Pages | 6 files | 60% identical | 1,200 lines via `EntityManager` component |
| **Total** | | | **~3,000 lines** |

### 4. Zero Tests for Critical Business Logic

- `ballDistribution.ts` (342 lines) -- ZERO tests for ball allocation algorithm
- `fifo.ts` (~200 lines) -- ZERO tests for FIFO inventory consumption
- `statusTransitions.ts` (~200 lines) -- ZERO tests for order state machine
- `voucherHandling.ts` -- ZERO tests for discount calculations

These are the highest-risk areas for refactoring. Tests MUST be written before any changes.

### 5. Convex Type Safety Chain Is Fragile

Convex generates `_generated/api.d.ts` from backend function signatures. Runtime factories that return `query()`/`mutation()` dynamically break TypeScript inference (return types become `any`). Code generation (build-time) is safe, runtime factories are not.

### 6. N+1 Queries That Will Not Scale

Current batch-fetching helpers (`batchFetching.ts`) trade N+1 for "load ALL orderItems/orderItemProduction into memory." Works with hundreds of orders, will fail with thousands. Solution: parallel indexed queries via `Promise.all()`.

### 7. 167 Optional Fields Need Categorization

Schema has 167 `v.optional()` fields. Many should be required (added in later PRDs, only exist on recent documents). Requires audit before cleanup to avoid deploy rejection.

---

## Recommended Stack Changes

### What to Add

```bash
# Production dependency (customMutation/customQuery)
npm install convex-helpers@^0.1.107

# Dev dependencies (linting, one-time migration)
npm install -D @convex-dev/eslint-plugin@^1.1.0

# One-time codemod (table-name-first syntax migration)
npx @convex-dev/codemod@latest explicit-ids
```

### What to Upgrade

**NONE.** All dependencies are at latest stable versions.

### What NOT to Change

- Do NOT upgrade to experimental/beta versions (Convex OSS backend, React 19 canary, etc.)
- Do NOT add `convex-ents` (full ORM layer -- too heavy for refactoring initiative)
- Do NOT add `jscodeshift` (lacks TypeScript type awareness needed for Convex ID types)
- Do NOT add `ts-morph` as a permanent dependency (use for one-time codegen, then remove)

---

## Recommended Phase Order

All four researchers agreed on testing-first, disagreed on factory vs. migration priority.

### Consensus Build Order

#### Phase 1: Test Infrastructure (FOUNDATION -- blocking everything)

**Why first:** Cannot safely refactor without safety net. All researchers agreed.

**Scope:**
- Add `convex-test` integration tests for order mutations (create, status transitions, cancel)
- Add unit tests for `ballDistribution.ts` (342 lines, zero tests)
- Add unit tests for `fifo.ts` (FIFO allocation)
- Add unit tests for `voucherHandling.ts` (discount calculations)

**Deliverables:**
- `tests/convex/orderMutations.test.ts` (end-to-end order lifecycle)
- `convex/orders/__tests__/ballDistribution.test.ts`
- `convex/inventory/__tests__/fifo.test.ts`
- `convex/orders/__tests__/voucherHandling.test.ts`

**Risk:** LOW (additive, no production changes)

---

#### Phase 2: Backend Factories (INFRASTRUCTURE)

**Why second:** Establishes patterns all future code follows. Must exist before migrating domains.

**Scope:**
- Install `convex-helpers`
- Create `convex/lib/functions.ts` with `customMutation`/`customQuery` auth wrappers
- Create helper functions (not runtime factories) for common query patterns
- Migrate 2 simple domains as proof-of-concept (ingredients, materials)

**Build order within phase:**
1. Create `convex/lib/functions.ts` with auth factories
2. Migrate `ingredients` mutations to use `customMutation`
3. Verify `npm run build` passes
4. Migrate `materials` mutations (near-identical)
5. Verify both work in dev environment

**Risk:** MEDIUM (Convex type safety chain must be preserved)

**Dependencies:** Phase 1 tests for ingredients/materials

---

#### Phase 3: BOM Migration (CRITICAL PATH -- highest risk)

**Why third:** Deprecated fields are highest-risk tech debt. Every new feature built on deprecated fields compounds the problem.

**Scope (Strangler Fig Pattern):**
1. **Dual-read:** Update all 10 backend files that read deprecated fields to read BOM first, fallback to deprecated for historical orders
2. **Stop writing:** Remove deprecated field writes from `menuProducts/mutations.ts` and `orders/mutations/itemCrud.ts`
3. **Backfill migration:** Run mutation to ensure all menuProducts have BOM entries
4. **Remove fallbacks:** Remove deprecated field reads from queries
5. **Schema cleanup:** Make deprecated fields `v.optional()` with DEPRECATED comment (keep for historical data)

**Files Modified (19 frontend + 10 backend):**

Backend:
- `convex/orders/queries.ts` (lines 266-269, 513-540)
- `convex/orders/helpers/ballDistribution.ts`
- `convex/orders/mutations/itemCrud.ts` (lines 59-66, 226-233)
- `convex/orders/mutations/orderCrud.ts`
- `convex/orders/mutations/packaging.ts`
- `convex/orders/mutations/migrations.ts`
- `convex/orders/whatsapp.ts`
- `convex/menuProducts/mutations.ts`
- `convex/schema.ts`

Frontend (19 files in `src/hooks/` and `src/components/`):
- All files reading `productionType`/`productionUnits` from order items

**Risk:** HIGH (touches order system, most complex and most used)

**Dependencies:** Phase 1 tests MUST be complete

---

#### Phase 4: Query Optimization (N+1 fixes)

**Why fourth:** After BOM migration simplifies queries, fix N+1 patterns before they become bottlenecks.

**Scope:**
- Fix `orders/queries.ts::list()` -- parallel index lookups instead of full-table scan
- Fix `dashboard/queries.ts` -- 7 full table scans for summary stats
- Add search indexes for `ingredients` and `materials`
- Replace `batchFetching.ts` full-scan with parallel indexed queries via `Promise.all()`

**Pattern (Convex-optimized):**
```typescript
// Instead of: load ALL items and filter in memory (current)
const allItems = await ctx.db.query("orderItems").collect(); // BAD at scale

// Use: parallel index lookups
const itemsByOrder = await Promise.all(
  orderIds.map(id =>
    ctx.db.query("orderItems")
      .withIndex("by_order", q => q.eq("orderId", id))
      .collect()
  )
); // N parallel index lookups -- fast in Convex
```

**Risk:** MEDIUM (query changes are visible to users)

**Dependencies:** Phase 3 (simplified queries after BOM migration)

---

#### Phase 5: Frontend Hook Factories

**Why fifth:** After backend stabilizes, apply same pattern to frontend. Safe because hooks are leaf nodes.

**Scope:**
- Create `src/hooks/convex/createMutationHook.ts` factory
- Migrate simple entity hooks (ingredients, materials, tags, customers, locations, vouchers)
- Keep complex hooks manual (orders, kitchen, inventory -- too domain-specific)

**Factory Pattern:**
```typescript
export function createMutationHook<Mutation extends FunctionReference<"mutation">>(
  mutationRef: Mutation,
  entityName: string,
  action: "created" | "updated" | "deleted"
) {
  return function useMutationHook() {
    const mutation = useMutation(mutationRef);
    const execute = async (args: FunctionArgs<Mutation>) => {
      try {
        const result = await mutation(args);
        toast.success(`${entityName} ${action} successfully`);
        return result;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, `Failed to ${action.replace("d", "")} ${entityName.toLowerCase()}`));
        throw error;
      }
    };
    return { mutate: execute, mutateAsync: execute };
  };
}
```

**Result:** Each entity hook file shrinks from ~115 lines to ~15 lines

**Risk:** LOW (frontend-only, no backend impact)

**Dependencies:** Phase 2 backend factories (establishes pattern)

---

#### Phase 6: UI Consolidation

**Why last:** After hooks are factorized, consolidate CRUD manager pages. Cosmetic, lowest risk.

**Scope:**
- Create `src/components/shared/EntityManager.tsx` generic component
- Migrate: IngredientsManager, MaterialsManager, LocationsManager, StorageLocationsManager
- Keep complex pages manual (OrderManager, KitchenViewV2, MenuProductsManager)

**Entities to consolidate:** 6 simple CRUD pages with ~60% shared structure

**Entities to keep manual:** Orders, Kitchen, Inventory, Menu Products (too domain-specific)

**Risk:** LOW (visual changes only, can be tested by screenshot comparison)

**Dependencies:** Phase 5 hook factories

---

### Points of Disagreement (Resolved)

| Aspect | Feature Researcher | Architecture Researcher | Resolution |
|--------|-------------------|------------------------|------------|
| Factory timing | Phase 2 (early infrastructure) | Phase 2 (before domain migrations) | **Agreed -- Phase 2** |
| BOM migration timing | Phase 3 (after factories) | Phase 3 (critical path, needs tests first) | **Agreed -- Phase 3, after Phase 1 tests** |
| productionCounts consolidation | Include in Phase 4 | Separate milestone (high risk) | **Defer to separate milestone** |
| useConvex prefix removal | Phase 5 (cosmetic cleanup) | Phase 6 or skip (low value) | **Skip or defer indefinitely** |

---

## Critical Constraints

### Schema Migration Sequence (MUST follow exactly)

Convex validates schema against data at deploy time. Field removal requires this exact sequence:

```
Step 1: Make field v.optional() in schema (if not already)
        Deploy schema

Step 2: Update mutations to stop writing the field
        Deploy code

Step 3: Update queries to stop reading the field
        Deploy code

Step 4: Run migration mutation to null out field data
        (Batched: 100 docs per transaction)

Step 5: Remove field from schema
        Deploy schema
```

**Minimum deploys per field:** 3-5 (depending on whether field is already optional)

**Critical fields affected:** `productionType`, `productionUnits` on `menuProducts` and `orderItems` (4 fields total)

---

### Factory Type Safety (MUST preserve Convex type chain)

Convex auto-generates `_generated/api.d.ts` from backend function signatures. This is the type contract between backend and frontend.

**What works:**
```typescript
// Higher-order function wraps concrete mutation
export const create = mutation({
  args: { token: v.string(), name: v.string() },
  handler: withAuth(["admin"], async (ctx, args, user) => {
    // entity-specific logic
  }),
});
```

**What breaks type safety:**
```typescript
// Runtime factory returns query() dynamically
export const list = makeListQuery("ingredients"); // Return type becomes 'any'
```

**Allowed approaches:**
- **Code generation (build-time):** Script generates concrete query files from templates. Safe.
- **Helper functions (inside handlers):** Generic helpers called from concrete handlers. Safe.
- **customMutation/customQuery (convex-helpers):** Officially supported pattern. Safe.

**Forbidden approach:**
- Runtime factories that generate and export Convex functions dynamically

---

### Test-Before-Refactor Rule (BLOCKING)

The following files CANNOT be refactored until tests exist:

| File | Lines | Risk Level | Why Blocking |
|------|-------|-----------|--------------|
| `convex/orders/helpers/ballDistribution.ts` | 342 | CRITICAL | Ball allocation algorithm, auto-status transitions, untested |
| `convex/inventory/fifo.ts` | ~200 | CRITICAL | FIFO batch selection, reservation accounting |
| `convex/orders/helpers/statusTransitions.ts` | ~200 | HIGH | Order state machine validation |
| `convex/orders/mutations/inventoryIntegration.ts` | 618 | HIGH | Two-phase commit (reserve/consume/release) |

**Enforcement:** Phase 1 is a hard dependency for Phase 3. Cannot proceed with BOM migration without these tests.

---

### Dual Tracking During Migration (MUST maintain both systems)

During BOM migration (Phase 3), both old and new ball tracking systems must remain operational:

```
Week 1-2: Dual read (read BOM, fallback to deprecated fields)
Week 3-4: Stop writing deprecated fields (BOM only)
Week 5-6: Remove deprecated field reads (BOM source of truth)
Week 7+:   Schema cleanup (keep fields as v.optional with DEPRECATED comment)
```

**Critical rule:** Do NOT remove writes before all reads are migrated. Order: read migration -> write migration -> schema cleanup.

---

## Risk Map

### CRITICAL Risk Areas

#### 1. Order Status Transitions + Inventory (Risk Score: 9/10)

**Call chain:**
```
orders/mutations/statusUpdates.ts
  -> orders/helpers/statusTransitions.ts
    -> orders/mutations/inventoryIntegration.ts
      -> inventory/fifo.ts
        -> inventory/helpers.ts
```

**Triggers:** Status validation, audit logging, FIFO reservation/consumption, stock recalculation, production record updates

**Mitigation:**
- Phase 1 tests for every step in chain
- Never refactor this chain without tests
- Use strangler fig pattern (wrap, don't rewrite)

---

#### 2. Ball Distribution Algorithm (Risk Score: 9/10)

**File:** `convex/orders/helpers/ballDistribution.ts` (342 lines, ZERO tests)

**Complexity:**
- Fetches all Confirmed + InProduction orders
- N+1 query pattern (items + production records per order)
- Calculates ball needs from BOM
- Priority queue distribution
- Auto-transitions order status
- Atomic production record updates

**Mitigation:**
- Phase 1 MUST add comprehensive tests before any changes
- Extract pure allocation logic into testable function
- Use snapshot testing for complex outputs

---

#### 3. Schema Deploy Rejection on Field Removal (Risk Score: 8/10)

**Scenario:** Remove `productionType` from schema before all code stops reading it. Convex rejects deploy.

**Impact:** Blocks entire release pipeline (schema + code deploy together)

**Mitigation:**
- Follow 5-step schema migration sequence (Critical Constraints above)
- Test schema changes against dev environment first
- Never combine field removal with unrelated changes

---

### HIGH Risk Areas

#### 4. Dual Tracking Inconsistency (Risk Score: 7/10)

**Scenario:** During BOM migration, bug in one tracking system corrupts the other. Kitchen sees wrong ball counts.

**Files at risk:** 19 frontend + 10 backend files reading deprecated fields

**Mitigation:**
- Map all read/write sites before changing anything
- Dual-read adapter with fallback for historical orders
- Integration tests for both systems during transition

---

#### 5. FIFO Inventory Corruption (Risk Score: 7/10)

**Scenario:** Refactoring reservation logic introduces off-by-one error. Reserved stock double-consumed or never released.

**Two-phase commit pattern:** Reserve -> Consume -> Release

**Mitigation:**
- Integration tests for full reserve -> consume -> release cycle
- Consistency check mutation (`componentStock.totalStock` vs `SUM(inventoryBatches.quantityRemaining)`)
- Ensure `updateComponentStock()` called after every batch modification

---

#### 6. Type Safety Loss from Generic Factories (Risk Score: 6/10)

**Scenario:** Runtime factory generates queries dynamically. `useQuery(api.ingredients.queries.list)` returns `any`.

**Impact:** 51 frontend files lose autocomplete, hover types, type checking

**Mitigation:**
- Use code generation (build-time) for backend factories
- Use composition (createMutationHook) for frontend
- Never generate Convex functions dynamically at runtime

---

### MEDIUM Risk Areas

#### 7. Convex Transaction Limits During Migrations (Risk Score: 5/10)

**Limit:** ~8,192 documents per transaction

**Mitigation:**
- Paginate all migration mutations (100 docs per batch)
- Use Convex Migrations Component for large-scale migrations
- Add `dryRun` parameter to every migration

---

#### 8. Transform Layer (camelCase/snake_case) Bugs (Risk Score: 4/10)

**Affected files:** `useOrders.ts`, `useKitchenStats.ts`, `usePendingBallStats.ts`, `src/lib/types.ts`

**Mitigation:**
- Do NOT touch transform layer during refactoring (separate dedicated phase)
- When adding fields, update BOTH schema AND transform function
- Use TypeScript `satisfies` to enforce complete mapping

---

## Open Questions

### 1. Should `productionCounts` table be consolidated into `productionLog`-derived aggregates?

**Current state:** Dual tracking (running tallies + event log). Event log already has `getDailySummary` aggregator.

**Pros of consolidation:**
- Single source of truth (event-sourced)
- No manual reset logic
- No drift between tallies and reality

**Cons:**
- Performance: aggregating log on every kitchen page load may be slow at scale
- Complexity: log has `shippedToGoldfinch` tracking + reset tracking that need migration thought

**Recommendation:** DEFER to separate milestone after Phase 6. High risk, needs dedicated planning.

---

### 2. Should we remove the `useConvex` prefix from all hook names?

**Current state:** All hooks prefixed `useConvex` (369 exports in barrel file). Vestige of migration from FastAPI backend.

**Pros of removal:**
- Cleaner DX (`useOrders` vs `useConvexOrders`)
- Less noise (entire app uses Convex exclusively)

**Cons:**
- Tedious (369 export references, all consumers)
- Merge conflict risk if done during other work
- Low impact (cosmetic only)

**Recommendation:** SKIP or defer indefinitely. Low value, high conflict risk.

---

### 3. Should we build a generic `EntityManager<T>` UI component?

**Estimated savings:** 1,200 lines across 6 simple CRUD pages

**Risk:** Over-abstraction. Entities have specific logic (search fields, deletion checks, computed fields).

**Recommendation:** Start small. Extract only truly shared pieces (table component, dialog wrapper, form builder). Measure savings per entity before building mega-factory. Target: 6 simple entities (ingredients, materials, tags, customers, locations, vouchers). Keep complex UIs manual (orders, kitchen, inventory, menu products).

---

### 4. Should we migrate from `productionUnitTypes` to `componentTypes` for production records?

**Current state:** Bridge pattern documented in `productionRecords.ts:178`. `orderItemProduction.productionUnitTypeId` is required `v.id("productionUnitTypes")`.

**Migration path:** 4 deploys minimum (add optional field, backfill, make required, remove old field)

**Recommendation:** SKIP. Bridge works, has clear documentation, low complexity cost. Migration effort not justified.

---

### 5. How should we handle the 167 `v.optional()` fields in schema?

**Categories needed:**
- Legitimately optional (user input, may not exist)
- Should be required, all docs have it (safe to make required after verification)
- Should be required, but historical docs lack it (needs backfill)

**Recommendation:** Phase 0 task: audit all 167 fields into categorization spreadsheet. Then batch-process category 2 (5-10 fields per deploy). Defer category 3 to separate migrations.

---

### 6. Should we use Convex Migrations Component or custom mutations for backfills?

**Custom mutations (current approach):**
- Pros: Simple, already implemented, flexible
- Cons: Manual invocation, no built-in progress tracking

**Convex Migrations Component:**
- Pros: Progress tracking, resumability, pagination
- Cons: New dependency, learning curve

**Recommendation:** Use custom mutations for Phase 3 (BOM migration). Evaluate Migrations Component if `productionCounts` consolidation proceeds (larger scale).

---

### 7. Should we add E2E tests for kitchen workflow during refactoring?

**Current E2E coverage:** 4 Playwright specs (sales analytics, dashboard). Kitchen and order flows are gaps.

**Recommendation:** DEFER. Backend tests (Phase 1) provide better ROI at lower cost. Add E2E tests only after backend test coverage is solid. Current priority: unit + integration tests via `convex-test`.

---

*Research synthesis: 2026-02-13*
*Confidence: HIGH (unanimous consensus on critical constraints, resolved disagreements on phase ordering)*

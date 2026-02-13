# Architecture Patterns for Safe Large-Scale Refactoring

**Domain:** Frollie Recipe Master -- Convex + React production system
**Researched:** 2026-02-13
**Overall Confidence:** HIGH (based on direct codebase analysis + Convex official migration docs)

---

## 1. Component Boundaries

The system has seven distinct architectural layers. Each layer can be refactored independently **if** its public interface remains stable. Cross-layer changes require coordinated multi-wave deployment.

### Dependency Diagram

```
                        +-----------------------+
                        |   Convex Schema       |  FOUNDATION
                        |   convex/schema.ts    |  (37 tables, all types)
                        +-----------+-----------+
                                    |
                    +---------------+----------------+
                    |                                |
         +----------v-----------+        +-----------v-----------+
         |   Backend Helpers    |        |   Backend Queries     |
         |   convex/lib/        |        |   convex/*/queries.ts |
         |   convex/*/helpers/  |        |   (29 query files)    |
         +----------+-----------+        +-----------+-----------+
                    |                                |
         +----------v-----------+                    |
         |   Backend Mutations  |                    |
         |   convex/*/mutations |                    |
         |   (26 mutation files)|                    |
         +----------+-----------+                    |
                    |                                |
                    +------+-------------------------+
                           |
              +------------v-------------+
              |   Convex _generated/api  |  AUTO-GENERATED
              |   (type bridge)          |  (DO NOT EDIT)
              +------------+-------------+
                           |
              +------------v-------------+
              |   Frontend Hooks         |
              |   src/hooks/convex/      |
              |   (25 hook files)        |
              +------------+-------------+
                           |
            +--------------+--------------+
            |                             |
  +---------v----------+      +-----------v---------+
  |  UI Components     |      |   Pages             |
  |  src/components/   |      |   src/pages/        |
  |  (21 directories)  |      |   (24 page files)   |
  +--------------------+      +---------------------+
```

### Component Boundary Table

| Component | Files | Responsibility | Can Change Independently? | Depends On |
|-----------|-------|---------------|--------------------------|------------|
| **Schema** | `convex/schema.ts` | Table definitions, indexes, type unions | NO - changes cascade to everything | Nothing |
| **Backend Helpers** | `convex/lib/*.ts`, `convex/*/helpers/*.ts` | Pure logic, auth, cost calc | YES if exports stable | Schema types |
| **Backend Queries** | 29 `queries.ts` files | Read operations, data assembly | YES if return types stable | Schema, Helpers |
| **Backend Mutations** | 26 `mutations.ts` files + `orders/mutations/` | Write operations, business logic | YES if arg/return types stable | Schema, Helpers, Queries (for validation) |
| **Frontend Hooks** | 25 files in `src/hooks/convex/` | Convex API wrappers, toast notifications | YES if hook signatures stable | `_generated/api` (auto-generated from backend) |
| **UI Components** | 21 directories in `src/components/` | Visual rendering, local state | YES if props stable | Hooks, shared components |
| **Pages** | 24 files in `src/pages/` | Route composition, page-level state | YES (leaf nodes) | Hooks, Components |

### Key Insight: The Type Bridge

Convex auto-generates `convex/_generated/api.d.ts` from backend function signatures. This file is the **type contract** between backend and frontend. Any change to query args, mutation args, or return types automatically propagates to frontend via TypeScript compilation. This means:

- Backend refactoring that preserves function signatures is **invisible** to frontend
- Backend refactoring that changes signatures **forces** frontend hook updates
- The `npm run build` (which runs `tsc`) catches all contract violations

---

## 2. Data Flow Analysis

### Read Path (Query)

```
User action
  -> React component renders
    -> useConvexOrders({ status: "Confirmed" })
      -> useQuery(api.orders.queries.list, { status: "Confirmed" })
        -> WebSocket to Convex backend
          -> convex/orders/queries.ts::list()
            -> ctx.db.query("orders").withIndex("by_status", ...)
            -> ctx.db.query("orderItems").withIndex("by_order", ...)  [N+1!]
              -> Return OrderWithItems[]
            <- Auto-subscribed: re-runs on any orders/orderItems change
          <- WebSocket push to client
        <- React re-renders
```

### Write Path (Mutation)

```
User clicks "Confirm Order"
  -> handleConfirm()
    -> updateOrderStatus({ orderId, status: "Confirmed", token })
      -> useMutation(api.orders.mutations.updateStatus)
        -> Convex mutation handler:
          1. requireRole(ctx, token, ["order_staff", "manager", "admin"])
          2. Validate transition: Confirmed is valid from AwaitingPayment
          3. Reserve inventory: reserveStockForOrder(ctx, orderId)
             -> Calculate BOM needs (menuProductComponents + componentTypes)
             -> FIFO reserve from oldest batches
             -> Create orderComponentReservations
          4. ctx.db.patch(orderId, { status: "Confirmed" })
          5. Log event: ctx.db.insert("orderEvents", { ... })
        -> All subscribed queries re-run automatically
```

### Cross-Domain Data Flow Map

```
                    ingredients ----+
                                   |
                    materials ------+----> recipes/packaging (cost calc)
                                   |            |
                    tags -----------+            v
                                          products (COGS)
                                                |
    componentTypes ---+                         |
                      |                         v
    menuProducts -----+---> menuProductComponents (BOM)
                      |            |
    customers --------+            v
                      |      orderItems ---> orderItemProduction
                      |            |                |
                      +----> orders <---+           v
                               |        |    kitchenInventory / productionTargets
                               |        |
                               v        +--- orderComponentReservations
                        orderEvents          inventoryBatches (FIFO)
                        orderMessages        componentStock
                                             componentTransactions
```

### Domain Clusters (independently refactorable)

| Cluster | Tables | Coupling |
|---------|--------|----------|
| **Recipe System** | recipes, recipeVersions, recipeComponents, componentIngredients, ingredients, tags | Low (products reference versions by ID) |
| **Packaging System** | packagingRecipes, packagingVersions, packagingComponents, packagingComponentMaterials, packagingMaterials | Low (products reference versions by ID) |
| **Product System** | products, productVersions | Low (references recipe + packaging versions) |
| **BOM System** | componentTypes, menuProducts, menuProductComponents, productionUnitTypes | Medium (orders read BOM for production records) |
| **Order System** | orders, orderItems, orderItemProduction, orderMessages, orderEvents | HIGH (touches BOM, inventory, customers, vouchers) |
| **Inventory System** | inventoryBatches, componentStock, componentTransactions, orderComponentReservations, storageLocations | HIGH (coupled to orders via reservations) |
| **Kitchen System** | kitchenInventory, productionTargets, productionCounts, productionLog, productionProductTargets | Medium (reads orders, writes production records) |
| **External Integrations** | externalOutlets, externalRevenue, externalRevenueItems, externalStockSnapshots, externalSyncLogs, externalProductMappings | Low (reads menuProducts, writes own tables) |
| **Auth System** | users, sessions | Low (standalone, used by all mutations via token) |
| **Support System** | vouchers, voucherUsage, channelUsage, shippingAgencyUsage, whatsappTemplates, feedback | Low (order-adjacent, loosely coupled) |

---

## 3. Recommended Architecture for Refactoring

### 3.1 Strangler Fig Pattern: Replacing Deprecated Code Paths

The codebase has two critical deprecated subsystems that need migration:

**Deprecated Subsystem 1: Legacy Ball Tracking**
- Old: `menuProducts.productionType` / `menuProducts.productionUnits` / `orderItems.productionType` / `orderItems.productionUnits`
- New: BOM system (`menuProductComponents` + `componentTypes` with `category="production"`)
- Files still reading deprecated fields: 10 files (see CONCERNS.md)

**Deprecated Subsystem 2: Legacy Order Statuses**
- Old: `ProductionComplete`, `Packaging`
- New: `InProduction`, `Boxed`, `Labeled`

**Strangler Fig Strategy:**

```
Phase 1: Wrap (read from both, write to both)
  - All new code reads from BOM
  - Mutations still write deprecated fields for backward compat
  - Queries compute legacy fields from BOM on read

Phase 2: Migrate (backfill BOM from legacy data)
  - Run migration: for each menuProduct, ensure menuProductComponents exist
  - Run migration: for each orderItem, ensure orderItemProduction records exist
  - Verify: all products have BOM data

Phase 3: Switch (read from BOM only)
  - Remove deprecated field reads from queries
  - Remove deprecated field writes from mutations
  - Keep deprecated fields in schema as v.optional (for historical data)

Phase 4: Clean (remove deprecated code)
  - Remove deprecated fields from schema
  - Remove migration code
  - Remove `by_production_type` index from orderItems
```

### 3.2 Factory Pattern: Reducing Duplication

The codebase has four categories of near-identical code that can be factorized:

**Category A: Backend CRUD Queries (29 files, ~60% identical)**
```
Pattern: list() + get() + search() per entity
Example: convex/ingredients/queries.ts vs convex/materials/queries.ts
         (95% identical, differs only in table name and search fields)

Factory approach:
  convex/lib/queryFactory.ts
    -> makeListQuery(tableName, indexName?)
    -> makeGetQuery(tableName)
    -> makeSearchQuery(tableName, searchFields[])
```

**Category B: Backend CRUD Mutations (26 files, ~50% identical)**
```
Pattern: create() + update() + remove() per entity
Example: convex/ingredients/mutations.ts vs convex/materials/mutations.ts
         (90% identical, differs only in table name, validators, and delete checks)

Factory approach:
  convex/lib/mutationFactory.ts
    -> makeCreateMutation(tableName, validators, beforeInsert?)
    -> makeUpdateMutation(tableName, validators, beforeUpdate?)
    -> makeDeleteMutation(tableName, referenceChecks[])
```

**Category C: Frontend Hooks (25 files, ~70% identical)**
```
Pattern: useConvex{Entity}() + useConvexCreate{Entity}() + useConvexUpdate{Entity}() + useConvexDelete{Entity}()
Example: src/hooks/convex/useIngredients.ts vs src/hooks/convex/useMaterials.ts
         (identical structure, different API paths and type names)

Factory approach:
  src/hooks/convex/hookFactory.ts
    -> makeEntityHooks(api.entity.queries, api.entity.mutations, { entityName, toastMessages })
```

**Category D: Frontend Manager Pages (6 files, ~60% identical)**
```
Pattern: Table + AddDialog + EditDialog + DeleteConfirm per entity
Example: src/pages/IngredientsManager.tsx vs src/pages/MaterialsManager.tsx
         (329 lines each, nearly identical table/dialog structure)

Factory approach:
  src/components/shared/EntityManager.tsx
    -> <EntityManager<T> columns={[...]} formFields={[...]} hooks={...} />
```

### 3.3 Convex-Specific Migration Patterns

Convex has unique constraints that affect refactoring strategy:

**Schema Change Rules (HIGH confidence - official docs):**

1. **Cannot remove a field if data exists** - Must first make field `v.optional()`, then run migration to clear data, then remove field
2. **Cannot change field type** - Must create new field with new type, migrate data, remove old field
3. **Index changes are safe** - Adding/removing indexes is non-breaking (Convex handles reindexing)
4. **Table additions are safe** - New tables don't affect existing code
5. **Validator changes are safe** - Adding new `v.literal()` values to unions is backward-compatible

**Safe Schema Change Sequence:**

```
Step 1: Add new optional field to schema
        Deploy schema (no code changes yet)

Step 2: Update mutations to write both old and new fields (dual write)
        Deploy code

Step 3: Run migration to backfill new field for existing data
        (Use batched mutation: 100 docs per transaction)

Step 4: Update queries to read from new field
        Deploy code

Step 5: Remove writes to old field from mutations
        Deploy code

Step 6: Make old field v.optional() in schema (if not already)
        Deploy schema

Step 7: Run migration to null out old field data
        (Optional: keep historical data)

Step 8: Remove old field from schema
        Deploy schema
```

**Convex Deployment Model:**
- Schema and code deploy atomically via `npx convex deploy`
- No separate "migration window" -- code and schema must be compatible at every commit
- Convex validates schema against existing data on deploy -- deploy fails if data doesn't match
- Real-time queries continue serving during deployment (zero downtime)

---

## 4. Suggested Build Order (Dependency-Driven)

### Phase Dependency Graph

```
Phase 1: Test Infrastructure
    |
    v
Phase 2: Backend Factories (lib layer)
    |
    +---> Phase 3: Schema Cleanup (deprecated fields)
    |         |
    |         v
    |     Phase 4: Query Optimization (N+1 fixes)
    |
    +---> Phase 5: Frontend Factories (hooks layer)
              |
              v
          Phase 6: UI Consolidation (pages layer)
```

### Phase 1: Test Infrastructure (FOUNDATION -- must be first)

**Rationale:** Cannot safely refactor without tests. Write tests for existing behavior BEFORE changing code. Tests become the contract that guarantees no regressions.

**Scope:**
- Add `convex-test` integration tests for order mutations (create, status transitions, cancel)
- Add unit tests for `convex/orders/helpers/ballDistribution.ts` (342 lines, zero tests)
- Add unit tests for `convex/inventory/fifo.ts` (FIFO allocation, zero tests)
- Add unit tests for `convex/orders/helpers/voucherHandling.ts`
- Target: Test every function that Phase 3-4 will modify

**Files to create:**
| File | Tests What |
|------|-----------|
| `convex/orders/__tests__/ballDistribution.test.ts` | Ball allocation, order completion, overflow |
| `convex/inventory/__tests__/fifo.test.ts` | FIFO ordering, partial depletion, insufficient stock |
| `tests/convex/orderMutations.test.ts` | End-to-end order lifecycle with convex-test |
| `convex/orders/__tests__/voucherHandling.test.ts` | Discount calc, usage limits, expiry |

**Risk:** LOW -- adding tests is purely additive, no production changes.

**Dependencies:** None. Can start immediately.

### Phase 2: Backend Factories (INFRASTRUCTURE)

**Rationale:** Factories eliminate duplication and establish the pattern all future code follows. Must exist before migrating individual domains, otherwise migration multiplies duplication.

**Scope:**
- Create `convex/lib/queryFactory.ts` -- generic CRUD query generators
- Create `convex/lib/mutationFactory.ts` -- generic CRUD mutation generators with auth
- Migrate 2 simple domains as proof-of-concept (ingredients, materials -- simplest, most duplicated)
- Keep old code working during migration (dual exports from barrel files)

**Build order within phase:**
1. Write factory with TypeScript generics
2. Write factory tests
3. Migrate `ingredients` queries + mutations to use factory
4. Verify `npm run build` passes
5. Migrate `materials` (near-identical to ingredients)
6. Verify both work in dev environment

**Risk:** MEDIUM -- Convex does not support dynamic `import()`, so factories must use static configuration. Factory must generate actual `query()` / `mutation()` Convex function definitions, not dynamic wrappers. Verify that Convex can register factory-generated functions correctly.

**Dependencies:** Phase 1 tests for ingredients/materials (ensure no regressions).

### Phase 3: Schema Cleanup + BOM Migration (CRITICAL PATH)

**Rationale:** Deprecated fields are the highest-risk tech debt. Every new feature built on deprecated fields compounds the problem. This is the "strangler fig" execution phase.

**Scope:**
- Migrate all deprecated `productionType`/`productionUnits` reads to BOM
- Migrate deprecated `ProductionComplete`/`Packaging` statuses to new statuses
- Remove `by_production_type` index from `orderItems`
- Clean up `kitchenInventory` table (legacy tray system)

**Build order within phase (Convex dual-write pattern):**

1. **Schema prep:** Make deprecated fields `v.optional()` if not already (they are)
2. **Dual-read queries:** Update all 10 files that read deprecated fields to read BOM instead, with fallback to deprecated fields for historical orders
3. **Test:** Verify all kitchen/order queries return correct data
4. **Stop writing:** Remove deprecated field writes from `menuProducts/mutations.ts` and `orders/mutations/itemCrud.ts`
5. **Backfill migration:** Run mutation to ensure all menuProducts have BOM entries
6. **Remove fallbacks:** Remove deprecated field read fallbacks from queries
7. **Schema cleanup:** Remove deprecated fields from schema (or keep as `v.optional()` with DEPRECATED comment)

**Files modified (10 backend files):**

| File | Change |
|------|--------|
| `convex/orders/queries.ts` (lines 266-269, 513-540) | Read ball needs from BOM |
| `convex/orders/helpers/ballDistribution.ts` | Already uses BOM, remove legacy fallback |
| `convex/orders/mutations/itemCrud.ts` (lines 59-66, 226-233) | Stop writing deprecated fields |
| `convex/orders/mutations/orderCrud.ts` | Stop stamping deprecated fields on creation |
| `convex/orders/mutations/packaging.ts` | Remove deprecated field reads |
| `convex/orders/mutations/migrations.ts` | Add BOM backfill migration |
| `convex/orders/whatsapp.ts` | Read ball info from BOM |
| `convex/menuProducts/mutations.ts` | Stop writing deprecated fields |
| `convex/schema.ts` | Mark deprecated fields, remove unused index |

**Risk:** HIGH -- This touches the order system (most complex, most used). Ball distribution algorithm is 342 lines with zero tests (Phase 1 mitigates this).

**Dependencies:** Phase 1 tests MUST be complete before starting. Phase 2 factories are nice-to-have but not blocking.

### Phase 4: Query Optimization (N+1 Fixes)

**Rationale:** Current N+1 patterns work at current scale (~hundreds of orders) but will degrade. Fix while refactoring to avoid revisiting later.

**Scope:**
- Fix `orders/queries.ts::list()` -- batch-fetch items instead of per-order
- Fix `orders/queries.ts::kitchenOrdersWithProduction()` -- use `batchFetching.ts` helpers
- Fix `dashboard/queries.ts` -- 7 full table scans for summary stats
- Add search indexes for `ingredients` and `materials` (currently full-scan filter)
- Replace `externalData/queries.ts` full-table scans with indexed + paginated queries

**Pattern: Batch Fetch (already partially implemented)**

The codebase already has `convex/orders/helpers/batchFetching.ts` with:
- `fetchOrdersWithItemsAndProduction()` -- 2 queries instead of N+1
- `fetchOrderItems()` -- 1 query instead of N
- `fetchCustomersForOrders()` -- N unique customers instead of N total

Problem: These helpers load ALL `orderItems` / ALL `orderItemProduction` then filter in memory. This trades N+1 for "load everything" -- better for small datasets but will not scale.

**Better pattern for Convex:**
```
// Instead of loading ALL items and filtering:
const allItems = await ctx.db.query("orderItems").collect(); // BAD at scale

// Use index-per-order (current N+1) but with Promise.all parallelism:
const itemsByOrder = await Promise.all(
  orderIds.map(id =>
    ctx.db.query("orderItems").withIndex("by_order", q => q.eq("orderId", id)).collect()
  )
); // N parallel index lookups -- fast in Convex
```

**Risk:** MEDIUM -- Query changes are visible to users (data shape changes). Must verify return types match expectations.

**Dependencies:** Phase 1 tests catch any data regressions. Phase 3 schema cleanup simplifies queries.

### Phase 5: Frontend Hook Factories

**Rationale:** After backend factories stabilize, apply same pattern to frontend hooks. 25 hook files with ~70% identical code.

**Scope:**
- Create `src/hooks/convex/hookFactory.ts`
- Migrate simple entity hooks first (ingredients, materials, tags, customers)
- Keep complex hooks manual (orders, kitchen, inventory -- too domain-specific)

**Factory design:**
```typescript
// src/hooks/convex/hookFactory.ts
export function makeEntityHooks<TEntity>(config: {
  queries: { list: FunctionReference; get: FunctionReference; search?: FunctionReference };
  mutations: { create: FunctionReference; update: FunctionReference; remove: FunctionReference };
  entityName: string; // For toast messages
}) {
  return {
    useList: (limit?: number) => useQuery(config.queries.list, { limit }),
    useGet: (id: Id<any> | undefined) => useQuery(config.queries.get, id ? { id } : "skip"),
    useCreate: () => { /* wrap useMutation with toast */ },
    useUpdate: () => { /* wrap useMutation with toast */ },
    useDelete: () => { /* wrap useMutation with toast */ },
  };
}
```

**Risk:** LOW -- frontend-only changes, no backend impact. Can be done incrementally.

**Dependencies:** Phase 2 backend factories (establishes the pattern). Not blocked by Phase 3/4.

### Phase 6: UI Consolidation

**Rationale:** After hooks are factorized, consolidate the 6 near-identical CRUD manager pages.

**Scope:**
- Create `src/components/shared/EntityManager.tsx` generic component
- Migrate: IngredientsManager, MaterialsManager, LocationsManager, StorageLocationsManager
- Keep complex pages manual (OrderManager, KitchenViewV2, MenuProductsManager)

**Risk:** LOW -- visual changes only. Can be tested by screenshot comparison.

**Dependencies:** Phase 5 hook factories.

---

## 5. Risk Zones (What Is Most Likely to Break)

### CRITICAL Risk: Order Status Transitions + Inventory

```
convex/orders/mutations/statusUpdates.ts
  -> convex/orders/helpers/statusTransitions.ts
    -> convex/orders/mutations/inventoryIntegration.ts
      -> convex/inventory/fifo.ts
        -> convex/inventory/helpers.ts
```

This call chain is the most dangerous code path in the system. A status change triggers:
1. Status validation (state machine)
2. Audit event logging
3. Inventory reservation/consumption (FIFO)
4. Component stock recalculation
5. Production record updates

**Mitigation:** Phase 1 tests. Never refactor this chain without tests. Use strangler fig (wrap, don't rewrite).

### HIGH Risk: Ball Distribution Algorithm

```
convex/orders/helpers/ballDistribution.ts (342 lines, ZERO tests)
```

This algorithm allocates produced balls to pending orders. It:
1. Fetches all Confirmed + InProduction orders
2. Fetches all items + production records per order (N+1!)
3. Calculates ball needs from BOM
4. Distributes available balls using priority queue
5. Auto-transitions orders to InProduction
6. Updates production records atomically

**Mitigation:** Phase 1 MUST add tests before any changes. Extract pure allocation logic into testable function.

### HIGH Risk: batchFetching.ts Full-Table Scan

```
convex/orders/helpers/batchFetching.ts
  -> ctx.db.query("orderItems").collect()          // ALL items in DB
  -> ctx.db.query("orderItemProduction").collect()  // ALL production records
```

This "optimization" loads every row from two tables into memory. Works today (~hundreds of orders) but will crash as data grows.

**Mitigation:** Phase 4 replaces with indexed parallel queries. Add data size monitoring.

### MEDIUM Risk: Deprecated Field Removal

Removing `productionType`/`productionUnits` from 10 files touches the most-used features (orders, kitchen). Any regression here affects daily kitchen operations.

**Mitigation:** Phase 3 uses dual-read pattern (read new, fallback to old). Only remove fallback after verifying BOM data is complete for all products.

### LOW Risk: Factory Migration

Replacing hand-written CRUD with factories is mechanical substitution. TypeScript compilation catches type mismatches. If factory output matches original function signature exactly, no runtime behavior changes.

**Mitigation:** One domain at a time. Run `npm run build` after each migration. Compare query results before/after.

---

## 6. File Change Impact Matrix

This matrix shows which phases modify which files, to identify conflicts between parallel work:

| File Area | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|-----------|---------|---------|---------|---------|---------|---------|
| `convex/schema.ts` | - | - | MODIFY | - | - | - |
| `convex/lib/` | - | CREATE | - | - | - | - |
| `convex/ingredients/` | TEST | MODIFY | - | - | - | - |
| `convex/materials/` | TEST | MODIFY | - | - | - | - |
| `convex/orders/queries.ts` | TEST | - | MODIFY | MODIFY | - | - |
| `convex/orders/mutations/` | TEST | - | MODIFY | - | - | - |
| `convex/orders/helpers/` | TEST | - | MODIFY | MODIFY | - | - |
| `convex/inventory/` | TEST | - | - | MODIFY | - | - |
| `convex/menuProducts/` | - | - | MODIFY | - | - | - |
| `convex/dashboard/` | - | - | - | MODIFY | - | - |
| `convex/externalData/` | - | - | - | MODIFY | - | - |
| `src/hooks/convex/` | - | - | - | - | MODIFY | - |
| `src/pages/` (simple) | - | - | - | - | - | MODIFY |
| `src/pages/` (complex) | - | - | - | - | - | - |
| `src/components/shared/` | - | - | - | - | - | CREATE |

**Conflict zones:**
- `convex/orders/queries.ts` is modified in both Phase 3 and Phase 4 (schedule Phase 4 AFTER Phase 3)
- `convex/orders/helpers/` is modified in both Phase 3 and Phase 4 (same constraint)
- No conflicts between Phase 2 (factories) and Phase 3 (schema cleanup) -- can run in parallel

---

## 7. Convex-Specific Constraints

### What Convex Does NOT Support

1. **Dynamic imports in backend** -- All imports must be static. Factories must use configuration objects, not dynamic module loading.
2. **SQL-style JOINs** -- All "joins" are manual (fetch parent, then fetch children). N+1 is structural, not a bug.
3. **OR queries on indexes** -- Cannot query `status IN ("Confirmed", "InProduction")` with a single index. Must query each status separately.
4. **Background migrations** -- No built-in migration runner. Migrations are regular mutations called manually or via cron.
5. **Transactions across mutations** -- Each mutation is a single transaction. Cannot span multiple mutations in one transaction.

### What Convex Handles Well

1. **Schema validation on deploy** -- Deploy fails if schema doesn't match data. Catches errors before production.
2. **Real-time query invalidation** -- No cache invalidation needed. Refactored queries automatically serve fresh data.
3. **Atomic mutations** -- Each mutation is fully transactional. No partial writes.
4. **Index management** -- Adding/removing indexes is automatic. No manual migration needed.
5. **Type generation** -- Backend changes automatically update frontend types via `_generated/api.d.ts`.

### Factory Constraints in Convex

Convex functions must be statically analyzable. This means:

```typescript
// WORKS: Factory returns Convex function definition
export const list = makeListQuery("ingredients");

// DOES NOT WORK: Dynamic function generation at runtime
const queryName = "list";
export const [queryName] = makeQuery("ingredients"); // Convex can't resolve this

// WORKS: Factory with static table name
export const create = makeCreateMutation("ingredients", {
  args: { name: v.string(), ... },
  roles: ["admin"],
});

// DOES NOT WORK: Factory with dynamic table name at call time
// (table name must be known at deploy time, not runtime)
```

**Implication:** Factories must be used at module level, producing static exports. Each domain still needs its own `queries.ts` and `mutations.ts` files, but the content reduces from ~60 lines to ~10 lines per entity.

---

## 8. Anti-Patterns to Avoid During Refactoring

### Anti-Pattern 1: Big Bang Migration

**What:** Rewriting all 80+ files in one branch.
**Why bad:** Untestable, unreviewable, impossible to bisect regressions.
**Instead:** One domain per wave. Commit after each. Ship incrementally.

### Anti-Pattern 2: Removing Fields Before Migration

**What:** Deleting deprecated schema fields before all code stops reading them.
**Why bad:** Convex deployment fails if schema doesn't match data. Running code throws on missing fields.
**Instead:** Follow the 8-step schema change sequence (Section 3.3). Always add before remove.

### Anti-Pattern 3: Testing After Refactoring

**What:** Refactoring code, then writing tests to verify.
**Why bad:** Tests confirm new behavior, not that old behavior was preserved. No regression safety net.
**Instead:** Write tests FIRST (Phase 1). Tests document current behavior. Then refactor. Tests catch regressions.

### Anti-Pattern 4: Replacing N+1 with Full-Table Scan

**What:** Loading all `orderItems` into memory instead of querying per-order (current `batchFetching.ts`).
**Why bad:** Trades N+1 for O(total_rows). Slower as data grows. Memory pressure.
**Instead:** Use parallel indexed queries via `Promise.all()`. O(N) parallel index lookups is fast in Convex.

### Anti-Pattern 5: Over-Abstracting with Factories

**What:** Trying to factorize every domain, including orders, kitchen, and inventory.
**Why bad:** Complex domains have unique business logic that doesn't fit generic patterns. Forced abstraction creates leaky abstractions.
**Instead:** Factory for simple CRUD domains only (ingredients, materials, tags, customers, locations). Keep complex domains hand-written.

---

## Sources

- [Convex: Intro to Migrations](https://stack.convex.dev/intro-to-migrations) -- Dual-write/dual-read patterns, deployment strategies
- [Convex: Lightweight Zero-Downtime Migrations](https://stack.convex.dev/lightweight-zero-downtime-migrations) -- Transactional safety, batch size limits
- [Convex: Zero-Downtime Type-Safe Migrations](https://stack.convex.dev/zero-downtime-migrations) -- Schema change ordering
- [Convex Schema Documentation](https://docs.convex.dev/database/schemas) -- Field deprecation with v.optional
- [Strangler Fig Pattern - AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html) -- Incremental migration strategy
- [Shopify: Refactoring Legacy Code with Strangler Fig](https://shopify.engineering/refactoring-legacy-code-strangler-fig-pattern) -- Production migration experience

---

*Architecture research: 2026-02-13*
*Confidence: HIGH -- based on direct codebase analysis of 119 backend files, 24 pages, 25 hooks, and Convex official documentation*

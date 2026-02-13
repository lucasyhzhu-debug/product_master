# Domain Pitfalls: Frollie Recipe Master Refactoring

**Domain:** Production TypeScript + Convex + React codebase cleanup and refactoring
**Researched:** 2026-02-13
**Overall confidence:** HIGH (based on codebase analysis + Convex official docs + community patterns)

---

## Critical Pitfalls

Mistakes that cause production outages, data loss, or force rewrites.

---

### Pitfall 1: Convex Schema Deployment Rejection on Field Removal

**What goes wrong:** You remove a field from `convex/schema.ts` (e.g., dropping `menuProducts.productionType`) and deploy. Convex rejects the deployment because existing documents still contain that field. Production deploy fails. If this is in a combined PR with other changes, the entire deploy is blocked.

**Why it happens:** Convex enforces schema-data consistency at deploy time. Unlike SQL databases, there is no `ALTER TABLE DROP COLUMN`. The schema validator checks every document in the table against the new schema. If any document has a field that is not in the schema (when using strict validation), or a required field that is missing, the deploy is rejected.

**Consequences:** Deploy pipeline blocked. If CI/CD pushes schema + code changes together, the entire release is stuck. Rollback may require reverting unrelated changes.

**Prevention:**
1. Never remove a field and deploy in one step. The Convex migration pattern is:
   - Step 1: Make field `v.optional()` (if not already). Deploy.
   - Step 2: Deploy code that stops writing the field and handles its absence.
   - Step 3: Run a migration mutation to `undefined` the field on all documents.
   - Step 4: Remove the field from schema. Deploy.
2. For this codebase: `productionType` and `productionUnits` are already `v.optional()` on both `menuProducts` and `orderItems`. Step 1 is done. But 19 frontend files and 10 backend files still read these fields. Steps 2-4 remain.
3. Test schema changes against dev environment first (`npx convex dev` with `dev:exciting-fennec-671`).

**Detection (warning signs):**
- `npx convex deploy` fails with "Schema validation failed" or "Document does not match schema"
- Grep for the field name shows active reads/writes in production code
- No migration mutation exists to clear the field

**Phase:** Schema Cleanup phase. Must be sequenced AFTER all code stops reading deprecated fields, and AFTER migration mutations have cleared the data.

**Sources:** [Intro to Migrations (Convex)](https://stack.convex.dev/intro-to-migrations), [Zero-Downtime Migrations (Convex)](https://stack.convex.dev/zero-downtime-migrations)

---

### Pitfall 2: Dual Tracking System Inconsistency During Gradual Migration

**What goes wrong:** During the transition from old tracking (`orderItems.productionType`/`productionUnits`) to new tracking (`orderItemProduction` records via BOM), you have two systems running simultaneously. A bug in one path corrupts data that the other path relies on. Example: the ball distribution algorithm (`ballDistribution.ts:202-208`) filters items by `productionRecords` (new system), but `OrderBox.tsx:118` still checks `item.productionType` (old system) to render package boxes. If a new order lacks the deprecated fields, the UI shows empty boxes while production tracking works correctly.

**Why it happens:** This codebase has TWO parallel production tracking systems:
- **Old system:** `orderItems.productionType` + `orderItems.productionUnits` + `orderItems.ballsFilled` + `orderItems.packageStatus` (UI display fields)
- **New system:** `orderItemProduction.unitsRequired` / `unitsCompleted` / `unitsRemaining` (source of truth for production)

The CLAUDE.md says "NEVER use productionType/productionUnits" but the code actively writes them in `convex/orders/mutations/itemCrud.ts:59-66` and reads them in 9 frontend files. The migration function `backfillOrderItemProduction` in `convex/orders/mutations/migrations.ts` creates production records FROM the deprecated fields, making the old fields the bootstrap source for the new system.

**Consequences:** Kitchen staff sees incorrect ball counts. Orders marked complete in one system but not the other. Production records and UI display diverge.

**Prevention:**
1. Map every read/write of deprecated fields before changing anything. The current inventory:
   - **Backend writes:** `convex/orders/mutations/itemCrud.ts` (order creation stamps `productionType`/`productionUnits`), `convex/orders/mutations/packaging.ts`, `convex/orders/mutations/migrations.ts`
   - **Backend reads:** `convex/orders/queries.ts` (returns to frontend), `convex/orders/helpers/ballDistribution.ts` (normalizes old names to new codes)
   - **Frontend reads:** `src/components/orders/OrderBox.tsx:118` (renders package visualization), `src/hooks/convex/usePendingBallStats.ts:70` (calculates pending stats), `src/hooks/convex/useKitchenStats.ts:52,155`, `src/hooks/convex/useMenuProducts.ts` (4 interface types), `src/components/orders/PackageStatusDisplay.tsx:21`, `src/components/orders/ProductButtons.tsx:22`
2. Create an adapter layer that reads from NEW system first, falls back to OLD system for historical orders. Migrate frontend components one at a time, not all at once.
3. Keep both systems writing in parallel during transition. Only stop writing old fields AFTER all reads are migrated.
4. Write regression tests for the ball distribution algorithm BEFORE touching any field mappings (currently untested at 342 lines).

**Detection (warning signs):**
- Kitchen staff reports "wrong ball count" on orders
- `orderItemProduction.unitsRemaining` and `orderItems.ballsFilled` show different completion states
- New orders have `null` for `productionType` but frontend components crash or show blank

**Phase:** Deprecated Field Migration phase. Must happen BEFORE schema cleanup. Requires dedicated testing.

---

### Pitfall 3: Generic Factory Breaks Convex End-to-End Type Safety

**What goes wrong:** You build a generic query factory like `makeEntityQueries<T>(tableName)` that generates `list`, `get`, `search` queries. It works at runtime but Convex's auto-generated `api.d.ts` cannot infer types through the factory abstraction. `useQuery(api.ingredients.queries.list)` no longer knows the return type is `Doc<"ingredients">[]`. Frontend loses autocomplete, hover types show `any`, and type errors only surface at runtime.

**Why it happens:** Convex's type system works through a specific chain: `convex/schema.ts` defines types -> `_generated/api.d.ts` imports each module by exact file path -> `ApiFromModules` constructs typed API tree -> frontend `useQuery`/`useMutation` infer args and return types from the tree. This chain requires each query/mutation to be a concrete export from a concrete file. A factory function that returns `query({...})` dynamically breaks the inference chain because TypeScript cannot resolve the generic through the `ApiFromModules` type mapper.

Currently, `_generated/api.d.ts` has 100+ explicit `import type * as` statements (e.g., `import type * as ingredients_queries from "../ingredients/queries.js"`). Each one maps to a specific module with concrete exported types. A factory would need to preserve this exact structure.

**Consequences:**
- `useQuery(api.ingredients.queries.list)` returns `any` instead of `Doc<"ingredients">[]`
- IDE autocomplete broken across 51 files that import from `_generated/api`
- Runtime type mismatches go undetected until users hit them
- `npm run type-check` may still pass because `any` is compatible with everything

**Prevention:**
1. **Do NOT make a runtime factory for Convex queries/mutations.** Convex's `api.d.ts` generation requires concrete exports per file. A factory that returns `query()` objects dynamically will lose type information.
2. **Instead, use code generation.** Write a script (not runtime code) that generates `ingredients/queries.ts`, `materials/queries.ts`, etc. from a template. The output files are concrete and Convex can type them. This preserves the 100% type safety while eliminating copy-paste.
3. **For frontend hooks**, a factory IS safe because React hooks wrap `useQuery(api.X.Y)` which is already typed. The factory just adds toast/error handling around a typed mutation reference. The existing `useProtectedMutation.ts` already does this correctly.
4. **For mutations**, use a higher-order function pattern that wraps a concrete handler, not a factory that generates the entire `mutation()` call. Example:
   ```typescript
   // SAFE: wraps a concrete mutation with auth
   export const create = mutation({
     args: { token: v.string(), name: v.string(), ...entityArgs },
     handler: withAuth(["admin"], async (ctx, args, user) => {
       // entity-specific logic
     }),
   });
   ```
5. Measure the actual boilerplate. The "200+ lines of boilerplate" in queries is across 31 files averaging ~50 lines each. Most of those lines are entity-specific (search logic, index usage, filter conditions). The truly duplicated part (list + get) is ~15 lines per entity. A codegen script saves ~450 lines total but adds a build step. Weigh this against complexity.

**Detection (warning signs):**
- After factory introduction, hover over `useQuery(api.X.Y.list)` in VS Code -- if return type shows `any` or `FunctionReturnType<...>` instead of concrete document type, the chain is broken
- `npm run type-check` passes but runtime errors appear ("Cannot read property 'name' of undefined")
- New developers cannot discover available query arguments via autocomplete

**Phase:** Factory/Consolidation phase. Critical architectural decision that affects all subsequent work.

**Sources:** [End-to-End TypeScript with Convex](https://stack.convex.dev/end-to-end-ts), [TypeScript Best Practices (Convex)](https://docs.convex.dev/understanding/best-practices/typescript)

---

### Pitfall 4: Breaking Production During 167 Optional Field Cleanup

**What goes wrong:** You audit the 167 `v.optional()` fields and decide many should be required (e.g., `orders.confirmedAt` should always exist on confirmed orders). You make them required in the schema. Deploy fails because historical documents lack those fields. Or worse: you add default values in mutations but miss one code path, and new documents are created without the field, failing schema validation.

**Why it happens:** Convex validates all documents against the schema at deploy time. Making a field required means EVERY existing document must have that field set. In this codebase, many optional fields were added incrementally over multiple PRDs (PRD-0 through PRD-8, Kitchen Workflow, BOM Refactor). Fields like `orders.confirmedAt` were added in later PRDs and only exist on orders created after that feature shipped.

Specific examples from the schema:
- `orders.confirmedAt` -- only exists on orders confirmed after the revenue recognition feature
- `orders.cancelledAt` -- only exists on cancelled orders
- `menuProducts.productType` -- added in BOM Refactor, only exists on products that ran the `bomRefactorV2:cleanSlateAndSeed` migration
- `orderItems.packageStatus` -- added in PRD-6, only on recent orders
- `componentTypes.consumptionStage` -- added in Kitchen Workflow

**Consequences:** Deploy rejection, blocking the entire release pipeline.

**Prevention:**
1. Categorize optional fields into three buckets before touching any:
   - **Legitimately optional:** Field that may or may not exist (e.g., `orders.notes`, `customers.phone`). Keep `v.optional()`.
   - **Should be required, all docs have it:** Field that every document already has (e.g., `ingredients.costPerBaseUnit`). Safe to make required after verification.
   - **Should be required, but historical docs lack it:** Field that only exists on recent documents. Requires backfill migration BEFORE making required.
2. For each field you want to make required, run a diagnostic query first:
   ```typescript
   // Count documents missing the field
   const missing = await ctx.db.query("orders")
     .filter(q => q.eq(q.field("confirmedAt"), undefined))
     .collect();
   console.log(`${missing.length} orders missing confirmedAt`);
   ```
3. Write backfill mutations for category 3 fields. Run them on dev first, verify, then production.
4. Batch the changes: make 5-10 fields required per deploy, not all 167 at once.

**Detection (warning signs):**
- `npx convex deploy` fails immediately after making a field required
- `npx convex dev` shows schema validation errors in the terminal
- Grep for `v.optional` shows fields that semantically should not be optional (timestamps on entities that always have them)

**Phase:** Schema Cleanup phase. Requires preliminary audit phase to categorize all 167 fields.

---

### Pitfall 5: Import Path Breakage During Large File Moves

**What goes wrong:** You reorganize the file structure (e.g., moving `convex/orders/helpers/ballDistribution.ts` to `convex/orders/production/ballDistribution.ts`). 74 frontend files import from `convex/_generated/api` which auto-regenerates based on file paths. But internal imports between Convex files break silently. Or worse: the `_generated/api.d.ts` path changes (e.g., `api.orders.helpers.ballDistribution` becomes `api.orders.production.ballDistribution`) and every frontend file using the old path breaks.

**Why it happens:** Convex's `_generated/api.d.ts` mirrors the file structure exactly. Line 66: `"orders/helpers/ballDistribution": typeof orders_helpers_ballDistribution`. Moving files changes the API path. The 51 frontend files that import from `_generated/api` reference these paths. The 320+ `query()`/`mutation()` calls across 75 backend files have internal relative imports that also break.

**Consequences:**
- `npm run build` fails with hundreds of import errors
- `npx convex dev` regenerates `api.d.ts` with new paths, causing a cascade of frontend type errors
- Git diff becomes enormous and unreviable
- Partial moves leave the codebase in an inconsistent state

**Prevention:**
1. **Do NOT move files in the `convex/` directory unless absolutely necessary.** The Convex API path is a public interface consumed by the entire frontend. Renaming it is a breaking change.
2. If you must move files, do it in one atomic commit with a find-and-replace of all import paths. Use `npm run type-check` immediately after.
3. **Frontend files are safer to move** because they only import from `convex/_generated/api` (not each other, typically). But still update all 51 files that reference the moved hook.
4. For the barrel export in `src/hooks/convex/index.ts` (369 lines), any renamed hook must be updated there AND in every consuming page.
5. Run `npm run build` after every file move, not just at the end.

**Detection (warning signs):**
- `npx convex dev` terminal shows "Module not found" errors
- `api.d.ts` changes unexpectedly in git diff
- TypeScript errors reference paths that look correct but point to moved files

**Phase:** Any restructuring phase. Prefer refactoring file contents over moving files.

---

## Moderate Pitfalls

### Pitfall 6: Convex Mutation Transaction Limits During Large Backfills

**What goes wrong:** You write a migration mutation to backfill a field on all orders (e.g., setting `productType: "food"` on all `menuProducts`). The mutation tries to update more than ~8,192 documents in a single transaction. Convex rejects it with a transaction size limit error.

**Why it happens:** Convex mutations run in serializable transactions with document count limits. The existing `bomRefactorV2:cleanSlateAndSeed` migration already hit this pattern -- it deletes reservations, transactions, batches, stock, BOM links, and component types all in one mutation. With production data growth, this will eventually fail.

**Prevention:**
1. Always paginate migration mutations. Use `batchSize` parameter (the existing `backfillOrderItemProduction` already does this with `args.batchSize ?? 100`).
2. Use the [Convex Migrations Component](https://www.convex.dev/components/migrations) for large-scale migrations. It handles pagination, progress tracking, and resumability.
3. Test migrations on dev environment with production-like data volume first.
4. Add `dryRun` parameter to every migration (existing migrations already do this -- good pattern to maintain).

**Detection (warning signs):**
- Migration mutation returns "Transaction too large" error
- Migration runs successfully on dev (small dataset) but fails on production
- Document counts per table exceed 1,000

**Phase:** Any phase that involves data migration or backfill.

**Sources:** [Stateful Online Migrations using Mutations](https://stack.convex.dev/migrating-data-with-mutations), [Convex Migrations Component](https://www.convex.dev/components/migrations)

---

### Pitfall 7: Abstracting Away Entity-Specific Logic in CRUD Factories

**What goes wrong:** You build a generic `<EntityManager<T>>` component to replace `IngredientsManager.tsx`, `MaterialsManager.tsx`, and `CustomersManager.tsx`. The first two work perfectly (they are nearly identical at 329 lines each). But customers have `getByPhone` query, ingredients have deletion checks against `componentIngredients`, and materials have deletion checks against `packagingComponentMaterials`. These entity-specific behaviors don't fit the generic abstraction. You end up with a factory that has more configuration options than the original code, or you keep "escape hatches" that defeat the purpose.

**Why it happens:** The CONCERNS.md identifies "200+ lines of boilerplate" but the actual shared code per entity is ~15 lines for queries and ~30 lines for mutations. The remaining lines are:
- Entity-specific search logic (ingredients search by name+brand, customers by name+phone)
- Entity-specific deletion validation (ingredients check `componentIngredients`, materials check `packagingComponentMaterials`)
- Entity-specific computed fields (ingredients calculate `costPerBaseUnit`, materials calculate the same)
- Entity-specific UI columns and form fields

**Prevention:**
1. Before building any factory, make a table of what's actually shared vs. entity-specific:

   | Pattern | Shared | Entity-Specific |
   |---------|--------|-----------------|
   | `list` query | `ctx.db.query(table).order("desc").take(limit)` | Table name |
   | `get` query | `ctx.db.get(args.id)` | ID type |
   | `search` query | Filter + slice | Which fields to search, what indexes to use |
   | `create` mutation | `ctx.db.insert(table, data)` | Computed fields (costPerBaseUnit), validation |
   | `delete` mutation | `ctx.db.delete(args.id)` | Foreign key checks (different per entity) |
   | Frontend hook | `useQuery` + `useMutation` + toast | Transform functions, return types |
   | Manager page | Table + dialog + form | Column definitions, form fields, validation |

2. Extract ONLY the truly shared parts. A `makeListQuery(tableName)` and `makeGetQuery(tableName)` save 15 lines each across 10+ entities = 150 lines. That is worth it. A `makeEntityManager<T>(config)` that needs 50 lines of configuration per entity is NOT worth it.
3. Prefer composition over configuration. Make small reusable pieces (a generic table component, a generic dialog wrapper) rather than one mega-factory.

**Detection (warning signs):**
- Factory configuration object is longer than the original entity-specific code
- You keep adding `if (entityType === "ingredients")` branches inside the factory
- TypeScript generics become deeply nested (`EntityManager<T extends BaseEntity, C extends Config<T>, ...>`)
- New team members cannot understand how to add a new entity

**Phase:** Factory/Consolidation phase. Start with smallest possible extraction, measure savings, expand only if justified.

---

### Pitfall 8: camelCase/snake_case Transform Layer Hides Bugs

**What goes wrong:** The codebase has a transform layer in hooks like `useOrders.ts` that converts Convex camelCase (`orderNumber`, `unitPrice`) to legacy snake_case (`order_number`, `unit_price`). During refactoring, you either (a) miss adding a field to the transform, causing `undefined` in the UI, or (b) refactor away the transform layer, breaking all 19 pages that consume snake_case data.

**Why it happens:** The transform layer exists because the frontend was originally built against a FastAPI + SQLAlchemy backend (snake_case convention). When migrated to Convex (camelCase convention), adapter hooks were added to maintain backwards compatibility. Files affected:
- `src/hooks/convex/useOrders.ts` (transforms order data)
- `src/hooks/convex/useKitchenStats.ts` (transforms kitchen data)
- `src/hooks/convex/usePendingBallStats.ts` (transforms ball stats)
- `src/hooks/convex/useCustomers.ts`, `useDashboard.ts` (transform customer data)
- `src/lib/types.ts` (defines snake_case interfaces like `OrderDetail`, `OrderItem`)
- `src/lib/transforms.ts` (shared transform utilities)

**Prevention:**
1. Do NOT remove the transform layer as part of a refactoring effort. It touches every page and every component. This is a separate, dedicated migration.
2. If you do decide to standardize on camelCase, do it as its own phase with a clear scope: update `src/lib/types.ts` interfaces first, then update all consuming components (19 pages), then remove transforms.
3. When adding new fields during refactoring, add them to BOTH the Convex schema AND the transform function. The transform functions in `useOrders.ts` (lines 154-224) must be kept in sync.
4. Use TypeScript's `satisfies` operator to ensure transforms map all fields:
   ```typescript
   const result = { order_number: order.orderNumber, ... } satisfies OrderDetail;
   ```

**Detection (warning signs):**
- UI shows `undefined` for a field that has data in the database
- New field works on backend but not on frontend
- TypeScript does not error because the interface uses optional types

**Phase:** Any phase that touches data shapes. Specifically relevant during deprecated field removal.

---

### Pitfall 9: Test-Free Refactoring of Ball Distribution Algorithm

**What goes wrong:** You refactor the 342-line `ballDistribution.ts` to remove deprecated field references or consolidate with the new BOM system. The refactoring introduces a subtle bug in the priority sorting or partial fill logic. Kitchen production silently allocates balls to wrong orders for days before anyone notices.

**Why it happens:** The ball distribution algorithm has ZERO unit tests (confirmed in CONCERNS.md and TESTING.md). It has complex business logic:
- Fetches eligible orders (Confirmed + InProduction)
- Sorts by priority (due date ASC, total units DESC, order date ASC)
- Distributes balls across orders using production records
- Tracks partial fills with `updatedUnitsRemaining` Map
- Auto-transitions order status (Confirmed -> InProduction -> Packaging)
- Updates both `orderItemProduction` records (source of truth) AND `orderItems.ballsFilled`/`packageStatus` (UI display)

Any change to this file is high risk because there is no safety net.

**Prevention:**
1. Write comprehensive tests for `ballDistribution.ts` BEFORE any refactoring. Cover:
   - Single order, single ball type
   - Multiple orders with priority sorting
   - Partial fills (overflow)
   - Status transitions (Confirmed -> InProduction, InProduction -> Packaging)
   - Combo products (orders needing both BIG_BALL and MID_BALL)
   - Edge case: zero count input
   - Edge case: cancelled production records (should be skipped)
2. Use snapshot testing: capture the exact output of `distributeBallsToOrders()` with known inputs, then verify the output doesn't change after refactoring.
3. The algorithm depends on database state (orders, orderItems, orderItemProduction). Use `convex-test` to set up realistic fixtures.

**Detection (warning signs):**
- Kitchen staff reports "wrong balls in tray" or "order completed but still shows pending"
- `orderItemProduction.unitsRemaining` goes negative
- Orders skip the InProduction status (go directly from Confirmed to Packaging)

**Phase:** Testing phase. Must happen BEFORE any refactoring of production tracking code.

---

### Pitfall 10: FIFO Inventory Corruption During Reservation Refactoring

**What goes wrong:** You refactor the inventory integration to consolidate `reserveStockForOrderInternal`, `consumeMaterialsByStageInternal`, and `releaseReservationInternal` (all in `inventoryIntegration.ts`, 618 lines). The refactoring introduces an off-by-one error in FIFO batch selection or reservation accounting. Reserved stock is double-consumed or never released, causing phantom stock shortages.

**Why it happens:** The inventory system has a two-phase commit pattern:
1. **Reserve:** On order confirmation, reserve packaging components from FIFO batches (`inventoryBatches.quantityReserved += toReserve`)
2. **Consume:** At boxing/labeling stages, consume reserved stock (`quantityRemaining -= consumed`)
3. **Release:** On cancellation, unreserve stock (`quantityReserved -= toUnreserve`)

The `componentStock` table is an aggregated view recomputed by `updateComponentStock()`. If the aggregation step is missed or runs out of order, stock levels diverge from reality. The current code calls `updateComponentStock()` after every batch update (6 locations in `inventoryIntegration.ts`), and missing any one causes stale aggregates.

**Prevention:**
1. Add integration tests for the full reserve -> consume -> release cycle before refactoring.
2. If consolidating the three stage consumption functions, ensure the `updateComponentStock()` call happens AFTER every batch modification, not just at the end.
3. Add a consistency check mutation that compares `componentStock.totalStock` against `SUM(inventoryBatches.quantityRemaining)` for the same component+location. Run it periodically.
4. The `consumeBatchMaterials` function (for non-order batch operations) follows a different path than `consumeMaterialsByStageInternal` (for per-order consumption). Do not accidentally merge these -- they have different semantics.

**Detection (warning signs):**
- Stock levels show negative available
- `componentStock.totalReserved` exceeds `componentStock.totalStock`
- Orders fail to confirm with "Stok kemasan tidak cukup" but manual check shows stock exists
- `inventoryBatches` records show `quantityReserved > quantityRemaining`

**Phase:** Inventory consolidation phase. Requires integration tests first.

---

## Minor Pitfalls

### Pitfall 11: Convex Dynamic Import Gotcha in Refactored Modules

**What goes wrong:** While consolidating helper modules, you introduce a dynamic `import()` for code splitting. It works in local dev (`npx convex dev`) but fails silently in production (returns 204 No Content).

**Prevention:** Already documented in CLAUDE.md pitfall #8: "No dynamic imports in Convex -- Static imports only. Dynamic `import()` works locally but fails silently in production." Ensure all code reviews check for dynamic imports in `convex/` directory. Use `import ... from` exclusively.

**Phase:** Any consolidation phase that moves or merges Convex backend files.

---

### Pitfall 12: React Hooks Order Violation During Component Refactoring

**What goes wrong:** While extracting shared logic from page components, you accidentally place a hook call after a conditional return. React throws "Rendered more hooks than during the previous render" error, crashing the page.

**Prevention:** Already documented in CLAUDE.md pitfall #9. When extracting components, always verify: all `useQuery`, `useMutation`, `useState`, `useEffect` calls come BEFORE any `if (data === undefined) return <Loading />` checks. The existing pattern in all 21 hooks files is correct -- maintain it.

**Phase:** Any frontend refactoring phase.

---

### Pitfall 13: Losing Deprecated Status Values in Schema Union

**What goes wrong:** You remove `ProductionComplete` and `Packaging` from the `orders.status` union in the schema. Historical orders with those statuses now violate the schema. Deploy is rejected.

**Prevention:**
1. Keep deprecated status values in the schema union with comments. They are needed for historical data.
2. Run the existing `migratePackagingToBoxed` migration first (already exists in `convex/orders/mutations/migrations.ts:310`).
3. Verify zero orders exist with deprecated statuses before removing from union:
   ```typescript
   const packagingOrders = await ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "Packaging")).collect();
   const pcOrders = await ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "ProductionComplete")).collect();
   ```
4. Only remove from the union AFTER the count is zero on production.

**Phase:** Schema Cleanup phase, after status migrations complete.

---

### Pitfall 14: Forgetting the `productionUnitTypes` to `componentTypes` Bridge

**What goes wrong:** You try to simplify the BOM system by removing the `productionUnitTypes` table (since `componentTypes` already has production components). But `orderItemProduction.productionUnitTypeId` is a required `v.id("productionUnitTypes")` field, creating a hard foreign key dependency. Removing the table breaks all production tracking.

**Why it happens:** The codebase has a bridge pattern documented in `productionRecords.ts:178`: "This bridge MUST stay because orderItemProduction.productionUnitTypeId is REQUIRED (v.id, not optional)." The `createProductionRecordsForItem` function looks up `productionUnitTypes` by matching `componentType.code`.

**Prevention:**
1. Do not remove `productionUnitTypes` table without migrating `orderItemProduction.productionUnitTypeId` to point to `componentTypes` instead.
2. That migration requires: add new optional field `componentTypeId` to `orderItemProduction`, backfill it, make it required, then make `productionUnitTypeId` optional, then remove it. Four deploys minimum.
3. Consider whether the simplification is worth the migration cost. The bridge works and has clear documentation.

**Phase:** Schema Cleanup phase, if table consolidation is attempted.

---

### Pitfall 15: Barrel Export Circular Dependencies

**What goes wrong:** The `src/hooks/convex/index.ts` barrel file (369 lines) re-exports everything from 25 hook files. During refactoring, moving a hook to import from another hook creates a circular dependency through the barrel. Webpack/Vite handles it at runtime (tree shaking), but TypeScript may emit incorrect types or the dev server may hot-reload incorrectly.

**Prevention:**
1. Hook files should import from `convex/_generated/api` directly, never from the barrel `./index.ts`.
2. If hooks need to share types, create a separate `types.ts` file in `src/hooks/convex/` rather than importing from another hook through the barrel.
3. After any hook restructuring, run `npm run build` to verify no circular dependency issues.

**Phase:** Frontend consolidation phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Priority |
|-------------|---------------|------------|----------|
| **Schema Cleanup** | Deploy rejection on field removal (#1, #4, #13) | Always: make optional -> clear data -> remove field. Three deploys minimum per field. | Critical |
| **Deprecated Field Migration** | Dual tracking inconsistency (#2) | Map all 19 frontend + 10 backend read sites. Migrate reads before stopping writes. | Critical |
| **Factory/Consolidation** | Type safety loss from generic factories (#3) | Use codegen for backend, composition for frontend. No runtime factories for Convex queries. | Critical |
| **Factory/Consolidation** | Over-abstraction of entity-specific logic (#7) | Measure actual shared code before building factory. Start with smallest extraction. | Moderate |
| **Testing Phase** | Untested critical algorithms (#9) | Write tests for ballDistribution.ts and FIFO before refactoring those files. | Critical |
| **Inventory Consolidation** | FIFO reservation corruption (#10) | Integration tests for reserve -> consume -> release cycle. Add consistency check mutation. | Moderate |
| **Any Backend Restructuring** | Dynamic import failure in production (#11) | Code review: no dynamic `import()` in `convex/` directory. | Low |
| **Any Frontend Refactoring** | React hooks order violation (#12) | Hooks before conditionals. Verified by existing patterns. | Low |
| **Schema Consolidation** | productionUnitTypes bridge dependency (#14) | Do not remove table without 4-deploy migration plan. | Moderate |
| **Transform Layer** | camelCase/snake_case bugs (#8) | Do not touch transform layer during refactoring. Separate dedicated phase. | Moderate |
| **File Moves** | API path breakage in `_generated/api.d.ts` (#5) | Avoid moving files in `convex/` directory. Prefer refactoring contents. | Critical |
| **Data Migration** | Transaction size limits (#6) | Paginate all migration mutations. Use Convex Migrations Component for large tables. | Moderate |

---

## Recommended Phase Ordering Based on Pitfalls

1. **Testing First** -- Write tests for ballDistribution.ts, FIFO logic, and production records BEFORE any refactoring. This is the safety net everything else depends on.
2. **Deprecated Field Migration** -- Migrate all reads from old fields to new BOM system. Keep writes in parallel. This eliminates the dual tracking risk.
3. **Small Factories** -- Extract only the obvious wins (list/get query factories via codegen, shared mutation auth wrapper). Measure before expanding.
4. **Schema Cleanup** -- After all code stops reading deprecated fields and migrations have cleared data, remove fields from schema in batches of 5-10.
5. **Frontend Consolidation** -- Extract shared UI components (table, dialog, form patterns). Do NOT attempt to unify the camelCase/snake_case transform layer in this effort.

---

## Sources

- [Intro to Migrations (Convex)](https://stack.convex.dev/intro-to-migrations) -- Field removal process, dual-write/dual-read strategies
- [Zero-Downtime Migrations (Convex)](https://stack.convex.dev/zero-downtime-migrations) -- Schema-data consistency enforcement
- [Lightweight Migrations (Convex)](https://stack.convex.dev/lightweight-zero-downtime-migrations) -- Optional field strategies, transaction limits
- [Stateful Online Migrations (Convex)](https://stack.convex.dev/migrating-data-with-mutations) -- Paginated mutation backfills
- [Convex Migrations Component](https://www.convex.dev/components/migrations) -- Large-scale migration tooling
- [End-to-End TypeScript with Convex](https://stack.convex.dev/end-to-end-ts) -- Type safety chain, API generation
- [TypeScript Best Practices (Convex)](https://docs.convex.dev/understanding/best-practices/typescript) -- Type inference requirements
- [Refactoring TypeScript at Scale](https://stefanhaas.dev/blog/refactoring-at-scale/) -- Code mod strategies for large codebases
- Codebase analysis: `convex/schema.ts` (1227 lines, 37 tables, 210 optional fields), `src/hooks/convex/` (25 hook files, 369-line barrel export), `convex/_generated/api.d.ts` (100+ module imports)

---

*Pitfalls research: 2026-02-13*

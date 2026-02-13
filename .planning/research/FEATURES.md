# Feature Landscape: Codebase Cleanup & Refactoring

**Domain:** TypeScript factory patterns, CRUD boilerplate reduction, deprecated code removal
**Researched:** 2026-02-13
**Overall confidence:** HIGH (patterns derived from direct codebase analysis + verified Convex documentation)

---

## Evidence Summary

### Current Boilerplate Inventory (from codebase analysis)

| Layer | Files | Avg Lines/File | Boilerplate % | Key Duplication |
|-------|-------|----------------|---------------|-----------------|
| Queries | 30 files | ~50 lines | ~80% for simple CRUD | `list`, `get`, `search` nearly identical across ingredients, materials, tags, customers, storageLocations |
| Mutations | 27 files | ~100 lines | ~70% for simple CRUD | `create`, `update`, `remove` with get-validate-patch pattern repeated |
| Hooks | 21 files | ~80 lines | ~90% for simple CRUD | `useConvex{Entity}`, `useConvexCreate{Entity}` with toast wrapper pattern identical |
| Manager Pages | ~10 files | ~300 lines | ~50% structural | State management, form handling, delete dialog pattern identical between IngredientsManager and MaterialsManager |

### Specific Pattern Evidence

**ingredients/queries.ts vs materials/queries.ts:** Structurally identical. Only differences: table name (`"ingredients"` vs `"packagingMaterials"`), field names in search filter (`brand` vs `brand`), and variable names.

**useIngredients.ts vs useMaterials.ts:** 115 lines each, structurally identical. Every hook follows:
```typescript
export function useConvex{Action}{Entity}() {
  const mutation = useMutation(api.{entity}.mutations.{action});
  const execute = async (data: {Input}) => {
    try {
      const result = await mutation(data);
      toast.success("{Entity} {action}d successfully");
      return result;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to {action} {entity}"));
      throw error;
    }
  };
  return { mutate: execute, mutateAsync: execute };
}
```

**IngredientsManager.tsx vs MaterialsManager.tsx:** First 80 lines are structurally identical. Same state management pattern, same form structure, same delete dialog pattern.

---

## Table Stakes

Features that are expected in a proper codebase cleanup. Missing any of these means the refactor is incomplete.

### 1. Backend Query Factory (`convex/lib/queryFactory.ts`)

| Aspect | Details |
|--------|---------|
| **Why Expected** | 15+ query files with identical `list`/`get`/`search` patterns. Standard DRY principle. |
| **Complexity** | Medium |
| **Dependencies** | None. Can be built first. |
| **Confidence** | HIGH -- Convex `convex-helpers/server/crud` proves this pattern is officially supported. |

**Pattern:** Use `convex-helpers/server/crud` as foundation, extend with project-specific patterns.

```typescript
// convex/lib/queryFactory.ts
import { crud } from "convex-helpers/server/crud";
import schema from "../schema";
import { query } from "../_generated/server";
import { v } from "convex/values";

// For simple entities: use convex-helpers CRUD directly
// In convex/tags/queries.ts:
export const { read, paginate } = crud(schema, "tags");

// For entities needing search, extend with a search factory:
export function createSearchQuery<TableName extends string>(
  tableName: TableName,
  searchFields: string[]
) {
  return query({
    args: { query: v.string(), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
      const limit = args.limit ?? 20;
      const searchLower = args.query.toLowerCase();
      const all = await ctx.db.query(tableName as any).collect();
      return all
        .filter((doc: any) =>
          searchFields.some((field) =>
            (doc[field] ?? "").toLowerCase().includes(searchLower)
          )
        )
        .slice(0, limit);
    },
  });
}

// Usage in convex/ingredients/queries.ts:
// export const search = createSearchQuery("ingredients", ["name", "brand"]);
```

**Caveat:** Convex's type system for `query()` and `mutation()` requires that each exported function is a direct call to `query()` or `mutation()`. Factory functions that return `query()`/`mutation()` results work fine. But you cannot dynamically construct the table name at runtime without losing type safety. The `crud()` helper handles this correctly.

**What NOT to do:** Do not try to create a single generic file that dynamically generates all CRUD for all tables. Convex requires explicit exports per file. The factory produces the handlers, but you still need a thin file per entity that calls the factory and re-exports.

### 2. Hook Toast Wrapper Factory (`src/hooks/convex/createCrudHooks.ts`)

| Aspect | Details |
|--------|---------|
| **Why Expected** | 21 hook files with identical toast-wrapper pattern. The `useProtectedMutation` hook already demonstrates this pattern works. |
| **Complexity** | Low |
| **Dependencies** | Depends on backend queries/mutations existing (but no code dependency on query factory). |
| **Confidence** | HIGH -- `useProtectedMutation.ts` already proves the pattern in this codebase. |

**Pattern:** Generic hook factory that wraps any Convex mutation with toast notifications.

```typescript
// src/hooks/convex/createMutationHook.ts
import { useMutation } from "convex/react";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

export function createMutationHook<
  Mutation extends FunctionReference<"mutation">
>(
  mutationRef: Mutation,
  entityName: string,
  action: "created" | "updated" | "deleted"
) {
  return function useMutationHook() {
    const mutation = useMutation(mutationRef);
    const execute = async (args: FunctionArgs<Mutation>): Promise<FunctionReturnType<Mutation>> => {
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

// Usage in useIngredients.ts:
// export const useConvexCreateIngredient = createMutationHook(
//   api.ingredients.mutations.create, "Ingredient", "created"
// );
```

**Result:** Each entity hook file shrinks from ~115 lines to ~15-25 lines (imports + factory calls + type exports).

### 3. Deprecated Field Audit & Documentation

| Aspect | Details |
|--------|---------|
| **Why Expected** | Schema has DEPRECATED comments on `menuProducts.productionType`, `menuProducts.productionUnits`, `orderItems.productionType`, `orderItems.productionUnits`, `orders.status` values (`ProductionComplete`, `Packaging`). Without a tracking document, deprecated fields linger indefinitely. |
| **Complexity** | Low |
| **Dependencies** | None. Pure documentation task. |
| **Confidence** | HIGH -- standard engineering practice. |

**Current deprecated fields identified from schema.ts:**
1. `menuProducts.productionType` (string) -- replaced by BOM
2. `menuProducts.productionUnits` (number) -- replaced by BOM
3. `orderItems.productionType` (string) -- replaced by BOM
4. `orderItems.productionUnits` (number) -- replaced by BOM
5. `orders.status = "ProductionComplete"` -- replaced by `Boxed`
6. `orders.status = "Packaging"` -- replaced by `Boxed`

**Deliverable:** A `DEPRECATED_FIELDS.md` tracking: field, reason deprecated, replacement, migration status, safe-to-remove date.

### 4. Production Count Consolidation (productionCounts -> productionLog-derived)

| Aspect | Details |
|--------|---------|
| **Why Expected** | Dual source of truth: `productionCounts` table (running tallies) AND `productionLog` table (event log). The log already has `getDailySummary` that aggregates from events. Running tallies drift and need manual resets. Event-sourced is the correct architecture. |
| **Complexity** | High |
| **Dependencies** | Requires migration of kitchen.ts mutations, KitchenViewV2, BoxingPanel, StickeringPanel, GoFoodPackingCard, ProductionLogPanel. |
| **Confidence** | MEDIUM -- the pattern is sound, but the `productionCounts` table has `shippedToGoldfinch` tracking and `lastResetAt`/`lastResetBy` that need migration thought. |

**Current dual tracking in codebase:**
- `productionCounts` table: 3 fields (`boxed`, `stickered`, `packed`) + `shippedToGoldfinch` + reset tracking
- `productionLog` table: event log with `box`/`unbox`/`sticker`/`unsticker`/`pack`/`unpack` actions
- Kitchen mutations write to BOTH tables simultaneously
- `productionLog/queries.ts:getDailySummary` already aggregates from log

**Migration approach:**
1. New query: `getProductionCountsFromLog(menuProductId)` -- aggregates log entries since last reset
2. Verify parity with existing `productionCounts` data
3. Switch reads to log-derived query
4. Remove writes to `productionCounts` table
5. Mark table as deprecated, eventually remove

**Risk:** Performance. Aggregating from `productionLog` for every product on every kitchen page load could be slow with large log tables. May need a caching layer or periodic snapshot.

### 5. Remove `useConvex` Prefix Convention

| Aspect | Details |
|--------|---------|
| **Why Expected** | Every hook is prefixed `useConvex` (e.g., `useConvexIngredients`, `useConvexCreateIngredient`). This was useful during migration from another backend but is now noise -- the entire app uses Convex exclusively. |
| **Complexity** | Low (find-and-replace) but tedious (369 export references in barrel file, all consumers) |
| **Dependencies** | Should be done LAST in the cleanup, after factory refactor, to avoid merge conflicts. |
| **Confidence** | MEDIUM -- cosmetic but improves DX significantly. Some teams prefer keeping the prefix for clarity. |

**Decision:** Defer to team preference. If done, rename in one pass using TypeScript's rename symbol feature or a codemod.

---

## Differentiators

Features that make this refactor pay off long-term. Not strictly required but dramatically improve maintainability.

### 6. `customQuery` / `customMutation` with Auth Injection

| Aspect | Details |
|--------|---------|
| **Value Proposition** | Eliminates repetitive `token: v.string()` + `requireRole()` pattern from every protected mutation. Auth becomes a declarative concern, not imperative boilerplate. |
| **Complexity** | Medium |
| **Dependencies** | Requires installing `convex-helpers` package. |
| **Confidence** | HIGH -- officially documented pattern from Convex team. |

**Pattern:** Create project-specific `authedMutation` and `authedQuery` builders.

```typescript
// convex/lib/functions.ts
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser, requireRole, type UserRole } from "./auth";

// Authenticated mutation: auto-injects user from token
export const authedMutation = customMutation(mutation, {
  args: { token: v.string() },
  input: async (ctx, { token }) => {
    const user = await getSessionUser(ctx, token);
    if (!user) throw new Error("Session expired");
    if (!user.isActive) throw new Error("Account deactivated");
    return { ctx: { user }, args: {} };
  },
});

// Role-restricted mutation: requires specific roles
export function roleRestrictedMutation(allowedRoles: UserRole[]) {
  return customMutation(mutation, {
    args: { token: v.string() },
    input: async (ctx, { token }) => {
      const user = await requireRole(ctx, token, allowedRoles);
      return { ctx: { user }, args: {} };
    },
  });
}

// Usage in convex/vouchers/mutations.ts:
// export const create = roleRestrictedMutation(["admin"])({
//   args: { name: v.string(), ... },
//   handler: async (ctx, args) => {
//     // ctx.user is available, no token handling needed
//     await ctx.db.insert("vouchers", { ...args, createdBy: ctx.user.name });
//   },
// });
```

**Impact:** Removes ~5 lines of auth boilerplate from every protected mutation (currently ~20 mutations). Prevents auth bugs (forgetting to check token). Makes role requirements declarative and visible.

### 7. Generic Entity Manager UI Component

| Aspect | Details |
|--------|---------|
| **Value Proposition** | IngredientsManager and MaterialsManager are 300+ lines each with ~50% identical structural code. A generic `EntityManager<T>` component with column config + form config could reduce each to ~50 lines of configuration. |
| **Complexity** | High |
| **Dependencies** | Depends on FormBuilder (already exists), hook factory (table stakes #2). |
| **Confidence** | MEDIUM -- the existing `FormBuilder` component handles forms well. The challenge is the table/list display and edit-in-place pattern, which varies more across entities. |

**Pattern:**

```typescript
// src/components/shared/EntityManager.tsx
interface EntityManagerProps<T extends { _id: string }> {
  title: string;
  // Data
  items: T[] | undefined;
  // Columns for list display
  columns: ColumnDef<T>[];
  // Form configuration
  formSections: FormSection<Omit<T, "_id" | "_creationTime">>[];
  // CRUD hooks
  onCreate: (data: any) => Promise<any>;
  onUpdate: (data: any) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
  // Optional customization
  searchPlaceholder?: string;
  emptyMessage?: string;
  deleteConfirmMessage?: (item: T) => string;
}
```

**Caveat:** Entities like Orders, Recipes, Products have complex enough UIs that they will never use this component. This is specifically for "admin CRUD" pages: Ingredients, Materials, Tags, Storage Locations, Component Types, Vouchers. Estimate 6-8 pages could use it.

### 8. Schema-Derived Types (Eliminate Manual Type Duplication)

| Aspect | Details |
|--------|---------|
| **Value Proposition** | Currently, hook files manually define types like `ConvexIngredient`, `IngredientCreateInput` that duplicate the schema. Convex auto-generates `Doc<"ingredients">` types. Using these eliminates type drift. |
| **Complexity** | Low |
| **Dependencies** | None. |
| **Confidence** | HIGH -- `Doc<"tableName">` is the official Convex pattern. Already used in `useVouchers.ts` (`type Voucher = Doc<"vouchers">`). |

**Current problem:**
```typescript
// useIngredients.ts -- manually defined, can drift from schema
export interface ConvexIngredient {
  _id: Id<"ingredients">;
  _creationTime: number;
  name: string;
  brand?: string;
  // ... 8 more fields
}
```

**Solution:**
```typescript
// Use Convex-generated types directly
import type { Doc } from "../../../convex/_generated/dataModel";
export type Ingredient = Doc<"ingredients">;
// No manual interface needed
```

**Impact:** Removes ~20 lines of manual type definitions per hook file (across ~10 files with manual types = ~200 lines removed). Eliminates type drift bugs.

---

## Anti-Features

Things to deliberately NOT do during this cleanup milestone.

### A1. Do NOT Create a Monolithic "Super CRUD" Module

| Anti-Feature | Details |
|--------------|---------|
| **Why Avoid** | Tempting to create one `convex/lib/crud.ts` that generates ALL queries/mutations for ALL tables via a single config object. This breaks Convex's module system (each file = a module in the API tree), makes debugging harder (stack traces point to generic code), and loses the ability to add entity-specific logic. |
| **What to Do Instead** | Keep per-entity files, but use factories to generate the boilerplate parts. Entity files become thin wrappers (~10-20 lines) that call factories and add any custom logic. |

### A2. Do NOT Abstract Away Convex Query/Mutation Primitives

| Anti-Feature | Details |
|--------------|---------|
| **Why Avoid** | Creating a custom `db.crud("tableName")` abstraction layer on top of `ctx.db.query()` hides Convex's powerful query builder (indexes, filters, ordering). New developers can't find how to use Convex features because they're hidden behind an abstraction. |
| **What to Do Instead** | Factories should generate standard `query()` and `mutation()` calls with normal `ctx.db` usage inside. The factory output should look like hand-written code. |

### A3. Do NOT Remove Deprecated Fields from Schema Yet

| Anti-Feature | Details |
|--------------|---------|
| **Why Avoid** | The deprecated `productionType`/`productionUnits` fields on `menuProducts` and `orderItems` are still present in production data. Removing them from the schema validator will cause Convex schema push to fail (data still has these fields). Removing data requires a migration. |
| **What to Do Instead** | Phase 1: Document all deprecated fields. Phase 2: Write and run migrations to clear data. Phase 3: Remove from schema. This is a multi-deploy process. |

### A4. Do NOT Build a Generic Pagination System

| Anti-Feature | Details |
|--------------|---------|
| **Why Avoid** | The current codebase uses `.take(limit)` or `.collect()` for all queries. Only 2 tables (orders, productionLog) are large enough to benefit from true cursor-based pagination. Building generic pagination infrastructure is premature. |
| **What to Do Instead** | Keep `.collect()` for small tables. Add cursor pagination to orders/productionLog only if performance degrades. |

### A5. Do NOT Introduce an ORM or Entity Framework

| Anti-Feature | Details |
|--------------|---------|
| **Why Avoid** | Convex Ents (labs.convex.dev/convex-ents) provides an ORM-like layer. But introducing it mid-project means rewriting all existing queries AND learning a new API. The current codebase has 30 query files -- this would be a rewrite, not a cleanup. |
| **What to Do Instead** | Use `convex-helpers` for the specific patterns needed (CRUD, customFunctions). Stay on raw `ctx.db` for everything else. |

### A6. Do NOT Consolidate Production Tracking AND Kitchen Inventory Simultaneously

| Anti-Feature | Details |
|--------------|---------|
| **Why Avoid** | `productionCounts` consolidation (#4 above) touches the same code paths as `kitchenInventory` (ball tray tracking). Changing both simultaneously creates untestable risk in the production kitchen workflow. |
| **What to Do Instead** | Phase the work: consolidate `productionCounts` first, verify, then address `kitchenInventory` in a separate milestone. |

---

## Feature Dependencies

```
                    +---> [#8 Schema-Derived Types] (independent)
                    |
[Install convex-helpers] ---> [#1 Query Factory] ---> [#6 customQuery/customMutation with Auth]
                    |                                        |
                    |                                        v
                    +---> [#2 Hook Toast Factory] ---> [#7 Generic EntityManager UI]
                    |                                        |
                    |                                        v
                    |                               [#5 Remove useConvex prefix]
                    |
[#3 Deprecated Field Audit] ---> [#4 Production Count Consolidation]
                                         |
                                         v
                              [Future: Remove deprecated fields from schema]
```

**Critical path:** Install `convex-helpers` -> Query Factory -> customFunctions auth -> EntityManager UI

**Independent path:** Deprecated Field Audit and Production Count Consolidation can proceed in parallel with the factory work.

---

## Prioritized Implementation Order

### Phase 1: Foundation (LOW risk, HIGH payoff)
1. **Install `convex-helpers`** -- npm dependency
2. **#8 Schema-Derived Types** -- pure cleanup, no behavior change
3. **#3 Deprecated Field Audit** -- documentation only
4. **#2 Hook Toast Factory** -- simplest factory, biggest line reduction

### Phase 2: Backend Factories (MEDIUM risk, HIGH payoff)
5. **#1 Query Factory** -- refactor simple CRUD queries
6. **#6 customQuery/customMutation auth** -- standardize auth pattern

### Phase 3: Frontend Consolidation (MEDIUM risk, MEDIUM payoff)
7. **#7 Generic EntityManager UI** -- reduces page boilerplate
8. **#5 Remove useConvex prefix** -- cosmetic, do last

### Phase 4: Data Consolidation (HIGH risk, HIGH payoff)
9. **#4 Production Count Consolidation** -- event-sourced counts

---

## Complexity Budget

| Feature | Est. Lines Changed | Est. Lines Removed | Risk |
|---------|-------------------|--------------------|------|
| #1 Query Factory | +150 (factory) / -600 (consumers) | Net -450 | Low |
| #2 Hook Toast Factory | +80 (factory) / -1200 (consumers) | Net -1120 | Low |
| #3 Deprecated Audit | +50 (doc) | 0 | None |
| #4 Production Consolidation | +200 / -150 | Net +50 (initially) | High |
| #5 Remove prefix | ~0 (rename) | ~0 | Low |
| #6 Auth customFunctions | +50 (factory) / -200 (consumers) | Net -150 | Medium |
| #7 EntityManager UI | +300 (component) / -1500 (pages) | Net -1200 | Medium |
| #8 Schema Types | ~0 / -200 (manual types) | Net -200 | None |
| **Total** | | **Net -3070 lines** | |

---

## Sources

- [Convex `convex-helpers` CRUD utility](https://github.com/get-convex/convex-helpers) -- Official helper library with CRUD, customFunctions
- [Customizing serverless functions without middleware](https://stack.convex.dev/custom-functions) -- Official guide for `customQuery`/`customMutation`
- [Convex Best Practices (TypeScript)](https://docs.convex.dev/understanding/best-practices/typescript) -- Type safety patterns
- [Intro to Convex Migrations](https://stack.convex.dev/intro-to-migrations) -- Safe field removal and schema evolution
- [Lightweight Zero-Downtime Migrations](https://stack.convex.dev/lightweight-zero-downtime-migrations) -- Dual-write migration patterns
- [Convex Ents Helper Types](https://labs.convex.dev/convex-ents/schema/types) -- Schema-derived type patterns (reference, not recommended for adoption)
- [Materialized View Pattern (Azure)](https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view) -- Event-to-materialized-view pattern for production count consolidation
- Direct codebase analysis of 30 query files, 27 mutation files, 21 hook files, 10+ page components

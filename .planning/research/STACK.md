# Technology Stack: Refactoring & Cleanup

**Project:** Frollie Recipe Master -- Codebase Cleanup & Refactoring
**Researched:** 2026-02-13
**Overall Confidence:** HIGH (verified with official docs, npm registry, and Convex documentation)

---

## 1. Refactoring Tools

### Recommended Stack

| Tool | Version | Purpose | Confidence |
|------|---------|---------|------------|
| `ts-morph` | ^27.0.2 | Programmatic TypeScript AST transforms for large-scale code changes | HIGH |
| `@convex-dev/codemod` | latest | Convex-specific migration for db.get/patch/replace/delete table-name-first syntax | HIGH |
| `@convex-dev/eslint-plugin` | ^1.1.0 | ESLint rule `@convex-dev/explicit-table-ids` for ongoing enforcement | HIGH |

### Why ts-morph (not jscodeshift)

**ts-morph** wraps the TypeScript Compiler API, giving access to **type information** during transforms. This is critical for Frollie because:

1. **Convex IDs are typed** (`Id<"ingredients">` vs `Id<"orders">`). ts-morph can resolve these types; jscodeshift cannot without manual type annotations.
2. **Factory generation requires type introspection**. Building generic `makeEntityQueries<T>(tableName)` factories requires reading schema types -- ts-morph handles this natively.
3. **Single dependency** (ts-morph includes the TS compiler). jscodeshift needs `@types/jscodeshift`, a separate parser config, and doesn't understand `.ts` files natively.

**jscodeshift** (v17.3.0) is better for massive cross-repo migrations with simple patterns (rename imports, update function signatures). For a single-repo refactor with TypeScript-heavy logic, ts-morph is the right tool.

### What NOT to Use

| Tool | Why Not |
|------|---------|
| `jscodeshift` | Lacks TypeScript type awareness. Our transforms need to understand `Id<"tableName">` types to generate correct factories. |
| Manual find-and-replace | 31 query files, 27 mutation files, 21 hooks. Too error-prone at this scale. |
| `Moderne` platform | Enterprise SaaS tool. Overkill for single-repo refactoring. |
| `@convex-dev/codemod` for custom transforms | Only handles Convex's db API migration. Not a general-purpose codemod tool. |

### Installation

```bash
# Refactoring tools (dev dependencies, used during refactoring phase only)
npm install -D ts-morph@^27.0.2

# Convex-specific migration
npx @convex-dev/codemod@latest explicit-ids

# ESLint enforcement (update existing plugin)
npm install -D @convex-dev/eslint-plugin@^1.1.0
```

### Usage Pattern for Factory Generation

ts-morph should be used as a **one-time migration script**, not a runtime dependency:

```typescript
// scripts/generate-factories.ts (run once, then delete)
import { Project } from "ts-morph";

const project = new Project({ tsConfigFilePath: "./tsconfig.json" });

// Read schema types to find all table names
const schemaFile = project.getSourceFileOrThrow("convex/schema.ts");
// ... extract table definitions, generate query/mutation factories
```

After factory generation, the generated code is committed and ts-morph can be removed from devDependencies.

---

## 2. Testing Patterns

### Current State

| Category | Status | Coverage |
|----------|--------|----------|
| Pure function unit tests | Exists | costCalculator, integrations, inventory helpers |
| Backend mutation/query tests | **Exists but sparse** | orders, componentTypes, inventory, gofoodDepot, k3martCockpit (12 test files in `tests/convex/`) |
| Frontend component tests | **Zero** | No test files exist |
| E2E tests | Exists | 4 Playwright specs (sales analytics, dashboard) |

### Recommended Testing Stack

| Tool | Version | Purpose | Confidence |
|------|---------|---------|------------|
| `vitest` | ^4.0.18 (current) | Test runner. **Do not upgrade** -- already on latest major. | HIGH |
| `convex-test` | ^0.0.41 (current) | Mock Convex backend for mutation/query testing. | HIGH |
| `@edge-runtime/vm` | ^5.0.0 (current) | Edge runtime environment for convex-test. | HIGH |
| `@testing-library/react` | ^16.3.2 (current) | React component testing (when needed). | HIGH |
| `@playwright/test` | ^1.58.2 (current) | E2E testing. **Do not add more E2E** until backend tests are solid. | HIGH |

**Key insight: All testing deps are already installed and current. No new dependencies needed.**

### Testing Strategy (Priority Order)

#### Priority 1: Backend Mutation/Query Tests with convex-test (HIGH IMPACT)

The codebase already has 12 test files using `convex-test` in `tests/convex/`. The pattern is established. The gaps are:

| Critical Untested Module | File | Lines | Risk |
|--------------------------|------|-------|------|
| Ball distribution algorithm | `convex/orders/helpers/ballDistribution.ts` | 342 | Silent allocation failures |
| FIFO inventory consumption | `convex/inventory/fifo.ts` | ~200 | Incorrect cost accounting |
| Auth mutations | `convex/auth/mutations.ts` | ~150 | Security bypass |
| Order status transitions | `convex/orders/helpers/statusTransitions.ts` | ~200 | State corruption |

**Pattern to follow** (already established in codebase):

```typescript
// tests/convex/ballDistribution.test.ts
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "../../convex/schema";

describe("ball distribution", () => {
  test("allocates balls FIFO to pending orders", async () => {
    const t = convexTest(schema);

    // Setup: Create menu product, component types, order
    const menuProductId = await t.run(async (ctx) => {
      return ctx.db.insert("menuProducts", { /* ... */ });
    });

    // Action: Trigger ball distribution
    // Assert: Check allocations
  });
});
```

**Vitest configuration** -- the project already has the correct setup:

```typescript
// vitest.config.ts -- already configured correctly
test: {
  server: { deps: { inline: ["convex-test"] } },
}
```

**Note:** The `vitest.config.ts` currently sets `environment: 'jsdom'` globally. For convex-test files, which need `edge-runtime`, either:
- Use `environmentMatchGlobs` to set `["tests/convex/**", "edge-runtime"]`
- Or add `// @vitest-environment edge-runtime` at the top of each convex-test file

The existing tests in `tests/convex/` must already be handling this -- verify before changing config.

#### Priority 2: Pure Function Tests (MEDIUM IMPACT)

Already well-established. Expand coverage for:
- `convex/orders/helpers.ts` (pure calculation functions)
- `convex/orders/whatsappHelpers.ts` (template rendering)
- `convex/lib/costCalculator.ts` BOM-specific calculations (partial coverage exists)

#### Priority 3: E2E Tests (LOW PRIORITY for now)

Playwright is installed and 4 specs exist. Do not invest heavily until backend test coverage is solid. Current E2E tests cover sales analytics; kitchen and order flows are the gaps.

### What NOT to Use for Testing

| Tool | Why Not |
|------|---------|
| Local Convex OSS backend | More complex setup, slower tests, no time control. `convex-test` is officially recommended over this approach. |
| Cypress | Playwright is already installed and working. No reason to add a second E2E framework. |
| `jest` | Vitest is already installed, faster, and natively supports Vite. |
| `@testing-library/user-event` for backend tests | Backend tests should use `convex-test`, not DOM testing tools. |
| MSW (Mock Service Worker) | Not needed -- Convex mutations/queries are tested directly via `convex-test`, not through HTTP. |

### Test File Organization Convention

```
tests/
  convex/           # Backend tests using convex-test (edge-runtime)
    helpers.ts      # Shared test factories (createCustomer, createDefaultLocation, etc.)
    orders.test.ts
    inventory.test.ts
    ballDistribution.test.ts   # NEW: critical gap
    fifo.test.ts               # NEW: critical gap
    auth.test.ts               # NEW: security gap
  e2e/              # Playwright E2E tests
    *.spec.ts

convex/
  lib/__tests__/    # Pure function unit tests (co-located)
    costCalculator.test.ts
  integrations/
    */___tests__/   # Integration-specific helper tests
```

---

## 3. Convex Patterns: Generic Query/Mutation Factories

### Current Problem (2000+ Lines of Duplication)

The codebase has three layers of duplication:

1. **Backend queries** (31 files): `list`, `get`, `getBy{field}` patterns repeated identically
2. **Backend mutations** (27 files): `create`, `update`, `remove` with identical `requireRole` + validation structure
3. **Frontend hooks** (21 files): `useConvex{Entity}`, `useConvexCreate{Entity}`, etc. with identical toast + error handling

### Recommended Approach: convex-helpers customFunctions

**Use `convex-helpers` (v0.1.107)** -- the official Convex community library. It provides:

| Module | Import Path | Purpose |
|--------|-------------|---------|
| `customQuery` | `convex-helpers/server/customFunctions` | Build authenticated query factories |
| `customMutation` | `convex-helpers/server/customFunctions` | Build authenticated mutation factories with role checks |
| `customCtx` | `convex-helpers/server/customFunctions` | Modify ctx (add user, wrap DB) |
| `filter` | `convex-helpers/server/filter` | Type-safe TypeScript filters (replace manual `.filter()`) |
| Relationship helpers | `convex-helpers/server/relationships` | `getOneFromOrThrow`, `getManyFrom` |

### Installation

```bash
npm install convex-helpers@^0.1.107
```

### Pattern 1: Authenticated Query/Mutation Factory

Replace the manual `requireRole(ctx, args.token, [...])` pattern in 27+ mutation files:

```typescript
// convex/lib/functions.ts -- Define once, use everywhere
import { query, mutation } from "../_generated/server";
import {
  customQuery,
  customMutation,
  customCtx,
} from "convex-helpers/server/customFunctions";
import { getSessionUser } from "./auth";
import { ConvexError, v } from "convex/values";

// Public query (no auth required)
export const publicQuery = query;

// Authenticated query -- resolves session user and adds to ctx
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    // No auth required for queries, but user available if token provided
    return {};
  })
);

// Protected mutation -- requires token + role check
export const protectedMutation = customMutation(mutation, {
  args: { token: v.string() },
  input: async (ctx, { token }) => {
    const user = await getSessionUser(ctx, token);
    if (!user) throw new ConvexError("Session expired. Please log in again.");
    if (!user.isActive) throw new ConvexError("Account is deactivated.");
    return { ctx: { user }, args: {} };
  },
});

// Admin-only mutation
export const adminMutation = customMutation(mutation, {
  args: { token: v.string() },
  input: async (ctx, { token }) => {
    const user = await getSessionUser(ctx, token);
    if (!user) throw new ConvexError("Session expired. Please log in again.");
    if (!user.isActive) throw new ConvexError("Account is deactivated.");
    if (!["admin"].includes(user.role))
      throw new ConvexError("Admin access required.");
    return { ctx: { user }, args: {} };
  },
});

// Manager+ mutation
export const managerMutation = customMutation(mutation, {
  args: { token: v.string() },
  input: async (ctx, { token }) => {
    const user = await getSessionUser(ctx, token);
    if (!user) throw new ConvexError("Session expired. Please log in again.");
    if (!user.isActive) throw new ConvexError("Account is deactivated.");
    if (!["admin", "manager"].includes(user.role))
      throw new ConvexError("Manager access required.");
    return { ctx: { user }, args: {} };
  },
});
```

**Usage (replaces requireRole boilerplate):**

```typescript
// convex/ingredients/mutations.ts -- BEFORE: 125 lines, AFTER: ~40 lines
import { managerMutation } from "../lib/functions";
import { v } from "convex/values";
import { calculateCostPerBaseUnit } from "../lib/costCalculator";

export const create = managerMutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    // ... (no token arg needed -- consumed by factory)
  },
  handler: async (ctx, args) => {
    const { costPerUnit, baseUnit } = calculateCostPerBaseUnit(
      args.priceExclShipping, args.shippingCost,
      args.volumePurchased, args.unitType
    );
    return await ctx.db.insert("ingredients", {
      ...args,
      createdBy: ctx.user.name, // user available from factory!
      costPerBaseUnit: costPerUnit,
      baseUnit,
    });
  },
});
```

### Pattern 2: Generic CRUD Query Helpers

For the 31 query files with identical `list`/`get`/`search` patterns, create reusable helper functions (NOT factory-generated queries, because Convex requires static exports):

```typescript
// convex/lib/queryHelpers.ts
import { QueryCtx } from "../_generated/server";

/**
 * Get a single document by ID (generic helper).
 * Use inside a query handler: return getById(ctx, "ingredients", args.id);
 */
export async function getById<T extends string>(
  ctx: QueryCtx,
  table: T,
  id: any // Id<T> -- typed at call site
) {
  return await ctx.db.get(id);
}

/**
 * List documents with optional limit (generic helper).
 */
export async function listRecent<T extends string>(
  ctx: QueryCtx,
  table: T,
  limit: number = 100
) {
  return await ctx.db.query(table as any).order("desc").take(limit);
}

/**
 * Search by name field (generic helper for simple entities).
 */
export async function searchByName<T extends string>(
  ctx: QueryCtx,
  table: T,
  searchQuery: string,
  limit: number = 20
) {
  const searchLower = searchQuery.toLowerCase();
  const all = await ctx.db.query(table as any).collect();
  return all
    .filter((doc: any) => doc.name?.toLowerCase().includes(searchLower))
    .slice(0, limit);
}
```

**Important limitation:** Convex requires each query/mutation to be a **static export** from a module file. You cannot dynamically generate and export queries. The helper functions reduce duplication inside handlers, but each entity still needs its own query file with explicit exports. This is a Convex architectural constraint.

### Pattern 3: Generic Frontend Hook Factory

This is where the biggest savings are possible (1000+ lines of repetitive hooks):

```typescript
// src/hooks/convex/createEntityHooks.ts
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

type AnyApi = any; // Simplified -- actual type depends on api shape

export function createEntityHooks<
  TListArgs extends Record<string, unknown>,
  TGetArgs extends Record<string, unknown>,
  TCreateArgs extends Record<string, unknown>,
  TUpdateArgs extends Record<string, unknown>,
  TDeleteArgs extends Record<string, unknown>,
>(config: {
  name: string; // Display name for toasts ("Ingredient", "Material")
  queries: {
    list: AnyApi;
    get: AnyApi;
    search?: AnyApi;
  };
  mutations: {
    create: AnyApi;
    update: AnyApi;
    remove: AnyApi;
  };
}) {
  const useList = (args?: TListArgs) =>
    useQuery(config.queries.list, args ?? ({} as any));

  const useGet = (id: string | undefined) =>
    useQuery(config.queries.get, id ? { id } : "skip");

  const useSearch = config.queries.search
    ? (query: string, limit?: number) =>
        useQuery(config.queries.search!, query ? { query, limit } : "skip")
    : undefined;

  const useCreate = () => {
    const mutation = useMutation(config.mutations.create);
    const execute = async (data: TCreateArgs) => {
      try {
        const id = await mutation(data as any);
        toast.success(`${config.name} created successfully`);
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, `Failed to create ${config.name.toLowerCase()}`));
        throw error;
      }
    };
    return { mutate: execute, mutateAsync: execute };
  };

  const useUpdate = () => {
    const mutation = useMutation(config.mutations.update);
    const execute = async (data: TUpdateArgs) => {
      try {
        const id = await mutation(data as any);
        toast.success(`${config.name} updated successfully`);
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, `Failed to update ${config.name.toLowerCase()}`));
        throw error;
      }
    };
    return { mutate: execute, mutateAsync: execute };
  };

  const useDelete = () => {
    const mutation = useMutation(config.mutations.remove);
    const execute = async (id: string) => {
      try {
        await mutation({ id } as any);
        toast.success(`${config.name} deleted successfully`);
        return true;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, `Failed to delete ${config.name.toLowerCase()}`));
        throw error;
      }
    };
    return { mutate: execute, mutateAsync: execute };
  };

  return { useList, useGet, useSearch, useCreate, useUpdate, useDelete };
}
```

**Usage:**

```typescript
// src/hooks/convex/useIngredients.ts -- BEFORE: 115 lines, AFTER: ~15 lines
import { api } from "../../../convex/_generated/api";
import { createEntityHooks } from "./createEntityHooks";

export const {
  useList: useConvexIngredients,
  useGet: useConvexIngredient,
  useSearch: useConvexIngredientSearch,
  useCreate: useConvexCreateIngredient,
  useUpdate: useConvexUpdateIngredient,
  useDelete: useConvexDeleteIngredient,
} = createEntityHooks({
  name: "Ingredient",
  queries: {
    list: api.ingredients.queries.list,
    get: api.ingredients.queries.get,
    search: api.ingredients.queries.search,
  },
  mutations: {
    create: api.ingredients.mutations.create,
    update: api.ingredients.mutations.update,
    remove: api.ingredients.mutations.remove,
  },
});
```

### What NOT to Do

| Anti-Pattern | Why |
|-------------|-----|
| Dynamic query/mutation generation at module level | Convex requires static exports. `makeEntityQueries("ingredients")` that returns exported queries will not work with Convex code generation. |
| `convex-helpers` CRUD module | The CRUD helper is too opinionated for this project's needs (custom cost calculations, deletion guards, auth patterns). Use `customMutation` instead. |
| Convex Ents (`convex-ents`) | Full ORM layer. Too heavy for a refactoring initiative. Introduces new abstractions when we need to reduce complexity. |
| Row-level security via convex-helpers | The current auth model (PIN + session token + role check) is simple and works. RLS adds complexity without clear benefit for an internal tool. |

---

## 4. Backup Strategy

### Current State

- No automated backup
- Manual `npx convex export` used occasionally
- Production data at risk (flagged as HIGH priority concern)

### Recommended Approach

| Method | Tool | When | Confidence |
|--------|------|------|------------|
| **Primary: Dashboard Auto-Backup** | Convex Dashboard | Daily, automated | HIGH |
| **Secondary: CLI Export** | `npx convex export` | Before deployments, before migrations | HIGH |
| **Tertiary: Pre-deploy Script** | Custom npm script | Every `npx convex deploy` | MEDIUM |

### Implementation

#### Option A: Convex Pro Plan Auto-Backup (Recommended)

If on Convex Pro plan:
1. Go to Convex Dashboard > Deployment > Backups
2. Check "Backup automatically"
3. Set schedule: Daily at 00:00 UTC (07:00 WIB)
4. Enable "Include file storage"
5. Retention: 7 days for daily, 14 days for weekly

**Cost:** Included in Pro plan. Bandwidth charges apply.

#### Option B: Pre-Deploy Backup Script (Free tier compatible)

```bash
# Add to package.json scripts:
"predeploy": "npx convex export --include-file-storage --path ./backups/pre-deploy-$(date +%Y%m%d-%H%M%S).zip"
"deploy": "npx convex deploy"
"deploy:safe": "npm run predeploy && npm run deploy"
```

#### Option C: Scheduled Export via GitHub Actions (Free tier compatible)

```yaml
# .github/workflows/backup.yml
name: Convex Backup
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight UTC
  workflow_dispatch:       # Manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx convex export --include-file-storage --path backup.zip
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: convex-backup-${{ github.run_number }}
          path: backup.zip
          retention-days: 30
```

### What NOT to Do

| Approach | Why Not |
|----------|---------|
| Self-hosted Convex backend for backups | Massive operational overhead. The cloud service handles infrastructure. |
| S3 backup with `convex-self-hosted-backups` | Designed for self-hosted Convex. Adds AWS dependency unnecessarily. |
| No backups | Production data with 37 tables, active orders, inventory -- unacceptable risk. |

---

## 5. Dependency Upgrade Path

### Current Versions vs Latest

| Package | Current | Latest | Action | Breaking Changes | Confidence |
|---------|---------|--------|--------|-----------------|------------|
| `convex` | ^1.31.7 | 1.31.7 | **None needed** -- already latest | N/A | HIGH |
| `convex-test` | ^0.0.41 | 0.0.41 | **None needed** -- already latest | N/A | HIGH |
| `typescript` | ~5.9.3 | ~5.9.3 | **None needed** -- already latest stable | N/A | HIGH |
| `vitest` | ^4.0.18 | 4.0.18 | **None needed** -- already latest | N/A | HIGH |
| `react` | ^19.2.0 | 19.2.0 | **None needed** -- already latest | N/A | HIGH |
| `vite` | ^7.2.4 | 7.2.4 | **None needed** -- already latest | N/A | HIGH |
| `@playwright/test` | ^1.58.2 | 1.58.2 | **None needed** | N/A | HIGH |
| `convex-helpers` | *Not installed* | 0.1.107 | **ADD** for customFunctions factories | N/A (new dep) | HIGH |
| `@convex-dev/eslint-plugin` | *Not installed* | ^1.1.0 | **ADD** for explicit-table-ids rule | N/A (new dep) | HIGH |

**Key finding: All existing dependencies are already at their latest versions.** The project is fully up-to-date. The only action is adding `convex-helpers` and `@convex-dev/eslint-plugin` as new dependencies.

### Convex SDK Upgrade Notes (for future reference)

Recent Convex SDK changes relevant to this project:

| Version | Change | Impact on Frollie | Action Required |
|---------|--------|-------------------|-----------------|
| 1.31.0 | `db.get(tableName, id)` syntax | All 27 mutation files, many query files use old `db.get(id)` syntax | Run `npx @convex-dev/codemod@latest explicit-ids` to auto-migrate |
| 1.31.5 | Node.js 18 dropped | Check CI environment | Verify Node 20+ in GitHub Actions |
| 1.29.0 | `.pick()`, `.omit()`, `.partial()`, `.extend()` on validators | Can simplify update mutation args | Use when building factories |
| 1.25.0 | React 17 dropped | Already on React 19 | No action |

### Migration: Table-Name-First DB Syntax

The old syntax (`ctx.db.get(id)`) still works but will eventually be deprecated. Migrate proactively:

```bash
# Step 1: Run codemod (one-time)
npx @convex-dev/codemod@latest explicit-ids

# Step 2: Add ESLint rule for enforcement
# In eslint.config.js:
# rules: { "@convex-dev/explicit-table-ids": "error" }

# Step 3: Verify
npm run lint
npm run type-check
```

### New Validator Methods (v1.29.0+)

Useful for reducing duplication in update mutations:

```typescript
import { v } from "convex/values";

// Define create args once
const ingredientFields = {
  name: v.string(),
  brand: v.optional(v.string()),
  unitType: v.string(),
  volumePurchased: v.number(),
  priceExclShipping: v.number(),
  shippingCost: v.number(),
};

// Create mutation -- uses all fields
export const create = managerMutation({
  args: { ...ingredientFields, createdBy: v.optional(v.string()) },
  handler: async (ctx, args) => { /* ... */ },
});

// Update mutation -- all fields optional + required id
export const update = managerMutation({
  args: {
    id: v.id("ingredients"),
    ...Object.fromEntries(
      Object.entries(ingredientFields).map(([k, val]) => [k, v.optional(val)])
    ),
  },
  handler: async (ctx, args) => { /* ... */ },
});
```

Note: The `v.object({...}).partial()` syntax from Convex 1.29+ may also work here, but verify with the exact API.

---

## 6. Summary of Additions to Install

### New Dependencies

```bash
# Production dependency (used at runtime in Convex functions)
npm install convex-helpers@^0.1.107

# Dev dependencies (used during development/CI only)
npm install -D @convex-dev/eslint-plugin@^1.1.0
```

### One-Time Migration Commands

```bash
# Migrate db.get/patch/replace/delete to table-name-first syntax
npx @convex-dev/codemod@latest explicit-ids

# (Optional) Generate factory files with ts-morph
npm install -D ts-morph@^27.0.2
npx tsx scripts/generate-factories.ts
npm uninstall -D ts-morph  # Remove after generation
```

### No Upgrades Needed

Every existing dependency is already at its latest version. This is unusual and fortunate -- it means the refactoring effort can focus entirely on code quality and patterns, not dependency churn.

---

## 7. Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Refactoring | ts-morph | jscodeshift | No type awareness for Convex ID types |
| Testing | convex-test + vitest | Local OSS Convex backend | Slower, no time control, harder setup |
| Auth factories | convex-helpers customFunctions | Manual requireRole wrapper | Already solved upstream, no reason to reinvent |
| Backup | Dashboard auto-backup + pre-deploy CLI | Self-hosted S3 backup | Adds AWS dependency, self-hosted complexity |
| Hook factories | Custom createEntityHooks | TanStack Query adapter | Convex has its own reactive layer; TanStack would conflict |
| DB syntax migration | @convex-dev/codemod + ESLint | Manual migration | 27+ mutation files, 31 query files -- too error-prone |

---

## Sources

**Official Convex Documentation:**
- [Convex Testing with convex-test](https://docs.convex.dev/testing/convex-test) -- HIGH confidence
- [Convex Backup & Restore](https://docs.convex.dev/database/backup-restore) -- HIGH confidence
- [Convex TypeScript Best Practices](https://docs.convex.dev/understanding/best-practices/typescript) -- HIGH confidence
- [Convex Testing Overview](https://docs.convex.dev/testing) -- HIGH confidence

**Convex Blog/Stack:**
- [Custom Functions (convex-helpers)](https://stack.convex.dev/custom-functions) -- HIGH confidence
- [Why ctx.db is changing](https://news.convex.dev/db-table-name/) -- HIGH confidence
- [Testing patterns for peace of mind](https://stack.convex.dev/testing-patterns) -- MEDIUM confidence

**NPM Registry (verified versions):**
- [convex npm](https://www.npmjs.com/package/convex) -- v1.31.7, HIGH confidence
- [convex-helpers npm](https://www.npmjs.com/package/convex-helpers) -- v0.1.107, HIGH confidence
- [convex-test npm](https://www.npmjs.com/package/convex-test) -- v0.0.41, HIGH confidence
- [ts-morph npm](https://www.npmjs.com/package/ts-morph) -- v27.0.2, HIGH confidence
- [vitest npm](https://www.npmjs.com/package/vitest) -- v4.0.18, HIGH confidence
- [jscodeshift npm](https://www.npmjs.com/package/jscodeshift) -- v17.3.0, HIGH confidence

**GitHub:**
- [convex-helpers README](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/README.md) -- HIGH confidence
- [convex-js CHANGELOG](https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md) -- HIGH confidence
- [convex-self-hosted-backups](https://github.com/orenaksakal/convex-self-hosted-backups) -- MEDIUM confidence

**Vitest:**
- [Vitest 4.0 Announcement](https://vitest.dev/blog/vitest-4) -- HIGH confidence

**Refactoring Tools:**
- [ts-morph documentation](https://ts-morph.com/) -- HIGH confidence
- [Martin Fowler on Codemods](https://martinfowler.com/articles/codemods-api-refactoring.html) -- MEDIUM confidence

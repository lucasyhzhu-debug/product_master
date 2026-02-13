# Phase 5: Backend Factories - Research

**Researched:** 2026-02-13
**Domain:** convex-helpers custom functions, auth wrappers, query helpers
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Simple entities first: ingredients, materials, tags, customers, storageLocations, shipping (6 entities)
- Complex entities (orders, inventory, kitchen, recipes, packaging, products, vouchers) get a separate Phase 5.1
- Both mutation wrappers and query helpers are built and applied in this phase
- Frontend hooks for the 6 simple entities are also updated (backend + frontend together)
- Single factory with auth modes: `required`, `optional`, `none` -- covers protected mutations, optional-auth queries, and public mutations (login)
- Per-mutation role declaration: each mutation specifies its own allowed roles (e.g., `{ roles: ['admin'] }`)
- Generic "Unauthorized" error message on auth failure -- no role details revealed
- No backend logging of auth failures -- just throw ConvexError (Convex already logs function errors)
- Move from token-in-args to Convex sessionId context-based auth using convex-helpers session management
- Client stores sessionId, wrapper validates it from context -- no more `token: v.string()` in mutation args
- Token field completely removed from mutation args for migrated entities (clean break, no backward compat)
- Frontend hooks updated to remove token passing for the 6 simple entities
- Backend and frontend must deploy together for migrated entities
- Full scope: CRUD + filtered lists + cursor pagination + text search
- Helpers: `list()`, `getById()`, `getByField()`, `listByFilter()`, `search()`, paginated variants
- Default page size: 25 items (with per-query override support)
- `protectedQuery` wrapper added -- queries can also enforce auth via session context
- Text search helper for searching across specified fields (e.g., ingredient name, customer phone)

### Claude's Discretion
- Exact convex-helpers API usage and session management implementation
- Query helper internal architecture (composition patterns, type inference approach)
- File organization for the new lib modules
- How to handle the sessionId provider on the frontend (ConvexProvider integration)

### Deferred Ideas (OUT OF SCOPE)
- Phase 5.1: Migrate complex entities (orders, inventory, kitchen, recipes, packaging, products, vouchers) to the factory pattern
- Complex entities may need specialized wrappers beyond the generic factory (e.g., order mutations with inventory side effects)
</user_constraints>

## Summary

This phase introduces `convex-helpers` (v0.1.112) to replace the manual `requireRole(ctx, args.token, roles)` boilerplate with `customMutation`/`customQuery` wrappers that automatically handle session-based auth. The current codebase has **39 `requireRole()` calls across 11 files**, all using a token-in-args pattern where the frontend passes `token: v.string()` and each mutation manually validates it. The 6 simple entities targeted by this phase (ingredients, materials, tags, customers, storageLocations, shipping) currently have **zero auth protection** on their mutations -- they use bare `mutation()` with no token checking at all.

The migration involves three layers: (1) building `convex/lib/functions.ts` with `customMutation`/`customQuery` wrappers using `convex-helpers/server/customFunctions`, (2) building `convex/lib/queryHelpers.ts` with reusable CRUD query patterns, and (3) updating both backend mutations/queries and frontend hooks for the 6 simple entities to use the new session-based auth system via `convex-helpers/react/sessions`.

**Primary recommendation:** Use `convex-helpers`'s `customMutation`/`customQuery` from `convex-helpers/server/customFunctions` with `SessionIdArg` from `convex-helpers/server/sessions` for the auth wrapper layer, and build query helpers as composable factory functions (not the convex-helpers CRUD utility, which is too simplistic for production use).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `convex-helpers` | 0.1.112 | Custom function wrappers, session management, CRUD utilities | Official Convex companion library by the Convex team (get-convex org); HIGH reputation on Context7 |
| `convex` | ^1.31.7 | Already installed; base framework | Required for `mutation()`, `query()`, `MutationCtx`, `QueryCtx` types |
| `convex-test` | ^0.0.41 | Already installed; testing | Required for testing wrapped functions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `convex-helpers/server/customFunctions` | (part of convex-helpers) | `customMutation`, `customQuery`, `customCtx` | Building auth wrappers |
| `convex-helpers/server/sessions` | (part of convex-helpers) | `SessionIdArg` validator constant | Adding sessionId to custom function args |
| `convex-helpers/react/sessions` | (part of convex-helpers) | `SessionProvider`, `useSessionMutation`, `useSessionQuery` | Frontend session management |
| `convex-helpers/server/crud` | (part of convex-helpers) | Auto-generated CRUD functions | **NOT recommended for production** without RLS; useful as reference pattern only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| convex-helpers sessions | Manual sessionId in React context | More code, less integration with Convex reactivity |
| convex-helpers CRUD | Hand-rolled query helpers | CRUD utility is too simplistic (no auth, no search, no custom filters); hand-rolled helpers are necessary |
| convex-helpers paginator | Built-in `.paginate()` | paginator supports `withIndex` and multiple paginations per query; built-in is simpler but less flexible |

### Installation
```bash
npm install convex-helpers
```

**Note:** `convex-helpers` is NOT currently in `package.json`. It must be installed as a new dependency.

---

## Architecture Patterns

### Recommended Project Structure
```
convex/
  lib/
    auth.ts              # EXISTING: requireRole(), getSessionUser(), hashPin(), verifyPin()
    functions.ts          # NEW: customMutation/customQuery wrappers with auth modes
    queryHelpers.ts       # NEW: Reusable CRUD/list/search query builder functions
    costCalculator.ts     # EXISTING: Cost calculation logic (unchanged)
  ingredients/
    mutations.ts          # MODIFIED: Use protectedMutation wrapper
    queries.ts            # MODIFIED: Use query helpers
  materials/              # Same pattern
  tags/                   # Same pattern
  customers/              # Same pattern
  storageLocations/       # Same pattern
  shipping/               # Same pattern
src/
  main.tsx                # MODIFIED: Add SessionProvider wrapping AuthProvider
  contexts/
    AuthContext.tsx        # MODIFIED: Store sessionId alongside token, integrate with SessionProvider
  hooks/convex/
    useIngredients.ts     # MODIFIED: Use useSessionMutation/useSessionQuery
    useMaterials.ts       # MODIFIED: Same pattern
    useTags.ts            # MODIFIED: Same pattern
    useCustomers.ts       # MODIFIED: Same pattern
    useStorageLocations.ts # MODIFIED: Same pattern
    useProtectedMutation.ts # MODIFIED: Adapt to session-based auth
```

### Pattern 1: Custom Function Wrappers (`convex/lib/functions.ts`)

**What:** A single file exporting `protectedMutation`, `protectedQuery`, and `publicMutation` wrappers that use `customMutation`/`customQuery` from convex-helpers. Each wrapper mode handles auth differently.

**When to use:** Every backend mutation/query that needs auth enforcement.

**Verified from Context7 (HIGH confidence):**

```typescript
// convex/lib/functions.ts
import {
  customMutation,
  customQuery,
  customCtx,
} from "convex-helpers/server/customFunctions";
import { SessionIdArg } from "convex-helpers/server/sessions";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { getSessionUser, type UserRole } from "./auth";

// Auth mode: "required" - session must exist and user must have allowed role
// The wrapper:
// 1. Merges SessionIdArg into the function's args (adds sessionId automatically)
// 2. In the input function, validates the session and checks roles
// 3. Adds `user` to ctx so handlers can access `ctx.user`
// 4. Removes sessionId from args passed to the handler

export const protectedMutation = customMutation(mutation, {
  args: SessionIdArg,  // Adds { sessionId: v.string() } to args
  input: async (ctx, { sessionId }) => {
    // NOTE: role checking happens at the individual function level
    // This wrapper just validates the session and provides ctx.user
    const user = await getSessionUser(ctx, sessionId);
    if (!user) {
      throw new ConvexError("Unauthorized");
    }
    if (!user.isActive) {
      throw new ConvexError("Unauthorized");
    }
    return {
      ctx: { ...ctx, user },
      args: {},
    };
  },
});

// For queries that need auth
export const protectedQuery = customQuery(query, {
  args: SessionIdArg,
  input: async (ctx, { sessionId }) => {
    const user = await getSessionUser(ctx, sessionId);
    if (!user) {
      throw new ConvexError("Unauthorized");
    }
    if (!user.isActive) {
      throw new ConvexError("Unauthorized");
    }
    return {
      ctx: { ...ctx, user },
      args: {},
    };
  },
});

// For public operations (login, session validation)
// Just re-exports the base mutation/query with no auth wrapper
export const publicMutation = mutation;
export const publicQuery = query;
```

**CRITICAL DESIGN DECISION -- Role checking approach:**

The `customMutation` wrapper from convex-helpers supports an additional metadata parameter (the third argument to the function created by the builder). This enables per-function role declarations:

```typescript
// Option A: Role as metadata parameter (convex-helpers supported)
const myQueryBuilder = customQuery(query, {
  args: {},
  input: async (ctx, args, { role }: { role: "admin" | "user" }) => {
    // role is passed as metadata, not as a client arg
    const user = await getUser(ctx);
    if (role === "admin" && user.role !== "admin") {
      throw new Error("Not authorized");
    }
    return { ctx: { user }, args: {} };
  },
});

// Usage:
export const myAdminQuery = myQueryBuilder({
  role: "admin",  // <-- This is metadata, not sent from client
  args: {},
  handler: async (ctx, args) => { ... },
});
```

**RECOMMENDED: Use Option A (metadata roles) for `protectedMutation`/`protectedQuery`.** This keeps the role declaration at the function definition site (readable, greppable) while the wrapper enforces it automatically. The roles array never travels over the wire.

```typescript
// Refined protectedMutation with role metadata
export const protectedMutation = customMutation(mutation, {
  args: SessionIdArg,
  input: async (
    ctx,
    { sessionId },
    { roles }: { roles: UserRole[] }
  ) => {
    const user = await getSessionUser(ctx, sessionId);
    if (!user || !user.isActive) {
      throw new ConvexError("Unauthorized");
    }
    if (!roles.includes(user.role)) {
      throw new ConvexError("Unauthorized");
    }
    return {
      ctx: { ...ctx, user },
      args: {},
    };
  },
});

// Usage in entity mutation file:
export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    // NO token: v.string() -- sessionId is added by wrapper
  },
  handler: async (ctx, args) => {
    // ctx.user is typed and available
    const id = await ctx.db.insert("ingredients", {
      ...args,
      createdBy: ctx.user.name,
    });
    return id;
  },
});
```

### Pattern 2: Session Management (Frontend)

**What:** `SessionProvider` from `convex-helpers/react/sessions` generates a client-side sessionId (stored in localStorage) and injects it into all session-aware hooks. Combined with `useSessionMutation`/`useSessionQuery`, it automatically passes the sessionId as an arg.

**Verified from Context7 (HIGH confidence):**

```tsx
// src/main.tsx
import { SessionProvider } from "convex-helpers/react/sessions";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <SessionProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </SessionProvider>
    </ConvexProvider>
  </StrictMode>
);
```

```tsx
// In hooks:
import { useSessionMutation } from "convex-helpers/react/sessions";

export function useConvexCreateIngredient() {
  const mutation = useSessionMutation(api.ingredients.mutations.create);
  // sessionId is automatically injected
  const execute = async (data: IngredientCreateInput) => {
    const id = await mutation(data);  // no token needed
    return id;
  };
  return { mutate: execute };
}
```

**CRITICAL COMPATIBILITY NOTE:** The convex-helpers `SessionProvider` generates its own `sessionId` (a random client-side identifier). This is different from the existing auth token system. We need to **bridge** between them:

- Current system: `login()` mutation returns a `token` (UUID stored in sessions table). Frontend stores in localStorage. Frontend passes `token` as arg to mutations.
- New system: `SessionProvider` generates a `sessionId`. `useSessionMutation` injects `sessionId` automatically.

**The bridge:** The `sessionId` from convex-helpers needs to map to the existing sessions table token. Two approaches:

1. **Use the existing auth token AS the sessionId** (RECOMMENDED): After login, store the Convex session token as the convex-helpers sessionId. The `SessionProvider` supports a custom storage key and initial value. The wrapper's `input` function receives this sessionId and looks it up in the sessions table (same as current `getSessionUser`).

2. **Two-ID system**: Keep convex-helpers sessionId separate, store mapping. Adds unnecessary complexity.

**Approach 1 is the clear winner** because `getSessionUser` already looks up tokens in the sessions table, and convex-helpers' `SessionIdArg` just expects a string value to pass to the server. We simply store the auth token as the session ID value.

### Pattern 3: Query Helpers (`convex/lib/queryHelpers.ts`)

**What:** Reusable functions that encapsulate common query patterns (list, getById, getByField, search, paginated list). These are NOT convex functions themselves -- they are helper factories that generate query handlers, or utility functions called from within query handlers.

**When to use:** Any simple entity query that follows standard CRUD patterns.

```typescript
// convex/lib/queryHelpers.ts
import type { QueryCtx } from "../_generated/server";
import type { TableNames, Doc } from "../_generated/dataModel";

type FilterFn<T extends TableNames> = (doc: Doc<T>) => boolean;

/**
 * List all documents from a table, optionally filtered.
 * Default ordering: descending by creation time.
 */
export async function listAll<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  options?: {
    limit?: number;
    order?: "asc" | "desc";
    filter?: FilterFn<T>;
  }
): Promise<Doc<T>[]> {
  const limit = options?.limit ?? 100;
  const order = options?.order ?? "desc";

  let query = ctx.db.query(table).order(order);

  if (options?.filter) {
    const all = await query.collect();
    return all.filter(options.filter).slice(0, limit);
  }

  return await query.take(limit);
}

/**
 * Get a single document by ID. Returns null if not found.
 */
export async function getById<T extends TableNames>(
  ctx: QueryCtx,
  id: Doc<T>["_id"]
): Promise<Doc<T> | null> {
  return await ctx.db.get(id);
}

/**
 * Get a single document by indexed field value.
 */
export async function getByField<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  indexName: string,
  fieldValue: string
): Promise<Doc<T> | null> {
  return await ctx.db
    .query(table)
    .withIndex(indexName, (q: any) => q.eq(/* field */, fieldValue))
    .first();
}

/**
 * Text search across specified fields (in-memory filtering).
 * For small tables (<10k rows). Use Convex search indexes for larger tables.
 */
export async function textSearch<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  query: string,
  fields: (keyof Doc<T>)[],
  limit: number = 20
): Promise<Doc<T>[]> {
  const searchLower = query.toLowerCase();
  const all = await ctx.db.query(table).collect();

  return all.filter((doc) => {
    return fields.some((field) => {
      const value = doc[field];
      if (typeof value === "string") {
        return value.toLowerCase().includes(searchLower);
      }
      return false;
    });
  }).slice(0, limit);
}
```

**Note on types:** The `withIndex` helper needs careful typing because Convex's `withIndex` API uses generics tied to the schema's index definitions. For `getByField`, the implementation may need to accept a callback pattern rather than a plain field name to maintain full type safety. This is a discretion area to resolve during implementation.

### Pattern 4: Migrated Entity Files

**What:** Each simple entity's mutations.ts and queries.ts get rewritten to use the new wrappers and helpers.

**Before (ingredients/mutations.ts):**
```typescript
import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    name: v.string(),
    createdBy: v.optional(v.string()),
    // ... more args
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("ingredients", {
      ...args,
      createdBy: args.createdBy ?? "admin",
    });
    return id;
  },
});
```

**After:**
```typescript
import { protectedMutation } from "../lib/functions";
import { v } from "convex/values";

export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    name: v.string(),
    // NO createdBy -- derived from ctx.user.name
    // NO token -- sessionId injected by wrapper
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("ingredients", {
      ...args,
      createdBy: ctx.user.name,  // From authenticated session
    });
    return id;
  },
});
```

### Anti-Patterns to Avoid

- **Mixing old and new auth in same file:** Do NOT have some mutations use `protectedMutation` and others use raw `mutation()` with `requireRole` in the same entity file. All mutations in a migrated file must use the new pattern.

- **Leaking roles in error messages:** The context decision specifies generic "Unauthorized" errors. Never include `Required role: ${roles}` in error messages (this is what the current `requireRole` does -- line 116 of auth.ts).

- **Importing `mutation` directly in migrated files:** After migration, entity files should import `protectedMutation` from `../lib/functions`, not `mutation` from `../_generated/server`. Exception: seed functions that need no auth.

- **Passing token from frontend to migrated endpoints:** The whole point is that sessionId replaces token. If frontend still passes `token`, it means the migration is incomplete.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth middleware for mutations | Manual `if (!token) throw` in every handler | `customMutation` from `convex-helpers/server/customFunctions` | Handles arg injection, ctx enrichment, and type safety |
| Session ID injection on client | Manual localStorage + arg passing | `SessionProvider` + `useSessionMutation` from `convex-helpers/react/sessions` | Tested, handles edge cases (tab switching, expiry) |
| CRUD function generation | Per-entity copy-paste of list/get/create/update/delete | Query helper functions in `convex/lib/queryHelpers.ts` | Reduces 50+ lines per entity to 5-10 lines |
| Pagination | Manual cursor management | `paginator` from `convex-helpers/server/pagination` (for future use) | Handles cursor encoding, boundary conditions |

**Key insight:** The `convex-helpers` library is maintained by the Convex team itself (get-convex org on GitHub). It is the "blessed" way to add middleware patterns to Convex functions. Hand-rolling custom function wrappers would replicate what `customMutation` already does with proper TypeScript generics.

---

## Common Pitfalls

### Pitfall 1: SessionId vs Auth Token Confusion
**What goes wrong:** convex-helpers `SessionProvider` generates its own random sessionId, but the app already has a PIN-based auth system that creates session tokens stored in the `sessions` table. If both IDs exist independently, auth breaks.
**Why it happens:** The convex-helpers session system is designed for anonymous session tracking; this app needs authenticated session tracking.
**How to avoid:** After login, store the auth token as the convex-helpers sessionId value. The `SessionProvider` accepts a custom `storageKey` prop. Use the same localStorage key (`malo_auth_session` - extract token from stored JSON) or set the sessionId programmatically after login.
**Warning signs:** Login works but mutations fail with "Unauthorized"; sessionId exists but doesn't match any sessions table record.

### Pitfall 2: Breaking Existing Tests
**What goes wrong:** Existing tests (e.g., `tags.test.ts`) call mutations directly without a session token. After wrapping mutations with `protectedMutation`, these tests fail because no sessionId is provided.
**Why it happens:** `convex-test` doesn't automatically provide session context. The `t.mutation()` call needs to include a sessionId arg.
**How to avoid:** Create a test helper that: (1) inserts a test user + session into the test database, (2) returns a sessionId that can be passed to mutations. All tests for migrated entities must use this helper.
**Warning signs:** All tests pass locally before wrapper migration but fail after.

### Pitfall 3: Type Narrowing Loss with customMutation
**What goes wrong:** The handler's `ctx` parameter loses specific type information (e.g., `ctx.user` becomes `any` or is missing from the type).
**Why it happens:** TypeScript struggles to infer the `ctx` type through `customMutation`'s generic layers, especially when the `input` function returns a transformed context.
**How to avoid:** Explicitly type the return of the `input` function. Or define the enriched context type and use it in the handler's signature.
**Warning signs:** `ctx.user` shows type errors in the handler; need to cast `ctx.user as Doc<"users">`.

### Pitfall 4: Deploy Ordering (Backend + Frontend)
**What goes wrong:** If backend deploys first (removing `token` from args), the running frontend still sends `token` and gets validation errors. If frontend deploys first (sending `sessionId` instead of `token`), the old backend rejects the unknown arg.
**Why it happens:** Clean break means no backward compatibility. Both sides must deploy simultaneously.
**How to avoid:** For each entity, update backend and frontend in the same commit. Deploy as a unit. The 6 simple entities currently have NO auth on their mutations, so the backend change (adding `protectedMutation`) won't break the frontend (which doesn't send `token` today). Only the frontend hooks need updating to use `useSessionMutation` (which adds `sessionId`).
**Warning signs:** "Invalid arguments" errors in production after partial deploy.

### Pitfall 5: Seed/Migration Mutations Still Need No-Auth Path
**What goes wrong:** Functions like `tags.seedDefaults` wrapped with `protectedMutation` become inaccessible from the Convex dashboard because there's no session context.
**Why it happens:** Dashboard function invocation doesn't have a session.
**How to avoid:** Keep seed functions and one-time migrations as bare `mutation()` (no auth wrapper). Only wrap user-facing CRUD operations.
**Warning signs:** "Unauthorized" errors when running seed from dashboard.

### Pitfall 6: Shipping Entity is Different
**What goes wrong:** Applying the standard CRUD wrapper pattern to `convex/shipping/` fails because shipping mutations (`incrementAgencyUsage`, `decrementAgencyUsage`) are internal system mutations called by order mutations, not user-facing CRUD.
**Why it happens:** Not all 6 "simple entities" follow the same create/update/delete pattern.
**How to avoid:** Shipping mutations should either remain as bare `mutation()` (system-internal) or use `internalMutation` if they should not be callable from the client. Shipping queries are user-facing and can use query helpers.
**Warning signs:** Wrapping `incrementAgencyUsage` with `protectedMutation` adds unnecessary auth overhead for internal calls.

---

## Code Examples

### Example 1: Complete protectedMutation Wrapper (Recommended Implementation)

```typescript
// Source: convex-helpers Context7 docs + project-specific auth.ts integration
// File: convex/lib/functions.ts

import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { SessionIdArg } from "convex-helpers/server/sessions";
import { mutation, query } from "../_generated/server";
import { ConvexError } from "convex/values";
import { getSessionUser, type UserRole } from "./auth";

// Protected mutation: requires valid session + role check
export const protectedMutation = customMutation(mutation, {
  args: SessionIdArg,
  input: async (ctx, { sessionId }, { roles }: { roles: UserRole[] }) => {
    const user = await getSessionUser(ctx, sessionId);
    if (!user || !user.isActive) {
      throw new ConvexError("Unauthorized");
    }
    if (!roles.includes(user.role)) {
      throw new ConvexError("Unauthorized");
    }
    return { ctx: { ...ctx, user }, args: {} };
  },
});

// Protected query: requires valid session + role check
export const protectedQuery = customQuery(query, {
  args: SessionIdArg,
  input: async (ctx, { sessionId }, { roles }: { roles: UserRole[] }) => {
    const user = await getSessionUser(ctx, sessionId);
    if (!user || !user.isActive) {
      throw new ConvexError("Unauthorized");
    }
    if (!roles.includes(user.role)) {
      throw new ConvexError("Unauthorized");
    }
    return { ctx: { ...ctx, user }, args: {} };
  },
});

// Public: no auth (for login, session validation, public reads)
export { mutation as publicMutation, query as publicQuery } from "../_generated/server";
```

### Example 2: Migrated Ingredients Mutations

```typescript
// File: convex/ingredients/mutations.ts (AFTER migration)
import { protectedMutation } from "../lib/functions";
import { publicMutation } from "../lib/functions";
import { v } from "convex/values";
import { calculateCostPerBaseUnit } from "../lib/costCalculator";

export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    procurementSource: v.optional(v.string()),
    unitType: v.string(),
    volumePurchased: v.number(),
    priceExclShipping: v.number(),
    shippingCost: v.number(),
  },
  handler: async (ctx, args) => {
    const { costPerUnit, baseUnit } = calculateCostPerBaseUnit(
      args.priceExclShipping,
      args.shippingCost,
      args.volumePurchased,
      args.unitType
    );
    return await ctx.db.insert("ingredients", {
      ...args,
      createdBy: ctx.user.name,  // Derived from session, not from args
      costPerBaseUnit: costPerUnit,
      baseUnit,
    });
  },
});
```

### Example 3: Frontend SessionProvider Integration

```tsx
// File: src/main.tsx (AFTER migration)
import { SessionProvider } from "convex-helpers/react/sessions";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <SessionProvider storageKey="malo_session_id">
        <AuthProvider>
          <App />
        </AuthProvider>
      </SessionProvider>
    </ConvexProvider>
  </StrictMode>
);
```

### Example 4: Frontend Hook Using useSessionMutation

```typescript
// File: src/hooks/convex/useIngredients.ts (AFTER migration)
import { useSessionMutation, useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";

export function useConvexIngredients(limit?: number) {
  return useSessionQuery(api.ingredients.queries.list, { limit });
}

export function useConvexCreateIngredient() {
  const mutation = useSessionMutation(api.ingredients.mutations.create);
  const execute = async (data: IngredientCreateInput) => {
    try {
      const id = await mutation(data);  // sessionId auto-injected
      toast.success("Ingredient created successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create ingredient"));
      throw error;
    }
  };
  return { mutate: execute, mutateAsync: execute };
}
```

### Example 5: Test Helper for Auth

```typescript
// File: tests/helpers/authTestHelper.ts
import type { TestConvex } from "convex-test";

/**
 * Creates a test user and session, returns sessionId for use in test mutations.
 */
export async function createTestSession(
  t: TestConvex<any>,
  options?: { role?: "kitchen" | "order_staff" | "manager" | "admin" }
) {
  const role = options?.role ?? "admin";
  const sessionId = `test-session-${crypto.randomUUID()}`;

  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: `Test ${role}`,
      pinHash: "test:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token: sessionId,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      createdAt: Date.now(),
    });
  });

  return sessionId;
}
```

---

## Current State Analysis

### 6 Simple Entity Mutation Files -- Auth Status

| Entity | File | Has requireRole? | Has token arg? | Mutations |
|--------|------|-------------------|----------------|-----------|
| ingredients | `convex/ingredients/mutations.ts` | NO | NO | create, update, remove |
| materials | `convex/materials/mutations.ts` | NO | NO | create, update, remove |
| tags | `convex/tags/mutations.ts` | NO | NO | create, update, remove, seedDefaults |
| customers | `convex/customers/mutations.ts` | NO | NO | create, update, remove |
| storageLocations | `convex/storageLocations/mutations.ts` | NO | NO | create, update, remove |
| shipping | `convex/shipping/mutations.ts` | NO | NO | incrementAgencyUsage, decrementAgencyUsage, seedFromExistingOrders |

**Key finding:** None of the 6 simple entities currently use auth at all. This means:
- Adding `protectedMutation` to these is a net-new feature (adding auth where none existed)
- No backward compatibility concerns for these specific entities
- However, the frontend hooks must start passing `sessionId` where they currently pass nothing

### 6 Simple Entity Query Files -- Current Patterns

| Entity | File | Queries | Pattern |
|--------|------|---------|---------|
| ingredients | `convex/ingredients/queries.ts` | list (limit), get (id), search (query, limit) | Manual implementation |
| materials | `convex/materials/queries.ts` | list (limit), get (id), search (query, limit) | Same as ingredients (copy-paste) |
| tags | `convex/tags/queries.ts` | list, get (id), getMany (ids[]) | Simpler, no search |
| customers | `convex/customers/queries.ts` | list (limit), get (id), search (query, limit), getByPhone (phone) | Has getByField pattern |
| storageLocations | `convex/storageLocations/queries.ts` | list (activeOnly?), getById (id), getDefault | Custom filtering + sorting |
| shipping | `convex/shipping/queries.ts` | getTopAgencies (limit), getAllAgencyUsage, getAgencyUsage (agency) | Unique patterns, not standard CRUD |

**Key finding:** ingredients, materials, and customers share nearly identical list/get/search patterns. Tags and storageLocations have slightly different patterns. Shipping is unique (usage tracking, not CRUD). Query helpers should handle the common cases; entity-specific queries remain custom.

### Frontend Hooks -- Current Token Usage

| Hook File | Uses token? | Uses useProtectedMutation? | Notes |
|-----------|-------------|---------------------------|-------|
| useIngredients.ts | NO | NO | Direct `useMutation` with no auth |
| useMaterials.ts | NO | NO | Same |
| useTags.ts | NO | NO | Same |
| useCustomers.ts | NO | NO | Same |
| useStorageLocations.ts | NO | NO | Direct `useMutation` with no auth |
| useProtectedMutation.ts | YES (injects token) | -- | This IS the hook; used by other hooks |

**Key finding:** The 6 simple entity hooks do NOT currently use `useProtectedMutation`. They directly call `useMutation()` without any auth. The migration path is: replace `useMutation` with `useSessionMutation` and `useQuery` with `useSessionQuery` (for protected queries) or keep `useQuery` for public queries.

### Mutation File Count (All)

Total mutation files: **26** (in `convex/*/mutations.ts`) + **8** (in `convex/orders/mutations/*.ts`) = **34 mutation files**.

Files with `requireRole`: 11 files with 39 total calls (externalData, platformCredentials, restock, k3martCockpit, vouchers, gofoodDepot, productionTargets, productionCounts, orders/kitchen, menuProducts).

Files without any auth (candidates for Phase 5 + 5.1 migration): 23 files.

---

## Session Integration Design (Claude's Discretion)

### Recommendation: Reuse Existing Token as SessionId

The convex-helpers `SessionProvider` stores a sessionId string in localStorage. The current `AuthContext` stores a full `AuthSession` object (with `token`, `userId`, `name`, `role`, etc.) under key `malo_auth_session`.

**Recommended approach:**

1. After `login()` succeeds, write the returned `token` to a separate localStorage key (e.g., `malo_session_id`) that `SessionProvider` reads.
2. On logout, clear both keys.
3. `SessionProvider` reads `malo_session_id` and injects it as `sessionId` in all `useSessionMutation`/`useSessionQuery` calls.
4. On the backend, `getSessionUser(ctx, sessionId)` looks up the token in the sessions table -- same as today.

**Alternative considered:** Modify `SessionProvider` to read from the existing `malo_auth_session` JSON. This is fragile because it couples the session system to the exact JSON shape. A dedicated key is cleaner.

**AuthContext changes:**
- `login()`: After successful login, also write `token` to `malo_session_id` localStorage key.
- `logout()`: Clear `malo_session_id` in addition to `malo_auth_session`.
- The `useAuth()` hook can continue providing `user`, `hasRole()`, etc. for frontend permission checks. The `useSessionMutation` hooks handle passing the token to the backend.

### File Organization Recommendation

```
convex/lib/
  auth.ts              # Keep existing (requireRole, getSessionUser, hashPin, etc.)
  functions.ts         # NEW: protectedMutation, protectedQuery, publicMutation, publicQuery
  queryHelpers.ts      # NEW: listAll, getById, textSearch, etc.
```

Keep `auth.ts` intact because:
- `requireRole` is still used by 11 non-migrated files (Phase 5.1 scope)
- `getSessionUser` is the core function called by the new wrappers
- `hashPin`/`verifyPin` are used by auth mutations (not migrated)

---

## Open Questions

1. **convex-helpers SessionProvider `storageKey` prop**
   - What we know: Context7 docs show `<SessionProvider>` wrapping `<App />`. It stores a sessionId in localStorage.
   - What's unclear: Whether `SessionProvider` supports a custom `storageKey` prop or always uses a fixed key. The Context7 snippets don't show this prop explicitly.
   - Recommendation: Check the convex-helpers source/types at implementation time. If no custom key is supported, we may need to set the sessionId programmatically or wrap the provider. LOW risk -- worst case we use the default key and sync to it.

2. **`useSessionQuery` for public queries**
   - What we know: `useSessionQuery` injects sessionId. But list queries for ingredients/tags are currently public (no auth).
   - What's unclear: Should we use `useSessionQuery` (sends sessionId that protectedQuery validates) or keep using plain `useQuery` (no sessionId sent, no auth check)?
   - Recommendation: For the 6 simple entities, use `protectedQuery` for queries that should be role-restricted (per access control table: ingredients/materials need manager/admin), and plain `useQuery` with `publicQuery` for truly public reads (tags list is used by recipe editor for all roles).

3. **Type of `ctx.user` in handler**
   - What we know: `customMutation`'s `input` function returns `{ ctx: { ...ctx, user }, args: {} }`. The user is `Doc<"users">`.
   - What's unclear: Whether TypeScript correctly infers `ctx.user` as `Doc<"users">` in the handler, or if it becomes `unknown`.
   - Recommendation: Test during implementation. If inference fails, add an explicit type declaration in the wrapper definition.

---

## Sources

### Primary (HIGH confidence)
- `/get-convex/convex-helpers` Context7 library (ID: /get-convex/convex-helpers) -- customMutation, customQuery, SessionProvider, SessionIdArg, CRUD utilities, paginator
- Codebase analysis: `convex/lib/auth.ts`, all 6 simple entity mutation/query files, all 6 frontend hook files, `src/contexts/AuthContext.tsx`, `src/main.tsx`

### Secondary (MEDIUM confidence)
- convex-helpers npm registry: version 0.1.112 confirmed via `npm show convex-helpers version`
- Context7 docs for convex-helpers README (GitHub source: get-convex/convex-helpers)

### Tertiary (LOW confidence)
- `SessionProvider` custom `storageKey` prop availability -- not confirmed in Context7 docs; needs validation at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- convex-helpers is the official companion library, Context7 confirms API
- Architecture: HIGH -- custom function patterns well-documented in Context7 with complete code examples
- Pitfalls: HIGH -- identified through direct codebase analysis (no auth on simple entities, test implications, deploy ordering)
- Session integration: MEDIUM -- bridge between existing token system and convex-helpers sessions requires implementation-time validation

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (stable library, infrequent breaking changes)

# Phase 10: Frontend Factories - Research

**Researched:** 2026-02-14
**Domain:** React TypeScript factory patterns for Convex CRUD hooks and generic UI components
**Confidence:** HIGH

## Summary

Phase 10 creates two factory abstractions: (1) a `createMutationHook` factory that eliminates repetitive toast-wrapping boilerplate in CRUD hooks, and (2) an `EntityManager<T>` generic component that provides a complete CRUD UI (list + create/edit dialog + delete confirmation + undo toast) configurable via declarative column and form definitions. The five target entities (Ingredients, Materials, Tags, Customers, StorageLocations) currently total 627 lines across hook files and 996+ lines across page files, with nearly identical patterns differing only in field names, mutation references, and toast messages.

The codebase already has all necessary infrastructure: `useSessionMutation` from `convex-helpers/react/sessions` handles session-based auth, the `FormBuilder` component handles declarative form rendering with validation, `ConfirmDialog` provides delete confirmation, and `EmptyState`/`LoadingState` provide consistent loading/empty UX. The factory pattern is straightforward because every target entity follows the same create/update/delete mutation pattern with `useSessionMutation`, and the UI follows the same PageHeader + list + edit form + delete dialog structure.

Critical finding: **No `CustomersManager` page exists** in the current codebase. Customers are created inline during order creation. The phase requirements list it as a migration target, but this would require creating a new page rather than simplifying an existing one. Additionally, **no shadcn/ui `<Table>` component is installed** -- the project uses Card-based lists. The EntityManager needs to provide both table and card views as the user specified, which means adding the shadcn/ui Table component.

**Primary recommendation:** Build `createMutationHook` factory first (pure logic, no UI), prove it on Ingredients hook, then build `EntityManager<T>` using a config-array column approach with FormBuilder integration, and migrate entities one at a time starting with the simplest (Tags).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Create/edit flow: dialog/modal -- form opens in overlay, stays in context of the list
- Delete confirmation: two-step -- confirm dialog first ("Are you sure?"), then undo toast after deletion
- List display: toggle between table view and card grid -- persist user preference (localStorage)
- Bulk actions: checkbox column for multi-select, bulk action bar appears when items selected
- Entities for factory migration: Ingredients, Materials, Tags, Customers, StorageLocations (5 entities)
- Vouchers excluded -- too much special logic (codes, usage tracking, expiry) for generic factory
- Hook factory: explicit configuration pattern -- pass table name, mutation names, toast messages (not schema-driven magic)
- Both confirm dialog AND undo toast for destructive actions (belt and suspenders approach)
- Toggle between table and card views with persisted user preference
- Factories must follow brand reference established in Phase 9

### Claude's Discretion
- Column configuration approach for EntityManager (config array vs render prop)
- Migration strategy (prove on 1-2 entities first vs all at once)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Already Installed -- No New Dependencies for Hook Factory)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| convex | ^1.31.7 | `FunctionReference` types for generic mutation typing | Already used; provides typed API references |
| convex-helpers | ^0.1.112 | `useSessionMutation` for session-injected mutations | Already used by all 5 target hook files |
| sonner | ^2.0.7 | Toast notifications (success/error/undo) | Already used in all mutation hooks |
| React | ^19.2.0 | Hooks, generics, `useState`/`useCallback` | Core framework |
| TypeScript | ~5.9.3 | Generic type constraints, conditional types | Build-time type safety |

### Supporting (Needs Table Component Added)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Table | (via HTML) | Table view for EntityManager list display | User locked "toggle between table and card" |
| @radix-ui/react-checkbox | ^1.3.3 | Already installed; used for bulk selection | Bulk action checkbox column |

### New Component to Add
The project does NOT have a `<Table>` component from shadcn/ui. It needs to be added:
```bash
npx shadcn@latest add table
```
This adds `src/components/ui/table.tsx` with `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` -- pure HTML table wrappers with Tailwind styling. No new npm dependencies required (uses native HTML table elements).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn Table | @tanstack/react-table | TanStack is overkill for 5-50 item lists; adds 30KB bundle; shadcn Table sufficient |
| Config array columns | Render prop columns | Config array is more declarative and simpler for standard cases; render prop is more flexible but verbose. **Recommendation: config array with optional `render` escape hatch** (same pattern as FormBuilder) |
| localStorage for view pref | URL search params | localStorage persists across sessions, which is what user wants |

## Architecture Patterns

### Recommended Project Structure
```
src/
  hooks/
    convex/
      createMutationHook.ts       # NEW: Hook factory
      useIngredients.ts           # SIMPLIFIED: ~15 lines using factory
      useMaterials.ts             # SIMPLIFIED: ~15 lines using factory
      useTags.ts                  # SIMPLIFIED: ~15 lines using factory
      useCustomers.ts             # SIMPLIFIED: ~15 lines using factory
      useStorageLocations.ts      # SIMPLIFIED: ~15 lines using factory
      index.ts                    # UPDATED: re-export factory
  components/
    shared/
      EntityManager.tsx           # NEW: Generic CRUD UI component
      EntityManager/              # Alternative: folder with sub-components
        EntityManager.tsx
        EntityTable.tsx           # Table view sub-component
        EntityCards.tsx           # Card grid sub-component
        BulkActionBar.tsx         # Bulk action bar
        ViewToggle.tsx            # Table/card toggle
      index.ts                    # UPDATED: export EntityManager
  components/
    ui/
      table.tsx                   # NEW: shadcn/ui Table component
  pages/
    IngredientsManager.tsx        # SIMPLIFIED: ~50-80 lines using EntityManager
    MaterialsManager.tsx          # SIMPLIFIED: ~50-80 lines using EntityManager
    LocationsManager.tsx          # SIMPLIFIED: ~50-80 lines using EntityManager
```

### Pattern 1: createMutationHook Factory

**What:** A factory function that takes a Convex session mutation reference and toast messages, returns a hook with `{ mutate, mutateAsync }` interface.

**When to use:** Any entity with simple create/update/delete mutations using `useSessionMutation`.

**Design:**
```typescript
// src/hooks/convex/createMutationHook.ts
import { useSessionMutation } from "convex-helpers/react/sessions";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";
import type { SessionId } from "convex-helpers/server/sessions";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

// Type representing a session-aware mutation (has sessionId in args)
type SessionMutation = FunctionReference<
  "mutation",
  "public",
  { sessionId: SessionId } & Record<string, any>,
  any
>;

// Extract args WITHOUT sessionId (what the caller passes)
type MutationUserArgs<M extends SessionMutation> = Omit<FunctionArgs<M>, "sessionId">;

interface MutationHookConfig {
  successMessage: string;
  errorMessage: string;
}

/**
 * Factory: creates a mutation hook with toast notifications.
 *
 * Usage:
 *   export const useCreateIngredient = createMutationHook(
 *     api.ingredients.mutations.create,
 *     { successMessage: "Ingredient created", errorMessage: "Failed to create ingredient" }
 *   );
 */
export function createMutationHook<M extends SessionMutation>(
  mutationRef: M,
  config: MutationHookConfig,
) {
  return function useMutationHook() {
    const mutation = useSessionMutation(mutationRef);

    const execute = async (args: MutationUserArgs<M>): Promise<FunctionReturnType<M>> => {
      try {
        const result = await mutation(args);
        toast.success(config.successMessage);
        return result;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, config.errorMessage));
        throw error;
      }
    };

    return { mutate: execute, mutateAsync: execute };
  };
}
```

**Resulting hook file (Ingredients example, ~15 lines):**
```typescript
// src/hooks/convex/useIngredients.ts
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// Query hooks (unchanged -- queries don't have the same boilerplate)
export function useConvexIngredients(limit?: number) {
  return useQuery(api.ingredients.queries.list, { limit });
}
export function useConvexIngredient(id: Id<"ingredients"> | undefined) {
  return useQuery(api.ingredients.queries.get, id ? { id } : "skip");
}
export function useConvexIngredientSearch(query: string, limit?: number) {
  return useQuery(api.ingredients.queries.search, query ? { query, limit } : "skip");
}

// Mutation hooks (factory-generated)
export const useConvexCreateIngredient = createMutationHook(
  api.ingredients.mutations.create,
  { successMessage: "Ingredient created successfully", errorMessage: "Failed to create ingredient" },
);
export const useConvexUpdateIngredient = createMutationHook(
  api.ingredients.mutations.update,
  { successMessage: "Ingredient updated successfully", errorMessage: "Failed to update ingredient" },
);
export const useConvexDeleteIngredient = createMutationHook(
  api.ingredients.mutations.remove,
  { successMessage: "Ingredient deleted successfully", errorMessage: "Failed to delete ingredient" },
);

// Re-export types for backward compatibility
export type { IngredientCreateInput } from ... // if needed
```

### Pattern 2: EntityManager<T> Component with Config Arrays

**What:** A generic CRUD UI component that renders a list (table or card view), handles create/edit via dialog with FormBuilder, delete with ConfirmDialog + undo toast, and bulk actions.

**When to use:** Any simple entity page with list + create/edit/delete operations.

**Column Configuration (RECOMMENDED -- config array with render escape hatch):**
```typescript
// Column definition
export interface EntityColumn<T> {
  key: keyof T | string;          // Field key or custom key
  header: string;                 // Column header text
  width?: string;                 // Optional width (e.g., "200px", "30%")
  sortable?: boolean;             // Enable sorting on this column
  render?: (item: T) => ReactNode; // Custom cell renderer (escape hatch)
  // If no render, uses item[key] with sensible defaults
}

// Entity manager configuration
export interface EntityManagerConfig<T extends { _id: string }> {
  // Identity
  entityName: string;              // Singular: "Ingredient"
  entityNamePlural: string;        // Plural: "Ingredients"

  // Data
  items: T[] | undefined;          // Query result (undefined = loading)

  // Columns for table/card views
  columns: EntityColumn<T>[];

  // Form
  formSections: FormSection<any>[]; // FormBuilder sections for create/edit
  getFormDefaults: () => Record<string, any>;
  getFormInitialData: (item: T) => Record<string, any>;
  transformFormData?: (data: Record<string, any>) => Record<string, any>;

  // Mutations
  onCreate: (data: any) => Promise<any>;
  onUpdate: (id: string, data: any) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
  onBulkDelete?: (ids: string[]) => Promise<void>;

  // Page
  pageTitle: string;
  pageDescription?: string;
  backTo?: string;
  backLabel?: string;
  icon?: LucideIcon;

  // Card view customization
  cardRender?: (item: T) => ReactNode; // Custom card renderer

  // Behavior
  searchable?: boolean;
  searchKeys?: (keyof T)[];           // Which fields to search
  defaultView?: "table" | "cards";
}
```

**Usage in a page file (IngredientsManager, ~60-80 lines):**
```typescript
export function IngredientsManager() {
  useDocumentTitle("Ingredients");

  const ingredients = useConvexIngredients();
  const create = useConvexCreateIngredient();
  const update = useConvexUpdateIngredient();
  const del = useConvexDeleteIngredient();

  return (
    <EntityManager
      entityName="Ingredient"
      entityNamePlural="Ingredients"
      pageTitle="Ingredients"
      pageDescription="Manage your ingredient inventory"
      backTo="/menu-products"
      backLabel="Back to Products"
      items={ingredients}
      columns={[
        { key: "name", header: "Name", sortable: true },
        { key: "brand", header: "Brand" },
        { key: "volumePurchased", header: "Volume",
          render: (item) => `${item.volumePurchased} ${item.unitType}` },
        { key: "costPerBaseUnit", header: "Cost/Unit",
          render: (item) => formatCurrency(item.costPerBaseUnit ?? 0) },
      ]}
      formSections={[{
        fields: [
          { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g., Wheat Flour" },
          { name: "brand", label: "Brand", type: "text", placeholder: "e.g., Bogasari" },
          { name: "procurementSource", label: "Procurement Source", type: "text" },
          { name: "unitType", label: "Unit", type: "select", required: true,
            options: ["g","kg","ml","l","pcs"].map(u => ({ value: u, label: u })) },
          { name: "volumePurchased", label: "Volume Purchased", type: "number", required: true },
          { name: "priceExclShipping", label: "Price (Excl. Shipping)", type: "currency", required: true },
          { name: "shippingCost", label: "Shipping Cost", type: "currency" },
        ],
      }]}
      getFormDefaults={() => ({ unitType: "g", shippingCost: 0 })}
      getFormInitialData={(item) => ({
        name: item.name,
        brand: item.brand || "",
        procurementSource: item.procurementSource || "",
        unitType: item.unitType,
        volumePurchased: item.volumePurchased,
        priceExclShipping: item.priceExclShipping,
        shippingCost: item.shippingCost,
      })}
      onCreate={(data) => create.mutate(data)}
      onUpdate={(id, data) => update.mutate({ id, ...data })}
      onDelete={(id) => del.mutate(id)}
    />
  );
}
```

### Pattern 3: Delete with Confirm Dialog + Undo Toast (Belt and Suspenders)

**What:** Two-phase delete: first show ConfirmDialog ("Are you sure?"), then on confirm, execute the delete and show an undo toast.

**Implementation detail:** Convex deletions are permanent (no soft-delete on these simple entities). The "undo" toast provides a ~5 second window. Two approaches:
1. **Optimistic with cache**: Remove from UI immediately, cache the item data, if user clicks "undo" within timeout, re-create the item. Drawback: re-created item gets new `_id`.
2. **Delayed execution**: Show undo toast with timer, only execute delete mutation after timeout expires. Drawback: if user navigates away, delete may not happen.

**Recommendation:** Use approach 1 (optimistic delete + re-create on undo). The new `_id` is acceptable for simple entities (ingredients, materials, tags) since they're referenced by value, not by ID in most places.

**IMPORTANT caveat for Ingredients and Materials:** These ARE referenced by ID in recipe/packaging components. Deleting and re-creating would break references. For these entities, the undo toast should be informational only ("Ingredient deleted") without a functional undo button, OR the undo must use a soft-delete pattern. Given Convex's real-time nature, the simplest approach is: ConfirmDialog -> delete -> success toast (no undo for entities with referential dependencies). The backend already validates this (throws error if ingredient is used in recipes).

**Revised recommendation:** Use ConfirmDialog for all entities. Add undo toast only for entities without referential dependencies (Tags, StorageLocations). For Ingredients/Materials/Customers, show success toast only.

### Pattern 4: View Toggle with localStorage Persistence

```typescript
function useViewPreference(key: string, defaultView: "table" | "cards" = "table") {
  const [view, setView] = useState<"table" | "cards">(() => {
    try {
      return (localStorage.getItem(`entityManager:${key}:view`) as "table" | "cards") || defaultView;
    } catch { return defaultView; }
  });

  const setAndPersist = useCallback((v: "table" | "cards") => {
    setView(v);
    try { localStorage.setItem(`entityManager:${key}:view`, v); } catch {}
  }, [key]);

  return [view, setAndPersist] as const;
}
```

### Anti-Patterns to Avoid

- **Over-abstracting the factory:** Do NOT try to make `createMutationHook` handle queries too. Queries have different signatures (conditional args, "skip" sentinel) and don't benefit from toast wrapping. Keep query hooks as plain `useQuery` calls.
- **Schema-driven magic:** The user explicitly locked "explicit configuration pattern -- pass table name, mutation names, toast messages (not schema-driven magic)." Do NOT introspect the Convex schema or use type-level magic to auto-derive configurations.
- **Generic form state:** Do NOT build custom form state management in EntityManager. Use the existing `FormBuilder` component which already handles state, validation, and submission.
- **Trying to replace ConfirmDialog:** The existing `ConfirmDialog` works well. EntityManager should compose it, not rebuild it.
- **Universal bulk delete:** Not all entities support bulk delete on the backend. Make `onBulkDelete` optional and only show bulk actions when it's provided.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form rendering | Custom form state/inputs | `FormBuilder` (already exists) | Handles validation, conditional fields, transform, all field types |
| Delete confirmation | New dialog component | `ConfirmDialog` (already exists) | Already has loading, variant, cancel/confirm |
| Empty state | Inline empty messages | `EmptyState` (already exists) | Consistent icon circle, CTA, brand styling |
| Loading state | Inline skeletons | `TablePageSkeleton` (already exists) | Consistent shimmer layout for table pages |
| Toast notifications | Custom toast logic | `sonner` (already used) | Supports success/error/undo toast types |
| Session mutation | Manual sessionId injection | `useSessionMutation` from convex-helpers | Auto-injects sessionId from SessionProvider |
| Table component | Custom HTML table | shadcn/ui `<Table>` | Styled, accessible, consistent with other UI primitives |
| Class merging | Manual className concatenation | `cn()` utility (already exists) | Tailwind-safe merging |

**Key insight:** Nearly everything needed already exists in the codebase. The factory pattern's value is in COMPOSING existing pieces, not building new UI primitives.

## Common Pitfalls

### Pitfall 1: Convex `useSessionMutation` Return Type Mismatch
**What goes wrong:** The `createMutationHook` factory must return hooks with the same `{ mutate, mutateAsync }` interface that current code expects. If the interface changes, all call sites break.
**Why it happens:** `useSessionMutation` returns a callable function (not an object with `.mutate`). The current hook files manually wrap this into `{ mutate: execute, mutateAsync: execute }`.
**How to avoid:** The factory must maintain the exact `{ mutate, mutateAsync }` return shape. Verify call sites after migration.
**Warning signs:** TypeScript errors at call sites like `createMutation.mutate(data)` or `deleteMutation.mutate(id)`.

### Pitfall 2: Breaking the Barrel Export (index.ts)
**What goes wrong:** The `src/hooks/convex/index.ts` file exports specific named hooks. If factory-generated hooks change their export names or types, consuming components break.
**Why it happens:** The barrel file has 300+ lines of explicit exports. Changing hook file internals without updating the barrel breaks imports.
**How to avoid:** Keep the same export names (e.g., `useConvexCreateIngredient`). The factory just changes the implementation, not the public API.
**Warning signs:** `npm run build` fails with "Module has no exported member" errors.

### Pitfall 3: Customers Hook Has Transform Layer
**What goes wrong:** `useCustomers.ts` has a `transformCustomer` function that converts Convex `Doc<"customers">` to a legacy `Customer` type (with `id` instead of `_id`, snake_case fields). The factory must preserve this or the consuming code breaks.
**Why it happens:** Legacy migration left a compatibility layer in the customer hooks.
**How to avoid:** Either (a) keep the transform in the simplified hook file (not in the factory), or (b) remove the transform and update all consumers to use Convex types directly. Option (b) is cleaner.
**Warning signs:** Runtime errors in order creation where customer data shape doesn't match expectations.

### Pitfall 4: StorageLocations Mutations Don't Use Toast Wrapper
**What goes wrong:** Current `useStorageLocations.ts` returns raw `useSessionMutation` results WITHOUT the toast wrapper pattern. The `LocationsManager.tsx` handles toasts directly in the page component.
**Why it happens:** StorageLocations was built later with a different pattern.
**How to avoid:** When migrating StorageLocations to the factory, add toast messages to the factory config and remove manual toast calls from the page. This is a behavior normalization, not a regression.
**Warning signs:** Double toasts (factory toast + page toast) if not cleaned up properly.

### Pitfall 5: No CustomersManager Page Exists
**What goes wrong:** The phase requirements list "CustomersManager" as a migration target, but this page doesn't exist. Building it from scratch is not "simplifying an existing page."
**Why it happens:** Requirements were written assuming the page would exist by Phase 10.
**How to avoid:** Either (a) create a new CustomersManager page using EntityManager (demonstrates factory for new pages), or (b) skip it and note it as out-of-scope. Recommendation: create it, since it validates the factory for greenfield use.
**Warning signs:** Planning a migration task for a file that doesn't exist.

### Pitfall 6: React Hooks Rules with Factory Functions
**What goes wrong:** `createMutationHook` returns a function that calls `useSessionMutation` internally. If the factory is called conditionally or inside a callback, React's hooks rules are violated.
**Why it happens:** The factory returns a hook, but it's easy to accidentally call it wrong.
**How to avoid:** The factory is called at module scope (export const), and the returned hook is used at component scope. Never call the factory inside a component.
**Warning signs:** "Hooks can only be called inside a function component" runtime errors.

### Pitfall 7: Undo Toast Race Condition with Convex Real-Time
**What goes wrong:** After deleting an item, Convex real-time updates immediately remove it from the query result. If you show an undo toast that re-creates the item, there's a brief flash where the item disappears and reappears.
**Why it happens:** Convex queries update in real-time. There's no way to "hold" the old state while the undo window is open.
**How to avoid:** Accept the flash for entities that support undo. For entities with referential dependencies (Ingredients, Materials), don't offer undo -- just show success toast.
**Warning signs:** Items flickering in/out of the list during undo window.

## Code Examples

### Example 1: Full createMutationHook Factory (Verified Pattern)

```typescript
// Source: Derived from existing useIngredients.ts + useSessionMutation API
// File: src/hooks/convex/createMutationHook.ts

import { useSessionMutation } from "convex-helpers/react/sessions";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

/**
 * Configuration for a mutation hook created by the factory.
 */
export interface MutationHookConfig {
  /** Toast message on success */
  successMessage: string;
  /** Toast message on error (used as fallback) */
  errorMessage: string;
}

/**
 * Factory function that creates a typed mutation hook with toast notifications.
 *
 * The returned hook uses useSessionMutation internally, so it must be
 * used within a SessionProvider. The sessionId is automatically injected.
 *
 * @example
 * ```ts
 * export const useConvexCreateIngredient = createMutationHook(
 *   api.ingredients.mutations.create,
 *   { successMessage: "Ingredient created", errorMessage: "Failed to create ingredient" }
 * );
 * ```
 */
export function createMutationHook<
  Mutation extends FunctionReference<"mutation">
>(
  mutationRef: Mutation,
  config: MutationHookConfig,
) {
  // Return a hook function (called at component scope)
  return function useMutationWithToast() {
    const mutation = useSessionMutation(mutationRef);

    const execute = async (
      ...args: Parameters<typeof mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      try {
        const result = await mutation(...args);
        toast.success(config.successMessage);
        return result;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, config.errorMessage));
        throw error;
      }
    };

    return { mutate: execute, mutateAsync: execute };
  };
}
```

**Type safety note:** The `Parameters<typeof mutation>` approach preserves the exact argument types that `useSessionMutation` expects (with sessionId already stripped). This avoids complex type gymnastics while maintaining full type safety.

### Example 2: Simplified Hook File Using Factory

```typescript
// Source: Refactored from existing useIngredients.ts (115 lines -> ~25 lines)
// File: src/hooks/convex/useIngredients.ts

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// Re-export Convex doc type for backward compatibility
export type ConvexIngredient = NonNullable<ReturnType<typeof useConvexIngredient>>;

// Query hooks (no factory needed -- queries are already concise)
export function useConvexIngredients(limit?: number) {
  return useQuery(api.ingredients.queries.list, { limit });
}

export function useConvexIngredient(id: Id<"ingredients"> | undefined) {
  return useQuery(api.ingredients.queries.get, id ? { id } : "skip");
}

export function useConvexIngredientSearch(query: string, limit?: number) {
  return useQuery(api.ingredients.queries.search, query ? { query, limit } : "skip");
}

// Mutation hooks (factory-generated with toast wrappers)
export const useConvexCreateIngredient = createMutationHook(
  api.ingredients.mutations.create,
  { successMessage: "Ingredient created successfully", errorMessage: "Failed to create ingredient" },
);

export const useConvexUpdateIngredient = createMutationHook(
  api.ingredients.mutations.update,
  { successMessage: "Ingredient updated successfully", errorMessage: "Failed to update ingredient" },
);

export const useConvexDeleteIngredient = createMutationHook(
  api.ingredients.mutations.remove,
  { successMessage: "Ingredient deleted successfully", errorMessage: "Failed to delete ingredient" },
);
```

### Example 3: EntityManager Column Config

```typescript
// Source: Derived from existing IngredientsManager.tsx patterns
// These column definitions drive both table and card views

const ingredientColumns: EntityColumn<ConvexIngredient>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
  },
  {
    key: "brand",
    header: "Brand",
  },
  {
    key: "volume",
    header: "Volume",
    render: (item) => `${item.volumePurchased} ${item.unitType}`,
  },
  {
    key: "costPerBaseUnit",
    header: "Cost/Unit",
    render: (item) => formatCurrency(item.costPerBaseUnit ?? 0),
  },
];
```

### Example 4: Undo Toast Pattern with Sonner

```typescript
// Source: Sonner docs (already installed as ^2.0.7)
import { toast } from "sonner";

function handleDeleteWithUndo(item: { _id: string; name: string }) {
  // Step 1: Optimistically remove (Convex real-time handles this automatically)
  deleteItem(item._id);

  // Step 2: Show undo toast
  toast.success(`${item.name} deleted`, {
    action: {
      label: "Undo",
      onClick: () => {
        // Re-create the item (new _id, but same data)
        recreateItem(item);
      },
    },
    duration: 5000,
  });
}
```

### Example 5: View Toggle UI

```typescript
// Source: Standard pattern, uses existing shadcn components
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

function ViewToggle({
  view,
  onViewChange,
}: {
  view: "table" | "cards";
  onViewChange: (v: "table" | "cards") => void;
}) {
  return (
    <div className="flex items-center border rounded-lg">
      <Button
        variant={view === "table" ? "default" : "ghost"}
        size="sm"
        onClick={() => onViewChange("table")}
        aria-label="Table view"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant={view === "cards" ? "default" : "ghost"}
        size="sm"
        onClick={() => onViewChange("cards")}
        aria-label="Card view"
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Copy-paste hook files | Factory function | This phase | 5 hook files: 627 lines -> ~125 lines |
| Per-page CRUD UI | EntityManager component | This phase | 3-4 page files: ~1000 lines -> ~300 lines |
| Card-only list views | Table + card toggle | This phase | Better data density for power users |
| Single delete confirm | Confirm + undo toast | This phase | Safer destructive actions |
| No bulk operations | Checkbox multi-select | This phase | Faster bulk management |

**Important sizing notes:**
- Hook savings: Query hooks stay the same (~3-5 lines each). Only mutation hooks shrink (from ~15 lines each to ~3 lines). Net savings per file: ~60-80 lines.
- Page savings: Depends on form complexity. Ingredients/Materials (identical forms) save the most. Tags (simple 1-field form) saves less in absolute terms but more in percentage.

## Open Questions

1. **CustomersManager page: create or skip?**
   - What we know: No CustomersManager page exists. Customers are created inline in order creation.
   - What's unclear: Does the user want a standalone customer management page?
   - Recommendation: Create it using EntityManager as a proof-of-value demonstration. It's a natural CRUD entity and validates the factory for new pages. Keep it simple (name, phone, source, notes).

2. **Tags hook has extra `useConvexSeedTags` -- where does it go?**
   - What we know: `useTags.ts` exports a `useConvexSeedTags` hook that uses `useMutation` (not `useSessionMutation`). It doesn't fit the factory pattern.
   - What's unclear: Whether seed functionality should stay in the hook file.
   - Recommendation: Keep `useConvexSeedTags` as a standalone hook in the same file. The factory only handles the standard CRUD mutations.

3. **Customers hook transform layer -- keep or remove?**
   - What we know: `useCustomers.ts` transforms Convex docs to legacy `Customer` type with snake_case fields and numeric `id`.
   - What's unclear: Whether any consumer still depends on the legacy shape.
   - Recommendation: Remove the transform layer and use Convex doc types directly (matching how all other hooks work). Audit consumers first: the main consumer is order creation, which should use `_id` directly.

4. **Bulk action backend support -- does it exist?**
   - What we know: Individual delete mutations exist for all 5 entities. No bulk delete mutations exist on the backend.
   - What's unclear: Whether bulk delete should be frontend-only (loop over individual deletes) or needs backend support.
   - Recommendation: Implement as frontend loop over individual deletes for Phase 10. Bulk backend mutations can be added later if needed.

5. **Tags Manager page -- does it exist?**
   - What we know: Tags are managed through tag assignment on recipes/products, not through a dedicated manager page.
   - What's unclear: Whether a TagsManager page should be created.
   - Recommendation: If Tags is in the migration scope, a TagsManager page needs to be created using EntityManager (similar to Customers -- it would be a new page).

## Sources

### Primary (HIGH confidence)
- **Codebase analysis (direct file reads):**
  - `src/hooks/convex/useIngredients.ts` (115 lines) -- canonical mutation hook pattern
  - `src/hooks/convex/useMaterials.ts` (115 lines) -- identical pattern to ingredients
  - `src/hooks/convex/useTags.ts` (126 lines) -- similar pattern + seed hook
  - `src/hooks/convex/useCustomers.ts` (172 lines) -- pattern with transform layer
  - `src/hooks/convex/useStorageLocations.ts` (99 lines) -- raw mutations (no toast wrapper)
  - `src/pages/IngredientsManager.tsx` (324 lines) -- canonical CRUD page
  - `src/pages/MaterialsManager.tsx` (324 lines) -- nearly identical to Ingredients
  - `src/pages/LocationsManager.tsx` (348 lines) -- dialog-based CRUD (closer to target)
  - `src/pages/ProductionComponentsManager.tsx` (385 lines) -- recent dialog-based pattern
  - `src/components/shared/FormBuilder.tsx` (463 lines) -- existing form abstraction
  - `src/components/shared/ConfirmDialog.tsx` (60 lines) -- existing delete dialog
  - `src/components/shared/EmptyState.tsx` (35 lines) -- existing empty state
  - `src/hooks/convex/useProtectedMutation.ts` (57 lines) -- reference for typed mutation wrapper
  - `convex/lib/functions.ts` -- `protectedMutation` using `customMutation` + `SessionIdArg`
  - `node_modules/convex-helpers/react/sessions.d.ts` -- `useSessionMutation` type signature
  - `package.json` -- exact dependency versions

- **Phase 9 brand reference:**
  - `.planning/phases/09-ui-brand/09-05-SUMMARY.md` -- dark mode, skeleton screens, empty states established
  - `src/components/layout/PageContainer.tsx` -- standard page wrapper (max-w-1400px)
  - `src/components/layout/PageHeader.tsx` -- standard header component

### Secondary (MEDIUM confidence)
- [shadcn/ui Table docs](https://ui.shadcn.com/docs/components/radix/table) -- Table component API and installation

### Tertiary (LOW confidence)
- None -- all findings verified through direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used; patterns verified in codebase
- Architecture: HIGH -- factory patterns derived directly from existing code analysis; `FormBuilder` and `ConfirmDialog` already proven
- Pitfalls: HIGH -- identified through direct codebase comparison (transform layers, missing pages, differing patterns)
- Code examples: MEDIUM -- types for `createMutationHook` need validation against actual `useSessionMutation` generic constraints at build time

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- no dependency changes expected)

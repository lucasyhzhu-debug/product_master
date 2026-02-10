# Code Style Guide

> **Purpose:** Coding conventions and patterns for Frollie Recipe Master.
> **When to read:** During implementation to ensure consistency.

## Table of Contents
- [Convex Backend Patterns](#convex-backend-patterns)
- [TypeScript (Frontend)](#typescript-frontend)
- [Frontend Patterns](#frontend-patterns)
- [Business Logic Examples](#business-logic-examples)

---

## Convex Backend Patterns

### Convex Runtime Restrictions

**CRITICAL: Dynamic imports are NOT supported in Convex**

The Convex serverless runtime runs in restricted V8 isolates that do not support ES dynamic `import()`. This will work locally but **fail silently in production**.

```typescript
// FORBIDDEN - Will cause 204 No Content in production
export const myQuery = query({
  handler: async (ctx) => {
    const { helper } = await import("./helpers"); // BREAKS IN PRODUCTION
  },
});

// CORRECT - Use static imports at file top
import { helper } from "./helpers";

export const myQuery = query({
  handler: async (ctx) => {
    // Use helper directly
  },
});
```

**Why this matters:**
- Dynamic imports may work in `npx convex dev` but fail when deployed
- Errors appear as `TypeError: dynamic module import unsupported`
- The query returns 204 No Content with no obvious error to users

**If you have circular dependencies:**
- Restructure code to eliminate the cycle
- Move shared types/interfaces to a separate file
- Never use dynamic imports as a workaround

**CI Protection:**
- The GitHub Action runs `npm run lint:convex` to check for dynamic imports
- Any `await import(` pattern in `convex/` will fail the build

---

### Schema Definition
```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  recipes: defineTable({
    name: v.string(),
    tagIds: v.array(v.id("tags")),       // M2M via array
    createdBy: v.string(),
  })
    .index("by_name", ["name"]),          // Index for queries
});
```

### Query Functions
```typescript
// convex/recipes/queries.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

// List all - no args
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("recipes").collect();
  },
});

// Get by ID
export const getById = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query with index
export const getByRecipe = query({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .collect();
  },
});

// Query with filtering and sorting
export const getActiveOrders = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let query = ctx.db.query("orders");

    if (args.status) {
      query = query.withIndex("by_status", (q) => q.eq("status", args.status));
    }

    return await query.order("desc").collect();
  },
});
```

### Mutation Functions
```typescript
// convex/recipes/mutations.ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";

// Create - returns new ID
export const create = mutation({
  args: {
    name: v.string(),
    tagIds: v.array(v.id("tags")),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("recipes", args);
  },
});

// Update - patch specific fields
export const update = mutation({
  args: {
    id: v.id("recipes"),
    name: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tags"))),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    // Filter out undefined values
    const patch = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(id, patch);
    return await ctx.db.get(id);
  },
});

// Delete - remove by ID
export const remove = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    // Check for dependencies first
    const versions = await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.id))
      .collect();

    if (versions.length > 0) {
      throw new Error("Cannot delete recipe with versions");
    }

    await ctx.db.delete(args.id);
  },
});

// Complex mutation with multiple operations (transactional)
export const createWithVersion = mutation({
  args: {
    name: v.string(),
    tagIds: v.array(v.id("tags")),
    createdBy: v.string(),
    versionName: v.string(),
  },
  handler: async (ctx, args) => {
    // Create recipe
    const recipeId = await ctx.db.insert("recipes", {
      name: args.name,
      tagIds: args.tagIds,
      createdBy: args.createdBy,
    });

    // Create first version
    const versionId = await ctx.db.insert("recipeVersions", {
      recipeId,
      versionNumber: 1,
      versionName: args.versionName,
      isSingleComponent: false,
      isReusableComponent: false,
      createdBy: args.createdBy,
    });

    return { recipeId, versionId };
  },
});
```

### Validation Patterns
```typescript
// Use v.* validators for type safety
v.string()                    // Required string
v.optional(v.string())        // Optional string (null not allowed)
v.union(v.string(), v.null()) // String or null
v.number()                    // Required number
v.boolean()                   // Required boolean
v.id("recipes")               // ID reference to recipes table
v.array(v.id("tags"))         // Array of tag IDs
v.object({                    // Nested object
  name: v.string(),
  value: v.number(),
})

// Custom validation in handler
export const createOrder = mutation({
  args: { ... },
  handler: async (ctx, args) => {
    // Validate business rules
    if (args.quantity < 1) {
      throw new Error("Quantity must be at least 1");
    }

    // Check references exist
    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new Error("Customer not found");
    }

    // Proceed with creation
    return await ctx.db.insert("orders", args);
  },
});
```

### Backend Authorization Pattern

For mutations/queries that require role-based access control, use `requireRole()` from `convex/lib/auth.ts`:

```typescript
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

// Protected mutation - admin only
export const create = mutation({
  args: {
    token: v.string(),  // Session token from frontend
    name: v.string(),
    // ... other args
  },
  handler: async (ctx, args) => {
    // Validate auth before any business logic
    await requireRole(ctx, args.token, ["admin"]);

    // Extract token from args before passing to db
    const { token: _, ...data } = args;
    void _; // Suppress unused variable warning

    return await ctx.db.insert("myTable", data);
  },
});

// Multiple allowed roles
export const update = mutation({
  args: { token: v.string(), id: v.id("myTable") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);
    // ... rest of handler
  },
});
```

**Frontend pattern for protected mutations:**

```typescript
// src/hooks/convex/useMyHook.ts
import { useMutation } from "convex/react";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";

export function useProtectedMutation() {
  const mutation = useMutation(api.myModule.mutations.create);
  const { user } = useAuth();

  return {
    mutate: async (data: CreateInput) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      return mutation({ ...data, token: user.token });
    },
  };
}
```

**Available roles:** `kitchen`, `order_staff`, `manager`, `admin`

**Implementation checklist:**
1. Add `token: v.string()` to mutation args
2. Call `requireRole(ctx, args.token, [allowedRoles])` at handler start
3. Extract token before passing to db operations
4. Update frontend hooks to pass token from `useAuth()`

---

### Helper Functions

#### Two-Tier Helper Architecture (Orders Module)

**Decision Date:** 2026-02-02 | **Branch:** `refactor/orders-mutations-helpers`

The orders module uses a **two-tier helper system** to separate pure functions from database operations:

| Tier | Location | Has `ctx` | Testable | Purpose |
|------|----------|-----------|----------|---------|
| **Pure** | `convex/orders/helpers.ts` | No | Unit tests | Calculations, formatting |
| **Ctx-Dependent** | `convex/orders/helpers/*.ts` | Yes | Integration tests | DB operations |

**Why Two Tiers?**
1. **Pure helpers** (`helpers.ts`) can be unit tested without mocking Convex
2. **Ctx helpers** (`helpers/`) need database access and run in mutation context
3. Avoids import conflicts between the flat file and the directory

**Structure:**
```
convex/orders/
├── mutations.ts              # Thin mutation wrappers
├── queries.ts                # Query functions
├── helpers.ts                # PURE functions (no ctx)
│   ├── generateOrderNumber()
│   ├── calculateLineTotals()
│   ├── calculateOrderTotals()
│   └── recalculateFinalTotal()
│
└── helpers/                  # CTX-DEPENDENT functions
    ├── index.ts              # Barrel export
    ├── ballDistribution.ts   # distributeBallsToOrders() - dual-write logic
    ├── statusTransitions.ts  # logOrderEvent(), isTerminalStatus(), etc.
    ├── usageTracking.ts      # increment/decrementChannelUsage(), etc.
    └── productionRecords.ts  # createProductionRecordsForItem(), etc.
```

**Import Pattern:**
```typescript
// mutations.ts
// Pure calculation helpers (no ctx)
import { calculateLineTotals, recalculateFinalTotal } from "./helpers";

// Ctx-dependent helpers (require MutationCtx)
import {
  distributeBallsToOrders,
  logOrderEvent,
  isTerminalStatus,
  incrementChannelUsage,
  // ...
} from "./helpers/index";
```

**When Adding New Helpers:**
- **No database access needed?** → Add to `helpers.ts`
- **Needs `ctx.db` access?** → Add to `helpers/*.ts`
- **New concern area?** → Create new file in `helpers/` and export from `index.ts`

**Ball Distribution System:**

The `distributeBallsToOrders()` function uses the production tracking system:
- **Production tracking:** `orderItemProduction.unitsRemaining` (source of truth)
- **Visual tracking:** `orderItems.ballsFilled/packageStatus` (for UI display)

See `helpers/ballDistribution.ts` for implementation.

---

#### Global Helpers (convex/lib/)

```typescript
// convex/lib/costCalculator.ts
// Pure functions for business logic

export function normalizeToBaseUnit(quantity: number, unit: string): number {
  if (unit === "kg" || unit === "l") return quantity * 1000;
  if (unit === "m") return quantity * 100;
  return quantity;
}

export function getBaseUnit(unit: string): string {
  if (unit === "kg") return "g";
  if (unit === "l") return "ml";
  if (unit === "m") return "cm";
  return unit;
}

export function calculateCostPerBaseUnit(
  priceExclShipping: number,
  shippingCost: number,
  volumePurchased: number,
  unitType: string
): { costPerBaseUnit: number; baseUnit: string } {
  const totalCost = priceExclShipping + shippingCost;
  const baseVolume = normalizeToBaseUnit(volumePurchased, unitType);
  const baseUnit = getBaseUnit(unitType);

  if (baseVolume <= 0) {
    return { costPerBaseUnit: 0, baseUnit };
  }

  return {
    costPerBaseUnit: totalCost / baseVolume,
    baseUnit,
  };
}
```

---

## TypeScript (Frontend)

### Interfaces
```typescript
// Types should match Convex schema
// Use Doc<"tableName"> from Convex for exact types

import { Doc, Id } from "../convex/_generated/dataModel";

// Convex document type (auto-generated)
type Recipe = Doc<"recipes">;
type RecipeVersion = Doc<"recipeVersions">;

// ID types
type RecipeId = Id<"recipes">;
type TagId = Id<"tags">;

// Component prop types
interface RecipeCardProps {
  recipe: Recipe;
  onClick?: () => void;
}

export function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  // ...
}
```

### Convex React Hooks
```typescript
// Reading data (reactive - auto-updates)
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function RecipeList() {
  const recipes = useQuery(api.recipes.list);

  // Handle loading state
  if (recipes === undefined) {
    return <LoadingState />;
  }

  return recipes.map(r => <RecipeCard key={r._id} recipe={r} />);
}

// Reading with arguments
function RecipeDetail({ recipeId }: { recipeId: Id<"recipes"> }) {
  const recipe = useQuery(api.recipes.getById, { id: recipeId });
  const versions = useQuery(api.recipes.getVersions, { recipeId });

  if (recipe === undefined || versions === undefined) {
    return <LoadingState />;
  }

  // ...
}

// Conditional queries
function ConditionalQuery({ id }: { id?: Id<"recipes"> }) {
  // Pass "skip" to disable query when id is undefined
  const recipe = useQuery(
    api.recipes.getById,
    id ? { id } : "skip"
  );
}
```

### Mutations
```typescript
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function CreateRecipeForm() {
  const createRecipe = useMutation(api.recipes.create);
  const [name, setName] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const recipeId = await createRecipe({
        name,
        tagIds: [],
        createdBy: "admin",
      });

      toast.success("Recipe created!");
      navigate(`/recipes/${recipeId}`);
    } catch (error) {
      toast.error("Failed to create recipe");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* ... */}
    </form>
  );
}
```

---

## Frontend Patterns

### Page Structure
```typescript
// Pages handle routing params and data fetching
export function RecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";

  // Convex ID from URL param
  const recipeId = isNew ? undefined : (id as Id<"recipes">);

  const recipe = useQuery(
    api.recipes.getById,
    recipeId ? { id: recipeId } : "skip"
  );

  // Loading state
  if (!isNew && recipe === undefined) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={isNew ? "New Recipe" : recipe?.name || "Recipe"} />
      {/* Editor content */}
    </div>
  );
}
```

### Component Organization
```
components/
├── ui/                    # shadcn primitives (Button, Input, Dialog, etc.)
├── layout/
│   ├── Header.tsx         # Top navigation
│   ├── Layout.tsx         # Outlet wrapper
│   └── PageHeader.tsx     # Page title + back button
├── shared/
│   ├── Carousel.tsx       # Horizontal scrolling (300px scroll)
│   ├── VersionNavigator.tsx    # ← Version X → navigation
│   ├── CostTooltip.tsx    # (i) icon with cost info
│   ├── ConfirmDialog.tsx  # Delete warnings
│   ├── LoadingState.tsx   # Skeleton cards
│   └── EmptyState.tsx     # Empty list placeholder
├── recipes/
│   └── RecipeCard.tsx     # Recipe summary card
├── packaging/
│   └── PackagingCard.tsx  # Packaging summary card
├── products/
│   └── ProductCard.tsx    # Product summary with COGS
└── orders/
    ├── OrderHeader.tsx
    ├── OrderStatusPanel.tsx
    └── ...
```

### State Management
```typescript
// Server state via Convex (real-time, no cache invalidation needed)
const recipes = useQuery(api.recipes.list);

// Local UI state via useState
const [currentVersionNumber, setCurrentVersionNumber] = useState<number | null>(null);
const [components, setComponents] = useState<ComponentDraft[]>([]);
const [isDialogOpen, setIsDialogOpen] = useState(false);

// Form state pattern
interface FormState {
  name: string;
  description: string;
  tagIds: Id<"tags">[];
}

const [form, setForm] = useState<FormState>({
  name: "",
  description: "",
  tagIds: [],
});

const updateField = <K extends keyof FormState>(
  field: K,
  value: FormState[K]
) => {
  setForm(prev => ({ ...prev, [field]: value }));
};
```

### React Hooks Rules

**CRITICAL: All hooks must be called before any conditional returns**

React requires hooks to be called in the same order on every render. Violating this causes "Rendered more hooks than during the previous render" errors.

#### ✅ CORRECT Pattern
```typescript
export function MyComponent() {
  // 1. Call ALL hooks at the top
  const [state, setState] = useState(false);
  const data = useQuery(api.myQuery.list);
  const mutation = useMutation(api.myMutation.create);
  const computed = useMemo(() => expensiveCalc(data), [data]);

  // 2. THEN do conditional returns
  if (data === undefined) {
    return <Loading />;
  }

  if (data.length === 0) {
    return <Empty />;
  }

  // 3. Finally, render main content
  return <div>...</div>;
}
```

#### ❌ WRONG Pattern
```typescript
export function MyComponent() {
  const [state, setState] = useState(false);

  // WRONG: Early return before calling all hooks
  if (someCondition) {
    return <Loading />;
  }

  // WRONG: These hooks won't be called on every render
  const data = useQuery(api.myQuery.list);
  const computed = useMemo(() => calc(data), [data]);
}
```

**Why this matters:**
- React tracks hooks by call order, not by name
- Conditional hook calls cause React to lose track of state
- Errors manifest as "hook order changed" or "rendered more hooks"

**Reference:** [React Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)

---

### Form Handling
```typescript
// Use controlled components
const [components, setComponents] = useState<ComponentDraft[]>([]);

// Add item
const addComponent = () => {
  setComponents([...components, {
    id: crypto.randomUUID(),
    componentName: `Component ${components.length + 1}`,
    sortOrder: components.length,
    ingredients: [],
  }]);
};

// Update item
const updateComponent = (id: string, updates: Partial<ComponentDraft>) => {
  setComponents(components.map(c =>
    c.id === id ? { ...c, ...updates } : c
  ));
};

// Remove item
const removeComponent = (id: string) => {
  setComponents(components.filter(c => c.id !== id));
};

// Validate before save
async function handleSave() {
  if (components.length === 0) {
    toast.error("Recipe must have at least one component");
    return;
  }

  if (components.some(c => c.ingredients.length === 0)) {
    toast.error("All components must have at least one ingredient");
    return;
  }

  try {
    await createRecipe({ ... });
    toast.success("Recipe saved!");
  } catch (error) {
    toast.error("Failed to save recipe");
  }
}
```

---

### Toast & Action Feedback

**Pattern:** Use `actionToast()` for quick success confirmations. Use `toast.error()` for errors.

```typescript
import { actionToast } from '@/lib/actionToast';
import { toast } from 'sonner';

// SUCCESS: Use actionToast - appears near the button that was clicked
const handleBox = async (menuProductId: string, quantity: number, event?: React.MouseEvent) => {
  try {
    await boxProducts({ menuProductId, quantity });
    actionToast(`Boxed +${quantity}`, event);  // floating pill near the click
  } catch {
    toast.error('Failed to box');  // prominent Sonner toast at top-center
  }
};

// ERROR: Always use toast.error() - persistent, top-center via Sonner
toast.error('Failed to save');
```

**Why:** Mobile-first kitchen staff tap buttons repeatedly. Feedback near the button is instantly visible without scanning to a corner.

**Rules:**
- `actionToast(message, event)` -- for all success/confirmation feedback after actions
- `toast.error(message)` -- for all error feedback (top-center, persistent via Sonner)
- `toast.info(message)` -- for informational messages (top-center via Sonner)
- Never use `toast.success()` -- use `actionToast()` instead
- Thread `React.MouseEvent` through handler signatures so the toast can position itself near the button

**Implementation:** `src/lib/actionToast.ts` creates a lightweight floating DOM element near the clicked button, no React rendering overhead.

### Toast & Action Feedback

**Pattern:** Use `actionToast()` for quick success confirmations. Use `toast.error()` for errors.

```typescript
import { actionToast } from '@/lib/actionToast';
import { toast } from 'sonner';

// SUCCESS: Use actionToast — appears near the button
const handleBox = async (id: string, qty: number, e?: React.MouseEvent) => {
  try {
    await boxProducts({ menuProductId: id, quantity: qty });
    actionToast(`Boxed +${qty}`, e);  // appears near the click
  } catch {
    toast.error('Failed to box');  // appears at top-center via Sonner
  }
};

// ERROR: Always use toast.error() — prominent, persistent
toast.error('Failed to save');
```

**Why:** Mobile-first kitchen staff tap buttons repeatedly. Feedback near the button is instantly visible without scanning to a corner.

**Rules:**
- `actionToast(message, event)` — for all success/confirmation feedback (floats near the clicked button, fades after 1.2s)
- `toast.error(message)` — for all error feedback (top-center via Sonner, persistent with close button)
- `toast.info(message)` — for informational messages (top-center via Sonner)
- Never use `toast.success()` — use `actionToast()` instead
- Thread the `React.MouseEvent` through handler callbacks so `actionToast` can position near the button

**Files:**
- `src/lib/actionToast.ts` — The utility (creates a floating DOM element near click target)
- `src/index.css` — Animation keyframes (`action-toast-in`, `action-toast-out`)
- `src/components/ui/sonner.tsx` — Global Sonner config (`position="top-center"`)

---

## Business Logic Examples

### Cost Calculations (convex/lib/costCalculator.ts)

```typescript
export function normalizeToBaseUnit(quantity: number, unit: string): number {
  // Convert kg→g, l→ml, m→cm. Base units: g, ml, pcs, cm, sheets
  if (unit === "kg" || unit === "l") return quantity * 1000;
  if (unit === "m") return quantity * 100;
  return quantity;
}

export function getIngredientCostPerBaseUnit(
  ingredient: Doc<"ingredients">
): { cost: number; unit: string } {
  const totalCost = ingredient.priceExclShipping + ingredient.shippingCost;
  const baseVolume = normalizeToBaseUnit(
    ingredient.volumePurchased,
    ingredient.unitType
  );
  const baseUnit = getBaseUnit(ingredient.unitType);

  if (baseVolume <= 0) {
    return { cost: 0, unit: baseUnit };
  }

  return {
    cost: totalCost / baseVolume,
    unit: baseUnit,
  };
}

export function calculateLineCost(
  quantity: number,
  unit: string,
  costPerBaseUnit: number
): number {
  const normalizedQuantity = normalizeToBaseUnit(quantity, unit);
  return normalizedQuantity * costPerBaseUnit;
}

export function calculateProductCogs(
  recipeCostPerGram: number | null,
  packagingCost: number,
  numPieces: number,
  gramsPerPiece: number,
  retailPrice: number
): {
  totalGrams: number;
  recipeCogs: number | null;
  packagingCogs: number;
  totalCogs: number | null;
  contributionMargin: number | null;
  contributionMarginPct: number | null;
} {
  const totalGrams = numPieces * gramsPerPiece;
  const recipeCogs = recipeCostPerGram !== null
    ? recipeCostPerGram * totalGrams
    : null;

  const totalCogs = recipeCogs !== null
    ? recipeCogs + packagingCost
    : null;

  const contributionMargin = totalCogs !== null
    ? retailPrice - totalCogs
    : null;

  const contributionMarginPct = contributionMargin !== null && retailPrice > 0
    ? (contributionMargin / retailPrice) * 100
    : null;

  return {
    totalGrams,
    recipeCogs,
    packagingCogs: packagingCost,
    totalCogs,
    contributionMargin,
    contributionMarginPct,
  };
}
```

### Versioning Logic (convex/recipes/mutations.ts)

```typescript
export const copyVersion = mutation({
  args: {
    recipeId: v.id("recipes"),
    copyFromVersionId: v.id("recipeVersions"),
    versionName: v.string(),
    description: v.optional(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Get source version
    const source = await ctx.db.get(args.copyFromVersionId);
    if (!source || source.recipeId !== args.recipeId) {
      throw new Error("Source version not found or belongs to different recipe");
    }

    // Get next version number
    const versions = await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .collect();
    const maxVersion = Math.max(...versions.map(v => v.versionNumber), 0);

    // Create new version
    const newVersionId = await ctx.db.insert("recipeVersions", {
      recipeId: args.recipeId,
      versionNumber: maxVersion + 1,
      versionName: args.versionName,
      description: args.description,
      estimatedYieldGrams: source.estimatedYieldGrams,
      isSingleComponent: source.isSingleComponent,
      isReusableComponent: source.isReusableComponent,
      copiedFromVersionId: args.copyFromVersionId,
      createdBy: args.createdBy,
    });

    // Deep copy components
    const sourceComponents = await ctx.db
      .query("recipeComponents")
      .withIndex("by_version", (q) => q.eq("recipeVersionId", args.copyFromVersionId))
      .collect();

    for (const srcComp of sourceComponents) {
      const newCompId = await ctx.db.insert("recipeComponents", {
        recipeVersionId: newVersionId,
        sortOrder: srcComp.sortOrder,
        componentName: srcComp.componentName,
        linkedRecipeVersionId: srcComp.linkedRecipeVersionId,
      });

      // Deep copy ingredients
      const srcIngredients = await ctx.db
        .query("componentIngredients")
        .withIndex("by_component", (q) => q.eq("recipeComponentId", srcComp._id))
        .collect();

      for (const srcIng of srcIngredients) {
        await ctx.db.insert("componentIngredients", {
          recipeComponentId: newCompId,
          ingredientId: srcIng.ingredientId,
          sortOrder: srcIng.sortOrder,
          unit: srcIng.unit,
          quantity: srcIng.quantity,
        });
      }
    }

    return newVersionId;
  },
});
```

---

## Responsive Design Testing

### Minimum Width Requirement

**All UI components must be tested at minimum 280px width** (smallest mobile viewport).

### Common Responsive Patterns

```typescript
// ❌ BAD: Everything on one row - breaks on narrow screens
<div className="flex items-center justify-between">
  <span>Product Name (80g)</span>
  <div className="flex gap-2">
    <Button>-</Button>
    <span>4</span>
    <Button>+</Button>
    <span>Rp 200.000</span>
    <Button>🗑</Button>
  </div>
</div>

// ✅ GOOD: Stack into rows on narrow screens
<div className="p-3 space-y-2">
  {/* Row 1: Name + delete */}
  <div className="flex items-center justify-between">
    <span>Product Name (80g)</span>
    <Button>🗑</Button>
  </div>
  {/* Row 2: Quantity controls + price */}
  <div className="flex items-center justify-between">
    <div className="flex gap-2">
      <Button>-</Button>
      <span>4</span>
      <Button>+</Button>
    </div>
    <span>Rp 200.000</span>
  </div>
</div>
```

### Responsive Button Groups

```typescript
// ❌ BAD: Buttons overflow and get cut off
<div className="flex gap-2">
  <Button>Paste from Clipboard</Button>
  <Button>Parse & Create</Button>
</div>

// ✅ GOOD: Stack on mobile, row on desktop
<div className="flex flex-col sm:flex-row gap-2">
  <Button className="w-full sm:w-auto">Paste from Clipboard</Button>
  <Button className="w-full sm:w-auto">Parse & Create</Button>
</div>
```

### Testing Checklist

Before merging any UI changes, verify at these breakpoints:
- [ ] **280px** - Smallest mobile (Galaxy Fold)
- [ ] **320px** - iPhone SE
- [ ] **375px** - iPhone standard
- [ ] **640px** - Tablet portrait (sm breakpoint)
- [ ] **768px** - Tablet landscape (md breakpoint)
- [ ] **1024px** - Desktop (lg breakpoint)

### Key Patterns

| Pattern | Use Case |
|---------|----------|
| `flex-col sm:flex-row` | Button groups, form sections |
| `w-full sm:w-auto` | Full-width buttons on mobile |
| `grid grid-cols-1 sm:grid-cols-2` | Card grids |
| `hidden sm:block` | Hide non-essential on mobile |
| `text-sm sm:text-base` | Responsive text sizing |
| `gap-2 sm:gap-4` | Tighter spacing on mobile |
| `p-3 sm:p-4` | Reduced padding on mobile |

---

### WhatsApp Formatting (convex/orders/whatsapp.ts)

```typescript
export function formatOrderReceipt(
  order: Doc<"orders">,
  items: Doc<"orderItems">[],
  customer: Doc<"customers">
): string {
  const lines: string[] = [];

  lines.push(`*MALO GROUP BAHAGIA*`);
  lines.push(`Order #${order.orderNumber}`);
  lines.push(`---`);
  lines.push(`Customer: ${customer.name}`);
  if (order.dueDate) {
    lines.push(`Due: ${formatDate(order.dueDate)}`);
  }
  lines.push(``);

  // Items
  lines.push(`*Items:*`);
  for (const item of items) {
    const variant = item.productVariant ? ` (${item.productVariant})` : "";
    lines.push(`• ${item.quantity}x ${item.productName}${variant}`);
    lines.push(`  @ Rp ${formatNumber(item.unitPrice)} = Rp ${formatNumber(item.lineTotal)}`);
  }

  lines.push(``);
  lines.push(`*Total: Rp ${formatNumber(order.totalAmount)}*`);
  lines.push(``);
  lines.push(`Payment: BCA 1234567890`);
  lines.push(`a.n. PT Malo Group Bahagia`);

  return lines.join("\n");
}
```

---

## Common Implementation Tasks

### Adding a New Order Field

```typescript
// 1. Update schema.ts
orders: defineTable({
  // ... existing fields
  myNewField: v.optional(v.string()),
})

// 2. Update mutations.ts (create mutation)
export const create = mutation({
  args: {
    // ... existing args
    myNewField: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const orderId = await ctx.db.insert("orders", {
      // ... existing fields
      myNewField: args.myNewField,
    });
    return orderId;
  },
});

// 3. Update frontend hook (src/hooks/convex/useOrders.ts)
// Types auto-generate from schema

// 4. Update UI component
// Use Convex reactive query to auto-update
const order = useQuery(api.orders.queries.getById, { id: orderId });
```

### Creating a New Mutation

```typescript
// convex/orders/mutations.ts
export const myNewMutation = mutation({
  args: {
    orderId: v.id("orders"),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Fetch and validate
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    // 2. Business logic (use pure helpers when possible)
    const calculated = myPureHelper(args.value);

    // 3. Update database
    await ctx.db.patch(args.orderId, {
      myField: calculated,
    });

    // 4. Side effects (logging, notifications)
    await logOrderEvent(ctx, args.orderId, "my_action", "Description");

    return args.orderId;
  },
});
```

### Adding a WhatsApp Template

```typescript
// convex/orders/whatsapp.ts

// 1. Add to TemplateType union
type TemplateType =
  | "payment_request"
  | "production_started"
  // ...
  | "my_new_template";  // ADD HERE

// 2. Create generator function
function generateMyNewTemplate(order: OrderWithItems): string {
  const customerName = order.customer?.name ?? order.customerName;
  return `Halo ${customerName}!\n\nYour custom message here.`;
}

// 3. Add to switch statement in generateTemplate()
function generateTemplate(order: OrderWithItems, template: TemplateType): string {
  switch (template) {
    // ... existing cases
    case "my_new_template":
      return generateMyNewTemplate(order);
    // ...
  }
}

// 4. Update args validator in getMessage query
export const getMessage = query({
  args: {
    orderId: v.id("orders"),
    template: v.union(
      // ... existing templates
      v.literal("my_new_template")  // ADD HERE
    ),
  },
  // ...
});
```

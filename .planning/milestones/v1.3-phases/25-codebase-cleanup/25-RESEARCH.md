# Phase 25: Codebase Cleanup - Research

**Researched:** 2026-02-23
**Domain:** Internal code quality — dark mode CSS, hook naming, mutation wrappers, query helpers
**Confidence:** HIGH (all findings from direct codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dark Mode Coverage**
- Scope: Full audit of all `src/` components — fix ANY hardcoded colors found, not just K3Mart
- Approach: Use cascaded Tailwind `dark:` variants and CSS variables from the project's design system. Do NOT reinvent colors with inline styles or hardcoded hex values
- Reference: `docs/CODE_STYLE.md` — implementation uses global `.dark` class on `<html>` (Tailwind class strategy)
- WhatsApp live preview specifically: The preview bubble should mimic WhatsApp's own dark mode aesthetic (dark background, teal/green adapted bubbles) — NOT default to generic card/muted colors. Same approach was applied to the templates manager page text; apply consistently here
- Rule: If a component is simulating an external UI (WhatsApp), match that app's dark mode. For all other components, use the project's design system variables

**Hook Rename Scope**
- Pre-flight audit required: Not all 24 hooks may have the `useConvex` prefix — scan all files in `src/hooks/convex/` before renaming anything
- Collision audit required: Check for any `useOrders`, `useRecipes`, etc. defined outside `src/hooks/convex/` that would collide after rename
- What to rename: Both file names AND exported function names (audit to confirm if they match)
- Cut-over strategy: Clean cut-over is preferred (rename hook + update all import sites in one operation per batch), no compatibility shim exports
- Execution: Rename in batches of 5-6 hooks. Run `npm run type-check` after each batch before continuing

**protectedMutation Rollout**
- Scope: Apply `protectedMutation` wrapper to ALL mutations in `orders/`, `recipes/`, and `products/` — including public/unauthenticated ones (pass empty roles array for public mutations)
- Existing inline auth: Keep existing `requireRole()` calls in place — do NOT remove them. Belt-and-suspenders approach. Auth is security-critical
- Query factory: Apply generic query factory only to query files where it provides significant benefit — not a blanket rollout. Claude audits each file and applies selectively based on whether the pattern is a clean fit

**Execution Strategy**
- Parallelism: All four streams are independent and can run in parallel (separate agents)
- Commits: One atomic commit per stream — four commits total. Easier to bisect and independently revertable
- Hook rename specifically: Batched execution (5-6 hooks per batch, verify per batch)
- Sequence within each stream: Audit → implement → type-check → commit

### Claude's Discretion
- Exact batching order for hook rename (which hooks to rename first)
- Specific query files selected for query factory (based on audit)
- Exact dark mode color values for WhatsApp preview bubble adaptation
- Whether to use feature branch per stream or one branch for the whole phase

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

---

## Summary

Phase 25 is a four-stream internal cleanup with no user-facing changes. The streams are fully independent and can execute in parallel. Research confirmed current state via direct codebase inspection.

**Stream 1 — Dark Mode:** 18 files across `src/` have hardcoded Tailwind color classes (bg-white, text-gray-N, bg-gray-N, etc.) without `dark:` pairs. The project uses a `.dark` class strategy via `@custom-variant dark` in `src/index.css` (Tailwind v4). CSS variables for background, card, border, muted, etc. are fully defined for both light and dark themes. The WhatsApp preview bubble at `src/components/whatsappTemplates/TemplateEditor.tsx` uses hardcoded `bg-[#ECE5DD]` (WhatsApp light beige) and `bg-[#DCF8C6]` (WhatsApp light green bubble) — these need dark equivalents matching WhatsApp's actual dark mode colors (`#0d1117` or `#111b21` background, `#005c4b` bubble).

**Stream 2 — Hook Rename:** 161 `useConvex`-prefixed exported functions exist across 15 hook files. 9 of those 15 files have ALL their hooks prefixed (100% density). The other 6 files are mixed (some hooks already lack the prefix: `useKanbanOrders`, `useCreateDraft`, etc. in useOrders.ts; `useKitchenProduction` in useKitchenProduction.ts; etc.). Zero collision risk: no `useOrders`, `useCustomers`, etc. exist outside `src/hooks/convex/`. Import sites span ~57 consumer files (pages + components) with 257 total useConvex usages. The test file `src/hooks/__tests__/useConvexHooks.test.tsx` imports with useConvex prefix and must also be updated.

**Stream 3 — protectedMutation Rollout:** Currently, only 8 simple-entity mutation files use `protectedMutation` (ingredients, customers, storageLocations, materials, componentTypes, productionUnitTypes, menuProductComponents, menuProducts). The `orders/` mutations directory has 7 files using bare `mutation()` with scattered inline `requireRole()` calls and manual `token: v.string()` args. `convex/productionRecipes/mutations.ts` also uses bare `mutation()` with inline `requireRole()`. Crucially: `protectedMutation` uses `SessionIdArg` from `convex-helpers/server/sessions` — the frontend counterpart is `useSessionMutation` from `convex-helpers/react/sessions`. The orders hook (`useOrders.ts`) currently uses raw `useMutation` (not `useSessionMutation`), meaning migrating orders mutations to `protectedMutation` also requires migrating the hook to `useSessionMutation` (or using `createMutationHook`). NOTE: The CONTEXT.md decision says to pass empty roles array for public mutations — but the current `protectedMutation` implementation THROWS if no valid role is found. An empty `roles: []` would always throw for any user. This is an open question to clarify in planning.

**Stream 4 — Query Factory:** `convex/lib/queryHelpers.ts` exports `listAll`, `getById`, and `textSearch` helper functions. Currently 8 query files use it (ingredients, customers, materials, vouchers, storageLocations, componentTypes, productionUnitTypes, menuProductComponents). The `orders/queries.ts` (1,254+ lines) and `productionRecipes/queries.ts` have complex joins and multi-step lookups — `listAll` would only help a small subset of their simple queries. Selective application per CONTEXT decision is appropriate.

**Primary recommendation:** Run all four streams in parallel on the same branch. The hook rename is the highest-effort stream (~161 function renames + 257 call sites) and benefits most from batching. The protectedMutation stream needs a design decision resolved (empty roles array behavior) before implementation.

---

## Standard Stack

### Core (already in use — no new installations needed)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Tailwind CSS v4 | ^4.1.18 | Dark mode via `@custom-variant dark` | `.dark` class on `<html>` element |
| convex-helpers | in package.json | `SessionIdArg`, `useSessionMutation`, `customMutation` | Already drives `protectedMutation` and `createMutationHook` |
| convex | ^1.31.7 | `mutation()`, `query()` base wrappers | Backend runtime |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript strict mode | ~5.9 | Type safety across rename | Run `npm run type-check` after each batch |

### Alternatives Considered
None relevant — all tooling is already chosen and in use.

**Installation:** No new packages needed.

---

## Architecture Patterns

### Stream 1: Dark Mode

**Design system variables (src/index.css):**
```css
/* Light theme (default) */
--color-background: hsl(0 0% 100%);
--color-card: hsl(0 0% 100%);
--color-border: hsl(214.3 31.8% 91.4%);
--color-muted: hsl(210 40% 96.1%);
--color-muted-foreground: hsl(215.4 16.3% 46.9%);

/* Dark theme overrides (.dark class) */
--color-background: hsl(224 10% 10%);
--color-card: hsl(224 10% 13%);
--color-border: hsl(224 10% 20%);
--color-muted: hsl(224 10% 18%);
```

**Standard fix pattern (hardcoded -> design system):**
```tsx
// BEFORE (hardcoded, breaks dark mode)
<div className="bg-white text-gray-600 border-gray-200">

// AFTER (design system variables, dark mode inherits)
<div className="bg-card text-muted-foreground border-border">
```

**WhatsApp preview dark mode pattern (external UI simulation):**
```tsx
// BEFORE (hardcoded WhatsApp light colors only)
<div className="bg-[#ECE5DD] rounded-lg p-4">
  <div className="bg-[#DCF8C6] rounded-lg p-3">

// AFTER (WhatsApp light + dark)
// WhatsApp dark mode: #111b21 chat bg, #005c4b sent bubble
<div className="bg-[#ECE5DD] dark:bg-[#0d1117] rounded-lg p-4">
  <div className="bg-[#DCF8C6] dark:bg-[#005c4b] rounded-lg p-3">
    <pre className="text-sm text-foreground/80 dark:text-[#e9edef] whitespace-pre-wrap font-sans">
```

The timestamp color `#667781` → dark `#8696a0`, checkmark `#53bdeb` stays same.

**Tailwind v4 custom variant syntax (already in project):**
```css
/* src/index.css — already exists */
@custom-variant dark (&:where(.dark, .dark *));
```

This means `dark:` utilities work automatically on any element inside `.dark`.

### Stream 2: Hook Rename

**Audit results — hooks WITHOUT useConvex prefix (keep as-is):**
- `useOrders.ts`: `useKanbanOrders`, `useCreateDraft`, `useUpdateDraft` — already clean
- `useIngredients.ts`: `useLinkIngredientToComponentType`, `useUnlinkIngredientFromComponentType`
- `useVouchers.ts`: `useVouchers`, `useManagerOverrides`, `useActiveVouchersForCombobox` — ALL clean
- `useGoFoodDepot.ts`: ALL hooks clean (no useConvex prefix on any)
- `useProductInventory.ts`: ALL hooks clean
- `useKitchenProduction.ts`: `useKitchenProduction` — clean
- `useKitchenTargets.ts`: `useKitchenTargets` — clean
- `useDispatchPlanner.ts`: ALL hooks clean
- `useProductionRecipes.ts`: ALL hooks clean
- `useProductionUnitTypes.ts`: has useConvex prefix — NEEDS rename

**Files with 100% useConvex prefix (all hooks need renaming):**
- `useComponentTypes.ts` — 10 exports
- `useCustomers.ts` — 7 exports
- `useExternalData.ts` — 24 exports
- `useFeedback.ts` — 12 exports
- `useInventory.ts` — 13 exports
- `useK3MartCockpit.ts` — 22 exports
- `useKitchenStats.ts` — 8 exports
- `useMenuProductComponents.ts` — 2 exports
- `useMenuProducts.ts` — 16 exports
- `useSalesAnalytics.ts` — 3 exports
- `useStorageLocations.ts` — 6 exports
- `useWhatsAppTemplates.ts` — 5 exports
- `useProductionUnitTypes.ts` — 3 exports

**Files with PARTIAL useConvex prefix (mixed — only rename the prefixed ones):**
- `useOrders.ts` — 24 of 27 exports need rename
- `useIngredients.ts` — 6 of 8 exports need rename

**Rename pattern:**
```typescript
// BEFORE
export function useConvexOrders(filters?: OrderFilters) { ... }

// AFTER
export function useOrders(filters?: OrderFilters) { ... }
```

Also update barrel export in `index.ts` and ALL import sites in pages/components.

**Collision audit result:** CLEAN. No `useOrders`, `useCustomers`, `useMenuProducts`, etc. defined outside `src/hooks/convex/`. Only `useAuth` (AuthContext), `useTheme` (ThemeContext), `useViewPreference` (EntityManager, private), `useLocalStorage` (main.tsx, private) exist.

**Suggested batching order (smallest-to-largest, easier type-check verification):**
- Batch 1: `useMenuProductComponents` (2) + `useSalesAnalytics` (3) + `useProductionUnitTypes` (3) + `useWhatsAppTemplates` (5) = 13 renames
- Batch 2: `useStorageLocations` (6) + `useCustomers` (7) + `useKitchenStats` (8) = 21 renames
- Batch 3: `useComponentTypes` (10) + partial `useIngredients` (6) + partial `useOrders` (24) = 40 renames
- Batch 4: `useInventory` (13) + `useFeedback` (12) + `useMenuProducts` (16) = 41 renames
- Batch 5: `useExternalData` (24) + `useK3MartCockpit` (22) = 46 renames

**Test file:** `src/hooks/__tests__/useConvexHooks.test.tsx` also imports useConvex-prefixed names — must be updated in the same batch as `useOrders.ts`.

### Stream 3: protectedMutation Rollout

**Current `protectedMutation` signature:**
```typescript
// convex/lib/functions.ts
export const protectedMutation = customMutation(mutation, {
  args: SessionIdArg,  // adds sessionId arg automatically
  input: async (ctx, { sessionId }, { roles }: { roles: UserRole[] }) => {
    const user = await getSessionUser(ctx, sessionId);
    if (!user || !user.isActive) throw new ConvexError("Unauthorized");
    if (!roles.includes(user.role as UserRole)) throw new ConvexError("Unauthorized");
    return { ctx: { ...ctx, user: user as Doc<"users"> }, args: {} };
  },
});
```

**CRITICAL DESIGN ISSUE — Empty roles array:** The CONTEXT.md decision says "pass empty roles array for public mutations." However, the current `protectedMutation` implementation throws `Unauthorized` when `roles.includes(user.role)` is false. An empty `roles: []` would ALWAYS throw for any authenticated user. The planner must address this: either (a) interpret "public mutations" to mean they should stay as bare `mutation()` (not be migrated), or (b) the `protectedMutation` wrapper needs a modification to treat empty `roles` as "any authenticated user is allowed."

**Pattern for simple entities (reference):**
```typescript
// convex/ingredients/mutations.ts
import { protectedMutation } from "../lib/functions";

export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: { name: v.string(), ... },
  handler: async (ctx, args) => {
    // ctx.user is Doc<"users"> — no token arg needed
    return await ctx.db.insert("ingredients", { ...args, createdBy: ctx.user.name });
  },
});
```

**What changes when migrating `orders/mutations/orderCrud.ts`:**
- Replace `import { mutation } from "../../_generated/server"` with `import { protectedMutation } from "../../lib/functions"`
- Replace `mutation({ args: { token: v.string(), ...rest }, handler: async (ctx, args) => { await requireRole(ctx, args.token, roles); ... } })` with `protectedMutation({ roles: [...], args: { ...rest }, handler: async (ctx, args) => { ... } })`
- Keep existing `requireRole()` calls as belt-and-suspenders (per CONTEXT.md)
- The `token` field disappears from args — callers no longer pass it manually; `sessionId` is auto-injected by `useSessionMutation`

**Frontend consequence:** Any orders hook using `useMutation` (raw) that calls a mutation now using `SessionIdArg` must switch to `useSessionMutation` (or `createMutationHook` which wraps it). Currently `useOrders.ts` uses `import { useQuery, useMutation, usePaginatedQuery } from "convex/react"`.

**Files to migrate (backend):**
- `convex/orders/mutations/orderCrud.ts` — 12 exports using bare `mutation()`
- `convex/orders/mutations/statusUpdates.ts` — 8 exports using bare `mutation()`
- `convex/orders/mutations/itemCrud.ts` — 4 exports using bare `mutation()`
- `convex/orders/mutations/packaging.ts` — 6 exports using bare `mutation()`
- `convex/orders/mutations/inventoryIntegration.ts` — 4 exports using bare `mutation()`
- `convex/orders/mutations/kitchen.ts` — 8 exports (NOTE: this file's comment says it intentionally stays as bare `mutation()` since "not user-facing CRUD operations. Auth is enforced by the calling order" — this needs planner review)
- `convex/orders/mutations/migrations.ts` — check if applicable
- `convex/productionRecipes/mutations.ts` — 6+ exports using bare `mutation()` with inline `requireRole()`

**Frontend files to migrate (if backend moves to SessionIdArg):**
- `src/hooks/convex/useOrders.ts` — replace `useMutation` with `useSessionMutation` or `createMutationHook`
- `src/hooks/convex/useKitchenStats.ts` — uses `useMutation` for kitchen operations
- `src/hooks/convex/useProductionRecipes.ts` — uses `useMutation` (check current pattern)

### Stream 4: Query Factory

**Existing `queryHelpers.ts` utilities:**
```typescript
// convex/lib/queryHelpers.ts
export async function listAll<T extends TableNames>(ctx, table, options?) // list with optional filter
export async function getById<T extends TableNames>(ctx, id) // get single by ID
export async function textSearch<T extends TableNames>(ctx, table, searchQuery, fields, limit?) // in-memory search
```

**Files already using query factory (skip):**
- `convex/ingredients/queries.ts`, `convex/customers/queries.ts`, `convex/materials/queries.ts`
- `convex/vouchers/queries.ts`, `convex/storageLocations/queries.ts`
- `convex/componentTypes/queries.ts`, `convex/productionUnitTypes/queries.ts`
- `convex/menuProductComponents/queries.ts`

**Candidate files for new adoption:**
- `convex/menuProducts/queries.ts` — likely has list/getById patterns (simple entity, good fit)
- `convex/productionRecipes/queries.ts` — complex joins; `listAll`/`getById` would help at most 1-2 queries; low benefit
- `convex/orders/queries.ts` (1,254 lines) — heavily indexed, complex aggregations; `listAll` not applicable; skip
- `convex/kitchenConfig/queries.ts`, `convex/whatsappTemplates/queries.ts` — small files, may benefit
- `convex/inventory/queries.ts`, `convex/productInventory/queries.ts` — mixed; need inspection
- `convex/menuProductComponents/queries.ts` — already uses queryHelpers ✓

**Anti-pattern to avoid:** Do not force `listAll` onto queries that use specific Convex indexes for efficiency. `listAll` collects all rows then filters in-memory — only safe for small tables (the comment in queryHelpers.ts says "<10k rows").

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session auth in mutations | Custom token injection per mutation | `protectedMutation` + `useSessionMutation` | Already abstracted in `convex/lib/functions.ts`; session lifecycle managed by `SessionProvider` in `main.tsx` |
| Dark mode color values | Hardcoded hex pairs for each element | CSS variables via `bg-card`, `text-muted-foreground`, `border-border` | Design system in `index.css` already defines all semantic color tokens for both themes |
| Hook compatibility shims | `export const useConvexOrders = useOrders` re-exports | Clean rename + update all imports | Creates confusion about which name to use; TypeScript will catch all missed sites |

---

## Common Pitfalls

### Pitfall 1: Empty roles array on protectedMutation always rejects
**What goes wrong:** Passing `roles: []` to `protectedMutation` causes Convex to throw `Unauthorized` for every call because `[].includes(user.role)` is always false.
**Why it happens:** The implementation checks `roles.includes(user.role)` strictly. "Public" mutations that need no auth check would need either: (a) a separate `publicMutation` wrapper (already exists as re-export of bare `mutation`), or (b) a special sentinel like `roles: null` meaning "any authenticated user."
**How to avoid:** The planner must define the strategy — likely "public mutations" means mutations that should stay as bare `mutation()`, not be migrated to `protectedMutation`. Migrations, seeds, and kitchen internal operations are candidates.
**Warning signs:** Type-check passes but runtime throws 401 immediately on any call to a migration with `roles: []`.

### Pitfall 2: Hook rename misses the barrel export (index.ts)
**What goes wrong:** Hook function is renamed, imports in consumer files are updated, but `src/hooks/convex/index.ts` still exports the old `useConvexX` name — TypeScript finds zero errors because the old name still resolves.
**Why it happens:** index.ts re-exports everything; it's a third place to update (hook definition, barrel export, consumer imports).
**How to avoid:** Always update `index.ts` in the same operation as the hook file rename. Grep for the old name in index.ts after each batch.

### Pitfall 3: Frontend hooks use raw `useMutation` while backend uses `SessionIdArg`
**What goes wrong:** Backend mutation expects `sessionId` auto-injected (via `SessionIdArg`), but frontend still calls `useMutation` which doesn't inject it — Convex throws a validation error saying required `sessionId` arg is missing.
**Why it happens:** `SessionIdArg` is injected by `useSessionMutation` (convex-helpers). Raw `useMutation` from `convex/react` does NOT inject it.
**How to avoid:** When migrating a backend mutation to `protectedMutation`, simultaneously migrate the corresponding hook from `useMutation` to `useSessionMutation` (or use `createMutationHook` which wraps `useSessionMutation`).

### Pitfall 4: Dark mode fix on semantic tokens that already adapt
**What goes wrong:** Adding `dark:bg-card` to something already using `bg-card` — redundant and noisy.
**Why it happens:** `bg-card` already reads `--color-card` which has a `.dark` override. No explicit `dark:` needed for design-system tokens.
**How to avoid:** Only add `dark:` variants to hardcoded Tailwind values (e.g., `bg-white`, `bg-gray-100`, `text-gray-600`) — not to design-system semantic classes.

### Pitfall 5: React hooks order violation during hook renames
**What goes wrong:** During rename, if a hook is conditionally called (incorrectly) somewhere, TypeScript won't catch it but React will throw at runtime.
**Why it happens:** Not a rename-specific issue, but renaming may reveal existing violations.
**How to avoid:** Run `npm run type-check` after each rename batch; review any new warnings.

---

## Code Examples

### protectedMutation migration (reference — from ingredients)

```typescript
// Source: convex/ingredients/mutations.ts (existing pattern)

import { protectedMutation } from "../lib/functions";
// Note: NO manual 'token' arg, NO explicit requireRole call needed (handled by wrapper)

export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    name: v.string(),
    // ... other args (no token here)
  },
  handler: async (ctx, args) => {
    // ctx.user is Doc<"users"> — auto-populated by wrapper
    return await ctx.db.insert("ingredients", {
      ...args,
      createdBy: ctx.user.name,
    });
  },
});
```

### createMutationHook pattern (reference — for migrating useOrders hooks)

```typescript
// Source: convex/lib/createMutationHook.ts (existing pattern)
// Uses useSessionMutation internally — compatible with protectedMutation backend

export const useCreateIngredient = createMutationHook(
  api.ingredients.mutations.create,
  { successMessage: "Ingredient created", errorMessage: "Failed to create ingredient" }
);
```

### Tailwind dark mode for design system components

```tsx
// Pattern: replace hardcoded Tailwind colors with semantic design-system tokens
// All semantic tokens auto-adapt via .dark CSS variable overrides in index.css

// bg-white → bg-card (or bg-background)
// text-gray-600 → text-muted-foreground
// border-gray-200 → border-border
// bg-gray-100 → bg-muted
// text-gray-900 → text-foreground
```

### WhatsApp dark mode (external UI simulation)

```tsx
// WhatsApp dark mode color reference:
// Chat background: #0d1117 or #111b21
// Sent message bubble: #005c4b
// Received message bubble: #1f2c34
// Timestamp text: #8696a0
// Double-tick blue: #53bdeb (unchanged)

<div className="bg-[#ECE5DD] dark:bg-[#0d1117] rounded-lg p-4">
  <div className="bg-[#DCF8C6] dark:bg-[#005c4b] rounded-lg p-3 shadow-sm">
    <pre className="text-sm text-foreground/80 dark:text-[#e9edef] whitespace-pre-wrap font-sans">
      {previewContent}
    </pre>
    <div className="flex items-center justify-end gap-1 mt-2">
      <span className="text-[10px] text-[#667781] dark:text-[#8696a0]">
        {timestamp}
      </span>
      <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
    </div>
  </div>
  <div className="text-center mt-3">
    <span className="text-xs text-muted-foreground bg-white/50 dark:bg-white/10 px-2 py-1 rounded">
      Using sample data
    </span>
  </div>
</div>
```

---

## Current State Summary (Audit Results)

### Stream 1: Dark Mode — Files needing fixes

**K3Mart components (0 hardcoded color instances):**
All 17 K3Mart component files have zero hardcoded bg-white/bg-gray/text-gray classes. The K3Mart components that DO have `dark:` variants (PlannerGridHeader: 13, EditablePlannerCell: 4, OutletStockDetail: 2, OutletSettingsModal: 1, OutletPlannerRow: 1) already appear well-handled.

**Non-K3Mart files with hardcoded colors (full audit scope):**
- `src/components/inventory/TransferStockDialog.tsx` — 8 instances
- `src/components/inventory/StatCard.tsx` — 8 instances
- `src/components/menuProducts/POSPreviewPanel.tsx` — 8 instances
- `src/components/orders/VoucherInput.tsx` — 6 instances
- `src/pages/OrderManager.tsx` — 4 instances
- `src/pages/OrderCreate.tsx` — 3 instances
- `src/components/feedback/FeedbackCaptureMode.tsx` — 2 instances
- `src/components/kitchen/ShiftSuccessScreen.tsx` — 2 instances
- `src/pages/IngredientsManager.tsx` — 2 instances
- `src/components/orders/ChannelButtons.tsx` — 2 instances
- `src/components/whatsappTemplates/TemplateCard.tsx` — 1 instance
- `src/components/whatsappTemplates/TemplateEditor.tsx` — 1 instance (plus the preview bubble hardcodes)
- `src/components/restock/RestockTargetRow.tsx` — 1 instance
- `src/components/orders/KanbanBoard.tsx` — 1 instance
- `src/components/orders/AuditTrail.tsx` — 1 instance
- `src/components/kitchen/KitchenOrderCard.tsx` — 1 instance
- `src/components/kitchen/K3MartSyntheticCard.tsx` — 1 instance
- `src/components/gofoodDepot/DepotMappingSection.tsx` — 1 instance

**Total:** 18 files. The WhatsApp preview also needs the special external-UI treatment.

### Stream 2: Hook Rename — Counts

| File | Hooks with useConvex | Total hooks | Needs rename |
|------|---------------------|-------------|--------------|
| useComponentTypes.ts | 10 | 10 | Yes (all) |
| useCustomers.ts | 7 | 7 | Yes (all) |
| useExternalData.ts | 24 | 24 | Yes (all) |
| useFeedback.ts | 12 | 12 | Yes (all) |
| useIngredients.ts | 6 | 8 | Yes (partial) |
| useInventory.ts | 13 | 13 | Yes (all) |
| useK3MartCockpit.ts | 22 | 22 | Yes (all) |
| useKitchenStats.ts | 8 | 8 | Yes (all) |
| useMenuProductComponents.ts | 2 | 2 | Yes (all) |
| useMenuProducts.ts | 16 | 16 | Yes (all) |
| useOrders.ts | 24 | 27 | Yes (partial) |
| useSalesAnalytics.ts | 3 | 3 | Yes (all) |
| useStorageLocations.ts | 6 | 6 | Yes (all) |
| useWhatsAppTemplates.ts | 5 | 5 | Yes (all) |
| useProductionUnitTypes.ts | 3 | 3 | Yes (all) |
| useVouchers.ts | 0 | 7 | No — already clean |
| useGoFoodDepot.ts | 0 | ~12 | No — already clean |
| useProductInventory.ts | 0 | ~6 | No — already clean |
| useKitchenProduction.ts | 0 | 1 | No — already clean |
| useKitchenTargets.ts | 0 | 1 | No — already clean |
| useDispatchPlanner.ts | 0 | ~14 | No — already clean |
| useProductionRecipes.ts | 0 | ~9 | No — already clean |
| **Total to rename** | **161** | | |

### Stream 3: protectedMutation — Backend migration scope

**Must migrate:**
- `convex/orders/mutations/orderCrud.ts` — 12 mutations
- `convex/orders/mutations/statusUpdates.ts` — 8 mutations
- `convex/orders/mutations/itemCrud.ts` — 4 mutations
- `convex/orders/mutations/packaging.ts` — 6 mutations
- `convex/orders/mutations/inventoryIntegration.ts` — 4 mutations
- `convex/productionRecipes/mutations.ts` — 6 mutations

**Needs planner decision:**
- `convex/orders/mutations/kitchen.ts` — file comment says intentionally bare (internal ops)
- `convex/orders/mutations/migrations.ts` — seed/migration ops
- `convex/vouchers/mutations.ts` — currently uses bare `mutation()` + inline `requireRole()` (simpler entity but not in the declared scope of "orders/recipes/products")

**Frontend hooks requiring update when backend migrates:**
- `src/hooks/convex/useOrders.ts` — currently uses `useMutation`
- `src/hooks/convex/useKitchenStats.ts` — currently uses `useMutation`
- `src/hooks/convex/useProductionRecipes.ts` — check current pattern

### Stream 4: Query factory — Candidate files

**Likely good fit (simple list/get patterns):**
- `convex/menuProducts/queries.ts` — inspect
- `convex/whatsappTemplates/queries.ts` — inspect
- `convex/kitchenConfig/queries.ts` — inspect

**Likely poor fit (complex joins, specific indexes):**
- `convex/orders/queries.ts` (1,254+ lines) — skip
- `convex/productionRecipes/queries.ts` — skip (complex hierarchy traversal)
- `convex/inventory/queries.ts` — skip (complex FIFO/batch logic)

---

## Open Questions

1. **Empty roles array behavior**
   - What we know: CONTEXT.md says "pass empty roles array for public mutations." Current `protectedMutation` always rejects with `[]`.
   - What's unclear: Does "public" mean "any authenticated user" (roles: all) or "no auth required" (stay as bare `mutation()`)?
   - Recommendation: Planner should interpret "public mutations" as mutations that stay as bare `mutation()` (i.e., `createDraft`, `updateDraft`, seed operations). `protectedMutation` should only be used with actual role arrays. The `publicMutation` re-export already exists in `convex/lib/functions.ts` for this purpose.

2. **kitchen.ts order mutations intentionally excluded**
   - What we know: File comment says these are "not user-facing CRUD operations. They intentionally remain as bare mutation() without protectedMutation wrapper."
   - What's unclear: Does the CONTEXT.md scope override the file's own comment?
   - Recommendation: Planner should check with user or default to CONTEXT.md (migrate all).

3. **Hook rename and the test file**
   - What we know: `src/hooks/__tests__/useConvexHooks.test.tsx` imports `useConvexOrders` and will break if renamed.
   - Recommendation: Update test file in the same batch as `useOrders.ts`.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `src/hooks/convex/` — all 24 hook files inspected for useConvex prefix presence
- `convex/lib/functions.ts` — protectedMutation/publicMutation/SessionIdArg implementation
- `convex/lib/queryHelpers.ts` — listAll/getById/textSearch implementations
- `src/index.css` — Tailwind v4 dark mode setup, all CSS variable definitions
- `convex/ingredients/mutations.ts` — reference pattern for protectedMutation
- `convex/orders/mutations/orderCrud.ts` — current bare mutation() pattern
- `src/hooks/convex/createMutationHook.ts` — useSessionMutation wrapper factory
- `src/hooks/convex/index.ts` — barrel export (complete list of all exported hook names)
- `src/components/whatsappTemplates/TemplateEditor.tsx` — WhatsApp preview with hardcoded colors

### Secondary (MEDIUM confidence)
- WhatsApp dark mode colors sourced from community documentation; exact hex values should be verified against current WhatsApp UI if precision matters

---

## Metadata

**Confidence breakdown:**
- Stream 1 (dark mode): HIGH — exact files and count verified via grep
- Stream 2 (hook rename): HIGH — all hook files inspected, exact counts confirmed
- Stream 3 (protectedMutation): HIGH with one open question (empty roles behavior)
- Stream 4 (query factory): HIGH — existing users confirmed, candidates identified by pattern

**Research date:** 2026-02-23
**Valid until:** 2026-03-25 (stable codebase, no external dependencies changing)

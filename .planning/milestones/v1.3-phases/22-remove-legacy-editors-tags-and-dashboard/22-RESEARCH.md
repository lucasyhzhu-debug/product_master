# Phase 22: Remove Legacy Editors, Tags & Dashboard - Research

**Researched:** 2026-02-22
**Domain:** Dead code removal, schema table dropping, hub page replacement, rebranding
**Confidence:** HIGH — all findings based on direct codebase inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Landing Page Replacement:**
- Replace Dashboard with a role-filtered hub page at `/`
- Branded header at top: "Frollie Pro" with user greeting
- Static navigation cards (no live data snippets) organized by functional area (not workflow)
- Each section is a card with icon (Lucide), area name, description, and sub-section buttons for pages within that area
- Cards completely hidden for roles without access (not greyed out)
- Simplified grouping — Claude proposes logical groupings based on remaining pages, doesn't need to mirror sidebar exactly
- English language throughout
- Fresh visual look — polished, modern feel within existing design system (use `frontend-design` skill for full design)
- The frontend-designer skill should handle the entire hub page design

**Data Preservation:**
- Check if tables are empty in production before dropping
- If data exists: targeted dumps of just the 11 tables being dropped (not full snapshot)
- Export stored in `docs/legacy-export/` and committed to repo
- If tables are empty, proceed directly with dropping

**Navigation Cleanup:**
- Reorganize remaining sidebar navigation (not just delete dead links)
- Claude proposes clean sidebar groupings during planning
- Rename "Dashboard" sidebar link to "Home" pointing to the new hub page
- Rebrand to "Frollie Pro" — update all instances of "Frollie Recipe Master" throughout the codebase

**Removal Boundaries:**
- costInvalidation.ts: remove entirely if possible (inline menu product invalidation at call sites); otherwise strip to minimal
- Ingredients and Materials pages: check usage first during planning — remove if no active system references them, keep if still used by menu products/BOM
- PackagingView page: check first during planning — remove if legacy, keep if still serves kitchen staff
- Dead code detection: aggressive sweep — remove ALL orphaned code (unused hooks, helpers, types, components, not just what's directly tied to the 11 tables)

### Claude's Discretion
- Exact sidebar grouping/ordering for remaining pages
- Hub page card layout, spacing, responsive behavior
- How to handle edge cases in costInvalidation inlining
- Removal order/sequencing across waves

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

---

## Summary

Phase 22 is a substantial dead code removal and rebranding pass. The legacy recipe/packaging/product editor system (11 schema tables, 3 editor pages, the original Dashboard page, and the tags system) is fully abandoned — these were part of the original "recipe master" concept before the business pivoted to using the simpler BOM/menu-product system for cost tracking. The 11 tables are almost certainly empty in production given the BOM migration happened in earlier phases.

The work splits into three tracks: (1) backend cleanup — drop 11 schema tables, delete/simplify costInvalidation.ts, remove 3 backend modules; (2) frontend cleanup — delete 4+ page files, orphaned hooks, components, and types; (3) replacement + rebranding — build the "Frollie Pro" hub page at `/`, update the Header/nav, and rename the brand everywhere.

**Primary recommendation:** Execute in wave order: data check → schema drop → backend cleanup → frontend cleanup → hub page build → nav + branding. Each wave can be verified independently. The costInvalidation.ts analysis below shows that only one function (`invalidateMenuProductCosts`) survives; it should be inlined into its two call sites in `componentTypes/mutations.ts` and `productionRecipes/mutations.ts`, then the file deleted.

---

## Codebase Findings

### 11 Tables to Drop — Confirmed in schema.ts

| Table | Defined In | Interrelated With |
|-------|-----------|-------------------|
| `recipes` | schema.ts:130 | tagIds → tags |
| `recipeVersions` | schema.ts:137 | recipes, recipeComponents |
| `recipeComponents` | schema.ts:158 | recipeVersions, componentIngredients |
| `componentIngredients` | schema.ts:169 | recipeComponents, ingredients |
| `packagingRecipes` | schema.ts:187 | tagIds → tags |
| `packagingVersions` | schema.ts:194 | packagingRecipes, packagingComponents |
| `packagingComponents` | schema.ts:209 | packagingVersions, packagingComponentMaterials |
| `packagingComponentMaterials` | schema.ts:218 | packagingComponents, packagingMaterials |
| `products` | schema.ts:236 | tagIds → tags |
| `productVersions` | schema.ts:243 | products, recipeVersions, packagingVersions |
| `tags` | schema.ts:49 | recipes, packagingRecipes, products (tagIds arrays) |

**Convex table drop mechanics:** Remove table definitions from `convex/schema.ts`. Convex will not auto-delete existing data; the tables become inaccessible to queries/mutations but data persists until manually deleted via `npx convex data delete` or the Convex dashboard. The schema removal itself is safe — no migration needed if tables are empty. The data check decision gate determines whether to export first.

**Confidence:** HIGH (direct schema.ts inspection)

### Backend Modules to Remove

These directories/files exist solely for the 11 tables:

| Path | Purpose | Action |
|------|---------|--------|
| `convex/recipes/` | Recipe CRUD (queries.ts, mutations.ts) | Delete entire directory |
| `convex/packaging/` | Packaging CRUD (queries.ts, mutations.ts) | Delete entire directory |
| `convex/products/` | Product CRUD (queries.ts, mutations.ts) | Delete entire directory |
| `convex/tags/` | Tags CRUD (queries.ts, mutations.ts) | Delete entire directory |
| `convex/dashboard/queries.ts` | Legacy dashboard getSummary (full table scan of orders) | Delete entire directory |

Note: `convex/dashboard/queries.ts` contains `getSummary` which calls `ctx.db.query("orders").collect()` — a full unbounded scan. The new hub page has no live data snippets, so this query is not needed.

### costInvalidation.ts Analysis — CRITICAL

File: `convex/lib/costInvalidation.ts` exports 4 functions:

| Function | Called From | Survive? |
|----------|-------------|---------|
| `invalidateRecipeCosts` | `ingredients/mutations.ts:101` | NO — references `componentIngredients` table (being dropped) |
| `invalidatePackagingCosts` | `materials/mutations.ts:100` | NO — references `packagingComponentMaterials` table (being dropped) |
| `invalidateMenuProductCosts` | `componentTypes/mutations.ts:203` and `productionRecipes/mutations.ts:363` | YES — references only `menuProductComponents` and `menuProducts` (both kept) |
| `invalidateProductionComponentCosts` | `ingredients/mutations.ts:106` | YES — references `productionComponentIngredients`, `componentTypes`, `productionComponentLinks` (all kept) |

**Action:** The file cannot be deleted in full. Two functions survive.

**Options:**
1. Strip to 2 surviving functions, keep the file — simplest, minimal change
2. Inline `invalidateMenuProductCosts` into its 2 call sites, move `invalidateProductionComponentCosts` inline into `ingredients/mutations.ts`, then delete the file — user's preference ("remove entirely if possible")

**Recommendation (Claude's discretion):** Inline both surviving functions. `invalidateMenuProductCosts` is 40 lines and is called from exactly 2 places; it can be extracted into a shared internal mutation defined directly in `convex/lib/menuProductCostSync.ts` (new name) or inlined as a helper in each caller. Since both callers already import from `internal`, the cleanest approach is a renamed file (`convex/lib/productCostSync.ts`) containing only the 2 surviving functions with the recipe/packaging functions removed. This avoids the complexity of true inlining while keeping the intent of "aggressive cleanup." The file should be renamed to remove the "Invalidation" name since only the menu product and production component cost sync survive.

**Caller changes after cleanup:**
- `ingredients/mutations.ts`: Remove import of `invalidateRecipeCosts` (line 101 call). Keep `invalidateProductionComponentCosts`.
- `materials/mutations.ts`: Remove import and call of `invalidatePackagingCosts` (line 100). Materials page may be removed anyway.
- `componentTypes/mutations.ts:203`: Keep `invalidateMenuProductCosts` call (update import path if file renamed).
- `productionRecipes/mutations.ts:363`: Keep `invalidateMenuProductCosts` call.

### Frontend Pages — Deletion Status

| Page File | Route | Can Delete? | Reason |
|-----------|-------|-------------|--------|
| `src/pages/Dashboard.tsx` | `/` | YES | Replaced by new hub page |
| `src/pages/RecipeEditor.tsx` | `/recipes/:id` | YES | Legacy recipe system removed |
| `src/pages/PackagingEditor.tsx` | `/packaging/:id` | YES | Legacy packaging system removed |
| `src/pages/ProductEditor.tsx` | `/products/:id` | YES | Legacy product system removed |
| `src/pages/TagsManager.tsx` | `/tags` | YES | Tags system removed |
| `src/pages/IngredientsManager.tsx` | `/ingredients` | CHECK | Referenced by productionRecipes (ingredients table kept) |
| `src/pages/MaterialsManager.tsx` | `/materials` | CHECK | packagingMaterials table kept for inventory purposes |
| `src/pages/PackagingView.tsx` | `/packaging` | CHECK | Uses `getPackagingOrders` from orders/queries.ts (active system) |

**Ingredients/Materials decision:** The `ingredients` and `packagingMaterials` tables are NOT in the 11 dropped tables. They remain in schema. Ingredients are used by `productionComponentIngredients` (the BOM ingredient link system). The IngredientsManager page is the only way for managers to add/edit ingredients (which feed into production component COGS). The MaterialsManager page manages `packagingMaterials` which are used by... `packagingComponentMaterials` (which IS being dropped). If `packagingComponentMaterials` is dropped, there is no active foreign key reference to `packagingMaterials` remaining.

**Verdict:**
- **IngredientsManager:** KEEP — ingredients are still referenced by `productionComponentIngredients` table (COGS calculation for production components). The page is essential for managing ingredient cost inputs.
- **MaterialsManager:** REMOVE — `packagingMaterials` table has no remaining active references once `packagingComponentMaterials` is dropped. The only cost invalidation was `invalidatePackagingCosts` (being removed). No other active backend query joins to `packagingMaterials`.
- **PackagingView:** KEEP — `getPackagingOrders` in `convex/orders/queries.ts` is an active, order-based query that helps kitchen/packaging staff see BeingPrepared orders. It does not use the legacy packaging tables. The route `/packaging` currently has `canAccessPackaging` permission, accessible to all roles. This is operational, not legacy.

**Note on `packagingMaterials` schema table:** Even after removing MaterialsManager, the `packagingMaterials` table remains in schema (it is not one of the 11 being dropped). It should be left as-is unless a separate cleanup phase handles it. The materials page removal is sufficient for this phase.

### Frontend Hooks to Remove

Hooks in `src/hooks/convex/index.ts` that reference only the legacy tables:

| Hook File | Exports | Remove? |
|-----------|---------|--------|
| `useRecipes.ts` | `useConvexRecipes`, `useConvexRecipe`, etc. | YES — entire file |
| `usePackaging.ts` | `useConvexPackagingList`, `useConvexPackaging`, etc. | YES — entire file |
| `useProducts.ts` | `useConvexProducts`, `useConvexProduct`, etc. | YES — entire file |
| `useTags.ts` | `useConvexTags`, `useConvexTag`, etc. | YES — entire file |
| `useDashboard.ts` | `useConvexDashboardSummary`, `useConvexOrderStats`, etc. | PARTIAL — `useConvexOrderStats` only used in Dashboard.tsx (being deleted); `useConvexDashboardSummary` check other uses |
| `useMaterials.ts` | `useConvexMaterials`, etc. | YES — if MaterialsManager removed |

**Dashboard hooks note:** `useConvexOrderStats` is imported in Dashboard.tsx only. `useConvexDashboardSummary` and `useConvexRecentOrders` are also only in Dashboard.tsx. The entire `useDashboard.ts` hook file can be deleted.

### Components to Remove

| Path | Remove? | Reason |
|------|---------|--------|
| `src/components/dashboard/` (entire directory) | YES — all 5 files | Only imported from Dashboard.tsx |
| `src/components/recipes/RecipeCard.tsx` | YES | Only used in Dashboard.tsx |
| `src/components/packaging/PackagingCard.tsx` | PARTIAL | Used in Dashboard.tsx; check other uses |
| `src/components/products/ProductCard.tsx` | PARTIAL | Used in Dashboard.tsx; check other uses |
| `src/components/ingredients/IngredientCard.tsx` | YES | Only used in Dashboard.tsx |
| `src/components/materials/MaterialCard.tsx` | YES | Only used in Dashboard.tsx |
| `src/components/shared/TagFilterBar.tsx` | YES | Only used in Dashboard.tsx |
| `src/components/onboarding/` | CHECK | `useOnboardingTour` used in Dashboard.tsx |

**RecipeCard/PackagingCard/ProductCard:** These cards were used in the Dashboard carousel system. Need to verify no other page references them. From grep results, RecipeCard.tsx imports tags which are being dropped. ProductCard.tsx renders tags. Both are legacy. PackagingCard.tsx similarly. These can almost certainly be deleted with the editor pages.

### App.tsx Route Changes

Routes to remove from `src/App.tsx`:
- `/recipes/:id` → RecipeEditor
- `/packaging/:id` → PackagingEditor
- `/products/:id` → ProductEditor
- `/tags` → TagsManager
- `/materials` → MaterialsManager (if confirmed for removal)
- The `<Route index>` RoleBasedRedirect — replace with the hub page component directly

Routes to add:
- `<Route index element={<HubPage />} />` — but this needs the hub page component
- Note: Kitchen role redirects to `/kitchen`, order_staff to `/orders` — but the decision says the hub is role-filtered (all roles see it, cards hidden for no-access roles). Need to decide: should kitchen and order_staff also land on the hub, or keep their role-specific redirects?

**Recommendation:** Keep the kitchen redirect to `/kitchen` (kitchen staff have no navigation context; direct landing is better). Keep order_staff redirect to `/orders`. Manager/Admin land on the hub page. This preserves the role-appropriate UX.

### Navigation Changes

**Header.tsx brand text:**
- Line 308: `"Frollie Recipe Master"` → `"Frollie Pro"`
- Line 306: `UtensilsCrossed` icon — can keep as-is or switch to something more "pro" (Claude's discretion)

**Missing from current header nav:** No "Home" link exists (the `RoleBasedRedirect` handles `/` currently). After adding the hub page, the nav needs a "Home" item (house icon) pointing to `/` for manager/admin roles.

**Nav items to remove from Header.tsx:**
- No explicit recipe/packaging/product/tags nav items exist in the current header — they were accessed only from Dashboard cards. The header already has no direct links to these legacy pages.
- The `configItems` array in Header.tsx has no recipe/tag items (they were accessed via Dashboard).
- In `MobileBottomNav.tsx`, line 54: `{ path: '/tags', icon: Tags, label: 'Tags', permission: 'canAccessRecipes' }` — remove this item.

**Nav items to add:**
- A "Home" link (for manager/admin) in `mainNavItems` array pointing to `/`

**Sidebar grouping proposal** (Claude's discretion — for planning to include):
```
Main:
  - Home          /           (manager, admin only)
  - Orders        /orders     (order_staff, manager, admin)
  - Kitchen       /kitchen    (all roles)
  - Inventory     /inventory  (manager, admin)
  - Restock       /restock-planner (manager, admin)

Depots dropdown:
  - GoFood Depot  /gofood-depot

Config dropdown:
  - Production Components  /components/production
  - Locations              /inventory/locations
  - WhatsApp               /whatsapp-templates
  - Customers              /customers
  - Ingredients            /ingredients    (manager, admin — kept)

Admin dropdown:
  - Menu Products  /menu-products
  - Vouchers       /vouchers
  - Users          /users
```

Remove from nav entirely: `/tags`, `/materials`, `/packaging` (PackagingView still exists but is kitchen-only and accessed directly from Kitchen page context).

**Wait — PackagingView route check:** The current nav has no sidebar link to `/packaging`. It's accessed from Kitchen view directly. The route exists but is not in any nav array. This confirms PackagingView can stay without navigation changes.

### Branding Locations to Update

All occurrences of "Frollie Recipe Master" → "Frollie Pro":

| File | Location | Content |
|------|----------|---------|
| `src/components/layout/Header.tsx:308` | Desktop brand name | `"Frollie Recipe Master"` |
| `src/components/layout/Footer.tsx:21` | Footer brand | `"Frollie Recipe Master"` |
| `src/pages/Login.tsx:79` | Login page heading | `"Frollie Recipe Master"` |
| `src/pages/Login.tsx:152` | Login footer | `"Frollie Recipe Master"` |
| `src/components/shared/FormBuilder.example.tsx:5` | Comment — leave or update | Low priority |
| `.claude/agents/*.md` files | Agent descriptions — do NOT update | Out of scope (not shipped code) |

**Note:** `index.html` and other non-src files do not contain the brand name (verified via bash search). The title tag in `index.html` should also be checked — if it says "Frollie Recipe Master" it needs updating.

### Hub Page Design Parameters

**Role visibility matrix:**

| Card/Area | kitchen | order_staff | manager | admin |
|-----------|---------|-------------|---------|-------|
| Operations (Orders, Kitchen) | Kitchen only | Orders, Kitchen | All | All |
| Inventory & Supply | Hidden | Hidden | All | All |
| Depot Management | Hidden | Hidden | All | All |
| Admin | Hidden | Hidden | Hidden | All |

**Proposed functional area groupings** (Claude's discretion):

1. **Operations** — Orders, Kitchen (BeingPrepared orders view)
2. **Inventory & Supply** — Inventory, Locations, Restock Planner, Ingredients
3. **Sales & Distribution** — GoFood Depot, (Sales Analytics when re-enabled), (K3Mart Cockpit when re-enabled)
4. **Configuration** — Menu Products, Production Components, WhatsApp Templates, Customers, Vouchers
5. **Admin** — Users

Each card has: Lucide icon, area name, 1-line description, buttons for each sub-page in that area. Cards hidden (not rendered) when role has no access to any page in that area.

**frontend-design skill:** Must be invoked before implementation of hub page. The REQUIREMENTS.md confirms: "All UI phases use the `/frontend-design` skill for holistic UI definition before implementation waves begin."

### Dead Code Sweep — Additional Orphaned Items

Beyond the obvious deletions:

1. **`src/components/shared/TagFilterBar.tsx`** — only used in Dashboard.tsx (confirmed via grep)
2. **`src/components/shared/Carousel.tsx`** (if it exists) — Dashboard used `<Carousel>` from shared. Check if used elsewhere.
3. **`src/components/onboarding/`** — `useOnboardingTour` called in Dashboard.tsx; check if used elsewhere
4. **`convex/dashboard/queries.ts` `getSummary`** — called only from `useDashboard.ts` hook
5. **Permission keys `canAccessRecipes`, `canAccessProducts`, `canAccessIngredients`, `canAccessMaterials`** in `src/lib/types.ts` — once all pages using them are removed, these can be deleted from the ROLE_PERMISSIONS object. `canAccessIngredients` stays (IngredientsManager kept). `canAccessRecipes` and `canAccessProducts` go away. `canAccessMaterials` goes away.
6. **`PackagingComponentsManager.tsx`** — listed in pages/ but NOT in App.tsx routes and NOT in pages/index.ts. Already dead; confirm deletion.

```
D:\Claude\Product Manager\product_master\src\pages\PackagingComponentsManager.tsx
```

This file exists in the filesystem but has no route and no export in index.ts. Safe to delete.

---

## Architecture Patterns

### Pattern 1: Convex Schema Table Removal
**What:** Remove table definitions from `convex/schema.ts`. Convex does not auto-drop documents when table is removed from schema — documents become unreachable but persist in storage. Clean removal requires data export first (if populated), then schema edit.

**Correct sequence:**
1. Check production data via Convex dashboard or `npx convex data` command
2. If populated: export data (targeted, not full snapshot)
3. Remove table from `defineSchema({...})` in `convex/schema.ts`
4. Remove all queries/mutations that reference the table
5. `npx convex deploy` — Convex accepts the schema change

**Warning:** Convex will error if any query/mutation still imports from the removed tables. All references must be cleaned before deploy.

**Confidence:** HIGH (Convex docs, prior phases in this codebase)

### Pattern 2: Internal Mutation Inlining
**What:** When an `internalMutation` is called via `ctx.scheduler.runAfter(0, internal.lib.X.fn, args)`, inlining means defining that logic in a helper function within the calling file, or as a new `internalMutation` in a different module.

**Constraint:** Convex does not support direct function calls across module boundaries in mutations (no `import { fn } from "../lib/X"` and calling it directly — only via `ctx.scheduler` or `ctx.runMutation`). So "inlining" means either:
- Moving the `internalMutation` export to the same file (or a file that only has surviving functions)
- OR calling it via `internal.newPath.fn` after moving

**Recommended approach:** Rename `costInvalidation.ts` to `productCostSync.ts`, delete the 2 recipe/packaging functions, keep the 2 menu product + production component functions. Update the `internal.lib.*` references in callers accordingly. The `_generated/api.d.ts` regenerates automatically on `npx convex dev/deploy`.

### Pattern 3: Hub Page (No Data Queries)
**What:** The new hub page at `/` is purely static navigation — no `useQuery` calls. This means:
- No loading states needed
- No Convex bandwidth consumed
- Fast render — pure React component using `useAuth` for role filtering

**Implementation:** Single React component using shadcn/ui `Card` primitives. Role check via `hasPermission()` or `user.role` from `useAuth()`. Links use React Router `<Link>` components.

### Anti-Patterns to Avoid

- **Partial table removal:** Removing some of the 11 tables but not all creates dangling foreign key references (e.g., leaving `tags` but removing `recipes`). Remove all 11 atomically.
- **Leaving hook exports in index.ts:** If `useRecipes` hooks are deleted but still exported from `index.ts`, TypeScript will error. Clean the barrel export file.
- **Forgetting the `_generated/api.d.ts`:** This regenerates automatically — but never edit it manually. After schema/function changes, run `npx convex dev` locally to regenerate before committing.
- **Removing `canAccessIngredients` permission:** IngredientsManager is kept; this permission stays. Do not remove it from `ROLE_PERMISSIONS` in `src/lib/types.ts`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hub page cards | Custom card component | shadcn/ui `Card` primitives | Already in project |
| Hub page layout | CSS grid from scratch | Tailwind CSS grid classes | Consistent with existing design system |
| Data export for legacy tables | Custom export UI | `npx convex data export` or dashboard CSV | Built-in Convex tooling |
| Role-filtered hub | Custom auth system | Existing `hasPermission()` + `useAuth()` | Already works, tested |

---

## Common Pitfalls

### Pitfall 1: Missed Cross-References in Hooks Index
**What goes wrong:** Delete a hook file but leave its exports in `src/hooks/convex/index.ts` — TypeScript fails on barrel export.
**How to avoid:** After deleting each hook file, immediately update `index.ts` to remove its exports.

### Pitfall 2: Dashboard Component Used Elsewhere
**What goes wrong:** Assume `src/components/dashboard/` is only used in Dashboard.tsx, delete it, then discover `LowStockAlert` or `SyncHealthBanner` is imported somewhere else.
**How to avoid:** Run grep for each component before deleting. `LowStockAlert` uses `useConvexLowStockAlerts` which points to real inventory data — verify no other page imports it.

### Pitfall 3: PackagingView Confusion
**What goes wrong:** Confuse PackagingView (operational order-packaging view, `/packaging` route) with PackagingEditor (legacy recipe editor, `/packaging/:id` route). They are separate pages.
**PackagingView:** KEEP — uses `orders.queries.getPackagingOrders`, serves kitchen staff
**PackagingEditor:** DELETE — uses `packagingVersions`, `packagingComponents`, `packagingComponentMaterials`

### Pitfall 4: Tags Removal Cascade
**What goes wrong:** Remove `tags` table from schema but forget that `recipes`, `packagingRecipes`, and `products` tables still have `tagIds: v.array(v.id("tags"))` in their schema definitions. Since ALL these tables are being removed together, this is a non-issue — but the removal must be atomic (all 11 tables at once).
**How to avoid:** Remove all 11 table definitions in a single schema.ts edit.

### Pitfall 5: costInvalidation Scheduler References
**What goes wrong:** Delete `convex/lib/costInvalidation.ts` before updating the callers — Convex deploy fails because `internal.lib.costInvalidation.*` references resolve to nothing.
**How to avoid:** Update callers before removing/renaming the file.

### Pitfall 6: Onboarding Tour
**What goes wrong:** `src/components/onboarding/` contains `useOnboardingTour` which is called in Dashboard.tsx with `isNewUser` logic tied to `products.length === 0 && recipes.length === 0`. Once Dashboard.tsx is deleted, this is orphaned. But the onboarding component itself may have other imports.
**How to avoid:** Verify onboarding components are not used outside Dashboard.tsx before deleting.

### Pitfall 7: `src/pages/PackagingComponentsManager.tsx`
**What goes wrong:** This file exists in the filesystem but is not exported from `pages/index.ts` and not routed in `App.tsx`. It's already dead but could cause confusion.
**How to avoid:** Delete it as part of the dead code sweep without worrying about routing changes.

---

## Implementation Sequence Recommendation

```
Wave 1: Data Check [SEQUENTIAL]
  - Query production Convex for row counts in all 11 tables
  - If any non-empty: dump data to docs/legacy-export/

Wave 2: Backend Cleanup [PARALLEL]
  Agent A: Schema table removal (11 tables from schema.ts)
  Agent B: Backend module deletion (recipes/, packaging/, products/, tags/, dashboard/)
  Agent B: costInvalidation.ts → strip to 2 surviving functions (or rename to productCostSync.ts)
  Agent B: Update callers (ingredients/mutations.ts, materials/mutations.ts)

Wave 3: Frontend Cleanup [PARALLEL after Wave 2]
  Agent C: Delete page files (Dashboard, RecipeEditor, PackagingEditor, ProductEditor, TagsManager, MaterialsManager)
  Agent C: Delete hook files (useRecipes, usePackaging, useProducts, useTags, useDashboard, useMaterials)
  Agent C: Delete component directories (dashboard/, recipes/RecipeCard, products/ProductCard, materials/MaterialCard, ingredients/IngredientCard, shared/TagFilterBar)
  Agent C: Clean pages/index.ts and hooks/convex/index.ts barrel exports
  Agent D: Remove routes from App.tsx
  Agent D: Clean permissions (canAccessRecipes, canAccessProducts, canAccessMaterials from ROLE_PERMISSIONS)

Wave 4: Hub Page Build [SEQUENTIAL after Wave 3 — frontend-design skill first]
  - Invoke /frontend-design skill for hub page design spec
  - Build HubPage component
  - Wire route at / for manager/admin (keep kitchen→/kitchen, order_staff→/orders redirects)

Wave 5: Navigation + Branding [PARALLEL with Wave 4]
  Agent E: Update Header.tsx (brand name, add Home link, remove Tags from MobileBottomNav)
  Agent E: Update Footer.tsx (brand name)
  Agent E: Update Login.tsx (brand name)
  Agent E: Check index.html title tag

Wave 6: Verification [SEQUENTIAL]
  - npm run type-check
  - npm run build
  - npm run lint
```

---

## Open Questions

1. **Should kitchen/order_staff see the hub page?**
   - Current: RoleBasedRedirect sends kitchen → /kitchen, order_staff → /orders
   - Decision made: Keep these redirects. Hub page is for manager/admin.
   - **Resolved:** Keep role-specific redirects for kitchen and order_staff. Hub page route at `/` is only reached by manager/admin (or if you navigate there directly — in which case the hub shows only permitted cards).

2. **`packagingMaterials` table — keep or drop?**
   - Not one of the 11 tables to drop per the phase spec
   - MaterialsManager page being removed, but table stays in schema
   - No active foreign key reference survives (packagingComponentMaterials is dropped)
   - **Resolved:** Leave `packagingMaterials` table in schema for this phase. It's unused data but harmless. Flag for Phase 24 (the separate legacy cleanup phase per STATE.md deferred items).

3. **Sales Analytics and K3Mart Cockpit — commented out due to bandwidth conservation**
   - These routes are currently commented out in App.tsx and their nav items commented in Header.tsx
   - The hub page should include these cards (greyed out or hidden?) since they will return after March 1st
   - **Recommendation:** Include in hub page but only show to manager/admin. Since the bandwidth conservation is temporary, treat as active pages that happen to be disabled temporarily. The hub cards can link to these pages — they'll just 404/redirect until re-enabled. Or better: show the cards but have the links follow whatever the App.tsx routes say.

4. **`RestockPlanner` vs `DispatchPlanner` naming confusion**
   - `pages/index.ts` exports `RestockPlanner` but App.tsx imports `DispatchPlanner`
   - This is already inconsistent in the current codebase (RestockPlanner.tsx file, DispatchPlanner export in index.ts via separate import)
   - **Not a Phase 22 problem** — carry forward as-is.

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `convex/schema.ts`, `convex/lib/costInvalidation.ts`, `src/App.tsx`, `src/components/layout/Header.tsx`, `src/pages/Dashboard.tsx`, `src/hooks/convex/index.ts`
- Grep searches across `convex/` and `src/` for cross-references

### Secondary (MEDIUM confidence)
- Convex schema removal behavior — from project patterns (prior phases used schema changes) and Convex documentation knowledge

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new libraries needed; pure deletion + one new page
- Architecture (what to remove): HIGH — direct codebase inspection
- Architecture (hub page): MEDIUM — design to be determined by frontend-design skill
- costInvalidation analysis: HIGH — all callers and functions verified by grep
- Pitfalls: HIGH — based on real code structure observed

**Research date:** 2026-02-22
**Valid until:** Stable (this is a deletion phase; no external dependencies)

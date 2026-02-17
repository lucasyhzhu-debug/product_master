---
phase: 20-production-ingredient-tracking-and-cogs
verified: 2026-02-17T13:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Open ProductionComponentsManager, click a production component row (e.g., Mid Ball), verify RecipeEditorModal opens with Sub-components and Direct Ingredients sections visible"
    expected: "Modal opens, both sections render, Add buttons present, live COGS preview in footer"
    why_human: "Cannot verify interactive modal trigger programmatically"
  - test: "In the RecipeEditorModal ingredient section, use 'Create new...' in the dropdown, fill form and click 'Create & Add'"
    expected: "Ingredient created, immediately appears in the ingredient list, COGS preview updates"
    why_human: "Inline create flow requires interactive UI verification"
  - test: "Open InventoryManager, filter to Production category, verify both Ball and Ingredient badges appear on respective rows"
    expected: "Ingredient rows (trackInventory=true production components) show green 'Ingredient' badge; ball rows show blue 'Ball' badge"
    why_human: "Requires actual ingredient componentTypes in database to see badge differentiation"
  - test: "In DispatchPlanner, configure plans for the next 7 days, click Simulate in the Materials Check panel"
    expected: "Panel shows both Packaging Materials and Ingredient Materials sections with day-by-day status, Ingredient Resupply Forecast table appears"
    why_human: "Requires dispatch plan data and ingredient stock data in database"
---

# Phase 20: Production Ingredient Tracking & COGS Verification Report

**Phase Goal:** Extend the packaging BOM/inventory pattern to production components — each production component (Big Ball, Mid Ball) gets ingredient recipes with quantities, FIFO inventory tracking for food ingredients, auto-calculated COGS from ingredient costs, and usage simulation for production planning.

**Verified:** 2026-02-17T13:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each production component can have ingredient links (unit + quantity per component) | VERIFIED | `productionComponentIngredients` table in schema; `addIngredient`, `removeIngredient`, `updateIngredientQuantity` mutations in `convex/productionRecipes/mutations.ts` |
| 2 | Production component ingredients use same modal flow as packaging components | VERIFIED | `RecipeEditorModal.tsx` opens on row click with `IngredientSection` + `SubComponentSection` + inline "Create new" via `__create_new__` sentinel |
| 3 | New ingredients appear in Inventory page under Production category with same UI/UX | VERIFIED | `convex/inventory/queries.ts` returns `isIngredient` flag; `ComponentRow.tsx` renders green "Ingredient" badge + negative stock red highlight + `COGSBreakdownTooltip` |
| 4 | Production component COGS auto-calculated from ingredient costs, cached, lazily updated | VERIFIED | `recalculateComponentCogs` internal mutation in `convex/productionRecipes/mutations.ts` traverses hierarchy via `collectLeafIngredients`, caches `cachedCalculatedCogs`, `cogsMissingCount`, updates `unitCostIdr` when complete |
| 5 | Menu product COGS flows unchanged — production component COGS now from ingredients | VERIFIED | `invalidateMenuProductCosts` in `convex/lib/costInvalidation.ts` triggered at end of `recalculateComponentCogs`; uses `unitCostIdr` (updated by recalc) × `quantity` for production cost sum |
| 6 | Receiving ingredient stock works identically to packaging — same FIFO, batch tracking | VERIFIED | `createIngredientComponentType` in `convex/componentTypes/mutations.ts` creates `category=production, trackInventory=true` componentType; uses same `inventoryBatches` + `componentStock` tables as packaging |
| 7 | Dispatch planner usage simulation includes ingredient consumption with resupply dates | VERIFIED | `simulateInventory` in `convex/dispatchPlanner/queries.ts` walks production hierarchy via `collectLeafIngredients`; `MaterialsCheckPanel.tsx` wired into `DispatchPlanner.tsx` showing 7-day packaging + ingredient shortages |
| 8 | Historical orders not impacted — COGS applies forward only | VERIFIED | `recalculateComponentCogs` only patches `componentTypes` table fields; no writes to `orderItems` or `orders`; code comment and implementation both confirm forward-only semantics |

**Score:** 8/8 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/schema.ts` | `productionComponentLinks`, `productionComponentIngredients` tables + 7 COGS fields on componentTypes + `ingredientComponentTypeId` on ingredients | VERIFIED | Lines 888-909 (new tables), lines 864-870 (COGS fields), line 28 (ingredientComponentTypeId) |
| `convex/lib/hierarchyTraversal.ts` | `wouldCreateCycle`, `traverseHierarchy`, `collectLeafIngredients` with DFS + max depth 3 | VERIFIED | Full implementation, 178 lines, uses `new Set(visited)` per branch for correct cycle detection |
| `convex/productionRecipes/mutations.ts` | 6 user mutations + 1 internal `recalculateComponentCogs` | VERIFIED | `addSubComponent`, `removeSubComponent`, `updateSubComponentQuantity`, `addIngredient`, `removeIngredient`, `updateIngredientQuantity`, `recalculateComponentCogs` |
| `convex/productionRecipes/queries.ts` | `getRecipeForComponent`, `calculateCogs`, `getComponentsWithTiers` | VERIFIED | All 3 queries present with proper joins and hierarchy traversal |
| `convex/componentTypes/mutations.ts` | `createIngredientComponentType` + removed production+trackInventory restriction + batchSize/cogsMode in create/update | VERIFIED | `createIngredientComponentType` at line 355; restriction removed with comment at lines 73-76; batchSize/batchSizeUnit/cogsMode args added |
| `convex/lib/costInvalidation.ts` | `invalidateProductionComponentCosts` upward cascade | VERIFIED | Lines 237-307; walks `productionComponentLinks.by_child`, schedules `recalculateComponentCogs` for affected calculated-mode components |
| `convex/ingredients/mutations.ts` | `update` schedules production component cost invalidation | VERIFIED | Line 106: `ctx.scheduler.runAfter(0, internal.lib.costInvalidation.invalidateProductionComponentCosts, ...)` |
| `convex/inventory/queries.ts` | `isIngredient` flag on inventory report, location inventory, low-stock alerts | VERIFIED | Lines 67, 79, 201, 210, 302, 313: `isIngredient = category==="production" && trackInventory` |
| `convex/orders/mutations/inventoryIntegration.ts` | `consumeIngredientMaterialsInternal` with hierarchy traversal + negative stock handling | VERIFIED | Line 513: function exported; hierarchy walk, FIFO deduction, negative adjustment for shortfall |
| `convex/orders/mutations/statusUpdates.ts` | All 3 BeingPrepared transition points call ingredient consumption | VERIFIED | Lines 170-179 (`updateStatus`), 451-464 (`moveForward`), 642-650 (`expediteOrder`) all call `consumeIngredientMaterialsInternal` |
| `convex/dispatchPlanner/queries.ts` | `simulateInventory` extended with ingredient consumption + `ingredientStatus` return | VERIFIED | Lines 700-995; `{ days, ingredientStatus }` response shape; `collectLeafIngredients` used per production component |
| `src/hooks/convex/useProductionRecipes.ts` | 3 query hooks + 6 mutation hooks | VERIFIED | All 9 hooks present: `useProductionRecipe`, `useProductionCogs`, `useProductionComponentsWithTiers` + 6 mutation hooks |
| `src/components/productionRecipes/RecipeEditorModal.tsx` | Main modal with two sections + COGS footer | VERIFIED | `SubComponentSection` + `IngredientSection` + `COGSPreview` wired; batchSize badge in header |
| `src/components/productionRecipes/SubComponentSection.tsx` | Sub-component list with add/edit/remove + create new | VERIFIED | File exists, substantive implementation |
| `src/components/productionRecipes/IngredientSection.tsx` | Ingredient list with add/edit/remove + inline create | VERIFIED | Full implementation with `__create_new__` sentinel, inline form with all ingredient fields, auto-unit selection |
| `src/components/productionRecipes/COGSPreview.tsx` | Live COGS display component | VERIFIED | File exists in `src/components/productionRecipes/` |
| `src/pages/ProductionComponentsManager.tsx` | Row click opens recipe modal; tier sorting; COGS badges | VERIFIED | Line 43: imports `RecipeEditorModal`; line 364: renders it; `useProductionComponentsWithTiers` hook; tier/alpha sort toggle |
| `src/components/shared/COGSBreakdownTooltip.tsx` | Hierarchical COGS tooltip via `useProductionCogs` + `useProductionRecipe` | VERIFIED | Full 144-line implementation with sub-component + ingredient breakdown + leaf ingredients + missing warning |
| `src/components/inventory/ComponentRow.tsx` | Type badges (Ball/Ingredient), negative stock highlight, COGS tooltip | VERIFIED | Lines 105-113: isIngredient/isProductionBall determination; lines 182-187: negative stock red bg; lines 219-264: badges + COGS tooltip |
| `src/components/dispatchPlanner/MaterialsCheckPanel.tsx` | Combined packaging + ingredient panel with resupply forecast | VERIFIED | 356-line implementation with collapsible sections, DayRow, resupply forecast table |
| `src/pages/DispatchPlanner.tsx` | Wires MaterialsCheckPanel + handles `{ days, ingredientStatus }` response shape | VERIFIED | Line 29: imports; line 246: renders; `.days` extraction from response |
| `src/hooks/convex/index.ts` | 10 production recipe hook exports | VERIFIED | Lines 389-399: all 9 hooks exported (3 query + 6 mutation) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `IngredientSection` | `api.productionRecipes.mutations.addIngredient` | `useAddIngredient()` hook | WIRED | Calls mutation with token, componentTypeId, ingredientId, quantity, unit |
| `recalculateComponentCogs` | `componentTypes` table | `ctx.db.patch(componentTypeId, ...)` | WIRED | Patches cachedCalculatedCogs, cogsMissingCount, unitCostIdr |
| `recalculateComponentCogs` | `invalidateMenuProductCosts` | `ctx.scheduler.runAfter` | WIRED | Schedules cost cascade to menu products after COGS update |
| `ingredients/mutations.update` | `invalidateProductionComponentCosts` | `ctx.scheduler.runAfter` | WIRED | Line 106 in mutations.ts |
| `statusUpdates.updateStatus` (BeingPrepared) | `consumeIngredientMaterialsInternal` | direct call at transition | WIRED | 3 transition points all call ingredient consumption |
| `MaterialsCheckPanel` | `simulateInventory` | `useDispatchSimulateInventory(simulateDate)` | WIRED | Passes startDate, extracts `.days` and `.ingredientStatus` |
| `simulateInventory` | `collectLeafIngredients` | `ingredientCache` per production component | WIRED | Caches per component to avoid repeated traversals |
| `ComponentRow` | `COGSBreakdownTooltip` | `hasCalculatedCogs` condition + `useProductionCogs` | WIRED | Lines 108-113, 252-264 |
| `ProductionComponentsManager` | `RecipeEditorModal` | row `onClick` -> `setRecipeComponent(component)` | WIRED | Lines 43-44 (import), 364 (render) |

---

## Requirements Coverage

Phase 20 has no pre-defined REQUIREMENTS.md entries (ROADMAP notes "TBD (new feature — derives from existing BOM architecture)"). Coverage is assessed against the 8 success criteria instead — all 8 verified.

---

## Anti-Patterns Found

No blockers or warnings detected.

Scan of all Phase 20 files for TODO/FIXME/placeholder/empty implementations returned no results. The two auto-fixed issues documented in 20-06-SUMMARY.md (type-only imports, unknown-as-ReactNode) were resolved before commit.

| File | Pattern | Severity | Status |
|------|---------|----------|--------|
| `convex/productionRecipes/mutations.ts` | `ctx: any` in helper functions `getComponentDepthFromRoot`/`getMaxDepthBelow` | Info | Non-blocking; helpers are private, type safety not critical path |

---

## Human Verification Required

### 1. RecipeEditorModal Opens on Row Click

**Test:** In ProductionComponentsManager, click any production component row (not the Edit button)
**Expected:** RecipeEditorModal opens with Sub-components section and Direct Ingredients section visible; COGS preview in footer
**Why human:** Interactive modal trigger and rendering cannot be verified by static analysis

### 2. Inline Create Ingredient Flow

**Test:** In RecipeEditorModal Ingredient section, click "Add Ingredient", select "Create new..." from dropdown, fill in name/unit/volume/price, click "Create & Add"
**Expected:** New ingredient created in database, immediately linked to component, COGS preview updates
**Why human:** Two-step async flow (create ingredient then link) requires runtime verification

### 3. Ingredient Badge Display in Inventory

**Test:** Open InventoryManager, set category filter to "Production", verify badge differentiation
**Expected:** Ingredients (trackInventory=true production componentTypes) show green "Ingredient" badge; production balls show blue "Ball" badge; negative stock shows red background
**Why human:** Requires actual ingredient componentTypes in database (created via createIngredientComponentType)

### 4. Dispatch Planner Ingredient Simulation

**Test:** Configure dispatch plans for next 7 days in DispatchPlanner, click "Simulate" in Materials Check panel
**Expected:** Packaging Materials and Ingredient Materials sections both show day-by-day status; Ingredient Resupply Forecast table appears when ingredient data exists
**Why human:** Requires production component recipes AND ingredient inventory stock data to exercise simulation logic

### 5. COGS Forward-Only Behavior

**Test:** Set an existing production component to "calculated" COGS mode, add ingredient links, confirm COGS updates. Then check a historical order for that product — unit cost in orderItems should not change
**Expected:** Historical orders retain original costs; only new orders after COGS change reflect updated ingredient-derived cost
**Why human:** Requires examining specific historical order documents in database

---

## Gaps Summary

No gaps. All 8 success criteria are verified against actual codebase artifacts. All key files exist with substantive implementations and proper wiring. No stubs, no placeholder implementations, no missing connections detected.

The implementation delivers:

- Schema foundation: 2 new BOM tables (`productionComponentLinks`, `productionComponentIngredients`) + 7 COGS fields on componentTypes + `ingredientComponentTypeId` on ingredients
- Backend: Full production recipe CRUD, DFS hierarchy traversal with cycle detection, lazy COGS caching, upward cost cascade, FIFO ingredient inventory, order fulfillment deduction
- Frontend: Recipe editor modal with sub-component and ingredient sections (including inline create), tier-sorted ProductionComponentsManager, inventory display with type badges and negative stock highlighting, COGS breakdown tooltip, dispatch planner Materials Check panel with 7-day ingredient resupply forecast
- Build passes (Plan 06 confirmed zero errors after two auto-fixed bugs)

---

*Verified: 2026-02-17T13:00:00Z*
*Verifier: Claude (gsd-verifier)*

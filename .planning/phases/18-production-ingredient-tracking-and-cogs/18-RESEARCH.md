# Phase 20: Production Ingredient Tracking & COGS - Research

**Researched:** 2026-02-17
**Domain:** Hierarchical BOM extension, FIFO ingredient inventory, COGS calculation
**Confidence:** HIGH

## Summary

Phase 20 extends the existing packaging BOM/inventory system to cover production components' ingredient recipes. The core challenge is adding **hierarchical sub-component support** (up to 3 tiers deep) to production components, with FIFO ingredient inventory and auto-calculated COGS flowing upward through the hierarchy. The good news is that nearly all infrastructure already exists: `componentTypes`, `inventoryBatches`, `componentStock`, FIFO logic (`convex/inventory/fifo.ts`), cost invalidation (`convex/lib/costInvalidation.ts`), and the `ReceiveStockDialog` UI pattern. The work is primarily: (1) new schema tables for production component recipes, (2) hierarchy traversal logic, (3) extending `InventoryManager` with ingredient rows, (4) a recipe editor modal on `ProductionComponentsManager`, and (5) a simulation query for the dispatch planner.

**Primary recommendation:** Model production component recipes as a separate link table (like `menuProductComponents` links to `componentTypes`), add a parallel `productionComponentIngredients` table for direct ingredients, reuse the existing `inventoryBatches`/`componentStock`/`componentTransactions` infrastructure for ingredient FIFO tracking by enabling `trackInventory: true` on ingredient-type component types, and add circular reference detection via a depth-first traversal utility.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Production components can contain **other production components** (sub-components) AND **direct ingredients**
- Max nesting depth: **3 tiers** (e.g., Tier 3 ball -> Tier 2 marshmallow outer -> Tier 1 ingredients)
- Tier is **implicit** -- inferred from nesting depth, no explicit tier label on components
- Circular references **must be validated and prevented** when linking sub-components
- Each production component has a **batch/production size** (e.g., marshmallow outer = 100g, Mid Ball = 45g) set during creation, editable later
- Components can exist with **zero ingredients and zero sub-components** (empty recipe allowed, COGS shows as 'not set')
- **Modal/dialog overlay** for ingredient editing (not a dedicated page), accessed by clicking a production component row
- **Two stacked sections** in modal: "Sub-components" + "Direct ingredients", both always visible
- **Add via dropdown** with "Create new" inline option (matching packaging BOM pattern)
- Quantities per **single component** (not per batch)
- Respect **original unit** of sub-component/ingredient
- **Live COGS preview** updating in real-time as recipe is edited
- **No stock display in modal**
- Default sort: **highest tiers first** (most nesting at top), grouped by tier, with alphabetical alternative
- Food ingredients in **same Production tab** of existing Inventory page (one flat list with type badges)
- Receive modal **identical to packaging** -- same fields, FIFO, one batch at a time
- **No storage location tracking** for food ingredients -- all in kitchen
- **Same low-stock alert system** as packaging
- Triggered by **order fulfillment** (Boxed/Labeled transition), not production log
- **Full hierarchy trace** -- deducts all leaf ingredients through component tree
- If insufficient stock: **warn but allow** -- show warning, don't block fulfillment
- Negative stock displayed with **red highlight and warning icon**
- **User explicitly toggles** per-component between "Manual COGS" and "Calculated COGS"
- Toggle is **per-component** (independent)
- Manual value **preserved as fallback** when toggling to calculated
- **Partial calculation with warning** if ingredients missing cost data
- COGS recalculates **lazy/on-demand** -- cached otherwise
- **Forward-only** -- historical orders keep original COGS
- **Enhanced COGS display** with breakdown tooltip showing full hierarchy
- **Combined "Materials Check" panel** in dispatch planner showing both packaging AND ingredient sufficiency
- **7-day horizon** matching planner window
- Shows **projected resupply dates** ("runs out by Wednesday")
- Triggered by **manual "Simulate" button**

### Claude's Discretion
- Exact modal sizing and scroll behavior for the ingredient recipe editor
- COGS caching strategy implementation details
- Hierarchy traversal algorithm for deduction
- Specific warning UI for insufficient stock during fulfillment
- Simulation calculation performance optimization
- Exact FIFO batch selection logic for cost calculation

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Convex | ^1.31.7 | Backend database + real-time queries | Already installed |
| React | ^19.2.0 | Frontend UI | Already installed |
| TypeScript | ~5.9 | Type safety | Already installed |
| shadcn/ui + Tailwind | ^4.1.18 | UI components | Already installed |
| Lucide React | latest | Icons | Already installed |
| Sonner | latest | Toast notifications | Already installed |

### No New Dependencies Required
This phase requires zero new npm packages. All functionality builds on existing infrastructure:
- **FIFO logic**: `convex/inventory/fifo.ts` (consumeFromFIFO, applyFIFOConsumption)
- **Stock aggregation**: `convex/inventory/helpers.ts` (updateComponentStock, calculateWeightedAvgCost)
- **Cost invalidation**: `convex/lib/costInvalidation.ts` (pattern for cascading cost recalculation)
- **Cost calculation**: `convex/lib/costCalculator.ts` (normalizeToBaseUnit, calculateLineCost)
- **UI patterns**: `ReceiveStockDialog`, `ComponentRow`, `LowStockAlertsBanner`

## Architecture Patterns

### Recommended Schema Design

```
convex/schema.ts additions:

  // Production component sub-component links (hierarchical BOM)
  productionComponentLinks: defineTable({
    parentComponentId: v.id("componentTypes"),    // Parent production component
    childComponentId: v.id("componentTypes"),     // Child production component (sub-component)
    quantityPerUnit: v.number(),                  // Quantity of child per 1 unit of parent
    unit: v.string(),                             // Unit (g, ml, pcs)
    sortOrder: v.number(),
  })
    .index("by_parent", ["parentComponentId"])
    .index("by_child", ["childComponentId"]),

  // Production component direct ingredients
  productionComponentIngredients: defineTable({
    componentTypeId: v.id("componentTypes"),       // Parent production component
    ingredientId: v.id("ingredients"),             // Direct ingredient
    quantityPerUnit: v.number(),                   // Quantity per 1 unit of parent
    unit: v.string(),                              // Unit (g, ml, pcs)
    sortOrder: v.number(),
    // SNAPSHOT: From ingredients.name at creation
    ingredientName: v.optional(v.string()),
    // CACHE: ingredientCost * quantityPerUnit. Updated on cost invalidation.
    cachedLineCost: v.optional(v.number()),
  })
    .index("by_component", ["componentTypeId"])
    .index("by_ingredient", ["ingredientId"]),
```

**Rationale:** Two separate link tables (sub-component links + direct ingredients) mirror the existing pattern of `menuProductComponents` + `componentIngredients`. The alternative of a single polymorphic table would require discriminated unions and complicate queries.

### componentTypes Table Extensions

```typescript
// Add to existing componentTypes table:
  // Production recipe settings
  batchSize: v.optional(v.number()),         // e.g., 100g for marshmallow outer, 45g for Mid Ball
  batchSizeUnit: v.optional(v.string()),     // "g", "ml", "pcs"

  // COGS mode
  cogsMode: v.optional(v.union(
    v.literal("manual"),      // Use unitCostIdr directly (default, current behavior)
    v.literal("calculated")   // Calculate from ingredient/sub-component costs
  )),
  manualUnitCostIdr: v.optional(v.number()),  // Preserved manual cost when switching to calculated

  // CACHE: Calculated COGS per unit (when cogsMode="calculated")
  cachedCalculatedCogs: v.optional(v.number()),
  cogsCacheUpdatedAt: v.optional(v.number()),
  // CACHE: Number of ingredients/sub-components missing cost data
  cogsMissingCount: v.optional(v.number()),
```

### Pattern 1: Hierarchy Traversal (COGS Calculation)

**What:** Recursive traversal of production component tree to calculate total COGS from leaf ingredients.
**When to use:** COGS recalculation, ingredient deduction on fulfillment.

```typescript
// convex/lib/hierarchyTraversal.ts

interface IngredientUsage {
  ingredientId: Id<"ingredients">;
  totalQuantity: number;  // In base units
  unit: string;
  unitCost: number;
  lineCost: number;
}

/**
 * Traverse production component hierarchy and collect all leaf ingredient usages.
 * quantityMultiplier accumulates as we descend (e.g., 1 Mid Ball needs 15g marshmallow,
 * marshmallow (100g batch) needs 50g sugar => Mid Ball needs 15/100 * 50g = 7.5g sugar).
 *
 * @param ctx - Query or mutation context
 * @param componentTypeId - Root production component
 * @param quantityMultiplier - How many units of this component (starts at 1)
 * @param visited - Set of visited component IDs (circular reference detection)
 * @param maxDepth - Maximum allowed depth (3 per user decision)
 */
async function traverseHierarchy(
  ctx: QueryCtx | MutationCtx,
  componentTypeId: Id<"componentTypes">,
  quantityMultiplier: number,
  visited: Set<string>,
  maxDepth: number
): Promise<IngredientUsage[]> {
  if (maxDepth <= 0) {
    throw new Error("Maximum nesting depth (3) exceeded");
  }
  if (visited.has(componentTypeId)) {
    throw new Error(`Circular reference detected: ${componentTypeId}`);
  }
  visited.add(componentTypeId);

  const component = await ctx.db.get(componentTypeId);
  if (!component) return [];

  const results: IngredientUsage[] = [];

  // 1. Direct ingredients
  const directIngredients = await ctx.db
    .query("productionComponentIngredients")
    .withIndex("by_component", (q) => q.eq("componentTypeId", componentTypeId))
    .collect();

  for (const ing of directIngredients) {
    const ingredient = await ctx.db.get(ing.ingredientId);
    if (!ingredient) continue;

    // quantityPerUnit is per 1 unit of parent component
    // Multiply by quantityMultiplier to get actual quantity needed
    const totalQty = ing.quantityPerUnit * quantityMultiplier;
    const lineCost = calculateLineCost(ingredient.costPerBaseUnit, totalQty, ing.unit);

    results.push({
      ingredientId: ing.ingredientId,
      totalQuantity: totalQty,
      unit: ing.unit,
      unitCost: ingredient.costPerBaseUnit,
      lineCost,
    });
  }

  // 2. Sub-components (recurse)
  const subComponents = await ctx.db
    .query("productionComponentLinks")
    .withIndex("by_parent", (q) => q.eq("parentComponentId", componentTypeId))
    .collect();

  for (const sub of subComponents) {
    // Sub-component quantity is per 1 unit of parent
    // Need to convert: if parent uses 15g of child, and child has batchSize 100g,
    // the multiplier for child's ingredients is (15/100) * parentMultiplier
    const childComponent = await ctx.db.get(sub.childComponentId);
    if (!childComponent) continue;

    // The child quantity represents how much of the child is used per parent unit
    // We need to express this in terms of "units of child" for the recursion
    // If child batchSize is set, convert grams to units
    let childUnits = sub.quantityPerUnit * quantityMultiplier;
    if (childComponent.batchSize && childComponent.batchSize > 0) {
      // Convert raw quantity to units of the child component
      // e.g., 15g of marshmallow / 100g batch = 0.15 units
      childUnits = (sub.quantityPerUnit * quantityMultiplier) / childComponent.batchSize;
    }

    const childResults = await traverseHierarchy(
      ctx, sub.childComponentId, childUnits, new Set(visited), maxDepth - 1
    );
    results.push(...childResults);
  }

  return results;
}
```

### Pattern 2: Circular Reference Prevention

**What:** Validate before saving a sub-component link that it won't create a cycle.
**When to use:** When adding or updating `productionComponentLinks`.

```typescript
/**
 * Check if adding childId as sub-component of parentId would create a cycle.
 * DFS from childId upward through all parents.
 */
async function wouldCreateCycle(
  ctx: QueryCtx | MutationCtx,
  parentId: Id<"componentTypes">,
  childId: Id<"componentTypes">,
  maxDepth = 3
): Promise<boolean> {
  if (parentId === childId) return true;

  // Check if parentId appears anywhere in childId's descendants
  const visited = new Set<string>();
  return await hasDescendant(ctx, childId, parentId, visited, maxDepth);
}

async function hasDescendant(
  ctx: QueryCtx | MutationCtx,
  componentId: Id<"componentTypes">,
  targetId: Id<"componentTypes">,
  visited: Set<string>,
  maxDepth: number
): Promise<boolean> {
  if (maxDepth <= 0) return false;
  if (visited.has(componentId)) return false;
  visited.add(componentId);

  const children = await ctx.db
    .query("productionComponentLinks")
    .withIndex("by_parent", (q) => q.eq("parentComponentId", componentId))
    .collect();

  for (const child of children) {
    if (child.childComponentId === targetId) return true;
    if (await hasDescendant(ctx, child.childComponentId, targetId, visited, maxDepth - 1)) {
      return true;
    }
  }

  return false;
}
```

### Pattern 3: COGS Caching Strategy (On-Demand with Stale Marker)

**What:** Lazy COGS recalculation, matching the existing `unitCostStaleAt` pattern on `menuProducts`.
**When to use:** When viewing a component or explicitly refreshing.

```typescript
// Strategy:
// 1. When an ingredient cost changes, mark affected production components as stale
//    (walk productionComponentIngredients -> componentTypes, set cogsCacheUpdatedAt = undefined)
// 2. When a production component's COGS changes, mark parent components as stale
//    (walk productionComponentLinks by_child -> parent componentTypes)
// 3. When viewing a component with cogsMode="calculated" and stale cache,
//    trigger recalculation via internal mutation
// 4. Frontend shows "recalculating..." if cachedCalculatedCogs exists but is stale

// This matches the existing pattern in componentTypes/mutations.ts where
// unitCostIdr changes trigger invalidateMenuProductCosts via scheduler.
```

### Pattern 4: Ingredient Deduction on Order Fulfillment

**What:** When order status transitions trigger material consumption, also deduct ingredient inventory.
**When to use:** Extending existing `consumeBatchMaterials` / `consumeMaterialsByStageInternal`.

```typescript
// In convex/orders/mutations/inventoryIntegration.ts:
// The existing flow:
// 1. Order -> PaymentReceived: reserveStockForOrderInternal (packaging only)
// 2. Order -> BeingPrepared: consumeProductionMaterialsInternal + consumeBoxingMaterialsInternal
// 3. Order -> Cancelled: releaseReservationInternal

// Phase 20 addition:
// On BeingPrepared (or whichever stage user decides = order fulfillment):
// 1. For each order item, get its production BOM (menuProductComponents where category=production)
// 2. For each production component, traverse hierarchy to get leaf ingredients
// 3. For each leaf ingredient that tracks inventory, consume via FIFO
// 4. If insufficient stock: warn but allow (per user decision)

// Key difference from packaging: NO reservation step.
// Ingredients are consumed directly at fulfillment time.
// Negative stock is allowed (warn, don't block).
```

### Pattern 5: Ingredient Inventory in Existing System

**What:** Reuse `inventoryBatches`/`componentStock` for ingredients by creating ingredient-typed componentTypes.
**When to use:** Food ingredients need FIFO tracking identical to packaging.

```typescript
// Option A: Create componentTypes with category="production" and trackInventory=true
// Problem: Current validation prevents this (componentTypes/mutations.ts line 70-71):
//   "Production components should not track inventory (made to order)"
// Solution: Relax this validation or add new category

// Option B (Recommended): Use the existing `ingredients` table for data,
// but add an optional componentTypeId link for inventory tracking
// Add to ingredients table: componentTypeId: v.optional(v.id("componentTypes"))
// The componentType entry enables FIFO batch tracking

// Option C (Simplest): Add a new category "ingredient" to componentTypes
// This keeps the existing system clean and adds inventory tracking naturally
// componentTypes.category would gain v.literal("ingredient")

// Recommendation: Option C -- add "ingredient" category to componentTypes
// Pros: Clean separation, reuses all existing inventory infrastructure
// Cons: Need to update category union in schema and all category filters
// The ingredient data (name, brand, cost per base unit) stays in the `ingredients` table
// The componentType entry purely enables inventory tracking with a link back
```

### Recommended File Structure

```
convex/
  productionRecipes/              # NEW: Production component recipe management
    mutations.ts                  # CRUD for sub-component links + direct ingredients
    queries.ts                    # Get recipe for a component, COGS calculation
    helpers.ts                    # Hierarchy traversal, circular ref detection, COGS calc
  lib/
    costCalculator.ts             # EXTEND: Add hierarchical COGS calculation
    costInvalidation.ts           # EXTEND: Add production component cost cascade
    hierarchyTraversal.ts         # NEW: Shared hierarchy traversal utility
  inventory/
    mutations.ts                  # EXTEND: Support ingredient batch receiving
    queries.ts                    # EXTEND: Ingredient stock queries
  componentTypes/
    mutations.ts                  # EXTEND: batchSize, cogsMode fields, relax trackInventory
  orders/mutations/
    inventoryIntegration.ts       # EXTEND: Ingredient deduction on fulfillment
  dispatchPlanner/
    queries.ts                    # EXTEND: Materials simulation with ingredients
  schema.ts                       # EXTEND: New tables + field additions

src/
  pages/
    ProductionComponentsManager.tsx  # EXTEND: Add ingredient recipe modal, tier sorting
    InventoryManager.tsx             # EXTEND: Show ingredients in Production tab
  components/
    productionRecipes/               # NEW: Recipe editor modal components
      RecipeEditorModal.tsx          # Main modal with sub-components + ingredients sections
      SubComponentSection.tsx        # Sub-component list with add/edit/remove
      IngredientSection.tsx          # Direct ingredient list with add/edit/remove
      COGSPreview.tsx                # Live COGS calculation preview
      COGSBreakdownTooltip.tsx       # Hierarchical COGS breakdown tooltip
    inventory/
      ComponentRow.tsx               # EXTEND: Type badge for ingredients
      LowStockAlertsBanner.tsx       # EXTEND: Include ingredient alerts
    dispatchPlanner/
      MaterialsCheckPanel.tsx        # NEW: Combined packaging + ingredient sufficiency
  hooks/convex/
    useProductionRecipes.ts          # NEW: Hooks for production recipe CRUD
    useInventory.ts                  # EXTEND: Ingredient inventory hooks
    useComponentTypes.ts             # EXTEND: Updated types
```

### Anti-Patterns to Avoid

- **Storing tier level explicitly:** Tier is derived from nesting depth, not stored. Storing it creates sync issues when hierarchy changes.
- **Eager COGS recalculation:** Don't recalculate on every ingredient price change. Use stale markers and lazy recalculation to avoid write amplification.
- **Blocking fulfillment on insufficient stock:** User explicitly decided warn-but-allow. Don't throw errors for negative ingredient stock.
- **Separate inventory system for ingredients:** Reuse the existing `inventoryBatches`/`componentStock` infrastructure. Don't build a parallel system.
- **Dynamic imports in Convex:** Static imports only (Convex pitfall #8 from CLAUDE.md).
- **Hooks after conditional returns:** All React hooks must be called before any conditional returns (pitfall #9).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FIFO batch consumption | Custom deduction logic | `convex/inventory/fifo.ts` (consumeFromFIFO, applyFIFOConsumption) | Already handles edge cases: expired batches, insufficient stock, transaction logging |
| Stock aggregation | Manual sum queries | `convex/inventory/helpers.ts` (updateComponentStock) | Handles weighted avg cost, latest supplier, upsert logic |
| Cost invalidation cascade | Direct inline recalculation | `convex/lib/costInvalidation.ts` pattern (scheduler.runAfter) | Async cascade prevents mutation timeout, matches existing pattern |
| Low-stock alerts | New alert system | `convex/inventory/queries.ts` (getLowStockAlerts) | Already supports both units and percentage thresholds |
| Receive stock UI | New receive dialog | `src/components/inventory/ReceiveStockDialog.tsx` | Two-mode dialog (select existing / create new) already built |
| Unit conversion | Manual conversion | `convex/lib/costCalculator.ts` (normalizeToBaseUnit, getBaseUnit) | Handles kg->g, l->ml, m->cm, and 1ml=1g rule |

**Key insight:** The entire packaging inventory infrastructure (FIFO, batches, stock aggregation, alerts, transactions, receive dialog) is directly reusable. The main new code is hierarchy traversal and the recipe editor modal.

## Common Pitfalls

### Pitfall 1: Circular Reference in Component Hierarchy
**What goes wrong:** Component A contains B, B contains C, C contains A. Traversal loops infinitely or stack overflows.
**Why it happens:** No validation on sub-component linking.
**How to avoid:** Validate before saving every `productionComponentLinks` insert/update. DFS from child to check if parent appears in child's descendant tree.
**Warning signs:** Convex mutation timeout (10s default), infinite recursion errors.

### Pitfall 2: Write Amplification on Ingredient Cost Change
**What goes wrong:** Changing one ingredient's cost triggers recalculation of every component that uses it, which cascades to parent components, which cascades to menu products. A single edit could touch hundreds of documents.
**Why it happens:** Eager cascading recalculation.
**How to avoid:** Use stale markers (set `cogsCacheUpdatedAt = undefined`) and lazy recalculation (only recalculate when viewed). Cap cascade depth. Use `ctx.scheduler.runAfter(0, ...)` for async processing.
**Warning signs:** Mutation timeouts, slow UI updates after ingredient edits.

### Pitfall 3: Double-Counting Ingredients in Hierarchy
**What goes wrong:** If two sub-components share the same ingredient, the ingredient gets counted twice when deducting inventory.
**Why it happens:** This is actually correct behavior -- if Mid Ball uses 1g cocoa directly AND its marshmallow sub-component also uses 2g cocoa, both should be deducted. But aggregation for COGS display must be clear.
**How to avoid:** In COGS display, show each usage path separately. In deduction, aggregate by ingredientId to make a single FIFO call per ingredient.
**Warning signs:** Confusing COGS tooltips, unexpected deduction amounts.

### Pitfall 4: Quantity Unit Mismatches in Hierarchy
**What goes wrong:** Parent component specifies 15g of sub-component, but sub-component's batchSize is in ml. Cost calculation is wrong.
**Why it happens:** No unit compatibility check between parent quantity unit and child's batchSize unit.
**How to avoid:** When linking sub-components, validate that the quantity unit is compatible with the child's batchSize unit. Use `normalizeToBaseUnit()` from costCalculator.ts to convert before calculation.
**Warning signs:** COGS values that are orders of magnitude wrong.

### Pitfall 5: Stale COGS on Menu Products After Phase 20
**What goes wrong:** Menu product `unitCost` is still calculated from `componentTypes.unitCostIdr` (the manual value). After switching a production component to calculated COGS, the menu product doesn't pick up the new calculated value.
**Why it happens:** `invalidateMenuProductCosts` reads `componentType.unitCostIdr` directly, but calculated COGS is stored in `cachedCalculatedCogs`.
**How to avoid:** When `cogsMode="calculated"`, `unitCostIdr` should be updated to match `cachedCalculatedCogs` (or the invalidation logic should read the effective cost). Decision: update `unitCostIdr` to match calculated value, keeping `manualUnitCostIdr` as the preserved fallback.
**Warning signs:** Menu product COGS doesn't change when ingredient prices change.

### Pitfall 6: Ingredient Kitchen Location Assumption
**What goes wrong:** Ingredient inventory requires a `locationId` for FIFO queries, but user decided "no storage location tracking for food ingredients."
**Why it happens:** The existing `inventoryBatches` table requires `locationId` (foreign key to `storageLocations`).
**How to avoid:** Create a default "Kitchen" storage location (or reuse existing one if it exists). Hard-code ingredient batches to use this location. The kitchen location already exists per the `storageLocations.locationType` enum which includes `"kitchen"`.
**Warning signs:** Errors about missing location when receiving ingredient stock.

## Code Examples

### Existing Packaging Inventory Receive (Pattern to Follow)

```typescript
// Source: convex/inventory/mutations.ts - receiveStock
// This exact pattern applies to ingredient receiving.
// Key fields: componentTypeId, locationId, purchaseDate, supplierName,
//             quantityPurchased, totalCostIdr, expiryDate
// Creates: inventoryBatch + componentTransaction + updates componentStock
```

### Existing Cost Invalidation Cascade (Pattern to Follow)

```typescript
// Source: convex/lib/costInvalidation.ts - invalidateMenuProductCosts
// When componentType.unitCostIdr changes:
// 1. Find menuProductComponents using this componentType
// 2. For each affected menuProduct, recalculate total unitCost
// 3. Clear stale marker

// Phase 20 extension:
// When ingredient cost changes:
// 1. Find productionComponentIngredients using this ingredient
// 2. For each affected componentType, recalculate cachedCalculatedCogs
// 3. Walk productionComponentLinks.by_child to find parent components (cascade up)
// 4. For each parent, recalculate or mark stale
// 5. After all components updated, trigger invalidateMenuProductCosts for affected products
```

### Existing Order Fulfillment Flow (Integration Point)

```typescript
// Source: convex/orders/mutations/statusUpdates.ts lines 1-9
// Status transitions that consume inventory:
// - PaymentReceived: reserveStockForOrderInternal (packaging only)
// - BeingPrepared: consumeProductionMaterialsInternal + consumeBoxingMaterialsInternal + consumeStickerMaterialsInternal
// - Cancelled: releaseReservationInternal

// Phase 20: Add ingredient consumption at BeingPrepared
// For each order item with a menu product:
//   For each production component in its BOM:
//     Traverse hierarchy to get leaf ingredients
//     For each leaf ingredient with trackInventory:
//       Try consumeFromFIFO
//       If insufficient: log warning, allow negative stock
//       Create componentTransaction records
```

### Existing ReceiveStockDialog (UI Pattern to Reuse)

```typescript
// Source: src/components/inventory/ReceiveStockDialog.tsx
// Two modes: 'select' (existing component) and 'create-new'
// Fields: component dropdown, location, quantity, total cost, supplier name,
//         brand, purchase reference, purchase URL, expiry date
// For ingredients: same fields, but location pre-set to Kitchen
// Add: "Create new ingredient" inline form matching existing pattern
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual COGS on production components | Manual COGS (unitCostIdr) | Current | Phase 20 adds calculated option alongside manual |
| No ingredient tracking | Ingredients exist but no inventory | Current | Phase 20 adds FIFO inventory for ingredients |
| Packaging-only inventory | Packaging FIFO + stock alerts | Phase 13-15 | Phase 20 extends same infrastructure to ingredients |
| Flat BOM (component -> ingredient) | Flat menuProduct -> componentType | Current | Phase 20 adds hierarchical production BOM |

**Current state of componentTypes:**
- `category` union: `"production" | "packaging"` (2 values)
- `trackInventory`: `false` for production, `true` for packaging (enforced in mutations)
- Production components have `unitCostIdr` set manually

**After Phase 20:**
- Production components gain optional ingredient recipes (sub-components + direct ingredients)
- Production components can toggle between manual and calculated COGS
- Ingredients gain FIFO inventory tracking via componentTypes with `trackInventory: true`
- Need decision: Add `"ingredient"` category to componentTypes, OR relax the production+trackInventory validation

## Open Questions

1. **How to model ingredients in the componentTypes system?**
   - What we know: Ingredients need FIFO inventory tracking identical to packaging. The `inventoryBatches`/`componentStock` infrastructure requires a `componentTypeId`.
   - What's unclear: Should ingredients get a new category (`"ingredient"`) in componentTypes, or should we link the existing `ingredients` table to componentTypes via an optional foreign key?
   - Recommendation: Add `"ingredient"` category to componentTypes. This is cleanest -- ingredients appear in the same inventory system as packaging, filtered by category. The existing `ingredients` table continues to store cost data (priceExclShipping, volumePurchased, etc.) and `componentTypes` entry enables inventory tracking. Link via `ingredients.componentTypeId` (new optional field) or duplicate ingredient data into componentTypes (less clean).

2. **Which fulfillment stage triggers ingredient deduction?**
   - What we know: User said "order fulfillment (Boxed/Labeled)." The current system has `BeingPrepared` which replaced `InProduction/Boxed/Labeled`.
   - What's unclear: In the simplified 7-status workflow, `BeingPrepared` is the single production stage. Should ingredient deduction happen at `BeingPrepared` entry?
   - Recommendation: Deduct at `BeingPrepared` transition (same as when packaging materials are consumed). This matches the user's intent of "order fulfillment" and aligns with the existing consumption trigger point. Use `consumptionStage: "production"` for ingredient components.

3. **How to handle batchSize unit conversion in hierarchy traversal?**
   - What we know: Parent specifies "15g of marshmallow outer" and marshmallow outer has batchSize=100g. The ratio is 15/100 = 0.15 units.
   - What's unclear: What if units don't match (parent uses "ml" but child batchSize is in "g")?
   - Recommendation: Enforce same base unit family between quantity and batchSize (both mass or both volume). Apply the existing 1ml=1g business rule for cross-family conversions. Use `normalizeToBaseUnit()` to convert both to base units before dividing.

4. **Should ingredient componentTypes auto-sync with the ingredients table?**
   - What we know: The `ingredients` table has cost data (priceExclShipping, volumePurchased, costPerBaseUnit). componentTypes has unitCostIdr.
   - What's unclear: When ingredient cost changes, should the linked componentType.unitCostIdr update automatically?
   - Recommendation: Yes. When `ingredients` table updates, find the linked componentType (if any) and update its `unitCostIdr` to match `costPerBaseUnit`. This triggers the existing COGS cascade. Alternatively, the hierarchy traversal reads directly from `ingredients.costPerBaseUnit` and ignores componentType cost for ingredients -- this is simpler and avoids sync issues.

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` - Complete schema with 59 tables, all indexes, field types
- `convex/inventory/fifo.ts` - FIFO consumption logic with batch tracking
- `convex/inventory/helpers.ts` - Stock aggregation, weighted avg cost
- `convex/inventory/mutations.ts` - Receive, transfer, adjust, delete operations
- `convex/inventory/queries.ts` - Low stock alerts, inventory reports, batch queries
- `convex/componentTypes/mutations.ts` - Component CRUD with validation rules
- `convex/componentTypes/queries.ts` - Component queries with cost insights
- `convex/menuProductComponents/mutations.ts` - BOM link CRUD pattern
- `convex/lib/costInvalidation.ts` - Cost cascade pattern (recipe + packaging + menu product)
- `convex/lib/costCalculator.ts` - Unit conversion, line cost, BOM COGS calculation
- `convex/orders/mutations/inventoryIntegration.ts` - Stock reservation/consumption on fulfillment
- `convex/orders/mutations/statusUpdates.ts` - Status transitions with inventory hooks
- `convex/orders/helpers/statusTransitions.ts` - 7-status Kanban workflow
- `convex/ingredients/mutations.ts` - Ingredient CRUD with cost invalidation
- `src/pages/ProductionComponentsManager.tsx` - Current production component UI
- `src/pages/InventoryManager.tsx` - Inventory page with tabs, filters, search
- `src/components/inventory/ReceiveStockDialog.tsx` - Receive stock UI pattern
- `src/hooks/convex/useComponentTypes.ts` - Component type hooks and types
- `src/hooks/convex/useInventory.ts` - Inventory hooks
- `convex/dispatchPlanner/queries.ts` - Dispatch planner queries (simulation integration point)

### Secondary (MEDIUM confidence)
- Phase context document (user decisions from `/gsd:discuss-phase`)
- CLAUDE.md project documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, zero new dependencies
- Architecture: HIGH - Extending well-documented existing patterns with clear schema design
- Pitfalls: HIGH - All identified from direct codebase analysis, not speculation
- Hierarchy traversal: MEDIUM - Algorithm is straightforward but edge cases (unit conversion, batchSize=0) need careful handling during implementation

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable codebase, no external dependency changes expected)

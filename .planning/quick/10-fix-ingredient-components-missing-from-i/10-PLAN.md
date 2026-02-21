---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/inventory/queries.ts
  - src/pages/InventoryManager.tsx
autonomous: true
requirements: [QUICK-10]

must_haves:
  truths:
    - "Production ingredient components (category=production, trackInventory=true) appear in the Inventory Manager when the Production category filter is selected"
    - "Production ingredient components with zero stock still appear in the list (not hidden by empty-stock filter)"
    - "Production components without trackInventory (balls) also appear in Production tab to make the full BOM discoverable"
    - "The 'No inventory yet' empty state only shows when there are genuinely no production-category componentTypes in the database"
  artifacts:
    - path: "convex/inventory/queries.ts"
      provides: "getInventoryReport query extended to include all production-category components regardless of trackInventory flag"
    - path: "src/pages/InventoryManager.tsx"
      provides: "Location sub-filter allows zero-stock rows for production tab; production components without stock show as discoverable"
  key_links:
    - from: "src/pages/InventoryManager.tsx"
      to: "convex/inventory/queries.ts"
      via: "useConvexInventoryReport -> getInventoryReport"
      pattern: "getInventoryReport"
    - from: "convex/inventory/queries.ts"
      to: "componentTypes (by_track_inventory index)"
      via: "query handler fetches only trackInventory=true components"
      pattern: "by_track_inventory"
---

<objective>
Fix the Inventory Manager Production tab showing "No inventory yet" for production ingredient components.

Purpose: Production ingredient components (e.g., "Outer - Marshmallow" with sub-ingredients) are visible on the /components/production page but invisible in Inventory Manager's Production tab because `getInventoryReport` only fetches components with `trackInventory=true`, and the location sub-filter hides zero-stock rows.

Output: All production-category componentTypes are surfaced in Inventory Manager Production tab, with ingredient-tracked ones showing stock levels and non-tracked (balls) shown as informational/discoverable rows.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

Key files:
@convex/inventory/queries.ts
@src/pages/InventoryManager.tsx
@convex/schema.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend getInventoryReport to include all production-category components</name>
  <files>convex/inventory/queries.ts</files>
  <action>
In `getInventoryReport` (around line 237), the current query fetches only `trackInventory=true` components via `by_track_inventory` index. This excludes production ball components (BIG_BALL, MID_BALL) and any production ingredient that has `trackInventory=false`.

Change the query strategy: fetch ALL production-category components PLUS all packaging components that have `trackInventory=true`. This gives the complete production view.

Specific change — replace the single index query with a union approach:

```typescript
// Instead of:
let components = await ctx.db
  .query("componentTypes")
  .withIndex("by_track_inventory", (q) => q.eq("trackInventory", true))
  .collect();

// Do:
// Fetch production components (all of them, regardless of trackInventory)
const productionComponents = await ctx.db
  .query("componentTypes")
  .withIndex("by_category", (q) => q.eq("category", "production"))
  .collect();

// Fetch packaging components that track inventory
const packagingComponents = await ctx.db
  .query("componentTypes")
  .withIndex("by_track_inventory", (q) => q.eq("trackInventory", true))
  .collect();
// Filter to only packaging (avoids duplicates with productionComponents)
const packagingTracked = packagingComponents.filter(c => c.category !== "production");

let components = [...productionComponents, ...packagingTracked];
```

Keep the `activeComponentsOnly` filter that follows — it applies to the combined list.

The `isIngredient` flag (already computed at line 302 as `component.category === "production" && component.trackInventory`) continues to work correctly for the enriched matrix rows.

Also add `isIngredient` to the returned matrix row shape — it is already there (line 310), no change needed there.
  </action>
  <verify>
Run `npm run type-check` — should pass with no new errors.

Also confirm the query logic is correct by tracing: production components (balls and ingredient trackers) now all appear in matrix; packaging components with trackInventory=true also appear (unchanged behavior).
  </verify>
  <done>
`npm run type-check` passes. The `getInventoryReport` handler fetches production components by category index (not trackInventory filter) so all production componentTypes appear in the matrix regardless of their trackInventory setting.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix InventoryManager location filter to not hide zero-stock production rows</name>
  <files>src/pages/InventoryManager.tsx</files>
  <action>
In `InventoryManager.tsx`, the location sub-filter (lines 70-87) hides any row where `stockAtLocation.totalStock === 0` when a specific location tab is selected. This is correct for packaging (don't show items with no stock at that location), but wrong for production components — they should always be visible as they represent the production BOM, not FIFO batches.

Change the location filter to only hide zero-stock rows for packaging components. Production components always pass through even with zero stock:

```typescript
// Replace lines 70-87:
return filtered
  .map((row) => {
    // Production components always show (they're informational/BOM-level)
    if (row.component.category === "production") {
      const stockAtLocation = row.stockByLocation.find(
        (loc) => loc.locationId === selectedLocation
      );
      return {
        ...row,
        stockByLocation: stockAtLocation ? [stockAtLocation] : [],
        totalAcrossLocations: stockAtLocation?.totalStock ?? 0,
        totalReservedAcrossLocations: stockAtLocation?.totalReserved ?? 0,
        totalAvailable: stockAtLocation?.available ?? 0,
      };
    }

    // Packaging: only show if stock exists at this location
    const stockAtLocation = row.stockByLocation.find(
      (loc) => loc.locationId === selectedLocation
    );
    if (!stockAtLocation || stockAtLocation.totalStock === 0) {
      return null;
    }

    return {
      ...row,
      stockByLocation: [stockAtLocation],
      totalAcrossLocations: stockAtLocation.totalStock,
      totalReservedAcrossLocations: stockAtLocation.totalReserved,
      totalAvailable: stockAtLocation.available,
    };
  })
  .filter((row): row is NonNullable<typeof row> => row !== null);
```

This means: when filtering to a specific location, packaging items with zero stock at that location are still hidden (correct), but production components always show (allowing users to see all production BOM items and identify which ones track inventory).

No other changes to InventoryManager needed — the existing `categoryFilter === "production"` badge correctly filters by `row.component.category === "production"`, and that now covers all production componentTypes from the updated query.
  </action>
  <verify>
Run `npm run type-check` — should pass.
Run `npm run build` — should pass.

Manual verification in browser:
1. Go to /inventory
2. Click "Production" category filter badge
3. Confirm production ingredient components appear (e.g., "Outer - Marshmallow") even if they have zero stock
4. Confirm ball-type components (BIG_BALL, MID_BALL) also appear in the list as informational rows
5. Switch to a specific location tab — production components should still show (with their stock at that location or 0)
6. Switch back to "All" — packaging components with no stock still don't appear (that behavior unchanged)
  </verify>
  <done>
`npm run build` passes. Production ingredient components visible in Inventory Manager Production tab. Components with zero stock are not hidden. Packaging behavior unchanged (zero-stock items at a specific location remain hidden).
  </done>
</task>

</tasks>

<verification>
1. `npm run type-check` passes with no errors
2. `npm run build` passes (tsc + vite)
3. In browser: /inventory > Production filter shows all production componentTypes
4. Production components with no stock records appear (not "No inventory yet")
5. Ingredient-tracked production components (trackInventory=true) show stock levels
6. Non-tracked production components (balls) show as discoverable rows with 0 stock
7. Packaging tab behavior unchanged — only packaging items with trackInventory=true shown
</verification>

<success_criteria>
- All production-category componentTypes appear in Inventory Manager Production filter
- "No inventory yet" state only appears when there are literally zero production componentType documents in the database
- Ingredient-tracked components surface stock levels from componentStock records
- `npm run build` passes
</success_criteria>

<output>
After completion, create `.planning/quick/10-fix-ingredient-components-missing-from-i/10-SUMMARY.md`
</output>

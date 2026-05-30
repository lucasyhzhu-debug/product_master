# Phase 68: COGS Bulk Price Update - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a unified COGS update screen where managers can bulk-edit ingredient and packaging material prices in a single session. Changes cascade immediately to recipe costs and product COGS. Price changes are tracked in a simple before/after log for auditing.

</domain>

<decisions>
## Implementation Decisions

### Bulk Edit UX
- **D-01:** Unified COGS Update screen with two tabs: "Ingredients" and "Packaging Materials". One page, not two. Consistent with milestone's consolidation theme.
- **D-02:** Editable grid pattern (similar to Phase 67 stock count grid). Each row shows: item name, unit, current priceExclShipping (editable), volumePurchased (editable), shippingCost (editable), calculated costPerBaseUnit (read-only, updates live as inputs change).
- **D-03:** Save-all button submits all changed rows in one batch. Only rows with actual changes are submitted (dirty tracking).

### Cost Recalculation
- **D-04:** Full cascade immediately on save. When prices change: recalculate `costPerBaseUnit` → recalculate all affected recipe costs → update product COGS. Everything stays consistent in one transaction.
- **D-05:** The cascade follows the existing `costCalculator.ts` pipeline. No new calculation logic needed — just trigger recalculation for affected items.

### Price History
- **D-06:** New `priceChangeLog` table (or similar): tracks `entityType` ("ingredient" | "packagingMaterial"), `entityId`, `field` (which field changed), `oldValue`, `newValue`, `changedBy`, `changedAt`. Simple before/after log, not versioned snapshots.
- **D-07:** Price history is write-only from the bulk update. No UI to browse history in this phase — just the data is recorded. A future phase could add a "price history" view.

### Claude's Discretion
- Whether the editable grid uses inline inputs or a spreadsheet-like pattern
- Whether to show a diff summary before saving ("3 ingredients changed, 1 material changed")
- Index design for `priceChangeLog` table
- Whether to pre-sort items alphabetically or by last-modified

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ingredients
- `convex/schema.ts` lines 45-60 — `ingredients` table (priceExclShipping, shippingCost, volumePurchased, costPerBaseUnit)
- `convex/ingredients/mutations.ts` — `create` and `update` mutations with `calculateCostPerBaseUnit()` call
- `convex/ingredients/queries.ts` — Ingredient list/detail queries
- `src/pages/IngredientsManager.tsx` — Current single-item EntityManager CRUD

### Packaging Materials
- `convex/schema.ts` lines 64-77 — `packagingMaterials` table (identical cost structure to ingredients)
- `convex/materials/mutations.ts` — Material CRUD with cost calculation
- `convex/materials/queries.ts` — Material list/detail queries
- `src/pages/MaterialsManager.tsx` — Current single-item EntityManager CRUD

### Cost Calculation Pipeline
- `convex/lib/costCalculator.ts` — Recipe and product cost calculation logic
- `convex/recipes/mutations.ts` — Recipe cost recalculation on ingredient changes
- `convex/products/queries.ts` — Product COGS derivation from recipe + packaging costs

### Pattern References
- Phase 67 stock count grid — similar bulk-edit grid pattern (location selector + editable rows)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `calculateCostPerBaseUnit()` from `ingredients/mutations.ts` — already handles the math for all unit types
- `EntityManager` component — existing CRUD pattern, but bulk edit needs a different UX (editable table, not dialog per item)
- `formatCurrency()` from `src/lib/utils` — IDR formatting for display

### Established Patterns
- Both `ingredients` and `packagingMaterials` use identical cost fields: `priceExclShipping`, `shippingCost`, `volumePurchased` → `costPerBaseUnit` (CACHE)
- Mutation pattern: update the item fields → recalculate `costPerBaseUnit` → patch the document
- The cascade to recipe/product costs is NOT automatic in the current code — `costCalculator.ts` is called on-demand when viewing products. The bulk update should trigger explicit recalculation.

### Integration Points
- New `bulkUpdatePrices` mutation accepting array of changes (ingredient/material ID + new values)
- New `priceChangeLog` table for audit trail
- App.tsx route for the new COGS Update page
- Header.tsx navigation link (under same section as Ingredients/Materials)

</code_context>

<specifics>
## Specific Ideas

- The phase is about efficiency — updating 30+ ingredient prices one at a time through EntityManager dialogs is painfully slow when supplier prices change quarterly
- Live calculation preview in the grid (change price → see costPerBaseUnit update without saving) gives confidence before committing
- The diff summary before save is a nice-to-have that prevents accidental bulk changes

</specifics>

<deferred>
## Deferred Ideas

- **Price history UI**: Browse historical price changes per ingredient/material. Data is recorded in this phase, UI deferred.
- **CSV import for prices**: Upload a supplier price list CSV to bulk-update. Much larger scope, future phase.
- **Procurement source grouping**: Group ingredients by supplier so you can update all items from one supplier at once.

</deferred>

---

*Phase: 68-cogs-bulk-price-update*
*Context gathered: 2026-03-28*

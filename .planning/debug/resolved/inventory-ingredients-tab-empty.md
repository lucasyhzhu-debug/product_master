---
status: verifying
trigger: "Ingredients tab in Inventory Manager shows 'No inventory yet' after previous fix filtering to category=production AND trackInventory=true"
created: 2026-02-21T01:00:00Z
updated: 2026-02-21T01:10:00Z
---

## Current Focus

hypothesis: CONFIRMED - No componentTypes exist with category=production AND trackInventory=true because ingredient tracking was never enabled via IngredientsManager.
test: Improve empty state to guide user to enable tracking
expecting: Build passes, empty state is informative
next_action: Verify build and update status to resolved

## Symptoms

expected: Ingredients tab shows direct/leaf ingredients (raw materials like Marshmallow, Butter, Milk Powder, Cacao Powder, Pistachio Spread, Pistachio Paste, Kunafa, Salt)
actual: Ingredients tab shows "No inventory yet" -- completely empty
errors: No errors -- just empty state
reproduction: Go to Inventory Manager -> Ingredients tab -> empty
started: After previous fix that added trackInventory===true filter

## Eliminated

## Evidence

- timestamp: 2026-02-21T01:01:00Z
  checked: InventoryManager.tsx filter logic (lines 77-82)
  found: Filter correctly checks `category === "production" && trackInventory === true`
  implication: Filter logic is correct; problem is upstream (data)

- timestamp: 2026-02-21T01:02:00Z
  checked: getInventoryReport query (convex/inventory/queries.ts lines 242-259)
  found: Query fetches ALL production componentTypes, then frontend filters. No bug in query.
  implication: If componentTypes with category=production & trackInventory=true existed, they'd appear

- timestamp: 2026-02-21T01:03:00Z
  checked: convex/schema.ts - ingredients table (line 14-30) and productionComponentIngredients table (lines 899-909)
  found: Ingredients are stored in `ingredients` table, linked to production components via `productionComponentIngredients`. The `ingredients.ingredientComponentTypeId` field optionally links to a componentType for inventory tracking.
  implication: Ingredients and componentTypes are separate entities. Only linked ingredients appear in inventory.

- timestamp: 2026-02-21T01:04:00Z
  checked: createIngredientComponentType mutation (convex/componentTypes/mutations.ts lines 356-431)
  found: This Phase 20 mutation creates a componentType with category=production, trackInventory=true for a given ingredient. It exists but must be called per-ingredient.
  implication: If this mutation was never called, no ingredient componentTypes exist.

- timestamp: 2026-02-21T01:05:00Z
  checked: IngredientsManager.tsx EnableTrackingButton (lines 39-98)
  found: IngredientsManager has "Enable Tracking" button per ingredient (calls createIngredientComponentType) and shows "Tracked" badge when already linked. This is the Phase 20 UI for linking.
  implication: Users must manually enable tracking per ingredient. If they haven't, the Ingredients tab in Inventory will be empty.

- timestamp: 2026-02-21T01:06:00Z
  checked: componentTypes/seed.ts
  found: Only Big Ball and Mid Ball are seeded (both with trackInventory=false). No ingredient-tracking componentTypes are seeded.
  implication: Confirms no ingredient componentTypes exist out of the box.

## Resolution

root_cause: The Ingredients tab in Inventory Manager filters for componentTypes with category="production" AND trackInventory=true. These entries only exist after a user clicks "Enable Tracking" per ingredient on the IngredientsManager page (Phase 20). No ingredients have been linked yet, so the tab is empty. The generic "No inventory yet" empty state gives no guidance on how to resolve this.

fix: Updated the empty state for the Ingredients tab to show a specific, informative message explaining that ingredient tracking must be enabled, with a "Go to Ingredients" button that links to the IngredientsManager page where users can enable tracking per ingredient.

verification: TypeScript type-check passes. Full build succeeds. Empty state renders different content based on mainTab value.

files_changed:
- src/pages/InventoryManager.tsx

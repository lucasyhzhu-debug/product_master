---
status: resolved
trigger: "The Ingredients tab in Inventory Manager is showing production components instead of direct/leaf ingredients"
created: 2026-02-21T00:00:00Z
updated: 2026-02-21T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - Ingredients tab filter uses category=production which matches ALL production componentTypes (balls + ingredients)
test: Read filtering logic in InventoryManager.tsx
expecting: Filter only checks category, not trackInventory
next_action: Fix applied and verified

## Symptoms

expected: Ingredients tab shows only direct/leaf ingredients (Marshmallow, Butter, Milk Powder, Cacao Powder)
actual: Shows production components (Outer - Marshmallow, Filling - Pistachio, Jumbo, Regular) with "Non-Production Component" badge
errors: None - logic/filtering bug
reproduction: Inventory Manager -> Ingredients tab
started: Unknown

## Eliminated

## Evidence

- timestamp: 2026-02-21T00:00:10Z
  checked: InventoryManager.tsx line 49-54
  found: effectiveCategoryFilter maps "ingredients" tab to "production" category
  implication: All componentTypes with category=production shown, including balls

- timestamp: 2026-02-21T00:00:20Z
  checked: convex/inventory/queries.ts getInventoryReport (line 242-247)
  found: Query intentionally fetches ALL production components regardless of trackInventory
  implication: Backend returns both balls (trackInventory=false) and ingredient-tracked items (trackInventory=true)

- timestamp: 2026-02-21T00:00:30Z
  checked: componentTypes schema and ComponentRow.tsx
  found: isIngredient = category==="production" && trackInventory===true; isProductionBall = category==="production" && !trackInventory
  implication: The distinction exists in the codebase but InventoryManager.tsx never uses it for filtering

- timestamp: 2026-02-21T00:00:40Z
  checked: InventoryManager.tsx filter logic (line 77-79)
  found: Only checks row.component.category === effectiveCategoryFilter, never checks trackInventory
  implication: This is the exact line causing the bug

## Resolution

root_cause: InventoryManager.tsx maps the "Ingredients" tab to effectiveCategoryFilter="production", then filters by row.component.category === "production". This matches ALL production componentTypes including production balls (Big Ball/Jumbo, Mid Ball/Regular) which have trackInventory=false. Only ingredient-linked production components (trackInventory=true) should appear in the Ingredients tab.

fix: Changed effectiveCategoryFilter to use a new "ingredients" value when the ingredients tab is selected. Updated the filter logic to check both category==="production" AND trackInventory===true when effectiveCategoryFilter==="ingredients", excluding production balls.

verification: TypeScript type-check passes. Full build succeeds. Logic verified by code review.

files_changed:
- src/pages/InventoryManager.tsx

---
status: diagnosed
phase: 20-production-ingredient-tracking-and-cogs
source: [20-01-SUMMARY.md, 20-02-SUMMARY.md, 20-03-SUMMARY.md, 20-04-SUMMARY.md, 20-05-SUMMARY.md, 20-06-SUMMARY.md]
started: 2026-02-17T14:00:00Z
updated: 2026-02-17T14:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Recipe Editor Modal dual interaction
expected: Clicking a production component row (e.g., Original Ball) opens the recipe editor modal with two sections: Sub-components and Ingredients. Clicking the separate Edit button opens the settings dialog (batch size, COGS mode, unit cost). The two interactions are distinct -- row = recipe, edit button = settings.
result: skipped
reason: Not tested — user testing surfaced higher-priority issues on other tests

### 2. Sub-component unit economics
expected: When adding a sub-component (e.g., Pistachio Filling) to Original Ball, the system should default the quantity to the leaf component's batch size (e.g., 25g) and show the cost will be calculated from the pistachio filling's unit cost. The measurement unit should match the leaf component's batch unit (e.g., grams), not require a separate unit selection. Changing qty to 50g should double the COGS contribution proportionally.
result: issue
reported: "when you add a sub-component just use the same measurement unit as the leaf component. e.g. filling pistachio's batch unit is grams, so just assume it's grams in the sub-components, and then we should just say okay we need 15 grams of pistachio for this original and it should just work out the unit economics of 15 grams of pistachio from the unit cost of the leaf component - and I'm not sure why it's unit cost and not batch-cost to be inputed? if it's the unit cost and we're looking at unit size then we don't need the batch size input at all, if that's the case just make sure we're capturing the unit of the batch alongside the batch size and unit cost of that batch i.e. filling pistachio batch size is 25 grams and unit is 4934 idr per unit. If I say I want to add that pistachio as a sub-component of original - then it should default to 25 grams and 4934 cogs added to the original component's COGS, if I then say actually we need 50 grams of pistachio for this original ball - then I need to put 50 grams and the cogs will double naturally"
severity: major

### 3. Ingredient unit type includes Grams (g) and defaults to it
expected: When creating or editing an ingredient (or a componentType with category=production for ingredient tracking), the unit type dropdown includes "Grams (g)" as an option and it is selected by default. Other unit options (kg, ml, etc.) are also available.
result: issue
reported: "Have Grams (g) as well in the unit type for new ingredients - make it default as grams (g)"
severity: major

### 4. Receive ingredient stock goes to Production tab
expected: When receiving new stock for an ingredient (e.g., Marshmallow), the system shows a way to categorize it as an ingredient/production item vs packaging. The received stock appears in the Production tab of Inventory Manager, not the Packaging tab.
result: issue
reported: "there needs to be a way to receive new ingredients (that go into the production filter) vs the packaging filter, right now I just created a new stock type for marshmallow but it automatically gets put into the packaging inventory, we need a way to save it as an ingredient and not a packaging inventory"
severity: major

### 5. Auto-COGS includes sub-component costs
expected: When COGS mode is set to "calculated" on a production component (e.g., Original Ball), the auto-calculated COGS should include BOTH: (a) direct ingredient costs added in the Ingredients section, AND (b) COGS from sub-components added in the Sub-components section. The total COGS preview should reflect the full hierarchy, not just direct ingredients.
result: issue
reported: "Not sure why but the auto COGS isn't working with the integrated COGS from other components (leaf components) - the direct ingredient cogs are added to calculated cogs, but the sub-component COGS are not added"
severity: major

### 6. Ingredient type badges in Production tab
expected: In Inventory Manager, navigate to the Production tab. Components with trackInventory=true should show a green "Ingredient" badge. Regular production components (balls) without inventory tracking should show a blue "Ball" badge. Both types appear in the same Production tab flat list.
result: issue
reported: "production components are not in inventory at all, they're in my production page components/production; ingredients i also cannot find"
severity: major

### 7. Negative stock display
expected: When an ingredient has negative stock (more consumed than received), its row in the Inventory Production tab shows a red background, red text for the stock value, and an AlertTriangle warning icon. This takes visual priority over any low-stock styling.
result: skipped
reason: Cannot test — ingredients not visible in Inventory Production tab (blocked by Test 6 issue)

### 8. Materials Check panel + Dispatch Planner
expected: In the Dispatch Planner page, below the main grid, there is a "Materials Check" panel showing day-by-day packaging and ingredient shortages with an Ingredient Resupply Forecast table. Save plan works without errors. GoFood channel is editable.
result: issue
reported: "i can't save plans — ArgumentValidationError: Found ID from table dispatchConsignmentOutlets which does not match the table name in validator v.id('externalOutlets'). Also planned manual has too many products — I only want products currently in my Food slots of my MenuProduct POS, all other products are legacy and should not be shown; I should be able to toggle which products to show in settings, by default just what's in the food POS; direct sales only has 2 products right now original-single and original-triple, everything else should be hidden. I still cannot edit gofood at all. Also you can remove the calendar from K3Mart page — happy to have it all consolidated in dispatch planner. No more automated API stock-in/stock-out calls for now — I can do them manually on the k3mart cockpit based on the daily plans."
severity: blocker

## Summary

total: 8
passed: 0
issues: 6
pending: 0
skipped: 2

## Gaps

- truth: "When adding a sub-component, quantity uses leaf's batch unit (grams); COGS auto-calculated as (qty / leafBatchSize) * leafUnitCost; defaults to leaf's batch size qty"
  status: failed
  reason: "User reported: sub-components don't default to leaf unit/batch; confused about unit cost vs batch cost input; should just input grams and have cost calculated from pistachio's unit cost automatically; batch size 25g at 4934 IDR/unit should default as 25g contribution, doubling to 50g should double COGS"
  severity: major
  test: 2
  root_cause: "Two bugs in src/components/productionRecipes/SubComponentSection.tsx: (1) Line 256 display cost formula is wrong — uses childUnitCostIdr * quantityPerUnit but should be (quantityPerUnit / childBatchSize) * childUnitCostIdr; (2) Lines 358-373 add form has free-text unit input with no auto-population from child's batchSizeUnit and no live COGS preview. Backend (addSubComponent mutation + traverseHierarchy) already supports the gram-based model correctly."
  artifacts:
    - path: "src/components/productionRecipes/SubComponentSection.tsx"
      issue: "Display cost formula missing /batchSize divisor; add form lacks unit auto-population and COGS preview"
  missing:
    - "Auto-set unit field from selected child's batchSizeUnit when child is chosen in dropdown"
    - "Live cost preview: (qty / child.batchSize) * child.unitCostIdr"
    - "Fix display row formula: (sc.quantityPerUnit / sc.childBatchSize) * sc.childUnitCostIdr (guard batchSize > 0)"
    - "Label quantity input as 'Qty (in [child batchSizeUnit])'"

- truth: "Ingredient unit type dropdown includes Grams (g) and defaults to grams"
  status: failed
  reason: "User reported: Have Grams (g) as well in the unit type for new ingredients - make it default as grams (g)"
  severity: major
  test: 3
  root_cause: |
    Two surfaces: (1) IngredientsManager.tsx line 21 — UNITS array has 'g' but label is just 'g' not 'Grams (g)'; default is already 'g' here so functionally correct but visually unclear. (2) ComponentTypeDialog.tsx lines 47/63/182-189 — unit field defaults to "pcs" and is a free-text Input with no dropdown. When creating a production-category componentType, user must know to type 'g' manually. No smart default for production category.
  artifacts:
    - path: "src/pages/IngredientsManager.tsx"
      issue: "Unit labels abbreviated (g, kg, ml) — should be labeled 'Grams (g)', 'Kilograms (kg)', etc."
    - path: "src/components/inventory/ComponentTypeDialog.tsx"
      issue: "Unit field is free-text Input defaulting to 'pcs'; needs Select dropdown defaulting to 'g' when category=production"
  missing:
    - "IngredientsManager: rename unit labels to include full word (Grams (g), Kilograms (kg), etc.)"
    - "ComponentTypeDialog: replace unit Input with Select; default to 'g' when category=production, 'pcs' when category=packaging"

- truth: "Receiving ingredient stock categorizes it as production/ingredient, appears in Production tab not Packaging; defaults to Kitchen location"
  status: failed
  reason: "User reported: new stock type for marshmallow automatically goes into packaging inventory; needs a way to save as ingredient not packaging inventory; ingredients should default to Kitchen location and Production section of inventory"
  severity: major
  test: 4
  root_cause: |
    Frontend: src/components/inventory/ReceiveStockDialog.tsx line 66 has `const [newComponentCategory] = useState<"packaging">("packaging")` — hardcoded with no setter, never changeable. UI even labels it "Create New Packaging Component". Unit options shown are packaging-only (pcs, box, sheet, roll).
    Backend: convex/inventory/mutations.ts createComponentAndReceiveStock lines 24-28 validates category as packaging variants only, line 73 hardcodes `const category: "packaging" = "packaging"`. Would reject a production category even if passed.
  artifacts:
    - path: "src/components/inventory/ReceiveStockDialog.tsx"
      issue: "newComponentCategory hardcoded to 'packaging' with no setter; no category selector UI; packaging-only unit options; no Kitchen location default for production"
    - path: "convex/inventory/mutations.ts"
      issue: "createComponentAndReceiveStock validator only accepts packaging categories; hardcodes category='packaging' on line 73"
  missing:
    - "Add category selector (Packaging / Ingredient) to ReceiveStockDialog create-new form"
    - "Show weight-based unit options (g, kg, ml, l) when category=production"
    - "Default location to Kitchen when category=production"
    - "Extend createComponentAndReceiveStock to accept category=production; use passed value instead of hardcoded 'packaging'"

- truth: "Auto-COGS in calculated mode includes both direct ingredient costs AND sub-component hierarchy COGS"
  status: failed
  reason: "User reported: direct ingredient COGS are added but sub-component COGS are not added to calculated COGS"
  severity: major
  test: 5
  root_cause: "convex/lib/hierarchyTraversal.ts traverseHierarchy (lines 136-163) only collects leaf ingredients from productionComponentIngredients. When a child sub-component has no direct ingredients of its own (uses manual unitCostIdr / cachedCalculatedCogs instead), traverseHierarchy returns [] for that branch — the child's stored cost is never added. The function needs a 'cost leaf' branch: if a child has no ingredient rows AND no sub-component links, synthesize cost using child.unitCostIdr * childUnits."
  artifacts:
    - path: "convex/lib/hierarchyTraversal.ts"
      issue: "traverseHierarchy returns nothing for manual-cost child components; needs cost-leaf fallback"
    - path: "convex/productionRecipes/mutations.ts"
      issue: "recalculateComponentCogs may need adjustment if traversal model changes"
  missing:
    - "In traverseHierarchy: after computing childUnits, check if child has no ingredients AND no sub-links (or cogsMode=manual); if so, push synthetic cost entry using child.unitCostIdr * childUnits or child.cachedCalculatedCogs * childUnits"

- truth: "Ingredients with trackInventory=true appear in Inventory Manager Production tab with green Ingredient badge"
  status: failed
  reason: "User reported: production components are not in inventory at all, they're in the production page; ingredients also cannot be found in Inventory"
  severity: major
  test: 6
  root_cause: |
    The backend mutation createIngredientComponentType (convex/componentTypes/mutations.ts lines 355-430) exists and correctly creates a production-category componentType with trackInventory=true, linked to an ingredient. However, it is NEVER called from any frontend page — no .tsx file in src/ imports or uses it. No hook is exported for it. The Inventory Manager query (getInventoryReport) and page rendering are both correct and would display ingredients if they existed. The gap is purely missing frontend UI to trigger the mutation.
  artifacts:
    - path: "src/pages/IngredientsManager.tsx"
      issue: "No 'Enable Inventory Tracking' button per ingredient row; createIngredientComponentType never triggered"
    - path: "src/hooks/convex/index.ts"
      issue: "No exported hook for createIngredientComponentType"
  missing:
    - "Add 'Enable Inventory Tracking' action to each ingredient row in IngredientsManager"
    - "Export useConvexCreateIngredientComponentType hook from hooks barrel"
    - "After enabling, optionally prompt to receive first stock batch (ReceiveStockDialog pre-selected to new componentType, Kitchen location pre-set)"
    - "Show badge on ingredients that already have ingredientComponentTypeId set"

- truth: "savePlanCell mutation works; only active Food POS products shown in Planned Manual with per-product settings toggle; GoFood channel is editable; Dispatch Planner is the single source of planning (WeeklyPlannerGrid removed from K3MartCockpit)"
  status: failed
  reason: "User reported: (1) save fails with outletId table mismatch; (2) planned manual shows legacy products; (3) GoFood not editable; (4) K3Mart cockpit weekly planner should be removed — dispatch planner is single source"
  severity: blocker
  test: 8
  root_cause: |
    (1) BLOCKER — schema.ts line 1289 defines dispatchPlans.outletId as v.id('externalOutlets') but consignment outlets pass IDs from dispatchConsignmentOutlets table. savePlanCell mutation validator (mutations.ts line 82) also uses v.id('externalOutlets'). Needs union type: v.union(v.id('externalOutlets'), v.id('dispatchConsignmentOutlets')).
    (2) GoFood not editable — backend code sets isEditable:true for non-k3mart channels (correct). Likely root cause: no externalOutlets records with source='gobiz' and isActive=true in the database. If outlets don't exist in DB, GoFood section renders nothing (0 outlets → hidden). Need to verify/seed gobiz outlet records.
    (3) Planned Manual filter — queries.ts lines 147-156 builds menuProductMap with only isActive=true + non-packaging filter. No posSlot filter applied. Shows all legacy active products. No per-product visibility toggle exists anywhere in schema or code.
    (4) K3Mart WeeklyPlannerGrid (K3MartCockpit.tsx lines 525-539) is the weekly planner that makes confirmDayPlan stock API calls. Remove this block; dispatch planner is single source. State plannerExpanded (line 97) and related imports also need cleanup.
  artifacts:
    - path: "convex/schema.ts"
      issue: "dispatchPlans.outletId typed as v.id('externalOutlets') — change to v.union(v.id('externalOutlets'), v.id('dispatchConsignmentOutlets'))"
    - path: "convex/dispatchPlanner/mutations.ts"
      issue: "savePlanCell validator outletId uses v.id('externalOutlets') — change to match schema union type; removeConsignmentOutlet can remove 'as unknown as string' cast"
    - path: "convex/dispatchPlanner/queries.ts"
      issue: "menuProductMap (lines 147-156) needs posSlot filter for Planned Manual; verify gobiz externalOutlets records exist"
    - path: "src/pages/K3MartCockpit.tsx"
      issue: "Remove WeeklyPlannerGrid block (lines 525-539), plannerExpanded state (line 97), Calendar/ChevronDown imports"
  missing:
    - "Union type for outletId in schema + mutation validator"
    - "Seed or verify externalOutlets records with source='gobiz' isActive=true"
    - "Filter menuProductMap to posSlot-assigned products only (or new dispatchVisible toggle on menuProducts)"
    - "Per-product show/hide toggle in dispatch planner settings UI (new schema field or table)"
    - "Remove WeeklyPlannerGrid from K3MartCockpit"

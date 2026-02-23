---
status: resolved
phase: 24-ingredient-simulation-id-linking
source: 24-01-PLAN.md, 24-02-PLAN.md, 24-03-PLAN.md, 24-04-PLAN.md
started: 2026-02-23T16:00:00Z
updated: 2026-02-23T18:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Capacity tab removed from Settings
expected: In the Dispatch Planner page, open the Settings dialog (gear icon). The dialog should have only 2 tabs: "Channels" and "Outlets". There should be no "Capacity" tab.
result: pass

### 2. Unlinked ingredients warning in Materials Check
expected: In the Dispatch Planner, run the Materials Check simulation. If any ingredients have no linked inventory componentType, an amber warning banner should appear listing the unlinked ingredient names with a message like "N ingredients not linked to inventory tracking — forecasts may be incomplete."
result: pass

### 3. Link ingredient to inventory tracker (Ingredients Manager)
expected: Go to Ingredients Manager. Ingredients without a linked componentType should show an amber "Unlinked" badge and a "Link" button. Clicking "Link" opens a picker showing available tracked production componentTypes. Selecting one and confirming should link the ingredient (badge changes to "Tracked").
result: issue
reported: "few issues can't save ingredient when editing it in the ingredients page- also when you track an ingredient in inventory you cannot undo it; also you cannot adjust down finished product inventory for wastage/QA/testing/freebies — need Adjust button per inventory row with modal for reason categories (wastage, free-trial, manual adjustment) plus freetext"
severity: major

### 4. Save targets for kitchen button (Dispatch Planner)
expected: In the Dispatch Planner weekly view, each day column should have a "Save to Kitchen" button. The button should be disabled for days with no dispatch plan data. For days with plan data, clicking the button should show a success toast confirming the targets were saved.
result: issue
reported: "Rename to 'Planner'; days should auto-adjust so today is always the second column (e.g., today Mon Feb 23 → first column is Sun Feb 22); arrows +/- 7 days keep same day alignment; editing any cell gives 'Failed to save plan' error; plan should NOT save on blur — only save on explicit button click because it impacts other parts of the system"
severity: major

### 5. Kitchen view shows "from Restock Planner" badge
expected: After saving targets from the Dispatch Planner (test 4), navigate to the Kitchen View for that same date. The Production Targets bar should show a "from Restock Planner" badge indicating the targets originated from the Restock Planner, not manual entry.
result: issue
reported: "Badge shows correctly ('from Restock Planner' visible). BUT only custom-added dispatch plan entries (Other Consignment) were pushed to kitchen — Direct Sales orders (1 single + 4 triples = 6 products) were NOT included. Also Total row shows 706 products but doesn't show ball count — triples have 3 balls each so actual balls = 1113. Need separate 'Balls' total row in Planner table showing actual ball production needed."
severity: major

### 6. Manager override replaces Restock Planner badge
expected: On the Kitchen View for a date with a "from Restock Planner" badge, open the Manager Target Settings and save new targets manually. After saving, the "from Restock Planner" badge should disappear (source is now "manual").
result: pass

## Summary

total: 6
passed: 3
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "Admin can link/unlink ingredients to inventory componentTypes and edit ingredients successfully"
  status: resolved
  reason: "User reported: can't save ingredient when editing; can't undo tracking; can't adjust down finished product inventory for wastage/QA/testing/freebies — need Adjust button per inventory row with modal for reason categories (wastage, free-trial, manual adjustment) plus freetext"
  severity: major
  test: 3
  root_cause: "3 sub-issues: (A) Ingredient save has double-toast bug — onUpdate callback in IngredientsManager.tsx:226 doesn't return promise, so EntityManager fires success toast prematurely while hook fires second toast. (B) No unlinkIngredientFromComponentType mutation exists; UI shows only 'Tracked' badge with no unlink option. (C) Backend adjustStock mutation exists in productInventory/mutations.ts:97 but FinishedGoodsTab.tsx only renders Move/Receive buttons — no Adjust button or FGAdjustDialog."
  artifacts:
    - path: "src/pages/IngredientsManager.tsx"
      issue: "Line 226: onUpdate doesn't return mutation promise; line 160-172: no unlink UI for tracked ingredients"
    - path: "convex/ingredients/mutations.ts"
      issue: "No unlinkIngredientFromComponentType mutation"
    - path: "src/components/inventory/FinishedGoodsTab.tsx"
      issue: "Lines 296, 500: no Adjust button in ProductGroupedView or LocationGroupedView"
  missing:
    - "Add return to onUpdate callback in IngredientsManager.tsx"
    - "Add unlinkIngredientFromComponentType mutation (patch ingredientComponentTypeId to undefined)"
    - "Add Untrack button next to Tracked badge in IngredientsManager"
    - "Create FGAdjustDialog component with reason categories (Wastage, QC Sample, Freebie, Manual Correction) + freetext"
    - "Wire Adjust button into FinishedGoodsTab both views"
  debug_session: ".planning/debug/phase-24-test3-ingredients.md"

- truth: "Planner grid cells are editable and Save to Kitchen button works per day"
  status: resolved
  reason: "User reported: editing any cell gives 'Failed to save plan' error; plan saves on blur but should only save on button click; page should be renamed to 'Planner'; date columns should auto-adjust so today is always the second column; arrows navigate +/- 7 days keeping same day alignment; Save to Kitchen buttons are misaligned with grid columns and should be at the top of each column, not the bottom"
  severity: major
  test: 4
  root_cause: "6 sub-issues: (A) Critical: 'direct-manual' hardcoded string ID passed as outletId to mutation that validates Id<externalOutlets> — Convex rejects it. (B) PlannerCell.tsx handleBlur calls performSave on every focus-loss — should only save on explicit button click. (C) Page name 'Restock' in Header.tsx:88 and 'Restock Planner' in DispatchPlanner.tsx needs renaming to 'Planner'. (D) getCurrentMonday() always anchors to Monday — need getYesterday() so today is always column 2. (E) WeekNav 'Back to Today' also calls getCurrentMonday(). (F) Save to Kitchen buttons rendered outside grid structure — no column alignment."
  artifacts:
    - path: "convex/dispatchPlanner/queries.ts"
      issue: "assembleDirectChannel line 382: id='direct-manual' causes validator rejection"
    - path: "src/pages/DispatchPlanner.tsx"
      issue: "handleSaveCell line 169: passes 'direct-manual' as outletId; getCurrentMonday() line 49-70 wrong anchor"
    - path: "src/components/dispatchPlanner/PlannerCell.tsx"
      issue: "handleBlur lines 86-91: auto-saves on blur instead of button click"
    - path: "src/components/dispatchPlanner/PlannerGrid.tsx"
      issue: "Save to Kitchen buttons not in grid column structure"
    - path: "src/components/dispatchPlanner/WeekNav.tsx"
      issue: "Back to Today uses getCurrentMonday() — should use getYesterday()"
    - path: "src/components/layout/Header.tsx"
      issue: "Line 88: label 'Restock' → 'Planner'"
  missing:
    - "Fix handleSaveCell to pass outletId: undefined for direct-manual"
    - "Fix mutation direct channel branch for manual plans (no orderId/outletId)"
    - "Remove performSave from handleBlur; add explicit Save button"
    - "Rename page to Planner in Header.tsx and DispatchPlanner.tsx"
    - "Replace getCurrentMonday() with getYesterday() for startDate"
    - "Update WeekNav Back to Today to use same getYesterday()"
    - "Move Save to Kitchen buttons into PlannerGrid column structure at top"
  debug_session: ".planning/debug/phase-24-test4-planner-grid.md"

- truth: "Save to Kitchen pushes complete daily ball totals including Direct Sales orders"
  status: resolved
  reason: "User reported: only custom dispatch plan entries pushed to kitchen, Direct Sales orders excluded; Total row shows product count (706) not ball count — triples have 3 balls each; need separate Balls total row in Planner table showing actual ball production needed (e.g., 1113 = 1 single + 12 triple-balls from direct sales + 500 singles + 600 triple-balls from Legato Tamtem)"
  severity: major
  test: 5
  root_cause: "3 sub-issues: (A) getBallTotalsForDispatchPlanDate (queries.ts:1020) only reads dispatchPlans table — Direct Sales from orders/orderItems table never mirrored there, silently dropped. (B) dailyTotals in getUnifiedWeeklyPlan accumulates raw product qty without BOM multiplication — 1 Triple = 1 in total, not 3 balls. (C) PlannerGrid has one footer row showing product totals; no dailyBallTotals field exists in UnifiedWeeklyPlanData."
  artifacts:
    - path: "convex/dispatchPlanner/queries.ts"
      issue: "getBallTotalsForDispatchPlanDate line 1020: only queries dispatchPlans, missing orders/orderItems"
    - path: "convex/dispatchPlanner/queries.ts"
      issue: "getUnifiedWeeklyPlan dailyTotals: no BOM expansion, counts products not balls"
    - path: "src/components/dispatchPlanner/PlannerGrid.tsx"
      issue: "Lines 143-151, 277-299: single footer row shows product totals, no Balls row"
  missing:
    - "Add orders/orderItems pass to getBallTotalsForDispatchPlanDate for Direct Sales"
    - "Add dailyBallTotals to getUnifiedWeeklyPlan return via BOM expansion"
    - "Add Balls footer row to PlannerGrid using dailyBallTotals"
  debug_session: ".planning/debug/phase-24-test5-save-to-kitchen.md"

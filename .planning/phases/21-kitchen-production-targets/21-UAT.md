---
status: diagnosed
phase: 21-kitchen-production-targets
source: [21-01-SUMMARY.md, 21-02-SUMMARY.md, 21-03-SUMMARY.md, 21-04-SUMMARY.md, 21-05-SUMMARY.md]
started: 2026-02-22T17:00:00Z
updated: 2026-02-23T07:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Production Targets Bar
expected: Open the Kitchen page. At the top, you should see two stat cards: "Original" (45g/MID_BALL) and "Jumbo" (80g/BIG_BALL) showing today's production targets. Below the cards, packaging breakdown badges display quantities per product type. Numbers show even if targets are zero — they never hide.
result: issue
reported: "when you try to override today's targets - the targets are flipped - jumbo balls override into original balls and original balls link to jumbo balls; product numbers only appear when i override default daily targets"
severity: major

### 2. End-of-Shift Form — Input Step
expected: Below the targets bar, there is an End-of-Shift form. You can enter a produced quantity for each product. There is also a toggle to expand a waste section (waste is hidden by default). When you expand waste, you can enter a waste amount and select a reason per product.
result: issue
reported: "the default appears to be 200 jumbo balls, this should be 200 original balls - split into 110 original-single and 30 original-triple - but even when i save the defaults in the manager settings it does not update the targets nor is it correct (200 jumbos as default) - form shows No products in today's target plan"
severity: major

### 3. End-of-Shift Form — Review Step
expected: After filling in quantities and clicking Submit (or equivalent), a review screen appears showing a summary of everything you entered (produced + waste per product), an inventory note, and two buttons: Confirm and Back. Clicking Back returns to the input form.
result: skipped
reason: Can't test — End-of-Shift form shows "No products" because default packaging mix isn't applying (gap 4)

### 4. End-of-Shift Form — Success Step
expected: After clicking Confirm on the review screen, a success screen appears with a green checkmark and a text summary of what was produced/wasted. Clicking Done resets back to the empty input form.
result: skipped
reason: Can't test — blocked by same default packaging mix issue (gap 4)

### 5. Today's Shift Records
expected: After submitting a shift, a compact card appears below the form showing the submitter's name, time submitted, and produced/waste totals for that shift. Multiple submissions in the same day appear as separate cards.
result: skipped
reason: Can't test — no shifts submittable due to "No products" issue (gap 4)

### 6. Collapsible Orders Section
expected: The Orders section is collapsed by default (not visible on page load). There is a toggle/button with a count badge showing how many orders there are. Clicking it expands to show the order list (DueDateOrderList). Clicking again collapses it.
result: pass

### 7. Manager Target Settings — Default Config
expected: When logged in as manager or admin, a Manager Settings section is visible at the bottom of the Kitchen page. It contains a form to set: Max Target, BigBall (Jumbo) target, MidBall (Original) target, and a packaging mix table with add/remove rows. Submitting saves the defaults.
result: issue
reported: "the packaging mix shows the entire list of products - it should only show the POS food products here and any product currently being ordered in the order sheet that we need to make"
severity: major

### 8. Manager Daily Override
expected: In the Manager Settings section, there is a "Today's Override" panel. Manager can enter override ball targets for today only and click Apply. Once set, an "Active Override" badge is visible. There is also a Clear button to remove the override and fall back to dispatch plan / defaults.
result: issue
reported: "when you try to override today's targets - the targets are flipped - jumbo balls override into original balls and original balls link to jumbo balls"
severity: major

### 9. Manager Shift History
expected: In the Manager Settings section, a Shift History panel shows records from the last 7 days by default, grouped by date with product-name labels and totals. There is a date range filter. Each record has an Edit button (visible to managers only).
result: pass

### 10. Manager Edit Shift Record
expected: Clicking Edit on a shift record opens a dialog pre-populated with the existing produced and waste values. After editing, clicking Next shows an inventory impact summary (what will be adjusted). Clicking Confirm saves the changes and closes the dialog.
result: skipped
reason: No shifts submitted to edit (blocked by gap 4)

## Summary

total: 10
passed: 2
issues: 5
pending: 0
skipped: 4

## Gaps

- truth: "Ball targets bar correctly shows Override values: bigBallOverride → Jumbo (80g), midBallOverride → Original (45g)"
  status: failed
  reason: "User reported: when you try to override today's targets - the targets are flipped - jumbo balls override into original balls and original balls link to jumbo balls"
  severity: major
  test: 1
  root_cause: "ManagerTargetSettings.tsx form field bindings are inverted in both Default and Override panels — 'Original balls' label is bound to bigBall state (Jumbo slot) and 'Jumbo balls' label is bound to midBall state (Original slot). Backend and display are correct; only the form bindings are wrong."
  artifacts:
    - path: "src/components/kitchen/ManagerTargetSettings.tsx"
      issue: "Default form: 'Original balls' input bound to bigBallDefault/setBigBallDefault (should be midBallDefault); 'Jumbo balls' bound to midBallDefault (should be bigBallDefault). Override form: same inversion with bigBallOverride/midBallOverride state and placeholders."
  missing:
    - "Swap value/onChange/placeholder bindings in Default Targets form (lines ~296-317)"
    - "Swap value/onChange/placeholder bindings in Override form (lines ~373-395)"
  debug_session: ""

- truth: "Packaging breakdown badges (product quantities) display from dispatch plan or defaults — not only when override is active"
  status: failed
  reason: "User reported: product numbers only appear when i override default daily targets"
  severity: major
  test: 1
  root_cause: "getKitchenTargetsForDate defaults branch never reached when any dispatchPlans entry exists for today (even with empty BOM). Also getConfig strips defaultPackagingMix from return so the form can't show saved mix. Two-part fix needed."
  artifacts:
    - path: "convex/kitchenConfig/queries.ts"
      issue: "Priority 2 (dispatch plan) returns early even if packagingBreakdown is empty after BOM traversal — never falls through to defaultPackagingMix. Also getConfig omits defaultPackagingMix from returned fields."
    - path: "src/components/kitchen/ManagerTargetSettings.tsx"
      issue: "KitchenConfig interface lacks defaultPackagingMix; useEffect never populates the editor from saved config."
  missing:
    - "getConfig: add defaultPackagingMix to return shape and hardcoded-defaults path"
    - "getKitchenTargetsForDate: fall through to defaults for packagingBreakdown when dispatch plan BOM traversal yields empty breakdown"
    - "ManagerTargetSettings: add defaultPackagingMix to KitchenConfig interface; populate editor in useEffect from config"
  debug_session: ""

- truth: "Default Packaging Mix product dropdown shows only POS food products + products currently in active orders"
  status: failed
  reason: "User reported: the packaging mix shows the entire list of products - it should only show the POS food products here and any product currently being ordered in the order sheet that we need to make"
  severity: major
  test: 7
  root_cause: "ManagerTargetSettings.tsx line 149 queries api.menuProducts.queries.list with no filter, returning all active products including non-food items (Brochure etc). menuProducts table has productType field ('food'/'packaging'/undefined) that distinguishes food products."
  artifacts:
    - path: "src/components/kitchen/ManagerTargetSettings.tsx"
      issue: "Line 149: useQuery(api.menuProducts.queries.list, { activeOnly: true }) — no productType filter. Line 267: safeMenuProducts maps without filtering."
  missing:
    - "Filter safeMenuProducts to productType === 'food' only (Option A: client-side filter on line 267)"
  debug_session: ".planning/debug/packaging-mix-dropdown-all-products.md"

- truth: "Saving default packaging mix populates End-of-Shift form with those products and targets bar reflects saved bigBall/midBall defaults correctly"
  status: failed
  reason: "User reported: the default appears to be 200 jumbo balls (should be 200 original) - even when saving defaults it does not update the targets; form shows 'No products in today's target plan' despite packaging mix being saved with correct sonner confirmation"
  severity: major
  test: 2
  root_cause: "Same two-part root cause as gap 2: (1) getConfig omits defaultPackagingMix so form always shows empty and manager sees stale state; (2) dispatch plan short-circuits defaults branch. The bigBall/midBall display issue is the same form binding inversion as gap 1."
  artifacts:
    - path: "convex/kitchenConfig/queries.ts"
      issue: "getConfig handler explicitly omits defaultPackagingMix from return object (lines 36-44)"
    - path: "src/components/kitchen/ManagerTargetSettings.tsx"
      issue: "useEffect dependency is [config?._id] not [config]; defaultPackagingMix never populated from saved config"
  missing:
    - "Same fixes as gap 2 (getConfig return + useEffect population)"
  debug_session: ".planning/debug/default-packaging-mix-not-flowing-to-ui.md"

- truth: "Kitchen orders section is a read-only summary view (3 columns: Payment Received / Being Prepared / Awaiting Delivery) — no interactive workflow controls; order management happens in the Order Management kanban only"
  status: failed
  reason: "User reported: you can still interact with the order panels to complete orders — the order summary should now just be a summary view, not used as a workflow check or status update; simplify to the 3-column payment/preparation filter shown in screenshot"
  severity: major
  test: 8
  root_cause: "New requirement identified during UAT — DueDateOrderList not replaced with read-only 3-column summary. Feature was not in original phase 21 plan."
  artifacts:
    - path: "src/pages/KitchenViewV2.tsx"
      issue: "DueDateOrderList still rendered in collapsible orders section with interactive controls"
  missing:
    - "New read-only 3-column order summary component (Payment Received / Being Prepared / Awaiting Delivery)"
    - "Remove DueDateOrderList from kitchen collapsible section"
  debug_session: ""

- truth: "Kitchen targets has a Jumbo toggle: when off, only Original ball targets shown, packaging mix filtered to original-only POS food products (Single 45g, Triple 135g)"
  status: failed
  reason: "User requested: we should have a setting to show jumbos/originals in the kitchen targets — toggleable; if jumbo is toggled off all targets are original balls only and only original-ball products from POS food can be added (currently only Single and Triple fit)"
  severity: major
  test: 7
  root_cause: "New requirement identified during UAT — not in original phase 21 plan. kitchenConfig needs a showJumbo boolean toggle; ProductionTargetsBar and EndOfShiftForm must respect it."
  artifacts:
    - path: "convex/schema.ts"
      issue: "kitchenConfig table missing showJumbo boolean field"
    - path: "src/components/kitchen/ManagerTargetSettings.tsx"
      issue: "No toggle UI for showJumbo setting"
  missing:
    - "Add showJumbo boolean to kitchenConfig schema and updateConfig mutation"
    - "ManagerTargetSettings: add toggle to enable/disable Jumbo visibility"
    - "ProductionTargetsBar: hide Jumbo card when showJumbo=false"
    - "EndOfShiftForm/PackagingMixEditor: filter to Original-only products when showJumbo=false"
  debug_session: ""

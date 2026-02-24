---
status: complete
phase: 21-kitchen-production-targets
source: [21-06-SUMMARY.md, 21-07-SUMMARY.md]
started: 2026-02-23T08:45:00Z
updated: 2026-02-23T09:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Ball Targets — No Override Active
expected: Open the Kitchen page (no daily override set). The targets bar shows the Original Balls (45g) stat card and the Jumbo Balls (80g) stat card. Ball counts come from the dispatch plan's BOM traversal, or fall back to the default targets configured in Manager Settings. Packaging breakdown badges appear below the stat cards (not empty) as long as a default packaging mix is saved — you should not need to set an override to see them.
result: issue
reported: "pass - but the targets should also be displayed next to the end of shift inputs so we can quickly compare how many was produced vs target"
severity: major

### 2. Override — Correct Ball Mapping
expected: In Manager Settings → Today's Override, enter a number in "Jumbo balls (80g)" and a different number in "Original balls (45g)" and click Apply. The targets bar should show the exact Jumbo number in the Jumbo (80g) card and the exact Original number in the Original (45g) card — not swapped.
result: issue
reported: "pass - the packaging breakdowns have now disappeared - we should have the override today's targets for specific product mix as well (linked to how many balls are in the override targets as the max available) - similar to how we have default daily targets - I think the reality is we can combine the default daily targets with the override today's targets by just having a button that says 'save this as default daily targets' and another as 'apply override for today only' this way we don't have to have two different sections - also make the manager settings collapsable like other settings modals"
severity: major

### 3. Default Packaging Mix — Saved Mix Persists in Editor
expected: In Manager Settings, add 1–2 products to the Default Packaging Mix and click Save Defaults. Navigate away and return to the Kitchen page. Open Manager Settings — the same product rows should be pre-filled in the packaging mix editor (not blank). A confirmation toast should have appeared when saving.
result: issue
reported: "the products should sit inside each target's boxes so easier to differentiate between jumbo product targets and original product targets, also not sure why there is a max capacity daily target default when it should already be implicit in how many original and jumbo balls we want - that field is redundant, and we should be able to confirm if the packaging mix does not match the total targets for balls both original and jumbo - i.e. if the sub-totals for packaging mix does not match the default daily targets then there is an issue right? So what the flow should be is packaging mix is mandatory, and you set the default targets at the top; then you start applying the mix; there's a number that says 'xx balls left to allocate' based on the size of ball and how many we have allocated in the packaging mix (we should also flag what kind of food component and how many will be taken from each of the packages we're mixing (based on their BOM) - so the packaging mix would be the product name - the food product BOM tags and how many it'll take per product; the input for how many of that product is in the mix. then a sub total column for how many units will be taken by that mix; then there's a sub-total at the bottom for how many original balls left to allocate and how many jumbos left (if there are jumbo mix targets); once the mix is done - soft notification if it doesn't exactly match - the button should be 'Save mix as defaults' and 'Override mix to be target for today' - because the initial guidance was just a guidance, the mix is the source of truth for targets"
severity: major

### 4. Default Packaging Mix — Food Products Only
expected: In the Default Packaging Mix editor (Manager Settings), open the product dropdown to add a row. Only food-type POS products appear (e.g. Original Single, Original Triple, Jumbo). Non-food items like "Brochure" or packaging materials should NOT be in the list.
result: issue
reported: "pass but only filter for what's actually available for ordering in the Food POS list - currently only 3 are available so only show those three. Also indirect issue is we can't see the titles in the food POS boxes, you need to have the titles in a row above the tags"
severity: major

### 5. showJumbo Toggle — Hides Jumbo Stat Card
expected: In Manager Settings, find the "Show Jumbo (80g) targets" toggle. Turn it OFF and click Save Defaults. The targets bar on the kitchen page should switch from a 2-column layout (Original + Jumbo cards) to a 1-column layout showing only the Original Balls (45g) card. Jumbo card is completely hidden.
result: issue
reported: "pass - the jumbo target disappears - but please check if we should also disable the other mentions of jumbo e.g. if we already have jumbo size in the packaging mix - should that be greyed out and not included in the max capacity for the day? And end of shift should also remove all jumbo-based product production inputs. If there is a product that requires both jumbo and original balls (does not exist right now), we should flag that there are such cases and just allow the targets to disappear but still you can make them. Also - why only toggle for jumbo? Let's toggle all our available production components (jumbo and original)"
severity: major

### 6. showJumbo Toggle — Persists After Reload
expected: With the Jumbo toggle turned OFF (from test 5), reload or navigate away and return to the Kitchen page. The targets bar should still show only the Original card — the setting persisted in the database.
result: pass

### 7. Read-Only Order Summary — No Action Buttons
expected: Click the "View Today's Orders" toggle to expand the orders section. You should see 3 read-only columns: "Payment Received", "Being Prepared", "Awaiting Delivery". Order cards are informational only — there are NO Pack checkboxes, no "Mark Ready" buttons, no "Send Back" buttons, no action controls of any kind.
result: issue
reported: "Pass - also include the notes per order sheet UI - it's very useful. Also right now I have another issue with the jumbo target toggle - we have 20 jumbo size products below the 200 original balls because it's part of the default packaging mix; what actually should happen is if we disable the jumbo targets then we no longer have any jumbo targets — Jumbo Size should disappear from breakdown badges, End-of-Shift form inputs, and the packaging mix rows should be greyed out"
severity: major

### 8. End-of-Shift Form — Input Step
expected: Below the targets bar, there is an End-of-Shift form. You can enter a produced quantity for each product. There is also a toggle to expand a waste section (waste is hidden by default). When you expand waste, you can enter a waste amount and select a reason per product. Products from your saved default packaging mix appear as rows in the form.
result: pass

### 9. End-of-Shift Form — Review Step
expected: After filling in quantities and clicking Submit (or equivalent), a review screen appears showing a summary of everything you entered (produced + waste per product), an inventory note, and two buttons: Confirm and Back. Clicking Back returns to the input form.
result: issue
reported: "this summary should definitely have the target deltas - waste should also count towards the target - we just have to store it and review the trends for waste in reports to see the % of waste per shift evolution"
severity: major

### 10. End-of-Shift Form — Success Step
expected: After clicking Confirm on the review screen, a success screen appears with a green checkmark and a text summary of what was produced/wasted. Clicking Done resets back to the empty input form.
result: issue
reported: "pass - but call frontend designer to make this screen more easy to read, maybe use some kind of boxed list or just take the same summary view just add some ticks for the final number produced - and animate it from the submit button smoothly to tick all the productions"
severity: minor

### 11. Today's Shift Records
expected: After submitting a shift, a compact card appears below the form showing the submitter's name, time submitted, and produced/waste totals for that shift. Multiple submissions in the same day appear as separate cards.
result: issue
reported: "if you are a manager or above you should have the ability to update who the chef was in the submission shift - also have the 'chef' visible above the targets or next to the date - 'Shift for: [Pierre]' for instance - so we know who's actually owning this shift's outcomes, because while the manager may submit the shift the actual cook is different"
severity: major

### 12. Manager Edit Shift Record
expected: In Manager Settings → Shift History, find a submitted shift record and click Edit. A dialog opens pre-populated with the existing produced and waste values. After editing, clicking Next shows an inventory impact summary (what will be adjusted). Clicking Confirm saves the changes and closes the dialog.
result: pass

## Summary

total: 12
passed: 3
issues: 9
pending: 0
skipped: 0

## Gaps

- truth: "End-of-Shift form rows show target quantity alongside the product name so staff can compare produced vs target at a glance"
  status: failed
  reason: "User reported: pass - but the targets should also be displayed next to the end of shift inputs so we can quickly compare how many was produced vs target"
  severity: major
  test: 1
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Packaging breakdown badges remain visible on the targets bar when a daily override is active (override supplies its own product mix)"
  status: failed
  reason: "User reported: the packaging breakdowns have now disappeared when override is active"
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Manager Settings combines Default Daily Targets and Today's Override into a single unified form with two save actions: 'Save as Default Daily Targets' and 'Apply Override for Today Only'; packaging mix is part of the same form and is capped by the ball counts entered; Manager Settings section is collapsible"
  status: failed
  reason: "User reported: combine the default daily targets with the override today's targets into one form with 'save this as default daily targets' and 'apply override for today only' buttons — also make the manager settings collapsible like other settings modals"
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Packaging mix redesign: (1) Remove redundant Max Capacity field — ball counts (original + jumbo) are the ceiling; (2) Products grouped inside their respective ball-type stat card; (3) Each mix row shows product name + BOM food component tags + balls-per-unit + quantity input + subtotal balls consumed; (4) Running 'X original balls left to allocate' and 'X jumbo balls left to allocate' counters update as quantities are entered; (5) Soft warning if mix total doesn't match ball targets; (6) Buttons renamed to 'Save mix as defaults' and 'Override mix to be target for today'; (7) Packaging mix is mandatory — it IS the source of truth for targets, not just an allocation guide"
  status: failed
  reason: "User reported: the products should sit inside each target's boxes, max capacity field is redundant, packaging mix rows should show BOM component tags and subtotals, running 'balls left to allocate' counter per type, soft notification if totals don't match, buttons should be 'Save mix as defaults' and 'Override mix to be target for today', mix is the source of truth"
  severity: major
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Packaging mix product dropdown filters to only Food POS products that are currently active/available for ordering (not all food-type products)"
  status: failed
  reason: "User reported: only filter for what's actually available for ordering in the Food POS list - currently only 3 are available so only show those three"
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Food POS product cards display the product name in a row above the tags (Slot, Food, POS badges)"
  status: failed
  reason: "User reported: can't see the titles in the food POS boxes, you need to have the titles in a row above the tags"
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Production component toggles cover ALL ball types (Original and Jumbo independently); when a ball type is toggled off: (1) its stat card hides from targets bar; (2) packaging breakdown badges for products using that ball type are hidden; (3) packaging mix rows for products using that ball type are greyed out and excluded from capacity calculation; (4) End-of-Shift form hides input rows for products that exclusively use that ball type; (5) products requiring BOTH ball types show a flag/warning but remain editable; toggle is per-component not a single showJumbo boolean"
  status: failed
  reason: "User reported: toggle all available production components (jumbo and original); when jumbo is toggled off, jumbo products in packaging mix should be greyed out and excluded from max capacity; end of shift should remove jumbo-based product inputs; if a product needs both jumbo and original flag it but still allow production. Screenshot confirms Jumbo Size (80g) still appears in breakdown badges, End-of-Shift inputs, and packaging mix rows even with showJumbo=false"
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Shift records store a 'chef' field (the actual cook, separate from the submitter); managers can assign/update the chef on any shift submission; the kitchen page shows 'Shift for: [Chef Name]' above or next to the date in the targets bar so accountability is clear"
  status: failed
  reason: "User reported: managers should be able to update who the chef was in the submission shift; have the chef visible above the targets or next to the date as 'Shift for: [Pierre]' — the manager may submit the shift but the actual cook is different"
  severity: major
  test: 11
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Shift success screen uses boxed/card list layout matching the review summary style; each product row animates in with a checkmark tick sequentially (Framer Motion stagger from the Confirm button); waste rows shown separately with reasons; replaces current comma-separated inline text"
  status: failed
  reason: "User reported: make this screen more easy to read, use boxed list or same summary view with ticks for final number produced, animate it from submit button smoothly to tick all productions"
  severity: minor
  test: 10
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Shift review summary shows target delta per product (produced vs target, +/- variance); waste counts toward the target total (produced + waste = total made); waste is stored separately for trend reporting (% waste per shift over time)"
  status: failed
  reason: "User reported: this summary should definitely have the target deltas - waste should also count towards the target - store it and review trends for waste in reports to see % of waste per shift evolution"
  severity: major
  test: 9
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Read-only order summary cards display the order notes field so kitchen staff can see per-order notes without leaving the kitchen page"
  status: failed
  reason: "User reported: include the notes per order sheet UI — it's very useful"
  severity: major
  test: 7
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

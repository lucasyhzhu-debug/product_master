---
status: testing
phase: v1.9 (phases 67-69)
source: 67-01-SUMMARY.md, 67-02-SUMMARY.md, ROADMAP (68, 69 success criteria)
started: 2026-03-28T15:30:00Z
updated: 2026-03-28T15:30:00Z
---

## Current Test

number: 1
name: Daily Stock Count — Location selector and product grid
expected: |
  Navigate to /inventory/stock-count (via "Count Stock" button on Finished Goods tab).
  A location dropdown shows active storage locations. Selecting one loads a product grid
  showing product name, current system count, and an input for actual count.
awaiting: user response

## Tests

### 1. Daily Stock Count — Location selector and product grid
expected: Navigate to /inventory/stock-count. Location dropdown shows active locations. Selecting a location loads product grid with name, system count, actual count input, and "last counted" timestamps.
result: [pending]

### 2. Daily Stock Count — Delta and submit
expected: Entering an actual count different from system count shows a green/red delta. Submitting sends only changed rows. Toast shows "X updated, Y skipped." Large deltas (>50%) show amber warning.
result: [pending]

### 3. Bulk Price Update — Ingredients tab
expected: Navigate to /bulk-price-update (via Hub "Bulk Prices" link or Header → Bulk Prices). Ingredients tab shows a table of all ingredients with Volume, Price, Shipping columns. Editing a value highlights the row amber and shows live cost-per-unit preview. Clicking Save updates all changed rows.
result: [pending]

### 4. Bulk Price Update — Materials tab
expected: Switch to Materials tab. Same inline-edit grid for packaging materials. Changes are tracked separately from Ingredients. Save updates only material prices.
result: [pending]

### 5. Bulk Price Update — Navigation accessible
expected: "Bulk Prices" appears in the Header dropdown under Configurations (for manager/admin users). Clicking it navigates to the Bulk Price Update page.
result: [pending]

### 6. Kitchen Component Reporting — Component production entry
expected: On the Kitchen V2 end-of-shift form, a "Components Produced" section appears below "Balls Produced" (if kitchen components are enabled in Manager Settings). Each component has a gram input. Submitting records component production alongside ball production.
result: [pending]

### 7. Kitchen Component Reporting — Component waste
expected: A waste toggle in the Components section allows adding waste entries per component with reason (QA/Spoilage/Waste) and gram amount. Waste cannot exceed produced grams.
result: [pending]

### 8. Kitchen Component Reporting — Component-only shift
expected: A shift with ONLY component production (zero balls) can be submitted successfully. The validation message says "balls or components."
result: [pending]

### 9. Kitchen Component Reporting — Daily summary
expected: The Daily Summary widget shows a "Component Production" section with total grams per component and per-person attribution. Ball-only stats (Orders/Boxed/Stickers) are hidden when zero.
result: [pending]

### 10. Kitchen Component Reporting — Manager toggle
expected: In Manager Settings (target config), a "Kitchen Components" section shows toggle switches for each component. Toggling off a component hides it from the shift form. Requires clicking "Save as Default Daily Targets" to persist.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0

## Gaps

[none yet]

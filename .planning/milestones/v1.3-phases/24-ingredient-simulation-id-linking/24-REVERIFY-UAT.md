---
status: complete
phase: 24-ingredient-simulation-id-linking
source: 24-05-SUMMARY.md, 24-06-SUMMARY.md, 24-07-SUMMARY.md
started: 2026-02-23T18:00:00Z
updated: 2026-02-23T18:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Single toast on ingredient edit
expected: Go to Ingredients Manager and edit any ingredient (change the name or any field), then click Save. You should see exactly ONE success toast. Previously two toasts fired back-to-back.
result: pass
note: "User also reported: no discoverable navigation path to Ingredients Manager — needs link from Inventory ingredients tab or Config dropdown"

### 2. Untrack a tracked ingredient
expected: On Ingredients Manager, find an ingredient with a green "Tracked" badge. Next to the badge you should now see an "Untrack" button. Clicking it should show a Yes/No inline confirm. Clicking Yes should clear the link — the badge disappears and the "Link" button reappears.
result: issue
reported: "Untrack button works and clears the link. But the 'Link existing' dropdown still shows componentTypes already linked to other ingredients — e.g. Butter appears as an option even when it is linked. Dropdown should filter out componentTypes already assigned to another ingredient."
severity: major

### 3. Adjust button on Finished Goods inventory
expected: Go to Inventory Manager → Finished Goods tab. Each inventory row should now have an "Adjust" button (amber/yellow tint) alongside Move and Receive. Clicking Adjust opens a dialog with 4 reason categories: Wastage, QC/Testing Sample, Freebie/Gift, Manual Correction. There's a Deduct/Add toggle, a quantity field, and optional notes.
result: pass

### 4. Planner cell saves without error
expected: Go to the Planner page (formerly "Restock"). Click on any cell in the Direct Sales row (or any channel row), type a number, and press Enter. The cell should save successfully with a toast. Previously this gave a "Failed to save plan" error for Direct Sales cells.
result: pass

### 5. Cells don't auto-save on blur
expected: Click on a Planner cell to enter edit mode and type a new value. Then click away (tab out or click somewhere else) WITHOUT pressing Enter. The cell should revert to its original value. No save should happen. (The cell shows an amber ring when dirty — this should disappear on blur revert.)
result: issue
reported: "Blur not saving is unintuitive — user expects clicking away to commit the value, not discard it. Blur should save."
severity: major

### 6. Page labeled "Planner"
expected: Check the sidebar navigation and the page header on the Planner page. Both should show "Planner" — not "Restock" or "Restock Planner". Also check the browser tab title.
result: pass

### 7. Today is always the second column
expected: On the Planner page, today's date should always appear as the second column (yesterday is the first column). If you're testing this on Mon Feb 23, then column 1 = Sun Feb 22, column 2 = Mon Feb 23. The arrow buttons should navigate in +/-7 day increments preserving this alignment.
result: issue
reported: "'Back to Today' goes a week too far — first column shows today, second shows tomorrow. First column should be yesterday, second column should be today."
severity: major

### 8. Save to Kitchen button inside grid columns
expected: The Save to Kitchen button should appear at the top of each date column, INSIDE the grid structure (aligned with its column). Previously the buttons were below the grid and misaligned.
result: issue
reported: "Button is inside the grid columns now (alignment fixed) but button is too wide/large for the column. Needs smaller text, 2 lines is OK, use knife+fork (Utensils) icon instead of paper plane."
severity: minor

### 9. Save to Kitchen includes Direct Sales orders
expected: On a date that has both planned dispatch entries AND Direct Sales orders (confirmed, non-cancelled), click Save to Kitchen. Then go to Kitchen View for that date. The production targets should reflect the total including Direct Sales orders.
result: skipped

### 10. Balls footer row in Planner grid
expected: The Planner grid should show two footer rows: "Total" (product count) and "Balls" row (BOM-expanded ball count per day).
result: issue
reported: "Row labels should be 'Total Products' and 'Total Units (balls)' not 'Total' and 'Balls'. Also Capacity row shows 0/200 for most days — the 200 needs to pull from actual kitchen config defaults, not a hardcoded value. Also a hover tooltip appears to be blocked by an overlapping element."
severity: minor

## Summary

total: 10
passed: 4
issues: 5
pending: 0
skipped: 1

## Gaps

- truth: "Link existing dropdown only shows componentTypes not already linked to another ingredient"
  status: failed
  reason: "User reported: Butter appears in the Link dropdown even when it is already linked to the Butter ingredient — dropdown should exclude componentTypes that have ingredientComponentTypeId pointing to them from any other ingredient"
  severity: major
  test: 2
  artifacts: []
  missing: []

- truth: "Planner cells save on blur (clicking away commits the value)"
  status: failed
  reason: "User reported: blur does not save — must press Enter, which is unintuitive. Blur should save the cell value."
  severity: major
  test: 5
  artifacts: []
  missing: []

- truth: "Back to Today sets first column = yesterday, second column = today"
  status: failed
  reason: "User reported: Back to Today goes a week too far — shows today as first column, not second. startDate should be getYesterday() (today minus 1 day), not today."
  severity: major
  test: 7
  artifacts: []
  missing: []

- truth: "Save to Kitchen button fits column width with correct icon and compact label"
  status: failed
  reason: "User reported: button too wide for column, should be smaller text (2 lines OK), use Utensils (knife+fork) icon not paper plane"
  severity: minor
  test: 8
  artifacts: []
  missing: []

- truth: "Footer rows labeled 'Total Products' and 'Total Units (balls)'; Capacity row links to kitchen config defaults"
  status: failed
  reason: "User reported: row labels should be 'Total Products' / 'Total Units (balls)'; Capacity shows 200 which may be hardcoded, needs to pull from kitchen config defaults; hover tooltip blocked by overlapping element"
  severity: minor
  test: 10
  artifacts: []
  missing: []

- truth: "Ingredients Manager is reachable from Inventory or Config navigation"
  status: failed
  reason: "User reported: no discoverable path to Ingredients Manager — needs link from Inventory ingredients tab or Config dropdown"
  severity: major
  test: 1
  artifacts: []
  missing: []

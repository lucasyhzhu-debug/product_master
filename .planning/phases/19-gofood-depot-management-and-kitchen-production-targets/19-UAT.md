---
status: complete
phase: 19-gofood-depot-management-and-kitchen-production-targets
source: [19-01-SUMMARY.md, 19-02-SUMMARY.md, 19-03-SUMMARY.md, 19-04-SUMMARY.md, 19-05-SUMMARY.md]
started: 2026-02-22T08:00:00Z
updated: 2026-02-22T11:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. GoFood Depot page loads
expected: Navigate to /gofood-depot. Page loads with title "GoFood Depot Management" and shows either the depot cockpit (outlet tabs + table) or a full-page amber seed warning blocker if GoBiz outlets are not yet linked to storage locations.
result: issue
reported: "Depot management page shows nothing for Legato Tamtem despite 100 units sitting at Tamtem Depot in inventory. Couldn't move stock to depots from inventory. Only Tamtem Depot had a storage location, others missing."
severity: blocker
fix_applied: "Rewrote getDepotStock to read from productInventory at outlet's linkedStorageLocationId (single source of truth). Rewrote adjustDepotStock to write to productInventory. Fixed Available Elsewhere to exclude depot locations. Removed redundant In Inventory column. Type-check passes."

### 2. Outlet selector tabs
expected: Three horizontal button tabs appear — one per GoBiz outlet. Clicking a tab switches the cockpit table to show that outlet's stock data. The active tab is visually highlighted.
result: pass

### 3. Depot cockpit table shows stock
expected: Table shows one row per menu product with columns: Product, Stock (current depot count), Restock Tomorrow, Available Elsewhere, Actions. Stock column is inline editable. Rows with < 5 units are highlighted in red.
result: pass

### 4. Inline stock edit (Remaining column)
expected: Clicking the Remaining cell in the cockpit table makes it editable inline. Typing a new number and pressing Enter (or blurring) saves the updated depot stock. Pressing Escape cancels the edit.
result: pass
notes: "User flagged (1) editable field needs clearer visual affordance; (2) unverified whether GoFood sales transactions automatically reduce this stock value"

### 5. Restock suggestion tooltip
expected: Hovering over the "Restock Tomorrow" value shows a tooltip with the calculation breakdown (e.g., "3-day avg: 2.3 × buffer → 3 units"). The number matches the suggestion logic (Mon=full week total, Fri/Sat=n+2, weekday=n+1).
result: pass
notes: "Tooltip text color has poor contrast against the green background in both light and dark mode — hard to read"

### 6. Product mapping section
expected: A "Product Mappings" section below the cockpit table shows GoFood product names alongside a dropdown to map each to an internal menu product. Unmapped products from recent orders are flagged. Clicking Save Mappings persists all changes at once (no auto-save).
result: pass

### 7. Stock transfer dialog
expected: Clicking the transfer action on a cockpit row opens a dialog. Selecting a source location shows available stock. Entering a quantity higher than available shows a validation error. A valid quantity and source location allows confirming the transfer.
result: issue
reported: "Seeing error at Legato Tamtem depot: 'This outlet does not have a linked storage location. Run the seed migration first.' — despite Tamtem Depot having a storage location. Source location dropdown shows Kitchen (200 available) but the outlet link check fails."
severity: major

### 8. Inventory page defaults to Finished Goods tab
expected: Opening /inventory (Inventory Manager) shows the Finished Goods tab selected by default — not Packaging or Ingredients. The tab order is: Finished Goods | Packaging | Ingredients.
result: pass

### 9. Finished Goods hero stat cards
expected: At the top of the Finished Goods tab, four stat cards appear: Internal (stock at office/kitchen locations), GoFood Outlets (depot locations), K3Mart (venue locations), and Alerts (low-stock and zero-stock count — shows "OK" when all healthy). A summary line reads "Tracking N products — M total units".
result: pass
notes: "(1) Alerts card looks ugly in dark mode; (2) location platform tagging (Internal/GoFood/K3Mart) should be accessible inline via a settings dropdown on this page, not buried elsewhere; (3) add sort-by-Platform to the Finished Goods tab; (4) rename location type labels from Internal/Depot/Venue → Internal Inventory/GoFood/K3Mart"

### 10. Grouping toggle (By Product / By Location)
expected: A toggle in the Finished Goods tab switches between "By Product" view (one card per menu product, sub-list of locations) and "By Location" view (one section per storage location, list of products inside). Zero-stock rows are visible but appear dimmed (opacity-50).
result: pass
notes: "User wants a third grouping option: 'By Platform' — sections for Internal Inventory / GoFood / K3Mart, each showing products with their total stock (no location sub-grouping)"

### 11. Inline transfer form (Move / Receive)
expected: In the By Product or By Location view, each location row has "Move -->" and "<-- Receive" buttons. Clicking either reveals an inline form below the row with source/destination location select and quantity input. Move --> disables for zero-stock rows. Submitting calls the transfer mutation and the row updates.
result: pass
notes: "Move/Receive buttons should be more visually distinct — easier to spot at a glance"

### 12. Move Stock modal (multi-product transfer)
expected: A "Move Stock" button in the Finished Goods action bar opens a modal. The modal has source and destination location dropdowns, and rows for selecting products with quantities. "Add another product" adds more rows. Clicking Transfer Stock moves all products sequentially and shows a success toast.
result: pass

### 13. GoFood restock section on Dispatch Planner
expected: Open the Dispatch Planner (/restock-planner). After the Internal Channel section, a "GoFood Depot Restock" section appears. It shows one collapsible subsection per GoBiz outlet. Each outlet table lists: product name, current stock (from outlet's linked storage location), restock tomorrow number, and calculation breakdown text inline.
result: pass
notes: "(1) Section exists but unclear how to use it and where the restock number flows to; (2) 'Simulate Inventory' button at top is redundant — remove it (simulate materials section already exists below the planner); (3) rename page and nav from 'Dispatch Planner' to 'Restock Planner'; (4) route is /dispatch-planner not /restock-planner as documented"

## Summary

total: 13
passed: 11
issues: 14
pending: 0
skipped: 0

## Gaps

- truth: "Stock field is visually editable with a clear affordance (e.g. edit icon, highlight, or border on hover)"
  status: failed
  reason: "User reported: make it more obvious you can update the stock field - use a colour or something"
  severity: cosmetic
  test: 4
  artifacts: []
  missing: []

- truth: "Restock suggestion tooltip text is readable against its background in both light and dark mode"
  status: failed
  reason: "User reported: colours are hard to see in light mode AND darkmode - make the text easier to see on background (screenshot shows low-contrast text on green tooltip)"
  severity: cosmetic
  test: 5
  artifacts: []
  missing: []

- truth: "Stock transfer dialog allows moving stock to a depot outlet that has a linked storage location"
  status: failed
  reason: "User reported: error at Legato Tamtem depot — 'This outlet does not have a linked storage location. Run the seed migration first.' despite Tamtem Depot having a storage location. Source location shows correctly (Kitchen 200 available) but outlet link check fails."
  severity: major
  test: 7
  artifacts: []
  missing: []

- truth: "Move --> and <-- Receive buttons in the inline transfer form are visually distinct and easy to spot at a glance"
  status: failed
  reason: "User reported: buttons should be more visible and distinct"
  severity: cosmetic
  test: 11
  artifacts: []
  missing: []

- truth: "Finished Goods grouping toggle has a third option: 'By Platform' — sections for Internal Inventory / GoFood / K3Mart, each listing products with total stock (no location sub-grouping within each platform section)"
  status: failed
  reason: "User reported: would love to also have the platform sort (by product / by location / by platform) — inside platform sort you'd have the products underneath each with no location sub-grouping; other sorts unchanged"
  severity: major
  test: 10
  artifacts: []
  missing: []

- truth: "Alerts stat card is readable and well-styled in dark mode"
  status: failed
  reason: "User reported: alerts look ugly in dark mode"
  severity: cosmetic
  test: 9
  artifacts: []
  missing: []

- truth: "Location platform tagging (assigning Internal Inventory / GoFood / K3Mart to each storage location) is accessible via a settings dropdown directly on the Finished Goods tab"
  status: failed
  reason: "User reported: put the location configuration (tagging which location is GoFood / K3Mart / Internal) directly into the settings drop-down on the inventory page — especially since we can sort by location, I want to also sort by Platform"
  severity: major
  test: 9
  artifacts: []
  missing: []

- truth: "Location type labels read 'Internal Inventory', 'GoFood', 'K3Mart' (not 'Internal', 'Depot', 'Venue')"
  status: failed
  reason: "User reported: instead of tagging each location as 'Internal / Depot / Venue' it should be 'Internal Inventory / GoFood / K3Mart'"
  severity: minor
  test: 9
  artifacts: []
  missing: []

- truth: "GoFood Depot Restock section on the planner clearly explains how to use it and shows where the restock numbers feed into (e.g. transfer action, copy to clipboard)"
  status: failed
  reason: "User reported: how do I use it and where does the number go? — purpose and workflow of the section is unclear"
  severity: major
  test: 13
  artifacts: []
  missing: []

- truth: "'Simulate Inventory' button at the top of the planner is removed (redundant — simulate materials section already exists further down)"
  status: failed
  reason: "User reported: we don't need the simulate inventory button at the top anymore since we have the simulate materials stock section below the planner"
  severity: minor
  test: 13
  artifacts: []
  missing: []

- truth: "Page is named 'Restock Planner' in the heading and navigation (not 'Dispatch Planner'). Route is /restock-planner."
  status: failed
  reason: "User reported: I like the restock planner name better — update the page name and navigation. Also route was /dispatch-planner not /restock-planner as documented."
  severity: minor
  test: 13
  artifacts: []
  missing: []

- truth: "Build passes with no TypeScript errors in GoFoodDepotManager.tsx"
  status: failed
  reason: "Pre-existing build failure: Id<\"gofoodDepotStock\"> vs Id<\"productInventory\"> type mismatch in src/pages/GoFoodDepotManager.tsx — leftover from the depot stock rewrite that switched the source of truth to productInventory"
  severity: blocker
  test: 0
  artifacts:
    - path: "src/pages/GoFoodDepotManager.tsx"
      issue: "Id<\"gofoodDepotStock\"> used where Id<\"productInventory\"> is now expected after rewrite"
  missing: []

- truth: "GoFood sales transactions (synced via GoBiz) automatically reduce the depot stock count"
  status: failed
  reason: "User reported: verify that when sales are updated at that location (transactions from gofood) this stock number does indeed go down"
  severity: major
  test: 4
  artifacts: []
  missing: []

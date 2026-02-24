---
status: complete
phase: 21-kitchen-production-targets
source: [21-06-SUMMARY.md, 21-07-SUMMARY.md, 21-08-SUMMARY.md, 21-09-SUMMARY.md, 21-10-SUMMARY.md, 21-11-SUMMARY.md]
started: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Production Targets Bar — defaults show without override
expected: Open the Kitchen page. Without setting any override, the Production Targets Bar at the top should already show today's targets (Original and/or Jumbo stat cards) and packaging breakdown badges below them. The numbers come from saved defaults — you should NOT need to apply an override just to see any numbers.
result: pass

### 2. Packaging mix — food products only
expected: In Manager Settings (bottom of Kitchen page, admin/manager only), open the packaging mix editor. The product dropdown should only list food/POS products. Non-food items like Brochures or packaging materials should NOT appear.
result: pass

### 3. Manager Settings — saves and reloads
expected: Add or change a product row in the packaging mix and click Save Defaults. Close the page and reopen it. The packaging mix editor should reload with your saved values (not blank or reset to factory defaults).
result: pass

### 4. Per-component toggles — Jumbo toggle hides stat card
expected: In Manager Settings, find the per-component toggles (Original / Jumbo). Toggle Jumbo off. The Jumbo stat card in the Production Targets Bar should disappear — only Original is shown. Toggle Jumbo back on and the Jumbo card returns.
result: pass

### 5. Manager Settings — unified form with two save actions
expected: Manager Settings should be a single unified form with two distinct save buttons: one for "Save Defaults" (persists as the ongoing default) and one for "Apply Override" (applies targets for today only). There should NOT be two separate panels — both actions use the same ball target inputs.
result: pass

### 6. Kitchen orders — read-only 3-column summary
expected: Expand the Orders section in the Kitchen page. It should show a read-only 3-column layout: Payment Received / Being Prepared / Awaiting Delivery. You should NOT be able to interact with orders (no complete buttons, no status change controls). Order management stays in the Order Management page only.
result: pass

### 7. End-of-Shift form — target shown next to each input
expected: In the End-of-Shift form, each product row should show the target quantity next to the input field (e.g., "Target: 110"). This lets you see how much you were supposed to make while entering what you actually made.
result: pass

### 8. End-of-Shift form — chef selector
expected: The End-of-Shift form should have a chef selector — a way to record who actually cooked, separate from who is submitting the form. This could be a dropdown or name field.
result: pass

### 9. Shift review — target deltas
expected: After filling in produced quantities and proceeding to the review screen, each product row should show a comparison to the target (e.g., "+5 over target" or "−10 under target"). Produced + waste is used as the total for comparison purposes.
result: pass

### 10. Success screen — stagger animation
expected: After confirming a shift on the review screen, the success screen should animate in with a stagger effect — rows appearing one after another rather than all at once. There should be a polished card layout with produced/waste data.
result: pass

### 11. Chef name in shift history
expected: In the Shift History panel (Manager Settings), if a shift was submitted with a chef name recorded, the chef's name should be visible on the history card. If the chef and submitter are the same person, the chef name doesn't need to be shown separately.
result: pass

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]

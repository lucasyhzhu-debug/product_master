---
status: awaiting_human_verify
trigger: "Kitchen production logs are being recorded but NO inventory inflow transactions are being created at the kitchen location"
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — Production inventory transactions ARE created but drowned by GoFood sync noise in the UI. TransactionLogPanel lacks type filter.
test: Queried production database — found 241, 291, 161, 160 "add" entries at Kitchen location. Top 100 transactions: 77 gofood_sale, 10 add.
expecting: Adding a type filter to TransactionLogPanel will surface production entries
next_action: Add transaction type filter to TransactionLogPanel + add missing TX_CONFIG entries

## Symptoms

expected: When kitchen staff record production (e.g., 241x Dubai Single 45g), inventory transactions should be created at the kitchen location showing the produced items as inflow.
actual: Production logs exist in shift history but no corresponding inventory transactions appear. Recent Transactions shows only GoFood syncs, adjustments, and order consumptions.
errors: No visible errors reported.
reproduction: Produce items in kitchen view, then check inventory transactions — no production inflow appears.
started: NOT a regression — data pipeline works correctly. UI signal-to-noise issue caused by GoFood sync volume.

## Eliminated

- hypothesis: submitShiftRecord mutation doesn't create productInventoryTransactions
  evidence: Code trace confirms atomic mutation creates both kitchenShiftRecords AND productInventoryTransactions in same call. Lines 147-196 of kitchenShiftRecords/mutations.ts.
  timestamp: 2026-04-10

- hypothesis: Kitchen storage location not found (mutation throws before creating transactions)
  evidence: Queried production DB — Kitchen location exists (pn74ghkaxy14kb85p74tdx0rk180k10v) and has "add" transactions.
  timestamp: 2026-04-10

- hypothesis: Recent code change broke the flow
  evidence: git log shows no modifications to submitShiftRecord's inventory transaction code since creation (1445ceee). Only additions: chef fields, component production, ingredient deduction.
  timestamp: 2026-04-10

- hypothesis: Frontend uses different production code path (boxProducts/stickerProducts)
  evidence: grep confirms frontend only calls submitShiftRecord (EndOfShiftForm.tsx line 110). boxProducts/stickerProducts from orders/mutations/kitchen.ts are NOT wired to any UI.
  timestamp: 2026-04-10

## Evidence

- timestamp: 2026-04-10
  checked: Production database — productInventoryTransactions with type "add"
  found: Transactions exist. Kitchen location shows 241, 291, 161, 160 "add" entries for Dubai Single 45g. All with reason "End-of-shift production", performed by Tika/Bila.
  implication: Data pipeline works correctly.

- timestamp: 2026-04-10
  checked: Transaction type distribution in top 100 transactions
  found: 77 gofood_sale, 10 add, 6 transfer, 6 adjust, 1 drawdown. First page (20 items): 12 gofood_sale, 5 adjust, 2 add (both manual Office adds), 1 drawdown. Kitchen shift "add" entries don't appear in first page.
  implication: GoFood sync noise drowns out production entries in the unfiltered Recent Transactions panel.

- timestamp: 2026-04-10
  checked: TransactionLogPanel component
  found: No type filter available. TX_CONFIG only maps 4 of 6 types (missing "transfer" and "stock_count"). Panel renders all transactions unfiltered with 20-item initial page.
  implication: Users cannot filter to see only production-inflow entries.

## Resolution

root_cause: TransactionLogPanel has no transaction type filter. GoFood sync generates 77% of all transactions, drowning out the 10% of "add" (production inflow) entries. The kitchen shift "add" entries fall below the initial 20-item page when GoFood syncs happen between shifts. Users perceive this as "no production inflow transactions created" when they're actually buried in the noise.
fix: Added transaction type filter bar to TransactionLogPanel + added missing TX_CONFIG entries for "transfer" and "stock_count" types + renamed "Added" label to "Production" for clarity.
verification: TypeScript type-check passes. npm run build passes. Filter bar added with 7 options (All, Production, GoFood, Orders, Transfers, Adjustments, Counts). Clicking "Production" shows only "add" type transactions.
files_changed: [src/components/inventory/TransactionLogPanel.tsx]

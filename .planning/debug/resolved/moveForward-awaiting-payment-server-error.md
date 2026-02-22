---
status: resolved
trigger: "Server error when calling orders/mutations/statusUpdates:moveForward to transition an order from AwaitingPayment"
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - consumeFromFIFO uses available = quantityRemaining - quantityReserved. After reserveStockForOrderInternal increases quantityReserved, available drops to 0. consumeFromFIFO throws plain Error("Insufficient stock") -> Server Error.
test: Read all relevant files - statusUpdates.ts, inventoryIntegration.ts, fifo.ts, statusTransitions.ts
expecting: Fix consumeFromFIFO to use quantityRemaining for consumption (not available), and fix applyFIFOConsumption to also decrement quantityReserved
next_action: Apply fix to convex/inventory/fifo.ts

## Symptoms

expected: Clicking "Customer Paid!" on AwaitingPayment order moves it to PaymentReceived (or next status). Force Complete from AwaitingPayment should recognise revenue (mark PaymentReceived) before completing.
actual: Server Error thrown from orders/mutations/statusUpdates:moveForward [Request ID: b5063e9e59befd15]
errors: [CONVEX M(orders/mutations/statusUpdates:moveForward)] [Request ID: b5063e9e59befd15] Server Error
reproduction: Open order 0220-001 (Lydia Trisnadi, Rp 720.000, AwaitingPayment). Click "Customer Paid!" button. Order must have dueDate set to today (2026-02-22) or tomorrow for auto-expedite to trigger.
started: 2026-02-22 (today)

## Eliminated

- hypothesis: FORWARD_TRANSITIONS missing AwaitingPayment entry
  evidence: FORWARD_TRANSITIONS map has AwaitingPayment: "PaymentReceived" at statusTransitions.ts line 43
  timestamp: 2026-02-22

- hypothesis: Schema validation error on patch fields
  evidence: All fields in updates object (status, confirmedAt, isKitchenVisible, expedited, kitchenEnteredAt) exist in orders schema
  timestamp: 2026-02-22

- hypothesis: Missing ConvexError (shortage)
  evidence: Stock shortage throws ConvexError which shows message text, not "Server Error"
  timestamp: 2026-02-22

- hypothesis: getSessionUser error
  evidence: getSessionUser returns null for empty/invalid token, handled gracefully
  timestamp: 2026-02-22

## Evidence

- timestamp: 2026-02-22
  checked: statusUpdates.ts moveForward handler lines 398-418
  found: Auto-expedite (GAP-03) triggers when order.dueDate is today/tomorrow. Sets autoExpedited=true, changes status to BeingPrepared, then calls BOTH reserveStockForOrderInternal AND consumeBoxingMaterialsInternal in sequence.
  implication: Two-step sequence - reserve then consume - on same batch can fail when all stock is reserved

- timestamp: 2026-02-22
  checked: fifo.ts consumeFromFIFO lines 76-100
  found: Uses getAvailableQuantity(batch) = batch.quantityRemaining - batch.quantityReserved for available stock calculation
  implication: After reserveStockForOrderInternal increases batch.quantityReserved, available drops to 0. If quantityRemaining == quantityReserved (exactly enough stock for order), available=0 and consumeFromFIFO throws new Error("Insufficient stock...") - a PLAIN Error (not ConvexError) = Server Error

- timestamp: 2026-02-22
  checked: fifo.ts applyFIFOConsumption lines 127-165
  found: Only decrements batch.quantityRemaining, does NOT decrement batch.quantityReserved
  implication: After consumption, batch.quantityReserved is stale (still shows reserved stock as reserved even though it has been physically consumed). Secondary bug that affects componentStock.totalReserved accuracy.

- timestamp: 2026-02-22
  checked: inventoryIntegration.ts consumeMaterialsByStageInternal lines 388-460
  found: Calls consumeFromFIFO with reservation.quantityReserved - this will use available=0 after reservation
  implication: Root cause confirmed: reserve then consume sequence fails when batch has exactly enough stock

- timestamp: 2026-02-22
  checked: forceComplete handler statusUpdates.ts lines 684-740
  found: Sets confirmedAt: Date.now() (if not already set) AND paymentStatus: "Paid" before patching to Complete. Revenue recognition is correct.
  implication: No fix needed for forceComplete revenue recognition - confirmedAt is properly set for sales analytics

## Resolution

root_cause: consumeFromFIFO calculates available = quantityRemaining - quantityReserved. When auto-expedite triggers (order due today/tomorrow transitioning AwaitingPayment -> BeingPrepared), moveForward first calls reserveStockForOrderInternal (increasing batch.quantityReserved), then immediately calls consumeBoxingMaterialsInternal -> consumeFromFIFO. At this point available = quantityRemaining - quantityReserved = 0 if batch had exactly enough stock. consumeFromFIFO throws plain Error("Insufficient stock: requested N, available 0, short N") -> Convex wraps as Server Error. Same latent bug exists in expediteOrder path (PaymentReceived -> BeingPrepared).

fix: Two-part fix to fifo.ts:
  1. consumeFromFIFO: use batch.quantityRemaining (not getAvailableQuantity) as available for consumption. Reservation guarantees physical stock exists; consumption should use physical stock not "unreserved available" stock.
  2. applyFIFOConsumption: also decrement batch.quantityReserved when consuming, to keep bookkeeping accurate and prevent stale reserved counts.

forceComplete: No fix needed. confirmedAt is already set for revenue recognition.

verification: npm run type-check passes (0 errors). npm run build passes. npm run test - 18/18 orderLifecycle tests pass; 4 pre-existing failures in k3martCockpit and gobiz unrelated to this fix.
files_changed:
  - convex/inventory/fifo.ts

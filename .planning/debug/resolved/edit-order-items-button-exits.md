---
status: resolved
trigger: "edit-order-items-button-exits"
created: 2026-02-22T10:00:00Z
updated: 2026-02-22T10:30:00Z
---

## Current Focus

hypothesis: RESOLVED
test: TypeScript type check passed (npm run type-check exits clean)
expecting: n/a
next_action: commit

## Symptoms

expected: Clicking "Edit Order Items" should open an editing interface to modify order items on the order
actual: The dialog/modal closes immediately ("just exited") — no editing UI appears, user can't edit anything
errors: No error messages reported — the modal just silently closes
reproduction: Open any order in AwaitingPayment status, click the "Edit Order Items" button
started: Reported just now, unclear when it last worked

## Eliminated

- hypothesis: Bug is in dialog/modal close handler
  evidence: The behavior for OrderSlideOver is intentional — onClose() is called first. The real bug is the navigation destination is wrong.
  timestamp: 2026-02-22

## Evidence

- timestamp: 2026-02-22
  checked: src/pages/OrderDetail.tsx line 470
  found: `onClick={() => navigate('/orders?edit=${orderId}')}` — navigates to /orders with ?edit= param
  implication: OrderManager (at /orders) does not read ?edit= param at all

- timestamp: 2026-02-22
  checked: src/components/orders/OrderSlideOver.tsx lines 381-388
  found: `onClose(); navigate('/orders?edit=${orderId}')` — same dead-end destination
  implication: Closes slide-over and navigates to unhandled ?edit= route

- timestamp: 2026-02-22
  checked: src/pages/OrderManager.tsx lines 25-32
  found: Only reads `searchParams.get('open')` to auto-open slide-over. No handler for `?edit=` whatsoever.
  implication: The ?edit= param is silently ignored, user sees Kanban board with no editing UI

- timestamp: 2026-02-22
  checked: src/pages/OrderCreate.tsx lines 47-53 and 103-105
  found: Reads `?draft=` param. Had guard: `if (existingOrder.status !== 'Draft') return;` — skipped prefill for non-Draft orders.
  implication: AwaitingPayment orders need editing too. Guard relaxed to include AwaitingPayment.

- timestamp: 2026-02-22
  checked: convex/orders/mutations/orderCrud.ts updateDraft handler line 741
  found: `if (order.status !== "Draft") throw new Error(...)` — blocked AwaitingPayment orders
  implication: Backend must also accept AwaitingPayment for item editing to work end-to-end.

- timestamp: 2026-02-22
  checked: convex/orders/mutations/itemCrud.ts replaceItems docstring line 166
  found: "Only allowed for Draft and AwaitingPayment orders." — replaceItems already supported AwaitingPayment
  implication: Only updateDraft and frontend flow needed fixing for AwaitingPayment orders.

- timestamp: 2026-02-22
  checked: src/pages/OrderCreate.tsx executeSubmit (after replaceItems + updateDraft)
  found: `updateOrderStatus.mutate({ status: 'AwaitingPayment' })` — redundant transition for already-AwaitingPayment orders
  implication: Must skip status transition when order is already AwaitingPayment.

## Resolution

root_cause: Both "Edit Order Items" buttons in OrderDetail.tsx and OrderSlideOver.tsx navigated to `/orders?edit=${orderId}`. The `?edit=` query param is never read by OrderManager (which handles `/orders`). The param is silently ignored. Additionally, OrderCreate (at `/orders/new?draft=`) had a status guard preventing AwaitingPayment orders from being loaded for editing, and the backend updateDraft mutation rejected non-Draft orders.

fix:
  1. src/pages/OrderDetail.tsx: Changed navigate target from `/orders?edit=` to `/orders/new?draft=`
  2. src/components/orders/OrderSlideOver.tsx: Same fix for the navigate call
  3. src/pages/OrderCreate.tsx: Relaxed status guard from `'Draft'` to `['Draft', 'AwaitingPayment']`
  4. src/pages/OrderCreate.tsx: Skip updateOrderStatus transition when order is already AwaitingPayment
  5. src/pages/OrderCreate.tsx: Added isEditingAwaitingPayment flag; hid "Delete Draft"/"Save as Draft" buttons for AwaitingPayment; changed submit button to "Save Changes" for AwaitingPayment
  6. convex/orders/mutations/orderCrud.ts: Relaxed updateDraft status guard to accept AwaitingPayment orders

verification: npm run type-check passed clean. All 4 changed files compile without errors.
files_changed:
  - src/pages/OrderDetail.tsx (navigation target fix)
  - src/components/orders/OrderSlideOver.tsx (navigation target fix)
  - src/pages/OrderCreate.tsx (edit mode for AwaitingPayment, status guard, submit flow, UI labels)
  - convex/orders/mutations/orderCrud.ts (updateDraft status guard relaxed)

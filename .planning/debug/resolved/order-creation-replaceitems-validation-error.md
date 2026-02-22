---
status: resolved
trigger: "ArgumentValidationError in orders/mutations/itemCrud:replaceItems — orderId receives an object instead of a v.id('orders') string"
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - Bug was caused by createDraft returning {orderId, customerId} but frontend storing the full object as draftOrderId
test: Traced all setDraftOrderId call sites and git history
expecting: Found exact commit introducing and fixing the bug
next_action: Archive - bug already fixed in commit 2d50079

## Symptoms

expected: Creating a new order should work — replaceItems should receive a plain order ID string
actual: Mutation fails with ArgumentValidationError: Value does not match validator. Path: .orderId, Value: {customerId: "...", orderId: "..."}, Validator: v.id("orders")
errors: [CONVEX M(orders/mutations/itemCrud:replaceItems)] orderId arg receives entire args object {customerId, orderId} instead of just the ID string
reproduction: Create a new order (not editing existing). Error occurs on submit.
started: Introduced when createDraft was changed to return {orderId, customerId} in commit 2d50079 — but the same commit also fixed the frontend.

## Eliminated

- hypothesis: Bug is in the replaceItems mutation validator (backend)
  evidence: replaceItems correctly expects v.id("orders") for orderId — the bug is in the caller
  timestamp: 2026-02-22

- hypothesis: Bug is in OrderFormPOS.tsx (other replaceItems caller)
  evidence: OrderFormPOS uses editOrderId (from URL param) directly, not createDraft return value
  timestamp: 2026-02-22

- hypothesis: Bug is currently in the codebase
  evidence: Commit 2d50079 simultaneously changed createDraft return type AND updated frontend to extract result.orderId. Current code correctly extracts result.orderId on lines 251 and 276 of OrderCreate.tsx.
  timestamp: 2026-02-22

## Evidence

- timestamp: 2026-02-22
  checked: convex/orders/mutations/itemCrud.ts replaceItems mutation
  found: Args validator expects orderId: v.id("orders"), items: v.array(orderItemInput). Backend is correct.
  implication: Bug is in the frontend caller

- timestamp: 2026-02-22
  checked: src/pages/OrderCreate.tsx lines 386-395, 454-463 (replaceItemsMutation calls)
  found: Both call sites pass { orderId: draftOrderId, items: [...] } — draftOrderId comes from useState
  implication: If draftOrderId were an object, it would cause this exact error

- timestamp: 2026-02-22
  checked: setDraftOrderId call sites (lines 115, 251, 276)
  found: Line 251: setDraftOrderId(result.orderId), Line 276: setDraftOrderId(result.orderId) — both correctly extract .orderId
  implication: Current code correctly handles the {orderId, customerId} return from createDraft

- timestamp: 2026-02-22
  checked: git log and diff for commit 2d50079
  found: This commit changed createDraft from "return orderId" to "return { orderId, customerId }" AND simultaneously updated frontend from "setDraftOrderId(newDraftId)" to "setDraftOrderId(result.orderId)"
  implication: The bug existed briefly if backend deployed before frontend (CI deploys Convex first, then Vercel rebuilds)

- timestamp: 2026-02-22
  checked: git branch --contains 2d50079
  found: Fix is in main and all feature branches derived from main
  implication: Bug is fixed in all current code

## Resolution

root_cause: Commit 2d50079 changed createDraft mutation from returning a plain orderId string to returning {orderId, customerId}. The frontend was updated in the same commit to extract result.orderId. However, the CI/CD pipeline deploys Convex backend FIRST, then Vercel frontend. During the deployment window, the old frontend received {orderId, customerId} from createDraft and stored the full object as draftOrderId via the old code "setDraftOrderId(newDraftId)". When replaceItemsMutation was then called with orderId: draftOrderId, the object was passed instead of a string.

fix: Already fixed in commit 2d50079 (merged to main via f59745c). The frontend now correctly extracts result.orderId from the createDraft return value.

verification: TypeScript type check passes (npx tsc --noEmit). All setDraftOrderId call sites confirmed to extract .orderId. Code review of subsequent commits (d09c8bb, 1dcd7a8) confirms no regression.

files_changed: []

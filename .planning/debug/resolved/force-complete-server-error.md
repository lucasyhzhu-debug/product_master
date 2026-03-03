---
status: verifying
trigger: "forceComplete mutation throws Server Error (500) in production"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T00:00:00Z
---

## Current Focus

hypothesis: forceComplete throws `new Error(...)` (not ConvexError) for validation failures, causing Server Error instead of user-facing message. Secondary issue: sessionId mismatch between AuthContext and SessionProvider could cause Unauthorized ConvexError under certain conditions.
test: read mutation source, trace error type, verify schema compliance
expecting: fix Error -> ConvexError in forceComplete, and verify session integration
next_action: apply fix - change throw new Error to throw new ConvexError in forceComplete handler

## Symptoms

expected: Force complete should transition an order to a completed state successfully
actual: Server Error thrown. Full console trace shows ConvexError Server Error on forceComplete mutation
errors: ConvexError Server Error on forceComplete mutation; secondary Faulty nodeId selector SyntaxError
reproduction: Trigger force complete on an order in production
started: Happening now in production (prod:decisive-wombat-7)

## Eliminated

- hypothesis: schema mismatch on db.patch (status, completedAt, isKitchenVisible, paymentStatus, confirmedAt)
  evidence: all fields exist in orders schema with correct types
  timestamp: 2026-03-02

- hypothesis: logOrderEvent schema mismatch
  evidence: all fields (orderId, eventType, fromStatus, toStatus, reason, category, metadata, timestamp, triggeredBy, userId) match orderEvents schema
  timestamp: 2026-03-02

- hypothesis: protectedMutation wrapper passing wrong args to handler
  evidence: customFnBuilder correctly strips sessionId, passes {orderId, reason} to handler; ctx.user properly set
  timestamp: 2026-03-02

- hypothesis: getSessionUser type mismatch (sessionId not being token string)
  evidence: SessionIdArg = {sessionId: v.string()}, SessionProvider stores auth token as string in malo_session_id, getSessionUser queries by_token index - types match
  timestamp: 2026-03-02

- hypothesis: metadata JSON.stringify failure
  evidence: metadata = {paymentStatusSet: "Paid", inventorySideEffects: false} serializes cleanly
  timestamp: 2026-03-02

## Evidence

- timestamp: 2026-03-02
  checked: convex/orders/mutations/statusUpdates.ts forceComplete handler (lines 691-747)
  found: handler uses `throw new Error("Order not found")` and `throw new Error("Order is already ${order.status}")` - regular JavaScript Error, not ConvexError
  implication: In Convex, non-ConvexError exceptions surface as opaque "Server Error" to clients. ConvexError surfaces the message. This is the cause of the "Server Error" visible in console when order validation fails.

- timestamp: 2026-03-02
  checked: All throw statements in statusUpdates.ts (grep output)
  found: ALL throw statements in statusUpdates.ts use `new Error()`. Other files (kitchen.ts, inventoryIntegration.ts, ingredients/mutations.ts) consistently use `new ConvexError()`.
  implication: statusUpdates.ts was not updated to use ConvexError pattern when the file was written/migrated.

- timestamp: 2026-03-02
  checked: UI guard for Force Complete button in OrderSlideOver.tsx (line 556)
  found: `!['Complete', 'Cancelled'].includes(order.status)` - button only hidden for modern terminal statuses
  implication: Legacy terminal statuses (CompleteShipped, PickedUp, etc.) would still show the Force Complete button and could trigger the "Order is already X" path for those orders... but actually isTerminalStatus() only checks Complete/Cancelled, so legacy terminal orders would pass through and get re-completed to "Complete" status. Not a failure path.

- timestamp: 2026-03-02
  checked: protectedMutation/SessionProvider integration in main.tsx + auth.ts
  found: SessionProvider initialValue = crypto.randomUUID() (from idGen()), but useLocalStorage reads existing localStorage value. On fresh mount WITH existing session in localStorage, the existing token is used. On fresh mount WITHOUT session (first-time), a random UUID is stored. After login, AuthContext writes to localStorage but does NOT update SessionProvider React state via setSessionId.
  implication: If user logs in during a page session (without page refresh after login), SessionProvider React state may still hold a pre-login UUID, and useSessionMutation would inject that wrong UUID as sessionId - resulting in ConvexError("Unauthorized"). However this surfaces as client-side error "Unauthorized", not "Server Error".

- timestamp: 2026-03-02
  checked: convex/lib/functions.ts protectedMutation
  found: throws ConvexError("Unauthorized") for missing/inactive user or wrong role
  implication: Auth failures surface as ConvexError (client-displayable), not Server Error. The reported Server Error therefore comes from INSIDE the handler, not from auth layer.

- timestamp: 2026-03-02
  checked: All throw paths inside forceComplete handler
  found: Two throw paths that are regular Error:
  1. `if (!order) throw new Error("Order not found")` - order deleted between UI render and mutation call
  2. `if (isTerminalStatus(order.status)) throw new Error("Order is already ${order.status}")` - order already Complete or Cancelled
  implication: Either of these being triggered would show as "Server Error" to the user. Most likely scenario: user tried force-completing an already-terminal order (perhaps via stale UI state or race condition), or a race condition deleted the order.

## Resolution

root_cause: `forceComplete` mutation throws `new Error(...)` instead of `new ConvexError(...)` for user-facing validation errors. In Convex, only ConvexError exceptions have their messages sent to the client; regular Error exceptions produce an opaque "Server Error (500)" with no user-visible message. When the mutation is called on an already-terminal order (status = Complete or Cancelled) or a non-existent order, it throws a regular Error which becomes the reported Server Error.
fix: Replaced all `throw new Error(...)` with `throw new ConvexError(...)` in statusUpdates.ts (9 occurrences across updateStatus, updatePayment, updateShipping, updateDetails, moveForward, moveBackward, expediteOrder, forceComplete). Added `ConvexError` import from convex/values. This ensures all validation failures surface as readable client-side errors instead of opaque Server Errors.
verification: npm run type-check passes (clean), npm run build passes (no errors), npm run test passes (662/662 tests).
files_changed:
  - convex/orders/mutations/statusUpdates.ts

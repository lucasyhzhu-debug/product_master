---
phase: 84-qris-payment-integration
plan: 03
subsystem: payments
tags: [qris, xendit, convex, mutations, actions, queries, idempotency, tdd, requireRole]

# Dependency graph
requires:
  - phase: 84-01 (Wave 0 RED scaffold)
    provides: "R2/R3/R4b/R4c RED tests + _factory (non-vacuous reservable order seeding)"
  - phase: 84-02 (schema + adapter)
    provides: "qrisPayments table + indexes; xenditProvider + CreateInvoiceResult"
provides:
  - "decideWebhookOutcome (pure, compositional reviewReason, recordPaid always true)"
  - "insertPending / expirePrior internal mutations (supersede-on-regenerate; optional requireAwaitingPayment guard)"
  - "recordPaidAndTransition internal mutation (payment-durable, idempotent-by-status, reserve-failure durable, xenditQrId-primary matching)"
  - "getActiveQrisPayment + getActiveQrisPaymentInternal + getQrisConfig + getOrderForCreate queries"
  - "createQrisInvoice action (token auth via requireRole, flag re-check, guards, supersede)"
affects: [84-04-webhook, 84-05-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Action auth without protectedAction: raw action({token}) gates via internal query running requireRole (mirror bigsellerOrders/actions.ts)"
    - "Payment-durable transition: record paid row BEFORE transition/reserve; reserve in try/catch keeps paid row + needsReview + reverts order status on throw (never lose payment)"
    - "Idempotency by order STATUS guard (order.status===PaymentReceived → replay no-op), not webhook dedup"
    - "xenditQrId-primary match (globally unique); externalId (MMDD-NNN per-day) scoped to most-recent pending row, never blind .first()"
    - "convex-test glob from /convex root when the test lives inside the module dir it exercises (relative ../../**/*.ts collapses same-dir paths and breaks the resolver — RESEARCH Pitfall 5)"

key-files:
  created:
    - convex/qrisPayments/mutations.ts
    - convex/qrisPayments/queries.ts
    - convex/qrisPayments/actions.ts
  modified:
    - convex/qrisPayments/__tests__/mutations.test.ts
    - convex/qrisPayments/__tests__/webhookTransition.test.ts
    - convex/qrisPayments/__tests__/createInvoice.test.ts
    - convex/_generated/api.d.ts

key-decisions:
  - "decideWebhookOutcome builds reviewReason via parts.join('; ') so amount-mismatch AND superseded both survive when both apply (staffreview C7)"
  - "recordPaidAndTransition patches the row to paid (paidAt/receiptId/source/rawPayload/needsReview) DURABLY before the PaymentReceived guard and before reserve — SPEC R4 payment always honored (staffreview C3)"
  - "reserve wrapped in try/catch: on throw keep paid row, set needsReview + reviewReason 'stock reservation failed; payment recorded', revert order status to oldStatus, logStatusTransition the reverse (mirror statusUpdates.ts:162-170)"
  - "createQrisInvoice is a raw action with token: v.string(); NO roles: option, NO protectedAction (none exists) — auth via internal getOrderForCreate running requireRole (staffreview C1)"
  - "getQrisConfig folds qrisNmid + merchantName into an order_staff-safe path (roles [order_staff,manager,admin]) so the dialog never calls businessSettings.get (admin/manager-only — pitfall #19)"
  - "insertPending takes an optional requireAwaitingPayment flag that re-validates status + finalTotal>=1500 server-side and throws before any insert (R3 — the create-invoice guard tested via t.mutation in createInvoice.test.ts)"

patterns-established:
  - "Action auth via internal requireRole query (no protectedAction in this project)"
  - "Payment-durable transition with reserve-failure that preserves the recorded payment"

requirements-completed: [R2, R3, R4b, R4c, R6, R7]

# Metrics
duration: 15min
completed: 2026-05-21
---

# Phase 84 Plan 03: QRIS Mutations + Queries + Create-Invoice Action Summary

**Built the transactional core of QRIS — a payment-durable, idempotent paid-transition that records the payment before reserving stock and survives reserve failures, the supersede-on-regenerate insert/expire mutations, the order_staff-safe queries, and a token-authenticated create-invoice action with no protectedAction — turning R2/R3/R4b/R4c GREEN (12/12).**

## Performance
- **Duration:** ~15 min
- **Started:** 2026-05-21T16:18:00Z
- **Completed:** 2026-05-21T16:32:38Z
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified — 3 RED test globs + api.d.ts)

## Accomplishments
- `decideWebhookOutcome` (pure): `recordPaid` always `true`; `needsReview = amountMismatch || superseded`; reviewReason composed via `parts.join("; ")` so both signals survive together (staffreview C7).
- `recordPaidAndTransition`: matches on globally-unique `xenditQrId` first, else the most-recent `pending` row by `externalId` (never a blind `.first()` — C8). Records the row `paid` (paidAt/receiptId/source/rawPayload/needsReview) **durably, before** the `PaymentReceived` guard and reserve (C3 / SPEC R4). Status-guard idempotency (replay = no-op). Reserve wrapped in try/catch: on throw it keeps the paid row, sets `needsReview` + `reviewReason: "stock reservation failed; payment recorded"`, reverts order status to `oldStatus`, and logs the reverse transition. `logStatusTransition` on success. No `moveForward`/`updatePayment`/`isKitchenVisible`.
- Unmatched COMPLETED → `{ transitioned: false }`, throws nothing, order untouched (C4).
- `insertPending` / `expirePrior`: supersede-on-regenerate; `insertPending(requireAwaitingPayment:true)` re-validates status + `finalTotal >= 1500` and throws before inserting (R3).
- `getActiveQrisPayment` (+ internal mirror): most-recent row among `{pending, paid}` (excludes only `expired`) so a freshly-paid row wins reactively (I2). `getQrisConfig`: reads `process.env.QRIS_ENABLED === "true"` and folds in `qrisNmid` + `merchantName` (order_staff-safe). `getOrderForCreate`: `requireRole(token, [order_staff,manager,admin])` then returns `{status, finalTotal, orderNumber}`. All protected queries use the role superset (pitfall #19).
- `createQrisInvoice`: raw `action({ orderId, token })` — no `roles:`/`protectedAction`; auth via `getOrderForCreate`; re-checks the flag (D-01); guards `AwaitingPayment` + `>=1500` before any write; `expirePrior` then `insertPending`; token never forwarded to Xendit.

## Task Commits
1. **Task 1: recordPaidAndTransition + decideWebhookOutcome + insertPending/expirePrior** — `b0a23261` (feat)
2. **Task 2: order_staff-safe queries + getOrderForCreate** — `61f4f792` (feat)
3. **Task 3: createQrisInvoice action** — `1166b8b6` (feat)

## Verification
- `npm run test -- convex/qrisPayments/__tests__/` → **12 passed** (3 files): R2 (insert/expire/getActive), R3 (create guards), R4b/R4c (pure decideWebhookOutcome 5 cases + non-vacuous reserve-once replay + unmatched no-op).
- The R4b replay test asserts `reservedAfterReplay === reservedAfterFirst` with `reservedAfterFirst - reservedBefore === expectedReserveQty` — proves reserve happened **exactly once** (non-vacuous, not 0===0).
- `npm run type-check` exits 0 (frontend tsc).
- `npx tsc --noEmit -p convex` reports NO errors in `qrisPayments/{mutations,queries,actions}.ts` (remaining convex-tree errors are the Wave-0 RED test files for Plan 04 / the factory `by_component_location` index typing — pre-existing, out of scope).
- Acceptance greps: paid-patch precedes the PaymentReceived guard; try/catch contains `"stock reservation failed; payment recorded"`; `logStatusTransition` imported from `../orders/helpers/statusTransitions`; no `moveForward`/`updatePayment`/`isKitchenVisible`/`ctx: { db: any }` in code (only in explanatory comments); actions contains no `roles:`/`protectedAction` in code (only the comment explaining their absence); both protected queries use `roles: ["order_staff", "manager", "admin"]`.
- `npx convex codegen` re-run; `_generated/api.d.ts` reflects the new `qrisPayments.{mutations,queries,actions}` registrations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] convex-test could not resolve `qrisPayments/*` function refs**
- **Found during:** Task 1 (running the R2/R4b/R4c integration tests).
- **Issue:** The Plan-01 RED tests used `import.meta.glob("../../**/*.ts")`. Because these test files live INSIDE the module dir they exercise (`convex/qrisPayments/__tests__/`), Vite collapses `../../qrisPayments/mutations.ts` to `../mutations.ts`. convex-test's `findModulesRoot`/prefix resolver then looks up `../../qrisPayments/mutations` and fails with `Could not find module for: "qrisPayments/mutations"`. This is the exact convex-test resolver bug RESEARCH flagged as Pitfall 5. Verified empirically: a relative glob returned 0 `qrisPayments/*` keys (collapsed), while every other module keyed canonically as `../../<dir>/*.ts`.
- **Fix:** Changed the glob to the absolute-root form `import.meta.glob("/convex/**/*.ts")` in the three affected test files, which keeps every key canonical (`/convex/qrisPayments/mutations.ts`) so the resolver maps the function references correctly. This is a test-infrastructure fix only — the R2/R3/R4b/R4c assertions (the actual contract) are unchanged.
- **Files modified:** `convex/qrisPayments/__tests__/{mutations,webhookTransition,createInvoice}.test.ts`
- **Commits:** `b0a23261` (mutations + webhookTransition globs), `1166b8b6` (createInvoice glob)

## Threat Flags
None — no new security surface beyond the plan's `<threat_model>` (the webhook httpAction itself lands in Plan 04).

## Issues Encountered
The factory's `_factory.ts:233` `by_component_location` index call shows a pre-existing convex-tree tsc error (`componentTypeId` index-field typing) under `npx tsc -p convex`; it does NOT affect vitest execution (the suite passes 12/12) and is out of scope for this plan (Plan-01 artifact).

## Next Phase Readiness
- Plan 04 (webhook): `recordPaidAndTransition({ xenditQrId?, externalId, amount, receiptId?, source?, rawPayload? })` is ready to be called from `handleXenditQrPayment`; the `rawPayload` arg flows to the schema field added in Plan 02. `verifyCallbackToken` + the httpAction route remain to be built.
- Plan 05 (frontend): `getActiveQrisPayment` / `getQrisConfig` (order_staff-safe) and `createQrisInvoice` are ready for the `useQris` hooks + `QrisChargeDialog`.

## Self-Check: PASSED
- `convex/qrisPayments/{mutations,queries,actions}.ts` present on disk.
- All 3 task commits found in git log (b0a23261, 61f4f792, 1166b8b6).
- `npm run test -- convex/qrisPayments/__tests__/` → 12 passed.

---
*Phase: 84-qris-payment-integration*
*Completed: 2026-05-21*

# Staff Review: Phase 84 — QRIS Payment Integration (Xendit)

**Date:** 2026-05-21
**Plans:** `.planning/phases/84-qris-payment-integration/84-0{1..5}-PLAN.md`
**Reviewers:** Staff Developer (implementation + testing) + Principal Developer (architecture + security), both verified against the live codebase.

---

## 1. Summary

**Overall Assessment:** Revise (forced revision round — critical findings).

The architecture is sound on the highest-risk axis — webhook idempotency via the `order.status === "PaymentReceived"` status guard before `reserveStockForOrderInternal` is correct, Convex mutation serializability handles concurrent delivery, and the honor-always/flag-mismatch logic matches SPEC R4. Role-superset discipline (pitfall #19), the 401-on-missing-token divergence from grabfood, the pure-fn extraction (convex-test resolver bug), and the atomic bundle-cap bump are all correctly understood and anchored to real file:line. **But** two independent reviewers found the action-auth layer is not implementable as written (no `protectedAction` exists → zero role enforcement), the money-path transition can lose a real payment on reserve failure, and the headline idempotency test passes vacuously.

Plan-checker (goal-backward) PASSED these plans; staffreview (pre-mortem, codebase-verified) caught what it could not — schema-to-code fidelity (`roles:` API doesn't exist), payment-durability on the failure path, and a vacuous test.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | `createQrisInvoice` uses a `roles:` option on a raw `action()`; no `protectedAction` wrapper exists → no type-check, **no role enforcement** (EoP) | Security/Auth | 84-03 Task 3 |
| C2 | Frontend `useSessionAction` is wrong — no session-action wrapper exists, used nowhere in `src/` | Implementability | 84-05 Task 1 |
| C3 | Hand-rolled transition omits `logStatusTransition` (no audit on money path) and revert-on-reserve-failure guard → **payment record lost** on packaging shortage, Xendit retries forever | Logic/Data-loss | 84-03 Task 1 |
| C4 | Webhook no-match path undefined + untested → null deref → 500 → infinite Xendit retries | Logic | 84-03 T1 / 84-04 T1 |
| C5 | Idempotency replay test is **vacuous** — factory seeds no storage location/stock, so reserve returns `{reserved:0}` both times (`0===0` passes) | Testing | 84-01 / 84-03 T1 |
| C6 | No handler-level 401 test — only pure `verifyCallbackToken` tested; R4a needs httpAction-level "no mutation called" assertion | Testing | 84-04 T1 |
| C7 | `decideWebhookOutcome` `reviewReason` loses "superseded" when amount-mismatch AND superseded coincide; both-true case untested | Logic/Testing | 84-03 T1 |
| C8 | `externalId` (orderNumber MMDD-NNN) is unique only per-day → `by_externalId` `.first()` can transition the **wrong order** | Logic/Data-correctness | 84-03 T1 / 84-04 |

### C1: Action auth API does not exist
`convex/lib/functions.ts` exports only `protectedQuery`/`protectedMutation`/`publicQuery`/`publicMutation` — **no `protectedAction`**. A raw `action({ args, handler })` has no `roles` option; passing one is a type error / silently ignored → the create path ships unauthenticated (contradicts threat T-84-04). **Fix:** add `token: v.string()` to `createQrisInvoice` args; gate via an internal query running `requireRole(ctx, token, ["order_staff","manager","admin"])` (`convex/lib/auth.ts`), folding the check into `getOrderForCreate`. Pattern: `convex/bigsellerOrders/actions.ts:20-26`. Remove the `roles:` key and the acceptance criterion that greps for it.

### C2: Frontend hook
`useSessionAction` requires a `SessionFunction<"action">`; the project has no session-action wrapper and uses `useAction` + explicit `token` everywhere (`useBigSeller.ts:77/94`, `useGrabFood.ts:62`). **Fix:** `useAction(api.qrisPayments.actions.createQrisInvoice)`, pass `{ orderId, token }`. Consistent with C1.

### C3: Money-path durability
Canonical transition (`statusUpdates.ts:111-210`) wraps reserve in try/catch and reverts status on failure, and writes `logStatusTransition` (`:202-210`). The plan's hand-roll does neither. Because Convex mutations are atomic, a `reserveStockForOrderInternal` throw rolls back the `qrisPayments.status:"paid"` write too → real payment lost, every Xendit retry re-throws. **Fix (SPEC R4 "always honored"):** record the paid row durably independent of reserve success — either record paid in a separate committed step before transition+reserve, OR catch the reserve error and keep the paid row + set `needsReview:true, reviewReason:"stock reservation failed; payment recorded"`. Add `logStatusTransition(...)`. (Do NOT add `isKitchenVisible` — `computeIsKitchenVisible("PaymentReceived")` is false, same as AwaitingPayment.)

### C4: No-match / error handling
Define: no matching row → log + return `{ transitioned:false }` and a 200 from the handler so Xendit stops retrying (or a deliberate non-2xx to force redelivery if the insert may not have committed — pick one and document). Wrap `runMutation` in the httpAction in try/catch like grabfood (`webhooks.ts:111-115`). Test an unmatched COMPLETED is a safe no-op.

### C5: Vacuous idempotency test
`reserveStockForOrderInternal` returns `{reserved:0}` with no default storage location (`inventoryIntegration.ts:233-239`). The factory `makeAwaitingPaymentOrder` must seed packaging components + a storage location + stock so a reservation actually decrements, and Plan 03 must assert the post-replay reserved quantity is **unchanged** (not just that the call ran). Otherwise the headline idempotency assertion proves nothing.

### C6: Handler-level 401
Add an httpAction-level test: missing/invalid token → 401 AND `recordPaidAndTransition` not invoked (mutation spy / t.run harness); valid + non-COMPLETED → 200, no transition; valid + COMPLETED → mutation called once.

### C7: Compositional reason
Make `reviewReason` join both reasons when amount-mismatch AND superseded both apply; add the both-true test asserting the reason contains both substrings.

### C8: Per-day orderNumber collision
`generateNextOrderNumber` (`customerResolution.ts:55-97`) resets MMDD-NNN daily → collisions across the retention window. Match primarily on globally-unique `xenditQrId`; when matching by `externalId`, scope to the active **pending** row (never blind `.first()` over all historical rows). Confirm during A1/A2 live-capture (84-05 T3) which payload key maps to `xenditQrId` and lock matching to it.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact |
|---|-------------|--------|
| I1 | `xendit.ts` must read `process.env`/`fetch` **inside** `createInvoice`, not at module top level — else `import { buildCreateQrBody }` in the unit test executes module init and may throw/hang. Drop `"use node"` (loses `btoa`; default runtime has `btoa`+`fetch`). | High |
| I2 | `getActiveQrisPayment` selector: return most recent by `_creationTime` among `{pending, paid}` (exclude only `expired`) so a freshly-paid row wins over an older expired one and the dialog flips. Add a regenerate-then-pay-old-QR ordering test. | Medium |
| I3 | Webhook retry semantics: decide explicitly — non-2xx on match-failure/throw to force redelivery; 200 + needsReview when intentionally honoring a mismatch. Document. | Medium |
| I4 | `getOrderForCreate` interface declared `{ status, finalTotal }` but Task 3 needs `orderNumber` (action has no `ctx.db`). Align to `{ status, finalTotal, orderNumber }`. | Medium |
| I5 | Make the QrisChargeDialog test render the **active** state so `QRCodeSVG` is actually invoked (catches wrong-version/default-vs-named import), not just a loading mount. | Low |

---

## 4. Refinements (Minor)

- **R1:** `qrisPayments` has no `rawPayload` field but Plan 04 says "store raw payload" (A1/A2 mitigation). Add optional `rawPayload: v.optional(v.string())` to the Plan 02 schema, or drop the language (Convex rejects unschemaed fields).
- **R2:** Convex queries do **not** re-run on env-var change. Flipping `QRIS_ENABLED` won't push to mounted clients until they re-subscribe/reload. D-01's "reactively to the frontend" is slightly overstated — note it so verification doesn't expect a live flip without reload.
- **R3:** Add an acceptance check that `xendit.ts` does NOT contain `"use node"`.
- **R4:** Plan 05 — read `useQrisConfig()?.enabled` at the page top (not conditionally) to avoid a hooks-order violation (pitfall #9), since the button is conditionally rendered.
- **R5:** `expiresAt` — note we deliberately use our own 30-min window, not Xendit's `expires_at`, so reviewers don't flag a missed field.

---

## 5. What's Correct (approved as designed)

- Idempotency: status guard before reserve, serializable mutations, replay no-op — **correct**.
- Honor-always/flag-mismatch (amount mismatch / superseded → paid + needsReview, never reject) — matches SPEC R4.
- Webhook token auth: constant-time compare, 401 on missing/invalid with no state change, correctly diverging from grabfood's skip-on-missing (`grabfood/webhooks.ts:23-31`).
- Secrets via `process.env` server-side only; `getQrisConfig` returns only `{enabled, nmid, name}`.
- Bundle cap bump 600→650 atomic with the dep install (pitfall #16).
- Role superset `["order_staff","manager","admin"]` on order-detail-reachable functions; NMID folded into `getQrisConfig` not `useBusinessSettings` (pitfall #19).
- Three pure functions extracted to dodge the convex-test `t.action(internal.*)` resolver bug.
- `moveForward` correctly NOT reused (auto-expedites due-soon orders — `statusUpdates.ts:410-431`).

---

## 6. Verdict

**REVISE — 8 critical, 5 improvements, 5 refinements.**

None invalidate the architecture; all are fixable within the existing 5-plan structure (primarily 84-03 Task 1/Task 3, 84-04 Task 1, 84-05 Task 1, 84-01 factory). Re-review after the action-auth pattern is corrected to the project's `token` + `requireRole` convention, the transition hand-roll restores audit log + payment durability, the idempotency test seeds inventory, and matching is locked to `xenditQrId`.

*Generated by /staffreview — Staff Developer + Principal Developer personas, codebase-verified.*

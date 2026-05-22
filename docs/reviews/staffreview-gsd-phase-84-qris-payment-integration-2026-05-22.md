# Staff Review: Phase 84 — QRIS Payment Integration (Xendit) — SHIPPED CODE

**Date:** 2026-05-22
**Branch:** `gsd/phase-84-qris-payment-integration`
**Range reviewed:** `5e8a544e` (origin/main) → `584a6ef6` (head)
**Reviewer:** Staff/Principal engineer review — plan-to-implementation fidelity + architecture risk, codebase-verified.
**Prior artifact:** `docs/reviews/staffreview-phase-84-qris-payment-integration-2026-05-21.md` (the *plan-stage* staffreview that returned REVISE with 8 criticals). This review verifies those fixes landed in the SHIPPED code and looks for regressions/new issues.

---

## 1. Summary

**Overall Assessment: APPROVE with minor cleanup.**

This is a clean, well-anchored implementation that faithfully tracks the SPEC (R1–R7), the CONTEXT decisions (D-01–D-04), and the UI-SPEC. All eight prior-staffreview criticals are genuinely fixed in the shipped code — not just in the plans. I verified the build and the test suite locally:

- `npm run type-check` (frontend) → exit 0
- `npx tsc -p convex` → exit 0 (the `deferred-items.md` `_factory.ts` `tsc -b` error is **resolved** — the factory was retyped to `TestConvex<typeof schema>`, see 84-05-SUMMARY auto-fix #1; deferred-items.md is now stale)
- QRIS suites (`convex/qrisPayments`, `convex/integrations/qris`, `QrisChargeDialog`) → **36/36 pass**

The highest-risk axis — webhook idempotency and money-path durability — is correct: payment is recorded `paid` durably **before** the order transition/reserve; the `order.status === "PaymentReceived"` guard makes replay a no-op; a reserve failure reverts order status, keeps the paid row, flags `needsReview`, and logs. Honor-always + compositional `reviewReason` + `xenditQrId`-primary matching all match SPEC R4 and the prior review's C7/C8 directions. No prior critical regressed.

The remaining findings are a dead duplicate hook (Important — should be deleted before merge), an unindexed full-table scan in the QR-id match path (Minor, will degrade as `qrisPayments` grows), and a few nitpicks. None block merge; the duplicate hook should be cleaned up.

**One process note:** Plan 05's Task 3 is a `checkpoint:human-verify` (live Xendit Test-Mode loop + a reachable webhook URL + a real captured webhook to lock the `x-callback-token` header name and the `xenditQrId` payload key — A1/A2/C8). That is correctly deferred and explicitly tracked in 84-05-SUMMARY; it MUST be completed before flipping `QRIS_ENABLED` in prod. This is operational, not a code defect.

---

## 2. Prior-Staffreview Critical Verification (all 8 — HOLD in shipped code)

| # | Prior critical | Status in shipped code | Evidence |
|---|----------------|------------------------|----------|
| C1 | Action auth: no `protectedAction` → no role enforcement | **FIXED** | `actions.ts:21-34` is a raw `action({orderId, token})` that gates auth via `internal.qrisPayments.queries.getOrderForCreate`, which runs `requireRole(ctx, token, ["order_staff","manager","admin"])` FIRST (`queries.ts:79-91`). Token never forwarded to Xendit. |
| C2 | Frontend `useSessionAction` doesn't exist | **FIXED** | `useQrisCreate.ts` uses `useConvex().action(...)` + explicit `token`; `useQris.ts:47` uses `useAction(...)` + token. No `useSessionAction` anywhere. |
| C3 | Money-path durability + `logStatusTransition` | **FIXED** | `mutations.ts:174-181` patches row `paid` DURABLY before transition; `:201-222` wraps reserve in try/catch, reverts status, keeps paid row, sets `needsReview`; `logStatusTransition` called on both the failure (`:212`) and success (`:225`) paths. `isKitchenVisible` correctly NOT set. |
| C4 | Webhook no-match path | **FIXED** | `mutations.ts:156-162` returns `{transitioned:false}`, throws nothing, logs. `webhooks.ts:104-117` wraps `runMutation` in try/catch → never 500s. Tested: `webhookTransition.test.ts:141-153` (unmatched no-op), `webhookHandler.test.ts:96-108` (200 + caught throw). |
| C5 | Vacuous idempotency test | **FIXED** | `_factory.ts` seeds default `storageLocations`, packaging `componentTypes (trackInventory:true)`, `menuProductComponents`, `inventoryBatches` + `componentStock`, and `orderItems` so reserve actually decrements. `webhookTransition.test.ts:112-138` asserts `reservedAfterFirst - reservedBefore === expectedReserveQty` AND `reservedAfterReplay === reservedAfterFirst` (non-vacuous). |
| C6 | Handler-level 401 test | **FIXED** | `webhookHandler.test.ts:33-52` — missing/invalid/missing-config token → 401 AND `runMutation` not called; `:54-60` valid+non-COMPLETED → 200, no mutation; `:62-75` valid+COMPLETED → 200, called once with parsed args. |
| C7 | Compositional `reviewReason` | **FIXED** | `mutations.ts:40-56` builds `parts[]` and joins both signals; both-true case tested at `webhookTransition.test.ts:83-93` asserting reason matches `/amount/i` AND `/superseded/i`. |
| C8 | Per-day `externalId` collision | **FIXED** | `mutations.ts:144-154` matches on `xenditQrId` first (globally unique), falls back to the most-recent **pending** row by `externalId` (`findActiveByExternalId`, `:253-267`) — never a blind `.first()` over all history. Webhook passes `qr_id ?? id` as the primary key (`webhooks.ts:106`). |

**No prior critical regressed.** The implementation is faithful to the revision directions.

---

## 3. Critical Issues (Must Fix)

**None.**

---

## 4. Improvements (Recommended)

### I1 — Dead duplicate `useCreateQrisInvoice` hook (delete before merge)
`useCreateQrisInvoice` is exported **twice** with **different implementations**:
- `src/hooks/convex/useQris.ts:47-52` — `useAction(...)` + token
- `src/hooks/convex/useQrisCreate.ts:20-28` — `useConvex().action(...)` + token (provider-tolerant)

Only the `useQrisCreate.ts` version is consumed (`QrisChargeDialog.tsx:29`). The `useQris.ts:47` copy has **zero importers** (grep confirms only `useQrisConfig`/`useActiveQrisPayment` are imported from `useQris`). It exists solely to "satisfy the plan's acceptance grep" (84-05-SUMMARY:104) — i.e. dead code shipped to pass a string-match acceptance check. Two divergent implementations of the same-named hook is a future-maintenance trap (someone edits the wrong one). **Fix:** delete `useCreateQrisInvoice` from `useQris.ts`; keep only the `useQrisCreate.ts` one the component actually uses. Impact: Medium.

### I2 — `findByQrId` is an unindexed full-table scan
`mutations.ts:244-247` (`findByQrId`) does `ctx.db.query("qrisPayments").collect()` then `.find(...)` in JS — there is **no index on `xenditQrId`** (schema only has `by_order`, `by_externalId`). This is the PRIMARY match path for every COMPLETED webhook. At current volume it is fine, but `qrisPayments` is append-only (one row per QR attempt, never deleted), so the scan grows unbounded over the table's lifetime — every webhook gets slower forever. **Fix:** add `.index("by_xenditQrId", ["xenditQrId"])` to the `qrisPayments` table (`schema.ts`) and rewrite `findByQrId` to `withIndex(...).first()`. Cheap, additive, removes the only O(table) operation on the money path. Impact: Medium (latent perf/cost).

### I3 — Auto-mint effect can fire before the create round-trips
`QrisChargeDialog.tsx:79-85` auto-mints when `row === null`. The `creating` flag guards re-entry, but `creating` is in the same effect's closure and `row` stays `null` until the new `insertPending` row propagates through the subscription. The `if (creating) return` at `:82` covers the common case, but `creating` is not in the dep array (only `[open, row]`), so the guard relies on the closure value at fire time. In practice React batches and the `setCreating(true)` inside `mint()` runs synchronously enough; the local test (`QrisChargeDialog.test.tsx`) doesn't exercise the live create path (the action hook is provider-tolerant no-op under RTL). **Recommend:** add `creating` to the dep array OR use a `useRef` mint-guard to make double-mint structurally impossible, and confirm single-mint during the human-verify E2E. Impact: Low-Medium (worst case = a superseded extra pending row, which `expirePrior` handles — not a correctness bug, just a wasted Xendit call).

---

## 5. Refinements (Minor)

### R1 — `deferred-items.md` is now stale
The file documents the `_factory.ts` `by_component_location` `tsc -b` error as an open out-of-scope item. 84-05-SUMMARY auto-fix #1 fixed it (factory retyped to `TestConvex<typeof schema>`) and `npx tsc -p convex` is now clean (verified). Delete or mark resolved so it doesn't mislead a future reader.

### R2 — `findActiveByExternalId` also scans, but is index-scoped (acceptable)
`mutations.ts:253-267` correctly uses `withIndex("by_externalId", ...)` then sorts in JS — bounded by the per-day collision set, which is tiny. Fine as-is; noting only so it isn't confused with I2.

### R3 — `getQrisConfig` reads `businessSettings` `.first()` with no ordering
`queries.ts:61` does `ctx.db.query("businessSettings").first()`. The codebase treats `businessSettings` as a singleton, so this is consistent with the existing pattern, but `.first()` without an index/order is implicitly "lowest `_creationTime`". If a second settings row ever exists, the NMID could come from the wrong one. Pre-existing project convention; flag only.

### R4 — Convex queries do NOT re-run on env-var change (verification expectation)
`getQrisConfig` reads `process.env.QRIS_ENABLED` server-side. Flipping the env var in the Convex dashboard will NOT push to already-mounted clients until they re-subscribe/reload (prior-review R2). The human-verify checklist (84-05-SUMMARY step 3) correctly says "RELOAD". Keep that in the go-live runbook so the flip doesn't appear broken.

### R5 — `decideWebhookOutcome` treats `row.status === "expired"` as the only "superseded" signal
`mutations.ts:46`. A row could also be `paid` already (true replay) — that path is handled separately by the order-status idempotency guard, so it's fine, but the `superseded` boolean is narrowly `=== "expired"`. Correct for the current state machine; just noting the coupling for future provider work.

---

## 6. Design / UI-SPEC & CONTEXT Compliance (verified)

- **D-01 (env-var flag, server-read, defense-in-depth):** ✅ `getQrisConfig` reads `process.env.QRIS_ENABLED` (`queries.ts:63`); the action independently re-checks it (`actions.ts:25`); button gated on `qrisConfig?.enabled === true` (`OrderDetail.tsx`). Go-live = env flip, no code change.
- **D-02 (minimal needsReview badge, NO reconciliation UI):** ✅ `OrderDetail.tsx` renders a single inline warning `Badge` + `Tooltip(reviewReason)` next to order status. No list/filter/resolve flow. Deferred to Phase 77 as charted.
- **D-03 (single derived-state-machine dialog):** ✅ `QrisChargeDialog` derives `loading|active|paid|expired|error` from the `getActiveQrisPayment` subscription + a 1s tick; no local state-machine toggles. Reactive paid flip with no refresh (tested).
- **D-04 (split module layout mirroring grabfood):** ✅ `convex/integrations/qris/{provider,xendit,webhooks}.ts` + `convex/qrisPayments/{mutations,queries,actions}.ts`; route registered in `http.ts` alongside grabfood.
- **R1 (provider adapter):** ✅ `QrisProvider` interface + `xenditProvider`; `buildCreateQrBody` pure + tested; NO `"use node"`, `btoa` not `Buffer`, no module-top-level env/fetch (prior I1/R3).
- **R7 / pitfall #19 (role superset):** ✅ all three QRIS queries/the action use `["order_staff","manager","admin"]`; NMID folded into `getQrisConfig` (NOT `useBusinessSettings`, which is admin/manager-only); `useActiveQrisPayment` reads unconditionally at the top of `OrderDetail` (hooks-order, pitfall #9).
- **Bundle cap (pitfall #16):** ✅ `vite.config.ts` bumped 600→650 kB atomically with the `qrcode.react` dep; SUMMARY reports `vendor-*.js` 610.1/650 kB.

---

## 7. Architectural Risk Review

- **Public webhook attack surface:** Authenticated by constant-time `x-callback-token` compare (`verifyCallbackToken`, `webhooks.ts:18-24`); missing config OR missing header → 401 with NO state change (correctly diverges from grabfood's skip-on-missing). Token read only from `process.env`, never logged. Defensive JSON parse can't 500. **Low risk.** Residual: the `x-callback-token` header name and envelope shape (`{event,data}` vs flat) are A1/A2 assumptions parsed defensively but NOT yet confirmed against a real Xendit callback — locked behind the human-verify checkpoint. Acceptable given flag-off ship.
- **Idempotency under concurrent delivery:** Convex mutations are serializable; the `order.status === "PaymentReceived"` guard (`mutations.ts:184`) makes a duplicate a no-op after the first commits. Payment recorded BEFORE the throwable reserve, so an atomic rollback never loses the paid row. **Sound.**
- **Real-time subscription load:** `getActiveQrisPayment` is `by_order`-scoped (one order's rows) — negligible. `getQrisConfig` is a singleton read. No fan-out concern.
- **Schema:** Additive only (`qrisPayments` table + `businessSettings.qrisNmid?`). The append-only `qrisPayments` table motivates I2 (index `xenditQrId`).
- **Coupling:** Webhook → `recordPaidAndTransition` reuses `reserveStockForOrderInternal` and `logStatusTransition` rather than reimplementing — correct. Does NOT reuse `updatePayment` (no transition) or `moveForward` (auto-expedites). Good.

---

## 8. Over-Engineering Check

Proportionate to the requirement. The `getStatus` method on `QrisProvider` (`xendit.ts:75-90`) is unused (confirmation is webhook-only, cron sweep is out of scope) — it's interface completeness for the adapter contract, harmless, leave it. The dual `getActiveQrisPayment` / `getActiveQrisPaymentInternal` (public + internal mirror for tests) is a reasonable convex-test workaround. No gold-plating found.

---

## 9. Verdict

**APPROVE — 0 critical, 3 improvements, 5 refinements.**

All 8 prior-staffreview criticals are genuinely fixed in the shipped code; none regressed. Build (frontend + convex tsc) and the 36 QRIS tests are green locally. Before merge: delete the dead duplicate `useCreateQrisInvoice` in `useQris.ts` (I1) and ideally add the `by_xenditQrId` index (I2) — both are small, additive, and on the money path. Before flipping `QRIS_ENABLED` in prod: complete the Plan-05 human-verify E2E (lock the `x-callback-token` header + `xenditQrId` payload key against a real Xendit callback).

*Generated by /staffreview — Staff + Principal personas, codebase-verified against the shipped diff.*

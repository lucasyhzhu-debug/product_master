---
phase: 84-qris-payment-integration
plan: 04
subsystem: payments
tags: [qris, xendit, webhook, httpAction, constant-time, idempotency, security, tdd]

# Dependency graph
requires:
  - phase: 84-01 (Wave 0 RED scaffold)
    provides: "R4a verifyToken RED test (turns GREEN here)"
  - phase: 84-03 (mutations/queries/actions)
    provides: "recordPaidAndTransition({ xenditQrId?, externalId, amount, receiptId?, source?, rawPayload? }) → { transitioned }"
provides:
  - "verifyCallbackToken (pure, constant-time XOR; missing config/header → false → 401, diverges from grabfood skip-on-missing)"
  - "processWebhook(deps, token, body, expected) — token-first 401, runMutation in try/catch (no 500), defensive {event,data} unwrap, xenditQrId-primary + externalId fallback + rawPayload"
  - "handleXenditQrPayment httpAction (wires ctx.runMutation + process.env.XENDIT_WEBHOOK_TOKEN into processWebhook)"
  - "POST /api/xendit/qr-payment route registration in convex/http.ts"
affects: [84-05-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "httpAction handler split into an injectable-deps pure core (processWebhook) so the 4 handler behaviours are unit-testable without a live runtime (sidesteps convex-test Pitfall 5 — httpAction not callable via t.action)"
    - "Token-first auth: 401 returned BEFORE any parse/state-change/mutation call; missing config OR missing header → false (Xendit divergence from grabfood valid-on-missing)"
    - "runMutation wrapped in try/catch so a mutation throw never escapes as a 500; unmatchable COMPLETED returns 200 to stop Xendit retries (documented retry-semantics block)"
    - "Env-var-only secret (process.env.XENDIT_WEBHOOK_TOKEN), never DB credential row, never logged"

key-files:
  created:
    - convex/integrations/qris/webhooks.ts
    - convex/integrations/qris/__tests__/webhookHandler.test.ts
    - .planning/phases/84-qris-payment-integration/deferred-items.md
  modified:
    - convex/http.ts
    - convex/_generated/api.d.ts

key-decisions:
  - "Extracted the handler core into processWebhook(deps, token, body, expected) with an injectable runMutation, rather than testing via the convex-test http harness — gives deterministic spy assertions for the 4 staffreview-C6 behaviours without a live runtime (Pitfall 5)"
  - "verifyCallbackToken copied VERBATIM from 84-PATTERNS.md: missing config OR header → false (the Xendit-must-401 divergence from grabfood's valid-on-missing — SPEC R4a, RESEARCH Pitfall 4, threat T-84-09)"
  - "xenditQrId = evt.qr_id ?? evt.id (globally-unique primary match key, C8); externalId = evt.reference_id ?? evt.external_id (A4 fallback); rawPayload = raw body (A1/A2 forensics)"
  - "Defensive envelope: const evt = payload?.data ?? payload — unwraps the possible { event, data } Xendit wrapper (A2) before reading any field"
  - "200 for non-COMPLETED, matched, unmatched, AND caught-error paths; 401 ONLY for bad/missing token — the only non-2xx, which is the only response that forces Xendit redelivery"

requirements-completed: [R4, R4a]

# Metrics
duration: 12min
completed: 2026-05-21
---

# Phase 84 Plan 04: Xendit QRIS Inbound Webhook Summary

**Built the inbound Xendit QRIS webhook — a constant-time `x-callback-token` verifier (401 on missing/invalid, diverging from grabfood's valid-on-missing), an httpAction whose core records payment via Plan 03's idempotent mutation inside a try/catch so a throw never 500s, a handler-level test suite (401-no-call / non-COMPLETED / COMPLETED-once / unmatched-no-throw), and its route registration alongside the 6 grabfood routes — turning R4a + R4 GREEN.**

## Performance
- **Duration:** ~12 min
- **Completed:** 2026-05-21
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `verifyCallbackToken(header, expected)` — constant-time XOR loop copied verbatim from 84-PATTERNS.md. Missing config (`!expected`) OR missing header (`!header`) → `false`; length mismatch → `false`; content mismatch → `false`; exact match → `true`. Never uses `===` (timing attack, T-84-10). The CRITICAL divergence: grabfood returns valid-on-missing; Xendit returns `false` → the handler 401s with NO state change (SPEC R4a, RESEARCH Pitfall 4, threat T-84-09).
- `processWebhook(deps, token, body, expectedToken)` — the injectable-deps core: (1) verify token FIRST → `{ status: 401 }` before any parse/mutation/state change; (2) parse defensively (`try/catch`, invalid body → no 500); (3) `const evt = payload?.data ?? payload` unwraps the `{ event, data }` envelope (A2); (4) only `evt.status === "COMPLETED"` calls `deps.runMutation` with `xenditQrId: evt.qr_id ?? evt.id` (primary, C8), `externalId: evt.reference_id ?? evt.external_id` (fallback, A4), `amount`, `receiptId`, `source`, `rawPayload: body` (A1/A2) — wrapped in try/catch so a throw is logged and swallowed; (5) `200` for non-COMPLETED / matched / unmatched / caught-error.
- `handleXenditQrPayment` httpAction — wires `ctx.runMutation(internal.qrisPayments.mutations.recordPaidAndTransition)` and `process.env.XENDIT_WEBHOOK_TOKEN` into `processWebhook`, reads `x-callback-token`, returns `new Response(body, { status })`. Static imports only (pitfall #8); secret env-var-only, never logged, no `resolveHmacSecret` DB row.
- Retry semantics documented in a block comment (staffreview I3): only a non-2xx (the 401) forces Xendit redelivery; honored mismatch and unmatchable COMPLETED both ACK 200 to stop retries; a caught post-record throw stays 200 because Plan 03 records payment durably before any throwable step.
- `convex/integrations/qris/__tests__/webhookHandler.test.ts` (staffreview C6, 10 tests): (a) missing/invalid/missing-config token → 401 + runMutation spy NOT called; (b) non-COMPLETED → 200, no call; (c) COMPLETED → 200 + spy called once with the exact `{ xenditQrId, externalId, amount, receiptId, source, rawPayload }`; (c) `{event,data}` envelope unwrap; (d) `{transitioned:false}` unmatched → 200, no throw; (d) mutation throw → 200 caught; invalid JSON → 200 no call.
- `POST /api/xendit/qr-payment` registered in `convex/http.ts` with a banner comment, alongside the 6 grabfood routes. `npx convex codegen` re-run; `_generated/api.d.ts` regenerated.

## Task Commits
1. **Task 1: verifyCallbackToken + handleXenditQrPayment + handler tests** — `dd78b95d` (feat)
2. **Task 2: register POST /api/xendit/qr-payment in http.ts** — `185be750` (feat)

## Verification
- `npm run test -- convex/integrations/qris/__tests__/verifyToken.test.ts convex/integrations/qris/__tests__/webhookHandler.test.ts` → **15 passed** (5 R4a + 10 handler-level). R4a GREEN; handler 401/non-COMPLETED/COMPLETED-once/unmatched-no-throw all GREEN.
- `npm run type-check` (Task 2 verify gate) → exit 0.
- `npx tsc --noEmit -p convex` → no errors in `http.ts` or `integrations/qris/webhooks.ts`; the only 3 convex-tree errors are confined to the pre-existing `_factory.ts` (Plan-01 artifact, see Deferred Issues).
- Acceptance greps: `webhooks.ts` contains `export function verifyCallbackToken`, `status: 401`/401-path, `request.headers.get("x-callback-token")`, calls `recordPaidAndTransition` only after the token check passing both `xenditQrId` and `externalId` and `rawPayload: body`, wraps `ctx.runMutation` (via `deps.runMutation`) in try/catch, reads `process.env.XENDIT_WEBHOOK_TOKEN`, no `resolveHmacSecret`, no 200-before-token-check. `http.ts` contains `import { handleXenditQrPayment }` and `path: "/api/xendit/qr-payment"` with `method: "POST"`.

## Deviations from Plan

### Auto-fixed Issues
None — both tasks executed as written. The handler test used the plan-sanctioned option (b) (extract `processWebhook` with an injectable `runMutation`) rather than option (a) (convex-test http harness), because the deterministic spy gives cleaner C6 assertions and sidesteps the convex-test `t.action(internal.*)` resolver bug (Pitfall 5).

## Deferred Issues
- **Pre-existing `_factory.ts` convex tsc errors (3) block `npm run build`'s `tsc -b`.** `convex/qrisPayments/__tests__/_factory.ts:232-233` — `withIndex("by_component_location", ...)` fails type resolution despite the index existing at `schema.ts:953-955`. This is a Plan-01 RED-scaffold artifact, documented out-of-scope in `84-03-SUMMARY.md` (lines 89, 108), and pre-dates this plan. It does NOT affect vitest (qris suites pass) nor frontend `npm run type-check` (exit 0). Logged to `deferred-items.md` for the phase verification/cleanup pass. Out of scope per the executor scope boundary (unrelated test-factory file, not caused by the webhook work).

## Threat Flags
None — the implementation matches the plan's `<threat_model>` exactly. T-84-09 (forged webhook) → constant-time verify + 401-no-state-change (handler-tested); T-84-10 (timing attack) → XOR loop, never `===`; T-84-11 (replay) → delegated to Plan 03's status guard; T-84-12 (secret) → `process.env` only, never logged; T-84-13 (envelope) → `payload?.data ?? payload` + raw body + xenditQrId-first; T-84-19 (DoS retry loop) → try/catch + unmatchable → 200.

## Next Phase Readiness
- Plan 05 (frontend): the inbound paid path is complete end-to-end — a real Xendit COMPLETED callback now flips the order to PaymentReceived via the registered route. The `QrisChargeDialog` paid-flip will be driven reactively by `getActiveQrisPayment` (84-03). A1/A2 (exact header name + envelope) should be confirmed against one real Test-Mode callback before go-live; the parser already unwraps `{event,data}` and matches xenditQrId-first to be resilient.

## Self-Check: PASSED
- `convex/integrations/qris/webhooks.ts` present on disk.
- `convex/integrations/qris/__tests__/webhookHandler.test.ts` present on disk.
- `convex/http.ts` contains `/api/xendit/qr-payment`.
- Task commits `dd78b95d` + `185be750` present in git log.
- `npm run test -- convex/integrations/qris/__tests__/{verifyToken,webhookHandler}.test.ts` → 15 passed.

---
*Phase: 84-qris-payment-integration*
*Completed: 2026-05-21*

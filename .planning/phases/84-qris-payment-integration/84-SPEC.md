# Phase 84: QRIS Payment Integration (Xendit) — Specification

**Created:** 2026-05-21
**Ambiguity score:** 0.129 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

Order staff can charge an `AwaitingPayment` order in person by generating a dynamic, exact-amount QRIS QR code (via Xendit); when the customer scans and pays, an Xendit webhook drives the order from `AwaitingPayment` to `PaymentReceived` automatically — replacing the manual mark-paid step for in-person payments.

## Background

Order payment is manual today. `orderNumber` (MMDD-NNN, generated in `convex/orders/helpers/customerResolution.ts:55`) doubles as a bank-transfer reference; the customer transfers; staff manually call `updatePayment` (`convex/orders/mutations/statusUpdates.ts:230`) to set `paymentStatus`/`paymentMethod`. No payment-gateway integration exists. The order status workflow already includes `AwaitingPayment → PaymentReceived`, and the `PaymentReceived` transition already reserves packaging stock (`reserveStockForOrderInternal`).

`convex/http.ts` already hosts 6 GrabFood webhook routes following a `http.route({ path, method, handler: httpAction })` pattern (`convex/integrations/grabfood/webhooks.ts`) — the model this phase mirrors. External integrations follow a `convex/integrations/{platform}/` module pattern.

**Validated by spike (2026-05-21):** the full create→pay→confirm loop was proven against Xendit Test Mode (`scripts/qris-sandbox-poc.mjs`, `scripts/qris-sandbox-server.mjs`). `POST /qr_codes` honors exact `amount` + `external_id` (= `orderNumber`); the paid signal arrives only via webhook (the QR flips `ACTIVE→INACTIVE` on payment) carrying `status: COMPLETED`, `payment_details.receipt_id` (RRN), and `source` (paying wallet, e.g. DANA). Research: `docs/research/2026-05-21-qris-protocol-and-fields.md`.

The primary deliverables that do NOT exist yet: a `QrisProvider`/Xendit adapter, a `qrisPayments` table, a create-QR action, an Xendit webhook route, and the order-detail QR dialog.

## Requirements

1. **QrisProvider adapter (Xendit impl)**: A provider-agnostic interface with one Xendit implementation.
   - Current: No payment-gateway code exists. Integrations live in `convex/integrations/{platform}/`.
   - Target: `convex/integrations/qris/` exposes a `QrisProvider` interface (`createInvoice`, `getStatus`) and a `xenditProvider` implementation calling the Xendit QR Codes API (Basic auth, `POST /qr_codes`, `type: "DYNAMIC"`, `currency: "IDR"`, `external_id` = `orderNumber`, `amount` = `finalTotal`).
   - Acceptance: an action using `xenditProvider` creates a real QR against a Test Mode key and returns `{ xenditQrId, qrString, expiresAt }`; a test asserts the request body shape (`type DYNAMIC`, `external_id` = orderNumber, `amount` = finalTotal).

2. **qrisPayments table**: Per-order QR-attempt state.
   - Current: No such table. `orders` carries only `paymentStatus`/`paymentMethod`.
   - Target: new `qrisPayments` table — `orderId`, `provider`, `externalId` (= orderNumber), `xenditQrId`, `qrString`, `amount`, `status` (`pending`|`paid`|`expired`), `receiptId?`, `source?`, `expiresAt`, `paidAt?`, `needsReview?` (boolean) + `reviewReason?`; indexes `by_order`, `by_externalId`.
   - Acceptance: schema compiles (`npm run type-check`); `createQrisInvoice` inserts a `pending` row linked to `orderId`; `getActiveQrisPayment(orderId)` returns the latest non-expired row reactively.

3. **Create-QR action (state-guarded)**: `createQrisInvoice(orderId)`.
   - Current: None.
   - Target: a Convex action that guards `order.status === "AwaitingPayment"` and `finalTotal ≥ 1500`, calls `provider.createInvoice`, and inserts a `pending` `qrisPayments` row with `expiresAt = now + 30min`. A fresh call supersedes any prior `pending` row for the order (prior row marked `expired`).
   - Acceptance: calling on a non-`AwaitingPayment` order throws and writes nothing; calling on an `AwaitingPayment` order returns the QR and creates exactly one active `pending` row; a second call expires the first.

4. **Webhook confirmation (idempotent, honor-always, flag mismatches)**: `POST /api/xendit/qr-payment` httpAction.
   - Current: `http.ts` hosts GrabFood webhooks; no Xendit route.
   - Target: a route that verifies the `x-callback-token` header against `XENDIT_WEBHOOK_TOKEN`; on `status: "COMPLETED"`, matches `qrisPayments` by `externalId`, records `receiptId`/`source`/`paidAt` and sets `status: "paid"`, then drives `AwaitingPayment → PaymentReceived` **exactly once**. If the order is already `PaymentReceived`, the payment is recorded but the transition (and stock reservation) does NOT re-run. The customer's payment is **always honored**; if the webhook `amount` ≠ the matched `qrisPayments.amount`, or the matched QR was already `expired`/superseded, the payment is still recorded as paid AND `needsReview: true` + `reviewReason` is set for manual reconciliation.
   - Acceptance: a `COMPLETED` payload with a valid token transitions the order once and reserves stock once; a replayed/duplicate payload does not re-transition or double-reserve; an invalid/missing token returns HTTP 401 with no state change; an amount-mismatch payload records payment AND flags `needsReview`.

5. **Order-detail QR dialog (frontend)**: "Charge via QRIS".
   - Current: Order detail page is gated `requiredPermission="canAccessOrders"`; only manual `updatePayment` exists.
   - Target: a "Charge via QRIS" button visible **only** when `order.status === "AwaitingPayment"` AND the `QRIS_ENABLED` flag is on; it opens a dialog rendering `qrString` via `qrcode.react` plus the amount, the merchant NMID/name (if set), and a 30-minute countdown. The dialog subscribes to `getActiveQrisPayment(orderId)`; when the webhook marks the row `paid`, the dialog flips to a paid state reactively (no manual refresh). On expiry, the dialog offers "Regenerate".
   - Acceptance: button is absent when the flag is off OR status ≠ `AwaitingPayment`; the dialog renders a scannable QR; after a simulated Test Mode payment, the dialog shows paid without refresh; "Regenerate" creates a new `pending` row and expires the prior one.

6. **Feature flag + environment config (sandbox-first)**: Gated rollout.
   - Current: No QRIS config or flag.
   - Target: Convex env vars `XENDIT_API_KEY` (Test Mode key initially), `XENDIT_WEBHOOK_TOKEN`, and a `QRIS_ENABLED` flag gating the UI button + create action. Validated in **dev** first, then deployed to prod behind the flag with the Test Mode key, then flipped to the live key + flag-on (going live = env change only, no code change).
   - Acceptance: with `QRIS_ENABLED` off, the button is absent and no QRIS path is reachable from the UI; flipping it on reveals the button; switching Test→Live requires only changing `XENDIT_API_KEY` (no code change).

7. **Merchant NMID display (BI rule)**: Optional under-QR identifier.
   - Current: `businessSettings` has `businessName`/`address`/`npwp` but no NMID.
   - Target: optional `businessSettings.qrisNmid` field; when set, the dialog shows the NMID + merchant name beneath the QR (Bank Indonesia display convention).
   - Acceptance: when `qrisNmid` is set, it renders under the QR; when unset, the dialog renders without it and without error.

## Boundaries

**In scope:**
- `QrisProvider` interface + `xenditProvider` implementation (`convex/integrations/qris/`)
- `qrisPayments` table + indexes; optional `businessSettings.qrisNmid`
- `createQrisInvoice` action (guarded, supersede-on-regenerate)
- `POST /api/xendit/qr-payment` webhook route (idempotent, token-verified, flag-on-mismatch)
- Order-detail "Charge via QRIS" button + dialog (`qrcode.react`, countdown, reactive paid flip, regenerate)
- `QRIS_ENABLED` feature flag + env-var secret config
- End-to-end validation in dev against Xendit Test Mode

**Out of scope:**
- Partial payments — dynamic exact-amount QR cannot under/over-pay; `paymentStatus: "Partial"` not produced by QRIS
- MDR-fee accounting / settlement-reconciliation report — separate accounting concern, no expense-ledger wiring this phase
- Customer-facing public pay page (`/pay/:order`) — touchpoint is in-person POS only
- Server-side cron status sweep — confirmation is webhook-driven; staff watch the screen in person
- Midtrans / InterActive provider implementations — interface leaves room; only Xendit built now
- Refunds / voids / payment cancellation — not part of accept-payment flow
- KYB onboarding + live-key go-live — operational step; this phase ships flag-off with the Test key (go-live is an env change, not code)
- Static QR codes — dynamic only

## Constraints

- **Role alignment (pitfall #19):** the `roles` on `createQrisInvoice` and `getActiveQrisPayment` MUST be a superset of the role set that `canAccessOrders` resolves to (`src/lib/types.ts`), or manager/staff mounts crash the page.
- **Bundle cap (pitfall #16):** `qrcode.react` is a new dependency; if it pushes the `vendor-*.js` chunk past its cap in `vite.config.ts`, bump the cap or split it via `manualChunks` in the same PR.
- **Idempotency:** the webhook handler MUST be idempotent — match by `externalId`, guard against re-running the transition when the order is already `PaymentReceived` (no double stock reservation).
- **Convex constraints:** secrets via Convex env vars only (never client-exposed); no dynamic `import()` in Convex (pitfall #8); `httpAction` for the webhook, `action` for the outbound Xendit call (queries/mutations cannot `fetch`).
- **Exact-amount:** QR `amount` = `orders.finalTotal`; minimum 1500 IDR (Xendit floor).
- `npm run build` and `npm run type-check` MUST pass before merge.

## Acceptance Criteria

- [ ] `npm run type-check` and `npm run build` pass
- [ ] `createQrisInvoice` rejects orders not in `AwaitingPayment` (throws, no row written)
- [ ] `createQrisInvoice` against a Test Mode key returns a renderable `qrString` and inserts one `pending` `qrisPayments` row; a second call expires the first
- [ ] "Charge via QRIS" button appears ONLY when `order.status === "AwaitingPayment"` AND `QRIS_ENABLED` is on
- [ ] Webhook with a valid `x-callback-token` + `COMPLETED` transitions the order `AwaitingPayment → PaymentReceived` exactly once, reserving stock once
- [ ] A replayed/duplicate webhook does not re-transition the order or double-reserve stock
- [ ] A webhook with an invalid/missing `x-callback-token` returns HTTP 401 and changes no state
- [ ] A payment whose webhook `amount` ≠ `finalTotal`, or for a superseded/expired QR, is still recorded as paid AND flags the row `needsReview` with a reason
- [ ] The dialog flips to a paid state reactively (no manual refresh) when the webhook confirms payment
- [ ] An expired QR offers "Regenerate"; regenerating creates a new `pending` row and expires the prior
- [ ] Switching Xendit Test→Live requires only changing `XENDIT_API_KEY` (no code change)
- [ ] End-to-end validated in dev against Xendit Test Mode: simulate-payment → order reaches `PaymentReceived`

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                              |
|--------------------|-------|------|--------|----------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | Specific outcome; validated by live spike          |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | Explicit in/out lists; trigger locked to AwaitingPayment |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Role alignment, bundle cap, idempotency, env flag  |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | 12 pass/fail criteria                              |
| **Ambiguity**      | 0.129 | ≤0.20| ✓      | Gate passed                                        |

Status: ✓ = met minimum

## Interview Log

| Round | Perspective     | Question summary                              | Decision locked                                                                 |
|-------|-----------------|-----------------------------------------------|---------------------------------------------------------------------------------|
| 0     | Pre-spec (brainstorm + spike) | Provider? Touchpoint? Confirmation?           | Xendit behind adapter; in-person POS only; webhook-driven (validated)           |
| 1     | Boundary Keeper | From which order state can staff generate a QR? | `AwaitingPayment` only — staff submit the order first                          |
| 1     | Failure Analyst | Late/stale/duplicate webhook handling?        | Idempotent, honor any COMPLETED match, never double-transition, FLAG mismatches (safest for customer) |
| 1     | Boundary Keeper | Rollout strategy?                             | Sandbox-first, feature-flagged (`QRIS_ENABLED`), dev-tested first; live = env flip |

---

*Phase: 84-qris-payment-integration*
*Spec created: 2026-05-21*
*Next step: /gsd-discuss-phase 84 — implementation decisions (adapter file layout, dialog component structure, flag wiring)*

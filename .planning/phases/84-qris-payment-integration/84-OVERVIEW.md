# Phase 84 — QRIS Payment Integration (Xendit)

> Goal: Accept **in-person QRIS payments** for orders via dynamic, exact-amount QR
> codes, using **Xendit** as the PJSP/acquirer. Staff generate a QR on the order
> screen; the customer scans and pays; an Xendit webhook drives the order to
> `PaymentReceived` automatically.

## Why this phase exists

Today order payment is manual: `orderNumber` (MMDD-NNN) doubles as a bank-transfer
reference, the customer transfers, and staff manually mark the order paid
(`updatePayment` in `convex/orders/mutations/statusUpdates.ts`). There is no payment
gateway integration of any kind. QRIS is the Indonesian national QR-payment standard;
accepting it at point of sale (bazaars, pickup counter) removes the manual
transfer-reconciliation step for in-person customers and captures a payment reference
(RRN) automatically.

## Validated by spike (2026-05-21)

The full loop was proven end-to-end against **Xendit Test Mode** before this phase
was specced:
- `scripts/qris-sandbox-poc.mjs` — CLI: create dynamic QR → simulate payment → confirm.
- `scripts/qris-sandbox-server.mjs` — visual demo (localhost:4399), shown in Chrome.

Confirmed: `POST /qr_codes` honors exact `amount` + `external_id` (= `orderNumber`);
the simulate-payment endpoint returns `status: COMPLETED` with
`payment_details.receipt_id` (RRN) + `source` (paying wallet, e.g. DANA); the QR object
flips `ACTIVE → INACTIVE` on payment, so **the paid signal arrives only via webhook**,
not status polling.

## Locked decisions (pre-spec)

- **Provider:** Xendit QR Codes API, behind a thin `QrisProvider` adapter so
  Midtrans/InterActive could swap later. Follows `convex/integrations/` pattern.
- **Touchpoint:** in-person POS only — no public pay page, no cron sweep.
- **Confirmation:** webhook via `convex/http.ts` httpAction (mirror
  `convex/integrations/grabfood/webhooks.ts`), verified by `x-callback-token`.
- **QR type:** DYNAMIC, exact amount = `orders.finalTotal`.
- **On paid:** drive existing `AwaitingPayment → PaymentReceived` transition
  (reuses stock-reservation side effect; must be idempotent).
- **Out of scope:** partial payments, MDR-fee accounting, customer-facing pay page,
  Midtrans implementation.

## Supporting artifacts

- Research: `docs/research/2026-05-21-qris-protocol-and-fields.md`
- Sandbox harness: `scripts/qris-sandbox-poc.mjs`, `scripts/qris-sandbox-server.mjs`

---

*Next: `84-SPEC.md` (this workflow) → `/gsd-discuss-phase 84` → plan → execute.*

# Phase 84: QRIS Payment Integration (Xendit) - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Accept **in-person QRIS payments** for `AwaitingPayment` orders via dynamic, exact-amount QR codes through **Xendit**. Staff generate a QR on the order detail screen; the customer scans and pays; an Xendit webhook drives the order `AwaitingPayment → PaymentReceived` automatically (reusing the existing stock-reservation side effect). Ships flag-off with a Test Mode key — go-live is an env change, not a code change.

This discussion clarified HOW to implement the 7 SPEC-locked requirements. It did not add new capabilities.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `84-SPEC.md` for full requirements, boundaries, and acceptance criteria (ambiguity score 0.129, gate ≤ 0.20).

Downstream agents MUST read `84-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `QrisProvider` interface + `xenditProvider` implementation (`convex/integrations/qris/`)
- `qrisPayments` table + indexes; optional `businessSettings.qrisNmid`
- `createQrisInvoice` action (guarded, supersede-on-regenerate)
- `POST /api/xendit/qr-payment` webhook route (idempotent, token-verified, flag-on-mismatch)
- Order-detail "Charge via QRIS" button + dialog (`qrcode.react`, countdown, reactive paid flip, regenerate)
- `QRIS_ENABLED` feature flag + env-var secret config
- End-to-end validation in dev against Xendit Test Mode

**Out of scope (from SPEC.md):**
- Partial payments; MDR-fee accounting / settlement reconciliation report
- Customer-facing public pay page (`/pay/:order`)
- Server-side cron status sweep (confirmation is webhook-driven)
- Midtrans / InterActive provider implementations (interface leaves room; only Xendit built)
- Refunds / voids / payment cancellation
- KYB onboarding + live-key go-live (operational; ships flag-off with Test key)
- Static QR codes

</spec_lock>

<decisions>
## Implementation Decisions

### Flag wiring (`QRIS_ENABLED`)
- **D-01:** `QRIS_ENABLED` lives as a **Convex env var, read server-side**. A new Convex query (e.g. `isQrisEnabled` / `getQrisConfig`) reads `process.env.QRIS_ENABLED` and returns a boolean reactively to the frontend; the `createQrisInvoice` action **independently enforces the same env check** server-side (defense in depth — the button is not the only gate). Go-live = flip the env var in the Convex dashboard, no rebuild/redeploy. **Rejected:** `businessSettings` DB flag (would make go-live a DB edit, not the SPEC's "env change only"); `VITE_QRIS_ENABLED` build-time var (needs a frontend rebuild to flip, not reactive).
  - **Role constraint (pitfall #19):** the flag query MUST NOT crash `order_staff`/`manager` mounts — its `roles` must cover the set `canAccessOrders` resolves to (`order_staff`, `manager`, `admin`; `src/lib/types.ts`). Same superset rule applies to `createQrisInvoice` and `getActiveQrisPayment`.

### needsReview surfacing
- **D-02:** **Minimal inline badge only** on the order detail when the order's active/most-recent `qrisPayments` row has `needsReview === true` (show `reviewReason` inline/on-hover). This is an **INDICATOR, not a reconciliation surface** — a deliberate, minimal extension beyond SPEC's "reconciliation UI out of scope." The planner must NOT build a list/filter/resolve flow or dashboard. Full reconciliation tooling remains deferred to **Phase 77 (Data Health Dashboard)**.

### QR dialog structure
- **D-03:** **Single `QrisChargeDialog` component** with an internal state machine driven by the `getActiveQrisPayment(orderId)` subscription:
  - **active** — render `qrString` (`qrcode.react`) + amount + optional NMID/merchant name + 30-min countdown
  - **paid** — flips reactively when `row.status === "paid"` (no manual refresh)
  - **expired** — offers **Regenerate** → calls `createQrisInvoice`, which supersedes the prior `pending` row
  - Button mounts near the existing `PaymentMethodButtons` on the order detail page; visible **only** when `order.status === "AwaitingPayment"` AND `QRIS_ENABLED` is on.

### Adapter file layout
- **D-04:** **Split module mirroring `convex/integrations/grabfood/`:**
  - `convex/integrations/qris/provider.ts` — `QrisProvider` interface (`createInvoice`, `getStatus`)
  - `convex/integrations/qris/xendit.ts` — `xenditProvider` impl (Basic auth, `POST /qr_codes`, `type DYNAMIC`, `currency IDR`, `fetch` in action context)
  - `convex/integrations/qris/webhooks.ts` — `httpAction` handler (`x-callback-token` verify, idempotent transition), mirroring grabfood's `validateHmacSignature` shape adapted to constant-time token compare
  - Table query/mutation + `createQrisInvoice` action live in a `convex/qrisPayments/` feature module (next to the table)
  - Webhook route registered in `convex/http.ts` alongside the 6 grabfood routes

### Claude's Discretion
- Exact query/file names, countdown rendering details, badge placement at the pixel level, and whether the create-action file sits in `integrations/qris/actions.ts` vs `qrisPayments/actions.ts` — planner decides, keeping consistent with existing conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase artifacts
- `.planning/phases/84-qris-payment-integration/84-SPEC.md` — Locked requirements (7), boundaries, acceptance criteria. **Read first.**
- `.planning/phases/84-qris-payment-integration/84-OVERVIEW.md` — Goal + locked pre-spec decisions (provider, touchpoint, confirmation model).

### Research & validated spike
- `docs/research/2026-05-21-qris-protocol-and-fields.md` — QRIS protocol + Xendit QR Codes API field mapping.
- `scripts/qris-sandbox-poc.mjs` — CLI harness: create dynamic QR → simulate payment → confirm (validated against Xendit Test Mode 2026-05-21).
- `scripts/qris-sandbox-server.mjs` — visual demo harness (localhost:4399).

### Integration patterns (codebase)
- `convex/integrations/grabfood/webhooks.ts` — webhook `httpAction` model to mirror (token/HMAC verify via Web Crypto, handler shape).
- `convex/http.ts` — route registration (`http.route({ path, method, handler })`; 6 grabfood routes are the template).
- `convex/orders/mutations/statusUpdates.ts` (~L230 `updatePayment`) — existing `AwaitingPayment → PaymentReceived` transition + `paymentStatus`/`paymentMethod` writes.
- `convex/orders/mutations/inventoryIntegration.ts:219` (`reserveStockForOrderInternal`) — stock-reservation side effect fired on `PaymentReceived`; **the idempotency target** (must not re-run on duplicate webhook).
- `convex/orders/helpers/customerResolution.ts:55` — `orderNumber` (MMDD-NNN) generation = the `externalId` sent to Xendit.
- `src/lib/types.ts` (`canAccessOrders`, ~L756/779/802) — resolves to `{order_staff, manager, admin}`; the role superset constraint for all new QRIS queries/mutations/actions (pitfall #19).
- `convex/businessSettings/queries.ts`, `convex/businessSettings/mutations.ts`, `src/hooks/convex/useBusinessSettings.ts` — home for the optional `qrisNmid` field + display hook.
- `vite.config.ts` — vendor bundle caps; `qrcode.react` is a new dep (pitfall #16 — bump cap or `manualChunks` split in the same PR).

### Project rules (CLAUDE.md Common Pitfalls)
- #8 — no dynamic `import()` in Convex (static only).
- #16 — vendor bundle cap (qrcode.react).
- #19 — backend `roles` must align with the route's `requiredPermission`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `validateHmacSignature` in `convex/integrations/grabfood/webhooks.ts` — adapt its Web Crypto + constant-time compare for `x-callback-token` verification.
- `PaymentMethodButtons` + order-detail dialog components (`src/components/orders/*Dialog.tsx`) — sibling patterns for the new "Charge via QRIS" button + dialog.
- `useBusinessSettings` hook — for reading `qrisNmid` (and the new flag if ever colocated).
- Existing `AwaitingPayment → PaymentReceived` transition + `reserveStockForOrderInternal` — **reused, not reimplemented**; the webhook drives this exactly once.

### Established Patterns
- `convex/integrations/{platform}/` module layout (gobiz, grabfood) — QRIS mirrors it.
- `httpAction` webhooks registered in `convex/http.ts`.
- Convex env-var secrets read via `process.env` inside actions (see `gobiz/adapter.ts`, `grabfood/adapter.ts`).
- `protectedQuery`/`protectedMutation` with explicit `roles`.

### Integration Points
- Order detail page — new button + `QrisChargeDialog` + `needsReview` badge.
- `convex/http.ts` — new `POST /api/xendit/qr-payment` route.
- `statusUpdates.ts` transition — driven by the webhook (idempotent guard when already `PaymentReceived`).
- `convex/schema.ts` — new `qrisPayments` table + indexes (`by_order`, `by_externalId`) + optional `businessSettings.qrisNmid`.
- Convex env vars — `XENDIT_API_KEY`, `XENDIT_WEBHOOK_TOKEN`, `QRIS_ENABLED`.

### Blast Radius (from graphify)
Graph is **stale** (built 2026-05-08, ~317h old, pre-Phase-82) and the QRIS symbols do not exist yet, so a fan-in table would mislead. Qualitative note: `reserveStockForOrderInternal()` (`convex/orders/mutations/inventoryIntegration.ts:219`, community 7) is the **idempotency-critical** side effect on the `PaymentReceived` transition — the webhook must guarantee it fires at most once per order. `businessSettings` is consumed via `useBusinessSettings()` (community 184). Not re-querying; integration touchpoints enumerated in Canonical References above.

</code_context>

<specifics>
## Specific Ideas

- QR rendering via `qrcode.react` (SPEC-named).
- 30-minute QR expiry (`expiresAt = now + 30min`).
- NMID + merchant name displayed under the QR per Bank Indonesia display convention (only when `businessSettings.qrisNmid` is set).
- `external_id` = `orderNumber` (MMDD-NNN); `amount` = `orders.finalTotal` (minimum 1500 IDR, Xendit floor).
- Customer payment is **always honored** — amount-mismatch / superseded-QR cases record `paid` AND set `needsReview` + `reviewReason`, never reject.
- Go-live = swap `XENDIT_API_KEY` Test→Live + flip `QRIS_ENABLED`; no code change.

</specifics>

<deferred>
## Deferred Ideas

- **Full `needsReview` reconciliation surface** (filter/resolve actions, dedicated view) → **Phase 77 (Data Health Dashboard)**. This phase ships only the minimal badge indicator (D-02).
- All SPEC out-of-scope items remain deferred: partial payments, MDR-fee accounting / settlement reconciliation report, customer-facing pay page, cron status sweep, Midtrans/InterActive providers, refunds/voids, static QR, KYB live-key go-live.

</deferred>

---

*Phase: 84-qris-payment-integration*
*Context gathered: 2026-05-21*

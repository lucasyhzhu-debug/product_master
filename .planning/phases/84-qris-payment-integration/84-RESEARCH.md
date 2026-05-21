# Phase 84: QRIS Payment Integration (Xendit) — Research

**Researched:** 2026-05-21
**Domain:** Payment-gateway integration (Xendit QR Codes API) + Convex httpAction webhooks + reactive React dialog
**Confidence:** HIGH (spike-validated loop + codebase anchors verified line-by-line this session)

## Summary

This phase has a **validated end-to-end spike** (`scripts/qris-sandbox-poc.mjs`, `scripts/qris-sandbox-server.mjs`) proven against Xendit Test Mode on 2026-05-21, and a thorough field-mapping research doc. My job was to confirm the spike's findings against the actual codebase, surface drift, and map the exact files/patterns the planner must follow. **The spike's request/response/webhook shapes are accurate and should be trusted verbatim.** The codebase anchors in CONTEXT.md are accurate, with three corrections/refinements the planner MUST act on (below).

The integration is a near-clone of the existing `convex/integrations/grabfood/` module: a webhook `httpAction` in `convex/http.ts`, Web Crypto for signature/token verification, env-var secrets read inside actions. The novel parts are the `qrisPayments` table, the outbound create-QR action, the constant-time `x-callback-token` compare, and a single reactive `QrisChargeDialog`.

**Primary recommendation:** Mirror `grabfood/webhooks.ts` structurally. Extract the token-verify as a standalone exported pure function (test it like `convex/__tests__/hmac.test.ts`). Drive the paid transition through a **dedicated internal mutation** with the existing `oldStatus !== "PaymentReceived"` guard — **do NOT reuse `moveForward`** (it auto-expedites due-soon orders to BeingPrepared, wrong for a payment webhook). Install `qrcode.react@4.2.0` and bump the `vendor-*.js` cap to 650 kB in the same PR.

**Three corrections to CONTEXT.md anchors (verified this session):**
1. `updatePayment` (`statusUpdates.ts:230`) only patches `paymentStatus`/`paymentMethod` — it does **NOT** drive the status transition or reserve stock. The real transition + `reserveStockForOrderInternal` call lives in `updateStatus` (`:140`) and `moveForward` (`:437`). The webhook needs its own internal mutation, not `updatePayment`.
2. `businessSettings.queries.get` is gated `["admin", "manager"]` — **order_staff cannot read it**. The dialog runs under `canAccessOrders` (= order_staff+manager+admin). The planner MUST add an order_staff-accessible read path for `qrisNmid` (a new narrow query, or fold NMID into the `getQrisConfig` flag query). Do NOT call `useBusinessSettings()` from the dialog — it will crash order_staff mounts (pitfall #19).
3. The old research doc (`docs/research/2026-05-21-qris-protocol-and-fields.md`) documents **InterActive/qris.online (poll-based, no RRN)** — this is the PRE-PIVOT provider. The spike pivoted to **Xendit (webhook-based, returns RRN via `payment_details.receipt_id`)**. Use the doc for QRIS/EMVCo protocol fundamentals (TLV tags, NMID, dynamic vs static) ONLY; use the **spike scripts** as the source of truth for the actual API shapes. Flag any field-mapping table from §3/§4 of that doc as InterActive-specific, not Xendit.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Outbound `POST /qr_codes` (create QR) | API / Backend (Convex `action`) | — | Only actions can `fetch`; secret key never client-exposed |
| QR-attempt state (`qrisPayments`) | Database (Convex table) | — | Per-order durable state, queried reactively by the dialog |
| Webhook receipt + paid transition | API / Backend (`httpAction` + internal mutation) | Database | Mutates order + reserves stock; idempotency lives here |
| `x-callback-token` verify | API / Backend (Web Crypto in action runtime) | — | Constant-time compare; secret server-side only |
| QR rendering + countdown + paid flip | Browser / Client (`QrisChargeDialog`) | Frontend reactive subscription | `qrcode.react` renders client-side; reactivity from Convex query |
| `QRIS_ENABLED` flag gate | API / Backend (env var, read server-side) | Browser (button visibility) | D-01: env-var, defense-in-depth (action re-checks) |
| NMID display | Database (`businessSettings.qrisNmid`) | Browser | Optional config echoed under QR (BI convention) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `qrcode.react` | 4.2.0 | Render `qr_string` as scannable QR canvas | SPEC-named (D-03); current stable, last published 2024-12-11 `[VERIFIED: npm view qrcode.react]` |
| Convex `httpAction` | (in-tree) | Xendit webhook endpoint | Existing pattern; 6 grabfood routes are the template `[VERIFIED: convex/http.ts]` |
| Convex `action` | (in-tree) | Outbound Xendit `fetch` | Queries/mutations cannot `fetch` `[CITED: Convex constraint, CLAUDE.md pitfall]` |
| Web Crypto (`crypto.subtle`) | (runtime) | Token/HMAC verify in action runtime | Already used by `validateHmacSignature` `[VERIFIED: grabfood/webhooks.ts:35]` |
| Xendit QR Codes API | `api.xendit.co` | PJSP/acquirer | Spike-validated; Basic auth `[VERIFIED: spike scripts]` |

**Installation:**
```bash
npm install qrcode.react@4.2.0
```
`qrcode.react` v4 exports named components `QRCodeSVG` and `QRCodeCanvas` (NOT a default export). Prefer `QRCodeSVG` for crispness; both render `value={qrString}`. `[CITED: qrcode.react v4 README]`

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `convex-test` | (in devDeps) | Backend unit tests for table mutations/queries | Already inlined in vitest config `[VERIFIED: vitest.config.ts]` |
| Playwright | (in tree) | Dev Test-Mode E2E loop | `tests/e2e/*.spec.ts` exist `[VERIFIED]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| env-var `QRIS_ENABLED` | `businessSettings` DB flag | Rejected in D-01 — go-live would be a DB edit, not SPEC's "env change only" |
| `qrcode.react` | `qrcode` (canvas lib) | SPEC names `qrcode.react`; no reason to deviate |
| Webhook | cron status sweep | Out of scope (CONTEXT) — QR flips ACTIVE→INACTIVE on pay, so polling the QR object does not reveal paid; webhook is the only paid signal (spike-confirmed) |

**Version verification:** `qrcode.react@4.2.0`, unpacked 114,980 bytes (~115 kB on disk; the runtime JS that lands in the bundle is far smaller — the package includes a vendored `qrcodegen`). `[VERIFIED: npm view qrcode.react version dist.unpackedSize → 4.2.0 / 114980]`

## Blast Radius

Graph is **stale** (built 2026-05-08, pre-Phase-82) and the QRIS symbols do not exist yet, so a fan-in table would mislead. Qualitative coupling note (verified this session):

- **`reserveStockForOrderInternal`** (`convex/orders/mutations/inventoryIntegration.ts:219`) — the idempotency-critical side effect. It is called from `updateStatus:142` AND `moveForward:439`, both guarded by `oldStatus !== "PaymentReceived"`. The webhook's new internal mutation MUST apply the **same guard** so a replayed webhook is a no-op. This is the single highest-risk surface in the phase.
- **Mitigation (required):** the webhook transition mutation reads `order.status`; if already `PaymentReceived` (or any status past it), record the payment on the `qrisPayments` row but **return before** patching status / reserving stock. Idempotency is enforced by the status guard, not by webhook dedup alone (Xendit may legitimately re-deliver).

*[Blast radius from graph last built 2026-05-08; treated as directional only. Anchors re-verified by direct file read this session.]*

## Architecture Patterns

### System Architecture Diagram

```
 Order-detail page (canAccessOrders: order_staff/manager/admin)
   │
   │ status === AwaitingPayment AND getQrisConfig().enabled
   ▼
 [Charge via QRIS] button ──opens──► QrisChargeDialog
   │                                    │ subscribes
   │ calls action                       ▼
   ▼                          getActiveQrisPayment(orderId)  ◄──reactive──┐
 createQrisInvoice(orderId) [ACTION]            (Convex query)            │
   │  • re-check QRIS_ENABLED (defense-in-depth)                          │
   │  • guard order.status===AwaitingPayment, finalTotal>=1500            │
   │  • expire prior pending row for this order                          │
   ▼                                                                      │
 xenditProvider.createInvoice() ──fetch──► POST api.xendit.co/qr_codes    │
   │  Basic auth  {type:DYNAMIC, currency:IDR, amount, external_id=#}     │
   ◄── {id, qr_string, status:ACTIVE} ──                                  │
   │                                                                      │
   ▼ insert pending row {externalId=orderNumber, xenditQrId, qrString,    │
 qrisPayments (status:pending, expiresAt=now+30min) ─────────────────────┘
                          ▲
                          │ match by externalId
 ───────────────────────────────────────────────────────────────────────
  Customer scans → pays via wallet (DANA/OVO/GoPay/bank)
                          │
                          ▼  Xendit fires callback
 POST /api/xendit/qr-payment  [httpAction]
   │ 1. read x-callback-token header
   │ 2. constant-time compare vs XENDIT_WEBHOOK_TOKEN  ──mismatch──► 401, no state change
   │ 3. parse body; if status===COMPLETED:
   │      match qrisPayments by externalId
   │      record receiptId/source/paidAt, set status:paid
   │      if amount != row.amount OR row was expired/superseded:
   │          set needsReview:true + reviewReason  (STILL paid)
   │ 4. internal mutation: AwaitingPayment → PaymentReceived
   │      GUARD: only if order.status !== PaymentReceived  ◄── idempotency
   │      reserveStockForOrderInternal (fires exactly once)
   ▼
 Dialog flips to "paid" reactively (no refresh)
```

### Recommended Project Structure (D-04, mirrors `convex/integrations/grabfood/`)
```
convex/integrations/qris/
├── provider.ts        # QrisProvider interface (createInvoice, getStatus)
├── xendit.ts          # xenditProvider impl — Basic auth, POST /qr_codes, fetch
└── webhooks.ts        # httpAction handler + EXPORTED verifyCallbackToken() pure fn
convex/qrisPayments/
├── mutations.ts       # internal: insertPending, expirePrior, recordPaid+transition
├── queries.ts         # getActiveQrisPayment (protectedQuery), getQrisConfig
└── actions.ts         # createQrisInvoice (action; re-checks flag + state guard)
convex/http.ts         # + http.route("/api/xendit/qr-payment", POST, handler)
convex/schema.ts       # + qrisPayments table; + businessSettings.qrisNmid?
src/components/orders/
└── QrisChargeDialog.tsx  # single component, derived state machine (D-03)
src/hooks/convex/
└── useQris.ts         # useQrisConfig, useActiveQrisPayment, useCreateQrisInvoice
```

### Pattern 1: Outbound create-QR action (env-var read + fetch)
**What:** An `action` reads the secret from `process.env`, calls Xendit with Basic auth, inserts a `pending` row via an internal mutation.
**When to use:** The create-QR path.
```typescript
// Source: spike scripts/qris-sandbox-poc.mjs + convex/integrations/grabfood/adapter.ts env pattern
const apiKey = process.env.XENDIT_API_KEY;            // never client-exposed
const authHeader = "Basic " + btoa(`${apiKey}:`);      // key as username, empty password
const res = await fetch("https://api.xendit.co/qr_codes", {
  method: "POST",
  headers: { Authorization: authHeader, "Content-Type": "application/json" },
  body: JSON.stringify({
    reference_id: orderNumber,   // newer Xendit field
    external_id: orderNumber,    // legacy field — spike sends BOTH, harmless
    type: "DYNAMIC",
    currency: "IDR",
    amount: finalTotal,          // exact; min 1500 IDR
  }),
});
// → { id, qr_string, status: "ACTIVE", reference_id, ... }
```
Note: Node's spike uses `Buffer.from(...).toString("base64")`; the Convex action runtime has `btoa` (Web standard) — use `btoa`, not `Buffer`. `[CITED: Convex runtime is Web-standard, not Node]`

### Pattern 2: Constant-time token verify (adapt `validateHmacSignature`)
**What:** Compare the `x-callback-token` header to `XENDIT_WEBHOOK_TOKEN` in constant time. Simpler than HMAC — Xendit sends a **static shared token**, not a per-body HMAC signature.
```typescript
// Source: adapt convex/integrations/grabfood/webhooks.ts:47-57 (constant-time loop)
export function verifyCallbackToken(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header) return false;          // missing config OR missing header → reject (401)
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < header.length; i++) mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
```
**Important divergence from grabfood:** grabfood treats "no secret / no signature" as `valid:true` (skip). For Xendit, **missing token MUST 401** (SPEC acceptance criterion). Do not copy grabfood's skip-on-missing behavior.

### Pattern 3: Idempotent paid transition (dedicated internal mutation — NOT moveForward)
**What:** The webhook calls an internal mutation that transitions only `AwaitingPayment → PaymentReceived` with the existing guard.
```typescript
// Source: convex/orders/mutations/statusUpdates.ts:140 (the canonical guard + reserve call)
const order = await ctx.db.get(orderId);
if (order.status === "PaymentReceived") return { transitioned: false }; // replay no-op
if (order.status !== "AwaitingPayment") { /* record paid + needsReview; do not transition */ }
await ctx.db.patch(orderId, { status: "PaymentReceived", confirmedAt: Date.now() });
await reserveStockForOrderInternal(ctx, { orderId });   // fires exactly once
```
**Why not `moveForward`:** `moveForward` (`:410-431`) auto-expedites orders due today/tomorrow straight to `BeingPrepared` (skipping PaymentReceived). A payment webhook must NOT trigger kitchen entry. Also `moveForward` uses `FORWARD_TRANSITIONS[order.status]` which only advances from the immediate prior state. Write a purpose-built internal mutation.

### Anti-Patterns to Avoid
- **Calling `useBusinessSettings()` from the dialog** — it's admin/manager-only; crashes order_staff mounts (pitfall #19). Use an order-staff-accessible NMID read.
- **Reusing `updatePayment` for the webhook** — it does not transition status or reserve stock; only patches payment fields.
- **Webhook-dedup-only idempotency** — rely on the `status !== PaymentReceived` guard, not on detecting duplicate webhooks. Xendit may legitimately re-deliver.
- **Tinting the QR with brand color** — black-on-white only (scannability; UI-SPEC).
- **`Buffer` in the Convex action** — use `btoa`; the runtime is Web-standard.
- **Tagging `confidence`/status as paid before the guard check** — record the payment row, but gate the transition.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR image rendering | Custom canvas/EMVCo encoder | `qrcode.react` (`QRCodeSVG`) | EMVCo TLV + CRC-16 + error-correction is a deep rabbit hole; Xendit returns the full `qr_string`, just render it |
| QRIS payload generation | Hand-build TLV tags 00–63 + CRC | Xendit `POST /qr_codes` | The PJSP owns NMID, MCC, CRC; we send amount+ref, get a valid payload |
| Constant-time compare | `===` on tokens | adapt `validateHmacSignature` loop | Timing-attack resistance; the helper already exists |
| Payment status polling | cron sweep of QR objects | Webhook | QR flips ACTIVE→INACTIVE on pay; its status never reads "paid" (spike-confirmed). Webhook is the only signal |
| Status transition + stock reserve | New transition logic | existing guard at `statusUpdates.ts:140` + `reserveStockForOrderInternal` | Reuse the proven side effect; just guard it |

**Key insight:** The PJSP (Xendit) owns everything hard about QRIS — payload encoding, NMID, settlement, RRN. The integration surface is small: one outbound POST, one inbound webhook, one table, one dialog.

## Runtime State Inventory

> Greenfield additive phase — no rename/refactor/migration. No existing data carries renamed strings. Skipping the 5-category audit; only NEW state is introduced (`qrisPayments` table, `businessSettings.qrisNmid`, 3 Convex env vars). **Verified: no QRIS symbols exist in the codebase today** (`ls convex/integrations/qris` → not found).

## Common Pitfalls

### Pitfall 1: order_staff crash on businessSettings read
**What goes wrong:** Dialog reads `qrisNmid` via `useBusinessSettings()`; manager works, order_staff gets a ConvexError → React error boundary → "Server Error" page crash.
**Why it happens:** `businessSettings.queries.get` is `roles: ["admin","manager"]`; `useSessionQuery` subscribes on mount regardless of dialog open state (pitfall #19, 3rd recurrence in the codebase).
**How to avoid:** New query for `qrisNmid` (or fold into `getQrisConfig`) with `roles: ["order_staff","manager","admin"]`.
**Warning signs:** Page crashes only for staff role; works for admin in dev.

### Pitfall 2: Webhook double-reserves stock on replay
**What goes wrong:** Xendit re-delivers a COMPLETED callback; stock reserved twice.
**Why it happens:** No status guard before `reserveStockForOrderInternal`.
**How to avoid:** Guard `order.status !== "PaymentReceived"` (Pattern 3). Test with a replay.
**Warning signs:** `componentStock.totalReserved` higher than expected after a re-delivery.

### Pitfall 3: vendor bundle cap breaks Vercel (pitfall #16)
**What goes wrong:** `npm run build` passes locally on Windows; Vercel fails on the `vendor-*.js` 600 kB cap after `qrcode.react` lands.
**Why it happens:** `qrcode.react` falls into the catch-all `vendor` chunk (vite.config.ts:81).
**How to avoid:** In the same PR, bump `vendor-*.js` to 650 kB (preferred — qrcode.react is small) OR add `if (id.includes('qrcode')) return 'vendor-qr'` to `manualChunks`. Bump is simpler given the small size.
**Warning signs:** Green local build, red CI deploy ~minutes later.

### Pitfall 4: missing token treated as valid
**What goes wrong:** Copy grabfood's "no signature → skip" and an unauthenticated POST transitions an order.
**Why it happens:** grabfood's verify returns `valid:true` when header/secret absent.
**How to avoid:** For Xendit, missing token → 401 (Pattern 2). SPEC requires it.

### Pitfall 5: convex-test `t.action(internal.*)` resolver bug
**What goes wrong:** Calling the create-QR action or transition mutation via `t.action(internal.*)` fails to resolve in convex-test.
**Why it happens:** Known convex-test module-resolver limitation (documented in `convex/productInventory/__tests__/channelAudit.test.ts:212`).
**How to avoid:** Test the transition logic by invoking the internal mutation inside `t.run(async (ctx) => ...)` or via `ctx.runMutation`, not `t.action(internal.*)`. Test the outbound action's request-body shape by extracting a pure `buildCreateQrBody()` and asserting it (see Validation Architecture).

## Code Examples

### Webhook COMPLETED payload (spike-confirmed shape)
```jsonc
// Source: scripts/qris-sandbox-server.mjs simulate response + SPEC §4
{
  "id": "qrpy_...",                  // payment id
  "status": "COMPLETED",            // the paid signal
  "amount": 35000,                  // compare to qrisPayments.amount → needsReview if !=
  "reference_id": "0521-001",       // = external_id = orderNumber (match key)
  "payment_details": {
    "receipt_id": "RRN...",         // RRN — store as receiptId
    "source": "DANA"                // paying wallet — store as source
  }
}
// Header: x-callback-token: <XENDIT_WEBHOOK_TOKEN>
```

### Frontend QR render (qrcode.react v4)
```tsx
// Source: qrcode.react v4 named exports
import { QRCodeSVG } from "qrcode.react";
<div className="bg-white p-4 rounded-xl"> {/* white card mandatory even in dark mode */}
  <QRCodeSVG value={row.qrString} size={256} level="M" />
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| InterActive/qris.online (poll `check-invoice`, no RRN) | Xendit QR Codes API (webhook, RRN via `payment_details.receipt_id`) | Spike pivot 2026-05-21 | Webhook-driven; the old research doc's API tables (§3/§4) are InterActive-specific — do not implement them |
| `qrcode.react` default export | Named `QRCodeSVG`/`QRCodeCanvas` | v3→v4 | Import named, not default |

**Deprecated/outdated:**
- `docs/research/2026-05-21-qris-protocol-and-fields.md` §3 (InterActive API endpoints `show_qris.php`/`checkpaid_qris.php`) and §4 field-mapping — superseded by the Xendit spike. Keep §1–§2 (QRIS/EMVCo protocol, NMID, dynamic vs static) as accurate reference.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.x + convex-test (backend), React Testing Library (frontend), Playwright (E2E) |
| Config file | `vitest.config.ts` (jsdom, `convex-test` inlined); `tests/e2e/` for Playwright |
| Quick run command | `npm run test -- <path>` (single file, < 30s) |
| Full suite command | `npm run test` then `npm run build` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| R1 | create-QR request body shape (`type:DYNAMIC`, `external_id`=orderNumber, `amount`=finalTotal, `currency:IDR`) | unit (pure `buildCreateQrBody`) | `npm run test -- convex/integrations/qris/__tests__/xendit.test.ts` | ❌ Wave 0 |
| R2 | `qrisPayments` insert/expire; `getActiveQrisPayment` returns latest non-expired | unit (convex-test, `t.run`) | `npm run test -- convex/qrisPayments/__tests__/mutations.test.ts` | ❌ Wave 0 |
| R3 | create action: non-AwaitingPayment throws + writes nothing; second call expires first; finalTotal<1500 rejected | unit (`t.run` on internal mutation) | `npm run test -- convex/qrisPayments/__tests__/createInvoice.test.ts` | ❌ Wave 0 |
| R4a | token mismatch/missing → 401, no state change | unit (pure `verifyCallbackToken`) | `npm run test -- convex/integrations/qris/__tests__/verifyToken.test.ts` | ❌ Wave 0 (model: `convex/__tests__/hmac.test.ts`) |
| R4b | COMPLETED transitions once + reserves once; **replay does NOT re-transition/double-reserve** | unit (convex-test, `t.run` invoke transition twice) | `npm run test -- convex/qrisPayments/__tests__/webhookTransition.test.ts` | ❌ Wave 0 |
| R4c | amount != row.amount OR superseded/expired → paid AND `needsReview` + reason | unit (`t.run`) | same file as R4b | ❌ Wave 0 |
| R5 | button absent when flag off OR status≠AwaitingPayment; dialog flips paid reactively; Regenerate supersedes | RTL + Playwright | `npm run test -- src/components/orders/__tests__/QrisChargeDialog.test.tsx` | ❌ Wave 0 |
| R6 | flag off → no QRIS path; Test→Live = env only | E2E / manual (env behavior) | Playwright `tests/e2e/qris-charge.spec.ts` (flag-on path) | ❌ Wave 0 |
| R7 | NMID renders when set; absent without error; **no order_staff crash** | RTL | same as R5 (test all 3 roles can mount) | ❌ Wave 0 |
| — | dev Test-Mode E2E: simulate-payment → order reaches PaymentReceived | Playwright (manual-gated; needs Test key) | `tests/e2e/qris-charge.spec.ts` (skip if no key) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- <touched test file>` + `npm run type-check`
- **Per wave merge:** `npm run test` (full unit suite)
- **Phase gate:** Full suite green + `npm run build` (catches the bundle cap) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `convex/integrations/qris/__tests__/xendit.test.ts` — R1 request-body shape (extract pure `buildCreateQrBody`)
- [ ] `convex/integrations/qris/__tests__/verifyToken.test.ts` — R4a token compare (model on `hmac.test.ts`)
- [ ] `convex/qrisPayments/__tests__/mutations.test.ts` — R2 insert/expire/getActive
- [ ] `convex/qrisPayments/__tests__/createInvoice.test.ts` — R3 state guards (via `t.run`)
- [ ] `convex/qrisPayments/__tests__/webhookTransition.test.ts` — R4b idempotency replay + R4c needsReview
- [ ] `src/components/orders/__tests__/QrisChargeDialog.test.tsx` — R5/R7 (all 3 roles mount; reactive paid flip)
- [ ] `tests/e2e/qris-charge.spec.ts` — flag-on happy path; Test-Mode loop skipped without key
- [ ] Test-helper: a `qrisPayments` factory + a fake `order` in `AwaitingPayment`

> **Testing strategy note:** Both the create-action and the webhook transition should expose **pure functions** (`buildCreateQrBody`, `verifyCallbackToken`, and the transition decision e.g. `decideWebhookOutcome(order, row, payload) → {transition, recordPaid, needsReview, reason}`). This sidesteps the convex-test `t.action(internal.*)` resolver bug (Pitfall 5) and makes the idempotency + needsReview logic unit-testable without a live runtime. Invoke the actual mutation via `t.run`/`ctx.runMutation` for the integration assertions.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `protectedQuery`/`protectedMutation` with `roles` superset of `canAccessOrders` (order_staff/manager/admin) |
| V3 Session Management | no | Reuses existing PIN/session-token auth; no new session surface |
| V4 Access Control | yes | Button + create-action both gate on `QRIS_ENABLED`; backend re-checks (defense-in-depth, D-01) |
| V5 Input Validation | yes | Webhook body parsed defensively; amount/external_id validated against stored row |
| V6 Cryptography | yes | Web Crypto constant-time token compare; **never hand-roll** — adapt `validateHmacSignature` |
| V9 Communications | yes | Xendit over HTTPS only; secret key never client-exposed (action-only `process.env`) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged/replayed webhook | Spoofing / Tampering | `x-callback-token` constant-time verify → 401; `status !== PaymentReceived` idempotency guard |
| Timing attack on token | Information Disclosure | Constant-time compare (XOR loop), not `===` |
| Secret leakage | Information Disclosure | `XENDIT_API_KEY`/`XENDIT_WEBHOOK_TOKEN` via Convex env vars, read only inside actions; never reaches client |
| Amount tampering | Tampering | Webhook `amount` compared to stored `qrisPayments.amount`; mismatch → still honor (customer paid) but flag `needsReview` |
| Unauthorized QR generation | Elevation of Privilege | create-action enforces role + `QRIS_ENABLED` + `order.status===AwaitingPayment` server-side |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `qrcode.react` | R5 dialog | ✗ (not installed) | 4.2.0 (to install) | none — SPEC-named, must install |
| Xendit Test Mode key | dev E2E (R6, loop) | dev-supplied via `.env.local` | `xnd_development_*` | spike already validated; E2E skips without key |
| Convex env vars (`XENDIT_API_KEY`, `XENDIT_WEBHOOK_TOKEN`, `QRIS_ENABLED`) | R3/R4/R6 | set at deploy | — | none — phase ships flag-off |
| Web Crypto `crypto.subtle` / `btoa` | token verify / auth header | ✓ (Convex runtime) | runtime | none needed |

**Missing dependencies with no fallback:** `qrcode.react` (install in the implementing PR).
**Missing dependencies with fallback:** Xendit Test key — the loop E2E `test.skip()`s when absent; unit tests don't need it.

## Project Constraints (from CLAUDE.md)

- **Pitfall #8:** No dynamic `import()` in Convex — static imports only (fails silently in prod). All QRIS Convex modules use static imports.
- **Pitfall #16:** Vendor bundle cap — bump `vendor-*.js` to 650 kB OR `manualChunks`-split `qrcode.react` in the SAME PR that adds the dep. Local build can pass while Vercel fails.
- **Pitfall #19:** Backend `roles` MUST be a superset of the route's `requiredPermission`. `canAccessOrders` = {order_staff, manager, admin}. All new QRIS queries/mutations/actions reachable from the order detail page use `roles: ["order_staff","manager","admin"]`. `businessSettings.get` (admin/manager only) is NOT safe to call from the dialog.
- **Convex:** secrets via env vars only; `httpAction` for webhook, `action` for outbound fetch; queries/mutations cannot `fetch`.
- **Git/build:** code on a `feature/` branch; `npm run type-check` + `npm run build` MUST pass before merge; CHANGELOG always updated after merge.
- **Schema:** when adding `businessSettings.qrisNmid` and the `qrisPayments` table, run `npx convex codegen` so `_generated/api.d.ts` is current (recurring lesson — stale generated files silently rot, Phase 76/81).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Xendit webhook delivers token in `x-callback-token` header (Xendit's standard header for QR/invoice callbacks) | Pattern 2, Diagram | If header name differs, 401 on all real callbacks — verify against Xendit dashboard webhook config / a real Test-Mode callback before go-live. Spike used a placeholder callback URL, so the exact header was not captured live. |
| A2 | Webhook COMPLETED body matches the spike's *simulate* response shape (`status`, `amount`, `reference_id`, `payment_details.{receipt_id,source}`) | Code Examples | The spike captured the **simulate-payment** response, which mirrors but may not be byte-identical to the **webhook** body. Confirm field paths against one real Test-Mode webhook delivery. |
| A3 | `qrcode.react` runtime footprint (~tens of kB) won't blow a 650 kB vendor cap | Pitfall 3 | If it does, fall back to `manualChunks` split. Low risk — package unpacked is 115 kB incl. source maps. |
| A4 | `reference_id` is the field Xendit echoes back in the webhook as the match key (= our `external_id` = orderNumber) | Diagram, Pattern 1 | If Xendit keys callbacks on `id` only, match by `xenditQrId` instead. Mitigation: store BOTH `xenditQrId` and `externalId` (SPEC already does) and match on whichever the webhook carries. |

## Open Questions

1. **Exact webhook body + header (A1/A2)**
   - What we know: the spike validated create + simulate; simulate returns `status:COMPLETED` + `payment_details`.
   - What's unclear: the real webhook callback's exact header name and body envelope (Xendit sometimes wraps in `{event, data:{...}}`).
   - Recommendation: capture ONE real Test-Mode webhook (point the Xendit dashboard callback at the deployed dev httpAction, simulate a payment) during Wave 0/early implementation, and lock the parser to that. Store raw payload on a debug field initially.

2. **`QRIS_ENABLED` value convention**
   - What we know: D-01 says env var read server-side.
   - What's unclear: string `"true"`/`"1"` parsing.
   - Recommendation: treat `process.env.QRIS_ENABLED === "true"` as the single source; document it in `getQrisConfig`.

## Sources

### Primary (HIGH confidence)
- Codebase (verified this session): `convex/http.ts`, `convex/integrations/grabfood/webhooks.ts`, `convex/orders/mutations/statusUpdates.ts` (:140/:230/:362/:437), `convex/orders/mutations/inventoryIntegration.ts:219`, `convex/orders/helpers/customerResolution.ts:55`, `src/lib/types.ts` (:757/780/803), `convex/businessSettings/queries.ts`, `convex/schema.ts:632`, `vite.config.ts`, `vitest.config.ts`, `convex/__tests__/hmac.test.ts`, `convex/productInventory/__tests__/channelAudit.test.ts:212`, `src/hooks/convex/useBusinessSettings.ts`, `src/pages/OrderDetail.tsx`
- Validated spike: `scripts/qris-sandbox-poc.mjs`, `scripts/qris-sandbox-server.mjs` (Xendit Test Mode, 2026-05-21)
- `npm view qrcode.react` → 4.2.0, 114980 bytes, modified 2024-12-11

### Secondary (MEDIUM confidence)
- `docs/research/2026-05-21-qris-protocol-and-fields.md` — QRIS/EMVCo protocol fundamentals (§1–§2). §3–§4 are InterActive-specific, superseded by the Xendit spike.

### Tertiary (LOW confidence)
- A1/A2 webhook header+body shape — inferred from spike's simulate response; flagged in Assumptions Log for live confirmation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — qrcode.react verified on npm; Convex patterns verified in-tree
- Architecture: HIGH — every anchor re-read this session; 3 CONTEXT corrections surfaced
- Pitfalls: HIGH — drawn from verified code + documented codebase lessons
- Webhook payload shape: MEDIUM — spike captured simulate response; real callback header/envelope flagged (A1/A2)

**Research date:** 2026-05-21
**Valid until:** 2026-06-20 (stable codebase; Xendit API stable). Re-verify webhook shape (A1/A2) against a live Test-Mode callback during implementation.

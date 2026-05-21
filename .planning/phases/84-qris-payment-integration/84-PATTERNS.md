# Phase 84: QRIS Payment Integration (Xendit) - Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 13 new/modified
**Analogs found:** 12 / 13 (1 partial — outbound payment-gateway action has no exact analog)

> **Heed RESEARCH.md corrections (verified this session):**
> 1. `updatePayment` (`statusUpdates.ts:230`) only patches `paymentStatus`/`paymentMethod` — it does NOT transition status or reserve stock. The transition + `reserveStockForOrderInternal` lives in `updateStatus:140`. The webhook needs its OWN purpose-built internal mutation. Do NOT reuse `moveForward` (auto-expedites).
> 2. `businessSettings.queries.get` is `roles: ["admin","manager"]` — order_staff cannot read it. Do NOT call `useBusinessSettings()` from the dialog (crashes order_staff, pitfall #19). Add an order_staff-accessible NMID read (fold into `getQrisConfig`).
> 3. Idempotency guard = `order.status !== "PaymentReceived"` before `reserveStockForOrderInternal`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `convex/integrations/qris/provider.ts` (NEW) | config/interface | transform | `convex/integrations/grabfood/config.ts` (type exports) | role-match |
| `convex/integrations/qris/xendit.ts` (NEW) | service (adapter) | request-response (outbound fetch) | `convex/integrations/grabfood/adapter.ts` | role-match (env+fetch pattern) |
| `convex/integrations/qris/webhooks.ts` (NEW) | controller (httpAction) | event-driven (inbound webhook) | `convex/integrations/grabfood/webhooks.ts` | exact |
| `convex/qrisPayments/actions.ts` (NEW) | service (action) | request-response | `convex/bigsellerOrders/actions.ts` | role-match |
| `convex/qrisPayments/mutations.ts` (NEW) | model (mutations) | CRUD + transition | `convex/orders/mutations/statusUpdates.ts:140` (guarded reserve) | exact (guard reuse) |
| `convex/qrisPayments/queries.ts` (NEW) | model (queries) | CRUD | `convex/businessSettings/queries.ts` (protectedQuery) | role-match |
| `convex/schema.ts` (MODIFY) | config (schema) | — | `orders` table indexes + `businessSettings` defineTable | exact |
| `convex/http.ts` (MODIFY) | route | event-driven | 6 grabfood `http.route(...)` registrations | exact |
| `src/components/orders/QrisChargeDialog.tsx` (NEW) | component | request-response + reactive | `src/components/orders/ConfirmationDialog.tsx` | role-match |
| `src/pages/OrderDetail.tsx` (MODIFY) | component (page) | — | existing `AwaitingPayment`-gated card blocks (`:345`) | exact |
| `src/hooks/convex/useQris.ts` (NEW) | hook | request-response | `src/hooks/convex/useBusinessSettings.ts` | exact |
| `vite.config.ts` (MODIFY) | config | — | existing `vendor-*.js` cap (`:22`) | exact |
| Pure fns (`buildCreateQrBody`, `verifyCallbackToken`, `decideWebhookOutcome`) | utility | transform | `convex/__tests__/hmac.test.ts` + `validateHmacSignature` | exact |

## Pattern Assignments

### `convex/integrations/qris/webhooks.ts` (controller, event-driven)

**Analog:** `convex/integrations/grabfood/webhooks.ts`

**httpAction skeleton** (mirror `grabfood/webhooks.ts:1-3`, `:18-62`, `:284-291`):
```typescript
import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

// EXPORTED pure fn — adapt the constant-time loop at grabfood/webhooks.ts:47-57.
// DIVERGENCE: grabfood returns valid:true on missing secret/sig (skip);
// Xendit MUST return false → 401 (SPEC acceptance criterion, RESEARCH Pitfall 4).
export function verifyCallbackToken(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header) return false;            // missing config OR header → 401
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < header.length; i++) mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

export const handleXenditQrPayment = httpAction(async (ctx, request) => {
  const body = await request.text();
  const token = request.headers.get("x-callback-token");   // A1: confirm exact header live
  if (!verifyCallbackToken(token, process.env.XENDIT_WEBHOOK_TOKEN)) {
    return new Response("Unauthorized", { status: 401 });    // NOT 200 — diverges from grabfood
  }
  let payload: any = {};
  try { payload = JSON.parse(body); } catch { /* ignore */ }
  if (payload?.status === "COMPLETED") {
    await ctx.runMutation(internal.qrisPayments.mutations.recordPaidAndTransition, {
      externalId: payload.reference_id,   // = orderNumber match key (A4: fallback to xenditQrId)
      amount: payload.amount,
      receiptId: payload?.payment_details?.receipt_id,
      source: payload?.payment_details?.source,
    });
  }
  return new Response("OK", { status: 200 });
});
```

**Note:** `process.env` in the httpAction runtime is Web-standard; use `btoa`, NOT `Buffer`. grabfood reads its secret from a DB query (`resolveHmacSecret`, `:69-75`) — for QRIS read directly from `process.env.XENDIT_WEBHOOK_TOKEN` (env-var-only secret, no DB credential row).

---

### `convex/integrations/qris/xendit.ts` (service/adapter, outbound request-response)

**Analog:** `convex/integrations/grabfood/adapter.ts` (env-var read + `fetch` pattern). **No exact analog for an outbound payment-gateway POST — closest is the GrabFood OAuth `fetch`.**

**Env-var read + Basic auth + fetch** (adapt `grabfood/adapter.ts:1-3` env decl + `:27-41` fetch shape):
```typescript
// grabfood/adapter.ts:1-3 — Convex action env-var declaration pattern:
"use node";  // OR omit if running in default runtime; RESEARCH says default runtime + btoa
declare const process: { env: Record<string, string | undefined> };

// EXPORTED pure fn for R1 test (asserts request-body shape):
export function buildCreateQrBody(orderNumber: string, finalTotal: number) {
  return {
    reference_id: orderNumber,   // newer Xendit field
    external_id: orderNumber,    // legacy — spike sends BOTH, harmless
    type: "DYNAMIC" as const,
    currency: "IDR" as const,
    amount: finalTotal,          // exact; min 1500 IDR
  };
}

const apiKey = process.env.XENDIT_API_KEY;
const authHeader = "Basic " + btoa(`${apiKey}:`);   // key as username, empty password — btoa NOT Buffer
const res = await fetch("https://api.xendit.co/qr_codes", {
  method: "POST",
  headers: { Authorization: authHeader, "Content-Type": "application/json" },
  body: JSON.stringify(buildCreateQrBody(orderNumber, finalTotal)),
});
// → { id, qr_string, status: "ACTIVE", reference_id, ... }
if (!res.ok) { const t = await res.text(); throw new Error(`Xendit ${res.status}: ${t}`); }
```
The error-throw on `!res.ok` mirrors `grabfood/adapter.ts:33-36`.

---

### `convex/integrations/qris/provider.ts` (config/interface, transform)

**Analog:** `convex/integrations/grabfood/config.ts` (type/const export module — imported as `{ GRABFOOD_CONFIG, type GrabOauthResponse }` at `adapter.ts:8`).

Define the `QrisProvider` interface (`createInvoice`, `getStatus`) + the `xenditProvider` const conforming to it, plus shared response types. Keep it a plain TS module (no Convex registrations) so both the action and tests can import it. Mirror the named-export style grabfood's config uses.

---

### `convex/qrisPayments/mutations.ts` (model, CRUD + idempotent transition)

**Analog:** `convex/orders/mutations/statusUpdates.ts:140-171` — the CANONICAL guarded reserve. **CRITICAL: build a new internal mutation; do NOT reuse `updatePayment` (no transition) or `moveForward` (auto-expedites).**

**Idempotent paid transition** (the guard at `statusUpdates.ts:140` + `:123` confirmedAt + `:142` reserve call):
```typescript
// Internal mutation called by the webhook. EXPORT a pure decideWebhookOutcome() for tests.
export function decideWebhookOutcome(
  order: { status: string },
  row: { amount: number; status: string },
  payload: { amount: number },
): { transition: boolean; recordPaid: true; needsReview: boolean; reason?: string } {
  const amountMismatch = payload.amount !== row.amount;
  const superseded = row.status === "expired";
  const needsReview = amountMismatch || superseded;
  const reason = amountMismatch ? `amount ${payload.amount} != expected ${row.amount}`
    : superseded ? "QR was superseded/expired before payment" : undefined;
  const transition = order.status === "AwaitingPayment";   // only from AwaitingPayment
  return { transition, recordPaid: true, needsReview, reason };
}

// In the mutation handler — record paid ALWAYS, gate the transition:
const order = await ctx.db.get(orderId);
// record paid on the qrisPayments row regardless (customer paid):
await ctx.db.patch(rowId, { status: "paid", paidAt: Date.now(), receiptId, source,
  ...(needsReview ? { needsReview: true, reviewReason: reason } : {}) });
if (order.status === "PaymentReceived") return { transitioned: false };   // replay no-op (idempotency)
if (order.status !== "AwaitingPayment") return { transitioned: false };   // recorded, not transitioned
await ctx.db.patch(orderId, { status: "PaymentReceived", confirmedAt: Date.now() });
await reserveStockForOrderInternal(ctx, { orderId });   // fires exactly once — guard above protects it
```
Import `reserveStockForOrderInternal` from `../orders/mutations/inventoryIntegration` exactly as `statusUpdates.ts:42-48` does. Use `internalMutation` (webhook caller) — typed `MutationCtx`, never `ctx: { db: any }`.

**Supersede-on-regenerate** (`expirePrior`): query `qrisPayments` by `by_order` index, patch any `pending` row to `status: "expired"` before inserting the new `pending` row — same index-scan-then-patch shape as `customerResolution.ts:62-68`.

---

### `convex/qrisPayments/queries.ts` (model, CRUD)

**Analog:** `convex/businessSettings/queries.ts` (protectedQuery shape).

```typescript
import { protectedQuery } from "../lib/functions";

// ROLE CONSTRAINT (pitfall #19): superset of canAccessOrders (types.ts:760/783/806).
// businessSettings.get uses ["admin","manager"] — that would CRASH order_staff. Use:
export const getActiveQrisPayment = protectedQuery({
  roles: ["order_staff", "manager", "admin"],
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    // by_order index; return latest non-expired row reactively
  },
});

// getQrisConfig — reads process.env.QRIS_ENABLED === "true" AND the order-staff-safe NMID.
// Fold qrisNmid here (RESEARCH correction #2) so the dialog never calls useBusinessSettings().
export const getQrisConfig = protectedQuery({
  roles: ["order_staff", "manager", "admin"],
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("businessSettings").first();
    return { enabled: process.env.QRIS_ENABLED === "true", qrisNmid: settings?.qrisNmid ?? null,
             merchantName: settings?.businessName ?? null };
  },
});
```
Note: queries CAN read `process.env` in Convex; only `fetch` is action-restricted.

---

### `convex/qrisPayments/actions.ts` (service, request-response)

**Analog:** `convex/bigsellerOrders/actions.ts` (action with internal-query auth gate + `ctx.runMutation`/`ctx.runAction`; actions cannot touch `ctx.db`).

`createQrisInvoice(orderId)` action: re-check `QRIS_ENABLED` server-side (defense-in-depth, D-01), guard `order.status === "AwaitingPayment"` + `finalTotal >= 1500` (via an internal query — actions have no `ctx.db`), call `xenditProvider.createInvoice`, then `ctx.runMutation(internal.qrisPayments.mutations.insertPending, ...)` after expiring the prior pending row. Same `action({ args, handler })` + `ctx.runQuery(internal...)`/`ctx.runMutation(internal...)` orchestration as `bigsellerOrders/actions.ts:20-55`. Pitfall #5: test via extracted pure fns + `t.run`, NOT `t.action(internal.*)`.

---

### `convex/schema.ts` (config) — `qrisPayments` table + `businessSettings.qrisNmid`

**Analog:** `orders` table indexes (`schema.ts:319-327`) + `businessSettings` defineTable (`:632-642`).

```typescript
// New table — index shape mirrors orders' .index("by_order_number", [...]) / .index("by_status", [...]):
qrisPayments: defineTable({
  orderId: v.id("orders"),
  provider: v.string(),                 // "xendit"
  externalId: v.string(),               // = orderNumber (match key)
  xenditQrId: v.string(),
  qrString: v.string(),
  amount: v.number(),
  status: v.union(v.literal("pending"), v.literal("paid"), v.literal("expired")),
  receiptId: v.optional(v.string()),    // RRN
  source: v.optional(v.string()),       // paying wallet
  expiresAt: v.number(),
  paidAt: v.optional(v.number()),
  needsReview: v.optional(v.boolean()),
  reviewReason: v.optional(v.string()),
})
  .index("by_order", ["orderId"])
  .index("by_externalId", ["externalId"]),

// businessSettings (:632) — add ONE optional field, matching the v.optional(v.string()) style of npwp (:638):
qrisNmid: v.optional(v.string()),
```
**After editing schema, run `npx convex codegen`** (CLAUDE.md / RESEARCH §Project Constraints — stale `_generated/api.d.ts` is a recurring Phase 76/81 lesson).

---

### `convex/http.ts` (route) — register webhook

**Analog:** the 6 grabfood `http.route(...)` blocks (`http.ts:68-102`) + import block (`:4-11`).

```typescript
import { handleXenditQrPayment } from "./integrations/qris/webhooks";
// ...alongside grabfood routes:
http.route({
  path: "/api/xendit/qr-payment",
  method: "POST",
  handler: handleXenditQrPayment,
});
```

---

### `src/components/orders/QrisChargeDialog.tsx` (component, reactive)

**Analog:** `src/components/orders/ConfirmationDialog.tsx` (Dialog primitive composition, `@/components/ui/*` imports).

**Imports + Dialog shell** (mirror `ConfirmationDialog.tsx:1-14`, `:44-57`):
```tsx
import { QRCodeSVG } from "qrcode.react";   // v4 NAMED export, NOT default
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, QrCode } from "lucide-react";
// State machine DERIVED from the subscription (D-03) — not local toggles:
const row = useActiveQrisPayment(orderId);   // useSessionQuery → getActiveQrisPayment
// states: loading | active(pending,!expired) | paid(status==="paid") | expired | error
<div className="bg-white p-4 rounded-xl">   {/* white card mandatory even in dark mode */}
  <QRCodeSVG value={row.qrString} size={256} level="M" />
</div>
```
UI contract per `84-UI-SPEC.md`: 4 type sizes / 2 weights, `min-h-[44px]` mobile touch targets (copy from `PaymentMethodButtons.tsx:67`), success = `--color-status-success`, `needsReview`/expired = `--color-status-warning`, black-on-white QR (no brand tint). Countdown = local `setInterval` from `expiresAt`, MUST clear on unmount. The paid flip is reactive (no manual refresh) — driven purely by the Convex subscription.

---

### `src/pages/OrderDetail.tsx` (page) — button + needsReview badge

**Analog:** the existing `AwaitingPayment`-gated card blocks (`OrderDetail.tsx:344-364`, `:472`) and the component-import block (`:15-25`).

Mount "Charge via QRIS" near the payment UI, gated `order.status === 'AwaitingPayment' && qrisConfig.enabled` (visibility from `useQrisConfig()`). Button absent (not disabled) otherwise — same conditional-render pattern as the WhatsApp Template card (`:345`). The `needsReview` badge (D-02) mounts inline next to payment status using `Badge` + `Tooltip` (warning palette); INDICATOR only — no list/filter/resolve flow (deferred to Phase 77).

---

### `src/hooks/convex/useQris.ts` (hook)

**Analog:** `src/hooks/convex/useBusinessSettings.ts` (exact).

```typescript
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import { createMutationHook } from "./createMutationHook";

export function useQrisConfig() { return useSessionQuery(api.qrisPayments.queries.getQrisConfig, {}); }
export function useActiveQrisPayment(orderId) { return useSessionQuery(api.qrisPayments.queries.getActiveQrisPayment, { orderId }); }
// createQrisInvoice is an ACTION — use useSessionAction (not createMutationHook). Confirm hook util exists.
```
Mirror the `useSessionQuery(api.<module>.queries.<fn>, args)` shape at `useBusinessSettings.ts:15-17`. For the action, check whether a `useSessionAction` wrapper exists; otherwise use `convex-helpers/react/sessions` action hook.

---

### `vite.config.ts` (config) — bump vendor cap

**Analog:** existing cap line (`vite.config.ts:22`).

Bump `assets/vendor-*.js` from `600 kB` to `650 kB` in the SAME PR that adds `qrcode.react` (pitfall #16, RESEARCH Pitfall 3). Bump preferred over `manualChunks` (qrcode.react is small ~tens of kB). Update the explanatory comment (`:19-21`) to mention qrcode.react. Fallback if it overflows: add `if (id.includes('qrcode')) return 'vendor-qr'` to `manualChunks` (`:42-82`).

---

### Pure functions (utility) — `buildCreateQrBody`, `verifyCallbackToken`, `decideWebhookOutcome`

**Analog:** `convex/__tests__/hmac.test.ts` (test model) + `validateHmacSignature` (`grabfood/webhooks.ts:18`).

Export all three as standalone pure fns from their respective modules and unit-test them directly (no live runtime), exactly as `hmac.test.ts` imports and exercises `validateHmacSignature`. This sidesteps the convex-test `t.action(internal.*)` resolver bug (Pitfall 5). Test the actual mutation via `t.run`/`ctx.runMutation`. Test files (Wave 0): `convex/integrations/qris/__tests__/{xendit,verifyToken}.test.ts`, `convex/qrisPayments/__tests__/{mutations,createInvoice,webhookTransition}.test.ts`, `src/components/orders/__tests__/QrisChargeDialog.test.tsx`, `tests/e2e/qris-charge.spec.ts`.

## Shared Patterns

### Authentication / Role alignment (pitfall #19)
**Source:** `convex/lib/functions.ts` (`protectedQuery`/`protectedMutation`) + role table `src/lib/types.ts:756/779/802`.
**Apply to:** ALL new QRIS queries/actions reachable from the order detail page.
```typescript
// canAccessOrders resolves to {order_staff, manager, admin}. Every QRIS query/mutation/action
// reachable from OrderDetail MUST use the superset, NOT ["admin","manager"]:
roles: ["order_staff", "manager", "admin"],
```
`useSessionQuery` subscribes on mount regardless of dialog-open state — a narrower role set throws `ConvexError` → React error boundary → page crash for order_staff. `businessSettings.get` (`["admin","manager"]`) is NOT safe to call from the dialog.

### Env-var secrets (Convex)
**Source:** `convex/integrations/grabfood/adapter.ts:1-3` (env decl) + `:68-69` (`process.env` read).
**Apply to:** `xendit.ts` (`XENDIT_API_KEY`), `webhooks.ts` (`XENDIT_WEBHOOK_TOKEN`), `queries.ts` (`QRIS_ENABLED`).
Secrets read only inside actions/httpActions/queries server-side; never client-exposed. Use `btoa` not `Buffer` (Web-standard runtime). `QRIS_ENABLED` convention: `process.env.QRIS_ENABLED === "true"`.

### Constant-time token compare
**Source:** `convex/integrations/grabfood/webhooks.ts:47-57` (XOR loop).
**Apply to:** `verifyCallbackToken` in `qris/webhooks.ts`.
DIVERGENCE: grabfood treats missing secret/sig as `valid:true` (skip); Xendit MUST return `false` → 401 (SPEC). Never `===` on tokens (timing attack).

### Idempotency guard (highest-risk surface)
**Source:** `convex/orders/mutations/statusUpdates.ts:140` (`oldStatus !== "PaymentReceived"`) + `inventoryIntegration.ts:219` (`reserveStockForOrderInternal`).
**Apply to:** the webhook transition mutation.
Guard `order.status !== "PaymentReceived"` before `reserveStockForOrderInternal` so a replayed Xendit callback is a no-op. Idempotency enforced by the status guard, NOT webhook dedup (Xendit may legitimately re-deliver).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `convex/integrations/qris/xendit.ts` (outbound create-QR POST) | service | request-response | No existing outbound *payment-gateway* call. Closest is GrabFood's OAuth token `fetch` (`adapter.ts:27-41`) — reuse its env-var + `fetch` + `!res.ok` throw shape, but the Basic-auth + `/qr_codes` body is novel (source: spike `scripts/qris-sandbox-poc.mjs`). Marked role-match, not exact. |

## Metadata

**Analog search scope:** `convex/integrations/{grabfood}/`, `convex/orders/mutations/`, `convex/businessSettings/`, `convex/{bigsellerOrders,platformCredentials,externalData}/actions.ts`, `convex/schema.ts`, `convex/http.ts`, `convex/lib/functions.ts`, `convex/__tests__/`, `src/components/orders/`, `src/hooks/convex/`, `src/pages/OrderDetail.tsx`, `src/lib/types.ts`, `vite.config.ts`
**Files scanned:** ~16 (read in full or targeted ranges)
**Pattern extraction date:** 2026-05-21

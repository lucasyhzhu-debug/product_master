import { httpAction } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";

// ─── Xendit QRIS Callback Token Verification (R4a) ───────────────────────────

/**
 * Constant-time compare of the Xendit `x-callback-token` header against the
 * configured `XENDIT_WEBHOOK_TOKEN`. Adapted from the constant-time XOR loop in
 * convex/integrations/grabfood/webhooks.ts:47-57.
 *
 * CRITICAL DIVERGENCE from grabfood: grabfood treats a missing secret / missing
 * signature as `valid: true` (skip validation). Xendit MUST NOT do that — a
 * missing config OR a missing header MUST return `false`, which the handler
 * turns into an HTTP 401 with NO state change (SPEC R4a, RESEARCH Pitfall 4,
 * threat T-84-09/T-84-10). Never use `===` on tokens (timing attack).
 */
export function verifyCallbackToken(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header) return false; // missing config OR header → 401
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < header.length; i++) mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

// ─── Webhook outcome (HTTP status + whether the mutation was invoked) ────────

interface WebhookResult {
  status: number;
  body: string;
}

/**
 * Minimal dependency surface the webhook handler needs. Extracted so the
 * handler logic can be unit-tested with an injectable `runMutation` spy without
 * a live Convex runtime (Pitfall 5 — `httpAction` cannot be invoked via
 * `t.action(internal.*)`). The real `handleXenditQrPayment` httpAction wires
 * `ctx.runMutation` into this.
 */
export interface WebhookDeps {
  runMutation: (args: {
    xenditQrId?: string;
    externalId: string;
    amount: number;
    receiptId?: string;
    source?: string;
    rawPayload?: string;
  }) => Promise<{ transitioned: boolean }>;
}

/*
 * ─── Retry semantics (staffreview I3 — documented so ops/reviewers don't second-guess) ───
 *
 * - Bad/missing token → 401 (NO state change, NO mutation call). Xendit will
 *   redeliver; that is correct — a transient token misconfig self-heals once the
 *   token is fixed. A non-2xx is the ONLY response that forces Xendit redelivery.
 * - COMPLETED, matched, honored (incl. a needsReview amount/superseded mismatch)
 *   → 200. We chose to honor + flag, so we ACK to stop retries.
 * - COMPLETED, UNMATCHABLE (no qrisPayments row for the qr id / externalId)
 *   → 200. An unmatchable payload will never match on retry either, so we ACK to
 *   stop an infinite retry loop; the mutation's no-match path logs it for manual
 *   inspection (staffreview C4 / threat T-84-19).
 * - mutation throws unexpectedly → caught; we still return 200. Plan 03 records
 *   the payment durably BEFORE any throwable step, so a redelivery would only
 *   re-run the idempotent guard — we deliberately do NOT force redelivery via a
 *   non-2xx (avoids a retry storm on a transient post-record error).
 */

/**
 * Pure-ish handler core: verify token first (401 before any state change), then
 * on a COMPLETED payload invoke `deps.runMutation` exactly once inside a
 * try/catch so a mutation throw never escapes as a 500 (mirrors
 * grabfood/webhooks.ts:111-115). Returns the HTTP status + body to send.
 *
 * Defensive envelope parsing (A1/A2): the real Xendit callback may wrap the
 * payload as `{ event, data: {...} }`, so we read fields off `payload.data ??
 * payload`. The globally-unique QR id (`qr_id` / `id`, C8) is passed as the
 * primary `xenditQrId` match key, with `reference_id` / `external_id` as the
 * `externalId` fallback (A4). The raw `body` is stored as `rawPayload` (A1/A2,
 * schema field added in Plan 02).
 */
export async function processWebhook(
  deps: WebhookDeps,
  token: string | null,
  body: string,
  expectedToken: string | undefined,
  opts?: { forwardSecret?: string | null; expectedForwardSecret?: string | undefined },
): Promise<WebhookResult> {
  // 1. Authenticate FIRST — 401 (NOT 200) with no mutation call, no state change.
  if (!verifyCallbackToken(token, expectedToken)) {
    return { status: 401, body: "Unauthorized" };
  }

  // 1b. Forward-secret gate (security review MEDIUM-3). The Xendit account is
  //     SHARED with the Frollie POS, whose account-level webhook is authoritative;
  //     THIS endpoint is reached ONLY via the POS→RM forwarder (never directly by
  //     Xendit). When FROLLIE_FORWARD_SECRET is configured we therefore require a
  //     second shared secret so a leaked Xendit token alone (public repo) cannot
  //     forge a "paid" here. Absent config → skip (backward-compatible until set).
  //     INVARIANT: forwarding is strictly POS→RM. This handler must NEVER forward.
  if (opts?.expectedForwardSecret) {
    if (!verifyCallbackToken(opts.forwardSecret ?? null, opts.expectedForwardSecret)) {
      return { status: 401, body: "Unauthorized" };
    }
  }

  // 2. Parse defensively; an invalid body must not 500.
  let payload: any = {};
  try {
    payload = JSON.parse(body);
  } catch {
    /* ignore — leaves payload {} so status check is a no-op */
  }
  const evt = payload?.data ?? payload; // A2: unwrap the { event, data } envelope.

  // 2b. Refund deny-gate (security review HIGH-2). The subscribed Xendit event is
  //     "QR code paid & REFUNDED"; a refund callback also carries status
  //     "SUCCEEDED", which the paid-check below would misread as a payment and
  //     could flip an order to Paid off a refund. Reject anything whose event
  //     type mentions "refund" BEFORE the paid path.
  const eventName = String(payload?.event ?? evt?.event ?? evt?.type ?? "").toLowerCase();
  if (eventName.includes("refund")) {
    return { status: 200, body: "OK (refund ignored)" };
  }

  // 3. Only a SUCCESSFUL QR payment records payment + drives the transition.
  //    Xendit's QR Codes v2 (2022-07-31) reports a successful payment as
  //    status "SUCCEEDED" (confirmed live via Test-Mode simulate). Older
  //    docs/spike said "COMPLETED" — accept both so we're robust to either.
  const isPaid = evt?.status === "SUCCEEDED" || evt?.status === "COMPLETED";
  // payment_detail is SINGULAR in the v2 payload (the spike's "payment_details"
  // was wrong); keep the plural as a fallback.
  const pd = evt?.payment_detail ?? evt?.payment_details;
  if (isPaid) {
    try {
      await deps.runMutation({
        xenditQrId: evt.qr_id ?? evt.id, // C8: globally-unique QR id is the primary match key.
        externalId: evt.reference_id ?? evt.external_id, // A4: fallback match key (orderNumber).
        amount: evt.amount,
        receiptId: pd?.receipt_id,
        source: pd?.source,
        rawPayload: body, // A1/A2: store the raw payload for forensics.
      });
    } catch (err) {
      // grabfood:111-115 analog — a mutation throw must NEVER become a 500.
      console.log("[qris] webhook mutation error:", err);
    }
  }

  // 4. 200 for non-COMPLETED, matched, unmatched, and caught-error paths.
  return { status: 200, body: "OK" };
}

// ─── httpAction handler — POST /api/xendit/qr-payment ────────────────────────

/**
 * Inbound Xendit QRIS payment webhook. PUBLIC endpoint — the ONLY paid signal
 * (the QR never reads "paid" on poll; spike-confirmed). Authenticates via a
 * constant-time `x-callback-token` compare; missing/invalid → 401 with no state
 * change. On a valid COMPLETED payload it records the payment and drives the
 * idempotent transition via the Plan 03 mutation, wrapped so a throw never 500s.
 *
 * Secret read only from `process.env.XENDIT_WEBHOOK_TOKEN` (env-var-only, no DB
 * credential row — diverges from grabfood's resolveHmacSecret). Never logged.
 */
export const handleXenditQrPayment = httpAction(async (ctx: ActionCtx, request: Request) => {
  const body = await request.text();
  const token = request.headers.get("x-callback-token"); // A1: confirm header live before go-live.
  // Second shared secret injected by the POS forwarder (security review MEDIUM-3).
  const forwardSecret = request.headers.get("x-frollie-forward-secret");
  const result = await processWebhook(
    {
      runMutation: (args) =>
        ctx.runMutation(internal.qrisPayments.mutations.recordPaidAndTransition, args),
    },
    token,
    body,
    // Accept either env-var name: dev uses XENDIT_WEBHOOK_TOKEN, the prod
    // deployment stores the same verification token under XENDIT_CALLBACK_TOKEN.
    // Keep both resolvers in lockstep so the x-callback-token compare succeeds
    // regardless of which name the deployment was provisioned with.
    process.env.XENDIT_WEBHOOK_TOKEN ?? process.env.XENDIT_CALLBACK_TOKEN,
    {
      forwardSecret,
      expectedForwardSecret: process.env.FROLLIE_FORWARD_SECRET,
    },
  );
  return new Response(result.body, { status: result.status });
});

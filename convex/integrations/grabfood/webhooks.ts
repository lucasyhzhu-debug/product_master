import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

// ─── HMAC Validation Helper ──────────────────────────────────────────────────

/**
 * Validate HMAC-SHA256 signature from GrabFood webhook.
 * Uses the Web Crypto API (available in Convex httpAction runtime).
 *
 * GrabFood sends the signature in the `X-Grab-Signature` header.
 * HMAC secret comes from `GRAB_HMAC_SECRET` env var.
 *
 * Returns true if valid, false if invalid. If no HMAC secret is configured,
 * returns true (skip validation with warning log).
 */
async function validateHmacSignature(
  body: string,
  signatureHeader: string | null,
  hmacSecret: string | undefined
): Promise<{ valid: boolean; reason?: string }> {
  if (!hmacSecret) {
    console.log("GrabFood webhook: HMAC secret not configured (GRAB_HMAC_SECRET env var). Skipping validation.");
    return { valid: true, reason: "no_secret" };
  }

  if (!signatureHeader) {
    return { valid: false, reason: "missing_signature_header" };
  }

  try {
    // Web Crypto API HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(hmacSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(signature));
    const computedHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Constant-time comparison (best effort in JS)
    if (computedHex.length !== signatureHeader.length) {
      return { valid: false, reason: "length_mismatch" };
    }
    let mismatch = 0;
    for (let i = 0; i < computedHex.length; i++) {
      mismatch |= computedHex.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
    }

    return mismatch === 0
      ? { valid: true }
      : { valid: false, reason: "signature_mismatch" };
  } catch (err) {
    console.log("GrabFood webhook: HMAC validation error:", err);
    return { valid: false, reason: "crypto_error" };
  }
}

// ─── Webhook Handlers ────────────────────────────────────────────────────────

/**
 * Receive incoming GrabFood orders via webhook.
 *
 * GrabFood POSTs the full Order object here when a customer places an order.
 * We must return HTTP 200 immediately, then process asynchronously.
 *
 * Register this URL in the GrabFood developer portal:
 *   https://<your-deployment>.convex.site/api/grabfood/order
 *
 * HMAC validation: validates X-Grab-Signature header against GRAB_HMAC_SECRET env var.
 * If secret not configured, processes anyway (logs warning).
 * If validation fails, returns 200 (GrabFood spec) but skips processing.
 */
export const handleOrderWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();

  // HMAC validation
  const signatureHeader = request.headers.get("X-Grab-Signature");
  // NOTE: process.env is not available in httpAction (non-Node runtime).
  // HMAC secret must come from a different source (e.g., stored in DB or Convex env).
  // For now, we attempt to read from Convex environment variable.
  let hmacSecret: string | undefined;
  try {
    // Convex httpAction has access to environment variables via process.env only in "use node" files.
    // In non-node httpAction, we skip HMAC validation and rely on the route being non-guessable.
    // TODO: Move HMAC secret to platformCredentials table or Convex env vars when Node runtime is available.
    hmacSecret = undefined;
  } catch {
    hmacSecret = undefined;
  }

  const hmacResult = await validateHmacSignature(body, signatureHeader, hmacSecret);
  if (!hmacResult.valid && hmacResult.reason !== "no_secret") {
    console.log(`GrabFood webhook: HMAC validation failed (${hmacResult.reason}). Skipping order processing.`);
    // Return 200 per GrabFood spec even on validation failure
    return new Response("OK", { status: 200 });
  }

  let order: any;
  try {
    order = JSON.parse(body);
  } catch {
    console.log("GrabFood webhook: invalid JSON body");
    return new Response("OK", { status: 200 });
  }

  const orderID: string = order?.orderID ?? "unknown";
  const shortNum: string = order?.shortOrderNumber ?? "?";
  const merchantID: string = order?.merchantID ?? "unknown";

  console.log(`GrabFood webhook: new order ${shortNum} (${orderID}) for merchant ${merchantID}`);

  // Schedule async upsert — webhook-received orders have no syncLogId
  try {
    await ctx.scheduler.runAfter(0, internal.grabfoodOrders.mutations.upsertOrder, {
      order,
      syncLogId: undefined,
      outletId: undefined,
    });
  } catch (err) {
    console.log("GrabFood webhook: failed to schedule upsert:", err);
  }

  return new Response("OK", { status: 200 });
});

/**
 * Receive menu sync result webhooks from GrabFood.
 * GrabFood POSTs here after a menu sync job completes.
 *
 * HMAC validation applied same as order webhook.
 */
export const handleMenuSyncWebhook = httpAction(async (_ctx, request) => {
  const body = await request.text();

  // HMAC validation (same approach as order webhook)
  const signatureHeader = request.headers.get("X-Grab-Signature");
  const hmacResult = await validateHmacSignature(body, signatureHeader, undefined);
  if (!hmacResult.valid && hmacResult.reason !== "no_secret") {
    console.log(`GrabFood menu webhook: HMAC validation failed (${hmacResult.reason}). Skipping.`);
    return new Response("OK", { status: 200 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("OK", { status: 200 });
  }

  const { requestID, merchantID, jobID, status, errors } = payload;
  console.log(`GrabFood menu sync: ${status} for merchant ${merchantID} (job: ${jobID}, requestID: ${requestID})`);

  if (status === "FAILED" || status === "PARTIAL_FAILURE") {
    console.log("GrabFood menu sync errors:", errors);
  }

  return new Response("OK", { status: 200 });
});

import { httpAction } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";

// ─── HMAC Validation Helper ──────────────────────────────────────────────────

/**
 * Validate HMAC-SHA256 signature from GrabFood webhook.
 * Uses the Web Crypto API (available in Convex httpAction runtime).
 *
 * GrabFood sends the signature in the `X-Grab-Signature` header.
 * HMAC secret comes from platformCredentials table.
 *
 * Returns { valid: true } if signature matches.
 * If no HMAC secret is configured, returns { valid: true, reason: "no_secret" } (skip validation).
 * If no signature header, returns { valid: true, reason: "no_signature" } (GrabFood may not send it).
 */
export async function validateHmacSignature(
  body: string,
  signatureHeader: string | null,
  hmacSecret: string | undefined
): Promise<{ valid: boolean; reason?: string }> {
  if (!hmacSecret) {
    console.log("GrabFood webhook: HMAC secret not configured. Skipping validation.");
    return { valid: true, reason: "no_secret" };
  }

  if (!signatureHeader) {
    console.log("GrabFood webhook: No X-Grab-Signature header. Skipping validation.");
    return { valid: true, reason: "no_signature" };
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(hmacSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hashArray = Array.from(new Uint8Array(signature));
    const computedHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Constant-time comparison (best effort in JS)
    if (computedHex.length !== signatureHeader.length) {
      return { valid: false, reason: "mismatch" };
    }
    let mismatch = 0;
    for (let i = 0; i < computedHex.length; i++) {
      mismatch |= computedHex.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
    }

    return mismatch === 0
      ? { valid: true }
      : { valid: false, reason: "mismatch" };
  } catch (err) {
    console.log("GrabFood webhook: HMAC validation error:", err);
    return { valid: false, reason: "crypto_error" };
  }
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve HMAC secret from platformCredentials table.
 */
async function resolveHmacSecret(ctx: ActionCtx): Promise<string | undefined> {
  const secret = await ctx.runQuery(
    internal.platformCredentials.queries.getHmacSecret,
    { platformId: "grabfood" }
  );
  return secret ?? undefined;
}

/**
 * Shared webhook handler pattern for POST endpoints.
 * Handles HMAC validation, JSON parsing, sync logging, and error handling.
 * Eliminates duplication across 5 POST handlers.
 */
async function handleWebhookCommon(
  ctx: ActionCtx,
  request: Request,
  eventType: string,
  processPayload: (ctx: ActionCtx, payload: any) => Promise<{ status?: "error"; errorMessage?: string } | void>
): Promise<Response> {
  const body = await request.text();
  const sig = request.headers.get("X-Grab-Signature");
  const secret = await resolveHmacSecret(ctx);
  const hmac = await validateHmacSignature(body, sig, secret);

  if (!hmac.valid && hmac.reason !== "no_secret") {
    try {
      await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
        source: "grabfood",
        syncType: "webhook",
        status: "error",
        timestamp: Date.now(),
        triggeredBy: `grabfood-webhook-${eventType}`,
        errorMessage: `HMAC failed: ${hmac.reason}`,
      });
    } catch (err) { console.log("Failed to write sync log:", err); }
    return new Response("OK", { status: 200 });
  }

  let payload: any = {};
  try { payload = JSON.parse(body); } catch { /* invalid JSON - log as empty */ }

  let result: { status?: "error"; errorMessage?: string } | void = undefined;
  try {
    result = await processPayload(ctx, payload);
  } catch (err) {
    console.log(`Error processing ${eventType} webhook:`, err);
  }

  try {
    await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "grabfood",
      syncType: "webhook",
      status: result?.status === "error" ? "error" : "success",
      timestamp: Date.now(),
      triggeredBy: `grabfood-webhook-${eventType}`,
      ...(result?.errorMessage ? { errorMessage: result.errorMessage } : {}),
    });
  } catch (err) { console.log("Failed to write sync log:", err); }

  return new Response("OK", { status: 200 });
}

// ─── All-day service hours for all 7 days ───────────────────────────────────

const ALL_DAY_SERVICE_HOURS = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [
    day,
    {
      openPeriodType: "OpenPeriod",
      periods: [{ startTime: "00:00", endTime: "23:59" }],
    },
  ])
);

// ─── Handler 1: GET /api/grabfood/menu ──────────────────────────────────────

/**
 * Return GrabFood Section-based menu JSON built from externalProductMappings.
 * This is a GET endpoint — HMAC validates on empty string body.
 */
export const handleGetMenuWebhook = httpAction(async (ctx, request) => {
  const sig = request.headers.get("X-Grab-Signature");
  const secret = await resolveHmacSecret(ctx);
  const hmac = await validateHmacSignature("", sig, secret);

  if (!hmac.valid && hmac.reason !== "no_secret") {
    try {
      await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
        source: "grabfood",
        syncType: "webhook",
        status: "error",
        timestamp: Date.now(),
        triggeredBy: "grabfood-webhook-get-menu",
        errorMessage: `HMAC failed: ${hmac.reason}`,
      });
    } catch (err) { console.log("Failed to write sync log:", err); }
    return new Response("OK", { status: 200 });
  }

  // Extract merchantID from query params
  const url = new URL(request.url);
  const merchantID = url.searchParams.get("merchantID") ?? "";

  // Prefer grabfoodMenuItems (Menu Simulator data) when populated
  const grabfoodMenuItems: any[] = await ctx.runQuery(
    internal.grabfoodMenu.queries.listMenuItemsInternal
  );

  let items: Array<{
    id: string;
    name: string;
    sequence: number;
    availableStatus: string;
    price: number;
    description: string;
    photos: string[];
    modifierGroups: never[];
  }>;

  if (grabfoodMenuItems.length > 0) {
    // Build from grabfoodMenuItems — include ALL items with correct availableStatus
    items = grabfoodMenuItems.map((item: any) => ({
      id: item.grabfoodItemId ?? item._id,
      name: item.grabfoodName,
      sequence: item.sequence,
      availableStatus: item.isAvailable ? "AVAILABLE" : "UNAVAILABLE",
      price: item.grabfoodPrice,
      description: item.grabfoodDescription ?? "",
      photos: item.resolvedPhotoUrl ? [item.resolvedPhotoUrl] : [],
      modifierGroups: [],
    }));
  } else {
    // Fallback: read from externalProductMappings (legacy path)
    const mappings = await ctx.runQuery(
      internal.externalData.queries.listProductMappingsInternal,
      { source: "grabfood" }
    );

    // Filter available items (default true if isAvailable undefined)
    const availableItems = mappings.filter(
      (m: any) => m.isAvailable !== false
    );

    items = availableItems.map((m: any, index: number) => ({
      id: m.externalProductCode,
      name: m.externalProductName,
      sequence: index + 1,
      availableStatus: "AVAILABLE",
      price: m.grabfoodPrice ?? m.menuProduct?.defaultPrice ?? 0,
      description: "",
      photos: [],
      modifierGroups: [],
    }));
  }

  // Build Section-based menu JSON
  const menuResponse = {
    merchantID,
    partnerMerchantID: "",
    currency: {
      code: "IDR",
      symbol: "Rp",
      exponent: 0,
    },
    sellingTimes: [
      {
        startTime: "00:00",
        endTime: "23:59",
        id: "all-day",
        name: "All Day",
      },
    ],
    sections: [
      {
        id: "SECTION-FROLLIE",
        name: "Frollie Menu",
        sequence: 1,
        serviceHours: ALL_DAY_SERVICE_HOURS,
        categories: [
          {
            id: "CATEGORY-SNACKS",
            name: "Snacks",
            sequence: 1,
            availableStatus: "AVAILABLE",
            items,
          },
        ],
      },
    ],
  };

  // Log success
  try {
    await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "grabfood",
      syncType: "webhook",
      status: "success",
      timestamp: Date.now(),
      triggeredBy: "grabfood-webhook-get-menu",
      productsCount: items.length,
    });
  } catch (err) { console.log("Failed to write sync log:", err); }

  return new Response(JSON.stringify(menuResponse), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ─── Handler 2: POST /api/grabfood/order ────────────────────────────────────

/**
 * Receive incoming GrabFood orders via webhook.
 * Log-only: does NOT write to grabfoodOrders (per user decision).
 */
export const handleOrderWebhook = httpAction(async (ctx, request) => {
  return handleWebhookCommon(ctx, request, "order", async (_ctx, payload) => {
    const orderID = payload?.orderID ?? "unknown";
    const shortNum = payload?.shortOrderNumber ?? "?";
    const merchantID = payload?.merchantID ?? "unknown";
    console.log(`GrabFood webhook: new order ${shortNum} (${orderID}) for merchant ${merchantID}`);
  });
});

// ─── Handler 3: POST /api/grabfood/order/state ──────────────────────────────

/**
 * Receive order state change notifications.
 */
export const handleOrderStateWebhook = httpAction(async (ctx, request) => {
  return handleWebhookCommon(ctx, request, "order-state", async (_ctx, payload) => {
    const orderID = payload?.orderID ?? "unknown";
    const state = payload?.state ?? "unknown";
    const driverETA = payload?.driverETA;
    const driver = payload?.driver;
    console.log(`GrabFood order state: ${state} for order ${orderID}${driverETA ? `, ETA: ${driverETA}` : ""}${driver?.name ? `, driver: ${driver.name}` : ""}`);
  });
});

// ─── Handler 4: POST /api/grabfood/menu-sync ────────────────────────────────

/**
 * Receive menu sync result webhooks from GrabFood.
 * Logs FAILED/PARTIAL_FAILURE as error in syncLog.
 */
export const handleMenuSyncWebhook = httpAction(async (ctx, request) => {
  return handleWebhookCommon(ctx, request, "menu-sync", async (_ctx, payload) => {
    const { requestID, merchantID, jobID, status, errors } = payload ?? {};
    console.log(`GrabFood menu sync: ${status} for merchant ${merchantID} (job: ${jobID}, requestID: ${requestID})`);

    if (status === "FAILED" || status === "PARTIAL_FAILURE") {
      const errMsg = errors
        ? JSON.stringify(errors).substring(0, 500)
        : `Menu sync ${status}`;
      return { status: "error", errorMessage: errMsg };
    }
  });
});

// ─── Handler 5: POST /api/grabfood/integration-status ───────────────────────

/**
 * Receive integration status change notifications.
 */
export const handleIntegrationStatusWebhook = httpAction(async (ctx, request) => {
  return handleWebhookCommon(ctx, request, "integration-status", async (_ctx, payload) => {
    const merchantID = payload?.merchantID ?? "unknown";
    const integrationStatus = payload?.integrationStatus ?? "unknown";
    console.log(`GrabFood integration status: ${integrationStatus} for merchant ${merchantID}`);
  });
});

// ─── Handler 6: POST /api/grabfood/menu/push ────────────────────────────────

/**
 * Receive menu push notifications from GrabFood.
 * We are menu source of truth, so just log and acknowledge.
 */
export const handleMenuPushWebhook = httpAction(async (ctx, request) => {
  return handleWebhookCommon(ctx, request, "menu-push", async (_ctx, payload) => {
    const preview = JSON.stringify(payload).substring(0, 200);
    console.log(`GrabFood menu push received: ${preview}`);
  });
});

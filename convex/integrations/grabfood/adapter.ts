"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { GRABFOOD_CONFIG, type GrabOauthResponse, type GrabApiError } from "./config";

// ─── Token Management ─────────────────────────────────────────────────────────

/**
 * Fetch OAuth2 access token from Grab using client credentials.
 * Stores the token in platformCredentials with correct expiry time.
 */
async function fetchFreshToken(
  clientId: string,
  clientSecret: string
): Promise<{ token: string; expiresAt: number }> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: GRABFOOD_CONFIG.auth.grantType,
    scope: GRABFOOD_CONFIG.auth.scope,
  });

  const response = await fetch(GRABFOOD_CONFIG.auth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GrabFood OAuth failed (${response.status}): ${errText}`);
  }

  const data: GrabOauthResponse = await response.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  return { token: `Bearer ${data.access_token}`, expiresAt };
}

/**
 * Resolve the current valid access token for GrabFood.
 * Priority: DB token (if not expired) → env var → fetch new token.
 * Stores any newly fetched token back to DB.
 */
async function resolveToken(ctx: {
  runQuery: (...args: any[]) => Promise<any>;
  runMutation: (...args: any[]) => Promise<any>;
}): Promise<string | null> {
  const cred = await ctx.runQuery(
    internal.platformCredentials.queries.getCredentialsInternal,
    { platformId: GRABFOOD_CONFIG.platformId }
  );

  // Use cached token if still valid (with buffer)
  if (
    cred?.currentToken &&
    cred.tokenExpiresAt &&
    cred.tokenExpiresAt - Date.now() > GRABFOOD_CONFIG.tokenRefreshBufferMs
  ) {
    return cred.currentToken;
  }

  // Resolve client credentials
  const clientId = cred?.email ?? process.env.GRAB_CLIENT_ID ?? null;
  const clientSecret = cred?.password ?? process.env.GRAB_CLIENT_SECRET ?? null;

  if (!clientId || !clientSecret) {
    console.log("GrabFood: no credentials found (DB or env). Configure via Settings.");
    return null;
  }

  // Fetch fresh token
  console.log("GrabFood: fetching new OAuth2 access token...");
  try {
    const { token, expiresAt } = await fetchFreshToken(clientId, clientSecret);

    await ctx.runMutation(
      internal.platformCredentials.mutations.updateToken,
      {
        platformId: GRABFOOD_CONFIG.platformId,
        currentToken: token,
        tokenExpiresAt: expiresAt,
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "success",
      }
    );

    console.log("GrabFood: token fetched OK, expires in 1h");

    await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "grabfood" as const,
      syncType: "token_refresh" as const,
      status: "success" as const,
      timestamp: Date.now(),
      triggeredBy: "system",
    });

    return token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("GrabFood: token fetch failed:", msg);

    await ctx.runMutation(
      internal.platformCredentials.mutations.updateToken,
      {
        platformId: GRABFOOD_CONFIG.platformId,
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "error",
        lastRefreshError: msg,
      }
    );

    await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "grabfood" as const,
      syncType: "token_refresh" as const,
      status: "error" as const,
      timestamp: Date.now(),
      triggeredBy: "system",
      errorMessage: msg,
    });

    return null;
  }
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function grabRequest(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: object
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${GRABFOOD_CONFIG.api.baseUrl}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = { raw: await response.text().catch(() => "") };
  }

  return { ok: response.ok, status: response.status, data };
}

// ─── Public Actions ───────────────────────────────────────────────────────────

/**
 * Test the GrabFood connection by fetching a fresh token.
 * Returns success/failure with token expiry info.
 */
export const testConnection = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Auth check — only admins can test
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    const accessToken = await resolveToken(ctx);

    if (!accessToken) {
      return {
        success: false,
        error: "No credentials configured. Add your GRAB_CLIENT_ID and GRAB_CLIENT_SECRET via Settings.",
      };
    }

    return {
      success: true,
      message: "GrabFood OAuth2 token fetched successfully.",
      tokenPreview: accessToken.substring(0, 30) + "...",
    };
  },
});

/**
 * Accept or reject a GrabFood order.
 * toState: "ACCEPTED" | "REJECTED"
 */
export const respondToOrder = action({
  args: {
    token: v.string(),
    orderID: v.string(),
    toState: v.union(v.literal("ACCEPTED"), v.literal("REJECTED")),
  },
  handler: async (ctx, args) => {
    const accessToken = await resolveToken(ctx);
    if (!accessToken) {
      return { success: false, error: "GrabFood token unavailable. Check credentials." };
    }

    console.log(`GrabFood: ${args.toState} order ${args.orderID}`);

    const { ok, status, data } = await grabRequest(
      accessToken,
      "POST",
      GRABFOOD_CONFIG.endpoints.orderPrepare,
      { orderID: args.orderID, toState: args.toState }
    );

    if (!ok) {
      const err = data as GrabApiError;
      return {
        success: false,
        error: `HTTP ${status}: ${err.message ?? err.reason ?? "Unknown error"}`,
      };
    }

    return { success: true, orderID: args.orderID, state: args.toState };
  },
});

/**
 * Mark an order as ready for pickup/delivery.
 */
export const markOrderReady = action({
  args: {
    token: v.string(),
    orderID: v.string(),
  },
  handler: async (ctx, args) => {
    const accessToken = await resolveToken(ctx);
    if (!accessToken) {
      return { success: false, error: "GrabFood token unavailable." };
    }

    const { ok, status, data } = await grabRequest(
      accessToken,
      "POST",
      GRABFOOD_CONFIG.endpoints.orderMark,
      { orderID: args.orderID, markStatus: "READY" }
    );

    if (!ok) {
      const err = data as GrabApiError;
      return { success: false, error: `HTTP ${status}: ${err.message ?? err.reason}` };
    }

    return { success: true, orderID: args.orderID };
  },
});

/**
 * Get store open/closed status for a merchant.
 */
export const getStoreStatus = action({
  args: {
    token: v.string(),
    merchantID: v.string(),
  },
  handler: async (ctx, args) => {
    const accessToken = await resolveToken(ctx);
    if (!accessToken) {
      return { success: false, error: "GrabFood token unavailable." };
    }

    const path = GRABFOOD_CONFIG.endpoints.storeStatus.replace("{merchantID}", args.merchantID);
    const { ok, status, data } = await grabRequest(accessToken, "GET", path);

    if (!ok) {
      const err = data as GrabApiError;
      return { success: false, error: `HTTP ${status}: ${err.message ?? err.reason}` };
    }

    return { success: true, storeStatus: data };
  },
});

/**
 * Pause or unpause the store.
 * pauseDuration: minutes to pause (0 = unpause immediately).
 */
export const pauseStore = action({
  args: {
    token: v.string(),
    merchantID: v.string(),
    pauseDuration: v.number(),
  },
  handler: async (ctx, args) => {
    const accessToken = await resolveToken(ctx);
    if (!accessToken) {
      return { success: false, error: "GrabFood token unavailable." };
    }

    const { ok, status, data } = await grabRequest(
      accessToken,
      "PUT",
      GRABFOOD_CONFIG.endpoints.storePause,
      { merchantID: args.merchantID, pauseDuration: args.pauseDuration }
    );

    if (!ok) {
      const err = data as GrabApiError;
      return { success: false, error: `HTTP ${status}: ${err.message ?? err.reason}` };
    }

    const action = args.pauseDuration === 0 ? "unpaused" : `paused for ${args.pauseDuration} min`;
    return { success: true, message: `Store ${action}` };
  },
});

/**
 * Notify GrabFood that the menu has changed and trigger a re-sync.
 * Call this after any menu update.
 */
export const notifyMenuUpdate = action({
  args: {
    token: v.string(),
    merchantID: v.string(),
  },
  handler: async (ctx, args) => {
    const accessToken = await resolveToken(ctx);
    if (!accessToken) {
      return { success: false, error: "GrabFood token unavailable." };
    }

    const { ok, status, data } = await grabRequest(
      accessToken,
      "POST",
      GRABFOOD_CONFIG.endpoints.menuNotify,
      { merchantID: args.merchantID }
    );

    if (!ok) {
      const err = data as GrabApiError;
      return { success: false, error: `HTTP ${status}: ${err.message ?? err.reason}` };
    }

    return { success: true, message: "Menu sync triggered", response: data };
  },
});

// ─── Internal Actions (cron / webhook) ───────────────────────────────────────

/**
 * Internal: auto-refresh the GrabFood access token.
 * Run periodically (e.g., every 45 minutes via cron) to keep the token warm.
 */
export const autoRefreshToken = internalAction({
  args: {},
  handler: async (ctx) => {
    const token = await resolveToken(ctx);
    if (token) {
      console.log("GrabFood token auto-refresh: OK");
      return { success: true };
    }
    console.log("GrabFood token auto-refresh: failed or no credentials");
    return { success: false };
  },
});

// Webhook HTTP handlers live in webhooks.ts (httpAction cannot be in "use node" files).

// ─── TEMPORARY: Remove after API discovery ───────────────────────────────────

/**
 * TEMPORARY: API discovery action for Phase 27 gate validation.
 * Exercises all GrabFood Partner API endpoint categories and returns
 * structured findings for field mapping and merchantID documentation.
 *
 * Run via: npx convex run integrations/grabfood/adapter:discoverApi '{}'
 * Review output in Convex dashboard Logs tab.
 *
 * Remove this action after completing 27-01 discovery gate.
 */
export const discoverApi = action({
  args: {
    merchantID: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const results: Record<string, any> = {};

    // ── 1. Token Resolution ──────────────────────────────────────────────────
    console.log("=== GrabFood API Discovery: Starting ===");
    const accessToken = await resolveToken(ctx);

    if (!accessToken) {
      results.token = {
        success: false,
        error: "No credentials configured. Add GRAB_CLIENT_ID + GRAB_CLIENT_SECRET via Settings.",
      };
      console.log("GATE FAIL: Token resolution failed. Phase 27 deferred.");
      return { gateDecision: "FAIL", reason: "No token", results };
    }

    const tokenPreview = accessToken.substring(0, 40) + "...";
    results.token = { success: true, preview: tokenPreview };
    console.log("Token resolved OK:", tokenPreview);

    const merchantID = args.merchantID ?? "";

    // ── 2. Order List Endpoint ───────────────────────────────────────────────
    try {
      // Last 7 days
      const toDate = new Date().toISOString();
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      let ordersPath = GRABFOOD_CONFIG.endpoints.ordersList;
      if (merchantID) {
        ordersPath += `?merchantID=${encodeURIComponent(merchantID)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&page=1`;
      } else {
        ordersPath += `?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&page=1`;
      }

      console.log("Calling orders endpoint:", ordersPath);
      const ordersResult = await grabRequest(accessToken, "GET", ordersPath);
      console.log("Orders endpoint status:", ordersResult.status);
      console.log("Orders raw response:", JSON.stringify(ordersResult.data, null, 2));

      const orderCount = Array.isArray(ordersResult.data?.orders) ? ordersResult.data.orders.length : 0;
      const firstOrder = ordersResult.data?.orders?.[0] ?? null;
      const currencyExponent = firstOrder?.currency?.exponent ?? "N/A (no orders)";

      results.orders = {
        status: ordersResult.status,
        ok: ordersResult.ok,
        orderCount,
        more: ordersResult.data?.more ?? null,
        currencyExponent,
        firstOrderKeys: firstOrder ? Object.keys(firstOrder) : [],
        firstOrderSample: firstOrder,
      };

      if (firstOrder) {
        console.log("First order fields:", JSON.stringify(Object.keys(firstOrder)));
        console.log("First order currency:", JSON.stringify(firstOrder.currency));
        console.log("First order price:", JSON.stringify(firstOrder.price));
        console.log("First order items[0]:", JSON.stringify(firstOrder.items?.[0]));
        console.log("IDR exponent check:", firstOrder.currency?.exponent, "(expected 0 for IDR = no decimals)");
      }
    } catch (err) {
      results.orders = { error: String(err) };
      console.log("Orders endpoint error:", err);
    }

    // ── 3. Store Status Endpoint ─────────────────────────────────────────────
    if (merchantID) {
      try {
        const statusPath = GRABFOOD_CONFIG.endpoints.storeStatus.replace("{merchantID}", merchantID);
        console.log("Calling store status endpoint:", statusPath);
        const statusResult = await grabRequest(accessToken, "GET", statusPath);
        console.log("Store status HTTP:", statusResult.status);
        console.log("Store status response:", JSON.stringify(statusResult.data, null, 2));

        results.storeStatus = {
          status: statusResult.status,
          ok: statusResult.ok,
          data: statusResult.data,
        };
      } catch (err) {
        results.storeStatus = { error: String(err) };
        console.log("Store status error:", err);
      }
    } else {
      results.storeStatus = { skipped: "No merchantID provided — pass as arg to test" };
      console.log("Store status: skipped (no merchantID arg)");
    }

    // ── 4. Menu Batch Endpoint ───────────────────────────────────────────────
    try {
      // Test with empty menuEntities to check accessibility
      const menuBatchBody = merchantID
        ? { merchantID, field: "AVAILABILITY", menuEntities: [] }
        : { field: "AVAILABILITY", menuEntities: [] };

      console.log("Calling menu batch endpoint (empty array probe):", GRABFOOD_CONFIG.endpoints.menuBatch);
      const menuResult = await grabRequest(accessToken, "PUT", GRABFOOD_CONFIG.endpoints.menuBatch, menuBatchBody);
      console.log("Menu batch HTTP:", menuResult.status);
      console.log("Menu batch response:", JSON.stringify(menuResult.data, null, 2));

      results.menuBatch = {
        status: menuResult.status,
        ok: menuResult.ok,
        data: menuResult.data,
      };
    } catch (err) {
      results.menuBatch = { error: String(err) };
      console.log("Menu batch error:", err);
    }

    // ── 5. MerchantID Discovery ──────────────────────────────────────────────
    // GrabFood Partner API does not provide a /merchants listing endpoint.
    // MerchantIDs must be obtained from the GrabFood Merchant Portal or
    // from the first webhook/order response (order.merchantID field).
    results.merchantIDDiscovery = {
      note: "No /merchants listing endpoint in GrabFood Partner API v1.1.3",
      instruction: "MerchantIDs must be obtained from GrabFood Merchant Portal or from live order webhooks",
      providedMerchantID: merchantID || "none provided as arg",
    };
    console.log("MerchantID discovery note:", results.merchantIDDiscovery.note);

    // ── 6. Gate Decision ─────────────────────────────────────────────────────
    const tokenOk = results.token?.success === true;
    const ordersResponded = results.orders?.status !== undefined;
    const gateDecision = tokenOk && ordersResponded ? "PASS" : "FAIL";

    console.log("=== GATE DECISION:", gateDecision, "===");
    console.log("Token OK:", tokenOk);
    console.log("Orders endpoint responded:", ordersResponded, "(status:", results.orders?.status, ")");

    return {
      gateDecision,
      results,
    };
  },
});

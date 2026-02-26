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


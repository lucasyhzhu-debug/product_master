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

    // GrabFood API expects: { merchantID, isPause: bool, duration?: string }
    // duration must be exactly one of: "30m", "1h", "24h"
    const isPause = args.pauseDuration > 0;
    /**
     * GrabFood API pause durations.
     * Only 3 values supported: "30m", "1h", "24h".
     * Keys = minutes sent from frontend buttons.
     * Note: 1440 = 24 * 60 (actual minutes in 24 hours).
     */
    const PAUSE_DURATION_MAP: Record<number, string> = { 30: "30m", 60: "1h", 1440: "24h" };
    const body: Record<string, unknown> = {
      merchantID: args.merchantID,
      isPause,
    };
    if (isPause) {
      body.duration = PAUSE_DURATION_MAP[args.pauseDuration] ?? "30m";
    }

    const { ok, status, data } = await grabRequest(
      accessToken,
      "PUT",
      GRABFOOD_CONFIG.endpoints.storePause,
      body
    );

    if (!ok) {
      const err = data as GrabApiError;
      return { success: false, error: `HTTP ${status}: ${err.message ?? err.reason}` };
    }

    const pauseLabel = PAUSE_DURATION_MAP[args.pauseDuration] ?? `${args.pauseDuration}m`;
    const action = args.pauseDuration === 0 ? "unpaused" : `paused for ${pauseLabel}`;
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

// ─── Menu Management ─────────────────────────────────────────────────────────

/**
 * Send a batch menu update to GrabFood for a specific field type.
 * Private helper — called by pushMenuChanges.
 */
async function batchMenuUpdate(
  token: string,
  merchantID: string,
  field: "PRICE" | "AVAILABILITY",
  menuEntities: Array<Record<string, unknown>>
): Promise<{ ok: boolean; status: number; data: any }> {
  return grabRequest(token, "PUT", GRABFOOD_CONFIG.endpoints.menuBatch, {
    merchantID,
    field,
    menuEntities,
  });
}

/**
 * Notify GrabFood that the menu has changed.
 * CRITICAL: changes are NOT live without calling this after batch updates.
 */
async function notifyMenu(
  token: string,
  merchantID: string
): Promise<{ ok: boolean; status: number; data: any }> {
  return grabRequest(token, "POST", GRABFOOD_CONFIG.endpoints.menuNotify, {
    merchantID,
  });
}

/**
 * Push menu price and availability changes to GrabFood.
 * Three-step process:
 *   1) Batch update prices (if any)
 *   2) Batch update availability (if any)
 *   3) ALWAYS notify menu (changes not live without it)
 * Then update push state tracking on grabfoodMenuItems.
 */
export const pushMenuChanges = action({
  args: {
    token: v.string(),
    merchantID: v.string(),
    priceUpdates: v.array(
      v.object({ id: v.string(), price: v.number() })
    ),
    availabilityUpdates: v.array(
      v.object({
        id: v.string(),
        availableStatus: v.union(v.literal("AVAILABLE"), v.literal("UNAVAILABLE")),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Auth check
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    const accessToken = await resolveToken(ctx);
    if (!accessToken) {
      return { success: false, error: "GrabFood token unavailable. Check credentials." };
    }

    try {
      // Step 1: Push price updates
      if (args.priceUpdates.length > 0) {
        const priceEntities = args.priceUpdates.map((item) => ({
          id: item.id,
          price: item.price,
        }));

        const priceResult = await batchMenuUpdate(
          accessToken,
          args.merchantID,
          "PRICE",
          priceEntities
        );

        if (!priceResult.ok) {
          const err = priceResult.data as GrabApiError;
          const errorMsg = `Price batch update failed (HTTP ${priceResult.status}): ${err.message ?? err.reason ?? "Unknown error"}`;

          await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
            source: "grabfood" as const,
            syncType: "manual" as const,
            status: "error" as const,
            timestamp: Date.now(),
            triggeredBy: "push-menu",
            errorMessage: errorMsg,
          });

          return { success: false, error: errorMsg };
        }
      }

      // Step 2: Push availability updates
      if (args.availabilityUpdates.length > 0) {
        const availEntities = args.availabilityUpdates.map((item) => ({
          id: item.id,
          availableStatus: item.availableStatus,
          ...(item.availableStatus === "UNAVAILABLE" ? { maxStock: 0 } : {}),
        }));

        const availResult = await batchMenuUpdate(
          accessToken,
          args.merchantID,
          "AVAILABILITY",
          availEntities
        );

        if (!availResult.ok) {
          const err = availResult.data as GrabApiError;
          const errorMsg = `Availability batch update failed (HTTP ${availResult.status}): ${err.message ?? err.reason ?? "Unknown error"}`;

          await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
            source: "grabfood" as const,
            syncType: "manual" as const,
            status: "error" as const,
            timestamp: Date.now(),
            triggeredBy: "push-menu",
            errorMessage: errorMsg,
          });

          return { success: false, error: errorMsg };
        }
      }

      // Step 3: ALWAYS notify menu — changes not live without it
      const notifyResult = await notifyMenu(accessToken, args.merchantID);
      if (!notifyResult.ok) {
        console.log("GrabFood: push succeeded but menu notification failed:", notifyResult.data);
      }

      // Step 4: Update push state on grabfoodMenuItems
      // Build push state updates from the items we just pushed
      const pushStateUpdates: Array<{
        menuItemId: any;
        lastPushedPrice?: number;
        lastPushedAvailability?: boolean;
      }> = [];

      // Get all menu items to find IDs by grabfoodItemId
      const menuItems: any[] = await ctx.runQuery(
        internal.grabfoodMenu.queries.listMenuItemsInternal
      );
      const itemByGrabId = new Map<string, any>();
      for (const mi of menuItems) {
        if (mi.grabfoodItemId) {
          itemByGrabId.set(mi.grabfoodItemId, mi);
        }
      }

      for (const pu of args.priceUpdates) {
        const mi = itemByGrabId.get(pu.id);
        if (mi) {
          pushStateUpdates.push({
            menuItemId: mi._id,
            lastPushedPrice: pu.price,
          });
        }
      }

      for (const au of args.availabilityUpdates) {
        const mi = itemByGrabId.get(au.id);
        if (mi) {
          // Check if already in pushStateUpdates from price
          const existing = pushStateUpdates.find(
            (u) => u.menuItemId === mi._id
          );
          if (existing) {
            existing.lastPushedAvailability = au.availableStatus === "AVAILABLE";
          } else {
            pushStateUpdates.push({
              menuItemId: mi._id,
              lastPushedAvailability: au.availableStatus === "AVAILABLE",
            });
          }
        }
      }

      if (pushStateUpdates.length > 0) {
        await ctx.runMutation(
          internal.grabfoodMenu.mutations.updatePushState,
          { updates: pushStateUpdates }
        );
      }

      // Step 5: Log success
      await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
        source: "grabfood" as const,
        syncType: "manual" as const,
        status: "success" as const,
        timestamp: Date.now(),
        triggeredBy: "push-menu",
      });

      return {
        success: true,
        priceUpdatesCount: args.priceUpdates.length,
        availabilityUpdatesCount: args.availabilityUpdates.length,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("GrabFood pushMenuChanges error:", msg);

      await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
        source: "grabfood" as const,
        syncType: "manual" as const,
        status: "error" as const,
        timestamp: Date.now(),
        triggeredBy: "push-menu",
        errorMessage: msg,
      });

      return { success: false, error: msg };
    }
  },
});

/**
 * Get menu items for a GrabFood merchant.
 *
 * GrabFood Partner API has NO GET menu endpoint — /partner/v1/menu only
 * accepts PUT (push menu TO GrabFood). So we source menu items locally
 * from externalProductMappings (source: "grabfood") joined with menuProducts.
 *
 * Items returned in a categories > items structure matching GrabFood SDK format
 * so the frontend parser works unchanged.
 */
export const getMenuItems = action({
  args: {
    token: v.string(),
    merchantID: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    // Query local product mappings for grabfood source
    const mappings: any[] = await ctx.runQuery(
      internal.externalData.queries.listProductMappingsInternal,
      { source: "grabfood" as const }
    );

    if (!mappings || mappings.length === 0) {
      return {
        success: true,
        menu: {
          categories: [{
            id: "all",
            name: "All Items",
            availableStatus: "AVAILABLE" as const,
            sellingTimeID: "default",
            items: [],
          }],
        },
      };
    }

    // Build items from mappings — use externalProductCode as GrabFood item ID
    const items = mappings.map((m: any) => ({
      id: m.externalProductCode,
      name: m.externalProductName,
      availableStatus: "AVAILABLE" as const,
      price: m.menuProduct?.basePrice ?? undefined,
    }));

    return {
      success: true,
      menu: {
        categories: [{
          id: "all",
          name: "All Items",
          availableStatus: "AVAILABLE" as const,
          sellingTimeID: "default",
          items,
        }],
      },
    };
  },
});

// ─── Order Sync ──────────────────────────────────────────────────────────────

/**
 * Sync GrabFood orders for a merchant.
 * Paginates the orders list endpoint and upserts each order with revenue bridge.
 * Handles 401 gracefully (known OAuth2 scope gap — does not crash).
 */
export const syncOrders = action({
  args: {
    token: v.string(),
    merchantID: v.string(),
    outletId: v.optional(v.id("externalOutlets")),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Auth check — manager or admin
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    const startMs = Date.now();

    // Create sync log
    const syncLogId = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "grabfood" as const,
        syncType: "manual" as const,
        status: "started" as const,
        timestamp: startMs,
        outletId: args.outletId,
        triggeredBy: "user",
      }
    );

    try {
      const accessToken = await resolveToken(ctx);
      if (!accessToken) {
        await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
          logId: syncLogId,
          status: "error" as const,
          errorMessage: "No GrabFood credentials configured",
          durationMs: Date.now() - startMs,
        });
        return { success: false, error: "No GrabFood credentials configured. Add client_id and client_secret via Settings." };
      }

      // Determine date range
      const fromDate = args.fromDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const toDate = args.toDate ?? new Date().toISOString().split("T")[0];

      let page = 1;
      let hasMore = true;
      let totalOrders = 0;

      while (hasMore) {
        const params = new URLSearchParams({
          merchantID: args.merchantID,
          page: String(page),
          date: fromDate,
        });

        const { ok, status, data } = await grabRequest(
          accessToken,
          "GET",
          `${GRABFOOD_CONFIG.endpoints.ordersList}?${params.toString()}`
        );

        // Handle 401 gracefully — known OAuth2 scope gap
        if (status === 401) {
          const errorMsg = "Orders endpoint returned 401 (Unauthorized). This is a known OAuth2 scope limitation. " +
            "Contact GrabFood developer support to request orders:read scope for your client credentials.";
          console.log("GrabFood syncOrders:", errorMsg);

          await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
            logId: syncLogId,
            status: "error" as const,
            errorMessage: errorMsg,
            durationMs: Date.now() - startMs,
          });

          return { success: false, error: errorMsg, ordersCount: 0 };
        }

        if (!ok) {
          const errMsg = `HTTP ${status}: ${data?.message ?? data?.reason ?? "Unknown error"}`;
          console.log("GrabFood syncOrders error:", errMsg);

          await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
            logId: syncLogId,
            status: "error" as const,
            errorMessage: errMsg,
            durationMs: Date.now() - startMs,
          });

          return { success: false, error: errMsg, ordersCount: totalOrders };
        }

        // Process orders from this page
        const orders: any[] = data?.orders ?? [];
        if (orders.length > 0) {
          // Batch upsert (up to 50 per mutation call)
          for (let i = 0; i < orders.length; i += 50) {
            const batch = orders.slice(i, i + 50);
            await ctx.runMutation(
              internal.grabfoodOrders.mutations.upsertOrderBatch,
              {
                orders: batch,
                syncLogId,
                outletId: args.outletId,
              }
            );
          }
          totalOrders += orders.length;
        }

        // Check pagination
        hasMore = data?.more === true;
        page++;

        // Safety: cap at 100 pages to prevent infinite loops
        if (page > 100) {
          console.log("GrabFood syncOrders: hit 100 page limit, stopping pagination");
          break;
        }
      }

      // Update sync log with success
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "success" as const,
        productsCount: totalOrders,
        durationMs: Date.now() - startMs,
      });

      console.log(`GrabFood syncOrders: synced ${totalOrders} orders from ${fromDate} to ${toDate}`);
      return { success: true, ordersCount: totalOrders };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("GrabFood syncOrders: unexpected error:", msg);

      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "error" as const,
        errorMessage: msg,
        durationMs: Date.now() - startMs,
      });

      return { success: false, error: msg, ordersCount: 0 };
    }
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


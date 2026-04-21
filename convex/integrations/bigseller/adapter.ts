"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { decodeJwtPayload } from "../../lib/jwt";
import { BIGSELLER_PLATFORM_ID } from "./config";
import type { ChannelAdapter } from "../_shared/channelAdapter";
import type { ChannelSaleEvent } from "../_shared/channelSaleEvent";

// ─── ChannelAdapter: normalize() + adapter export (Phase 74.5.1 Plan 06) ─────
//
// RESEARCH Pitfall 3: BigSeller's nominal source is aggregate-only; items only
// exist for the `shopee` + `tiktok` platform branches. The live :804-866 emit
// gate in ./sync.ts stays intact — this pure normalize() mirrors that
// semantic: `platform === "bigseller"` (aggregate) → skipped, no events.
//
// event.source is the PLATFORM literal (`shopee` | `tiktok`), NOT `bigseller`,
// matching the live saveRevenueItems call shape. ChannelAdapter.source is the
// adapter's nominal literal (`bigseller`) — these are intentionally different
// and the interface does not constrain them to be equal.
export interface BigsellerRawOrder {
  readonly platform: "shopee" | "tiktok" | "bigseller";
  readonly orderId: string;
  readonly completedAt: number;
  readonly outletId?: string;
  readonly items: ReadonlyArray<{
    readonly sku?: string;
    readonly productName?: string;
    readonly menuProductId?: string;
    readonly quantity: number;
    readonly unitPrice: number;
    readonly totalPrice: number;
  }>;
}

export interface BigsellerRawBatch {
  readonly orders: ReadonlyArray<BigsellerRawOrder>;
}

/**
 * Pure projection: BigSeller batch → ChannelSaleEvent[].
 *
 * Per-order platform branch:
 *   - `platform === "bigseller"`: aggregate row with no items — skipped.
 *   - `platform === "shopee" | "tiktok"`: emit events with `source: platform`.
 *
 * Side-effect free, consumed by Wave 0 normalize test + Plan 05 dispatch hook.
 */
export function bigsellerNormalize(
  payload: BigsellerRawBatch
): ChannelSaleEvent[] {
  if (!payload || !payload.orders || payload.orders.length === 0) return [];

  const events: ChannelSaleEvent[] = [];
  for (const order of payload.orders) {
    // Pitfall 3 — aggregate branch has no items to emit.
    if (order.platform === "bigseller") continue;

    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      events.push({
        source: order.platform, // "shopee" | "tiktok" — NOT "bigseller"
        occurredAt: order.completedAt,
        externalTransactionId: order.orderId,
        externalItemId: item.sku ?? `${order.orderId}-${i}`,
        outletId: order.outletId as Id<"externalOutlets"> | undefined,
        menuProductId: item.menuProductId as Id<"menuProducts"> | undefined,
        externalProductCode: item.sku,
        externalProductName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      });
    }
  }
  return events;
}

export const bigsellerAdapter: ChannelAdapter<BigsellerRawBatch> = {
  source: "bigseller",
  normalize: bigsellerNormalize,
};

// ─── Token Preview (AUTH-02) ──────────────────────────────────────────────────

/**
 * Decode a pasted BigSeller muc_token and return expiry info for preview.
 * Admin-only. Does NOT save the token — allows the user to verify before confirming.
 *
 * Returns:
 *   { success: true, expiresAt: number, daysRemaining: number, uid?: string }
 *   { success: false, error: string }
 */
export const previewBigSellerToken = action({
  args: {
    token: v.string(),
    mucToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate admin role
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    let payload: Record<string, unknown>;
    try {
      payload = decodeJwtPayload(args.mucToken);
    } catch (err) {
      return {
        success: false as const,
        error: `Invalid JWT format: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const exp = payload.exp as number | undefined;
    if (exp === undefined || exp === null) {
      return {
        success: false as const,
        error: "JWT has no expiry field",
      };
    }

    const expiresAt = exp * 1000; // Unix seconds -> ms
    const daysRemaining = Math.floor((expiresAt - Date.now()) / 86400000);

    if (daysRemaining < 0) {
      return {
        success: false as const,
        error: "Token is already expired",
      };
    }

    const uid = [payload.uid, payload.user_id, payload.sub, payload.id]
      .map((v) => (typeof v === "number" ? String(v) : v))
      .find((v): v is string => typeof v === "string" && v !== "user");

    return {
      success: true as const,
      expiresAt,
      daysRemaining,
      uid,
    };
  },
});

// ─── Token Save (AUTH-02) ─────────────────────────────────────────────────────

/**
 * Save a pasted BigSeller muc_token with decoded JWT expiry.
 * Admin-only. Stores the token with actual JWT exp instead of 6h estimate.
 *
 * Returns:
 *   { success: true, daysRemaining: number }
 *   { success: false, error: string }
 */
export const saveBigSellerToken = action({
  args: {
    token: v.string(),
    mucToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate admin role
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    let payload: Record<string, unknown>;
    try {
      payload = decodeJwtPayload(args.mucToken);
    } catch (err) {
      return {
        success: false as const,
        error: `Invalid JWT format: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const exp = payload.exp as number | undefined;
    if (exp === undefined || exp === null) {
      return {
        success: false as const,
        error: "JWT has no expiry field — cannot determine token lifetime",
      };
    }

    const tokenExpiresAt = exp * 1000; // Unix seconds -> ms
    const daysRemaining = Math.floor((tokenExpiresAt - Date.now()) / 86400000);

    if (daysRemaining < 0) {
      return {
        success: false as const,
        error: "Token is already expired",
      };
    }

    // Save muc_token as currentToken (primary access credential — NOT refreshToken)
    // Pass actual JWT expiry so health dashboard shows correct countdown (e.g. 28 days, not 6h)
    await ctx.runMutation(internal.platformCredentials.mutations.saveDirectToken, {
      platformId: BIGSELLER_PLATFORM_ID,
      bearerToken: args.mucToken,
      tokenExpiresAt, // actual JWT exp — Task 1 added this optional param
    });

    // Record token paste in sync history so it appears in the platform card
    await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "bigseller" as const,
      syncType: "token_refresh" as const,
      status: "success" as const,
      timestamp: Date.now(),
      triggeredBy: "system",
    });

    return {
      success: true as const,
      daysRemaining,
    };
  },
});

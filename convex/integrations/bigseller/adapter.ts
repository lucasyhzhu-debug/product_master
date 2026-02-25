"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { decodeJwtPayload } from "../../lib/jwt";
import { BIGSELLER_PLATFORM_ID } from "./config";

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
      .find((v): v is string => typeof v === "string");

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

    return {
      success: true as const,
      daysRemaining,
    };
  },
});

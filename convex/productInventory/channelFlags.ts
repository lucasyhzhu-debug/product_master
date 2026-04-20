/**
 * Phase 74.5.1 Plan 09 — Channel Deduction Flags (admin backend)
 *
 * Provides:
 * - `getChannelDeductionFlags(token)`: admin-gated read that returns the full
 *   8-key flag map. Missing object / absent row → all false (per schema comment).
 * - `setChannelDeductionFlag(token, source, enabled)`: admin-gated mutation that
 *   patches a single key in the 8-key object; creates the single-row settings
 *   record on first use with sensible defaults if absent.
 *
 * Domain separation: kept in its own file (not `channelRouting.ts`) because the
 * flag map lives on `productInventorySettings`, a different domain from the
 * `channelRouting` table. Plan 10's backfill/audit code may also call
 * `getChannelDeductionFlags` — shared read path without coupling to routing.
 *
 * Auth: BOTH query and mutation gate on `requireRole(ctx, token, ["admin"])`
 * per CONTEXT D-03 and threat register T-74.5.1-21.
 *
 * Pitfall #10: token is stripped from args before DB writes.
 * Pitfall #9: static imports only.
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { externalSource } from "../schema";
import { requireRole } from "../lib/auth";
import type { ExternalSource } from "../lib/externalSource";

/** Full 8-key default map. All flags default OFF until admin flips. */
const DEFAULT_FLAGS: Record<ExternalSource, boolean> = {
  bigseller: false,
  consignment: false,
  gobiz: false,
  grabfood: false,
  internal: false,
  k3mart: false,
  shopee: false,
  tiktok: false,
};

/**
 * Read the 8-key flag map. Returns all-false defaults if the settings row
 * doesn't exist yet OR if `channelDeductionEnabled` is absent on the row.
 *
 * Admin-only — per threat register T-74.5.1-21.
 */
export const getChannelDeductionFlags = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    const settings = await ctx.db.query("productInventorySettings").first();
    return {
      ...DEFAULT_FLAGS,
      ...(settings?.channelDeductionEnabled ?? {}),
    };
  },
});

/**
 * Toggle a single channel's deduction flag.
 *
 * Creates the single-row `productInventorySettings` record on first flip
 * (never mutates more than one row — by design, the table holds exactly one
 * "global config" row, per schema comment "Global config (single-row pattern)").
 *
 * Does NOT perform any historical backfill — that's Plan 11+ (74.5.2 cutover).
 * Admin flipping a flag with no prior backfill is surfaced as a UI warning
 * (UI-SPEC §Destructive Confirmations) but is NOT blocked server-side.
 * Threat T-74.5.1-22: admins may bypass UI warnings; this is an accepted risk
 * because the consequence (double-deduction / missed deduction) is detectable
 * and reversible.
 */
export const setChannelDeductionFlag = mutation({
  args: {
    token: v.string(),
    source: externalSource,
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    const settings = await ctx.db.query("productInventorySettings").first();
    const current = settings?.channelDeductionEnabled ?? DEFAULT_FLAGS;
    const next = { ...DEFAULT_FLAGS, ...current, [args.source]: args.enabled };

    if (settings) {
      await ctx.db.patch(settings._id, {
        channelDeductionEnabled: next,
        updatedBy: user.name,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("productInventorySettings", {
        globalLowStockThreshold: 5,
        autoAdvanceOnDrawdown: true,
        alertMode: "toast" as const,
        channelDeductionEnabled: next,
        updatedBy: user.name,
        updatedAt: Date.now(),
      });
    }

    return {
      source: args.source,
      enabled: args.enabled,
      flippedBy: user.name,
      flippedAt: Date.now(),
    };
  },
});

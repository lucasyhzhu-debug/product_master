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
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { externalSource } from "../schema";
import { requireRole } from "../lib/auth";
import type { ExternalSource } from "../lib/externalSource";

/**
 * Full 8-key default map.
 *
 * - All channels default OFF (ship-dark per D74.5.1-L1) EXCEPT:
 * - `gobiz` defaults ON as of Phase 74.5.2.1. Rationale — 74.5.2 retired
 *   `processGofoodSales`, so there is no legacy deduction path anymore.
 *   Defaulting OFF would cause silent under-deduction on every GoFood sale.
 *   The unified `saveRevenueItemsImpl` read-site at
 *   `convex/externalData/mutations.ts` treats `flagMap === undefined` as
 *   gobiz-ON; this constant mirrors that contract for the admin UI so a
 *   freshly-created settings row shows gobiz=ON by default.
 */
const DEFAULT_FLAGS: Record<ExternalSource, boolean> = {
  bigseller: false,
  consignment: false,
  gobiz: true, // 74.5.2.1 — no legacy path post-74.5.2 retirement
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

/**
 * Phase 74.5.2.1 — Composite K3Mart bundle flip (CONTEXT D74.5.2-L14).
 *
 * Atomically sets BOTH `k3mart` (child-row linking / sale dispatch) and
 * `consignment` (parent-row revenue recognition) flags in a single Convex
 * mutation. Prevents the accidental out-of-sync state that occurs when an
 * operator flips only one flag via the per-source switches.
 *
 * Admin-only. Creates the singleton settings row on first flip (same pattern
 * as setChannelDeductionFlag — uses DEFAULT_FLAGS as the base when absent).
 *
 * Returns the final state of both flags for UI confirmation.
 */
export const flipK3MartBundle = mutation({
  args: {
    token: v.string(),
    enable: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    const settings = await ctx.db.query("productInventorySettings").first();
    const current = settings?.channelDeductionEnabled ?? DEFAULT_FLAGS;
    const next = {
      ...DEFAULT_FLAGS,
      ...current,
      k3mart: args.enable,
      consignment: args.enable,
    };

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
      k3mart: args.enable,
      consignment: args.enable,
      flippedBy: user.name,
      flippedAt: Date.now(),
    };
  },
});

// ============================================================================
// Direct-handler test shim (D74.5.2-L1 pattern — mirrors Plan 01's
// `_runFullAuditForTest` in channelAudit.ts and Plan 03's shims in backfill.ts).
//
// convex-test's `t.mutation(internal.*)` / `t.mutation(api.*)` resolver fails
// with module-resolution errors for the `productInventory/*` subtree. This
// helper replicates the registered handler verbatim against a single ctx so
// tests can invoke it via `t.run(async (ctx) => await _fooForTest(ctx, args))`.
//
// DO NOT call from production code.
// ============================================================================

export const _flipK3MartBundleForTest = async (
  ctx: MutationCtx,
  args: { token: string; enable: boolean },
): Promise<{ k3mart: boolean; consignment: boolean; flippedBy: string; flippedAt: number }> => {
  const user = await requireRole(ctx, args.token, ["admin"]);

  const settings = await ctx.db.query("productInventorySettings").first();
  const current = settings?.channelDeductionEnabled ?? DEFAULT_FLAGS;
  const next = {
    ...DEFAULT_FLAGS,
    ...current,
    k3mart: args.enable,
    consignment: args.enable,
  };

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
    k3mart: args.enable,
    consignment: args.enable,
    flippedBy: user.name,
    flippedAt: Date.now(),
  };
};

/**
 * One-shot routing seed migration (Phase 74.5.1, Plan 08).
 *
 * Populates `channelRouting` from `externalOutlets.linkedStorageLocationId` —
 * the implicit GoFood routing source pre-74.5. Idempotent: re-running skips
 * outlets whose routing row already exists (via the
 * `by_source_outlet_product` index lookup).
 *
 * Design notes:
 *   - Admin-triggerable via the public `runRoutingSeed` mutation, which
 *     schedules the internal action. Follows the `/admin/unlinked-products-
 *     backfill` pattern (feedback_ui_for_db_ops memory note).
 *   - Does NOT modify any `externalOutlets` row — the `linkedStorageLocationId`
 *     field is deprecated in 74.5.1 (stop writing); actual field drop is
 *     deferred to 999.6 per CONTEXT §Deferred Ideas.
 *   - Does NOT create Tier-4 source-level defaults (isDefault=true); admins
 *     set those manually via ChannelRoutingManager.
 *   - Static imports only (Pitfall #8). No dynamic `import()`.
 *
 * Threat mitigation (T-74.5.1-19 Tampering): idempotency check via
 * `findExistingRoute` prevents overwriting manually-configured routing rules.
 * If admin has already added/edited a routing row for (source, outletId), the
 * seed skips it.
 */

import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";
import { externalSource } from "../schema";
import { internal } from "../_generated/api";

// ============================================================================
// Internal helper queries + mutation
// ============================================================================

/** Fetch every externalOutlets row that has a linkedStorageLocationId. */
export const listOutletsWithLinkedLocation = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"externalOutlets">[]> => {
    const all = await ctx.db.query("externalOutlets").collect();
    return all.filter((o) => o.linkedStorageLocationId !== undefined);
  },
});

/**
 * Look up an existing channelRouting row for (source, outletId, menuProductId=null).
 * Uses the by_source_outlet_product index for O(1) idempotency check.
 */
export const findExistingRoute = internalQuery({
  args: {
    source: externalSource,
    outletId: v.id("externalOutlets"),
  },
  handler: async (ctx, args): Promise<Doc<"channelRouting"> | null> => {
    return await ctx.db
      .query("channelRouting")
      .withIndex("by_source_outlet_product", (q) =>
        q
          .eq("source", args.source)
          .eq("outletId", args.outletId)
          .eq("menuProductId", undefined),
      )
      .first();
  },
});

/** Insert a single seeded channelRouting row. */
export const insertSeedRoute = internalMutation({
  args: {
    source: externalSource,
    outletId: v.id("externalOutlets"),
    storageLocationId: v.id("storageLocations"),
    triggeredBy: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"channelRouting">> => {
    return await ctx.db.insert("channelRouting", {
      source: args.source,
      outletId: args.outletId,
      menuProductId: undefined,
      storageLocationId: args.storageLocationId,
      isDefault: false,
      notes: `Seeded from externalOutlets.linkedStorageLocationId on ${new Date().toISOString()}`,
      updatedBy: `migration:${args.triggeredBy}`,
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// Core internal action — the actual seed loop
// ============================================================================

/**
 * Walk every externalOutlets row with linkedStorageLocationId, insert a
 * channelRouting row per outlet unless one already exists for
 * (source, outletId, menuProductId=null).
 *
 * Returns counters so admins can confirm the run from the UI / logs.
 */
export const seedChannelRoutingFromOutlets = internalAction({
  args: { triggeredBy: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ seeded: number; skipped: number; alreadyExists: number }> => {
    const outlets: Doc<"externalOutlets">[] = await ctx.runQuery(
      internal.migrations.channelRoutingSeed.listOutletsWithLinkedLocation,
      {},
    );

    let seeded = 0;
    let skipped = 0;
    let alreadyExists = 0;

    for (const outlet of outlets) {
      if (!outlet.linkedStorageLocationId) {
        skipped++;
        continue;
      }

      const existing: Doc<"channelRouting"> | null = await ctx.runQuery(
        internal.migrations.channelRoutingSeed.findExistingRoute,
        { source: outlet.source, outletId: outlet._id },
      );

      if (existing) {
        alreadyExists++;
        continue;
      }

      await ctx.runMutation(
        internal.migrations.channelRoutingSeed.insertSeedRoute,
        {
          source: outlet.source,
          outletId: outlet._id,
          storageLocationId: outlet.linkedStorageLocationId,
          triggeredBy: args.triggeredBy,
        },
      );
      seeded++;
    }

    return { seeded, skipped, alreadyExists };
  },
});

// ============================================================================
// Admin-facing trigger mutation (T-74.5.1-19 Tampering: gated on admin role)
// ============================================================================

/**
 * Admin-triggerable seed action.
 *
 * Wave 3 UI (ChannelRoutingManager) can expose a "Seed from outlets" button
 * that calls this mutation; the mutation schedules the action and returns
 * immediately so the UI can show progress without blocking on the loop.
 *
 * Auth: requireRole(ctx, token, ["admin"]).
 * Idempotency: re-running is a no-op for outlets that already have routing rows.
 */
export const runRoutingSeed = mutation({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<{ scheduled: true }> => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    await ctx.scheduler.runAfter(
      0,
      internal.migrations.channelRoutingSeed.seedChannelRoutingFromOutlets,
      { triggeredBy: user.name },
    );
    return { scheduled: true };
  },
});

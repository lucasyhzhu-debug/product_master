/**
 * Phase 74.5.1 — Channel Routing admin queries
 *
 * Provides list + preview queries consumed by `ChannelRoutingManager` (Plan 09):
 * - `listRoutingRules({token})`: admin-gated list of all rules joined with
 *   storage-location, outlet, and menu-product names for display.
 * - `previewRouteResolution({token, source, outletId?, menuProductId?})`:
 *   admin-gated simulation of `resolveChannelRoute` that returns `{tier, location}`
 *   on success or `{errorCode: CHANNEL_ROUTING_NOT_CONFIGURED, tier: 5}` on miss
 *   — wraps the throw so UI shows inline error states without promise rejection.
 *
 * References:
 * - UI-SPEC §ChannelRoutingManager — Anatomy items 4 (Resolution Preview) + 5 (table columns)
 * - CONTEXT D-03 (admin-only), threat T-74.5.1-03 (read-side info disclosure)
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { externalSource } from "../schema";
import { requireRole } from "../lib/auth";
import {
  resolveChannelRoute,
  CHANNEL_ROUTING_NOT_CONFIGURED,
} from "./channelRouting";

/**
 * List all routing rules joined with display names. Sorted by source asc, then
 * updatedAt desc within a source.
 *
 * Returns `(deleted)` for any FK whose target was deleted (defensive — Convex has
 * no cascading deletes; orphaned references should be extremely rare but still
 * renderable).
 */
export const listRoutingRules = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const rules = await ctx.db.query("channelRouting").collect();

    const enriched = await Promise.all(
      rules.map(async (rule) => {
        const [storageLocation, outlet, menuProduct] = await Promise.all([
          ctx.db.get(rule.storageLocationId),
          rule.outletId ? ctx.db.get(rule.outletId) : null,
          rule.menuProductId ? ctx.db.get(rule.menuProductId) : null,
        ]);
        return {
          ...rule,
          storageLocationName: storageLocation?.name ?? "(deleted)",
          outletName: outlet?.name ?? null,
          menuProductName: menuProduct?.name ?? null,
        };
      }),
    );

    enriched.sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return b.updatedAt - a.updatedAt;
    });

    return enriched;
  },
});

/**
 * Preview route resolution for the admin ResolutionPreviewPanel.
 *
 * Runs `resolveChannelRoute` and reports which tier matched (1..4) along with the
 * resolved storage location, OR swallows the `CHANNEL_ROUTING_NOT_CONFIGURED`
 * throw and returns `{ok:false, tier:5, errorCode}` so the UI can render inline
 * error state (not a query rejection).
 *
 * Tier determination: we re-run the precedence at query-time rather than mutating
 * `resolveChannelRoute`'s signature. Keeping that helper stable is preferable
 * because it's shared with `processChannelSaleInternal` (Plan 04) which only
 * needs the location id.
 */
export const previewRouteResolution = query({
  args: {
    token: v.string(),
    source: externalSource,
    outletId: v.optional(v.id("externalOutlets")),
    menuProductId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    try {
      const locationId = await resolveChannelRoute(ctx, {
        source: args.source,
        outletId: args.outletId,
        menuProductId: args.menuProductId,
      });
      const location = await ctx.db.get(locationId);

      // Determine which tier matched. Walk precedence highest-first.
      let tier: 1 | 2 | 3 | 4 = 4;
      if (args.outletId && args.menuProductId) {
        const t1 = await ctx.db
          .query("channelRouting")
          .withIndex("by_source_outlet_product", (q) =>
            q
              .eq("source", args.source)
              .eq("outletId", args.outletId!)
              .eq("menuProductId", args.menuProductId!),
          )
          .first();
        if (t1) tier = 1;
      }
      if (tier === 4 && args.outletId) {
        const t2 = await ctx.db
          .query("channelRouting")
          .withIndex("by_source_outlet", (q) =>
            q.eq("source", args.source).eq("outletId", args.outletId!),
          )
          .filter((q) => q.eq(q.field("menuProductId"), undefined))
          .first();
        if (t2) tier = 2;
      }
      if (tier === 4 && args.menuProductId) {
        const t3 = await ctx.db
          .query("channelRouting")
          .withIndex("by_source_product", (q) =>
            q
              .eq("source", args.source)
              .eq("menuProductId", args.menuProductId!),
          )
          .filter((q) => q.eq(q.field("outletId"), undefined))
          .first();
        if (t3) tier = 3;
      }

      return {
        ok: true as const,
        tier,
        storageLocationId: locationId,
        storageLocationName: location?.name ?? "(deleted)",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith(CHANNEL_ROUTING_NOT_CONFIGURED)) {
        return {
          ok: false as const,
          tier: 5 as const,
          errorCode: CHANNEL_ROUTING_NOT_CONFIGURED,
          message: msg,
        };
      }
      // Surface any unexpected error normally — UI will see a query rejection.
      throw err;
    }
  },
});

/**
 * Phase 74.5.1 — Channel Routing Spine
 *
 * Provides:
 * - `resolveChannelRoute(ctx, {source, outletId?, menuProductId?})`:
 *   5-tier precedence resolver returning a `storageLocationId` to deduct stock from.
 *   Tier 1: source + outlet + product      (most specific)
 *   Tier 2: source + outlet     (no product)
 *   Tier 3: source + product    (no outlet)
 *   Tier 4: source default      (isDefault=true, outlet+product both unset)
 *   Tier 5: throw CHANNEL_ROUTING_NOT_CONFIGURED (no silent fallback)
 *
 * - `CHANNEL_ROUTING_NOT_CONFIGURED`: exported error prefix. UI + tests match on
 *   `err.message.startsWith(CHANNEL_ROUTING_NOT_CONFIGURED)`.
 *
 * - Admin CRUD mutations (`createRoutingRule`, `updateRoutingRule`, `deleteRoutingRule`)
 *   gated on `requireRole(ctx, token, ["admin"])`.
 *
 * References:
 * - SPEC §R2 (Routing Resolution)
 * - RESEARCH §Code Example 1 (5-tier template)
 * - CONTEXT D-03 (admin-only mutations)
 * - Decisions D74.5.1-L1..L5
 */

import type { QueryCtx, MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { externalSource } from "../schema";
import type { ExternalSource } from "../lib/externalSource";
import { requireRole } from "../lib/auth";

/**
 * Exported error prefix — UI/tests match on `err.message.startsWith(CHANNEL_ROUTING_NOT_CONFIGURED)`.
 * Value is a stable string constant; do NOT localize.
 */
export const CHANNEL_ROUTING_NOT_CONFIGURED = "CHANNEL_ROUTING_NOT_CONFIGURED";

/**
 * Resolve a `(source, outlet?, product?)` tuple to a `storageLocationId` via 5-tier precedence.
 *
 * Callable from both `QueryCtx` and `MutationCtx` (per RESEARCH §Architectural Responsibility Map —
 * pure read path so it works from preview queries and from `processChannelSaleInternal` writes).
 *
 * @throws Error(`${CHANNEL_ROUTING_NOT_CONFIGURED}: ...`) on Tier 5 miss.
 *         No silent fallback — SPEC §R2 acceptance clause.
 */
export async function resolveChannelRoute(
  ctx: QueryCtx | MutationCtx,
  params: {
    source: ExternalSource;
    outletId?: Id<"externalOutlets">;
    menuProductId?: Id<"menuProducts">;
  },
): Promise<Id<"storageLocations">> {
  const { source, outletId, menuProductId } = params;

  // Tier 1: most-specific (source + outlet + product)
  if (outletId && menuProductId) {
    const row = await ctx.db
      .query("channelRouting")
      .withIndex("by_source_outlet_product", (q) =>
        q
          .eq("source", source)
          .eq("outletId", outletId)
          .eq("menuProductId", menuProductId),
      )
      .first();
    if (row) return row.storageLocationId;
  }

  // Tier 2: source + outlet, product unset
  if (outletId) {
    const row = await ctx.db
      .query("channelRouting")
      .withIndex("by_source_outlet", (q) =>
        q.eq("source", source).eq("outletId", outletId),
      )
      .filter((q) => q.eq(q.field("menuProductId"), undefined))
      .first();
    if (row) return row.storageLocationId;
  }

  // Tier 3: source + product, outlet unset
  if (menuProductId) {
    const row = await ctx.db
      .query("channelRouting")
      .withIndex("by_source_product", (q) =>
        q.eq("source", source).eq("menuProductId", menuProductId),
      )
      .filter((q) => q.eq(q.field("outletId"), undefined))
      .first();
    if (row) return row.storageLocationId;
  }

  // Tier 4: source-level default (outlet + product both unset, isDefault=true)
  const def = await ctx.db
    .query("channelRouting")
    .withIndex("by_source", (q) => q.eq("source", source))
    .filter((q) =>
      q.and(
        q.eq(q.field("isDefault"), true),
        q.eq(q.field("outletId"), undefined),
        q.eq(q.field("menuProductId"), undefined),
      ),
    )
    .first();
  if (def) return def.storageLocationId;

  // Tier 5: no rule matches — throw with deterministic prefix for UI/test matching.
  throw new Error(
    `${CHANNEL_ROUTING_NOT_CONFIGURED}: source=${source}, outlet=${
      outletId ?? "-"
    }, product=${menuProductId ?? "-"}`,
  );
}

// ============================================================================
// Admin CRUD mutations
// All three gate on `requireRole(ctx, args.token, ["admin"])` per CONTEXT D-03
// and threat register T-74.5.1-01 / T-74.5.1-02.
// Token is stripped before DB ops (Pitfall #10).
// ============================================================================

/**
 * Create a routing rule.
 *
 * Validation:
 * - `isDefault=true` requires BOTH `outletId` and `menuProductId` unset
 *   (T-74.5.1-05 — isDefault only applies to source-level defaults).
 * - Rejects duplicate `(source, outletId, menuProductId)` combos
 *   (T-74.5.1-04 — unique-combo guard).
 */
export const createRoutingRule = mutation({
  args: {
    token: v.string(),
    source: externalSource,
    outletId: v.optional(v.id("externalOutlets")),
    menuProductId: v.optional(v.id("menuProducts")),
    storageLocationId: v.id("storageLocations"),
    isDefault: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    if (
      args.isDefault &&
      (args.outletId !== undefined || args.menuProductId !== undefined)
    ) {
      throw new Error(
        "isDefault=true requires outletId AND menuProductId to be unset (source-level default only).",
      );
    }

    // Duplicate-combo guard — exact same (source, outletId, menuProductId) tuple.
    // Uses the most-specific index so undefined keys match undefined in other rows.
    const dupe = await ctx.db
      .query("channelRouting")
      .withIndex("by_source_outlet_product", (q) =>
        q
          .eq("source", args.source)
          .eq("outletId", args.outletId)
          .eq("menuProductId", args.menuProductId),
      )
      .first();
    if (dupe) {
      throw new Error(
        `Duplicate routing rule: source=${args.source}, outlet=${
          args.outletId ?? "any"
        }, product=${args.menuProductId ?? "any"}`,
      );
    }

    const ruleId = await ctx.db.insert("channelRouting", {
      source: args.source,
      outletId: args.outletId,
      menuProductId: args.menuProductId,
      storageLocationId: args.storageLocationId,
      isDefault: args.isDefault,
      notes: args.notes,
      updatedBy: user.name,
      updatedAt: Date.now(),
    });

    return { ruleId };
  },
});

/**
 * Update a routing rule.
 *
 * Immutable post-creation: `source`, `outletId`, `menuProductId` (prevents combo collisions
 * and breakage of tier-precedence contracts). To rekey, delete + recreate.
 *
 * Re-validates `isDefault` against the rule's immutable outlet/product fields
 * (T-74.5.1-05).
 */
export const updateRoutingRule = mutation({
  args: {
    token: v.string(),
    ruleId: v.id("channelRouting"),
    storageLocationId: v.optional(v.id("storageLocations")),
    isDefault: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    const rule = await ctx.db.get(args.ruleId);
    if (!rule) throw new Error("Routing rule not found");

    const patch: Record<string, unknown> = {
      updatedBy: user.name,
      updatedAt: Date.now(),
    };
    if (args.storageLocationId !== undefined) {
      patch.storageLocationId = args.storageLocationId;
    }
    if (args.isDefault !== undefined) {
      if (
        args.isDefault &&
        (rule.outletId !== undefined || rule.menuProductId !== undefined)
      ) {
        throw new Error(
          "Cannot set isDefault=true on an outlet- or product-scoped rule.",
        );
      }
      patch.isDefault = args.isDefault;
    }
    if (args.notes !== undefined) patch.notes = args.notes;

    await ctx.db.patch(args.ruleId, patch);

    return { ruleId: args.ruleId };
  },
});

/**
 * Delete a routing rule (hard delete).
 *
 * No referential integrity check — `productInventoryTransactions` rows already
 * written reference `storageLocationId` directly, not the routing rule. Deleting
 * a rule only changes future routing decisions.
 */
export const deleteRoutingRule = mutation({
  args: {
    token: v.string(),
    ruleId: v.id("channelRouting"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const rule = await ctx.db.get(args.ruleId);
    if (!rule) throw new Error("Routing rule not found");

    await ctx.db.delete(args.ruleId);

    return { ruleId: args.ruleId };
  },
});

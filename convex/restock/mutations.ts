import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireRole } from "../lib/auth";

/**
 * Upsert a restock target for a channel/outlet + product.
 * Auth: Manager/Admin.
 */
export const saveRestockTarget = mutation({
  args: {
    token: v.string(),
    channel: v.string(),
    outletId: v.optional(v.id("externalOutlets")),
    productKey: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
    weekdayTarget: v.number(),
    weekendTarget: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    // Find existing target
    let existing;
    if (args.outletId) {
      const candidates = await ctx.db
        .query("restockTargets")
        .withIndex("by_outlet_product", (q) =>
          q.eq("outletId", args.outletId!).eq("productKey", args.productKey)
        )
        .collect();
      existing = candidates[0];
    } else {
      const candidates = await ctx.db
        .query("restockTargets")
        .withIndex("by_channel", (q) => q.eq("channel", args.channel))
        .filter((q) => q.eq(q.field("productKey"), args.productKey))
        .collect();
      existing = candidates[0];
    }

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        weekdayTarget: args.weekdayTarget,
        weekendTarget: args.weekendTarget,
        menuProductId: args.menuProductId,
        updatedBy: user.name,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("restockTargets", {
      channel: args.channel,
      outletId: args.outletId,
      productKey: args.productKey,
      menuProductId: args.menuProductId,
      weekdayTarget: args.weekdayTarget,
      weekendTarget: args.weekendTarget,
      updatedBy: user.name,
      updatedAt: now,
    });
  },
});

/**
 * Update manual stock entry for GoBiz/Internal channels.
 * Auth: Manager/Admin.
 */
export const updateManualStock = mutation({
  args: {
    token: v.string(),
    channel: v.string(),
    productKey: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    const existing = await ctx.db
      .query("manualStockEntries")
      .withIndex("by_channel_product", (q) =>
        q.eq("channel", args.channel).eq("productKey", args.productKey)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: args.quantity,
        menuProductId: args.menuProductId,
        enteredBy: user.name,
        enteredAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("manualStockEntries", {
      channel: args.channel,
      productKey: args.productKey,
      menuProductId: args.menuProductId,
      quantity: args.quantity,
      enteredBy: user.name,
      enteredAt: now,
    });
  },
});

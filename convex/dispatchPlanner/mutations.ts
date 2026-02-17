import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Seed default dispatch channel configuration and planner settings.
 * Run from Convex dashboard Functions tab during initial setup.
 */
export const seedDefaults = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const now = Date.now();

    // Check if already seeded
    const existing = await ctx.db.query("dispatchChannelConfig").first();
    if (existing) {
      return { status: "already_seeded" };
    }

    // Seed channel config with default priorities
    const channels = [
      { channelKey: "direct", displayName: "Direct Sales", color: "#3B82F6", priority: 1, commissionRate: 0, isBuiltIn: true, isEnabled: true },
      { channelKey: "gofood", displayName: "GoFood", color: "#22C55E", priority: 2, commissionRate: 19, isBuiltIn: true, isEnabled: true },
      { channelKey: "k3mart", displayName: "K3Mart", color: "#F97316", priority: 3, commissionRate: 30, isBuiltIn: true, isEnabled: true },
      { channelKey: "consignment", displayName: "Other Consignment", color: "#6B7280", priority: 4, commissionRate: 15, isBuiltIn: false, isEnabled: true },
    ];

    for (const ch of channels) {
      await ctx.db.insert("dispatchChannelConfig", {
        ...ch,
        updatedBy: "system",
        updatedAt: now,
      });
    }

    // Seed planner settings with default capacity
    await ctx.db.insert("dispatchPlannerSettings", {
      dailyCapacity: 200,
      updatedBy: "system",
      updatedAt: now,
    });

    // Seed default consignment outlets (Legato Tamtem, Legato Goldfinch)
    const consignmentOutlets = [
      { name: "Legato Tamtem" },
      { name: "Legato Goldfinch" },
    ];

    for (const outlet of consignmentOutlets) {
      await ctx.db.insert("dispatchConsignmentOutlets", {
        name: outlet.name,
        channelKey: "consignment" as const,
        isEnabled: true,
        productMappings: [],
        createdBy: "system",
        createdAt: now,
        updatedBy: "system",
        updatedAt: now,
      });
    }

    return { status: "seeded", channels: channels.length, consignmentOutlets: consignmentOutlets.length };
  },
});

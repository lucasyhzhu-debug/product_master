/**
 * Production Targets Mutations
 *
 * Mutations for managing daily production goals per production unit type.
 * Supports manual upsert and auto-calculation from confirmed orders.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";

/**
 * Upsert a production target for a specific date and production unit type.
 * Creates a new target if none exists, or patches the existing one.
 * Requires manager or admin role.
 */
export const upsert = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    productionUnitTypeId: v.id("productionUnitTypes"),
    autoTargetQuantity: v.optional(v.number()),
    manualOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    // Check if target exists for this date + unit type
    const existing = await ctx.db
      .query("productionTargets")
      .withIndex("by_type_date", (q) =>
        q
          .eq("productionUnitTypeId", args.productionUnitTypeId)
          .eq("date", args.date)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.autoTargetQuantity !== undefined && {
          autoTargetQuantity: args.autoTargetQuantity,
        }),
        ...(args.manualOverride !== undefined && {
          manualOverride: args.manualOverride,
        }),
      });
      return existing._id;
    }

    return await ctx.db.insert("productionTargets", {
      date: args.date,
      productionUnitTypeId: args.productionUnitTypeId,
      autoTargetQuantity: args.autoTargetQuantity ?? 0,
      manualOverride: args.manualOverride,
      createdAt: Date.now(),
    });
  },
});

/**
 * Auto-calculate production targets from confirmed and in-production orders.
 * Sums ball requirements across all active orders and upserts targets per unit type.
 * Requires manager or admin role.
 */
export const autoCalculate = mutation({
  args: {
    token: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    // Get all confirmed and in-production orders
    const confirmedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Confirmed"))
      .collect();

    const inProductionOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "InProduction"))
      .collect();

    const allOrders = [...confirmedOrders, ...inProductionOrders];

    // Calculate total production units needed per productionUnitType
    const unitTotals = new Map<string, number>(); // productionUnitTypeId -> quantity

    for (const order of allOrders) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      for (const item of items) {
        if (!item.menuProductId || item.isCancelled) continue;

        const components = await ctx.db
          .query("menuProductComponents")
          .withIndex("by_menu_product", (q) =>
            q.eq("menuProductId", item.menuProductId!)
          )
          .collect();

        for (const comp of components) {
          const componentType = await ctx.db.get(comp.componentTypeId);
          if (!componentType || componentType.category !== "production")
            continue;

          // Find the matching productionUnitType by code
          const unitType = await ctx.db
            .query("productionUnitTypes")
            .withIndex("by_code", (q) => q.eq("code", componentType.code))
            .first();

          if (unitType) {
            const current = unitTotals.get(unitType._id) ?? 0;
            unitTotals.set(
              unitType._id,
              current + comp.quantity * item.quantity
            );
          }
        }
      }
    }

    // Upsert targets for each production unit type
    for (const [unitTypeId, quantity] of unitTotals) {
      const existing = await ctx.db
        .query("productionTargets")
        .withIndex("by_type_date", (q) =>
          q
            .eq(
              "productionUnitTypeId",
              unitTypeId as Id<"productionUnitTypes">
            )
            .eq("date", args.date)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          autoTargetQuantity: quantity,
        });
      } else {
        await ctx.db.insert("productionTargets", {
          date: args.date,
          productionUnitTypeId:
            unitTypeId as Id<"productionUnitTypes">,
          autoTargetQuantity: quantity,
          createdAt: Date.now(),
        });
      }
    }

    return { updated: unitTotals.size };
  },
});

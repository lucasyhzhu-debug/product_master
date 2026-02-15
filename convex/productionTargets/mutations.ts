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

    // Get all payment-received and being-prepared orders
    const paymentReceivedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "PaymentReceived"))
      .collect();

    const beingPreparedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "BeingPrepared"))
      .collect();

    const allOrders = [...paymentReceivedOrders, ...beingPreparedOrders];

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

/**
 * Set a per-product production target for a date and source.
 * source: "consignment" (K3 Mart / retail) or "gofood" (GoFood / online)
 *
 * Saves the per-product quantity, then recomputes ball totals from ALL
 * manual product targets for that date and upserts into productionTargets.manualOverride.
 *
 * If quantity is 0, removes the product target.
 * Accessible by all kitchen roles for quick target setting.
 */
export const setProductTarget = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    source: v.string(), // "consignment" | "gofood"
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["kitchen", "order_staff", "manager", "admin"]);

    const now = Date.now();

    // Upsert the per-product target for this source
    const existing = await ctx.db
      .query("productionProductTargets")
      .withIndex("by_date_source_product", (q) =>
        q.eq("date", args.date).eq("source", args.source).eq("menuProductId", args.menuProductId)
      )
      .first();

    const previousQuantity = existing?.quantity ?? 0;

    if (args.quantity <= 0) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: args.quantity,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("productionProductTargets", {
        date: args.date,
        source: args.source,
        menuProductId: args.menuProductId,
        quantity: args.quantity,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Log the target change for daily audit trail
    if (previousQuantity !== args.quantity) {
      await ctx.db.insert("productionTargetLogs", {
        date: args.date,
        timestamp: now,
        source: args.source,
        menuProductId: args.menuProductId,
        previousQuantity,
        newQuantity: args.quantity,
      });
    }

    // Recompute ball totals from ALL manual product targets for this date
    const allProductTargets = await ctx.db
      .query("productionProductTargets")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Aggregate ball requirements per productionUnitType
    const ballTotals = new Map<string, number>();

    for (const pt of allProductTargets) {
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) =>
          q.eq("menuProductId", pt.menuProductId)
        )
        .collect();

      for (const comp of components) {
        const componentType = await ctx.db.get(comp.componentTypeId);
        if (!componentType || componentType.category !== "production") continue;

        const unitType = await ctx.db
          .query("productionUnitTypes")
          .withIndex("by_code", (q) => q.eq("code", componentType.code))
          .first();

        if (unitType) {
          const current = ballTotals.get(unitType._id) ?? 0;
          ballTotals.set(unitType._id, current + comp.quantity * pt.quantity);
        }
      }
    }

    // Upsert ball totals into productionTargets as manualOverride
    const allUnitTypes = await ctx.db.query("productionUnitTypes").collect();

    for (const unitType of allUnitTypes) {
      const ballCount = ballTotals.get(unitType._id) ?? 0;

      const existingTarget = await ctx.db
        .query("productionTargets")
        .withIndex("by_type_date", (q) =>
          q.eq("productionUnitTypeId", unitType._id).eq("date", args.date)
        )
        .first();

      if (existingTarget) {
        await ctx.db.patch(existingTarget._id, {
          manualOverride: ballCount,
        });
      } else {
        await ctx.db.insert("productionTargets", {
          date: args.date,
          productionUnitTypeId: unitType._id,
          autoTargetQuantity: 0,
          manualOverride: ballCount,
          createdAt: now,
        });
      }
    }

    return { success: true };
  },
});

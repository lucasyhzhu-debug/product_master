import { protectedMutation } from "../lib/functions";
import { v } from "convex/values";

/**
 * Create a new customer.
 */
export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("customers", {
      name: args.name,
      phone: args.phone,
      source: args.source,
      notes: args.notes,
      createdBy: ctx.user.name,
    });

    return id;
  },
});

/**
 * Update an existing customer.
 */
export const update = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    id: v.id("customers"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const current = await ctx.db.get(id);
    if (!current) {
      throw new Error("Customer not found");
    }

    const patchData: Record<string, unknown> = {};
    if (updates.name !== undefined) patchData.name = updates.name;
    if (updates.phone !== undefined) patchData.phone = updates.phone;
    if (updates.source !== undefined) patchData.source = updates.source;
    if (updates.notes !== undefined) patchData.notes = updates.notes;

    await ctx.db.patch(id, patchData);
    return id;
  },
});

/**
 * Delete a customer.
 */
export const remove = protectedMutation({
  roles: ["manager", "admin"],
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    // Check if customer has any orders
    const hasOrders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.id))
      .first();

    if (hasOrders) {
      throw new Error("Cannot delete customer with existing orders");
    }

    await ctx.db.delete(args.id);
    return true;
  },
});

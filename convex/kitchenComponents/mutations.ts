/**
 * Kitchen Components Mutations
 *
 * CRUD for kitchen pre-cursor ingredients tracked in grams (Phase 69).
 * These are independent from BOM componentTypes — they represent raw
 * ingredients like "Outer-Marshmallow", "Filling-Pistachio", etc.
 *
 * Mutations:
 *   seedDefaults — Idempotent seed of initial kitchen components
 *   create       — Admin/manager: add new kitchen component
 *   update       — Admin/manager: edit existing kitchen component
 */

import { mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Seed default kitchen components.
 * Idempotent — skips if components already exist.
 */
export const seedDefaults = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const existing = await ctx.db.query("kitchenComponents").first();
    if (existing) return { seeded: false, message: "Components already exist" };

    const now = Date.now();
    const defaults = [
      { name: "Outer-Marshmallow", code: "OUTER_MARSHMALLOW", sortOrder: 1 },
      { name: "Filling-Pistachio", code: "FILLING_PISTACHIO", sortOrder: 2 },
      { name: "Pistachio Spread", code: "PISTACHIO_SPREAD", sortOrder: 3 },
      { name: "Salt", code: "SALT", sortOrder: 4 },
      { name: "Marshmallow", code: "MARSHMALLOW", sortOrder: 5 },
      { name: "Cacao Powder", code: "CACAO_POWDER", sortOrder: 6 },
      { name: "Milk Powder", code: "MILK_POWDER", sortOrder: 7 },
      { name: "Kunafa", code: "KUNAFA", sortOrder: 8 },
      { name: "Pistachio Paste", code: "PISTACHIO_PASTE", sortOrder: 9 },
      { name: "Butter", code: "BUTTER", sortOrder: 10 },
    ];

    for (const comp of defaults) {
      await ctx.db.insert("kitchenComponents", {
        ...comp,
        unit: "g",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { seeded: true, message: `Seeded ${defaults.length} kitchen components` };
  },
});

/**
 * Create a new kitchen component. Admin/manager only.
 */
export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    code: v.string(),
    ballTypeGroup: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    // Check code uniqueness
    const existing = await ctx.db
      .query("kitchenComponents")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (existing) {
      throw new ConvexError(`Kitchen component with code "${args.code}" already exists`);
    }

    const now = Date.now();
    // Get max sortOrder for auto-assign
    const all = await ctx.db.query("kitchenComponents").collect();
    const maxSort = all.reduce((max, c) => Math.max(max, c.sortOrder), 0);

    return await ctx.db.insert("kitchenComponents", {
      name: args.name,
      code: args.code,
      ...(args.ballTypeGroup !== undefined ? { ballTypeGroup: args.ballTypeGroup } : {}),
      unit: "g",
      isActive: true,
      sortOrder: args.sortOrder ?? maxSort + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a kitchen component. Admin/manager only.
 */
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("kitchenComponents"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    ballTypeGroup: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError("Kitchen component not found");

    // Check code uniqueness if changing
    if (args.code !== undefined && args.code !== existing.code) {
      const newCode = args.code;
      const dup = await ctx.db
        .query("kitchenComponents")
        .withIndex("by_code", (q) => q.eq("code", newCode))
        .first();
      if (dup) {
        throw new ConvexError(`Kitchen component with code "${newCode}" already exists`);
      }
    }

    const patchData: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patchData.name = args.name;
    if (args.code !== undefined) patchData.code = args.code;
    if (args.ballTypeGroup !== undefined) patchData.ballTypeGroup = args.ballTypeGroup;
    if (args.isActive !== undefined) patchData.isActive = args.isActive;
    if (args.sortOrder !== undefined) patchData.sortOrder = args.sortOrder;

    await ctx.db.patch(args.id, patchData);
  },
});

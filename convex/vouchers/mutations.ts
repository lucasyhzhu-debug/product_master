import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Generate a random voucher code.
 * Format: PREFIX-XXXX-XXXX (e.g., SAVE-A7K2-9PLM)
 */
function generateVoucherCode(prefix: string = "PROMO"): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segment = () =>
    Array.from({ length: 4 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
  return `${prefix}-${segment()}-${segment()}`;
}

/**
 * Generate a manager override voucher code.
 * Format: MGR-YYMMDD-XXXX (e.g., MGR-260204-A7K2)
 */
function generateOverrideCode(): string {
  const now = new Date();
  const dateStr = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const random = Array.from({ length: 4 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
  return `MGR-${dateStr}-${random}`;
}

/**
 * Create a new voucher.
 * Admin only.
 */
export const create = mutation({
  args: {
    token: v.string(),
    // Core fields
    code: v.optional(v.string()), // Auto-generated if not provided
    name: v.string(),
    description: v.optional(v.string()),
    // Discount
    discountType: v.union(v.literal("amount"), v.literal("percentage")),
    discountValue: v.number(),
    // Constraints
    minimumOrderAmount: v.optional(v.number()),
    maximumDiscount: v.optional(v.number()),
    // Validity
    isActive: v.optional(v.boolean()),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    // Usage limits
    usageLimit: v.optional(v.number()),
    usagePerCustomer: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    // Generate or normalize code
    let code = args.code
      ? args.code.toUpperCase().trim().replace(/\s+/g, "-")
      : generateVoucherCode();

    // Check for duplicate code
    const existing = await ctx.db
      .query("vouchers")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (existing) {
      throw new Error(`Voucher code "${code}" already exists`);
    }

    // Validate discount value
    if (args.discountType === "percentage") {
      if (args.discountValue < 0 || args.discountValue > 100) {
        throw new Error("Percentage discount must be between 0 and 100");
      }
    } else {
      if (args.discountValue < 0) {
        throw new Error("Discount amount cannot be negative");
      }
    }

    // Validate dates
    if (
      args.validFrom !== undefined &&
      args.validUntil !== undefined &&
      args.validFrom > args.validUntil
    ) {
      throw new Error("Valid from date must be before valid until date");
    }

    const { token: _, ...data } = args;
    void _; // Suppress unused variable warning

    const voucherId = await ctx.db.insert("vouchers", {
      code,
      name: data.name,
      description: data.description,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minimumOrderAmount: data.minimumOrderAmount,
      maximumDiscount: data.maximumDiscount,
      isActive: data.isActive ?? true,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      usageLimit: data.usageLimit,
      usageCount: 0,
      usagePerCustomer: data.usagePerCustomer,
      createdBy: user.name,
      createdAt: Date.now(),
    });

    return voucherId;
  },
});

/**
 * Update an existing voucher.
 * Admin only. Cannot change the code.
 */
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("vouchers"),
    // Updatable fields (code cannot be changed)
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    discountType: v.optional(v.union(v.literal("amount"), v.literal("percentage"))),
    discountValue: v.optional(v.number()),
    minimumOrderAmount: v.optional(v.number()),
    maximumDiscount: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    usageLimit: v.optional(v.number()),
    usagePerCustomer: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const voucher = await ctx.db.get(args.id);
    if (!voucher) {
      throw new Error("Voucher not found");
    }

    // Manager override vouchers cannot be edited
    if (voucher.isManagerOverride) {
      throw new Error("Manager override vouchers cannot be edited");
    }

    const { token: _, id, ...updates } = args;
    void _;

    // Validate discount value if changing
    if (updates.discountType !== undefined || updates.discountValue !== undefined) {
      const type = updates.discountType ?? voucher.discountType;
      const value = updates.discountValue ?? voucher.discountValue;

      if (type === "percentage") {
        if (value < 0 || value > 100) {
          throw new Error("Percentage discount must be between 0 and 100");
        }
      } else {
        if (value < 0) {
          throw new Error("Discount amount cannot be negative");
        }
      }
    }

    // Validate dates if changing
    const validFrom = updates.validFrom ?? voucher.validFrom;
    const validUntil = updates.validUntil ?? voucher.validUntil;
    if (
      validFrom !== undefined &&
      validUntil !== undefined &&
      validFrom > validUntil
    ) {
      throw new Error("Valid from date must be before valid until date");
    }

    // Build patch object with only defined updates
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.discountType !== undefined) patch.discountType = updates.discountType;
    if (updates.discountValue !== undefined) patch.discountValue = updates.discountValue;
    if (updates.minimumOrderAmount !== undefined) patch.minimumOrderAmount = updates.minimumOrderAmount;
    if (updates.maximumDiscount !== undefined) patch.maximumDiscount = updates.maximumDiscount;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;
    if (updates.validFrom !== undefined) patch.validFrom = updates.validFrom;
    if (updates.validUntil !== undefined) patch.validUntil = updates.validUntil;
    if (updates.usageLimit !== undefined) patch.usageLimit = updates.usageLimit;
    if (updates.usagePerCustomer !== undefined) patch.usagePerCustomer = updates.usagePerCustomer;

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

/**
 * Toggle voucher active status.
 * Admin only.
 */
export const toggleActive = mutation({
  args: {
    token: v.string(),
    id: v.id("vouchers"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const voucher = await ctx.db.get(args.id);
    if (!voucher) {
      throw new Error("Voucher not found");
    }

    await ctx.db.patch(args.id, {
      isActive: !voucher.isActive,
      updatedAt: Date.now(),
    });

    return !voucher.isActive;
  },
});

/**
 * Delete a voucher.
 * Admin only. Cannot delete vouchers that have been used.
 */
export const remove = mutation({
  args: {
    token: v.string(),
    id: v.id("vouchers"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const voucher = await ctx.db.get(args.id);
    if (!voucher) {
      throw new Error("Voucher not found");
    }

    // Check if voucher has been used
    if (voucher.usageCount > 0) {
      throw new Error(
        "Cannot delete voucher that has been used. Deactivate it instead."
      );
    }

    // Delete any usage records (shouldn't exist if usageCount is 0, but safety check)
    const usageRecords = await ctx.db
      .query("voucherUsage")
      .withIndex("by_voucher", (q) => q.eq("voucherId", args.id))
      .collect();

    for (const record of usageRecords) {
      await ctx.db.delete(record._id);
    }

    await ctx.db.delete(args.id);
    return true;
  },
});

/**
 * Create a manager override voucher.
 * Manager and Admin only.
 *
 * Creates a single-use voucher that expires in 24 hours.
 * Requires a reason for the override.
 */
export const createManagerOverride = mutation({
  args: {
    token: v.string(),
    reason: v.string(),
    discountType: v.union(v.literal("amount"), v.literal("percentage")),
    discountValue: v.number(),
    orderId: v.optional(v.id("orders")), // Optional: link to specific order
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin", "manager"]);

    // Validate reason is not empty
    if (!args.reason.trim()) {
      throw new Error("Reason is required for manager override");
    }

    // Validate discount value
    if (args.discountType === "percentage") {
      if (args.discountValue < 0 || args.discountValue > 100) {
        throw new Error("Percentage discount must be between 0 and 100");
      }
    } else {
      if (args.discountValue < 0) {
        throw new Error("Discount amount cannot be negative");
      }
    }

    // Generate unique override code
    let code = generateOverrideCode();

    // Ensure code is unique (very unlikely to collide, but check anyway)
    let attempts = 0;
    while (attempts < 10) {
      const existing = await ctx.db
        .query("vouchers")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();

      if (!existing) break;
      code = generateOverrideCode();
      attempts++;
    }

    if (attempts >= 10) {
      throw new Error("Failed to generate unique override code");
    }

    const now = Date.now();
    const expiresIn24Hours = now + 24 * 60 * 60 * 1000;

    const voucherId = await ctx.db.insert("vouchers", {
      code,
      name: `Manager Override - ${user.name}`,
      description: args.reason,
      discountType: args.discountType,
      discountValue: args.discountValue,
      isActive: true,
      validFrom: now,
      validUntil: expiresIn24Hours,
      usageLimit: 1, // Single use
      usageCount: 0,
      isManagerOverride: true,
      overrideReason: args.reason,
      overrideOrderId: args.orderId,
      createdBy: user.name,
      createdAt: now,
    });

    return { voucherId, code };
  },
});

/**
 * Increment voucher usage count.
 * Internal use - called from order creation mutation.
 */
export const incrementUsage = mutation({
  args: {
    voucherId: v.id("vouchers"),
    customerId: v.id("customers"),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const voucher = await ctx.db.get(args.voucherId);
    if (!voucher) {
      throw new Error("Voucher not found");
    }

    // Increment usage count
    await ctx.db.patch(args.voucherId, {
      usageCount: voucher.usageCount + 1,
      updatedAt: Date.now(),
    });

    // Create usage record
    await ctx.db.insert("voucherUsage", {
      voucherId: args.voucherId,
      customerId: args.customerId,
      orderId: args.orderId,
      usedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Decrement voucher usage count.
 * Internal use - called from order cancellation mutation.
 */
export const decrementUsage = mutation({
  args: {
    voucherId: v.id("vouchers"),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const voucher = await ctx.db.get(args.voucherId);
    if (!voucher) {
      throw new Error("Voucher not found");
    }

    // Decrement usage count (don't go below 0)
    await ctx.db.patch(args.voucherId, {
      usageCount: Math.max(0, voucher.usageCount - 1),
      updatedAt: Date.now(),
    });

    // Delete usage record for this order
    const usageRecord = await ctx.db
      .query("voucherUsage")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .first();

    if (usageRecord) {
      await ctx.db.delete(usageRecord._id);
    }

    return true;
  },
});

/**
 * Generate a random voucher code (utility endpoint).
 * Admin only.
 */
export const generateCode = mutation({
  args: {
    token: v.string(),
    prefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    let code = generateVoucherCode(args.prefix ?? "PROMO");

    // Ensure uniqueness
    let attempts = 0;
    while (attempts < 10) {
      const existing = await ctx.db
        .query("vouchers")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();

      if (!existing) break;
      code = generateVoucherCode(args.prefix ?? "PROMO");
      attempts++;
    }

    return code;
  },
});

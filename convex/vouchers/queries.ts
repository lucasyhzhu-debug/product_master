import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Validated voucher result returned from validateVoucher query.
 */
export interface ValidatedVoucherResult {
  valid: boolean;
  error?: string;
  voucher?: {
    _id: string;
    code: string;
    name: string;
    discountType: "amount" | "percentage";
    discountValue: number;
    calculatedDiscount: number; // Actual discount amount after caps/percentage calculation
    minimumOrderAmount?: number;
    maximumDiscount?: number;
  };
}

/**
 * List all vouchers (excludes single-use manager overrides by default).
 * Used for VouchersManager admin page.
 */
export const list = query({
  args: {
    includeOverrides: v.optional(v.boolean()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let vouchers = await ctx.db.query("vouchers").collect();

    // Filter out manager overrides unless explicitly requested
    if (!args.includeOverrides) {
      vouchers = vouchers.filter((v) => !v.isManagerOverride);
    }

    // Filter by active status if requested
    if (args.activeOnly) {
      vouchers = vouchers.filter((v) => v.isActive);
    }

    // Sort by createdAt descending (newest first)
    vouchers.sort((a, b) => b.createdAt - a.createdAt);

    return vouchers;
  },
});

/**
 * List active vouchers for POS combobox dropdown.
 * Returns only currently valid, active vouchers (non-override) for user selection.
 */
export const listActiveForCombobox = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all vouchers
    let vouchers = await ctx.db
      .query("vouchers")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Filter: active, not manager override, within validity period, not depleted
    vouchers = vouchers.filter((v) => {
      // Exclude manager overrides
      if (v.isManagerOverride) return false;

      // Check validity period
      if (v.validFrom && now < v.validFrom) return false;
      if (v.validUntil && now > v.validUntil) return false;

      // Check usage limit
      if (v.usageLimit && v.usageCount >= v.usageLimit) return false;

      return true;
    });

    // Return simplified format for combobox
    return vouchers.map((v) => ({
      code: v.code,
      name: v.name,
      discountType: v.discountType,
      discountValue: v.discountValue,
      minimumOrderAmount: v.minimumOrderAmount,
    }));
  },
});

/**
 * List manager override vouchers.
 * Used for Manager Overrides tab in VouchersManager.
 */
export const listOverrides = query({
  args: {
    // Optional date filter (only show overrides from last N days)
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let vouchers = await ctx.db
      .query("vouchers")
      .withIndex("by_manager_override", (q) => q.eq("isManagerOverride", true))
      .collect();

    // Filter by date if specified
    if (args.daysBack !== undefined) {
      const cutoffDate = Date.now() - args.daysBack * 24 * 60 * 60 * 1000;
      vouchers = vouchers.filter((v) => v.createdAt >= cutoffDate);
    }

    // Sort by createdAt descending
    vouchers.sort((a, b) => b.createdAt - a.createdAt);

    return vouchers;
  },
});

/**
 * Get a single voucher by ID.
 */
export const getById = query({
  args: { id: v.id("vouchers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get a voucher by code (case-insensitive).
 */
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const normalizedCode = args.code.toUpperCase().trim();
    return await ctx.db
      .query("vouchers")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .first();
  },
});

/**
 * Validate a voucher code for an order.
 * Checks all business rules and calculates the actual discount amount.
 *
 * Returns:
 * - valid: true/false
 * - error: Human-readable error message if invalid
 * - voucher: Voucher details with calculatedDiscount if valid
 */
export const validateVoucher = query({
  args: {
    code: v.string(),
    orderTotal: v.number(), // Subtotal before discount
    customerId: v.optional(v.id("customers")),
  },
  handler: async (ctx, args): Promise<ValidatedVoucherResult> => {
    const normalizedCode = args.code.toUpperCase().trim();

    // 1. Check voucher exists
    const voucher = await ctx.db
      .query("vouchers")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .first();

    if (!voucher) {
      return { valid: false, error: "Invalid voucher code" };
    }

    // 2. Check voucher is active
    if (!voucher.isActive) {
      // Specific error message for consumed manager overrides
      if (voucher.isManagerOverride) {
        return {
          valid: false,
          error: "This manager override has already been used and cannot be reused",
        };
      }
      return { valid: false, error: "This voucher is no longer active" };
    }

    // 3. Check validity period
    const now = Date.now();
    if (voucher.validFrom !== undefined && now < voucher.validFrom) {
      return { valid: false, error: "This voucher is not yet valid" };
    }
    if (voucher.validUntil !== undefined && now > voucher.validUntil) {
      return { valid: false, error: "This voucher has expired" };
    }

    // 4. Check total usage limit
    if (
      voucher.usageLimit !== undefined &&
      voucher.usageCount >= voucher.usageLimit
    ) {
      return { valid: false, error: "This voucher has reached its usage limit" };
    }

    // 5. Check per-customer usage limit (if customer provided)
    if (
      args.customerId !== undefined &&
      voucher.usagePerCustomer !== undefined
    ) {
      const customerUsageCount = await ctx.db
        .query("voucherUsage")
        .withIndex("by_voucher_customer", (q) =>
          q.eq("voucherId", voucher._id).eq("customerId", args.customerId!)
        )
        .collect();

      if (customerUsageCount.length >= voucher.usagePerCustomer) {
        return {
          valid: false,
          error: "You have already used this voucher the maximum number of times",
        };
      }
    }

    // 6. Check minimum order amount
    if (
      voucher.minimumOrderAmount !== undefined &&
      args.orderTotal < voucher.minimumOrderAmount
    ) {
      const formattedMin = new Intl.NumberFormat("id-ID").format(
        voucher.minimumOrderAmount
      );
      return {
        valid: false,
        error: `Minimum order of Rp ${formattedMin} required for this voucher`,
      };
    }

    // 7. Calculate discount amount
    let calculatedDiscount: number;
    if (voucher.discountType === "percentage") {
      calculatedDiscount = Math.floor(
        (args.orderTotal * voucher.discountValue) / 100
      );
      // Apply maximum discount cap if set
      if (
        voucher.maximumDiscount !== undefined &&
        calculatedDiscount > voucher.maximumDiscount
      ) {
        calculatedDiscount = voucher.maximumDiscount;
      }
    } else {
      // Fixed amount discount
      calculatedDiscount = voucher.discountValue;
    }

    // Ensure discount doesn't exceed order total
    if (calculatedDiscount > args.orderTotal) {
      calculatedDiscount = args.orderTotal;
    }

    return {
      valid: true,
      voucher: {
        _id: voucher._id,
        code: voucher.code,
        name: voucher.name,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        calculatedDiscount,
        minimumOrderAmount: voucher.minimumOrderAmount,
        maximumDiscount: voucher.maximumDiscount,
      },
    };
  },
});

/**
 * Get customer usage count for a specific voucher.
 * Used for displaying remaining uses to customers.
 */
export const getCustomerUsageCount = query({
  args: {
    voucherId: v.id("vouchers"),
    customerId: v.id("customers"),
  },
  handler: async (ctx, args) => {
    const usageRecords = await ctx.db
      .query("voucherUsage")
      .withIndex("by_voucher_customer", (q) =>
        q.eq("voucherId", args.voucherId).eq("customerId", args.customerId)
      )
      .collect();

    return usageRecords.length;
  },
});

/**
 * Get voucher usage statistics.
 * Used for VouchersManager dashboard/reports.
 */
export const getVoucherStats = query({
  args: { id: v.id("vouchers") },
  handler: async (ctx, args) => {
    const voucher = await ctx.db.get(args.id);
    if (!voucher) {
      return null;
    }

    // Get all usage records
    const usageRecords = await ctx.db
      .query("voucherUsage")
      .withIndex("by_voucher", (q) => q.eq("voucherId", args.id))
      .collect();

    // Count unique customers
    const uniqueCustomers = new Set(usageRecords.map((u) => u.customerId)).size;

    // Calculate status
    let status: "active" | "inactive" | "expired" | "depleted" = "active";
    const now = Date.now();

    if (!voucher.isActive) {
      status = "inactive";
    } else if (voucher.validUntil !== undefined && now > voucher.validUntil) {
      status = "expired";
    } else if (
      voucher.usageLimit !== undefined &&
      voucher.usageCount >= voucher.usageLimit
    ) {
      status = "depleted";
    }

    return {
      voucher,
      totalUsages: usageRecords.length,
      uniqueCustomers,
      status,
      usageRecords: usageRecords.slice(0, 10), // Last 10 usages for preview
    };
  },
});

/**
 * Get order details for a manager override's linked order.
 * Returns null if voucher doesn't have a linked order.
 * Returns { orderDeleted: true } if linked order was deleted.
 */
export const getOverrideOrderDetails = query({
  args: { voucherId: v.id("vouchers") },
  handler: async (ctx, args) => {
    const voucher = await ctx.db.get(args.voucherId);
    if (!voucher || !voucher.overrideOrderId) {
      return null;
    }

    const order = await ctx.db.get(voucher.overrideOrderId);
    if (!order) {
      // Order was deleted
      return { orderDeleted: true };
    }

    return {
      orderDeleted: false,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      customerName: order.customerName,
      status: order.status,
      finalTotal: order.finalTotal,
    };
  },
});


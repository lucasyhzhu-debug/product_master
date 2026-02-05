/**
 * Voucher Handling Helpers
 * Ctx-dependent functions for voucher validation and usage tracking in orders.
 */
import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/**
 * Validated voucher info to be stored on order.
 */
export interface AppliedVoucherInfo {
  voucherId: Id<"vouchers">;
  voucherCode: string;
  voucherDiscountValue: number;
}

/**
 * Validate a voucher and calculate discount for order creation.
 * Returns validated voucher info or throws error if invalid.
 *
 * This is used internally by order mutations - NOT for frontend validation.
 * Frontend should use the vouchers/queries.ts validateVoucher query.
 */
export async function validateAndApplyVoucher(
  ctx: MutationCtx,
  voucherCode: string,
  orderTotal: number,
  customerId: Id<"customers">
): Promise<AppliedVoucherInfo> {
  const normalizedCode = voucherCode.toUpperCase().trim();

  // 1. Check voucher exists
  const voucher = await ctx.db
    .query("vouchers")
    .withIndex("by_code", (q) => q.eq("code", normalizedCode))
    .first();

  if (!voucher) {
    throw new Error("Invalid voucher code");
  }

  // 2. Check voucher is active
  if (!voucher.isActive) {
    throw new Error("This voucher is no longer active");
  }

  // 3. Check validity period
  const now = Date.now();
  if (voucher.validFrom !== undefined && now < voucher.validFrom) {
    throw new Error("This voucher is not yet valid");
  }
  if (voucher.validUntil !== undefined && now > voucher.validUntil) {
    throw new Error("This voucher has expired");
  }

  // 4. Check total usage limit
  if (
    voucher.usageLimit !== undefined &&
    voucher.usageCount >= voucher.usageLimit
  ) {
    throw new Error("This voucher has reached its usage limit");
  }

  // 5. Check per-customer usage limit
  if (voucher.usagePerCustomer !== undefined) {
    const customerUsageCount = await ctx.db
      .query("voucherUsage")
      .withIndex("by_voucher_customer", (q) =>
        q.eq("voucherId", voucher._id).eq("customerId", customerId)
      )
      .collect();

    if (customerUsageCount.length >= voucher.usagePerCustomer) {
      throw new Error(
        "You have already used this voucher the maximum number of times"
      );
    }
  }

  // 6. Check minimum order amount
  if (
    voucher.minimumOrderAmount !== undefined &&
    orderTotal < voucher.minimumOrderAmount
  ) {
    const formattedMin = new Intl.NumberFormat("id-ID").format(
      voucher.minimumOrderAmount
    );
    throw new Error(
      `Minimum order of Rp ${formattedMin} required for this voucher`
    );
  }

  // 7. Calculate discount amount
  let calculatedDiscount: number;
  if (voucher.discountType === "percentage") {
    calculatedDiscount = Math.floor(
      (orderTotal * voucher.discountValue) / 100
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
  if (calculatedDiscount > orderTotal) {
    calculatedDiscount = orderTotal;
  }

  return {
    voucherId: voucher._id,
    voucherCode: voucher.code,
    voucherDiscountValue: calculatedDiscount,
  };
}

/**
 * Increment voucher usage count and create usage record.
 * Called after successful order creation.
 *
 * For manager overrides: also deactivates and links to consuming order.
 */
export async function recordVoucherUsage(
  ctx: MutationCtx,
  voucherId: Id<"vouchers">,
  customerId: Id<"customers">,
  orderId: Id<"orders">
): Promise<void> {
  const voucher = await ctx.db.get(voucherId);
  if (!voucher) {
    throw new Error("Voucher not found");
  }

  // Increment usage count
  await ctx.db.patch(voucherId, {
    usageCount: voucher.usageCount + 1,
    updatedAt: Date.now(),
  });

  // If this is a manager override, deactivate and link to order
  if (voucher.isManagerOverride) {
    await ctx.db.patch(voucherId, {
      isActive: false,
      overrideOrderId: orderId,
      updatedAt: Date.now(),
    });
  }

  // Create usage record
  await ctx.db.insert("voucherUsage", {
    voucherId,
    customerId,
    orderId,
    usedAt: Date.now(),
  });
}

/**
 * Decrement voucher usage count and delete usage record.
 * Called when order is cancelled.
 *
 * For manager overrides: does NOT reactivate or clear order link
 * (maintains audit trail even if order is cancelled/deleted).
 */
export async function releaseVoucherUsage(
  ctx: MutationCtx,
  voucherId: Id<"vouchers">,
  orderId: Id<"orders">
): Promise<void> {
  const voucher = await ctx.db.get(voucherId);
  if (!voucher) {
    // Voucher may have been deleted - silently ignore
    return;
  }

  // Decrement usage count (don't go below 0)
  await ctx.db.patch(voucherId, {
    usageCount: Math.max(0, voucher.usageCount - 1),
    updatedAt: Date.now(),
  });

  // IMPORTANT: For manager overrides, do NOT reactivate or clear order link
  // This maintains audit trail even if order is cancelled/deleted

  // Delete usage record for this order
  const usageRecord = await ctx.db
    .query("voucherUsage")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .first();

  if (usageRecord) {
    await ctx.db.delete(usageRecord._id);
  }
}

/**
 * Clear voucher from order (auto-release on edit).
 * Decrements usage and clears voucher fields from order.
 */
export async function clearVoucherFromOrder(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<boolean> {
  const order = await ctx.db.get(orderId);
  if (!order || !order.voucherId) {
    return false; // No voucher to clear
  }

  // Release voucher usage
  await releaseVoucherUsage(ctx, order.voucherId, orderId);

  // Recalculate finalTotal without voucher discount
  const newFinalTotal = order.totalAmount - (
    order.orderLevelDiscount && order.orderLevelDiscountType
      ? order.orderLevelDiscountType === "percentage"
        ? order.totalAmount * (order.orderLevelDiscount / 100)
        : order.orderLevelDiscount
      : 0
  );

  // Clear voucher fields from order
  await ctx.db.patch(orderId, {
    voucherId: undefined,
    voucherCode: undefined,
    voucherDiscountValue: undefined,
    finalTotal: newFinalTotal,
    lowPriceConfirmed: undefined,
  });

  return true;
}

/**
 * Validate final price meets business rules.
 * Throws error if final price is <= 0 (hard block).
 */
export function validateFinalPrice(
  subtotal: number,
  discount: number
): { finalPrice: number; isLowPrice: boolean } {
  const finalPrice = subtotal - discount;

  if (finalPrice <= 0) {
    throw new Error(
      "Discount cannot exceed order total. Final price must be greater than 0."
    );
  }

  // Check if below warning threshold (Rp 20,000)
  const isLowPrice = finalPrice < 20000;

  return { finalPrice, isLowPrice };
}

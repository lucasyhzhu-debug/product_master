/**
 * Usage Tracking Helper
 *
 * Tracks usage counts for channels and shipping agencies.
 * Used for "Top 4" selectors in order creation.
 */

import type { MutationCtx } from "../../_generated/server";

// ============================================
// Channel Usage Tracking
// ============================================

/**
 * Update channel usage count.
 * Creates record if it doesn't exist (for increment).
 * Does nothing if record doesn't exist (for decrement).
 */
async function updateChannelUsageCount(
  ctx: MutationCtx,
  channel: string,
  delta: 1 | -1
): Promise<void> {
  const existing = await ctx.db
    .query("channelUsage")
    .withIndex("by_channel", (q) => q.eq("channel", channel))
    .first();

  if (existing) {
    const newCount = Math.max(0, existing.usageCount + delta);
    await ctx.db.patch(existing._id, { usageCount: newCount });
  } else if (delta > 0) {
    await ctx.db.insert("channelUsage", { channel, usageCount: 1 });
  }
}

/**
 * Increment channel usage count.
 * Creates the record if it doesn't exist.
 */
export async function incrementChannelUsage(
  ctx: MutationCtx,
  channel: string
): Promise<void> {
  await updateChannelUsageCount(ctx, channel, 1);
}

/**
 * Decrement channel usage count.
 * Does nothing if record doesn't exist or count is already 0.
 */
export async function decrementChannelUsage(
  ctx: MutationCtx,
  channel: string
): Promise<void> {
  await updateChannelUsageCount(ctx, channel, -1);
}

// ============================================
// Shipping Agency Usage Tracking
// ============================================

/**
 * Update shipping agency usage count.
 * Creates record if it doesn't exist (for increment).
 * Does nothing if record doesn't exist (for decrement).
 */
async function updateShippingAgencyUsageCount(
  ctx: MutationCtx,
  agency: string,
  delta: 1 | -1
): Promise<void> {
  const existing = await ctx.db
    .query("shippingAgencyUsage")
    .withIndex("by_agency", (q) => q.eq("agency", agency))
    .first();

  if (existing) {
    const newCount = Math.max(0, existing.usageCount + delta);
    await ctx.db.patch(existing._id, { usageCount: newCount });
  } else if (delta > 0) {
    await ctx.db.insert("shippingAgencyUsage", { agency, usageCount: 1 });
  }
}

/**
 * Increment shipping agency usage count.
 * Creates the record if it doesn't exist.
 */
export async function incrementShippingAgencyUsage(
  ctx: MutationCtx,
  agency: string
): Promise<void> {
  await updateShippingAgencyUsageCount(ctx, agency, 1);
}

/**
 * Decrement shipping agency usage count.
 * Does nothing if record doesn't exist or count is already 0.
 */
export async function decrementShippingAgencyUsage(
  ctx: MutationCtx,
  agency: string
): Promise<void> {
  await updateShippingAgencyUsageCount(ctx, agency, -1);
}

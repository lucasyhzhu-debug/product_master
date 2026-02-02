/**
 * Usage Tracking Helper
 *
 * Tracks usage counts for channels and shipping agencies.
 * Used for "Top 4" selectors in order creation.
 */

import type { MutationCtx } from "../../_generated/server";

// ============================================
// Types
// ============================================

type UsageTable = "channelUsage" | "shippingAgencyUsage";

interface TableConfig {
  index: "by_channel" | "by_agency";
  key: "channel" | "agency";
}

const TABLE_CONFIG: Record<UsageTable, TableConfig> = {
  channelUsage: { index: "by_channel", key: "channel" },
  shippingAgencyUsage: { index: "by_agency", key: "agency" },
};

// ============================================
// Generic Usage Tracker
// ============================================

/**
 * Update usage count for a channel or shipping agency.
 * Creates record if it doesn't exist (for increment).
 * Does nothing if record doesn't exist (for decrement).
 */
export async function updateUsageCount(
  ctx: MutationCtx,
  table: UsageTable,
  value: string,
  delta: 1 | -1
): Promise<void> {
  const config = TABLE_CONFIG[table];

  // Query using the appropriate index
  const existing = await ctx.db
    .query(table)
    .withIndex(config.index, (q) => q.eq(config.key as any, value))
    .first();

  if (existing) {
    const newCount = Math.max(0, existing.usageCount + delta);
    await ctx.db.patch(existing._id, { usageCount: newCount });
  } else if (delta > 0) {
    // Only create record for increment
    await ctx.db.insert(table, { [config.key]: value, usageCount: 1 } as any);
  }
  // For decrement with no existing record, do nothing
}

// ============================================
// Convenience Wrappers
// ============================================

/**
 * Increment channel usage count.
 * Creates the record if it doesn't exist.
 */
export async function incrementChannelUsage(
  ctx: MutationCtx,
  channel: string
): Promise<void> {
  await updateUsageCount(ctx, "channelUsage", channel, 1);
}

/**
 * Decrement channel usage count.
 * Does nothing if record doesn't exist or count is already 0.
 */
export async function decrementChannelUsage(
  ctx: MutationCtx,
  channel: string
): Promise<void> {
  await updateUsageCount(ctx, "channelUsage", channel, -1);
}

/**
 * Increment shipping agency usage count.
 * Creates the record if it doesn't exist.
 */
export async function incrementShippingAgencyUsage(
  ctx: MutationCtx,
  agency: string
): Promise<void> {
  await updateUsageCount(ctx, "shippingAgencyUsage", agency, 1);
}

/**
 * Decrement shipping agency usage count.
 * Does nothing if record doesn't exist or count is already 0.
 */
export async function decrementShippingAgencyUsage(
  ctx: MutationCtx,
  agency: string
): Promise<void> {
  await updateUsageCount(ctx, "shippingAgencyUsage", agency, -1);
}

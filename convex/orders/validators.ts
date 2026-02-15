/**
 * Shared validators for order-related mutations and queries.
 * Extracted to eliminate duplication across orderCrud, itemCrud, queries, and statusUpdates.
 */
import { v } from "convex/values";

/**
 * Validator for order item input (used in create order and add item).
 */
export const orderItemInput = v.object({
  productName: v.string(),
  productVariant: v.optional(v.string()),
  quantity: v.number(),
  unitPrice: v.number(),
  unitCost: v.number(),
  discountAmount: v.optional(v.number()),
  menuProductId: v.optional(v.id("menuProducts")),
});

/**
 * Channel validator for order channel field.
 */
export const channelValidator = v.union(
  v.literal("whatsapp"),
  v.literal("instagram"),
  v.literal("shopee"),
  v.literal("tiktok"),
  v.literal("tokopedia"),
  v.literal("grabfood"),
  v.literal("k3mart_gf"),
  v.literal("legato_tamtem"),
  v.literal("legato_goldfinch"),
  v.literal("bazaar"),
  v.literal("other")
);

/**
 * Status validator for order status field.
 * Phase 14: Simplified to 7 statuses for Kanban workflow.
 */
export const statusValidator = v.union(
  v.literal("Draft"),
  v.literal("AwaitingPayment"),
  v.literal("PaymentReceived"),
  v.literal("BeingPrepared"),
  v.literal("AwaitingDelivery"),
  v.literal("Complete"),
  v.literal("Cancelled")
);

/**
 * Shared write path for inserting an order + its items + production records.
 * Used by orders.create (I1) and confirmWeek (Task B7).
 *
 * The typed OrderInsert forces every required orders field at the call site —
 * confirmWeek cannot compile without supplying e.g. deliveryType/isKitchenVisible.
 */
import type { MutationCtx } from "../../_generated/server";
import type { Id, Doc } from "../../_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";
import { createProductionRecordsForItem } from "./productionRecords";

/** All required+optional fields for inserting an orders row (no system fields). */
export type OrderInsert = WithoutSystemFields<Doc<"orders">>;

/** All fields for an orderItems row except orderId (injected by the helper). */
export type OrderItemInsert = Omit<WithoutSystemFields<Doc<"orderItems">>, "orderId">;

/**
 * Insert an orders row, its orderItems rows, and production records for any
 * item that has a menuProductId. Returns the new orderId.
 *
 * Voucher-usage recording and audit-log calls remain in the caller — they are
 * NOT part of this helper.
 */
export async function insertOrderWithItems(
  ctx: MutationCtx,
  args: { orderFields: OrderInsert; items: OrderItemInsert[] },
): Promise<Id<"orders">> {
  const orderId = await ctx.db.insert("orders", args.orderFields);
  for (const item of args.items) {
    const orderItemId = await ctx.db.insert("orderItems", { orderId, ...item });
    if (item.menuProductId) {
      await createProductionRecordsForItem(ctx, orderItemId, item.menuProductId, item.quantity);
    }
  }
  return orderId;
}

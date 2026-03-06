/**
 * Kanban board column definitions and order enrichment helpers.
 * Pure functions for building the kanban board data structure.
 */
import type { Doc, Id } from "../../_generated/dataModel";

/**
 * Column definitions for the Kanban board.
 * Matches STATUS_CATEGORIES in statusTransitions.ts.
 */
export const KANBAN_COLUMNS = [
  { key: "draft", statuses: ["Draft"] as const },
  { key: "awaiting_payment", statuses: ["AwaitingPayment"] as const },
  { key: "payment_received", statuses: ["PaymentReceived"] as const },
  { key: "being_prepared", statuses: ["BeingPrepared"] as const },
  { key: "awaiting_delivery", statuses: ["AwaitingDelivery"] as const },
  // Include legacy terminal statuses (CompleteShipped, PickedUp) for unmigrated orders
  { key: "complete", statuses: ["Complete", "Cancelled", "CompleteShipped", "PickedUp"] as const },
] as const;

/**
 * Lean shape for a kanban order card.
 * Contains only the fields needed by the kanban UI.
 */
export interface KanbanOrderCard {
  _id: Id<"orders">;
  _creationTime: number;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone?: string;
  contactWa?: string;
  dueDate?: number;
  completedAt?: number;
  deliveryType?: string;
  deliveryAddress?: string;
  totalAmount: number;
  totalCost: number;
  totalMargin: number;
  finalTotal?: number;
  orderLevelDiscount?: number;
  orderLevelDiscountType?: string;
  voucherDiscountValue?: number;
  expedited?: boolean;
  creatorName: string;
  notes?: string;
  createdByUserId?: string;
  items: Array<{
    _id: Id<"orderItems">;
    productName: string;
    productVariant?: string;
    quantity: number;
    lineTotal: number;
  }>;
}

/**
 * Sort orders within a kanban column by the column's sort criteria.
 */
export function sortKanbanColumn(
  columnKey: string,
  orders: Doc<"orders">[]
): Doc<"orders">[] {
  if (columnKey === "complete") {
    return [...orders]
      .sort((a, b) => (b.completedAt ?? b._creationTime) - (a.completedAt ?? a._creationTime))
      .slice(0, 50);
  } else if (columnKey === "draft") {
    return [...orders].sort((a, b) => b._creationTime - a._creationTime);
  } else {
    return [...orders].sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity));
  }
}

/**
 * Map a raw order + items + creator to a lean KanbanOrderCard shape.
 */
export function buildKanbanCard(
  order: Doc<"orders">,
  items: Array<Pick<Doc<"orderItems">, "_id" | "productName" | "productVariant" | "quantity" | "lineTotal">>,
  creatorName: string
): KanbanOrderCard {
  return {
    _id: order._id,
    _creationTime: order._creationTime,
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    contactWa: order.contactWa,
    dueDate: order.dueDate,
    completedAt: order.completedAt,
    deliveryType: order.deliveryType,
    deliveryAddress: order.deliveryAddress,
    totalAmount: order.totalAmount,
    totalCost: order.totalCost,
    totalMargin: order.totalMargin,
    finalTotal: order.finalTotal,
    orderLevelDiscount: order.orderLevelDiscount,
    orderLevelDiscountType: order.orderLevelDiscountType,
    voucherDiscountValue: order.voucherDiscountValue,
    expedited: order.expedited,
    creatorName,
    notes: order.notes,
    createdByUserId: order.createdByUserId,
    items: items.map((item) => ({
      _id: item._id,
      productName: item.productName,
      productVariant: item.productVariant,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
  };
}

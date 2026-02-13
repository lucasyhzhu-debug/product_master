/**
 * Convex hooks for kitchen stats and production tracking.
 * PRD-1: Kitchen Core - Wave 2: Frontend Foundation
 * Transforms Convex camelCase to frontend snake_case for compatibility.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import type {
  KitchenStats,
  KitchenOrder,
  KitchenOrderItem,
  OrderStatus,
  PaymentStatus,
} from "@/lib/types";

// ============================================
// Types (Convex response shapes)
// ============================================

interface ConvexKitchenStats {
  bigBallsNeeded: number;
  bigBallsCompleted: number;
  midBallsNeeded: number;
  midBallsCompleted: number;
  ordersPending: number;
  ordersCompletedToday: number;
  // PRD-5: Dynamic production type stats
  productionByType?: Array<{
    code: string;
    name: string;
    color?: string;
    unitsNeeded: number;
    unitsCompleted: number;
  }>;
}

interface ConvexKitchenOrderItem {
  _id: Id<"orderItems">;
  _creationTime: number;
  productName: string;
  productVariant?: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount: number;
  lineTotal: number;
  lineCost: number;
  lineMargin: number;
  productionType?: "original" | "bite_sized";
  productionUnits?: number;
  ballsFilled?: number;
  packageStatus?: "empty" | "filling" | "filled" | "packed";
  packedPackageIndices?: number[];
}

interface ConvexKitchenOrder {
  _id: Id<"orders">;
  _creationTime: number;
  orderNumber: string;
  customerId: Id<"customers">;
  customerName: string;
  customerPhone?: string;
  status: string;
  awaitingPaymentSince?: number;
  paymentStatus: string;
  orderDate: number;
  dueDate?: number;
  totalAmount: number;
  totalCost: number;
  totalMargin: number;
  itemCount: number;
  channel?: string;
  soldBy?: string;
  deliveryType?: string;
  shippingAgency?: string;
  orderLevelDiscount?: number;
  items: ConvexKitchenOrderItem[];
  bigBallsNeeded: number;
  midBallsNeeded: number;
  // PRD-5: Dynamic production by type
  productionByType?: Array<{
    code: string;
    name: string;
    color?: string;
    unitsNeeded: number;
  }>;
}

interface ConvexCompletedOrder {
  _id: Id<"orders">;
  _creationTime: number;
  orderNumber: string;
  customerId: Id<"customers">;
  customerName: string;
  customerPhone?: string;
  status: string;
  awaitingPaymentSince?: number;
  paymentStatus: string;
  orderDate: number;
  dueDate?: number;
  totalAmount: number;
  totalCost: number;
  totalMargin: number;
  itemCount: number;
  channel?: string;
  soldBy?: string;
  deliveryType?: string;
  shippingAgency?: string;
  orderLevelDiscount?: number;
  items: ConvexKitchenOrderItem[];
  customer: Doc<"customers"> | null;
  bigBalls: number;
  midBalls: number;
}

// ============================================
// Transform Functions (Internal)
// ============================================

function transformKitchenStats(stats: ConvexKitchenStats): KitchenStats {
  return {
    big_balls_needed: stats.bigBallsNeeded,
    big_balls_completed: stats.bigBallsCompleted,
    mid_balls_needed: stats.midBallsNeeded,
    mid_balls_completed: stats.midBallsCompleted,
    orders_pending: stats.ordersPending,
    orders_completed_today: stats.ordersCompletedToday,
    // PRD-5: Transform dynamic production type stats
    production_by_type: stats.productionByType?.map((p) => ({
      code: p.code,
      name: p.name,
      color: p.color,
      units_needed: p.unitsNeeded,
      units_completed: p.unitsCompleted,
    })),
  };
}

function transformKitchenOrderItem(item: ConvexKitchenOrderItem): KitchenOrderItem {
  return {
    id: item._id as unknown as number,
    product_name: item.productName,
    product_variant: item.productVariant ?? null,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    unit_cost: item.unitCost,
    discount_amount: item.discountAmount ?? 0,
    line_total: item.lineTotal,
    line_cost: item.lineCost,
    line_margin: item.lineMargin,
    created_at: new Date(item._creationTime).toISOString(),
    production_type: item.productionType,
    production_units: item.productionUnits,
    balls_filled: item.ballsFilled,
    package_status: item.packageStatus,
    packed_package_indices: item.packedPackageIndices,
  };
}

function transformOrderToKitchenOrder(order: ConvexKitchenOrder | ConvexCompletedOrder): KitchenOrder {
  const isKitchenOrder = "bigBallsNeeded" in order;

  return {
    id: order._id as unknown as number,
    order_number: order.orderNumber,
    customer_name: order.customerName,
    customer_phone: order.customerPhone ?? null,
    status: order.status as OrderStatus,
    awaiting_payment_since: order.awaitingPaymentSince
      ? new Date(order.awaitingPaymentSince).toISOString()
      : null,
    payment_status: order.paymentStatus as PaymentStatus,
    channel: order.channel ?? null,
    sold_by: order.soldBy ?? null,
    due_date: order.dueDate ? new Date(order.dueDate).toISOString() : null,
    total_amount: order.totalAmount,
    total_cost: order.totalCost,
    total_margin: order.totalMargin,
    total_discount: order.orderLevelDiscount ?? 0,
    item_count: order.itemCount,
    delivery_type: order.deliveryType ?? null,
    shipping_agency: order.shippingAgency ?? null,
    created_at: new Date(order._creationTime).toISOString(),
    items: order.items.map(transformKitchenOrderItem),
    big_balls_needed: isKitchenOrder ? order.bigBallsNeeded : order.bigBalls,
    mid_balls_needed: isKitchenOrder ? order.midBallsNeeded : order.midBalls,
    production_by_type: isKitchenOrder
      ? order.productionByType?.map((p) => ({
          code: p.code,
          name: p.name,
          color: p.color,
          units_needed: p.unitsNeeded,
        }))
      : undefined,
  };
}

// ============================================
// Query Hooks
// ============================================

/**
 * Get kitchen stats for dashboard.
 * PRD-1: Ball production tracking.
 */
export function useConvexKitchenStats() {
  const data = useQuery(api.orders.queries.getKitchenStats, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: transformKitchenStats(data as ConvexKitchenStats),
    isLoading: false,
  };
}

/**
 * Get kitchen orders (Confirmed status with ball calculations).
 * PRD-1: For production queue display.
 */
export function useConvexKitchenOrdersWithBalls() {
  const data = useQuery(api.orders.queries.getKitchenOrders, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: (data as ConvexKitchenOrder[]).map(transformOrderToKitchenOrder),
    isLoading: false,
  };
}

/**
 * Get orders completed today.
 * PRD-1: For kitchen view history.
 */
export function useConvexCompletedToday() {
  const data = useQuery(api.orders.queries.getCompletedToday, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: (data as ConvexCompletedOrder[]).map(transformOrderToKitchenOrder),
    isLoading: false,
  };
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Complete an order (mark production as done).
 * PRD-1: Kitchen Core - moves order from Confirmed to ProductionComplete.
 */
export function useConvexCompleteOrder() {
  const mutation = useMutation(api.orders.mutations.index.completeOrder);

  const execute = async (orderId: Id<"orders">) => {
    try {
      await mutation({ orderId });
      toast.success("Order marked as complete");
      return orderId;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to complete order"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Revert order back to Confirmed status.
 * PRD-1: Kitchen Core - undo production completion.
 */
export function useConvexRevertToConfirmed() {
  const mutation = useMutation(api.orders.mutations.index.revertToConfirmed);

  const execute = async (orderId: Id<"orders">) => {
    try {
      await mutation({ orderId });
      toast.success("Order reverted to Confirmed");
      return orderId;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to revert order"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Complete balls in batches (gamification feature).
 * PRD-1: Kitchen Core - Wave 2 Gamification.
 */
export function useConvexCompleteBalls() {
  const completeBalls = useMutation(api.orders.mutations.index.completeBalls);
  return {
    mutate: completeBalls,
    mutateAsync: completeBalls,
  };
}

/**
 * Complete packaging for an order (move to WaitingShipment or WaitingPickup).
 * Kitchen UI Flow Fix - Phase 2: Replaces completeOrder for kitchen workflow.
 */
export function useConvexCompletePackaging() {
  const mutation = useMutation(api.orders.mutations.index.completePackaging);

  const execute = async (orderId: Id<"orders">) => {
    try {
      const result = await mutation({ orderId });
      const statusText = result.newStatus === 'WaitingShipment'
        ? 'Ready for shipment!'
        : 'Ready for pickup!';
      toast.success(statusText);
      return result;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to complete packaging"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Revert order back to Packaging status.
 * Kitchen UI Flow Fix - Phase 2: Undo completion for kitchen workflow.
 */
export function useConvexRevertToPackaging() {
  const mutation = useMutation(api.orders.mutations.index.revertToPackaging);

  const execute = async (orderId: Id<"orders">) => {
    try {
      await mutation({ orderId });
      toast.info("Order moved back to Packaging");
      return orderId;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to revert order"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

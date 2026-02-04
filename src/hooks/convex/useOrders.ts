/**
 * Convex hooks for orders.
 * These replace the React Query + Axios hooks.
 * Transforms Convex camelCase to frontend snake_case for compatibility.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import type {
  OrderSummary,
  OrderDetail,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  ProductSuggestion,
} from "@/lib/types";

// ============================================
// Types
// ============================================

export interface OrderItemInput {
  productName: string;
  productVariant?: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount?: number;
  menuProductId?: Id<"menuProducts">;
}

// Channel type matching Convex schema
export type OrderChannel =
  | "whatsapp"
  | "instagram"
  | "shopee"
  | "tiktok"
  | "tokopedia"
  | "grabfood"
  | "k3mart_gf"
  | "legato_tamtem"
  | "legato_goldfinch"
  | "bazaar"
  | "other";

export interface OrderCreateInput {
  customerId?: Id<"customers">;
  newCustomer?: {
    name: string;
    phone?: string;
    source?: string;
  };
  channel?: OrderChannel;
  soldBy?: string;
  dueDate?: number;
  notes?: string;
  deliveryType?: string;
  pickupLocation?: string;
  deliveryAddress?: string;
  contactWa?: string;
  contactIg?: string;
  // Order-level discount
  orderLevelDiscount?: number;
  orderLevelDiscountType?: "amount" | "percentage";
  // Voucher fields
  voucherCode?: string;
  lowPriceConfirmed?: boolean;
  items: OrderItemInput[];
  createdBy?: string;
}

// PRD-0: Type-safe order status values
export type OrderStatusType =
  | "Draft"
  | "AwaitingPayment"
  | "Confirmed"
  | "ProductionComplete"
  | "Packaging"
  | "WaitingShipment"
  | "CompleteShipped"
  | "WaitingPickup"
  | "PickedUp"
  | "Cancelled";

// PRD-0: Type-safe payment status values
export type PaymentStatusType = "Unpaid" | "Partial" | "Paid";

export interface OrderFilters {
  status?: OrderStatusType;
  channel?: OrderChannel;
  dueDateFrom?: number;
  dueDateTo?: number;
  limit?: number;
}

export type WhatsAppTemplate =
  | "payment_request"
  | "production_started"
  | "delivery_complete"
  | "receipt"
  | "shipping"
  | "pickup_ready";

// ============================================
// Transform Functions (Internal)
// ============================================

interface ConvexOrderItem {
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
}

interface ConvexOrder {
  _id: Id<"orders">;
  _creationTime: number;
  orderNumber: string;
  customerId: Id<"customers">;
  customerName: string;
  customerPhone?: string;
  status: string;
  awaitingPaymentSince?: number;
  paymentStatus: string;
  paymentMethod?: string;
  orderDate: number;
  dueDate?: number;
  totalAmount: number;
  totalCost: number;
  totalMargin: number;
  // Order-level discount
  orderLevelDiscount?: number;
  orderLevelDiscountType?: "amount" | "percentage";
  finalTotal?: number;
  itemCount: number;
  channel?: string;
  soldBy?: string;
  notes?: string;
  deliveryType?: string;
  pickupLocation?: string;
  deliveryAddress?: string;
  contactWa?: string;
  contactIg?: string;
  shippingAgency?: string;
  shippingNumber?: string;
  cancellationReason?: string;
  createdBy?: string;
}

interface ConvexOrderWithItems extends ConvexOrder {
  items: ConvexOrderItem[];
  customer: Doc<"customers"> | null;
}

function transformOrderItem(item: ConvexOrderItem): OrderItem {
  return {
    id: item._id as unknown as number, // Frontend expects number but we pass string ID
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
  };
}

function transformToOrderSummary(order: ConvexOrder | ConvexOrderWithItems): OrderSummary {
  // Calculate order-level discount amount
  let totalDiscount = 0;
  if (order.orderLevelDiscount && order.orderLevelDiscountType) {
    if (order.orderLevelDiscountType === "percentage") {
      totalDiscount = order.totalAmount * (order.orderLevelDiscount / 100);
    } else {
      totalDiscount = order.orderLevelDiscount;
    }
  }

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
    total_discount: totalDiscount,
    item_count: order.itemCount,
    delivery_type: order.deliveryType ?? null,
    shipping_agency: order.shippingAgency ?? null,
    created_at: new Date(order._creationTime).toISOString(),
  };
}

function transformToOrderDetail(order: ConvexOrderWithItems): OrderDetail {
  // Calculate order-level discount amount
  let totalDiscount = 0;
  if (order.orderLevelDiscount && order.orderLevelDiscountType) {
    if (order.orderLevelDiscountType === "percentage") {
      totalDiscount = order.totalAmount * (order.orderLevelDiscount / 100);
    } else {
      totalDiscount = order.orderLevelDiscount;
    }
  }

  return {
    id: order._id as unknown as number,
    order_number: order.orderNumber,
    customer_id: order.customerId as unknown as number,
    customer_name: order.customerName,
    customer_phone: order.customerPhone ?? null,
    status: order.status as OrderStatus,
    awaiting_payment_since: order.awaitingPaymentSince
      ? new Date(order.awaitingPaymentSince).toISOString()
      : null,
    payment_status: order.paymentStatus as PaymentStatus,
    payment_method: order.paymentMethod ?? null,
    order_date: new Date(order.orderDate).toISOString(),
    due_date: order.dueDate ? new Date(order.dueDate).toISOString() : null,
    total_amount: order.totalAmount,
    total_cost: order.totalCost,
    total_margin: order.totalMargin,
    total_discount: totalDiscount,
    margin_pct:
      order.totalAmount > 0
        ? (order.totalMargin / order.totalAmount) * 100
        : null,
    channel: order.channel ?? null,
    sold_by: order.soldBy ?? null,
    notes: order.notes ?? null,
    delivery_type: order.deliveryType ?? "Pickup",
    pickup_location: order.pickupLocation ?? null,
    delivery_address: order.deliveryAddress ?? null,
    contact_wa: order.contactWa ?? null,
    contact_ig: order.contactIg ?? null,
    shipping_agency: order.shippingAgency ?? null,
    shipping_number: order.shippingNumber ?? null,
    cancellation_reason: order.cancellationReason ?? null,
    created_at: new Date(order._creationTime).toISOString(),
    created_by: order.createdBy ?? "admin",
    items: order.items.map(transformOrderItem),
    // WhatsApp templates - fetched separately
    whatsapp_text: "",
    payment_request_text: undefined,
    production_started_text: undefined,
    delivery_complete_text: undefined,
    shipping_text: undefined,
    pickup_text: undefined,
  };
}

function transformProductSuggestion(item: {
  productName: string;
  productVariant?: string;
  unitPrice: number;
  unitCost: number;
  lastUsed: number;
}): ProductSuggestion {
  return {
    product_name: item.productName,
    product_variant: item.productVariant ?? null,
    last_unit_price: item.unitPrice,
    last_unit_cost: item.unitCost,
    usage_count: 1, // Convex doesn't track this, default to 1
  };
}

// ============================================
// Query Hooks
// ============================================

/**
 * List orders with optional filters.
 */
export function useConvexOrders(filters?: OrderFilters) {
  const data = useQuery(api.orders.queries.list, filters ?? {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data.map(transformToOrderSummary),
    isLoading: false,
  };
}

/**
 * Get a single order by ID with items.
 */
export function useConvexOrder(id: Id<"orders"> | undefined) {
  const data = useQuery(api.orders.queries.get, id ? { id } : "skip");
  if (data === undefined) return { data: undefined, isLoading: id !== undefined };
  if (data === null) return { data: null, isLoading: false };
  return {
    data: transformToOrderDetail(data as ConvexOrderWithItems),
    isLoading: false,
  };
}

/**
 * Get order by order number.
 */
export function useConvexOrderByNumber(orderNumber: string | undefined) {
  const data = useQuery(
    api.orders.queries.getByOrderNumber,
    orderNumber ? { orderNumber } : "skip"
  );
  if (data === undefined) return { data: undefined, isLoading: orderNumber !== undefined };
  if (data === null) return { data: null, isLoading: false };
  return {
    data: transformToOrderDetail(data as ConvexOrderWithItems),
    isLoading: false,
  };
}

/**
 * Get orders for kitchen view (production pipeline).
 */
export function useConvexKitchenOrders() {
  const data = useQuery(api.orders.queries.getKitchenOrders, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data.map(transformToOrderSummary),
    isLoading: false,
  };
}

/**
 * Get orders by customer.
 */
export function useConvexOrdersByCustomer(customerId: Id<"customers"> | undefined) {
  const data = useQuery(
    api.orders.queries.getByCustomer,
    customerId ? { customerId } : "skip"
  );
  if (data === undefined) return { data: undefined, isLoading: customerId !== undefined };
  return {
    data: (data ?? []).map(transformToOrderSummary),
    isLoading: false,
  };
}

/**
 * Get product suggestions for order creation.
 */
export function useConvexProductSuggestions(limit?: number) {
  const data = useQuery(api.orders.queries.getProductSuggestions, { limit });
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data.map(transformProductSuggestion),
    isLoading: false,
  };
}

/**
 * Get seller suggestions.
 */
export function useConvexSellerSuggestions() {
  const data = useQuery(api.orders.queries.getSellerSuggestions, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data.map((name) => ({ sold_by: name, order_count: 0 })),
    isLoading: false,
  };
}

/**
 * Get channel suggestions.
 */
export function useConvexChannelSuggestions() {
  const data = useQuery(api.orders.queries.getChannelSuggestions, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data,
    isLoading: false,
  };
}

/**
 * Get WhatsApp message for an order.
 */
export function useConvexWhatsAppMessage(
  orderId: Id<"orders"> | undefined,
  template: WhatsAppTemplate
) {
  const data = useQuery(
    api.orders.whatsapp.getMessage,
    orderId ? { orderId, template } : "skip"
  );
  return {
    data: data,
    isLoading: data === undefined && orderId !== undefined,
  };
}

/**
 * Get the dynamic WhatsApp order template with current POS products and prices.
 * Used by OrderFormPOS to pre-fill the order sheet textarea.
 */
export function useConvexOrderTemplate() {
  const data = useQuery(api.orders.whatsapp.getOrderTemplate);
  return {
    data,
    isLoading: data === undefined,
  };
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Create a new order with items.
 */
export function useConvexCreateOrder() {
  const mutation = useMutation(api.orders.mutations.create);

  return {
    mutate: async (data: OrderCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Order created successfully");
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create order";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: OrderCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Order created successfully");
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create order";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Update order status.
 */
export function useConvexUpdateOrderStatus() {
  const mutation = useMutation(api.orders.mutations.updateStatus);

  return {
    mutate: async (data: { orderId: Id<"orders">; status: "Draft" | "AwaitingPayment" | "Confirmed" | "InProduction" | "ProductionComplete" | "Packaging" | "WaitingShipment" | "CompleteShipped" | "WaitingPickup" | "PickedUp" | "Cancelled" }) => {
      try {
        await mutation(data);
        toast.success("Order status updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update status";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: { orderId: Id<"orders">; status: "Draft" | "AwaitingPayment" | "Confirmed" | "InProduction" | "ProductionComplete" | "Packaging" | "WaitingShipment" | "CompleteShipped" | "WaitingPickup" | "PickedUp" | "Cancelled" }) => {
      try {
        await mutation(data);
        toast.success("Order status updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update status";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Update payment status.
 * PRD-0: Uses type-safe PaymentStatusType.
 */
export function useConvexUpdateOrderPayment() {
  const mutation = useMutation(api.orders.mutations.updatePayment);

  return {
    mutate: async (data: {
      orderId: Id<"orders">;
      paymentStatus: PaymentStatusType;
      paymentMethod?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Payment status updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update payment";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: {
      orderId: Id<"orders">;
      paymentStatus: PaymentStatusType;
      paymentMethod?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Payment status updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update payment";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Update shipping info.
 */
export function useConvexUpdateOrderShipping() {
  const mutation = useMutation(api.orders.mutations.updateShipping);

  return {
    mutate: async (data: {
      orderId: Id<"orders">;
      shippingAgency?: string;
      shippingNumber?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Shipping info updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update shipping";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: {
      orderId: Id<"orders">;
      shippingAgency?: string;
      shippingNumber?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Shipping info updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update shipping";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Update order details (notes, delivery info, etc.).
 */
export function useConvexUpdateOrderDetails() {
  const mutation = useMutation(api.orders.mutations.updateDetails);

  return {
    mutate: async (data: {
      orderId: Id<"orders">;
      dueDate?: number;
      notes?: string;
      deliveryType?: string;
      pickupLocation?: string;
      deliveryAddress?: string;
      contactWa?: string;
      contactIg?: string;
      channel?: "whatsapp" | "instagram" | "shopee" | "tiktok" | "tokopedia" | "grabfood" | "k3mart_gf" | "legato_tamtem" | "legato_goldfinch" | "bazaar" | "other";
      soldBy?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Order details updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update details";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: {
      orderId: Id<"orders">;
      dueDate?: number;
      notes?: string;
      deliveryType?: string;
      pickupLocation?: string;
      deliveryAddress?: string;
      contactWa?: string;
      contactIg?: string;
      channel?: "whatsapp" | "instagram" | "shopee" | "tiktok" | "tokopedia" | "grabfood" | "k3mart_gf" | "legato_tamtem" | "legato_goldfinch" | "bazaar" | "other";
      soldBy?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Order details updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update details";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Cancel an order.
 * PRD-7: Enhanced with reason categories for audit trail.
 */
type CancellationCategory = "customer_request" | "out_of_stock" | "payment_issue" | "duplicate" | "other";

export function useConvexCancelOrder() {
  const mutation = useMutation(api.orders.mutations.cancel);

  return {
    mutate: async (data: { orderId: Id<"orders">; reason?: string; reasonCategory?: CancellationCategory }) => {
      try {
        await mutation(data);
        toast.success("Order cancelled");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to cancel order";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: { orderId: Id<"orders">; reason?: string; reasonCategory?: CancellationCategory }) => {
      try {
        await mutation(data);
        toast.success("Order cancelled");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to cancel order";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Delete an order (Draft only).
 */
export function useConvexDeleteOrder() {
  const mutation = useMutation(api.orders.mutations.remove);

  return {
    mutate: async (orderId: Id<"orders">) => {
      try {
        await mutation({ orderId });
        toast.success("Order deleted");
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to delete order";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (orderId: Id<"orders">) => {
      try {
        await mutation({ orderId });
        toast.success("Order deleted");
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to delete order";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Add item to existing order.
 */
export function useConvexAddOrderItem() {
  const mutation = useMutation(api.orders.mutations.addItem);

  return {
    mutate: async (data: { orderId: Id<"orders">; item: OrderItemInput }) => {
      try {
        const id = await mutation(data);
        toast.success("Item added");
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to add item";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: { orderId: Id<"orders">; item: OrderItemInput }) => {
      try {
        const id = await mutation(data);
        toast.success("Item added");
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to add item";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Remove item from order.
 */
export function useConvexRemoveOrderItem() {
  const mutation = useMutation(api.orders.mutations.removeItem);

  return {
    mutate: async (itemId: Id<"orderItems">) => {
      try {
        await mutation({ itemId });
        toast.success("Item removed");
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to remove item";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (itemId: Id<"orderItems">) => {
      try {
        await mutation({ itemId });
        toast.success("Item removed");
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to remove item";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Update order item quantity.
 */
export function useConvexUpdateOrderItemQuantity() {
  const mutation = useMutation(api.orders.mutations.updateItemQuantity);

  return {
    mutate: async (data: { itemId: Id<"orderItems">; quantity: number }) => {
      try {
        await mutation(data);
        toast.success("Quantity updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update quantity";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: { itemId: Id<"orderItems">; quantity: number }) => {
      try {
        await mutation(data);
        toast.success("Quantity updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update quantity";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Update order-level discount.
 * PRD-5: Order System V2 - Wave 1.
 */
export function useConvexUpdateOrderDiscount() {
  const mutation = useMutation(api.orders.mutations.updateOrderDiscount);

  return {
    mutate: async (data: {
      orderId: Id<"orders">;
      discount: number;
      discountType: "amount" | "percentage";
    }) => {
      try {
        await mutation(data);
        toast.success("Discount updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update discount";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: {
      orderId: Id<"orders">;
      discount: number;
      discountType: "amount" | "percentage";
    }) => {
      try {
        await mutation(data);
        toast.success("Discount updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update discount";
        toast.error(message);
        throw error;
      }
    },
  };
}

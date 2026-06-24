/**
 * Convex hooks for orders.
 * Convex query/mutation hooks for order management.
 * Transforms Convex camelCase to frontend snake_case for compatibility.
 */
import { useQuery, useMutation } from "convex/react";
import {
  useSessionMutation,
  useSessionQuery,
  useSessionPaginatedQuery,
} from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import type {
  OrderDetail,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  ProductSuggestion,
} from "@/lib/types";
import {
  calculateTotalDiscount,
  transformToOrderSummary,
} from "@/lib/transforms";
import type { ConvexOrderBase } from "@/lib/transforms";
import { getErrorMessage } from "@/lib/utils";

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
  createdByUserId?: Id<"users">;
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

// Phase 14: Type-safe order status values (7 statuses)
export type OrderStatusType =
  | "Draft"
  | "AwaitingPayment"
  | "PaymentReceived"
  | "BeingPrepared"
  | "AwaitingDelivery"
  | "Complete"
  | "Cancelled";

// PRD-0: Type-safe payment status values
export type PaymentStatusType = "Unpaid" | "Partial" | "Paid";

export interface OrderFilters {
  status?: OrderStatusType | OrderStatusType[];
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
  // gap#2: stripped to undefined for non-managers on subscription orders.
  unitPrice: number | undefined;
  unitCost: number;
  discountAmount: number;
  lineTotal: number | undefined;
  lineCost: number;
  lineMargin: number;
}

interface ConvexOrderDetail extends ConvexOrderBase {
  _id: Id<"orders">;
  customerId: Id<"customers">;
  subscriptionId?: Id<"subscriptions">;
  paymentMethod?: string;
  orderDate: number;
  finalTotal?: number;
  deliveryFee?: number;
  voucherCode?: string;
  voucherDiscountValue?: number;
  notes?: string;
  pickupLocation?: string;
  deliveryAddress?: string;
  contactWa?: string;
  contactIg?: string;
  shippingNumber?: string;
  cancellationReason?: string;
  createdBy?: string;
}

interface ConvexOrderWithItems extends ConvexOrderDetail {
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

function transformToOrderDetail(order: ConvexOrderWithItems): OrderDetail {
  const totalDiscount = calculateTotalDiscount(
    order.totalAmount ?? 0,
    order.orderLevelDiscount,
    order.orderLevelDiscountType
  );

  // gap#2: money fields may be stripped (undefined) for non-managers on
  // subscription orders — guard the derived margin %.
  const marginPct =
    order.totalAmount != null && order.totalMargin != null && order.totalAmount > 0
      ? (order.totalMargin / order.totalAmount) * 100
      : null;

  return {
    id: order._id as unknown as number,
    order_number: order.orderNumber,
    customer_id: order.customerId as unknown as number,
    subscription_id: (order.subscriptionId as unknown as string) ?? null,
    customer_id_raw: (order.customerId as unknown as string) ?? null,
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
    margin_pct: marginPct,
    voucher_code: order.voucherCode ?? null,
    voucher_discount_value: order.voucherDiscountValue ?? null,
    final_total: order.finalTotal ?? null,
    delivery_fee: order.deliveryFee ?? null,
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
 * Phase 14: Kanban board data hook.
 * Returns column-grouped orders for the Kanban UI.
 */
export function useKanbanOrders() {
  // CR-D: listForKanban is now a protectedQuery (strips subscription pricing for
  // non-managers) — must subscribe with a session, like get/getKitchenOrders.
  const data = useSessionQuery(api.orders.queries.listForKanban, {});
  return data;
}

/**
 * List orders with optional filters.
 * Pass `"skip"` to disable the query (e.g., when using paginated hook instead).
 */
export function useOrders(filters?: OrderFilters | "skip") {
  // gap#2 (residual): `list` is now a protectedQuery (server strips confidential
  // subscription pricing for non-managers) — must subscribe with a session.
  const data = useSessionQuery(
    api.orders.queries.list,
    filters === "skip" ? "skip" : (filters ?? {})
  );
  if (data === undefined) return { data: undefined, isLoading: filters !== "skip" };
  return {
    data: data.map(transformToOrderSummary),
    isLoading: false,
  };
}

/**
 * List orders with cursor-based pagination (Load More pattern).
 * Uses Convex usePaginatedQuery with 25 items per page.
 * Only supports single status or no filter (paginate() cannot chain after .filter()).
 * For multi-status category views, use useOrders instead.
 *
 * @param options.status - Optional single status filter
 * @param options.skip - When true, disables the query (returns empty results)
 */
export function useOrdersPaginated(options?: { status?: OrderStatusType; skip?: boolean }) {
  const skip = options?.skip ?? false;
  const status = options?.status;

  const paginatedArgs = skip ? "skip" as const : (status ? { status } : {});
  const countArgs = skip ? "skip" as const : (status ? { status } : {});

  // gap#2 (residual): listPaginated is now a protectedQuery (server strips
  // confidential subscription pricing for non-managers) — subscribe with a session.
  // useSessionPaginatedQuery returns undefined until the session is ready (or in
  // SSR), so fall back to a loading-shaped result.
  const paginated = useSessionPaginatedQuery(
    api.orders.queries.listPaginated,
    paginatedArgs,
    { initialNumItems: 25 }
  );
  const results = paginated?.results ?? [];
  const paginationStatus = paginated?.status ?? "LoadingFirstPage";
  const loadMore = paginated?.loadMore ?? (() => {});
  const isLoading = paginated?.isLoading ?? true;

  // Separate count query for "remaining" display. countOrders returns only a
  // length (no money) so it stays a plain query.
  const totalCount = useQuery(api.orders.queries.countOrders, countArgs);

  const loadedCount = results.length;
  const remainingCount = totalCount !== undefined ? Math.max(0, totalCount - loadedCount) : undefined;

  return {
    orders: results.map(transformToOrderSummary),
    paginationStatus,
    loadMore: () => loadMore(25),
    isLoading,
    totalCount,
    remainingCount,
  };
}

/**
 * Get a single order by ID with items.
 */
export function useOrder(id: Id<"orders"> | undefined) {
  // gap#2: `get` is now a protectedQuery (kitchen/order_staff/manager/admin) so the
  // server can strip confidential subscription pricing — must supply the session.
  const data = useSessionQuery(api.orders.queries.get, id ? { id } : "skip");
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
export function useOrderByNumber(orderNumber: string | undefined) {
  // gap#2: getByOrderNumber is now a protectedQuery — supply the session.
  const data = useSessionQuery(
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
export function useKitchenOrders() {
  // gap#2: getKitchenOrders is now a protectedQuery — supply the session.
  const data = useSessionQuery(api.orders.queries.getKitchenOrders, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data.map(transformToOrderSummary),
    isLoading: false,
  };
}

/**
 * Get orders by customer.
 */
export function useOrdersByCustomer(customerId: Id<"customers"> | undefined) {
  // gap#2 (residual): getByCustomer is now a protectedQuery — supply the session.
  const data = useSessionQuery(
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
export function useProductSuggestions(limit?: number) {
  // gap#2 (residual): getProductSuggestions is now a protectedQuery (server
  // excludes subscription-order items from the pool for non-managers) — supply
  // the session.
  const data = useSessionQuery(api.orders.queries.getProductSuggestions, { limit });
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data.map(transformProductSuggestion),
    isLoading: false,
  };
}

/**
 * Get seller suggestions.
 */
export function useSellerSuggestions() {
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
export function useChannelSuggestions() {
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
export function useWhatsAppMessage(
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
export function useOrderTemplate() {
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
 * Create a minimal Draft order (customer only, no items).
 * Phase 14.1: Auto-creates Draft on customer selection.
 */
export function useCreateDraft() {
  return useMutation(api.orders.mutations.orderCrud.createDraft);
}

/**
 * Update all editable fields on a Draft order.
 * Phase 14.1: Full Draft editing support.
 */
export function useUpdateDraft() {
  return useMutation(api.orders.mutations.orderCrud.updateDraft);
}

/**
 * Create a new order with items.
 */
export function useCreateOrder() {
  const mutation = useMutation(api.orders.mutations.index.create);

  const execute = async (data: OrderCreateInput) => {
    try {
      const id = await mutation(data);
      toast.success("Order created successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create order"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update order status.
 */
export function useUpdateOrderStatus() {
  const mutation = useMutation(api.orders.mutations.index.updateStatus);

  const execute = async (data: { orderId: Id<"orders">; status: "Draft" | "AwaitingPayment" | "PaymentReceived" | "BeingPrepared" | "AwaitingDelivery" | "Complete" | "Cancelled"; skipStockCheck?: boolean; overrideReason?: string; overrideBy?: string; userId?: Id<"users"> }) => {
    try {
      await mutation(data);
      toast.success("Order status updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update status"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update payment status.
 * PRD-0: Uses type-safe PaymentStatusType.
 */
export function useUpdateOrderPayment() {
  const mutation = useMutation(api.orders.mutations.index.updatePayment);

  const execute = async (data: {
    orderId: Id<"orders">;
    paymentStatus: PaymentStatusType;
    paymentMethod?: string;
  }) => {
    try {
      await mutation(data);
      toast.success("Payment status updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update payment"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update shipping info.
 */
export function useUpdateOrderShipping() {
  const mutation = useMutation(api.orders.mutations.index.updateShipping);

  const execute = async (data: {
    orderId: Id<"orders">;
    shippingAgency?: string;
    shippingNumber?: string;
  }) => {
    try {
      await mutation(data);
      toast.success("Shipping info updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update shipping"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update order details (notes, delivery info, etc.).
 */
export function useUpdateOrderDetails() {
  const mutation = useMutation(api.orders.mutations.index.updateDetails);

  const execute = async (data: {
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
      toast.error(getErrorMessage(error, "Failed to update details"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Cancel an order.
 * PRD-7: Enhanced with reason categories for audit trail.
 */
type CancellationCategory = "customer_request" | "out_of_stock" | "payment_issue" | "duplicate" | "other";

export function useCancelOrder() {
  const mutation = useMutation(api.orders.mutations.index.cancel);

  const execute = async (data: { orderId: Id<"orders">; reason?: string; reasonCategory?: CancellationCategory }) => {
    try {
      await mutation(data);
      toast.success("Order cancelled");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to cancel order"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Delete an order (Draft only).
 */
export function useDeleteOrder() {
  const mutation = useMutation(api.orders.mutations.index.remove);

  const execute = async (orderId: Id<"orders">) => {
    try {
      await mutation({ orderId });
      toast.success("Order deleted");
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete order"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Add item to existing order.
 */
export function useAddOrderItem() {
  const mutation = useMutation(api.orders.mutations.index.addItem);

  const execute = async (data: { orderId: Id<"orders">; item: OrderItemInput }) => {
    try {
      const id = await mutation(data);
      toast.success("Item added");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to add item"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Remove item from order.
 */
export function useRemoveOrderItem() {
  const mutation = useMutation(api.orders.mutations.index.removeItem);

  const execute = async (itemId: Id<"orderItems">) => {
    try {
      await mutation({ itemId });
      toast.success("Item removed");
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to remove item"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update order item quantity.
 */
export function useUpdateOrderItemQuantity() {
  const mutation = useMutation(api.orders.mutations.index.updateItemQuantity);

  const execute = async (data: { itemId: Id<"orderItems">; quantity: number }) => {
    try {
      await mutation(data);
      toast.success("Quantity updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update quantity"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Replace all items in an order.
 * Used by the "Edit Order" flow.
 */
export function useReplaceOrderItems() {
  const mutation = useMutation(api.orders.mutations.index.replaceItems);

  const execute = async (data: { orderId: Id<"orders">; items: OrderItemInput[] }) => {
    try {
      await mutation(data);
      toast.success("Order items updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update order items"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update order-level discount.
 * PRD-5: Order System V2 - Wave 1.
 */
export function useUpdateOrderDiscount() {
  const mutation = useMutation(api.orders.mutations.index.updateOrderDiscount);

  const execute = async (data: {
    orderId: Id<"orders">;
    discount: number;
    discountType: "amount" | "percentage";
  }) => {
    try {
      await mutation(data);
      toast.success("Discount updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update discount"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update delivery fee on an order.
 * Pass deliveryFee: 0 to clear the fee.
 */
export function useUpdateOrderDeliveryFee() {
  const mutation = useMutation(api.orders.mutations.index.updateDeliveryFee);

  const execute = async (data: { orderId: Id<"orders">; deliveryFee: number }) => {
    try {
      await mutation(data);
      toast.success("Delivery fee updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update delivery fee"));
      throw error;
    }
  };

  return { mutate: execute };
}

/**
 * Admin/manager: Force-complete a stuck order to Complete+Paid.
 * Uses protectedMutation — auto-injects sessionId, no manual token passing.
 * Roles enforced on backend: admin, manager.
 */
export function useForceComplete() {
  const mutation = useSessionMutation(api.orders.mutations.statusUpdates.forceComplete);

  const execute = async (data: { orderId: Id<"orders">; reason?: string }) => {
    try {
      await mutation(data);
      toast.success("Order force-completed");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to force-complete order"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

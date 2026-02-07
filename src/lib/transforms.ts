import type {
  OrderSummary,
  OrderStatus,
  PaymentStatus,
} from "@/lib/types";

export interface ConvexOrderBase {
  _id: string;
  _creationTime: number;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  awaitingPaymentSince?: number;
  paymentStatus: string;
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
  orderLevelDiscountType?: "amount" | "percentage";
}

export function calculateTotalDiscount(
  totalAmount: number,
  discount?: number,
  discountType?: "amount" | "percentage"
): number {
  if (!discount || !discountType) return 0;
  if (discountType === "percentage") {
    return totalAmount * (discount / 100);
  }
  return discount;
}

export function transformToOrderSummary(order: ConvexOrderBase): OrderSummary {
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
    total_discount: calculateTotalDiscount(
      order.totalAmount,
      order.orderLevelDiscount,
      order.orderLevelDiscountType
    ),
    item_count: order.itemCount,
    delivery_type: order.deliveryType ?? null,
    shipping_agency: order.shippingAgency ?? null,
    created_at: new Date(order._creationTime).toISOString(),
  };
}

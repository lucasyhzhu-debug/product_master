/**
 * Convex hooks for dashboard.
 * These replace the React Query + Axios hooks.
 * Transforms Convex camelCase to frontend snake_case for compatibility.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type {
  OrderStats,
  OrderStatsToday,
  OrderStatsYesterday,
  OrderStatsNeedsAttention,
  OrderStatsPipeline,
  UrgentOrder,
  OrderStatus,
} from "@/lib/types";
import { transformToOrderSummary } from "@/lib/transforms";
import type { ConvexOrderBase } from "@/lib/transforms";

// ============================================
// Transform Functions (Internal)
// ============================================

interface ConvexDashboardSummary {
  todayOrderCount: number;
  todayRevenue: number;
  todayMargin: number;
  yesterdayOrderCount: number;
  yesterdayRevenue: number;
  statusCounts: Record<string, number>;
  activeOrderCount: number;
  pendingPaymentCount: number;
  pendingPaymentAmount: number;
  totalOrders: number;
  totalCustomers: number;
  recipeCount: number;
  packagingCount: number;
  productCount: number;
  ingredientCount: number;
  materialCount: number;
}

function transformUrgentOrder(order: ConvexOrderBase): UrgentOrder {
  const now = Date.now();
  return {
    id: order._id as unknown as number,
    order_number: order.orderNumber,
    customer_name: order.customerName,
    customer_phone: order.customerPhone ?? null,
    item_count: order.itemCount,
    status: order.status as OrderStatus,
    due_date: order.dueDate ? new Date(order.dueDate).toISOString() : null,
    is_overdue: order.dueDate ? order.dueDate < now : false,
    total_amount: order.totalAmount,
  };
}

function transformDashboardStats(
  summary: ConvexDashboardSummary,
  urgentOrders: ConvexOrderBase[]
): OrderStats {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // Transform urgent orders
  const transformedUrgent = urgentOrders.map(transformUrgentOrder);

  // Calculate needs_attention counts
  const overdue = transformedUrgent.filter((o) => o.is_overdue).length;
  const dueToday = transformedUrgent.filter((o) => {
    if (!o.due_date) return false;
    const dueTime = new Date(o.due_date).getTime();
    return dueTime >= todayStart.getTime() && dueTime < todayEnd.getTime();
  }).length;

  // Build today stats
  const today: OrderStatsToday = {
    revenue: summary.todayRevenue,
    order_count: summary.todayOrderCount,
    margin: summary.todayMargin,
    margin_pct:
      summary.todayRevenue > 0
        ? (summary.todayMargin / summary.todayRevenue) * 100
        : 0,
    avg_order_value:
      summary.todayOrderCount > 0
        ? summary.todayRevenue / summary.todayOrderCount
        : 0,
  };

  // Build yesterday stats
  const yesterday: OrderStatsYesterday = {
    revenue: summary.yesterdayRevenue,
    order_count: summary.yesterdayOrderCount,
  };

  // Build needs_attention
  const needs_attention: OrderStatsNeedsAttention = {
    overdue,
    awaiting_payment_long: summary.pendingPaymentCount,
    due_today: dueToday,
  };

  // Build pipeline from status counts
  // Map Convex statuses to expected pipeline keys
  const pipeline: OrderStatsPipeline = {
    confirmed: summary.statusCounts?.["Confirmed"] ?? 0,
    production_complete: summary.statusCounts?.["Production"] ?? 0,
    packaging: 0, // Convex schema may not have this status
    waiting_shipment: summary.statusCounts?.["Shipped"] ?? 0,
    waiting_pickup: summary.statusCounts?.["Ready"] ?? 0,
  };

  return {
    today,
    yesterday,
    needs_attention,
    pipeline,
    urgent_orders: transformedUrgent,
  };
}

// ============================================
// Query Hooks
// ============================================

/**
 * Get dashboard summary statistics (raw).
 */
export function useConvexDashboardSummary() {
  const data = useQuery(api.dashboard.queries.getSummary, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data,
    isLoading: false,
  };
}

/**
 * Get recent orders for dashboard.
 */
export function useConvexRecentOrders() {
  const data = useQuery(api.dashboard.queries.getRecentOrders, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: (data as ConvexOrderBase[]).map(transformToOrderSummary),
    isLoading: false,
  };
}

/**
 * Get orders due soon (next 3 days).
 */
export function useConvexUpcomingDue() {
  const data = useQuery(api.dashboard.queries.getUpcomingDue, {});
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: (data as ConvexOrderBase[]).map(transformUrgentOrder),
    isLoading: false,
  };
}

/**
 * Combined dashboard stats hook that merges summary + urgent orders.
 * Matches the OrderStats type expected by OrderStatsCards component.
 * This is a drop-in replacement for the old useOrderStats() hook.
 */
export function useConvexOrderStats() {
  const summary = useQuery(api.dashboard.queries.getSummary, {});
  const upcomingDue = useQuery(api.dashboard.queries.getUpcomingDue, {});

  // Return loading state if either query is loading
  if (summary === undefined || upcomingDue === undefined) {
    return { data: undefined, isLoading: true };
  }

  // Transform and combine the data
  const stats = transformDashboardStats(
    summary as ConvexDashboardSummary,
    (upcomingDue ?? []) as ConvexOrderBase[]
  );

  return {
    data: stats,
    isLoading: false,
  };
}

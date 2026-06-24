import { query } from "../_generated/server";
import { isSubscriptionOrder } from "../subscriptions/revenueGate";

/**
 * Daily sales summary report.
 * Returns all non-cancelled order items grouped by product name and order date.
 * Includes all channels.
 */
export const getDailySalesSummary = query({
  args: {},
  handler: async (ctx) => {
    // Fetch all orders (excluding Draft and Cancelled)
    const allOrders = await ctx.db.query("orders").collect();
    // C1: subscription orders excluded from channel revenue — see isSubscriptionOrder
    const validOrders = allOrders.filter(
      (o) => o.status !== "Draft" && o.status !== "Cancelled" && !isSubscriptionOrder(o)
    );

    // Build order map for fast lookup (id -> { date, channel })
    const orderMap = new Map<
      string,
      { date: string; channel: string | undefined; orderDate: number }
    >();
    for (const order of validOrders) {
      // Convert orderDate timestamp to YYYY-MM-DD in Asia/Jakarta (UTC+7)
      const d = new Date(order.orderDate + 7 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split("T")[0];
      orderMap.set(order._id, {
        date: dateStr,
        channel: order.channel ?? "unknown",
        orderDate: order.orderDate,
      });
    }

    // Fetch all order items for valid orders
    const allItems = await ctx.db.query("orderItems").collect();
    const validItems = allItems.filter(
      (item) => orderMap.has(item.orderId) && !item.isCancelled
    );

    // Aggregate: { productName -> { date -> totalQuantity } }
    const salesMap: Record<string, Record<string, number>> = {};
    const allDates = new Set<string>();

    for (const item of validItems) {
      const orderInfo = orderMap.get(item.orderId);
      if (!orderInfo) continue;

      const { date } = orderInfo;
      const product = item.productName;

      allDates.add(date);

      if (!salesMap[product]) {
        salesMap[product] = {};
      }
      salesMap[product][date] = (salesMap[product][date] || 0) + item.quantity;
    }

    // Sort dates chronologically
    const sortedDates = Array.from(allDates).sort();

    // Build rows: each product with daily quantities
    const rows: Array<{ product: string; dailySales: Record<string, number>; total: number }> = [];
    for (const [product, dailyMap] of Object.entries(salesMap)) {
      let total = 0;
      const dailySales: Record<string, number> = {};
      for (const date of sortedDates) {
        const qty = dailyMap[date] || 0;
        dailySales[date] = qty;
        total += qty;
      }
      rows.push({ product, dailySales, total });
    }

    // Sort by total descending
    rows.sort((a, b) => b.total - a.total);

    return {
      dates: sortedDates,
      rows,
      orderCount: validOrders.length,
      itemCount: validItems.length,
    };
  },
});

import { query } from "../_generated/server";

/**
 * Get dashboard summary statistics.
 */
export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTimestamp = todayStart.getTime();

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayTimestamp = yesterdayStart.getTime();

    // Get all orders
    const allOrders = await ctx.db.query("orders").collect();

    // Today's orders
    const todayOrders = allOrders.filter(
      (o) => o._creationTime >= todayTimestamp
    );
    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const todayMargin = todayOrders.reduce((sum, o) => sum + o.totalMargin, 0);

    // Yesterday's orders
    const yesterdayOrders = allOrders.filter(
      (o) =>
        o._creationTime >= yesterdayTimestamp &&
        o._creationTime < todayTimestamp
    );
    const yesterdayRevenue = yesterdayOrders.reduce(
      (sum, o) => sum + o.totalAmount,
      0
    );

    // Orders by status (pipeline)
    const statusCounts: Record<string, number> = {};
    for (const order of allOrders) {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    }

    // Active orders (not completed/cancelled)
    // Phase 14 statuses: Draft, AwaitingPayment, PaymentReceived, BeingPrepared, AwaitingDelivery, Complete, Cancelled
    const terminalStatuses = ["Complete", "Cancelled"];
    const activeOrders = allOrders.filter(
      (o) => !terminalStatuses.includes(o.status)
    );

    // Pending payment
    const pendingPayment = allOrders.filter(
      (o) => o.paymentStatus === "Unpaid" && o.status !== "Cancelled"
    );
    const pendingPaymentAmount = pendingPayment.reduce(
      (sum, o) => sum + o.totalAmount,
      0
    );

    // OPTIMIZED: Count entities in parallel (6 small tables)
    const [recipes, packaging, products, ingredients, materials, customers] = await Promise.all([
      ctx.db.query("recipes").collect(),
      ctx.db.query("packagingRecipes").collect(),
      ctx.db.query("products").collect(),
      ctx.db.query("ingredients").collect(),
      ctx.db.query("packagingMaterials").collect(),
      ctx.db.query("customers").collect(),
    ]);

    return {
      // Today stats
      todayOrderCount: todayOrders.length,
      todayRevenue,
      todayMargin,

      // Comparison
      yesterdayOrderCount: yesterdayOrders.length,
      yesterdayRevenue,

      // Pipeline
      statusCounts,
      activeOrderCount: activeOrders.length,

      // Payment
      pendingPaymentCount: pendingPayment.length,
      pendingPaymentAmount,

      // Totals
      totalOrders: allOrders.length,
      totalCustomers: customers.length,

      // Entity counts
      recipeCount: recipes.length,
      packagingCount: packaging.length,
      productCount: products.length,
      ingredientCount: ingredients.length,
      materialCount: materials.length,
    };
  },
});

/**
 * Get recent orders for dashboard.
 */
export const getRecentOrders = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").order("desc").take(10);

    return Promise.all(
      orders.map(async (order) => {
        const customer = await ctx.db.get(order.customerId);
        return {
          ...order,
          customerName: customer?.name ?? order.customerName,
        };
      })
    );
  },
});

/**
 * Get orders due soon (next 3 days).
 */
export const getUpcomingDue = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;

    // OPTIMIZED: Fetch only non-terminal status orders using parallel indexed queries
    const nonTerminalStatuses = [
      "Draft", "AwaitingPayment", "PaymentReceived",
      "BeingPrepared", "AwaitingDelivery",
    ] as const;

    const statusResults = await Promise.all(
      nonTerminalStatuses.map((status) =>
        ctx.db.query("orders")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect()
      )
    );

    const activeOrders = statusResults.flat();

    // Filter by dueDate range in memory (acceptable since active orders are ~50-100)
    const upcoming = activeOrders
      .filter((o) => {
        if (!o.dueDate) return false;
        return o.dueDate >= now && o.dueDate <= threeDaysFromNow;
      })
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));

    return upcoming.slice(0, 10);
  },
});

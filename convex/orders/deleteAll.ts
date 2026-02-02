/**
 * Delete All Orders & Customers Script
 *
 * WARNING: This will delete ALL orders, customers, and kitchen inventory
 * from the current deployment. This action CANNOT be undone.
 *
 * Usage:
 * 1. Switch to production: npm run env:prod
 * 2. Open Convex dashboard: npx convex dashboard
 * 3. Go to Functions tab
 * 4. Run: orders/deleteAll:deleteAllOrders
 */

import { mutation } from "../_generated/server";

export const deleteAllOrders = mutation({
  args: {},
  handler: async (ctx) => {
    console.log("🗑️ Starting deletion of all orders, customers, and kitchen data...");

    // Step 1: Delete kitchen inventory (tray balls)
    const kitchenInventory = await ctx.db.query("kitchenInventory").collect();
    let deletedKitchenInventory = 0;
    for (const inv of kitchenInventory) {
      await ctx.db.delete(inv._id);
      deletedKitchenInventory++;
    }
    console.log(`✅ Deleted ${deletedKitchenInventory} kitchen inventory records`);

    // Step 2: Delete all order item production records
    const orderItemProduction = await ctx.db.query("orderItemProduction").collect();
    let deletedProductionRecords = 0;
    for (const record of orderItemProduction) {
      await ctx.db.delete(record._id);
      deletedProductionRecords++;
    }
    console.log(`✅ Deleted ${deletedProductionRecords} order item production records`);

    // Step 3: Delete all order items
    const orderItems = await ctx.db.query("orderItems").collect();
    let deletedOrderItems = 0;
    for (const item of orderItems) {
      await ctx.db.delete(item._id);
      deletedOrderItems++;
    }
    console.log(`✅ Deleted ${deletedOrderItems} order items`);

    // Step 4: Delete all orders
    const orders = await ctx.db.query("orders").collect();
    let deletedOrders = 0;
    for (const order of orders) {
      await ctx.db.delete(order._id);
      deletedOrders++;
    }
    console.log(`✅ Deleted ${deletedOrders} orders`);

    // Step 5: Delete all customers
    const customers = await ctx.db.query("customers").collect();
    let deletedCustomers = 0;
    for (const customer of customers) {
      await ctx.db.delete(customer._id);
      deletedCustomers++;
    }
    console.log(`✅ Deleted ${deletedCustomers} customers`);

    const summary = {
      deletedOrders,
      deletedOrderItems,
      deletedProductionRecords,
      deletedKitchenInventory,
      deletedCustomers,
      timestamp: new Date().toISOString(),
      message: "All orders, customers, and kitchen data successfully deleted",
    };

    console.log("🎉 Deletion complete!", summary);
    return summary;
  },
});

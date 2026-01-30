import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

// ============================================
// WhatsApp Template Generators
// ============================================

interface OrderWithItems extends Doc<"orders"> {
  items: Doc<"orderItems">[];
  customer: Doc<"customers"> | null;
}

function formatCurrency(amount: number): string {
  return `IDR ${amount.toLocaleString("id-ID")}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  };
  return date.toLocaleDateString("id-ID", options);
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return date.toLocaleDateString("id-ID", options);
}

// ============================================
// Template Functions
// ============================================

/**
 * Generate WhatsApp payment request for Draft → Confirmed transition.
 */
function generatePaymentRequest(order: OrderWithItems): string {
  const customerName = order.customer?.name ?? order.customerName;

  // Items summary
  const itemsLines = order.items.map((item) => {
    const priceK = item.unitPrice / 1000;
    let desc = item.productName;
    if (item.productVariant) {
      desc += ` (${item.productVariant})`;
    }
    return `• ${item.quantity}x ${desc} @ ${priceK.toFixed(0)}k`;
  });

  const itemsText = itemsLines.join("\n");
  const totalFormatted = formatCurrency(order.totalAmount);
  const dueDateStr = order.dueDate ? formatDate(order.dueDate) : "";

  // Delivery info
  let deliveryInfo = "";
  if (order.deliveryType === "Pickup") {
    const location = order.pickupLocation || "Goldfinch Legato";
    deliveryInfo = `📍 Pickup at: ${location}`;
  } else if (order.deliveryType === "Delivery" && order.deliveryAddress) {
    deliveryInfo = `📍 Delivery to: ${order.deliveryAddress}`;
  }

  return `Halo ${customerName}! 👋

Terima kasih sudah order di Malo! 🙏

*Order #${order.orderNumber}*
${itemsText}
────────────
*Total: ${totalFormatted}*

${deliveryInfo}
📅 Target: ${dueDateStr}

Silakan transfer ke:
*BCA*
*PT Malo Group Bahagia*
*6044830994*

Setelah transfer, mohon kirim bukti pembayaran ya.

Terima kasih! 🙏`;
}

/**
 * Generate WhatsApp notification when production starts.
 */
function generateProductionStarted(order: OrderWithItems): string {
  const customerName = order.customer?.name ?? order.customerName;

  return `Halo ${customerName}! 👋

Order kamu #${order.orderNumber} sudah mulai diproses! 🍳

Kami akan kabari lagi kalau sudah siap ya.

Terima kasih sudah sabar menunggu! 🙏`;
}

/**
 * Generate WhatsApp notification when delivery is complete.
 */
function generateDeliveryComplete(order: OrderWithItems): string {
  const customerName = order.customer?.name ?? order.customerName;

  return `Halo ${customerName}! 👋

Order #${order.orderNumber} sudah sampai ya! 📦✅

Semoga suka dengan pesanannya! 😊

Jangan lupa kasih review atau feedback ya, sangat membantu kami untuk terus berkembang.

Terima kasih sudah order di Malo! 🙏
Sampai jumpa di order berikutnya! 👋`;
}

/**
 * Generate general order receipt.
 */
function generateReceipt(order: OrderWithItems): string {
  const customerName = order.customer?.name ?? order.customerName;

  const statusEmoji: Record<string, string> = {
    Draft: "[Draft]",
    AwaitingPayment: "[Payment]",
    Confirmed: "[Confirmed]",
    Production: "[Cooking]",
    Ready: "[Ready]",
    Shipped: "[Shipped]",
    Delivered: "[Delivered]",
    Complete: "[Done]",
    Cancelled: "[Cancelled]",
  };

  const header = `${statusEmoji[order.status] || "[Order]"} *Order ${order.orderNumber}*`;

  // Customer Line
  let customerLine = `Customer: ${customerName}`;
  if (order.channel) {
    customerLine += ` (${order.channel})`;
  }

  // Items
  const itemsLines = order.items.map((item) => {
    const priceK = item.unitPrice / 1000;
    let desc = item.productName;
    if (item.productVariant) {
      desc += ` (${item.productVariant})`;
    }

    let line = `- ${item.quantity}x ${desc}`;
    if (item.quantity > 1) {
      line += ` @ ${priceK.toFixed(0)}k`;
    }
    return line;
  });

  const itemsText = itemsLines.join("\n");
  const totalFormatted = formatCurrency(order.totalAmount);

  // Payment info
  let paymentInfo = `Payment: ${order.paymentStatus}`;
  if (order.paymentMethod) {
    paymentInfo += ` (${order.paymentMethod})`;
  }

  // Delivery / Pickup
  let deliveryLine = `Type: ${order.deliveryType}`;
  if (order.deliveryType === "Pickup" && order.pickupLocation) {
    deliveryLine += ` @ ${order.pickupLocation}`;
  } else if (order.deliveryType === "Delivery" && order.deliveryAddress) {
    deliveryLine += `\nAddress: ${order.deliveryAddress}`;
  }

  if (order.shippingAgency) {
    deliveryLine += `\nShipping: ${order.shippingAgency}`;
    if (order.shippingNumber) {
      deliveryLine += ` (${order.shippingNumber})`;
    }
  }

  // Due Date
  const dueDateLine = order.dueDate ? `\nDue: ${formatDateTime(order.dueDate)}` : "";

  // Notes
  const notesSection = order.notes ? `\n\nNotes:\n${order.notes}` : "";

  const footer = `
Please transfer to:
BCA
PT Malo Group Bahagia
6044830994`;

  return `${header}

${customerLine}
${itemsText}
----------------
*Total: ${totalFormatted}*

${paymentInfo}
${deliveryLine}${dueDateLine}${notesSection}
${footer}`;
}

/**
 * Generate shipping confirmation message.
 */
function generateShippingConfirmation(order: OrderWithItems): string {
  const customerName = order.customer?.name ?? order.customerName;

  return `Halo ${customerName}!

Your order ${order.orderNumber} is on the way!

Tracking: ${order.shippingNumber || "-"}
Via: ${order.shippingAgency || "-"}

${order.deliveryAddress || ""}

Thank you for ordering!`;
}

/**
 * Generate pickup ready message.
 */
function generatePickupReady(order: OrderWithItems): string {
  const customerName = order.customer?.name ?? order.customerName;
  const location = order.pickupLocation || "Goldfinch Legato";

  return `Halo ${customerName}!

Your order ${order.orderNumber} is ready for pickup!

Location: ${location}

See you soon!`;
}

// ============================================
// Query Endpoints
// ============================================

/**
 * Get WhatsApp message for an order.
 */
export const getMessage = query({
  args: {
    orderId: v.id("orders"),
    template: v.union(
      v.literal("payment_request"),
      v.literal("production_started"),
      v.literal("delivery_complete"),
      v.literal("receipt"),
      v.literal("shipping"),
      v.literal("pickup_ready")
    ),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const customer = await ctx.db.get(order.customerId);

    const orderWithItems: OrderWithItems = {
      ...order,
      items,
      customer,
    };

    switch (args.template) {
      case "payment_request":
        return generatePaymentRequest(orderWithItems);
      case "production_started":
        return generateProductionStarted(orderWithItems);
      case "delivery_complete":
        return generateDeliveryComplete(orderWithItems);
      case "receipt":
        return generateReceipt(orderWithItems);
      case "shipping":
        return generateShippingConfirmation(orderWithItems);
      case "pickup_ready":
        return generatePickupReady(orderWithItems);
      default:
        throw new Error("Unknown template");
    }
  },
});

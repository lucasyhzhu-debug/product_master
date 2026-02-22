import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { OrderWithItems } from "./types";

// Mirrors the same prefix regex in helpers.ts — used for smart delivery info detection
const PICKUP_PREFIX_RE = /^pick up:\s*/i;

// ============================================
// Template Variable Substitution
// ============================================

/**
 * Replace template variables with actual values.
 */
function renderTemplate(
  templateString: string,
  variables: Record<string, string>
): string {
  let result = templateString;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
  }
  return result;
}

/**
 * Build variables object from order data for template rendering.
 */
function buildTemplateVariables(
  order: OrderWithItems,
  template: TemplateType
): Record<string, string> {
  const customerName = order.customer?.name ?? order.customerName;
  const dueDateStr = order.dueDate ? formatDate(order.dueDate) : "";

  // Items summary
  const itemsLines = order.items.map((item) => {
    const priceK = item.unitPrice / 1000;
    let desc = item.productName;
    if (item.productVariant && !item.productName.includes(item.productVariant)) {
      desc += ` (${item.productVariant})`;
    }
    return `• ${item.quantity}x ${desc} @ ${priceK.toFixed(0)}k`;
  });
  const itemsText = itemsLines.join("\n");

  // Calculate discount note - unified format (no voucher code shown)
  let discountNote = "";
  if (order.voucherDiscountValue && order.voucherDiscountValue > 0) {
    // Voucher discount - show amount only, not code
    discountNote = `\n(Includes ${formatCurrency(order.voucherDiscountValue)} discount!)`;
  } else if (order.orderLevelDiscount && order.orderLevelDiscountType) {
    // Manual discount - show calculated amount
    const discountAmount =
      order.orderLevelDiscountType === "percentage"
        ? order.totalAmount * (order.orderLevelDiscount / 100)
        : order.orderLevelDiscount;
    discountNote = `\n(Includes ${formatCurrency(discountAmount)} discount!)`;
  }

  const finalTotal = order.finalTotal ?? order.totalAmount;
  const finalTotalFormatted = formatCurrency(finalTotal);

  const deliveryFeeFormatted = order.deliveryFee && order.deliveryFee > 0
    ? formatCurrency(order.deliveryFee)
    : "";

  // Delivery info
  // Address content is the source of truth. If deliveryAddress is set and is NOT a pickup prefix,
  // treat as delivery regardless of the deliveryType field (which may be stale).
  let deliveryInfo = "";
  const isPickupAddress = order.deliveryAddress ? PICKUP_PREFIX_RE.test(order.deliveryAddress) : false;
  if (order.deliveryAddress && !isPickupAddress) {
    // Real delivery address — always show delivery info
    deliveryInfo = `📍 Delivery to: ${order.deliveryAddress}`;
  } else if (isPickupAddress || order.deliveryType === "Pickup") {
    // Either address has pickup prefix OR no delivery address and type is Pickup
    const location = order.pickupLocation || (order.deliveryAddress ? order.deliveryAddress.replace(PICKUP_PREFIX_RE, "").trim() : "") || "Legato Gelato - Goldfinch";
    deliveryInfo = `📍 Pickup at: ${location}`;
  }

  // Payment info
  let paymentInfo = `Payment: ${order.paymentStatus}`;
  if (order.paymentMethod) {
    paymentInfo += ` (${order.paymentMethod})`;
  }

  // Status label
  const statusEmoji: Record<string, string> = {
    Draft: "[Draft]",
    AwaitingPayment: "[Payment]",
    PaymentReceived: "[Confirmed]",
    BeingPrepared: "[Cooking]",
    AwaitingDelivery: "[Ready]",
    Complete: "[Complete]",
    Cancelled: "[Cancelled]",
  };
  const statusLabel = statusEmoji[order.status] || "[Order]";

  // Channel suffix
  const channelSuffix = order.channel ? ` (${order.channel})` : "";

  // Due date line
  const dueDateLine = order.dueDate ? `\nDue: ${formatDateTime(order.dueDate)}` : "";

  // Notes section
  const notesSection = order.notes ? `\n\nNotes:\n${order.notes}` : "";

  // Delivery line for receipt
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

  return {
    "{customer_name}": customerName,
    "{order_number}": order.orderNumber,
    "{items_list}": itemsText,
    "{total_amount}": finalTotalFormatted,
    "{delivery_info}": template === "receipt" ? deliveryLine : deliveryInfo,
    "{due_date}": dueDateStr,
    "{discount_note}": discountNote,
    "{payment_info}": paymentInfo,
    "{notes_section}": notesSection,
    "{status_label}": statusLabel,
    "{channel_suffix}": channelSuffix,
    "{due_date_line}": dueDateLine,
    "{shipping_number}": order.shippingNumber || "-",
    "{shipping_agency}": order.shippingAgency || "-",
    "{delivery_address}": order.deliveryAddress || "",
    "{pickup_location}": order.pickupLocation || "Legato Gelato - Goldfinch",
    "{delivery_fee}": deliveryFeeFormatted,
  };
}

/**
 * Fetch template from database, with fallback to hardcoded defaults.
 */
async function getTemplateContent(
  ctx: QueryCtx,
  templateCode: string,
  language: "id" | "en" = "id"
): Promise<string | null> {
  const template = await ctx.db
    .query("whatsappTemplates")
    .withIndex("by_code", (q) => q.eq("code", templateCode))
    .first();

  if (template) {
    return language === "en" ? template.templateEn : template.templateId;
  }

  return null;
}

function formatCurrency(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
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
    timeZone: "Asia/Jakarta",
  };
  return date.toLocaleDateString("id-ID", options);
}

// ============================================
// Template Types
// ============================================

type TemplateType =
  | "payment_request"
  | "production_started"
  | "delivery_complete"
  | "receipt"
  | "shipping"
  | "pickup_ready";

// ============================================
// Consolidated Template Generator
// ============================================

/**
 * Generate WhatsApp message template based on type.
 * Consolidates all template generation logic into a single parameterized function.
 */
function generateTemplate(order: OrderWithItems, template: TemplateType): string {
  switch (template) {
    case "payment_request":
      return generatePaymentRequest(order);
    case "production_started":
      return generateProductionStarted(order);
    case "delivery_complete":
      return generateDeliveryComplete(order);
    case "receipt":
      return generateReceipt(order);
    case "shipping":
      return generateShippingConfirmation(order);
    case "pickup_ready":
      return generatePickupReady(order);
    default:
      throw new Error(`Unknown template type: ${template}`);
  }
}

// ============================================
// Template Functions (Internal)
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
    if (item.productVariant && !item.productName.includes(item.productVariant)) {
      desc += ` (${item.productVariant})`;
    }
    return `• ${item.quantity}x ${desc} @ ${priceK.toFixed(0)}k`;
  });

  const itemsText = itemsLines.join("\n");
  const dueDateStr = order.dueDate ? formatDate(order.dueDate) : "";

  // Calculate discount note - unified format (no voucher code shown)
  let discountNote = "";
  if (order.voucherDiscountValue && order.voucherDiscountValue > 0) {
    discountNote = `(Includes ${formatCurrency(order.voucherDiscountValue)} discount!)`;
  } else if (order.orderLevelDiscount && order.orderLevelDiscountType) {
    const discountAmount = order.orderLevelDiscountType === "percentage"
      ? order.totalAmount * (order.orderLevelDiscount / 100)
      : order.orderLevelDiscount;
    discountNote = `(Includes ${formatCurrency(discountAmount)} discount!)`;
  }

  const finalTotal = order.finalTotal ?? order.totalAmount;
  const finalTotalFormatted = formatCurrency(finalTotal);

  // Delivery fee line
  const deliveryFeeLine = order.deliveryFee && order.deliveryFee > 0
    ? `🚚 Ongkir: ${formatCurrency(order.deliveryFee)}\n`
    : "";

  // Delivery info
  // Address content is the source of truth. If deliveryAddress is set and is NOT a pickup prefix,
  // treat as delivery regardless of the deliveryType field (which may be stale).
  let deliveryInfo = "";
  const isPickupAddress = order.deliveryAddress ? PICKUP_PREFIX_RE.test(order.deliveryAddress) : false;
  if (order.deliveryAddress && !isPickupAddress) {
    // Real delivery address — always show delivery info
    deliveryInfo = `📍 Delivery to: ${order.deliveryAddress}`;
  } else if (isPickupAddress || order.deliveryType === "Pickup") {
    // Either address has pickup prefix OR no delivery address and type is Pickup
    const location = order.pickupLocation || (order.deliveryAddress ? order.deliveryAddress.replace(PICKUP_PREFIX_RE, "").trim() : "") || "Legato Gelato - Goldfinch";
    deliveryInfo = `📍 Pickup at: ${location}`;
  }

  return `Halo ${customerName}! 👋

Terima kasih sudah order di Frollie! 🙏

*Order #${order.orderNumber}*
${itemsText}
────────────
${deliveryFeeLine}*Total: ${finalTotalFormatted}*${discountNote ? `\n${discountNote}` : ""}
${deliveryInfo}
📅 Target: ${dueDateStr}

Silakan transfer ke:
*BCA*
*PT Malo Group Bahagia*
*6044830994*
*Nominal: ${finalTotalFormatted}*

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

Terima kasih sudah order di Frollie! 🙏
Sampai jumpa di order berikutnya! 👋`;
}

/**
 * Generate general order receipt.
 */
function generateReceipt(order: OrderWithItems): string {
  const customerName = order.customer?.name ?? order.customerName;

  // Status labels matching Phase 14 schema
  const statusEmoji: Record<string, string> = {
    Draft: "[Draft]",
    AwaitingPayment: "[Payment]",
    PaymentReceived: "[Confirmed]",
    BeingPrepared: "[Cooking]",
    AwaitingDelivery: "[Ready]",
    Complete: "[Complete]",
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
    if (item.productVariant && !item.productName.includes(item.productVariant)) {
      desc += ` (${item.productVariant})`;
    }

    let line = `- ${item.quantity}x ${desc}`;
    if (item.quantity > 1) {
      line += ` @ ${priceK.toFixed(0)}k`;
    }
    return line;
  });

  const itemsText = itemsLines.join("\n");

  // Calculate discount note - unified format (no voucher code shown)
  let discountNote = "";
  if (order.voucherDiscountValue && order.voucherDiscountValue > 0) {
    discountNote = `(Includes ${formatCurrency(order.voucherDiscountValue)} discount!)`;
  } else if (order.orderLevelDiscount && order.orderLevelDiscountType) {
    const discountAmount = order.orderLevelDiscountType === "percentage"
      ? order.totalAmount * (order.orderLevelDiscount / 100)
      : order.orderLevelDiscount;
    discountNote = `(Includes ${formatCurrency(discountAmount)} discount!)`;
  }

  const finalTotal = order.finalTotal ?? order.totalAmount;
  const finalTotalFormatted = formatCurrency(finalTotal);

  // Delivery fee line for receipt
  const deliveryFeeLine = order.deliveryFee && order.deliveryFee > 0
    ? `\n🚚 Ongkir: ${formatCurrency(order.deliveryFee)}`
    : "";

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
${deliveryFeeLine ? deliveryFeeLine.trimStart() + '\n' : ''}*Total: ${finalTotalFormatted}*${discountNote ? `\n${discountNote}` : ""}

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
  const location = order.pickupLocation || "Legato Gelato - Goldfinch";

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
 * Fetches template from database first, falls back to hardcoded if not found.
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
    language: v.optional(v.union(v.literal("id"), v.literal("en"))),
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

    // Try to get template from database
    const dbTemplate = await getTemplateContent(
      ctx,
      args.template,
      args.language ?? "id"
    );

    if (dbTemplate) {
      // Use DB template with variable substitution
      const variables = buildTemplateVariables(orderWithItems, args.template);
      return renderTemplate(dbTemplate, variables);
    }

    // Fallback to hardcoded template generators
    return generateTemplate(orderWithItems, args.template);
  },
});

// ============================================
// PRD-0: Order Template for Customer Fill-in
// ============================================

/**
 * Get clean order template for customer to fill in quantities.
 * Uses POS slots (1-4) for product ordering, NOT the deprecated isFixed field.
 * This template is DYNAMICALLY generated from menuProducts - it is NOT editable
 * via the WhatsApp Template Manager because it must reflect live pricing.
 */
export const getOrderTemplate = query({
  args: {},
  handler: async (ctx) => {
    // Get all products with POS slots (1-4), sorted by slot
    const products = await ctx.db
      .query("menuProducts")
      .collect();

    // Filter to products with posSlot and sort by slot number
    const posProducts = products
      .filter((p) => p.posSlot !== undefined && p.isActive)
      .sort((a, b) => (a.posSlot ?? 0) - (b.posSlot ?? 0));

    // BOM-01: Fetch all menuProductComponents for BOM-derived production unit counts
    const allComponents = await ctx.db.query("menuProductComponents").collect();
    const allComponentTypes = await ctx.db.query("componentTypes").collect();
    const componentTypeMap = new Map(allComponentTypes.map(ct => [ct._id.toString(), ct]));

    // Build BOM production unit count per menu product
    const bomProductionUnitsMap = new Map<string, number>();
    for (const comp of allComponents) {
      const ct = componentTypeMap.get(comp.componentTypeId.toString());
      if (ct && ct.category === "production") {
        const key = comp.menuProductId.toString();
        bomProductionUnitsMap.set(key, (bomProductionUnitsMap.get(key) ?? 0) + comp.quantity);
      }
    }

    // Build template
    let template = "Halo! Mau pesan Dubai Chewy Cookie yang mana nih?\n\n";

    posProducts.forEach((p, i) => {
      // Format price
      const priceK = (p.defaultPrice / 1000).toFixed(0);

      // Derive production units from BOM
      const bomUnits = bomProductionUnitsMap.get(p._id.toString());
      const productionUnits = bomUnits ?? 1;

      // Only append grammage if name doesn't already contain it
      const nameAlreadyHasGrams = p.name.includes(`${p.grams}g`);
      let displayName = p.name;
      if (!nameAlreadyHasGrams) {
        let gramsDesc = `${p.grams}g`;
        if (productionUnits > 1) {
          const perUnit = p.grams / productionUnits;
          gramsDesc = `${p.grams}g = ${productionUnits}x${perUnit}g`;
        }
        displayName = `${p.name} (${gramsDesc})`;
      }

      template += `${i + 1}. ${displayName} - Rp ${priceK}.000 [  ]\n`;
    });

    template += `
---
Untuk customer baru:
No. WA:
Nama:
Alamat:

Isi jumlah yang diinginkan di dalam [ ]`;

    return template;
  },
});

// ============================================
// PRD-0: Message Tracking & Deduplication
// ============================================

/**
 * Mark a WhatsApp message as sent with deduplication.
 * Returns { alreadySent: true } if same template sent within 5 minutes.
 */
export const markMessageSent = mutation({
  args: {
    orderId: v.id("orders"),
    template: v.string(),
    sentBy: v.string(),
    messageContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for recent duplicate (within last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const recentMessages = await ctx.db
      .query("orderMessages")
      .withIndex("by_order_template", (q) =>
        q.eq("orderId", args.orderId).eq("template", args.template)
      )
      .collect();

    // Filter to messages within 5 minutes
    const recentDuplicate = recentMessages.find((m) => m.sentAt >= fiveMinutesAgo);

    if (recentDuplicate) {
      return {
        alreadySent: true,
        lastSentAt: recentDuplicate.sentAt,
        lastSentBy: recentDuplicate.sentBy,
      };
    }

    // Create unique hash for this message
    const messageHash = `${args.orderId}_${args.template}_${Date.now().toString(36)}`;

    // Insert new message record
    await ctx.db.insert("orderMessages", {
      orderId: args.orderId,
      template: args.template,
      messageHash,
      sentAt: Date.now(),
      sentBy: args.sentBy,
      messagePreview: args.messageContent?.slice(0, 100),
    });

    return { alreadySent: false };
  },
});

/**
 * Get message history for an order.
 */
export const getMessageHistory = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("orderMessages")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Sort by sentAt descending (most recent first)
    return messages.sort((a, b) => b.sentAt - a.sentAt);
  },
});

/**
 * Pure helper functions for WhatsApp message formatting.
 * Extracted for testability - no database dependencies.
 */

// ============================================
// Formatting Functions
// ============================================

/**
 * Format a number as Indonesian Rupiah currency.
 * @param amount - The amount to format
 * @returns Formatted string like "Rp 50.000"
 */
export function formatCurrency(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

/**
 * Format a timestamp as Indonesian date string.
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date like "31 Jan 2024"
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  };
  return date.toLocaleDateString("id-ID", options);
}

/**
 * Format a timestamp as Indonesian date and time string.
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date/time like "31 Jan 2024 14.30"
 */
export function formatDateTime(timestamp: number): string {
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
// Item Formatting Functions
// ============================================

export interface OrderItemFormatting {
  productName: string;
  productVariant?: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Format a single order item for display.
 * @param item - The order item to format
 * @returns Formatted string like "2x Keripik Singkong (Original) @ 25k"
 */
export function formatOrderItem(item: OrderItemFormatting): string {
  const priceK = item.unitPrice / 1000;
  let desc = item.productName;
  if (item.productVariant) {
    desc += ` (${item.productVariant})`;
  }
  return `${item.quantity}x ${desc} @ ${priceK.toFixed(0)}k`;
}

/**
 * Format order items as bullet list.
 * @param items - Array of order items
 * @returns Formatted string with bullet points
 */
export function formatOrderItemsList(items: OrderItemFormatting[]): string {
  return items.map((item) => `\u2022 ${formatOrderItem(item)}`).join("\n");
}

// ============================================
// Delivery Info Formatting
// ============================================

export interface DeliveryInfo {
  deliveryType?: string;
  pickupLocation?: string;
  deliveryAddress?: string;
}

/**
 * Format delivery information for WhatsApp message.
 * @param info - Delivery information object
 * @returns Formatted delivery string or empty string
 */
export function formatDeliveryInfo(info: DeliveryInfo): string {
  if (info.deliveryType === "Pickup") {
    const location = info.pickupLocation || "Legato Gelato - Goldfinch";
    return `Pickup at: ${location}`;
  } else if (info.deliveryType === "Delivery" && info.deliveryAddress) {
    return `Delivery to: ${info.deliveryAddress}`;
  }
  return "";
}

// ============================================
// Status Emoji Mapping
// ============================================

// Status labels matching Phase 14 schema
const STATUS_LABELS: Record<string, string> = {
  Draft: "[Draft]",
  AwaitingPayment: "[Payment]",
  PaymentReceived: "[Confirmed]",
  BeingPrepared: "[Cooking]",
  AwaitingDelivery: "[Ready]",
  Complete: "[Complete]",
  Cancelled: "[Cancelled]",
};

/**
 * Get the label/emoji for an order status.
 * @param status - Order status string
 * @returns Status label like "[Cooking]"
 */
export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || "[Order]";
}

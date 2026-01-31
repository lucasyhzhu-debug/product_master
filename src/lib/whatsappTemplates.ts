/**
 * WhatsApp template generation for order workflow stages.
 * Frontend implementation for instant preview and language switching.
 */

import type { OrderDetail, WhatsAppTemplateTab, WhatsAppLanguage } from './types';

// ============================================
// Formatting Functions (ported from whatsappHelpers.ts)
// ============================================

/**
 * Format a number as Indonesian Rupiah currency.
 */
export function formatCurrency(amount: number): string {
  return `IDR ${amount.toLocaleString('id-ID')}`;
}

/**
 * Format a timestamp as Indonesian date string.
 */
export function formatDate(timestamp: string | number | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };
  return date.toLocaleDateString('id-ID', options);
}

/**
 * Format a single order item for display.
 */
export function formatOrderItem(item: {
  product_name: string;
  product_variant: string | null;
  quantity: number;
  unit_price: number;
}): string {
  const priceK = item.unit_price / 1000;
  let desc = item.product_name;
  if (item.product_variant) {
    desc += ` (${item.product_variant})`;
  }
  return `${item.quantity}x ${desc} @ ${priceK.toFixed(0)}k`;
}

/**
 * Format order items as bullet list.
 */
export function formatOrderItemsList(items: OrderDetail['items']): string {
  return items.map((item) => `• ${formatOrderItem(item)}`).join('\n');
}

/**
 * Format delivery information for WhatsApp message.
 */
export function formatDeliveryInfo(
  deliveryType: string,
  pickupLocation: string | null,
  deliveryAddress: string | null,
  language: WhatsAppLanguage
): string {
  if (deliveryType === 'Pickup') {
    const location = pickupLocation || 'Goldfinch Legato';
    return language === 'id' ? `📍 Pickup di: ${location}` : `📍 Pickup at: ${location}`;
  } else if (deliveryType === 'Delivery' && deliveryAddress) {
    return language === 'id' ? `📍 Kirim ke: ${deliveryAddress}` : `📍 Deliver to: ${deliveryAddress}`;
  }
  return '';
}

// ============================================
// Template Definitions
// ============================================

interface TemplateStrings {
  id: string;
  en: string;
}

const TEMPLATES: Record<string, TemplateStrings> = {
  order_confirmation: {
    id: `Halo {customer_name}! 👋

Terima kasih sudah order di Malo! 🙏

*Order #{order_number}*
{items_list}
────────────
*Total: {total_amount}*

{delivery_info}
{due_date_line}

Silakan transfer ke:
*BCA*
*PT Malo Group Bahagia*
*6044830994*

Setelah transfer, mohon kirim bukti pembayaran ya.

Terima kasih! 🙏`,
    en: `Hi {customer_name}! 👋

Thank you for ordering from Malo! 🙏

*Order #{order_number}*
{items_list}
────────────
*Total: {total_amount}*

{delivery_info}
{due_date_line}

Please transfer to:
*BCA*
*PT Malo Group Bahagia*
*6044830994*

After payment, please send proof of transfer.

Thank you! 🙏`,
  },

  payment_received: {
    id: `Halo {customer_name}! 👋

Pembayaran untuk Order #{order_number} sudah kami terima! ✅

Pesanan kamu akan segera kami proses.

{delivery_info}
{due_date_line}

Kami akan kabari kalau sudah siap ya.

Terima kasih! 🙏`,
    en: `Hi {customer_name}! 👋

We've received your payment for Order #{order_number}! ✅

Your order will be processed shortly.

{delivery_info}
{due_date_line}

We'll notify you when it's ready.

Thank you! 🙏`,
  },

  delivery_shipping: {
    id: `Halo {customer_name}! 👋

Order #{order_number} sudah dikirim! 📦

*Informasi Pengiriman:*
Kurir: {shipping_agency}
No. Resi: {shipping_number}

Alamat: {delivery_address}

Silakan pantau status pengiriman ya.

Terima kasih sudah order di Malo! 🙏`,
    en: `Hi {customer_name}! 👋

Your Order #{order_number} is on its way! 📦

*Shipping Information:*
Courier: {shipping_agency}
Tracking: {shipping_number}

Address: {delivery_address}

Please track your delivery status.

Thank you for ordering from Malo! 🙏`,
  },

  delivery_pickup: {
    id: `Halo {customer_name}! 👋

Order #{order_number} sudah siap diambil! 📦✅

📍 Lokasi: {pickup_location}

Ditunggu kedatangannya ya!

Terima kasih! 🙏`,
    en: `Hi {customer_name}! 👋

Your Order #{order_number} is ready for pickup! 📦✅

📍 Location: {pickup_location}

We look forward to seeing you!

Thank you! 🙏`,
  },

  thank_you: {
    id: `Halo {customer_name}! 👋

Order #{order_number} sudah sampai ya! 🎉

Semoga suka dengan pesanannya! 😊

Yuk follow kami di:
📸 IG: https://instagram.com/Frollie.id
🎵 TikTok: https://tiktok.com/@Frollie.id

Dan ikuti perjalanan founder kami:
📸 IG: https://instagram.com/EtengandTJ
🎵 TikTok: https://tiktok.com/@EtengandTJ

Terima kasih sudah order di Malo! 🙏
Sampai jumpa di order berikutnya! 👋`,
    en: `Hi {customer_name}! 👋

Your Order #{order_number} has been delivered! 🎉

We hope you love your order! 😊

Follow us on:
📸 IG: https://instagram.com/Frollie.id
🎵 TikTok: https://tiktok.com/@Frollie.id

And follow our founder's journey:
📸 IG: https://instagram.com/EtengandTJ
🎵 TikTok: https://tiktok.com/@EtengandTJ

Thank you for ordering from Malo! 🙏
See you on your next order! 👋`,
  },
};

// ============================================
// Template Generation
// ============================================

/**
 * Generate a WhatsApp template message for the given tab and order.
 */
export function generateTemplate(
  tab: WhatsAppTemplateTab,
  order: OrderDetail,
  language: WhatsAppLanguage
): string {
  // Determine which template to use
  let templateKey: string;
  if (tab === 'delivery_confirmation') {
    templateKey = order.delivery_type === 'Pickup' ? 'delivery_pickup' : 'delivery_shipping';
  } else {
    templateKey = tab;
  }

  const template = TEMPLATES[templateKey];
  if (!template) {
    return '';
  }

  const templateString = template[language];

  // Build replacements
  const dueDateLine = order.due_date
    ? language === 'id'
      ? `📅 Target: ${formatDate(order.due_date)}`
      : `📅 Expected: ${formatDate(order.due_date)}`
    : '';

  const deliveryInfo = formatDeliveryInfo(
    order.delivery_type,
    order.pickup_location,
    order.delivery_address,
    language
  );

  const replacements: Record<string, string> = {
    '{customer_name}': order.customer_name || 'Customer',
    '{order_number}': order.order_number || '',
    '{items_list}': formatOrderItemsList(order.items),
    '{total_amount}': formatCurrency(order.total_amount),
    '{delivery_info}': deliveryInfo,
    '{due_date_line}': dueDateLine,
    '{shipping_agency}': order.shipping_agency || '-',
    '{shipping_number}': order.shipping_number || '-',
    '{delivery_address}': order.delivery_address || '-',
    '{pickup_location}': order.pickup_location || 'Goldfinch Legato',
  };

  // Replace all placeholders
  let result = templateString;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  // Clean up empty lines (when delivery_info or due_date_line is empty)
  result = result.replace(/\n\n\n+/g, '\n\n');

  return result.trim();
}

// ============================================
// Tab Visibility Logic
// ============================================

/**
 * Determine which tabs should be visible based on order status.
 */
export function getVisibleTabs(status: string): WhatsAppTemplateTab[] {
  const tabs: WhatsAppTemplateTab[] = ['order_confirmation'];

  // Payment Received tab: visible after Draft
  if (status !== 'Draft') {
    tabs.push('payment_received');
  }

  // Delivery and Thank You tabs: visible at delivery/completion stages
  const deliveryStatuses = [
    'WaitingShipment',
    'CompleteShipped',
    'WaitingPickup',
    'PickedUp',
  ];
  if (deliveryStatuses.includes(status)) {
    tabs.push('delivery_confirmation');
    tabs.push('thank_you');
  }

  return tabs;
}

/**
 * Get tab label based on language.
 */
export function getTabLabel(tab: WhatsAppTemplateTab, language: WhatsAppLanguage): string {
  const labels: Record<WhatsAppTemplateTab, { id: string; en: string }> = {
    order_confirmation: { id: 'Konfirmasi', en: 'Confirmation' },
    payment_received: { id: 'Pembayaran', en: 'Payment' },
    delivery_confirmation: { id: 'Pengiriman', en: 'Delivery' },
    thank_you: { id: 'Terima Kasih', en: 'Thank You' },
  };
  return labels[tab][language];
}

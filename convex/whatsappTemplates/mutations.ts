import { mutation } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Default Templates (Hardcoded Fallbacks)
// ============================================

interface DefaultTemplate {
  code: string;
  name: string;
  description: string;
  templateId: string;
  templateEn: string;
  availableVariables: string[];
}

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    code: "payment_request",
    name: "Payment Request",
    description: "Sent when order is created to request payment",
    templateId: `Halo {customer_name}! 👋

Terima kasih sudah order di Frollie! 🙏

*Order #{order_number}*
{items_list}
────────────
*Total: {total_amount}*{discount_note}

{delivery_info}
📅 Target: {due_date}

Silakan transfer ke:
*BCA*
*PT Malo Group Bahagia*
*6044830994*
*Nominal: {total_amount}*

Setelah transfer, mohon kirim bukti pembayaran ya.

Terima kasih! 🙏`,
    templateEn: `Hello {customer_name}! 👋

Thank you for ordering at Frollie! 🙏

*Order #{order_number}*
{items_list}
────────────
*Total: {total_amount}*{discount_note}

{delivery_info}
📅 Due: {due_date}

Please transfer to:
*BCA*
*PT Malo Group Bahagia*
*6044830994*
*Amount: {total_amount}*

After transferring, please send the payment proof.

Thank you! 🙏`,
    availableVariables: [
      "{customer_name}",
      "{order_number}",
      "{items_list}",
      "{total_amount}",
      "{delivery_info}",
      "{due_date}",
      "{discount_note}",
    ],
  },
  {
    code: "production_started",
    name: "Production Started",
    description: "Sent when kitchen starts processing the order",
    templateId: `Halo {customer_name}! 👋

Order kamu #{order_number} sudah mulai diproses! 🍳

Kami akan kabari lagi kalau sudah siap ya.

Terima kasih sudah sabar menunggu! 🙏`,
    templateEn: `Hello {customer_name}! 👋

Your order #{order_number} is now being processed! 🍳

We'll let you know when it's ready.

Thank you for your patience! 🙏`,
    availableVariables: ["{customer_name}", "{order_number}"],
  },
  {
    code: "delivery_complete",
    name: "Delivery Complete",
    description: "Sent when order has been delivered",
    templateId: `Halo {customer_name}! 👋

Order #{order_number} sudah sampai ya! 📦✅

Semoga suka dengan pesanannya! 😊

Jangan lupa kasih review atau feedback ya, sangat membantu kami untuk terus berkembang.

Terima kasih sudah order di Frollie! 🙏
Sampai jumpa di order berikutnya! 👋`,
    templateEn: `Hello {customer_name}! 👋

Order #{order_number} has been delivered! 📦✅

Hope you enjoy your order! 😊

Don't forget to give us a review or feedback, it really helps us improve.

Thank you for ordering at Frollie! 🙏
See you on your next order! 👋`,
    availableVariables: ["{customer_name}", "{order_number}"],
  },
  {
    code: "receipt",
    name: "Receipt",
    description: "General order receipt with full details",
    templateId: `{status_label} *Order {order_number}*

Customer: {customer_name}{channel_suffix}
{items_list}
----------------
*Total: {total_amount}*{discount_note}

{payment_info}
{delivery_info}{due_date_line}{notes_section}

Please transfer to:
BCA
PT Malo Group Bahagia
6044830994`,
    templateEn: `{status_label} *Order {order_number}*

Customer: {customer_name}{channel_suffix}
{items_list}
----------------
*Total: {total_amount}*{discount_note}

{payment_info}
{delivery_info}{due_date_line}{notes_section}

Please transfer to:
BCA
PT Malo Group Bahagia
6044830994`,
    availableVariables: [
      "{customer_name}",
      "{order_number}",
      "{items_list}",
      "{total_amount}",
      "{delivery_info}",
      "{payment_info}",
      "{notes_section}",
      "{discount_note}",
      "{status_label}",
      "{channel_suffix}",
      "{due_date_line}",
    ],
  },
  {
    code: "shipping",
    name: "Shipping Confirmation",
    description: "Sent when order is shipped with tracking info",
    templateId: `Halo {customer_name}!

Order kamu #{order_number} sudah dalam perjalanan! 🚚

Tracking: {shipping_number}
Via: {shipping_agency}

{delivery_address}

Terima kasih sudah order!`,
    templateEn: `Hello {customer_name}!

Your order #{order_number} is on the way! 🚚

Tracking: {shipping_number}
Via: {shipping_agency}

{delivery_address}

Thank you for ordering!`,
    availableVariables: [
      "{customer_name}",
      "{order_number}",
      "{shipping_number}",
      "{shipping_agency}",
      "{delivery_address}",
    ],
  },
  {
    code: "pickup_ready",
    name: "Pickup Ready",
    description: "Sent when order is ready for customer pickup",
    templateId: `Halo {customer_name}!

Order kamu #{order_number} sudah siap diambil! 📦

Lokasi: {pickup_location}

Sampai jumpa! 👋`,
    templateEn: `Hello {customer_name}!

Your order #{order_number} is ready for pickup! 📦

Location: {pickup_location}

See you soon! 👋`,
    availableVariables: [
      "{customer_name}",
      "{order_number}",
      "{pickup_location}",
    ],
  },
];

/**
 * Seed default templates into the database.
 * Skips templates that already exist.
 */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    let skipped = 0;

    for (const template of DEFAULT_TEMPLATES) {
      // Check if template already exists
      const existing = await ctx.db
        .query("whatsappTemplates")
        .withIndex("by_code", (q) => q.eq("code", template.code))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      // Insert new template
      await ctx.db.insert("whatsappTemplates", {
        code: template.code,
        name: template.name,
        description: template.description,
        templateId: template.templateId,
        templateEn: template.templateEn,
        availableVariables: template.availableVariables,
        isDefault: true,
      });
      inserted++;
    }

    return { inserted, skipped };
  },
});

/**
 * Update a template's content.
 */
export const update = mutation({
  args: {
    id: v.id("whatsappTemplates"),
    templateId: v.string(),
    templateEn: v.string(),
    editedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) {
      throw new Error("Template not found");
    }

    await ctx.db.patch(args.id, {
      templateId: args.templateId,
      templateEn: args.templateEn,
      lastEditedBy: args.editedBy ?? "admin",
      lastEditedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Reset a template to its default content.
 */
export const resetToDefault = mutation({
  args: {
    id: v.id("whatsappTemplates"),
    editedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) {
      throw new Error("Template not found");
    }

    // Find the default template by code
    const defaultTemplate = DEFAULT_TEMPLATES.find(
      (t) => t.code === template.code
    );
    if (!defaultTemplate) {
      throw new Error("No default template found for this code");
    }

    await ctx.db.patch(args.id, {
      templateId: defaultTemplate.templateId,
      templateEn: defaultTemplate.templateEn,
      lastEditedBy: args.editedBy ?? "admin",
      lastEditedAt: Date.now(),
    });

    return { success: true };
  },
});

// Export DEFAULT_TEMPLATES for use in whatsapp.ts fallback
export { DEFAULT_TEMPLATES };

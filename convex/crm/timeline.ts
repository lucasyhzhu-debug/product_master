/**
 * CRM timeline mutations and queries — Phase D CRM surface.
 *
 * T19: logCustomerInteraction — inserts a customerActivity row for a manually logged event.
 *
 * Auth: manager + admin only (Pitfall #19 superset).
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { eventTypeToCategory, type ActivityCategory } from "../lib/activityEvents";

// Direction per activity category — mirrors ACTIVITY_TAXONOMY in src/lib/crmActivityTaxonomy.ts.
// Kept here (backend) to avoid importing from src/ in Convex functions.
const CATEGORY_DIRECTION: Record<ActivityCategory, "inbound" | "outbound" | "system"> = {
  order:     "system",
  finance:   "system",
  message:   "outbound",
  document:  "inbound",
  schedule:  "system",
  milestone: "system",
};

// ---------------------------------------------------------------------------
// T19: logCustomerInteraction
// ---------------------------------------------------------------------------

export const logCustomerInteraction = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId:     v.id("customers"),
    type:           v.union(
      v.literal("whatsapp_drafted"),
      v.literal("note"),
      v.literal("manual_milestone"),
    ),
    subtype:        v.optional(v.string()),
    note:           v.optional(v.string()),
    summary:        v.optional(v.string()),
    subscriptionId: v.optional(v.id("subscriptions")),
    invoiceId:      v.optional(v.id("invoices")),
    orderId:        v.optional(v.id("orders")),
    agreementId:    v.optional(v.id("supplyAgreements")),
  },
  handler: async (ctx, args) => {
    const { customerId, type, subtype, note, summary, subscriptionId, invoiceId, orderId, agreementId } = args;

    // Derive direction from category map (mirrors src/lib/crmActivityTaxonomy.ts).
    const category = eventTypeToCategory(type);
    const direction = CATEGORY_DIRECTION[category];

    const id = await ctx.db.insert("customerActivity", {
      customerId,
      type,
      subtype,
      note,
      summary,
      direction,
      at: Date.now(),
      actor: ctx.user._id,
      subscriptionId,
      invoiceId,
      orderId,
      agreementId,
    });
    return id;
  },
});

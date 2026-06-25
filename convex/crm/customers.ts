/**
 * CRM customer mutations and queries — Phase D CRM surface.
 *
 * T5: updateCustomerCrmFields — patches only provided CRM fields on a customer record.
 *
 * Auth: manager + admin only (Pitfall #19 — superset of canAccessCrm so no role throws Unauthorized).
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";

// ---------------------------------------------------------------------------
// T5: updateCustomerCrmFields
// ---------------------------------------------------------------------------

export const updateCustomerCrmFields = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    keyContactName: v.optional(v.string()),
    keyContactRole: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    instagram: v.optional(v.string()),
    otherSocials: v.optional(
      v.array(
        v.object({
          platform: v.string(),
          handle: v.string(),
          url: v.optional(v.string()),
        }),
      ),
    ),
    deliveryAddress: v.optional(v.string()),
    storeAddress: v.optional(v.string()),
    otherAddresses: v.optional(v.array(v.string())),
    altPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { customerId, ...fields } = args;
    // Patch only the fields that were explicitly provided (filter out undefined).
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(customerId, patch);
    return customerId;
  },
});

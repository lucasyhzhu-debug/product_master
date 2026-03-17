/**
 * Business settings queries -- read operations for company identity/config.
 *
 * Used by the Business Settings page (Phase 57, Plan 02) and Invoice Form
 * (Phase 58) to display seller info on invoices.
 */

import { protectedQuery } from "../lib/functions";

/**
 * Get the business settings singleton.
 *
 * Returns null if no settings have been configured yet.
 * When settings exist, resolves the logo URL from storage and
 * the default bank account document.
 */
export const get = protectedQuery({
  roles: ["admin", "manager"],
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("businessSettings").first();
    if (!settings) return null;

    // Resolve logo URL from Convex storage
    const logoUrl = settings.logoStorageId
      ? await ctx.storage.getUrl(settings.logoStorageId)
      : null;

    // Resolve default bank account details
    const defaultBankAccount = settings.defaultBankAccountId
      ? await ctx.db.get(settings.defaultBankAccountId)
      : null;

    return { ...settings, logoUrl, defaultBankAccount };
  },
});

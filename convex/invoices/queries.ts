/**
 * Invoice queries -- read operations for invoice records.
 *
 * Used by the Invoice Form (Phase 58) to load existing invoices
 * for an order and to display individual invoice details.
 */

import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";

/**
 * Get all invoices for a specific order.
 *
 * Returns invoices sorted by creation time descending (latest first).
 * Resolves seller logo URL from Convex storage for each invoice.
 */
export const getByOrder = protectedQuery({
  roles: ["admin", "manager"],
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .order("desc")
      .collect();

    // Resolve logo URLs (already sorted by creation time desc via .order("desc"))
    return await Promise.all(
      invoices.map(async (inv) => {
        const sellerLogoUrl = inv.sellerLogoStorageId
          ? await ctx.storage.getUrl(inv.sellerLogoStorageId)
          : null;
        return { ...inv, sellerLogoUrl };
      }),
    );
  },
});

/**
 * Get a single invoice by ID.
 *
 * Resolves seller logo URL from Convex storage.
 */
export const getById = protectedQuery({
  roles: ["admin", "manager"],
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    const sellerLogoUrl = invoice.sellerLogoStorageId
      ? await ctx.storage.getUrl(invoice.sellerLogoStorageId)
      : null;

    return { ...invoice, sellerLogoUrl };
  },
});

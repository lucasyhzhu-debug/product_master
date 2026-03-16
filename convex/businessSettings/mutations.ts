/**
 * Business settings mutations -- create/update company identity for invoices.
 *
 * The businessSettings table is a singleton (at most one row).
 * upsert creates the first row or patches the existing one.
 * When a logo is replaced, the old storage file is deleted.
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";

/**
 * Create or update the business settings singleton.
 *
 * If a logo is being replaced (different logoStorageId from existing),
 * the old logo file is cleaned up from Convex storage.
 */
export const upsert = protectedMutation({
  roles: ["admin"],
  args: {
    businessName: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    npwp: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    defaultBankAccountId: v.optional(v.id("bankAccounts")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("businessSettings").first();

    // Clean up old logo if it's being replaced
    if (
      existing &&
      existing.logoStorageId &&
      existing.logoStorageId !== args.logoStorageId
    ) {
      await ctx.storage.delete(existing.logoStorageId);
    }

    const data = {
      ...args,
      updatedBy: ctx.user._id,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("businessSettings", data);
    }
  },
});

/**
 * Generate a presigned upload URL for the business logo.
 */
export const generateUploadUrl = protectedMutation({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

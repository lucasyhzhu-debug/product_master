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
 * Determine the upsert action for the singleton pattern.
 * Pure function exported for testing.
 */
export function computeUpsertAction(
  existing: { logoStorageId?: string } | null,
  newLogoStorageId: string | undefined,
): { action: "insert" | "patch"; oldLogoToDelete: string | null } {
  if (!existing) {
    return { action: "insert", oldLogoToDelete: null };
  }

  const oldLogoToDelete =
    existing.logoStorageId && existing.logoStorageId !== newLogoStorageId
      ? existing.logoStorageId
      : null;

  return { action: "patch", oldLogoToDelete };
}

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

    const { action, oldLogoToDelete } = computeUpsertAction(
      existing as { logoStorageId?: string } | null,
      args.logoStorageId as string | undefined,
    );

    // Clean up old logo if it's being replaced
    if (oldLogoToDelete) {
      await ctx.storage.delete(oldLogoToDelete as any);
    }

    const data = {
      ...args,
      updatedBy: ctx.user._id,
      updatedAt: Date.now(),
    };

    if (action === "patch" && existing) {
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

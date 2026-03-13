/**
 * Bank account mutations -- CRUD operations for company bank accounts.
 *
 * Admin-only. Used for managing the company bank accounts from which
 * reimbursement transfers are made.
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";

/**
 * Create a new company bank account.
 */
export const create = protectedMutation({
  roles: ["admin"],
  args: {
    name: v.string(),
    bankName: v.string(),
    accountNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const bankName = args.bankName.trim();
    const accountNumber = args.accountNumber.trim();

    if (!name) throw new Error("Account name is required");
    if (!bankName) throw new Error("Bank name is required");
    if (!accountNumber) throw new Error("Account number is required");

    return await ctx.db.insert("bankAccounts", {
      name,
      bankName,
      accountNumber,
      isActive: true,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
    });
  },
});

/**
 * Update an existing company bank account.
 */
export const update = protectedMutation({
  roles: ["admin"],
  args: {
    bankAccountId: v.id("bankAccounts"),
    name: v.optional(v.string()),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.bankAccountId);
    if (!existing) {
      throw new Error("Bank account not found");
    }

    const patch: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Account name is required");
      patch.name = name;
    }
    if (args.bankName !== undefined) {
      const bankName = args.bankName.trim();
      if (!bankName) throw new Error("Bank name is required");
      patch.bankName = bankName;
    }
    if (args.accountNumber !== undefined) {
      const accountNumber = args.accountNumber.trim();
      if (!accountNumber) throw new Error("Account number is required");
      patch.accountNumber = accountNumber;
    }
    if (args.isActive !== undefined) {
      patch.isActive = args.isActive;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.bankAccountId, patch);
    }

    return await ctx.db.get(args.bankAccountId);
  },
});

/**
 * Remove a company bank account.
 *
 * Referential integrity: refuses to delete if any non-voided reimbursement
 * batch references this bank account.
 */
export const remove = protectedMutation({
  roles: ["admin"],
  args: {
    bankAccountId: v.id("bankAccounts"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.bankAccountId);
    if (!existing) {
      throw new Error("Bank account not found");
    }

    // Check referential integrity: pending or confirmed batches using this bank account
    const pendingBatches = await ctx.db
      .query("reimbursementBatches")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const confirmedBatches = await ctx.db
      .query("reimbursementBatches")
      .withIndex("by_status", (q) => q.eq("status", "confirmed"))
      .collect();

    const activeBatches = [...pendingBatches, ...confirmedBatches].filter(
      (b) => b.bankAccountId === args.bankAccountId
    );

    if (activeBatches.length > 0) {
      throw new Error(
        "Cannot delete bank account referenced by active reimbursement batches."
      );
    }

    await ctx.db.delete(args.bankAccountId);
  },
});

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";

// ---------------------------------------------------------------------------
// Account type derivation from PSAK code prefix
// ---------------------------------------------------------------------------

type AccountType = "asset" | "liability" | "equity" | "revenue" | "cogs" | "opex" | "other";

const CODE_PREFIX_TO_TYPE: Record<string, { type: AccountType; category: string }> = {
  "1": { type: "asset", category: "Assets" },
  "2": { type: "liability", category: "Liabilities" },
  "3": { type: "equity", category: "Equity" },
  "4": { type: "revenue", category: "Revenue" },
  "5": { type: "cogs", category: "Cost of Goods Sold" },
  "6": { type: "opex", category: "Operating Expenses" },
  "7": { type: "other", category: "Other Income/Expense" },
};

// ---------------------------------------------------------------------------
// Default Chart of Accounts — 36 PSAK-aligned GL accounts
// ---------------------------------------------------------------------------

/**
 * Default Chart of Accounts — 36 PSAK-aligned GL accounts.
 * Exported for test validation. Used by seedDefaults mutation.
 */
export const DEFAULT_ACCOUNTS = [
  // Revenue (4xxx)
  { code: "4100", name: "Direct Sales", type: "revenue" as const, category: "Revenue", isSystem: true, isActive: true },
  { code: "4200", name: "GoFood Revenue", type: "revenue" as const, category: "Revenue", isSystem: true, isActive: true },
  { code: "4300", name: "Shopee Revenue", type: "revenue" as const, category: "Revenue", isSystem: true, isActive: true },
  { code: "4400", name: "TikTok Revenue", type: "revenue" as const, category: "Revenue", isSystem: true, isActive: true },
  { code: "4500", name: "K3Mart Revenue", type: "revenue" as const, category: "Revenue", isSystem: true, isActive: true },
  { code: "4600", name: "Consignment Revenue", type: "revenue" as const, category: "Revenue", isSystem: true, isActive: true },
  { code: "4700", name: "GrabFood Revenue", type: "revenue" as const, category: "Revenue", isSystem: true, isActive: true },

  // COGS (5xxx)
  { code: "5100", name: "Production COGS", type: "cogs" as const, category: "Cost of Goods Sold", isSystem: true, isActive: true },
  { code: "5200", name: "Packaging COGS", type: "cogs" as const, category: "Cost of Goods Sold", isSystem: true, isActive: true },
  { code: "5300", name: "Commissions & Fees", type: "cogs" as const, category: "Cost of Goods Sold", isSystem: true, isActive: true },
  { code: "5400", name: "Platform Ad Burn", type: "cogs" as const, category: "Cost of Goods Sold", isSystem: true, isActive: true },

  // OpEx (6xxx)
  { code: "6100", name: "Salaries & Wages", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6200", name: "Rent & Utilities", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6300", name: "Transportation (Local)", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6350", name: "Travel & Visa", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6400", name: "Marketing & Promotion", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6500", name: "Office & Supplies", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6600", name: "Equipment & Maintenance", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6700", name: "Software & Subscriptions", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6800", name: "Professional Services", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6900", name: "Meals & Entertainment", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
  { code: "6990", name: "Miscellaneous OpEx", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },

  // Other (7xxx)
  { code: "7100", name: "Interest Income", type: "other" as const, category: "Other Income/Expense", isSystem: true, isActive: true },
  { code: "7200", name: "Interest Expense", type: "other" as const, category: "Other Income/Expense", isSystem: true, isActive: true },
  { code: "7900", name: "Other Non-Operating", type: "other" as const, category: "Other Income/Expense", isSystem: true, isActive: true },

  // Assets (1xxx)
  { code: "1100", name: "Cash (Bank Accounts)", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
  { code: "1200", name: "Accounts Receivable", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
  { code: "1300", name: "Inventory (Raw Materials)", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
  { code: "1400", name: "Prepaid Expenses", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
  { code: "1500", name: "Fixed Assets", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
  { code: "1600", name: "Accumulated Depreciation", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },

  // Liabilities (2xxx)
  { code: "2100", name: "Accounts Payable", type: "liability" as const, category: "Liabilities", isSystem: true, isActive: true },
  { code: "2200", name: "Employee Reimbursements Payable", type: "liability" as const, category: "Liabilities", isSystem: true, isActive: true },
  { code: "2300", name: "Accrued Expenses", type: "liability" as const, category: "Liabilities", isSystem: true, isActive: true },
  { code: "2400", name: "Tax Payable", type: "liability" as const, category: "Liabilities", isSystem: true, isActive: true },
  { code: "2500", name: "Loans Payable", type: "liability" as const, category: "Liabilities", isSystem: true, isActive: true },

  // Equity (3xxx)
  { code: "3100", name: "Owner's Capital", type: "equity" as const, category: "Equity", isSystem: true, isActive: true },
  { code: "3200", name: "Retained Earnings", type: "equity" as const, category: "Equity", isSystem: true, isActive: true },
  { code: "3300", name: "Current Period P&L", type: "equity" as const, category: "Equity", isSystem: true, isActive: true },
] as const;

// ---------------------------------------------------------------------------
// seedDefaults — upsert 36 system accounts
// ---------------------------------------------------------------------------

/**
 * Seed default Chart of Accounts.
 * Run from Convex dashboard Functions tab: accounts:seedDefaults
 *
 * Upsert pattern (matching productionUnitTypes:seedDefaults):
 * - If account code exists: patch with current values (update)
 * - If not exists: insert new record (create)
 *
 * All 36 defaults have isSystem: true and isActive: true.
 */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const results: Array<{ code: string; action: "created" | "updated"; id: string }> = [];

    for (const account of DEFAULT_ACCOUNTS) {
      // Check if already exists by code
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_code", (q) => q.eq("code", account.code))
        .first();

      if (existing) {
        // Update existing with current values (upsert)
        await ctx.db.patch(existing._id, {
          name: account.name,
          type: account.type,
          category: account.category,
          isActive: account.isActive,
          isSystem: account.isSystem,
        });
        results.push({ code: account.code, action: "updated", id: existing._id });
      } else {
        // Create new
        const id = await ctx.db.insert("accounts", {
          code: account.code,
          name: account.name,
          type: account.type,
          category: account.category,
          isActive: account.isActive,
          isSystem: account.isSystem,
        });
        results.push({ code: account.code, action: "created", id });
      }
    }

    return results;
  },
});

// ---------------------------------------------------------------------------
// CRUD mutations — admin-only via protectedMutation
// ---------------------------------------------------------------------------

/**
 * Create a custom GL account.
 * Code must be 4 digits with valid PSAK prefix (1-7). Type and category are auto-derived.
 */
export const create = protectedMutation({
  roles: ["admin"],
  args: {
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate code format: exactly 4 digits
    if (!/^\d{4}$/.test(args.code)) {
      throw new Error("Account code must be exactly 4 digits");
    }

    // Validate code prefix maps to a valid PSAK range
    const prefix = args.code[0];
    const mapping = CODE_PREFIX_TO_TYPE[prefix];
    if (!mapping) {
      throw new Error(
        `Invalid account code prefix "${prefix}". Must be 1 (Asset), 2 (Liability), 3 (Equity), 4 (Revenue), 5 (COGS), 6 (OpEx), or 7 (Other).`
      );
    }

    // Validate code uniqueness via by_code index
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (existing) {
      throw new Error(`Account code "${args.code}" already exists`);
    }

    // Insert with auto-derived type and category
    return await ctx.db.insert("accounts", {
      code: args.code,
      name: args.name.trim(),
      type: mapping.type,
      category: mapping.category,
      isSystem: false,
      isActive: true,
      ...(args.description !== undefined && { description: args.description }),
    });
  },
});

/**
 * Update an existing GL account.
 * Code is immutable after creation (for all accounts, not just system).
 * Name, description, and isActive can be changed.
 */
export const update = protectedMutation({
  roles: ["admin"],
  args: {
    id: v.id("accounts"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.id);
    if (!account) {
      throw new Error("Account not found");
    }

    // Validate name is non-empty if provided
    if (args.name !== undefined && args.name.trim() === "") {
      throw new Error("Account name cannot be empty");
    }

    // Build patch object — only include provided fields, no undefined values
    const patch: Record<string, any> = {};
    if (args.name !== undefined) {
      patch.name = args.name.trim();
    }
    if (args.isActive !== undefined) {
      patch.isActive = args.isActive;
    }

    // Handle description clearing: empty string = remove field, non-empty = set, undefined = skip
    if (args.description !== undefined) {
      if (args.description === "") {
        // Clear description by setting to undefined (removes field from document)
        patch.description = undefined;
      } else {
        patch.description = args.description;
      }
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.id, patch);
    }
  },
});

/**
 * Delete a GL account.
 * System accounts (isSystem: true) cannot be deleted.
 * Accounts referenced by journal entry lines or expenses cannot be deleted.
 */
export const remove = protectedMutation({
  roles: ["admin"],
  args: {
    id: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.id);
    if (!account) {
      throw new Error("Account not found");
    }

    // Block system account deletion
    if (account.isSystem) {
      throw new Error("Cannot delete system account");
    }

    // Block deletion if referenced by journal entry lines
    const journalLineRef = await ctx.db
      .query("journalEntryLines")
      .withIndex("by_account_entryDate", (q) => q.eq("accountId", args.id))
      .first();
    if (journalLineRef) {
      throw new Error("Cannot delete account: it is referenced by journal entries");
    }

    // Block deletion if referenced by expenses (no index, scan is acceptable for rare operation)
    const expenseRef = await ctx.db
      .query("expenses")
      .filter((q) => q.eq(q.field("accountId"), args.id))
      .first();
    if (expenseRef) {
      throw new Error("Cannot delete account: it is referenced by expenses");
    }

    await ctx.db.delete(args.id);
  },
});

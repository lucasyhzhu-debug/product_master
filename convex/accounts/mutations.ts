import { mutation } from "../_generated/server";

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

/**
 * Bulk journal entry import mutations.
 *
 * Core engine for bulk expense/asset import. Creates one JE per CSV row:
 * - Expense rows: DR expense account, CR 1100 Cash (sourceType "manual")
 * - Asset rows: DR 1500/1700, CR 1100 Cash (sourceType "asset_acquisition")
 *   + creates fixedAssets record with auto-calculated depreciation
 *
 * All JE creation goes through createJournalEntryWithLines (JE-06).
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { createJournalEntryWithLines } from "../lib/journalEngine";
import {
  ASSET_CATEGORIES,
  calculateMonthlyDepreciation,
  getAssetAccountCode,
} from "../fixedAssets/helpers";
import { getNextAssetNumber } from "../fixedAssets/mutations";
import type { Id } from "../_generated/dataModel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum rows per batch call (prevents transaction timeout) */
export const MAX_BATCH_SIZE = 50;

/** Cash account code for credit side of all import entries */
const CASH_ACCOUNT_CODE = "1100";

/** Prefix for all historical import descriptions */
const DESCRIPTION_PREFIX = "[Historical Import]";

// ---------------------------------------------------------------------------
// Types (exported for testing)
// ---------------------------------------------------------------------------

/**
 * A single import row ready for journal entry creation.
 * // Parallel type exists in src/lib/csvImportValidation.ts for frontend use
 */
export interface ImportRow {
  date: number;
  amount: number;
  description: string;
  vendorName?: string;
  accountCode: string;
  receiptUrl?: string;
  paymentMethod: string;
  submitterName: string;
  assetCategory?: string;
  assetName?: string;
}

/**
 * Account lookup map: code -> { id, type, isActive }
 */
export type AccountMap = Map<string, { id: Id<"accounts">; type: string; isActive: boolean }>;

// ---------------------------------------------------------------------------
// Pure validation (exported for testing without MutationCtx)
// ---------------------------------------------------------------------------

/** 2020-01-01T00:00:00Z as epoch ms — reasonable lower bound for historical data */
const MIN_DATE_MS = Date.UTC(2020, 0, 1);

/** Valid payment methods */
const VALID_PAYMENT_METHODS = new Set([
  "employee_paid",
  "company_paid",
  "payment_request",
]);

/** Valid asset category keys */
const VALID_ASSET_CATEGORY_KEYS: Set<string> = new Set(
  ASSET_CATEGORIES.map((c) => c.key)
);

/**
 * Validate a single import row against the account map.
 *
 * @returns Error message string if invalid, null if valid
 */
export function validateImportRow(
  row: ImportRow,
  accounts: AccountMap
): string | null {
  // Date: must be a positive number within a reasonable range
  if (typeof row.date !== "number" || !isFinite(row.date) || row.date <= 0) {
    return "Date must be a valid positive number (epoch milliseconds)";
  }
  if (row.date < MIN_DATE_MS) {
    return "Date must be on or after 2020-01-01";
  }
  if (row.date > Date.now() + 24 * 60 * 60 * 1000) {
    return "Date cannot be in the future";
  }

  // Required field: description
  if (!row.description || row.description.trim() === "") {
    return "Missing required field: description";
  }

  // Amount: must be a positive integer
  if (row.amount <= 0) {
    return "Amount must be a positive number";
  }

  if (!Number.isInteger(row.amount)) {
    return "Amount must be an integer (IDR has no fractional component)";
  }

  // Account code: must exist and be active
  const account = accounts.get(row.accountCode);
  if (!account) {
    return `Account code "${row.accountCode}" not found in Chart of Accounts`;
  }

  if (!account.isActive) {
    return `Account code "${row.accountCode}" is inactive`;
  }

  // Payment method: required and valid
  if (!row.paymentMethod || !VALID_PAYMENT_METHODS.has(row.paymentMethod)) {
    return `Invalid paymentMethod "${row.paymentMethod}" (must be: employee_paid, company_paid, or payment_request)`;
  }

  // Submitter name: required
  if (!row.submitterName || row.submitterName.trim() === "") {
    return "Missing required field: submitterName";
  }

  // Asset-specific validation
  if (account.type === "asset") {
    if (!row.assetCategory || !VALID_ASSET_CATEGORY_KEYS.has(row.assetCategory)) {
      return `Asset account "${row.accountCode}" requires a valid assetCategory`;
    }
    if (!row.assetName || row.assetName.trim() === "") {
      return `Asset account "${row.accountCode}" requires assetName`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

/**
 * Create journal entries for a batch of import rows.
 *
 * Validates ALL rows first (fail-fast). If any row is invalid, the entire
 * batch is rejected with per-row error messages. No partial writes.
 *
 * For each valid row:
 * - Expense accounts (opex/cogs/other): DR expense, CR Cash (sourceType "manual")
 * - Asset accounts: DR 1500/1700, CR Cash (sourceType "asset_acquisition") + fixedAssets record
 *
 * All JEs from one import share the same sourceId (importBatchId) for traceability.
 */
export const bulkCreateJournalEntries = protectedMutation({
  roles: ["admin"],
  args: {
    importBatchId: v.string(),
    rows: v.array(
      v.object({
        date: v.number(),
        amount: v.number(),
        description: v.string(),
        vendorName: v.optional(v.string()),
        accountCode: v.string(),
        receiptUrl: v.optional(v.string()),
        paymentMethod: v.string(),
        submitterName: v.string(),
        assetCategory: v.optional(v.string()),
        assetName: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Guard: batch size
    if (args.rows.length > MAX_BATCH_SIZE) {
      throw new Error(
        `Batch too large: ${args.rows.length} rows exceeds max ${MAX_BATCH_SIZE}`
      );
    }

    if (args.rows.length === 0) {
      return { created: 0, assetsCreated: 0 };
    }

    // Build account map from all accounts (now includes type)
    const allAccounts = await ctx.db.query("accounts").collect();
    const accountMap: AccountMap = new Map(
      allAccounts.map((acc) => [
        acc.code,
        { id: acc._id, type: acc.type, isActive: acc.isActive },
      ])
    );

    // Validate ALL rows first (fail-fast, no partial writes)
    const errors: string[] = [];
    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const error = validateImportRow(row as ImportRow, accountMap);
      if (error) {
        errors.push(`Row ${i + 1}: ${error}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Import validation failed:\n${errors.join("\n")}`
      );
    }

    // Look up cash account for credit side
    const cashAccount = accountMap.get(CASH_ACCOUNT_CODE);
    if (!cashAccount) {
      throw new Error(
        `System account ${CASH_ACCOUNT_CODE} (Cash) not found in Chart of Accounts`
      );
    }

    // Create one JE per valid row
    let created = 0;
    let assetsCreated = 0;

    for (const row of args.rows) {
      const targetAccount = accountMap.get(row.accountCode)!;
      const isAssetRow = targetAccount.type === "asset";

      // Build description with submitter: "[Historical Import] desc | vendor | by Name"
      const descParts = [DESCRIPTION_PREFIX, row.description];
      if (row.vendorName) descParts.push(`| ${row.vendorName}`);
      descParts.push(`| by ${row.submitterName}`);
      const description = descParts.join(" ");

      if (isAssetRow && row.assetCategory && row.assetName) {
        // --- Asset row: create fixedAssets record + acquisition JE ---
        const catConfig = ASSET_CATEGORIES.find(
          (c) => c.key === row.assetCategory
        );
        if (!catConfig) {
          throw new Error(`Invalid asset category: ${row.assetCategory}`);
        }

        // Resolve the correct asset GL account (1500 tangible, 1700 intangible)
        const assetGlCode = getAssetAccountCode(catConfig);
        const assetGlAccount = accountMap.get(assetGlCode);
        if (!assetGlAccount) {
          throw new Error(
            `Asset GL account ${assetGlCode} not found. Run accounts:seedDefaults.`
          );
        }

        // Calculate depreciation schedule
        const usefulLifeMonths = catConfig.usefulLifeYears
          ? catConfig.usefulLifeYears * 12
          : 0;
        const salvageValue = Math.round(
          row.amount * (catConfig.salvagePercent / 100)
        );
        const monthlyDep = catConfig.depreciable
          ? calculateMonthlyDepreciation(row.amount, salvageValue, usefulLifeMonths)
          : 0;

        // Generate asset number
        const assetNumber = await getNextAssetNumber(
          ctx,
          catConfig.abbr,
          row.date
        );

        // Create fixedAssets record
        await ctx.db.insert("fixedAssets", {
          assetNumber,
          name: row.assetName,
          category: row.assetCategory,
          acquisitionDate: row.date,
          cost: row.amount,
          salvageValue,
          usefulLifeMonths,
          characteristics: [],
          attachmentIds: [],
          status: catConfig.depreciable ? "active" : "active",
          monthlyDepreciation: monthlyDep,
          accumulatedDepreciation: 0,
          createdBy: ctx.user._id,
          createdAt: Date.now(),
        });

        // Create acquisition JE: DR Asset Account, CR Cash
        await createJournalEntryWithLines(ctx, {
          date: row.date,
          description: `${description} [${assetNumber}]`,
          sourceType: "asset_acquisition",
          sourceId: args.importBatchId,
          createdBy: ctx.user._id,
          metadata: row.receiptUrl ? { receiptUrl: row.receiptUrl } : undefined,
          lines: [
            {
              accountId: assetGlAccount.id,
              debitAmount: row.amount,
              creditAmount: 0,
            },
            {
              accountId: cashAccount.id,
              debitAmount: 0,
              creditAmount: row.amount,
            },
          ],
        });

        assetsCreated++;
      } else {
        // --- Expense row: standard DR expense, CR Cash ---
        await createJournalEntryWithLines(ctx, {
          date: row.date,
          description,
          sourceType: "manual",
          sourceId: args.importBatchId,
          createdBy: ctx.user._id,
          metadata: row.receiptUrl ? { receiptUrl: row.receiptUrl } : undefined,
          lines: [
            {
              accountId: targetAccount.id,
              debitAmount: row.amount,
              creditAmount: 0,
            },
            {
              accountId: cashAccount.id,
              debitAmount: 0,
              creditAmount: row.amount,
            },
          ],
        });
      }

      created++;
    }

    return { created, assetsCreated };
  },
});

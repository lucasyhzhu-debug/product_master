/**
 * Bulk journal entry import mutations.
 *
 * Core engine for historical expense import. Creates one JE per CSV row
 * (DR expense account, CR 1100 Cash) with fail-fast batch validation.
 *
 * All JE creation goes through createJournalEntryWithLines (JE-06).
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { createJournalEntryWithLines } from "../lib/journalEngine";
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
}

/**
 * Account lookup map: code -> { id, isActive }
 */
export type AccountMap = Map<string, { id: Id<"accounts">; isActive: boolean }>;

// ---------------------------------------------------------------------------
// Pure validation (exported for testing without MutationCtx)
// ---------------------------------------------------------------------------

/** 2020-01-01T00:00:00Z as epoch ms — reasonable lower bound for historical data */
const MIN_DATE_MS = Date.UTC(2020, 0, 1);

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
 * Each valid row creates one JE:
 * - DR: expense account (from row.accountCode)
 * - CR: 1100 Cash (CASH_ACCOUNT_CODE)
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
      return { created: 0 };
    }

    // Build account map from all accounts
    const allAccounts = await ctx.db.query("accounts").collect();
    const accountMap: AccountMap = new Map(
      allAccounts.map((acc) => [
        acc.code,
        { id: acc._id, isActive: acc.isActive },
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
    for (const row of args.rows) {
      const expenseAccount = accountMap.get(row.accountCode)!;

      // Build description: "[Historical Import] desc" or "[Historical Import] desc | vendor"
      const description = row.vendorName
        ? `${DESCRIPTION_PREFIX} ${row.description} | ${row.vendorName}`
        : `${DESCRIPTION_PREFIX} ${row.description}`;

      await createJournalEntryWithLines(ctx, {
        date: row.date,
        description,
        sourceType: "manual",
        sourceId: args.importBatchId,
        createdBy: ctx.user._id,
        metadata: row.receiptUrl ? { receiptUrl: row.receiptUrl } : undefined,
        lines: [
          {
            accountId: expenseAccount.id,
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
      created++;
    }

    return { created };
  },
});

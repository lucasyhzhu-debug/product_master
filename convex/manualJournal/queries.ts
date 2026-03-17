/**
 * Manual journal entry queries.
 *
 * Lists template-based manual journal entries by period using the by_date
 * index with range bounds. Post-filters via isTemplateEntry to exclude
 * CSV bulk imports and other non-template entries.
 */

import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";

// ---------------------------------------------------------------------------
// Pure filter predicate (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Determines if a journal entry is a template-based manual entry.
 *
 * Distinguishes template entries from CSV bulk imports:
 * - Template entries: sourceType "manual" + metadata.templateType present
 * - CSV imports: sourceType "manual" + no metadata or metadata without templateType
 * - Other entries: different sourceType (expense_approval, payroll, etc.)
 */
export function isTemplateEntry(entry: {
  sourceType: string;
  metadata?: { templateType?: string; receiptUrl?: string } | null;
}): boolean {
  return entry.sourceType === "manual" && !!entry.metadata?.templateType;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List template-based manual journal entries within a date period.
 *
 * Uses by_date index with range bounds for scalable date filtering,
 * then post-filters for sourceType=manual and metadata.templateType present.
 *
 * Returns entries sorted by date descending with joined lines and account names.
 */
export const listByPeriod = protectedQuery({
  roles: ["manager", "admin"],
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    // Use by_date index with range bounds (scalable)
    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_date", (q) =>
        q.gte("date", args.periodStart).lt("date", args.periodEnd)
      )
      .collect();

    // Post-filter: only template-based manual entries
    const filtered = entries.filter(isTemplateEntry);

    // Join with journalEntryLines + accounts for display
    const results = await Promise.all(
      filtered.map(async (entry) => {
        // Fetch lines via by_journal_entry index
        const lines = await ctx.db
          .query("journalEntryLines")
          .withIndex("by_journal_entry", (q) =>
            q.eq("journalEntryId", entry._id)
          )
          .collect();

        // Fetch account names for each line
        const enrichedLines = await Promise.all(
          lines.map(async (line) => {
            const account = await ctx.db.get(line.accountId);
            return {
              _id: line._id,
              accountId: line.accountId,
              accountName: account?.name ?? "Unknown Account",
              accountCode: account?.code ?? "????",
              debitAmount: line.debitAmount,
              creditAmount: line.creditAmount,
              description: line.description,
            };
          })
        );

        // Sum of debit amounts = total transaction amount
        const totalAmount = enrichedLines.reduce(
          (sum, line) => sum + line.debitAmount,
          0
        );

        return {
          _id: entry._id,
          entryNumber: entry.entryNumber,
          date: entry.date,
          description: entry.description,
          templateType: entry.metadata?.templateType ?? null,
          lines: enrichedLines,
          totalAmount,
        };
      })
    );

    // Sort by date descending (most recent first)
    return results.sort((a, b) => b.date - a.date);
  },
});

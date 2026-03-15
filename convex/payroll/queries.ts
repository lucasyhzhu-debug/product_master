/**
 * Payroll queries -- list and getById.
 *
 * Admin-only queries for payroll entry management.
 * Returns enriched entries with resolved user names and JE details.
 */

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { protectedQuery } from "../lib/functions";

// ---------------------------------------------------------------------------
// list -- payroll entries with optional filters
// ---------------------------------------------------------------------------

/**
 * List payroll entries, optionally filtered by employee type and/or period range.
 *
 * Uses by_employee_type index when filtering by type, otherwise queries all.
 * Results ordered newest first via .order("desc").
 * Period range filtering applied in-memory (periodStart >= filter start AND
 * periodEnd <= filter end).
 *
 * Each entry enriched with createdByName and (if voided) voidedByName.
 */
export const list = protectedQuery({
  roles: ["admin"],
  args: {
    employeeType: v.optional(
      v.union(v.literal("contractor"), v.literal("staff"))
    ),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let entries;

    if (args.employeeType !== undefined) {
      entries = await ctx.db
        .query("payrollEntries")
        .withIndex("by_employee_type", (q) =>
          q.eq("employeeType", args.employeeType!)
        )
        .order("desc")
        .collect();
    } else {
      entries = await ctx.db
        .query("payrollEntries")
        .order("desc")
        .collect();
    }

    // Filter by period range in-memory if provided
    if (args.periodStart !== undefined) {
      entries = entries.filter((e) => e.periodStart >= args.periodStart!);
    }
    if (args.periodEnd !== undefined) {
      entries = entries.filter((e) => e.periodEnd <= args.periodEnd!);
    }

    // Resolve user names
    const userIds = new Set<string>();
    for (const entry of entries) {
      userIds.add(entry.createdBy);
      if (entry.voidedBy) {
        userIds.add(entry.voidedBy);
      }
    }

    const userMap = new Map<string, string>();
    const users = await Promise.all(
      [...userIds].map((id) => ctx.db.get(id as Id<"users">))
    );
    for (const user of users) {
      if (user) {
        userMap.set(user._id as string, user.name ?? "Unknown");
      }
    }

    return entries.map((entry) => ({
      ...entry,
      createdByName: userMap.get(entry.createdBy) ?? "Unknown",
      voidedByName: entry.voidedBy
        ? userMap.get(entry.voidedBy) ?? "Unknown"
        : undefined,
    }));
  },
});

// ---------------------------------------------------------------------------
// getById -- single payroll entry with JE details
// ---------------------------------------------------------------------------

/**
 * Get a single payroll entry by ID with enriched data.
 *
 * Returns the entry with:
 * - Resolved createdBy user name
 * - Resolved voidedBy user name (if voided)
 * - Journal entry details with resolved lines (account code + name)
 */
export const getById = protectedQuery({
  roles: ["admin"],
  args: {
    payrollId: v.id("payrollEntries"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.payrollId);
    if (!entry) {
      throw new Error("Payroll entry not found");
    }

    // Resolve createdBy
    const createdByUser = await ctx.db.get(entry.createdBy);
    const createdByName = createdByUser?.name ?? "Unknown";

    // Resolve voidedBy
    let voidedByName: string | undefined;
    if (entry.voidedBy) {
      const voidedByUser = await ctx.db.get(entry.voidedBy);
      voidedByName = voidedByUser?.name ?? "Unknown";
    }

    // Resolve journal entry details
    let journalEntry = null;
    let journalLines: Array<{
      accountCode: string;
      accountName: string;
      debitAmount: number;
      creditAmount: number;
      description?: string;
    }> = [];

    if (entry.journalEntryId) {
      journalEntry = await ctx.db.get(entry.journalEntryId);

      if (journalEntry) {
        const lines = await ctx.db
          .query("journalEntryLines")
          .withIndex("by_journal_entry", (q) =>
            q.eq("journalEntryId", entry.journalEntryId!)
          )
          .collect();

        journalLines = await Promise.all(
          lines.map(async (line) => {
            const account = await ctx.db.get(line.accountId);
            return {
              accountCode: account?.code ?? "???",
              accountName: account?.name ?? "Unknown Account",
              debitAmount: line.debitAmount,
              creditAmount: line.creditAmount,
              description: line.description,
            };
          })
        );
      }
    }

    return {
      ...entry,
      createdByName,
      voidedByName,
      journalEntry,
      journalLines,
    };
  },
});

/**
 * Payroll mutations -- create, void, generateUploadUrl.
 *
 * Admin-only operations. No approval workflow (simplest financial entry type).
 * Creates journal entries on creation (DR 6100, CR 1100) and reversal JEs on void.
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { getNextNumber } from "../lib/counter";
import {
  createJournalEntryWithLines,
  createReversalEntry,
  buildDebitLine,
  buildCreditLine,
} from "../lib/journalEngine";
import {
  validatePositiveIntegerAmount,
  validateRequiredReason,
  validatePeriodRange,
  validateRequiredDescription,
} from "./helpers";

// ---------------------------------------------------------------------------
// create -- create a payroll entry with auto-generated journal entry
// ---------------------------------------------------------------------------

/**
 * Create a new payroll entry.
 *
 * Validates amount, period range, and description. Generates PAY-MMDD-NNN
 * number, creates JE (DR 6100 Salaries & Wages, CR 1100 Cash), and links
 * JE to payroll entry.
 */
export const create = protectedMutation({
  roles: ["admin"],
  args: {
    recipientName: v.string(),
    employeeType: v.union(v.literal("contractor"), v.literal("staff")),
    frequency: v.union(v.literal("weekly"), v.literal("monthly")),
    amount: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    description: v.string(),
    attachmentFileId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    // Validate inputs
    if (!args.recipientName.trim()) {
      throw new Error("Recipient name is required");
    }
    validatePositiveIntegerAmount(args.amount);
    validatePeriodRange(args.periodStart, args.periodEnd);
    validateRequiredDescription(args.description);

    // Generate payroll number
    const payrollNumber = await getNextNumber(ctx, "PAY");

    // Look up accounts by code IN PARALLEL (NEVER hardcode IDs)
    const [debitAccount, creditAccount] = await Promise.all([
      ctx.db.query("accounts")
        .withIndex("by_code", (q) => q.eq("code", "6100"))
        .unique(),
      ctx.db.query("accounts")
        .withIndex("by_code", (q) => q.eq("code", "1100"))
        .unique(),
    ]);

    if (!debitAccount || !creditAccount) {
      throw new Error(
        "Required accounts (6100, 1100) not found. Run accounts:seedDefaults first."
      );
    }

    // Insert payroll entry FIRST (to get payrollId for sourceId)
    const payrollId = await ctx.db.insert("payrollEntries", {
      payrollNumber,
      recipientName: args.recipientName.trim(),
      employeeType: args.employeeType,
      frequency: args.frequency,
      amount: args.amount,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      description: args.description.trim(),
      status: "active",
      createdBy: ctx.user._id,
      createdAt: Date.now(),
      ...(args.attachmentFileId && { attachmentFileId: args.attachmentFileId }),
    });

    // Create JE with sourceId set to payrollId
    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: args.periodEnd, // Business date = period end, NOT Date.now()
      description: `Payroll ${payrollNumber}: ${args.description.trim()}`,
      sourceType: "payroll",
      sourceId: payrollId,
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(
          debitAccount._id,
          args.amount,
          args.description.trim()
        ),
        buildCreditLine(creditAccount._id, args.amount),
      ],
    });

    // Patch payroll entry with journalEntryId
    await ctx.db.patch(payrollId, { journalEntryId });

    return { payrollId, payrollNumber, journalEntryId };
  },
});

// ---------------------------------------------------------------------------
// voidEntry -- void an active payroll entry with reversing JE
// ---------------------------------------------------------------------------

/**
 * Void an active payroll entry.
 *
 * Guards: entry must exist, must be active, must have a journal entry.
 * Creates a reversing JE and marks the entry as voided.
 */
export const voidEntry = protectedMutation({
  roles: ["admin"],
  args: {
    payrollId: v.id("payrollEntries"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.payrollId);
    if (!entry) {
      throw new Error("Payroll entry not found");
    }

    validateRequiredReason(args.reason);

    if (entry.status !== "active") {
      throw new Error("Can only void active payroll entries");
    }

    // Guard journalEntryId -- do NOT use non-null assertion
    if (!entry.journalEntryId) {
      throw new Error("Payroll entry has no journal entry to reverse");
    }

    // Create reversing JE
    await createReversalEntry(
      ctx,
      entry.journalEntryId,
      "payroll_void",
      ctx.user._id
    );

    // Mark entry as voided
    await ctx.db.patch(args.payrollId, {
      status: "voided",
      voidedBy: ctx.user._id,
      voidedAt: Date.now(),
      voidReason: args.reason.trim(),
    });

    return { success: true };
  },
});

// ---------------------------------------------------------------------------
// generateUploadUrl -- signed URL for payroll attachment upload
// ---------------------------------------------------------------------------

/**
 * Generate a signed upload URL for payroll attachment storage.
 */
export const generateUploadUrl = protectedMutation({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

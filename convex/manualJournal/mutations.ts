/**
 * Manual journal entry mutations.
 *
 * Template-based create mutation for balance sheet transactions.
 * 6 pre-wired templates map templateType to debit/credit account pairs.
 *
 * All JE creation goes through createJournalEntryWithLines (JE-06).
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
import {
  createJournalEntryWithLines,
  buildDebitLine,
  buildCreditLine,
} from "../lib/journalEngine";

// ---------------------------------------------------------------------------
// Constants (exported for testing)
// ---------------------------------------------------------------------------

/** 6 pre-wired template types for balance sheet transactions */
export const TEMPLATE_TYPES = [
  "equipment_purchase",
  "loan_repayment",
  "dividend_payment",
  "capital_injection",
  "receive_loan",
  "tax_payment",
] as const;

/** Template type union derived from TEMPLATE_TYPES array */
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

/** Maps each template type to its debit/credit account codes */
export const TEMPLATES: Record<TemplateType, { debit: string; credit: string }> = {
  equipment_purchase: { debit: "1500", credit: "1100" },
  loan_repayment: { debit: "2500", credit: "1100" },
  dividend_payment: { debit: "3200", credit: "1100" },
  capital_injection: { debit: "1100", credit: "3100" },
  receive_loan: { debit: "1100", credit: "2500" },
  tax_payment: { debit: "2400", credit: "1100" },
};

// ---------------------------------------------------------------------------
// Date bounds (matching convex/journalImport/mutations.ts pattern)
// ---------------------------------------------------------------------------

/** 2020-01-01T00:00:00Z as epoch ms -- reasonable lower bound for historical data */
const MIN_DATE_MS = Date.UTC(2020, 0, 1);

/** Upper bound: tomorrow (24 hours from now) */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000; // 86400000

// ---------------------------------------------------------------------------
// Pure validation functions (exported for testing without MutationCtx)
// ---------------------------------------------------------------------------

/**
 * Validate that templateType is one of the 6 allowed values.
 * @throws Error if not a valid template type
 */
export function validateTemplateType(type: string): asserts type is TemplateType {
  if (!(TEMPLATE_TYPES as readonly string[]).includes(type)) {
    throw new Error(
      `Invalid template type: "${type}". Must be one of: ${TEMPLATE_TYPES.join(", ")}`
    );
  }
}

/**
 * Validate that amount is a positive integer (IDR has no fractional component).
 * @throws Error if amount <= 0 or not an integer
 */
export function validateManualJournalAmount(amount: number): void {
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  if (!Number.isInteger(amount)) {
    throw new Error("Amount must be a whole number (IDR has no fractional component)");
  }
}

/**
 * Validate that date is within reasonable bounds.
 * - Must be a positive finite number
 * - Must be >= 2020-01-01 UTC
 * - Must be <= tomorrow (Date.now() + 24h)
 *
 * @throws Error if date is invalid, too old, or too far in the future
 */
export function validateManualJournalDate(date: number): void {
  if (!Number.isFinite(date) || date <= 0) {
    throw new Error("Invalid date: must be a valid positive timestamp");
  }
  if (date < MIN_DATE_MS) {
    throw new Error("Date must be on or after 2020-01-01");
  }
  if (date > Date.now() + MAX_FUTURE_MS) {
    throw new Error("Date cannot be more than 24 hours in the future");
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a manual journal entry from a template.
 *
 * Validates templateType, amount, and date, resolves debit/credit account IDs
 * via by_code index, then delegates to createJournalEntryWithLines.
 */
export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    templateType: v.string(),
    date: v.number(),
    amount: v.number(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate inputs
    validateTemplateType(args.templateType);
    validateManualJournalAmount(args.amount);
    validateManualJournalDate(args.date);
    if (!args.description.trim()) {
      throw new Error("Description is required");
    }

    // Look up template account codes
    const template = TEMPLATES[args.templateType];

    // Resolve debit account
    const debitAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", template.debit))
      .first();
    if (!debitAccount) {
      throw new Error(
        `System account ${template.debit} not found. Run accounts:seedDefaults.`
      );
    }

    // Resolve credit account
    const creditAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", template.credit))
      .first();
    if (!creditAccount) {
      throw new Error(
        `System account ${template.credit} not found. Run accounts:seedDefaults.`
      );
    }

    // Create journal entry via engine (JE-06)
    return await createJournalEntryWithLines(ctx, {
      date: args.date,
      description: args.description,
      sourceType: "manual",
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(debitAccount._id, args.amount),
        buildCreditLine(creditAccount._id, args.amount),
      ],
      metadata: { templateType: args.templateType },
    });
  },
});

/**
 * Bulk expense mutations for CSV import.
 *
 * bulkCreateExpenses: Creates actual expense records (not raw JEs) from
 * parsed CSV rows. Supports trust-mode branching:
 * - trusted=true → "recorded" status with auto-generated JE (admin/manager only)
 * - trusted=false → "submitted" status entering DoA approval queue
 */

import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { getNextNumber } from "../lib/counter";
import {
  createJournalEntryWithLines,
  buildDebitLine,
  buildCreditLine,
} from "../lib/journalEngine";
import { recordStatusChange } from "./auditTrail";
import { validateExpenseAmount } from "./helpers";
import { checkDuplicateExpense } from "./helpers";
import { ALL_ROLES, APPROVER_ROLES } from "./constants";
import { resolveAccount } from "../lib/accountUtils";

// ---------------------------------------------------------------------------
// Payment method validator (matches schema exactly)
// ---------------------------------------------------------------------------

const paymentMethodValidator = v.union(
  v.literal("employee_paid"),
  v.literal("company_paid"),
  v.literal("payment_request")
);

// ---------------------------------------------------------------------------
// bulkCreateExpenses — create expense records from parsed CSV rows
// ---------------------------------------------------------------------------

export const bulkCreateExpenses = protectedMutation({
  roles: [...ALL_ROLES],
  args: {
    importBatchId: v.string(),
    rows: v.array(
      v.object({
        date: v.number(),
        amount: v.number(),
        description: v.string(),
        vendorName: v.string(),
        accountId: v.id("accounts"),
        submitterId: v.id("users"),
        paymentMethod: paymentMethodValidator,
        receiptUrl: v.optional(v.string()),
        trusted: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Enforce batch size limit (T-71-03)
    if (args.rows.length > 50) {
      throw new ConvexError("Maximum 50 rows per batch");
    }

    // Check if ANY row has trusted=true — verify user has approver role (T-71-01)
    const hasTrustedRows = args.rows.some((row) => row.trusted);
    if (hasTrustedRows) {
      const userRole = ctx.user.role as string;
      if (!APPROVER_ROLES.includes(userRole as (typeof APPROVER_ROLES)[number])) {
        throw new ConvexError(
          "Only managers and admins can auto-approve expenses"
        );
      }
    }

    // Resolve Cash account once for all auto-approved JEs
    const cashAccount = await resolveAccount(ctx, "1100");

    // Fetch existing expenses for duplicate detection (I-01: mirrors single-expense pattern)
    const existingExpenses = await ctx.db.query("expenses").collect();
    const expenseContext = existingExpenses.map((e) => ({
      amount: e.amount,
      expenseDate: e.expenseDate,
      expenseNumber: e.expenseNumber,
    }));

    let trustedCount = 0;
    let untrustedCount = 0;

    for (const row of args.rows) {
      // Validate amount (T-71-02)
      validateExpenseAmount(row.amount);

      // Generate sequential expense number
      const expenseNumber = await getNextNumber(ctx, "EXP");

      // Check for duplicates against existing + previously inserted batch rows
      const duplicateWarning = checkDuplicateExpense(
        expenseContext,
        row.amount,
        row.date
      );

      // Trust-mode branching
      const status = row.trusted ? ("recorded" as const) : ("submitted" as const);

      // Insert expense record
      const expenseId = await ctx.db.insert("expenses", {
        expenseNumber,
        submittedBy: row.submitterId,
        amount: row.amount,
        accountId: row.accountId,
        expenseDate: row.date,
        description: row.description,
        vendorName: row.vendorName,
        paymentMethod: row.paymentMethod,
        status,
        lateSubmission: false,
        submittedAt: Date.now(),
        importBatchId: args.importBatchId,
        createdAt: Date.now(),
        ...(duplicateWarning !== null && { duplicateWarning }),
      });

      // Add to context for intra-batch duplicate detection
      expenseContext.push({
        amount: row.amount,
        expenseDate: row.date,
        expenseNumber,
      });

      // Record audit trail
      await recordStatusChange(
        ctx,
        expenseId,
        undefined,
        status,
        ctx.user._id,
        "Bulk CSV import"
      );

      // If trusted: create JE and patch with approval fields
      if (row.trusted) {
        const jeId = await createJournalEntryWithLines(ctx, {
          date: row.date,
          description: `[Bulk Import] ${row.description}`,
          sourceType: "expense_approval",
          sourceId: expenseId as string,
          createdBy: ctx.user._id,
          lines: [
            buildDebitLine(row.accountId, row.amount, row.description),
            buildCreditLine(cashAccount._id, row.amount),
          ],
        });

        await ctx.db.patch(expenseId, {
          journalEntryId: jeId,
          approvedBy: ctx.user._id,
          approvedAt: Date.now(),
        });

        trustedCount++;
      } else {
        untrustedCount++;
      }
    }

    return {
      created: args.rows.length,
      autoApproved: trustedCount,
      submitted: untrustedCount,
    };
  },
});

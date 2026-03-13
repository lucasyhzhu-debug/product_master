import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Record an expense status transition in the immutable audit trail.
 * Shared by expenses/mutations.ts and reimbursements/mutations.ts.
 */
export async function recordStatusChange(
  ctx: { db: MutationCtx["db"] },
  expenseId: Id<"expenses">,
  fromStatus: string | undefined,
  toStatus: string,
  changedBy: Id<"users">,
  comment?: string
): Promise<void> {
  await ctx.db.insert("expenseStatusHistory", {
    expenseId,
    fromStatus,
    toStatus,
    changedBy,
    changedAt: Date.now(),
    comment,
  });
}

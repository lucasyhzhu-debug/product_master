import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { LedgerType } from "./types";
import { deriveCreditPool, nextBalanceAfter } from "./creditMath";

export async function postLedgerEntry(
  ctx: MutationCtx,
  args: {
    subscriptionId: Id<"subscriptions">;
    subscriptionWeekId: Id<"subscriptionWeeks">;
    type: LedgerType;
    amount: number; // signed
    createdBy: Id<"users">;
    orderId?: Id<"orders">;
    invoiceId?: Id<"invoices">;
    rolloverFromWeekId?: Id<"subscriptionWeeks">;
    note?: string;
  },
): Promise<Id<"creditLedger">> {
  // Running balance = last entry's balanceAfter for this week (append-only).
  const last = await ctx.db
    .query("creditLedger")
    .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
    .order("desc")
    .first();
  const prevBalance = last?.balanceAfter ?? 0;
  const balanceAfter = nextBalanceAfter(prevBalance, args.amount);

  const id = await ctx.db.insert("creditLedger", {
    subscriptionId: args.subscriptionId,
    subscriptionWeekId: args.subscriptionWeekId,
    type: args.type,
    amount: args.amount,
    balanceAfter,
    orderId: args.orderId,
    invoiceId: args.invoiceId,
    rolloverFromWeekId: args.rolloverFromWeekId,
    createdBy: args.createdBy,
    note: args.note,
  });

  // Re-derive the week's denormalised pool from the full ledger (source of truth = replay).
  const entries = await ctx.db
    .query("creditLedger")
    .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
    .collect();
  const pool = deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount })));
  await ctx.db.patch(args.subscriptionWeekId, {
    creditIssued: pool.creditIssued,
    creditConsumed: pool.creditConsumed,
    creditRemaining: pool.creditRemaining,
    creditExpired: pool.creditExpired,
  });

  return id;
}

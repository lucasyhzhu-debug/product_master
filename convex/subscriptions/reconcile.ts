/**
 * Week reconcile (Task B11, C2 / I4).
 *
 * At week end, settle the week's prepaid credit pool:
 *   1. `leftover = deriveCreditPool(entries).creditRemaining` — undelivered, still-
 *      deferred credit (drawdowns fire at delivery — B9 Step 3b, recognition.ts), so a
 *      positive remaining balance is credit the cafe paid for but never drew down.
 *   2. Build per-tranche balances from the week's `topup` entries (each carries a
 *      `weeksCarried` age) and call the PURE `reconcileTranches` decision core (B3) to
 *      split them into `expire` vs `carry` per the subscription's rollover policy.
 *   3. For each expired tranche post an `expiry` ledger entry (negative). For each
 *      carried tranche post a carry-forward `topup` on the NEXT open week, tagged with
 *      `rolloverFromWeekId` so its age chains forward.
 *   4. On `shortfallFault === "frollie"`, flag `refundDue = leftover` +
 *      `refundStatus: "pending"` — FLAG ONLY, no payout mutation (I4).
 *   5. Patch the week → `status: "reconciled"`, `shortfall: leftover`, `shortfallFault`.
 *
 * Deferred-revenue accounting at reconcile (user directive 2026-06-23):
 *   - cafe under-ordered → expiry = BREAKAGE → the expired amount is recognized as B2B
 *     Wholesale revenue (Frollie keeps the cash, earns it on forfeiture). The income
 *     statement (incomeStatement.ts, B9b source) reads `expiry` ledger rows for this.
 *   - rollover → carry: deferred revenue stays a liability, no recognition.
 *   - frollie fault → refund: deferred revenue reversed, NO recognition (cash owed back).
 *
 * Closed-week guard (C2): refuses if the week is already `closed` (or `reconciled`).
 * reconcileTranches is REUSED, never reimplemented — the FIFO/expiry decision lives in
 * reconcileMath.ts and is unit-tested by B3.
 */

import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { reconcileTranches } from "./reconcileMath";
import { deriveCreditPool } from "./creditMath";
import { postLedgerEntry } from "./ledger";

/**
 * Compute the `weeksCarried` age of each surviving credit tranche for a week, from its
 * ledger. A base `topup` (no `rolloverFromWeekId`) is age 0. A carried `topup` tagged
 * `rolloverFromWeekId` inherits the SOURCE week's surviving tranche age + 1 — so credit
 * that has been carried forward N times reads `weeksCarried === N`.
 *
 * `sourceAgeByWeek` maps a weekId → the age of the credit that was carried OUT of it
 * (computed by the caller as it reconciles each week in order, oldest-first). For a
 * carried topup whose source week age is unknown (e.g. the source week predates this
 * registry), we fall back to 0 + 1 = 1 so it is at least treated as once-carried.
 */
export function buildTranchesFromLedger(
  entries: { type: string; amount: number; rolloverFromWeekId?: string | null }[],
  weekId: string,
  sourceAgeByWeek: Map<string, number>,
): { weekId: string; amount: number; weeksCarried: number }[] {
  const tranches: { weekId: string; amount: number; weeksCarried: number }[] = [];
  for (const e of entries) {
    if (e.type !== "topup") continue;
    if (e.amount <= 0) continue;
    const weeksCarried = e.rolloverFromWeekId
      ? (sourceAgeByWeek.get(e.rolloverFromWeekId) ?? 0) + 1
      : 0;
    tranches.push({ weekId, amount: e.amount, weeksCarried });
  }
  return tranches;
}

/**
 * Replay a week's ledger and return the surviving-tranche age (max `weeksCarried` over
 * the still-positive topups) so a downstream carry chains its age forward. Used to seed
 * `sourceAgeByWeek` for the week currently being reconciled.
 */
async function ageOfWeekTranches(
  ctx: MutationCtx,
  weekId: Id<"subscriptionWeeks">,
  sourceAgeByWeek: Map<string, number>,
): Promise<number> {
  const entries = await ctx.db
    .query("creditLedger")
    .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", weekId))
    .collect();
  const tranches = buildTranchesFromLedger(
    entries.map((e) => ({
      type: e.type,
      amount: e.amount,
      rolloverFromWeekId: e.rolloverFromWeekId ?? null,
    })),
    weekId as string,
    sourceAgeByWeek,
  );
  let maxAge = 0;
  for (const t of tranches) if (t.weeksCarried > maxAge) maxAge = t.weeksCarried;
  return maxAge;
}

/**
 * Find the next open week to carry credit forward into: the earliest week of the same
 * subscription with `weekStart > thisWeek.weekStart` whose status is not terminal
 * (`reconciled`/`closed`). Returns null when no such week exists yet (the seeder must
 * create it before carry can land).
 */
async function findNextOpenWeek(
  ctx: MutationCtx,
  subscriptionId: Id<"subscriptions">,
  weekStart: number,
): Promise<Doc<"subscriptionWeeks"> | null> {
  const later = await ctx.db
    .query("subscriptionWeeks")
    .withIndex("by_subscription_weekStart", (q) =>
      q.eq("subscriptionId", subscriptionId).gt("weekStart", weekStart),
    )
    .order("asc")
    .collect();
  for (const w of later) {
    if (w.status !== "reconciled" && w.status !== "closed") return w;
  }
  return null;
}

export const reconcileWeek = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionWeekId: v.id("subscriptionWeeks"),
    shortfallFault: v.union(v.literal("none"), v.literal("cafe"), v.literal("frollie")),
  },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Subscription week not found");

    // Closed-week guard (C2): a closed week is settled and immutable.
    if (week.status === "closed") throw new ConvexError("Week already closed");
    // Reconcile is idempotent-by-refusal: don't double-expire/double-carry.
    if (week.status === "reconciled") throw new ConvexError("Week already reconciled");

    const sub = await ctx.db.get(week.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");

    // Replay this week's ledger → leftover (still-deferred undelivered credit).
    const entries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) =>
        q.eq("subscriptionWeekId", args.subscriptionWeekId),
      )
      .collect();
    const pool = deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount })));
    const leftover = pool.creditRemaining;

    // Build the tranche list with per-tranche ages (carried topups chain age forward).
    const sourceAgeByWeek = new Map<string, number>();
    // Initial pass to populate sourceAgeByWeek — result is superseded by resolvedTranches below.
    buildTranchesFromLedger(
      entries.map((e) => ({
        type: e.type,
        amount: e.amount,
        rolloverFromWeekId: e.rolloverFromWeekId ?? null,
      })),
      args.subscriptionWeekId as string,
      sourceAgeByWeek,
    );

    // For carried topups, resolve the source week's surviving age so weeksCarried is
    // accurate (buildTranchesFromLedger fell back to age 1 when the source was unknown).
    for (const e of entries) {
      if (e.type !== "topup" || !e.rolloverFromWeekId) continue;
      if (sourceAgeByWeek.has(e.rolloverFromWeekId as string)) continue;
      const srcAge = await ageOfWeekTranches(
        ctx,
        e.rolloverFromWeekId,
        sourceAgeByWeek,
      );
      sourceAgeByWeek.set(e.rolloverFromWeekId as string, srcAge);
    }
    // Recompute tranches now that source ages are known.
    const resolvedTranches = buildTranchesFromLedger(
      entries.map((e) => ({
        type: e.type,
        amount: e.amount,
        rolloverFromWeekId: e.rolloverFromWeekId ?? null,
      })),
      args.subscriptionWeekId as string,
      sourceAgeByWeek,
    );

    // PURE decision core (B3) — reused, not reimplemented.
    const { expire, carry } = reconcileTranches({
      tranches: resolvedTranches,
      policy: sub.creditRolloverPolicy,
      rolloverExpiryWeeks: sub.rolloverExpiryWeeks ?? null,
    });

    const base = {
      subscriptionId: week.subscriptionId,
      subscriptionWeekId: args.subscriptionWeekId,
      createdBy: ctx.user._id,
    };

    // Expire: post a negative `expiry` entry per forfeited tranche. The income
    // statement recognizes these as B2B Wholesale breakage revenue (B9b extension).
    for (const e of expire) {
      if (e.amount <= 0) continue;
      await postLedgerEntry(ctx, {
        ...base,
        type: "expiry",
        amount: -e.amount,
        note: "Credit expired at reconcile (breakage)",
      });
    }

    // Carry: post a carry-forward `topup` onto the next open week, tagged with this
    // week as the rollover source so its age chains forward next reconcile.
    if (carry.length > 0) {
      const nextWeek = await findNextOpenWeek(
        ctx,
        week.subscriptionId,
        week.weekStart,
      );
      if (!nextWeek) {
        throw new ConvexError(
          "No open next week to carry credit into — seed the next week before reconciling",
        );
      }
      for (const c of carry) {
        if (c.amount <= 0) continue;
        await postLedgerEntry(ctx, {
          subscriptionId: week.subscriptionId,
          subscriptionWeekId: nextWeek._id,
          type: "topup",
          amount: c.amount,
          createdBy: ctx.user._id,
          rolloverFromWeekId: args.subscriptionWeekId,
          note: "Credit carried forward from prior week (rollover)",
        });
      }
    }

    // Refund flag (I4): frollie-fault leftover is owed back. FLAG ONLY — no payout.
    const refundDue = args.shortfallFault === "frollie" ? leftover : 0;

    await ctx.db.patch(week._id, {
      status: "reconciled",
      shortfall: leftover,
      shortfallFault: args.shortfallFault,
      refundDue,
      refundStatus: refundDue > 0 ? "pending" : undefined,
    });

    return { weekId: week._id, leftover, expired: expire, carried: carry, refundDue };
  },
});

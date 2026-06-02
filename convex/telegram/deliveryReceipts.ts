/**
 * Delivery receipts for cron-triggered Telegram sends + the slotKey scheme the
 * watchdog crons use.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `*Resilient` cron wrappers (cronRetry.ts) only retry transient errors thrown
 * INSIDE their handler. When the *scheduled retry action itself* fails to launch
 * ("Transient error while executing action", environment:"invalid",
 * willRetry:false) the handler never runs, Convex does not auto-retry actions,
 * and the post is silently dropped. This bit the pack-list midday cron on
 * 2026-06-02 (see .planning/debug/telegram-cron-retry-launch-drop.md).
 *
 * The watchdog: a SECOND, independent cron fires ~15min after each slot. Because
 * it's a fresh launch at a later wall-clock time, it isn't coupled to the dead
 * retry chain (the platform has almost always recovered by then). Each sender
 * records a per-slot receipt on success; the watchdog re-sends ONLY when no
 * receipt exists — so a healthy primary run never double-posts.
 *
 * ── slotKey ──────────────────────────────────────────────────────────────────
 * Deterministic per cron OCCURRENCE, derived from the WIB wall-clock at fire
 * time. The sender and its watchdog run within the same WIB day (and month), so
 * both compute the SAME key. None of the slots sit near WIB midnight, so the
 * +15min watchdog offset never crosses a day boundary.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { getWibDateStr, utcToWibMonthStr } from "../lib/periodRange";

export type PackSlot = "morning" | "midday";
export type SalesCadence = "daily" | "weekly" | "monthly";

/**
 * Pack-list slot key. Keyed by WIB calendar day — morning (07:00) and midday
 * (13:00) are distinct slots on the same day.
 */
export function packSlotKey(slot: PackSlot, nowMs: number): string {
  return `pack:${slot}:${getWibDateStr(nowMs)}`;
}

/**
 * Sales-summary slot key.
 * - daily   → the WIB day of the send (23:00 WIB).
 * - weekly  → the WIB date of the firing Monday (cron fires Mon 07:00 WIB), so
 *             getWibDateStr yields that Monday — a stable, unambiguous week id
 *             (no ISO week-year edge cases; see periodRange getIsoWeekYear note).
 * - monthly → the WIB month (cron fires 1st 08:00 WIB).
 */
export function salesSlotKey(cadence: SalesCadence, nowMs: number): string {
  if (cadence === "monthly") return `sales:monthly:${utcToWibMonthStr(nowMs)}`;
  return `sales:${cadence}:${getWibDateStr(nowMs)}`;
}

/** True if a successful send was already recorded for this slot. */
export const wasDelivered = internalQuery({
  args: { slotKey: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const row = await ctx.db
      .query("telegramDeliveries")
      .withIndex("by_slotKey", (q) => q.eq("slotKey", args.slotKey))
      .first();
    return row !== null;
  },
});

/**
 * Record a successful delivery for a slot. Idempotent: a duplicate call for the
 * same slotKey is a no-op (the watchdog could legitimately resend after a
 * primary that sent but failed to record — we keep the first receipt).
 */
export const recordDelivery = internalMutation({
  args: { slotKey: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("telegramDeliveries")
      .withIndex("by_slotKey", (q) => q.eq("slotKey", args.slotKey))
      .first();
    if (existing) return;
    await ctx.db.insert("telegramDeliveries", {
      slotKey: args.slotKey,
      completedAt: Date.now(),
    });
  },
});

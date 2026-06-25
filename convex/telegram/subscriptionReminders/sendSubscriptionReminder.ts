// convex/telegram/subscriptionReminders/sendSubscriptionReminder.ts
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { sendTelegramHtml } from "../../lib/telegramHtml";
import { RESILIENT_MAX_ATTEMPTS, resilientRetryDelayMs, isTransientError } from "../cronRetry";
import { subscriptionSlotKey } from "../deliveryReceipts";
import { roleForKind, type ReminderKind } from "./kinds";
import {
  formatConfirmReminder,
  formatInvoiceDueReminder,
  formatTodayDeliveries,
  formatChangeCutoffReminder,
  formatReconcileReminder,
  formatWeeklyDeliveryProgress,
} from "./subscriptionRemindersFormat";

const KIND = v.union(
  v.literal("confirm-next-week"),
  v.literal("invoice-due"),
  v.literal("today-deliveries"),
  v.literal("change-cutoff"),
  v.literal("reconcile"),
  v.literal("weekly-delivery-progress"),
);

/** Run the kind's read query and render its message chunks. One switch keeps the map total. */
async function buildMessage(ctx: ActionCtx, kind: ReminderKind): Promise<string[]> {
  const q = internal.subscriptions.reminders.queries;
  switch (kind) {
    case "confirm-next-week":        return formatConfirmReminder(await ctx.runQuery(q.getWeeksToConfirm, {}));
    case "invoice-due":              return formatInvoiceDueReminder(await ctx.runQuery(q.getWeeklyInvoicesDue, {}));
    case "today-deliveries":         return formatTodayDeliveries(await ctx.runQuery(q.getTodaySubscriptionDeliveries, {}));
    case "change-cutoff":            return formatChangeCutoffReminder(await ctx.runQuery(q.getDaysApproachingCutoff, {}));
    case "reconcile":                return formatReconcileReminder(await ctx.runQuery(q.getWeeksToReconcile, {}));
    case "weekly-delivery-progress": return formatWeeklyDeliveryProgress(await ctx.runQuery(q.getWeeklyDeliveryProgress, {}));
  }
}

// ─── sendSubscriptionReminder ────────────────────────────────────────────────

/**
 * Core send action. Resolves the destination chat, builds the HTML message, sends
 * it, and records a delivery receipt. Mirrors sendSalesSummary structure:
 * - Fail-fast on missing token or unassigned chat (ship-dark / misconfiguration).
 * - Receipt recording is best-effort: a failure there must NOT cause the resilient
 *   wrapper to retry (the message already went out — a retry would double-post).
 */
export const sendSubscriptionReminder = internalAction({
  args: { kind: KIND },
  // Explicit return type breaks circular type inference (same reason as sendSalesSummary).
  handler: async (ctx, args): Promise<{ sent: true }> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Telegram env var missing (TELEGRAM_BOT_TOKEN)");
    // Fail-fast if no chat assigned (ship-dark) — mirrors sendSalesSummary.
    const chatId = await ctx.runQuery(
      internal.telegram.chatRegistry.getChatIdByRole,
      { role: roleForKind(args.kind) },
    );
    const chunks = await buildMessage(ctx, args.kind);
    let sent = 0;
    try {
      for (const chunk of chunks) {
        await sendTelegramHtml(token, chatId, chunk);
        sent++;
      }
    } catch (err) {
      if (sent > 0) {
        try {
          await sendTelegramHtml(
            token,
            chatId,
            `<i>⚠️ Subscription reminder (${args.kind}) send failed after ${sent}/${chunks.length} chunks. Check Convex logs.</i>`,
          );
        } catch {
          /* best-effort breadcrumb — ignore secondary failure */
        }
      }
      throw err;
    }
    try {
      await ctx.runMutation(internal.telegram.deliveryReceipts.recordDelivery, {
        slotKey: subscriptionSlotKey(args.kind, Date.now()),
      });
    } catch (e) {
      console.warn("sendSubscriptionReminder: receipt record failed", e);
    }
    return { sent: true };
  },
});

// ─── sendSubscriptionReminderResilient ───────────────────────────────────────

/**
 * Cron-resilient wrapper for sendSubscriptionReminder. See cronRetry.ts for the
 * shared transient-retry playbook. Crons point HERE.
 *
 * Retry safety: a transient error can only escape before the send (at
 * getChatIdByRole / buildMessage runQueries), so retrying never double-posts.
 */
export const sendSubscriptionReminderResilient = internalAction({
  args: { kind: KIND, attempt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<void> => {
    const attempt = args.attempt ?? 0;
    try {
      await ctx.runAction(
        internal.telegram.subscriptionReminders.sendSubscriptionReminder.sendSubscriptionReminder,
        { kind: args.kind },
      );
    } catch (err) {
      if (isTransientError(err) && attempt + 1 < RESILIENT_MAX_ATTEMPTS) {
        const delayMs = resilientRetryDelayMs(attempt);
        console.warn(
          `[sendSubscriptionReminderResilient] transient on ${attempt + 1}/${RESILIENT_MAX_ATTEMPTS} (kind=${args.kind}); retry in ${delayMs}ms`,
        );
        await ctx.scheduler.runAfter(
          delayMs,
          internal.telegram.subscriptionReminders.sendSubscriptionReminder.sendSubscriptionReminderResilient,
          { kind: args.kind, attempt: attempt + 1 },
        );
        return;
      }
      throw err;
    }
  },
});

// ─── watchdogSubscriptionReminder ────────────────────────────────────────────

/**
 * Verification cron. Fires ~15min after each subscription-reminder slot. If no
 * delivery receipt exists for the slot, re-fires the resilient sender. Covers the
 * gap where the primary run AND its scheduled retry both die to a platform-level
 * transient (incident 2026-06-02). See watchdogSalesSummary for the same rationale.
 */
export const watchdogSubscriptionReminder = internalAction({
  args: { kind: KIND },
  handler: async (ctx, args): Promise<void> => {
    const slotKey = subscriptionSlotKey(args.kind, Date.now());
    const delivered = await ctx.runQuery(
      internal.telegram.deliveryReceipts.wasDelivered,
      { slotKey },
    );
    if (delivered) return;
    console.warn(
      `[watchdogSubscriptionReminder] no receipt for ${slotKey}; re-firing resilient sender`,
    );
    await ctx.runAction(
      internal.telegram.subscriptionReminders.sendSubscriptionReminder.sendSubscriptionReminderResilient,
      { kind: args.kind },
    );
  },
});

// convex/telegram/subscriptionReminders/subscriptionRemindersFormat.ts
import type {
  ConfirmRow, InvoiceDueRow, TodayDeliveriesRow, ReconcileRow, DeliveryProgressRow,
} from "../../subscriptions/reminders/types";
import { getWibComponents } from "../../lib/periodRange";

function fmtIDR(n: number): string { return "Rp " + Math.round(n).toLocaleString("en-US"); }
function fmtDate(ms: number): string {
  // getWibComponents.month is 0-indexed (periodRange.ts:35) → +1 for display.
  const { year, month, day } = getWibComponents(ms);
  return `${String(day).padStart(2,"0")}/${String(month + 1).padStart(2,"0")}/${String(year).slice(-2)}`;
}

export function formatConfirmReminder(rows: ConfirmRow[]): string {
  if (!rows.length) return "<b>✅ Confirm next week</b>\n<i>Nothing awaiting confirmation.</i>";
  const lines = rows.map((r) => `• ${r.account} — week of ${fmtDate(r.weekStart)}`).join("\n");
  return `<b>📋 Confirm next week's schedule</b>\n${lines}\n<i>Open the scheduler to confirm.</i>`;
}

export function formatInvoiceDueReminder(rows: InvoiceDueRow[]): string {
  if (!rows.length) return "<b>🧾 Weekly invoices</b>\n<i>Nothing due.</i>";
  const lines = rows.map((r) => `• ${r.account} — ${fmtDate(r.weekStart)}: ${fmtIDR(r.amountDue)} (${r.weekStatus})`).join("\n");
  return `<b>🧾 Weekly invoices to create / mark paid</b>\n${lines}`;
}

export function formatTodayDeliveries(rows: TodayDeliveriesRow[]): string {
  if (!rows.length) return "<b>🚚 Today's subscription deliveries</b>\n<i>None today.</i>";
  const blocks = rows.map((r) => {
    const items = r.lines.map((l) =>
      `   - ${l.qty}× ${l.missingProduct ? "⚠️ " : ""}${l.productName}${l.missingProduct ? " (deleted product — verify in app)" : ""}`
    ).join("\n");
    return `• ${r.account} (by ${r.deliverByTime})\n${items}`;
  }).join("\n");
  return `<b>🚚 Today's subscription deliveries</b>\n${blocks}`;
}

export function formatChangeCutoffReminder(rows: ConfirmRow[]): string {
  if (!rows.length) return "<b>⏰ Change cutoff</b>\n<i>No days approaching cutoff.</i>";
  const lines = rows.map((r) => `• ${r.account}`).join("\n");
  return `<b>⏰ Tomorrow's deliveries approach the 13:00 change cutoff</b>\n${lines}\n<i>Make any changes before 13:00 today.</i>`;
}

export function formatReconcileReminder(rows: ReconcileRow[]): string {
  if (!rows.length) return "<b>📊 Reconcile</b>\n<i>Nothing to reconcile.</i>";
  const lines = rows.map((r) =>
    `• ${r.account} — week of ${fmtDate(r.weekStart)}: shortfall ${fmtIDR(r.shortfall)}, refund due ${fmtIDR(r.refundDue)}`
  ).join("\n");
  return `<b>📊 Reconcile last week</b>\n${lines}`;
}

export function formatWeeklyDeliveryProgress(rows: DeliveryProgressRow[]): string {
  if (!rows.length) return "<b>📦 Weekly delivery progress</b>\n<i>No active accounts.</i>";
  const blocks = rows.map((r) => {
    const over = r.overBy > 0 ? ` (⚠️ over plan by ${r.overBy})` : "";
    return `<b>Week of ${fmtDate(r.weekStart)} — ${r.account}</b>\n${r.deliveredPcs} out of ${r.weekPlannedPcs}\n${r.remaining} pcs remaining in quota${over}`;
  }).join("\n\n");
  return `<b>📦 Weekly delivery progress</b>\n\n${blocks}`;
}

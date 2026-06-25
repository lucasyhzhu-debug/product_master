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

const CHUNK_BUDGET = 4000;
const MAX_SECTION_LEN = 3800;
const TRUNCATE_MARKER = "\n  …[truncated — check dashboard]";

/**
 * Greedy section packer. Mirrors salesSummaryFormat.ts:
 * - header goes on the first chunk.
 * - each block is appended to the current chunk when it fits; otherwise a new
 *   chunk is started with a "…continued (N)" prefix.
 * - blocks longer than MAX_SECTION_LEN are truncated at the last newline before
 *   the cap so no HTML tag/entity is split mid-token.
 * - always returns at least one chunk (the header alone when blocks is empty).
 */
function packChunks(header: string, blocks: string[]): string[] {
  const safeBlocks = blocks.map((b) => {
    if (b.length <= MAX_SECTION_LEN) return b;
    const cap = MAX_SECTION_LEN - TRUNCATE_MARKER.length;
    const nl = b.lastIndexOf("\n", cap);
    return b.slice(0, nl > 0 ? nl : cap) + TRUNCATE_MARKER;
  });

  const chunks: string[] = [];
  let current = header;
  for (const block of safeBlocks) {
    const addition = `\n\n${block}`;
    if (current.length + addition.length > CHUNK_BUDGET) {
      chunks.push(current);
      current = `<i>…continued (${chunks.length + 1})</i>\n\n${block}`;
    } else {
      current += addition;
    }
  }
  chunks.push(current);
  return chunks;
}

export function formatConfirmReminder(rows: ConfirmRow[]): string[] {
  if (!rows.length) return ["<b>✅ Confirm next week</b>\n<i>Nothing awaiting confirmation.</i>"];
  const header = "<b>📋 Confirm next week's schedule</b>";
  const blocks = rows.map((r) => `• ${r.account} — week of ${fmtDate(r.weekStart)}`);
  const chunks = packChunks(header, blocks);
  // Append the closing instruction to the final chunk.
  chunks[chunks.length - 1] += "\n<i>Open the scheduler to confirm.</i>";
  return chunks;
}

export function formatInvoiceDueReminder(rows: InvoiceDueRow[]): string[] {
  if (!rows.length) return ["<b>🧾 Weekly invoices</b>\n<i>Nothing due.</i>"];
  const header = "<b>🧾 Weekly invoices to create / mark paid</b>";
  const blocks = rows.map((r) =>
    `• ${r.account} — ${fmtDate(r.weekStart)}: ${fmtIDR(r.amountDue)} (${r.weekStatus})`
  );
  return packChunks(header, blocks);
}

export function formatTodayDeliveries(rows: TodayDeliveriesRow[]): string[] {
  if (!rows.length) return ["<b>🚚 Today's subscription deliveries</b>\n<i>None today.</i>"];
  const header = "<b>🚚 Today's subscription deliveries</b>";
  const blocks = rows.map((r) => {
    const items = r.lines.map((l) =>
      `   - ${l.qty}× ${l.missingProduct ? "⚠️ " : ""}${l.productName}${l.missingProduct ? " (deleted product — verify in app)" : ""}`
    ).join("\n");
    return `• ${r.account} (by ${r.deliverByTime})\n${items}`;
  });
  return packChunks(header, blocks);
}

export function formatChangeCutoffReminder(rows: ConfirmRow[]): string[] {
  if (!rows.length) return ["<b>⏰ Change cutoff</b>\n<i>No days approaching cutoff.</i>"];
  const header = "<b>⏰ Tomorrow's deliveries approach the 13:00 change cutoff</b>";
  const blocks = rows.map((r) => `• ${r.account}`);
  const chunks = packChunks(header, blocks);
  chunks[chunks.length - 1] += "\n<i>Make any changes before 13:00 today.</i>";
  return chunks;
}

export function formatReconcileReminder(rows: ReconcileRow[]): string[] {
  if (!rows.length) return ["<b>📊 Reconcile</b>\n<i>Nothing to reconcile.</i>"];
  const header = "<b>📊 Reconcile last week</b>";
  const blocks = rows.map((r) =>
    `• ${r.account} — week of ${fmtDate(r.weekStart)}: shortfall ${fmtIDR(r.shortfall)}, refund due ${fmtIDR(r.refundDue)}`
  );
  return packChunks(header, blocks);
}

export function formatWeeklyDeliveryProgress(rows: DeliveryProgressRow[]): string[] {
  if (!rows.length) return ["<b>📦 Weekly delivery progress</b>\n<i>No active accounts.</i>"];
  const header = "<b>📦 Weekly delivery progress</b>";
  const blocks = rows.map((r) => {
    const over = r.overBy > 0 ? ` (⚠️ over plan by ${r.overBy})` : "";
    return `<b>Week of ${fmtDate(r.weekStart)} — ${r.account}</b>\n${r.deliveredPcs} out of ${r.weekPlannedPcs}\n${r.remaining} pcs remaining in quota${over}`;
  });
  return packChunks(header, blocks);
}

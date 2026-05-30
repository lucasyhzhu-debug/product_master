import { escapeHtml } from "../lib/telegramHtml";
import { WIB_OFFSET_MS } from "../lib/periodRange";
import { daysLate } from "./queries/dueClassification";
import type { KanbanOrderCard } from "../orders/helpers/kanbanBuilders";

export type FormatReason = "morning" | "midday" | "command";

export interface FormatInput {
  reason: FormatReason;
  overdue: KanbanOrderCard[];   // paid, dueDate's WIB day < today
  dueToday: KanbanOrderCard[];  // paid, dueDate within today's WIB day
  counts: { total: number; delivery: number; pickup: number };
  generatedAt: number;          // UTC ms — the instant buckets were computed against
}

export interface UnpaidAlertInput {
  // No `reason` field: the alert fires for every reason (morning/midday/command) with an
  // identical header, so threading reason here would be dead input.
  unpaidOverdue: KanbanOrderCard[];
  generatedAt: number;
}

const CHUNK_BUDGET = 4000;   // safety margin under Telegram's 4096-char hard limit
// A single rendered block must fit under CHUNK_BUDGET - continuation_header so that
// starting a new chunk for it can't blow past 4096. 3800 leaves headroom.
const MAX_ORDER_LEN = 3800;
const TRUNCATE_MARKER = "\n  …[truncated — check order in app]";
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function wibParts(utcMs: number) {
  const d = new Date(utcMs + WIB_OFFSET_MS);
  return {
    weekday: WEEKDAY[d.getUTCDay()],
    day: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()],
    year: d.getUTCFullYear(),
    hh: String(d.getUTCHours()).padStart(2, "0"),
    mm: String(d.getUTCMinutes()).padStart(2, "0"),
  };
}

function formatDueDate(utcMs: number): string {
  const p = wibParts(utcMs);
  return `${p.weekday} ${p.day} ${p.month}`;
}

function formatDaysLate(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"} late`;
}

// Indonesian thousands separator is ".", e.g. 150000 → "Rp 150.000". Precise (not
// abbreviated like salesSummary) because this is an actionable amount-owed for chasing.
function formatIdr(n: number): string {
  return "Rp " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function buildHeader(
  reason: FormatReason,
  generatedAt: number,
  counts: FormatInput["counts"],
  overdueCount: number,
  isEmpty: boolean,
): string {
  const p = wibParts(generatedAt);
  const dateStr = `${p.weekday} ${p.day} ${p.month} ${p.year}`;
  let title: string;
  if (reason === "morning") {
    title = `<b>Pack List — ${dateStr}</b>`;
  } else if (reason === "midday") {
    title = `<b>Still Pending — ${dateStr} · ${p.hh}:${p.mm}</b>`;
  } else {
    title = `<b>Pack List (on-demand) — ${dateStr} · ${p.hh}:${p.mm}</b>`;
  }
  if (isEmpty) {
    return `${title}\n\nNothing to pack today. ✅`;
  }
  const label = reason === "midday" ? "orders not yet shipped" : "orders to pack today";
  const overdueSeg = overdueCount > 0 ? ` · ${overdueCount} overdue` : "";
  return `${title}\n\n${counts.total} ${label}${overdueSeg} · ${counts.delivery} delivery · ${counts.pickup} pickup`;
}

function truncate(rendered: string): string {
  if (rendered.length > MAX_ORDER_LEN) {
    return rendered.slice(0, MAX_ORDER_LEN - TRUNCATE_MARKER.length) + TRUNCATE_MARKER;
  }
  return rendered;
}

// Render one packing order. When `nowForDueLine` is provided (overdue orders), append
// a "due {date} · N days late" line; pass null for due-today orders.
function renderOrder(card: KanbanOrderCard, nowForDueLine: number | null): string {
  const lines: string[] = [];
  const rush = card.expedited ? "  [rush]" : "";
  lines.push(`<b>${escapeHtml(card.orderNumber)}</b> — ${escapeHtml(card.customerName)}${rush}`);
  for (const it of card.items) {
    lines.push(`  ${it.quantity}× ${escapeHtml(it.productName)}`);
  }
  if (card.deliveryType === "Delivery") {
    const addr = card.deliveryAddress && card.deliveryAddress.trim().length > 0
      ? escapeHtml(card.deliveryAddress)
      : "(no address — check order)";
    lines.push(`  Delivery → ${addr}`);
  } else if (card.deliveryType === "Pickup") {
    lines.push(`  Pickup`);
  } else if (card.deliveryType) {
    lines.push(`  ${escapeHtml(card.deliveryType)}`);
  }
  if (card.notes && card.notes.trim().length > 0) {
    lines.push(`  📝 ${escapeHtml(card.notes)}`);
  }
  if (nowForDueLine !== null && card.dueDate !== undefined) {
    lines.push(`  due ${formatDueDate(card.dueDate)} · ${formatDaysLate(daysLate(card.dueDate, nowForDueLine))}`);
  }
  return truncate(lines.join("\n"));
}

function renderUnpaidOrder(card: KanbanOrderCard, now: number): string {
  const amount = card.finalTotal ?? card.totalAmount;
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(card.orderNumber)}</b> — ${escapeHtml(card.customerName)} · ${formatIdr(amount)}`);
  if (card.dueDate !== undefined) {
    lines.push(`  due ${formatDueDate(card.dueDate)} · ${formatDaysLate(daysLate(card.dueDate, now))}`);
  }
  // Privacy: do NOT send the customer's phone number to the pack-list group (packers see this
  // channel). Order number + name + amount are enough to find the order; staff look up contact
  // details in the app to chase payment.
  lines.push(`  📞 look up contact in app`);
  return truncate(lines.join("\n"));
}

// Pack a header + ordered blocks into <=4096-char chunks, preserving block boundaries.
// Known cosmetic limitation: section-header blocks (⚠️ OVERDUE / Due Today) are treated as
// ordinary blocks, so a header can land as the last block of a chunk with its orders flowing
// into the next chunk's continuation. No data is lost/duplicated; only the visual grouping
// splits. Fixing would need block look-ahead — not worth it for the rare mid-section split.
function chunkBlocks(header: string, blocks: string[]): string[] {
  const chunks: string[] = [];
  let current = header;
  for (const block of blocks) {
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

export function formatPackList(input: FormatInput): string[] {
  const isEmpty = input.overdue.length + input.dueToday.length === 0;
  const header = buildHeader(input.reason, input.generatedAt, input.counts, input.overdue.length, isEmpty);
  if (isEmpty) {
    return [header];
  }

  const blocks: string[] = [];
  if (input.overdue.length > 0) {
    // Sectioned: OVERDUE first (with days-late lines), then Due Today.
    blocks.push(`<b>⚠️ OVERDUE (${input.overdue.length})</b>`);
    for (const c of input.overdue) blocks.push(renderOrder(c, input.generatedAt));
    // Only emit the Due Today header when there's something under it — otherwise an
    // all-overdue day renders a dangling "Due Today (0)" label.
    if (input.dueToday.length > 0) {
      blocks.push(`<b>Due Today (${input.dueToday.length})</b>`);
      for (const c of input.dueToday) blocks.push(renderOrder(c, null));
    }
  } else {
    // Nothing overdue → flat list, same content as the pre-SEED-001 output. (Ordering is now
    // pinned by the query's 3-key sort incl. _creationTime, so same-dueDate/same-rush ties are
    // deterministic rather than relying on array stability — strictly more deterministic.)
    for (const c of input.dueToday) blocks.push(renderOrder(c, null));
  }
  return chunkBlocks(header, blocks);
}

export function formatUnpaidAlert(input: UnpaidAlertInput): string[] {
  if (input.unpaidOverdue.length === 0) return [];
  const p = wibParts(input.generatedAt);
  const dateStr = `${p.weekday} ${p.day} ${p.month} ${p.year}`;
  const n = input.unpaidOverdue.length;
  const header =
    `<b>🚨 OVERDUE — Unpaid &amp; Past Due — ${dateStr}</b>\n\n` +
    `${n} ${n === 1 ? "order" : "orders"} past their delivery date with no payment — chase now.`;
  const blocks = input.unpaidOverdue.map((c) => renderUnpaidOrder(c, input.generatedAt));
  return chunkBlocks(header, blocks);
}

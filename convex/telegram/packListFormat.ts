import { escapeHtml } from "../lib/telegramHtml";
import { WIB_OFFSET_MS } from "../lib/periodRange";
import type { KanbanOrderCard } from "../orders/helpers/kanbanBuilders";

export type FormatReason = "morning" | "midday" | "command";

export interface FormatInput {
  reason: FormatReason;
  cards: KanbanOrderCard[];
  counts: { total: number; delivery: number; pickup: number };
  generatedAt: number;       // UTC ms
}

const CHUNK_BUDGET = 4000;   // safety margin under Telegram's 4096-char hard limit
// Continuation header `<i>…continued (NNN)</i>\n\n` is ~30 chars max. A single
// rendered order must fit under `CHUNK_BUDGET - continuation_header` so that
// starting a new chunk for it doesn't blow past 4096. 3800 leaves 200 chars
// headroom for the continuation header + small slack.
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

function buildHeader(
  reason: FormatReason,
  generatedAt: number,
  counts: FormatInput["counts"],
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
  // Empty signal derives from cards.length (defensive — see I2 in staffreview).
  // The query enforces counts.total === cards.length, but the formatter's
  // contract should be robust to future callers passing inconsistent counts.
  if (isEmpty) {
    return `${title}\n\nNothing to pack today. ✅`;
  }
  const label = reason === "midday" ? "orders not yet shipped" : "orders to pack today";
  return `${title}\n\n${counts.total} ${label} · ${counts.delivery} delivery · ${counts.pickup} pickup`;
}

function renderOrder(card: KanbanOrderCard): string {
  const lines: string[] = [];
  const rush = card.expedited ? "  [rush]" : "";
  lines.push(`<b>${escapeHtml(card.orderNumber)}</b> — ${escapeHtml(card.customerName)}${rush}`);
  for (const it of card.items) {
    lines.push(`  ${it.quantity}× ${escapeHtml(it.productName)}`);
  }
  if (card.deliveryType === "Delivery") {
    // R1: surface missing-address data integrity gap instead of silently rendering "Delivery" alone.
    const addr = card.deliveryAddress && card.deliveryAddress.trim().length > 0
      ? escapeHtml(card.deliveryAddress)
      : "(no address — check order)";
    lines.push(`  Delivery → ${addr}`);
  } else if (card.deliveryType === "Pickup") {
    lines.push(`  Pickup`);
  } else if (card.deliveryType) {
    // Future-proofing: unknown delivery type, render as-is
    lines.push(`  ${escapeHtml(card.deliveryType)}`);
  }
  if (card.notes && card.notes.trim().length > 0) {
    lines.push(`  📝 ${escapeHtml(card.notes)}`);
  }
  return lines.join("\n");
}

export function formatPackList(input: FormatInput): string[] {
  const isEmpty = input.cards.length === 0;
  const header = buildHeader(input.reason, input.generatedAt, input.counts, isEmpty);
  if (isEmpty) {
    return [header];
  }

  // Sort: expedited first, then dueDate ascending (undefined → Infinity).
  // Caller is expected to have applied this already, but we apply defensively.
  const sorted = [...input.cards].sort((a, b) => {
    const ea = a.expedited ? 0 : 1;
    const eb = b.expedited ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity);
  });

  const chunks: string[] = [];
  let current = header;
  for (const c of sorted) {
    let rendered = renderOrder(c);
    // C1 (triple-review): if a single order exceeds MAX_ORDER_LEN, truncate so
    // the new-chunk path `continuation_header + rendered` can't blow past 4096
    // (Telegram's hard limit — returns 400 above it). Today's realistic max is
    // ~780 chars, but a pathological order (long notes, many items) could trip
    // this without the guard.
    if (rendered.length > MAX_ORDER_LEN) {
      rendered = rendered.slice(0, MAX_ORDER_LEN - TRUNCATE_MARKER.length) + TRUNCATE_MARKER;
    }
    const addition = `\n\n${rendered}`;
    if (current.length + addition.length > CHUNK_BUDGET) {
      chunks.push(current);
      current = `<i>…continued (${chunks.length + 1})</i>\n\n${rendered}`;
    } else {
      current += addition;
    }
  }
  chunks.push(current);
  return chunks;
}

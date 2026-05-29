// convex/telegram/salesSummary/salesSummaryFormat.ts
import { escapeHtml } from "../../lib/telegramHtml";
import { WIB_OFFSET_MS } from "../../lib/periodRange";
import type { SalesSummaryData, ChannelSummary, ProductTally } from "./salesSummaryQuery";

export interface RefreshStatus { gofood: "ok" | "fail" | "skip"; k3mart: "ok" | "fail" | "skip"; direct: "ok" | "fail" | "skip"; }
export interface FormatInput { data: SalesSummaryData; refresh: RefreshStatus; }

const CHUNK_BUDGET = 4000;
const MAX_SECTION_LEN = 3800;
const TRUNCATE_MARKER = "\n  …[truncated — check dashboard]";
const CHANNEL_EMOJI: Record<ChannelSummary["platform"], string> = { GoFood: "🛵", K3Mart: "🏪", Direct: "🏠" };

function rupiah(n: number): string {
  // 999_500 (not 1_000_000) so values that would round to "1000K" render "1.0M".
  if (n >= 999_500) return `Rp ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)}K`;
  return `Rp ${n}`;
}

function delta(pct: number | null, suffix = ""): string {
  if (pct === null) return "";
  const arrow = pct >= 0 ? "▲" : "▼";
  return `  ${arrow} ${Math.abs(Math.round(pct))}%${suffix}`;
}

function products(list: ProductTally[]): string {
  if (list.length === 0) return "";
  return "\n      " + list.map((p) => `${p.qty}× ${escapeHtml(p.name)}`).join(" · ");
}

function renderChannel(ch: ChannelSummary): string {
  // Each K3Mart externalRevenue row is one consignment product-line entry
  // (transactionCount: 1 per SKU), NOT one customer order — so its summed
  // "orders" is a product-line count, not an order count. Omit it to avoid a
  // misleading "(N orders)". GoFood/Direct counts are genuine order counts.
  const count = ch.platform === "K3Mart" ? "" : ` (${ch.orders} orders)`;
  const head = `${CHANNEL_EMOJI[ch.platform]} <b>${ch.platform}</b> — ${rupiah(ch.gross)}${count}${delta(ch.deltaPct)}`;
  if (ch.platform === "GoFood") {
    const lines = ch.outlets.map((o) =>
      `  • ${escapeHtml(o.name)} — ${rupiah(o.gross)}${products(o.products)}`);
    return [head, ...lines].join("\n");
  }
  return head + products(ch.products);
}

function header(data: SalesSummaryData): string {
  const title = data.cadence === "daily"
    ? `Sales — ${data.periodLabel} (end of day)`
    : data.cadence === "weekly"
      ? `Weekly Sales — ${data.periodLabel}`
      : `Monthly Sales — ${data.periodLabel}`;
  const cmp = data.cadence === "weekly" ? " vs prior week" : data.cadence === "monthly" ? " vs prior month" : "";
  const total = `Total: ${rupiah(data.grandTotal.gross)} · ${data.grandTotal.orders} orders${delta(data.grandTotal.deltaPct, cmp)}`;
  return `📊 <b>${title}</b>\n${total}`;
}

function footer(refresh: RefreshStatus, generatedAt: number): string {
  const mark = (s: "ok" | "fail" | "skip") => (s === "ok" ? "✓" : s === "fail" ? "✗" : "–");
  const wib = new Date(generatedAt + WIB_OFFSET_MS);
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  const mm = String(wib.getUTCMinutes()).padStart(2, "0");
  return `\n<i>Refreshed ${hh}:${mm} WIB · GoFood ${mark(refresh.gofood)} K3Mart ${mark(refresh.k3mart)} Direct ${mark(refresh.direct)}</i>`;
}

export function formatSalesSummary(input: FormatInput): string[] {
  const { data, refresh } = input;
  if (data.channels.length === 0) {
    const when = data.cadence === "daily" ? "today" : `for ${data.periodLabel}`;
    return [`${header(data)}\n\nNo sales recorded ${when}.`];
  }

  const sections = data.channels.map(renderChannel).map((s) => {
    if (s.length <= MAX_SECTION_LEN) return s;
    // Cut at the last newline before the cap so we drop whole lines instead of
    // splitting an HTML entity/tag mid-token (which Telegram's HTML parser rejects).
    const cap = MAX_SECTION_LEN - TRUNCATE_MARKER.length;
    const nl = s.lastIndexOf("\n", cap);
    return s.slice(0, nl > 0 ? nl : cap) + TRUNCATE_MARKER;
  });

  const chunks: string[] = [];
  let current = header(data);
  for (const sec of sections) {
    const addition = `\n\n${sec}`;
    if (current.length + addition.length > CHUNK_BUDGET) {
      chunks.push(current);
      current = `<i>…continued (${chunks.length + 1})</i>\n\n${sec}`;
    } else {
      current += addition;
    }
  }
  // Daily-only refresh footer appended to the final chunk (skip if it would overflow → own chunk).
  if (data.cadence === "daily") {
    const f = footer(refresh, data.generatedAt);
    if (current.length + f.length > CHUNK_BUDGET) { chunks.push(current); current = f.trimStart(); }
    else current += f;
  }
  chunks.push(current);
  return chunks;
}

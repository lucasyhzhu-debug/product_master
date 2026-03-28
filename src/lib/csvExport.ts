/**
 * CSV Export for Weekly Income Statement
 *
 * Generates a flat-format CSV with all P&L line items, confidence flags,
 * previous week comparison, and data quality footer notes.
 *
 * Columns: period, section, channel, line_item, amount_idr, confidence, prev_week_idr, delta_pct
 */

// ── Types matching the backend query return shape ──
// These interfaces are intentionally duplicated (not imported from Convex)
// because the CSV module runs on the client and must not import server code.

type Confidence = "exact" | "calculated" | "inferred" | "missing";

interface ChannelData {
  source: string;
  displayName: string;
  gross: number;
  netRevenue: number;
  discount: number;
  commission: number;
  adBurn: number;
  promoBurn: number;
  revShare: number;
  confidence: Confidence;
  cogs: {
    production: number;
    packaging: number;
    total: number;
  };
}

interface GapAnalysis {
  unmappedProducts: Array<{ name: string; count: number; revenue: number }>;
  zeroCostComponents: Array<{ name: string; code: string }>;
  missingChannels: Array<{
    source: string;
    displayName: string;
    reason: string;
  }>;
  totalMappedProducts: number;
  totalProducts: number;
}

interface WeekData {
  channels: ChannelData[];
  totalGross: number;
  totalDiscounts: number;
  totalCommission: number;
  totalAdBurn: number;
  totalPromoBurn: number;
  totalRevShare: number;
  totalDeductions: number;
  netRevenue: number;
  totalProductionCogs: number;
  totalPackagingCogs: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  gapAnalysis: GapAnalysis;
  // P&L below Gross Profit (Phase 49)
  opex: Array<{ code: string; name: string; total: number }>;
  totalOpEx: number;
  ebit: number;
  ebitMarginPercent: number | null;
  // EBITDA (Phase 69)
  depreciationAmount: number;
  amortizationAmount: number;
  ebitda: number;
  ebitdaMarginPercent: number | null;
  otherItems: Array<{ code: string; name: string; total: number }>;
  totalOther: number;
  netIncome: number;
  netMarginPercent: number | null;
}

export interface IncomeStatementData {
  weekStart?: number;
  weekEnd?: number;
  periodStart?: number;
  periodEnd?: number;
  current: WeekData;
  previous: WeekData;
  deltas: {
    grossRevenue: { amount: number; percent: number | null };
    netRevenue: { amount: number; percent: number | null };
    totalCogs: { amount: number; percent: number | null };
    grossProfit: { amount: number; percent: number | null };
    grossMarginPp: number | null;
    // Phase 49: OpEx/EBIT/Other/NetIncome deltas
    totalOpEx: { amount: number; percent: number | null };
    ebit: { amount: number; percent: number | null };
    ebitMarginPp: number | null;
    // EBITDA deltas (Phase 69)
    ebitda: { amount: number; percent: number | null };
    ebitdaMarginPp: number | null;
    totalOther: { amount: number; percent: number | null };
    netIncome: { amount: number; percent: number | null };
    netMarginPp: number | null;
  };
}

import { computeDelta as computeDeltaObj } from "@/lib/financialHelpers";

// ── Helpers ──

/** Format delta percentage from a pre-computed delta object. */
function formatPrecomputedDelta(d: { percent: number | null } | null): string {
  if (!d || d.percent === null) return "";
  return d.percent.toFixed(1);
}

/** Format delta percentage for CSV output using shared computation. */
function formatDeltaPct(current: number, previous: number): string {
  const delta = computeDeltaObj(current, previous);
  if (delta.percent === null) return "";
  return delta.percent.toFixed(1);
}

// ── Main export function ──

export function generateIncomeStatementCSV(
  data: IncomeStatementData,
  weekLabel: string
): string {
  const rows: string[][] = [];

  // Header row
  rows.push([
    "period",
    "section",
    "channel",
    "line_item",
    "amount_idr",
    "confidence",
    "prev_period_idr",
    "delta_pct",
  ]);

  const periodStr = weekLabel;

  // --- REVENUE SECTION ---

  // Gross Revenue total
  rows.push([
    periodStr,
    "revenue",
    "All",
    "Gross Revenue",
    String(data.current.totalGross),
    "exact",
    String(data.previous.totalGross),
    formatPrecomputedDelta(data.deltas.grossRevenue),
  ]);

  // Per-channel gross revenue
  for (const ch of data.current.channels) {
    const prevCh = data.previous.channels.find((p) => p.source === ch.source);
    const prevGross = prevCh?.gross ?? 0;
    const pct =
      data.current.totalGross > 0
        ? ((ch.gross / data.current.totalGross) * 100).toFixed(1) + "% of gross"
        : "";
    rows.push([
      periodStr,
      "revenue",
      ch.displayName,
      `Gross Revenue (${pct})`,
      String(ch.gross),
      ch.confidence,
      String(prevGross),
      "",
    ]);
  }

  // --- DEDUCTIONS SECTION ---
  // ALWAYS include all deduction rows (even when zero). Accounting convention:
  // zero lines provide structure, and CSV must match the UI P&L table.

  // Customer Discounts & Vouchers (aggregate)
  rows.push([
    periodStr,
    "deductions",
    "All",
    "Customer Discounts & Vouchers",
    String(-data.current.totalDiscounts),
    "exact",
    String(-data.previous.totalDiscounts),
    formatDeltaPct(data.current.totalDiscounts, data.previous.totalDiscounts),
  ]);

  // Platform Commissions (aggregate)
  rows.push([
    periodStr,
    "deductions",
    "All",
    "Platform Commissions",
    String(-data.current.totalCommission),
    "exact",
    String(-data.previous.totalCommission),
    formatDeltaPct(data.current.totalCommission, data.previous.totalCommission),
  ]);

  // Ad Spend & Promos (aggregate)
  const currentAdPromo =
    data.current.totalAdBurn + data.current.totalPromoBurn;
  const previousAdPromo =
    data.previous.totalAdBurn + data.previous.totalPromoBurn;
  rows.push([
    periodStr,
    "deductions",
    "All",
    "Ad Spend & Promos",
    String(-currentAdPromo),
    "exact",
    String(-previousAdPromo),
    formatDeltaPct(currentAdPromo, previousAdPromo),
  ]);

  // Consignment Rev Share (aggregate)
  rows.push([
    periodStr,
    "deductions",
    "All",
    "Consignment Rev Share",
    String(-data.current.totalRevShare),
    "exact",
    String(-data.previous.totalRevShare),
    formatDeltaPct(data.current.totalRevShare, data.previous.totalRevShare),
  ]);

  // Per-channel deduction breakdown (richer data for financial analysts)
  for (const ch of data.current.channels) {
    const prevCh = data.previous.channels.find((p) => p.source === ch.source);
    if (ch.discount > 0 || (prevCh?.discount ?? 0) > 0) {
      rows.push([
        periodStr,
        "deductions",
        ch.displayName,
        "Customer Discounts",
        String(-ch.discount),
        "exact",
        String(-(prevCh?.discount ?? 0)),
        formatDeltaPct(ch.discount, prevCh?.discount ?? 0),
      ]);
    }
    if (ch.commission > 0 || (prevCh?.commission ?? 0) > 0) {
      rows.push([
        periodStr,
        "deductions",
        ch.displayName,
        "Platform Commission",
        String(-ch.commission),
        "exact",
        String(-(prevCh?.commission ?? 0)),
        formatDeltaPct(ch.commission, prevCh?.commission ?? 0),
      ]);
    }
    const chAdPromo = ch.adBurn + ch.promoBurn;
    const prevChAdPromo = (prevCh?.adBurn ?? 0) + (prevCh?.promoBurn ?? 0);
    if (chAdPromo > 0 || prevChAdPromo > 0) {
      rows.push([
        periodStr,
        "deductions",
        ch.displayName,
        "Ad Spend & Promos",
        String(-chAdPromo),
        "exact",
        String(-prevChAdPromo),
        formatDeltaPct(chAdPromo, prevChAdPromo),
      ]);
    }
    if (ch.revShare > 0 || (prevCh?.revShare ?? 0) > 0) {
      rows.push([
        periodStr,
        "deductions",
        ch.displayName,
        "Consignment Rev Share",
        String(-ch.revShare),
        "exact",
        String(-(prevCh?.revShare ?? 0)),
        formatDeltaPct(ch.revShare, prevCh?.revShare ?? 0),
      ]);
    }
  }

  // Net Revenue
  rows.push([
    periodStr,
    "summary",
    "All",
    "Net Revenue",
    String(data.current.netRevenue),
    "exact",
    String(data.previous.netRevenue),
    formatPrecomputedDelta(data.deltas.netRevenue),
  ]);

  // --- COGS SECTION ---

  rows.push([
    periodStr,
    "cogs",
    "All",
    "Production COGS (Balls)",
    String(-data.current.totalProductionCogs),
    "calculated",
    String(-data.previous.totalProductionCogs),
    formatDeltaPct(
      data.current.totalProductionCogs,
      data.previous.totalProductionCogs
    ),
  ]);

  rows.push([
    periodStr,
    "cogs",
    "All",
    "Packaging COGS",
    String(-data.current.totalPackagingCogs),
    "calculated",
    String(-data.previous.totalPackagingCogs),
    formatDeltaPct(
      data.current.totalPackagingCogs,
      data.previous.totalPackagingCogs
    ),
  ]);

  rows.push([
    periodStr,
    "cogs",
    "All",
    "Total COGS",
    String(-data.current.totalCogs),
    "calculated",
    String(-data.previous.totalCogs),
    formatPrecomputedDelta(data.deltas.totalCogs),
  ]);

  // --- GROSS PROFIT ---

  rows.push([
    periodStr,
    "summary",
    "All",
    "Gross Profit",
    String(data.current.grossProfit),
    "calculated",
    String(data.previous.grossProfit),
    formatPrecomputedDelta(data.deltas.grossProfit),
  ]);

  const marginStr =
    data.current.grossMarginPercent !== null
      ? data.current.grossMarginPercent.toFixed(1) + "%"
      : "N/A";
  const prevMarginStr =
    data.previous.grossMarginPercent !== null
      ? data.previous.grossMarginPercent.toFixed(1) + "%"
      : "N/A";
  rows.push([
    periodStr,
    "summary",
    "All",
    "Gross Margin %",
    marginStr,
    "",
    prevMarginStr,
    data.deltas.grossMarginPp !== null
      ? data.deltas.grossMarginPp.toFixed(1) + "pp"
      : "",
  ]);

  // --- OPERATING EXPENSES SECTION ---

  // Per OpEx account row
  for (const item of data.current.opex) {
    const prevItem = data.previous.opex.find((p) => p.code === item.code);
    const prevTotal = prevItem?.total ?? 0;
    rows.push([
      periodStr,
      "opex",
      "All",
      `${item.code} ${item.name}`,
      String(-item.total),
      "exact",
      String(-prevTotal),
      formatDeltaPct(item.total, prevTotal),
    ]);
  }

  // Include previous-only items not in current
  for (const prevItem of data.previous.opex) {
    if (!data.current.opex.find((c) => c.code === prevItem.code)) {
      rows.push([
        periodStr,
        "opex",
        "All",
        `${prevItem.code} ${prevItem.name}`,
        String(0),
        "exact",
        String(-prevItem.total),
        "",
      ]);
    }
  }

  // Total Operating Expenses
  rows.push([
    periodStr,
    "opex",
    "All",
    "Total Operating Expenses",
    String(-data.current.totalOpEx),
    "exact",
    String(-data.previous.totalOpEx),
    formatPrecomputedDelta(data.deltas.totalOpEx),
  ]);

  // EBIT (Operating Profit)
  rows.push([
    periodStr,
    "summary",
    "All",
    "EBIT (Operating Profit)",
    String(data.current.ebit),
    "exact",
    String(data.previous.ebit),
    formatPrecomputedDelta(data.deltas.ebit),
  ]);

  // EBIT Margin %
  const ebitMarginStr =
    data.current.ebitMarginPercent !== null
      ? data.current.ebitMarginPercent.toFixed(1) + "%"
      : "N/A";
  const prevEbitMarginStr =
    data.previous.ebitMarginPercent !== null
      ? data.previous.ebitMarginPercent.toFixed(1) + "%"
      : "N/A";
  rows.push([
    periodStr,
    "summary",
    "All",
    "EBIT Margin %",
    ebitMarginStr,
    "",
    prevEbitMarginStr,
    data.deltas.ebitMarginPp !== null
      ? data.deltas.ebitMarginPp.toFixed(1) + "pp"
      : "",
  ]);

  // EBITDA
  rows.push([
    periodStr,
    "summary",
    "All",
    "EBITDA",
    String(data.current.ebitda),
    "exact",
    String(data.previous.ebitda),
    formatPrecomputedDelta(data.deltas.ebitda),
  ]);

  // EBITDA Margin %
  const ebitdaMarginStr =
    data.current.ebitdaMarginPercent !== null
      ? data.current.ebitdaMarginPercent.toFixed(1) + "%"
      : "N/A";
  const prevEbitdaMarginStr =
    data.previous.ebitdaMarginPercent !== null
      ? data.previous.ebitdaMarginPercent.toFixed(1) + "%"
      : "N/A";
  rows.push([
    periodStr,
    "summary",
    "All",
    "EBITDA Margin %",
    ebitdaMarginStr,
    "",
    prevEbitdaMarginStr,
    data.deltas.ebitdaMarginPp !== null
      ? data.deltas.ebitdaMarginPp.toFixed(1) + "pp"
      : "",
  ]);

  // --- OTHER INCOME/EXPENSE SECTION ---

  // Per Other account row
  for (const item of data.current.otherItems) {
    const prevItem = data.previous.otherItems.find((p) => p.code === item.code);
    const prevTotal = prevItem?.total ?? 0;
    rows.push([
      periodStr,
      "other",
      "All",
      `${item.code} ${item.name}`,
      String(item.total),
      "exact",
      String(prevTotal),
      formatDeltaPct(item.total, prevTotal),
    ]);
  }

  // Include previous-only items not in current
  for (const prevItem of data.previous.otherItems) {
    if (!data.current.otherItems.find((c) => c.code === prevItem.code)) {
      rows.push([
        periodStr,
        "other",
        "All",
        `${prevItem.code} ${prevItem.name}`,
        String(0),
        "exact",
        String(prevItem.total),
        "",
      ]);
    }
  }

  // Total Other Income / Expense
  rows.push([
    periodStr,
    "other",
    "All",
    "Total Other Income / Expense",
    String(data.current.totalOther),
    "exact",
    String(data.previous.totalOther),
    formatPrecomputedDelta(data.deltas.totalOther),
  ]);

  // NET INCOME
  rows.push([
    periodStr,
    "summary",
    "All",
    "NET INCOME",
    String(data.current.netIncome),
    "exact",
    String(data.previous.netIncome),
    formatPrecomputedDelta(data.deltas.netIncome),
  ]);

  // Net Margin %
  const netMarginStr =
    data.current.netMarginPercent !== null
      ? data.current.netMarginPercent.toFixed(1) + "%"
      : "N/A";
  const prevNetMarginStr =
    data.previous.netMarginPercent !== null
      ? data.previous.netMarginPercent.toFixed(1) + "%"
      : "N/A";
  rows.push([
    periodStr,
    "summary",
    "All",
    "Net Margin %",
    netMarginStr,
    "",
    prevNetMarginStr,
    data.deltas.netMarginPp !== null
      ? data.deltas.netMarginPp.toFixed(1) + "pp"
      : "",
  ]);

  // --- FOOTER: Data Quality Notes ---

  rows.push([]); // Empty row separator
  rows.push(["# Data Quality Notes"]);

  const gap = data.current.gapAnalysis;
  rows.push([
    `# Mapped products: ${gap.totalMappedProducts}/${gap.totalProducts}`,
  ]);

  if (gap.unmappedProducts.length > 0) {
    rows.push([
      `# Unmapped products (COGS = 0): ${gap.unmappedProducts.map((p) => p.name).join(", ")}`,
    ]);
  }

  if (gap.missingChannels.length > 0) {
    for (const ch of gap.missingChannels) {
      rows.push([
        `# Missing channel: ${ch.displayName} — ${ch.reason}`,
      ]);
    }
  }

  if (gap.zeroCostComponents.length > 0) {
    rows.push([
      `# Zero-cost components: ${gap.zeroCostComponents.map((c) => c.name).join(", ")}`,
    ]);
  }

  rows.push([
    "# COGS timing: Internal order COGS uses order-time snapshot; external channel COGS uses current BOM costs",
  ]);

  // Convert to CSV string
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? "");
          // Sanitize formula injection: prefix dangerous characters with single quote
          // to prevent Excel/Sheets from interpreting cells as formulas
          const sanitized = /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
          // Escape cells containing commas, quotes, or newlines
          if (sanitized.includes(",") || sanitized.includes('"') || sanitized.includes("\n")) {
            return '"' + sanitized.replace(/"/g, '""') + '"';
          }
          return sanitized;
        })
        .join(",")
    )
    .join("\n");
}

/** Trigger a browser download of the CSV content. */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

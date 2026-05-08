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
  // Phase 75 D-15: converted expenses whose reversal JE is missing (P&L may double-count)
  missingReversals: Array<{
    expenseId: string;
    description: string;
    expenseDate: number;
    journalEntryId: string;
  }>;
}

// TODO: This WeekData interface is duplicated from the canonical definition in
// convex/reports/incomeStatement.ts. Consider extracting a shared type if Convex
// ever supports importing server types on the client without bundling server code.
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
  // EBITDA
  depreciationAmount: number;
  amortizationAmount: number;
  ebitda: number;
  ebitdaMarginPercent: number | null;
  otherItems: Array<{ code: string; name: string; total: number }>;
  totalOther: number;
  netIncome: number;
  netMarginPercent: number | null;
  // Phase 75 FIN-01: Full P&L extension (D-07, D-08, D-13)
  opexExcludingDA: number;
  depreciationAmortization: number;
  capExAmount: number;
  freeCashFlow: number;
  fcfMarginPercent: number | null;
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
    // EBITDA deltas
    ebitda: { amount: number; percent: number | null };
    ebitdaMarginPp: number | null;
    totalOther: { amount: number; percent: number | null };
    netIncome: { amount: number; percent: number | null };
    netMarginPp: number | null;
    // Phase 75 FIN-01 deltas
    opexExcludingDA: { amount: number; percent: number | null };
    depreciationAmortization: { amount: number; percent: number | null };
    capExAmount: { amount: number; percent: number | null };
    freeCashFlow: { amount: number; percent: number | null };
    fcfMarginPp: number | null;
  };
}

import { computeDelta as computeDeltaObj } from "@/lib/financialHelpers";
// Phase 76 FIN-04 (plan 01 task 1.3): cross-tier import of structural type only.
// `WeekData` carries no runtime — purely for type safety so the helper signature
// matches the backend's canonical shape. Server code is NOT bundled into the client.
import type { WeekData } from "../../convex/reports/incomeStatement";

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

// ── Internal: in-range delta computation (Phase 76 plan 01 task 1.3) ──
// Mirrors the deltas-compute block at convex/reports/incomeStatement.ts:818-894 so
// the row builder can reproduce byte-identical output for the existing single-period
// caller without needing the deltas argument. When `previous` is null, every prev
// field collapses to 0 — matches pre-refactor behavior of `String(previous?.x ?? 0)`.
function computeInRangeDeltas(
  current: WeekData,
  previous: WeekData | null,
): IncomeStatementData["deltas"] {
  const computeDeltaLocal = (c: number, p: number) => ({
    amount: c - p,
    percent: p !== 0 ? ((c - p) / p) * 100 : null,
  });
  return {
    grossRevenue: computeDeltaLocal(
      current.totalGross,
      previous?.totalGross ?? 0,
    ),
    netRevenue: computeDeltaLocal(
      current.netRevenue,
      previous?.netRevenue ?? 0,
    ),
    totalCogs: computeDeltaLocal(current.totalCogs, previous?.totalCogs ?? 0),
    grossProfit: computeDeltaLocal(
      current.grossProfit,
      previous?.grossProfit ?? 0,
    ),
    grossMarginPp:
      current.grossMarginPercent !== null &&
      previous?.grossMarginPercent != null
        ? current.grossMarginPercent - previous.grossMarginPercent
        : null,
    totalOpEx: computeDeltaLocal(current.totalOpEx, previous?.totalOpEx ?? 0),
    ebit: computeDeltaLocal(current.ebit, previous?.ebit ?? 0),
    ebitMarginPp:
      current.ebitMarginPercent !== null && previous?.ebitMarginPercent != null
        ? current.ebitMarginPercent - previous.ebitMarginPercent
        : null,
    ebitda: computeDeltaLocal(current.ebitda, previous?.ebitda ?? 0),
    ebitdaMarginPp:
      current.ebitdaMarginPercent !== null &&
      previous?.ebitdaMarginPercent != null
        ? current.ebitdaMarginPercent - previous.ebitdaMarginPercent
        : null,
    totalOther: computeDeltaLocal(
      current.totalOther,
      previous?.totalOther ?? 0,
    ),
    netIncome: computeDeltaLocal(current.netIncome, previous?.netIncome ?? 0),
    netMarginPp:
      current.netMarginPercent !== null && previous?.netMarginPercent != null
        ? current.netMarginPercent - previous.netMarginPercent
        : null,
    opexExcludingDA: computeDeltaLocal(
      current.opexExcludingDA,
      previous?.opexExcludingDA ?? 0,
    ),
    depreciationAmortization: computeDeltaLocal(
      current.depreciationAmortization,
      previous?.depreciationAmortization ?? 0,
    ),
    capExAmount: computeDeltaLocal(
      current.capExAmount,
      previous?.capExAmount ?? 0,
    ),
    freeCashFlow: computeDeltaLocal(
      current.freeCashFlow,
      previous?.freeCashFlow ?? 0,
    ),
    fcfMarginPp:
      current.fcfMarginPercent !== null && previous?.fcfMarginPercent != null
        ? current.fcfMarginPercent - previous.fcfMarginPercent
        : null,
  };
}

// ── Body row builder (Phase 76 plan 01 task 1.3) ──
// Returns body rows ONLY (no header, no footer). When `firstInRange === true`
// every prev_period_idr and delta_pct cell is empty string "" (D-05 in-range
// delta semantics). The deltas argument has been DROPPED — helper computes
// deltas internally from (current, previous) so the multi-period exporter
// never needs to pre-compute them.
export function buildIncomeStatementRows(
  periodStr: string,
  current: WeekData,
  previous: WeekData | null,
  firstInRange: boolean = false,
): string[][] {
  const rows: string[][] = [];
  const deltas = computeInRangeDeltas(current, previous);

  // --- REVENUE SECTION ---

  // Gross Revenue total
  rows.push([
    periodStr,
    "revenue",
    "All",
    "Gross Revenue",
    String(current.totalGross),
    "exact",
    firstInRange ? "" : String(previous?.totalGross ?? 0),
    firstInRange ? "" : formatPrecomputedDelta(deltas.grossRevenue),
  ]);

  // Per-channel gross revenue
  for (const ch of current.channels) {
    const prevCh = previous?.channels.find((p) => p.source === ch.source);
    const prevGross = prevCh?.gross ?? 0;
    const pct =
      current.totalGross > 0
        ? ((ch.gross / current.totalGross) * 100).toFixed(1) + "% of gross"
        : "";
    rows.push([
      periodStr,
      "revenue",
      ch.displayName,
      `Gross Revenue (${pct})`,
      String(ch.gross),
      ch.confidence,
      firstInRange ? "" : String(prevGross),
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
    String(-current.totalDiscounts),
    "exact",
    firstInRange ? "" : String(-(previous?.totalDiscounts ?? 0)),
    firstInRange
      ? ""
      : formatDeltaPct(current.totalDiscounts, previous?.totalDiscounts ?? 0),
  ]);

  // Platform Commissions (aggregate)
  rows.push([
    periodStr,
    "deductions",
    "All",
    "Platform Commissions",
    String(-current.totalCommission),
    "exact",
    firstInRange ? "" : String(-(previous?.totalCommission ?? 0)),
    firstInRange
      ? ""
      : formatDeltaPct(current.totalCommission, previous?.totalCommission ?? 0),
  ]);

  // Ad Spend & Promos (aggregate)
  const currentAdPromo = current.totalAdBurn + current.totalPromoBurn;
  const previousAdPromo =
    (previous?.totalAdBurn ?? 0) + (previous?.totalPromoBurn ?? 0);
  rows.push([
    periodStr,
    "deductions",
    "All",
    "Ad Spend & Promos",
    String(-currentAdPromo),
    "exact",
    firstInRange ? "" : String(-previousAdPromo),
    firstInRange ? "" : formatDeltaPct(currentAdPromo, previousAdPromo),
  ]);

  // Consignment Rev Share (aggregate)
  rows.push([
    periodStr,
    "deductions",
    "All",
    "Consignment Rev Share",
    String(-current.totalRevShare),
    "exact",
    firstInRange ? "" : String(-(previous?.totalRevShare ?? 0)),
    firstInRange
      ? ""
      : formatDeltaPct(current.totalRevShare, previous?.totalRevShare ?? 0),
  ]);

  // Per-channel deduction breakdown (richer data for financial analysts)
  for (const ch of current.channels) {
    const prevCh = previous?.channels.find((p) => p.source === ch.source);
    if (ch.discount > 0 || (prevCh?.discount ?? 0) > 0) {
      rows.push([
        periodStr,
        "deductions",
        ch.displayName,
        "Customer Discounts",
        String(-ch.discount),
        "exact",
        firstInRange ? "" : String(-(prevCh?.discount ?? 0)),
        firstInRange ? "" : formatDeltaPct(ch.discount, prevCh?.discount ?? 0),
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
        firstInRange ? "" : String(-(prevCh?.commission ?? 0)),
        firstInRange
          ? ""
          : formatDeltaPct(ch.commission, prevCh?.commission ?? 0),
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
        firstInRange ? "" : String(-prevChAdPromo),
        firstInRange ? "" : formatDeltaPct(chAdPromo, prevChAdPromo),
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
        firstInRange ? "" : String(-(prevCh?.revShare ?? 0)),
        firstInRange ? "" : formatDeltaPct(ch.revShare, prevCh?.revShare ?? 0),
      ]);
    }
  }

  // Net Revenue
  rows.push([
    periodStr,
    "summary",
    "All",
    "Net Revenue",
    String(current.netRevenue),
    "exact",
    firstInRange ? "" : String(previous?.netRevenue ?? 0),
    firstInRange ? "" : formatPrecomputedDelta(deltas.netRevenue),
  ]);

  // --- COGS SECTION ---

  rows.push([
    periodStr,
    "cogs",
    "All",
    "Production COGS (Balls)",
    String(-current.totalProductionCogs),
    "calculated",
    firstInRange ? "" : String(-(previous?.totalProductionCogs ?? 0)),
    firstInRange
      ? ""
      : formatDeltaPct(
          current.totalProductionCogs,
          previous?.totalProductionCogs ?? 0,
        ),
  ]);

  rows.push([
    periodStr,
    "cogs",
    "All",
    "Packaging COGS",
    String(-current.totalPackagingCogs),
    "calculated",
    firstInRange ? "" : String(-(previous?.totalPackagingCogs ?? 0)),
    firstInRange
      ? ""
      : formatDeltaPct(
          current.totalPackagingCogs,
          previous?.totalPackagingCogs ?? 0,
        ),
  ]);

  rows.push([
    periodStr,
    "cogs",
    "All",
    "Total COGS",
    String(-current.totalCogs),
    "calculated",
    firstInRange ? "" : String(-(previous?.totalCogs ?? 0)),
    firstInRange ? "" : formatPrecomputedDelta(deltas.totalCogs),
  ]);

  // --- GROSS PROFIT / CONTRIBUTION MARGIN (Phase 75 FIN-02 D-10) ---

  rows.push([
    periodStr,
    "summary",
    "All",
    "Gross Profit / Contribution Margin",
    String(current.grossProfit),
    "calculated",
    firstInRange ? "" : String(previous?.grossProfit ?? 0),
    firstInRange ? "" : formatPrecomputedDelta(deltas.grossProfit),
  ]);

  const marginStr =
    current.grossMarginPercent !== null
      ? current.grossMarginPercent.toFixed(1) + "%"
      : "N/A";
  const prevMarginStr =
    previous && previous.grossMarginPercent !== null
      ? previous.grossMarginPercent.toFixed(1) + "%"
      : "N/A";
  rows.push([
    periodStr,
    "summary",
    "All",
    "Gross Margin %",
    marginStr,
    "",
    firstInRange ? "" : prevMarginStr,
    firstInRange
      ? ""
      : deltas.grossMarginPp !== null
        ? deltas.grossMarginPp.toFixed(1) + "pp"
        : "",
  ]);

  // --- OPERATING EXPENSES SECTION ---

  // Per OpEx account row
  for (const item of current.opex) {
    const prevItem = previous?.opex.find((p) => p.code === item.code);
    const prevTotal = prevItem?.total ?? 0;
    rows.push([
      periodStr,
      "opex",
      "All",
      `${item.code} ${item.name}`,
      String(-item.total),
      "exact",
      firstInRange ? "" : String(-prevTotal),
      firstInRange ? "" : formatDeltaPct(item.total, prevTotal),
    ]);
  }

  // Include previous-only items not in current
  if (previous) {
    for (const prevItem of previous.opex) {
      if (!current.opex.find((c) => c.code === prevItem.code)) {
        rows.push([
          periodStr,
          "opex",
          "All",
          `${prevItem.code} ${prevItem.name}`,
          String(0),
          "exact",
          firstInRange ? "" : String(-prevItem.total),
          "",
        ]);
      }
    }
  }

  // Total Operating Expenses (excl. D/A) — Phase 75 D-08
  // RENAMED from "Total Operating Expenses" to signal D/A has been split out.
  // Amount uses opexExcludingDA (backend pre-filtered 6150/6160); previously used totalOpEx.
  rows.push([
    periodStr,
    "opex",
    "All",
    "Total Operating Expenses (excl. D/A)",
    String(-current.opexExcludingDA),
    "exact",
    firstInRange ? "" : String(-(previous?.opexExcludingDA ?? 0)),
    firstInRange ? "" : formatPrecomputedDelta(deltas.opexExcludingDA),
  ]);

  // EBITDA — Phase 75 D-07 (moved ABOVE EBIT per canonical EBITDA-first order)
  rows.push([
    periodStr,
    "summary",
    "All",
    "EBITDA",
    String(current.ebitda),
    "exact",
    firstInRange ? "" : String(previous?.ebitda ?? 0),
    firstInRange ? "" : formatPrecomputedDelta(deltas.ebitda),
  ]);

  // EBITDA Margin %
  const ebitdaMarginStr =
    current.ebitdaMarginPercent !== null
      ? current.ebitdaMarginPercent.toFixed(1) + "%"
      : "N/A";
  const prevEbitdaMarginStr =
    previous && previous.ebitdaMarginPercent !== null
      ? previous.ebitdaMarginPercent.toFixed(1) + "%"
      : "N/A";
  rows.push([
    periodStr,
    "summary",
    "All",
    "EBITDA Margin %",
    ebitdaMarginStr,
    "",
    firstInRange ? "" : prevEbitdaMarginStr,
    firstInRange
      ? ""
      : deltas.ebitdaMarginPp !== null
        ? deltas.ebitdaMarginPp.toFixed(1) + "pp"
        : "",
  ]);

  // Depreciation & Amortization — Phase 75 D-08, D-09 NEW
  // Extracted from 6150/6160 OpEx accounts; rendered as negative cash flow.
  rows.push([
    periodStr,
    "summary",
    "All",
    "Depreciation & Amortization",
    String(-current.depreciationAmortization),
    "exact",
    firstInRange ? "" : String(-(previous?.depreciationAmortization ?? 0)),
    firstInRange ? "" : formatPrecomputedDelta(deltas.depreciationAmortization),
  ]);

  // EBIT (Operating Profit) — Phase 75 D-07 (moved BELOW D/A per canonical order)
  rows.push([
    periodStr,
    "summary",
    "All",
    "EBIT (Operating Profit)",
    String(current.ebit),
    "exact",
    firstInRange ? "" : String(previous?.ebit ?? 0),
    firstInRange ? "" : formatPrecomputedDelta(deltas.ebit),
  ]);

  // EBIT Margin %
  const ebitMarginStr =
    current.ebitMarginPercent !== null
      ? current.ebitMarginPercent.toFixed(1) + "%"
      : "N/A";
  const prevEbitMarginStr =
    previous && previous.ebitMarginPercent !== null
      ? previous.ebitMarginPercent.toFixed(1) + "%"
      : "N/A";
  rows.push([
    periodStr,
    "summary",
    "All",
    "EBIT Margin %",
    ebitMarginStr,
    "",
    firstInRange ? "" : prevEbitMarginStr,
    firstInRange
      ? ""
      : deltas.ebitMarginPp !== null
        ? deltas.ebitMarginPp.toFixed(1) + "pp"
        : "",
  ]);

  // --- OTHER INCOME/EXPENSE SECTION ---

  // Per Other account row
  for (const item of current.otherItems) {
    const prevItem = previous?.otherItems.find((p) => p.code === item.code);
    const prevTotal = prevItem?.total ?? 0;
    rows.push([
      periodStr,
      "other",
      "All",
      `${item.code} ${item.name}`,
      String(item.total),
      "exact",
      firstInRange ? "" : String(prevTotal),
      firstInRange ? "" : formatDeltaPct(item.total, prevTotal),
    ]);
  }

  // Include previous-only items not in current
  if (previous) {
    for (const prevItem of previous.otherItems) {
      if (!current.otherItems.find((c) => c.code === prevItem.code)) {
        rows.push([
          periodStr,
          "other",
          "All",
          `${prevItem.code} ${prevItem.name}`,
          String(0),
          "exact",
          firstInRange ? "" : String(prevItem.total),
          "",
        ]);
      }
    }
  }

  // Total Other Income / Expense
  rows.push([
    periodStr,
    "other",
    "All",
    "Total Other Income / Expense",
    String(current.totalOther),
    "exact",
    firstInRange ? "" : String(previous?.totalOther ?? 0),
    firstInRange ? "" : formatPrecomputedDelta(deltas.totalOther),
  ]);

  // NET INCOME
  rows.push([
    periodStr,
    "summary",
    "All",
    "NET INCOME",
    String(current.netIncome),
    "exact",
    firstInRange ? "" : String(previous?.netIncome ?? 0),
    firstInRange ? "" : formatPrecomputedDelta(deltas.netIncome),
  ]);

  // Net Margin %
  const netMarginStr =
    current.netMarginPercent !== null
      ? current.netMarginPercent.toFixed(1) + "%"
      : "N/A";
  const prevNetMarginStr =
    previous && previous.netMarginPercent !== null
      ? previous.netMarginPercent.toFixed(1) + "%"
      : "N/A";
  rows.push([
    periodStr,
    "summary",
    "All",
    "Net Margin %",
    netMarginStr,
    "",
    firstInRange ? "" : prevNetMarginStr,
    firstInRange
      ? ""
      : deltas.netMarginPp !== null
        ? deltas.netMarginPp.toFixed(1) + "pp"
        : "",
  ]);

  // --- CAPEX + FREE CASH FLOW BLOCK (Phase 75 D-13) ---
  // Always emit, even at 0 (D-14 — structural row for accountant handoff).

  // CapEx (Fixed Asset Acquisitions) — D-13 NEW (negative cash outflow)
  rows.push([
    periodStr,
    "summary",
    "All",
    "CapEx (Fixed Asset Acquisitions)",
    String(-current.capExAmount),
    "exact",
    firstInRange ? "" : String(-(previous?.capExAmount ?? 0)),
    firstInRange ? "" : formatPrecomputedDelta(deltas.capExAmount),
  ]);

  // Free Cash Flow — D-13 NEW (can be negative if acquisitions > NI + D&A)
  rows.push([
    periodStr,
    "summary",
    "All",
    "Free Cash Flow",
    String(current.freeCashFlow),
    "calculated",
    firstInRange ? "" : String(previous?.freeCashFlow ?? 0),
    firstInRange ? "" : formatPrecomputedDelta(deltas.freeCashFlow),
  ]);

  // FCF Margin %
  const fcfMarginStr =
    current.fcfMarginPercent !== null
      ? current.fcfMarginPercent.toFixed(1) + "%"
      : "N/A";
  const prevFcfMarginStr =
    previous && previous.fcfMarginPercent !== null
      ? previous.fcfMarginPercent.toFixed(1) + "%"
      : "N/A";
  rows.push([
    periodStr,
    "summary",
    "All",
    "FCF Margin %",
    fcfMarginStr,
    "",
    firstInRange ? "" : prevFcfMarginStr,
    firstInRange
      ? ""
      : deltas.fcfMarginPp !== null
        ? deltas.fcfMarginPp.toFixed(1) + "pp"
        : "",
  ]);

  return rows;
}

// ── Main export function ──

export function generateIncomeStatementCSV(
  data: IncomeStatementData,
  weekLabel: string,
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

  // Body rows — delegate to the extracted helper. firstInRange=false preserves
  // pre-Phase-76 byte-identical output for the existing single-period caller.
  rows.push(
    ...buildIncomeStatementRows(
      weekLabel,
      data.current as unknown as WeekData,
      data.previous as unknown as WeekData,
      false,
    ),
  );

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

  // Phase 75 D-15: flag expenses converted to fixed assets without a reversal JE
  // (P&L may double-count — expense row still posted while asset depreciation also hits D/A).
  if (gap.missingReversals.length > 0) {
    rows.push([
      `# Missing reversal JEs (P&L may double-count): ${gap.missingReversals
        .map((r) => `${r.description} [${new Date(r.expenseDate).toISOString().slice(0, 10)}]`)
        .join("; ")}`,
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

/**
 * Sanitize a single CSV cell value: prevent formula injection and
 * quote cells containing delimiters.
 */
export function escapeCell(value: string): string {
  const sanitized = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  if (sanitized.includes(",") || sanitized.includes('"') || sanitized.includes("\n")) {
    return '"' + sanitized.replace(/"/g, '""') + '"';
  }
  return sanitized;
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
  setTimeout(() => URL.revokeObjectURL(url), 150);
}

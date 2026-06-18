/**
 * Weekly Income Statement Query
 *
 * Computes a complete weekly P&L: per-channel gross revenue, revenue deductions
 * (discounts, commissions, ad/promo burn, consignment rev share), full BOM COGS
 * (production + packaging), gross profit, confidence classification, and gap analysis.
 *
 * Architecture: All I/O upfront in handler, then pure computation via aggregateWeek.
 * Follows the getLifetimeTotalsInternal pattern: parallel table scans, then single-pass aggregation.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { buildProductCOGSMap } from "../lib/costCalculator";
import { calculateWeekRange } from "../lib/periodRange";
import { type Confidence, worstConfidence } from "../lib/confidence";
import type { ExternalSource } from "../lib/externalSource";
import { resolvePlatform, platformDisplay } from "./platform";
import { fetchInternalOrderDataMap } from "../externalData/queries";
import { aggregateJournalLines } from "../lib/journalHelpers";
import {
  DEPRECIATION_EXPENSE_CODE,
  AMORTIZATION_EXPENSE_CODE,
} from "../fixedAssets/helpers";

interface ProductDetail {
  name: string;
  quantity: number;
  revenue: number;
  cogsPerUnit: number | null;
  cogsTotal: number;
  confidence: Confidence;
}

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
  transactions: number;
  confidence: Confidence;
  cogs: {
    production: number;
    packaging: number;
    total: number;
  };
  products: ProductDetail[];
}

export interface GapAnalysis {
  unmappedProducts: Array<{ name: string; count: number; revenue: number }>;
  zeroCostComponents: Array<{ name: string; code: string }>;
  missingChannels: Array<{
    source: string;
    displayName: string;
    reason: string;
  }>;
  totalMappedProducts: number;
  totalProducts: number;
  // Phase 75 D-15: Gap check for Phase-71 converted expenses whose reversal JE is missing
  missingReversals: Array<{
    expenseId: Id<"expenses">;
    description: string;
    expenseDate: number;
    journalEntryId: Id<"journalEntries">;
  }>;
}

export interface WeekData {
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
  // Phase 75 FIN-01: Full P&L extension
  opexExcludingDA: number;
  depreciationAmortization: number;
  capExAmount: number;
  freeCashFlow: number;
  fcfMarginPercent: number | null;
  otherItems: Array<{ code: string; name: string; total: number }>;
  totalOther: number;
  netIncome: number;
  netMarginPercent: number | null;
}

// ─── Delta helper ───

function computeDelta(
  current: number,
  previous: number
): { amount: number; percent: number | null } {
  const amount = current - previous;
  const percent = previous !== 0 ? ((current - previous) / previous) * 100 : null;
  return { amount, percent };
}

// ─── Channel confidence rules ───

function getChannelRevenueConfidence(source: string): Confidence {
  switch (source) {
    case "internal":
    case "gobiz":
    case "shopee":
    case "tiktok":
    case "grabfood":
    case "consignment":
    case "pos":
      return "exact";
    case "k3mart":
      return "inferred";
    // Unknown sources default to "inferred" (not "exact") so the frontend
    // never displays an unwarranted confidence badge for a new source.
    default:
      return "inferred";
  }
}

// ─── Shared COGS resolution helper ───
// Extracted to avoid duplication between platform channel (4b) and consignment (4c) loops.

function resolveItemsCOGS(
  items: Doc<"externalRevenueItems">[],
  cogsMap: Map<string, { production: number; packaging: number; total: number }>,
  channelCogs: { production: number; packaging: number; total: number },
  channelProducts: ProductDetail[],
  unmappedProductsMap: Map<string, { count: number; revenue: number }>,
  counters: { totalProducts: number; totalMappedProducts: number }
): void {
  for (const item of items) {
    counters.totalProducts++;
    const productCogs = item.linkedMenuProductId
      ? cogsMap.get(item.linkedMenuProductId as string) ?? null
      : null;

    const itemCogs = productCogs
      ? {
          production: productCogs.production * item.quantity,
          packaging: productCogs.packaging * item.quantity,
          total: productCogs.total * item.quantity,
        }
      : { production: 0, packaging: 0, total: 0 };

    const itemConfidence: Confidence = productCogs ? "calculated" : "missing";

    if (productCogs) {
      counters.totalMappedProducts++;
    } else {
      const key = item.productName;
      const existing = unmappedProductsMap.get(key);
      if (existing) {
        existing.count += item.quantity;
        existing.revenue += item.totalPrice;
      } else {
        unmappedProductsMap.set(key, {
          count: item.quantity,
          revenue: item.totalPrice,
        });
      }
    }

    channelCogs.production += itemCogs.production;
    channelCogs.packaging += itemCogs.packaging;
    channelCogs.total += itemCogs.total;

    channelProducts.push({
      name: item.productName,
      quantity: item.quantity,
      revenue: item.totalPrice,
      cogsPerUnit: productCogs ? productCogs.total : null,
      cogsTotal: itemCogs.total,
      confidence: itemConfidence,
    });
  }
}

// ─── Known missing channels ───
// Extracted as constant so stale reasons are easy to find and update.

const KNOWN_MISSING_CHANNELS = [
  { source: "grabfood", reason: "GrabFood OAuth scope pending" },
] as const;

// ─── Pure aggregation function (no ctx, no async) ───

function aggregateWeek(
  revenue: Doc<"externalRevenue">[],
  consignments: Doc<"consignmentSettlements">[],
  itemsMap: Map<string, Doc<"externalRevenueItems">[]>,
  cogsMap: Map<string, { production: number; packaging: number; total: number }>,
  orderDataMap: Map<
    string,
    { totalAmount: number; finalTotal: number; deliveryFee: number }
  >,
  allComponentTypes: Doc<"componentTypes">[],
  journalAggregation: {
    opex: { items: Array<{ code: string; name: string; total: number }>; total: number };
    other: { items: Array<{ code: string; name: string; total: number }>; total: number };
  },
  // Phase 75 new params:
  fixedAssets: Doc<"fixedAssets">[],
  missingReversals: GapAnalysis["missingReversals"],
  periodStart: number,
  periodEnd: number
): WeekData {
  // ── 4a: Per-channel revenue aggregation ──

  // Group revenue records by source
  const revenueBySource = new Map<string, Doc<"externalRevenue">[]>();
  for (const rec of revenue) {
    const existing = revenueBySource.get(rec.source) ?? [];
    existing.push(rec);
    revenueBySource.set(rec.source, existing);
  }

  const channels: ChannelData[] = [];

  // Track gap analysis data
  const unmappedProductsMap = new Map<
    string,
    { count: number; revenue: number }
  >();
  const counters = { totalMappedProducts: 0, totalProducts: 0 };

  // Process each source channel from revenue records
  for (const [source, records] of revenueBySource.entries()) {
    // Skip consignment source in externalRevenue — handled separately in 4c below.
    // This prevents double-counting: consignment revenue is captured via
    // consignmentSettlements (with revShare deduction), not externalRevenue.
    if (source === "consignment") continue;

    let channelGross = 0;
    let channelDiscount = 0;
    let channelCommission = 0;
    let channelAdBurn = 0;
    let channelPromoBurn = 0;
    let channelTransactions = 0;
    const channelCogs = { production: 0, packaging: 0, total: 0 };
    const channelProducts: ProductDetail[] = [];

    if (source === "internal") {
      // Internal channel: use order data for accurate gross/discount.
      // NOTE: COGS for internal orders uses current BOM costs (same as all channels),
      // not the historical orderItems.unitCost snapshot. This is a deliberate simplification:
      // BOM-based resolution is uniform across all channels, and ingredient costs change
      // infrequently enough that current BOM is acceptable for weekly P&L.
      for (const rec of records) {
        channelTransactions += rec.transactionCount ?? 1;

        const orderData = rec.externalTransactionId
          ? orderDataMap.get(rec.externalTransactionId) ?? null
          : null;

        if (orderData) {
          // Gross = totalAmount (pre-discount product value)
          channelGross += orderData.totalAmount;
          // Discount = totalAmount - (finalTotal - deliveryFee)
          // deliveryFee is pass-through, not part of discount calculation base.
          // NOTE: This discount figure includes voucher deductions (vouchers reduce
          // finalTotal). The frontend should label this as "Discounts & Vouchers"
          // rather than just "Discounts" for accuracy.
          channelDiscount +=
            orderData.totalAmount -
            (orderData.finalTotal - orderData.deliveryFee);
        } else {
          // Fallback: order deleted, use synced revenueGross
          channelGross += rec.revenueGross ?? 0;
        }
        // Commission = 0 for internal (no platform fees)
      }
    } else {
      // Platform channels: gobiz, shopee, tiktok, k3mart, grabfood, bigseller
      for (const rec of records) {
        channelGross += rec.revenueGross ?? 0;
        channelCommission += rec.commission ?? 0;
        channelAdBurn += rec.adBurn ?? 0;
        channelPromoBurn += rec.promoBurn ?? 0;
        channelTransactions += rec.transactionCount ?? 1;
        // Discount = 0 for platforms (platform handles discounts before revenue)
      }
    }

    // Net = gross - all deductions
    const channelNet =
      channelGross -
      channelDiscount -
      channelCommission -
      channelAdBurn -
      channelPromoBurn;

    // ── 4b: Per-channel COGS resolution ──
    for (const rev of records) {
      const items = itemsMap.get(rev._id as string) ?? [];
      resolveItemsCOGS(
        items,
        cogsMap,
        channelCogs,
        channelProducts,
        unmappedProductsMap,
        counters
      );
    }

    // Channel confidence = revenue confidence (downgrade if any product has missing COGS)
    const revenueConfidence = getChannelRevenueConfidence(source);
    const hasAnyCogsMissing = channelProducts.some(
      (p) => p.confidence === "missing"
    );
    const channelConfidence: Confidence = hasAnyCogsMissing
      ? worstConfidence(revenueConfidence, "missing")
      : revenueConfidence;

    channels.push({
      source,
      displayName: platformDisplay(
        resolvePlatform({ source: source as ExternalSource }).platform,
      ),
      gross: channelGross,
      netRevenue: channelNet,
      discount: channelDiscount,
      commission: channelCommission,
      adBurn: channelAdBurn,
      promoBurn: channelPromoBurn,
      revShare: 0,
      transactions: channelTransactions,
      confidence: channelConfidence,
      cogs: channelCogs,
      products: channelProducts,
    });
  }

  // ── 4c: Consignment channel ──
  if (consignments.length > 0) {
    let consignGross = 0;
    let consignRevShare = 0;
    let consignTransactions = 0;
    const consignCogs = { production: 0, packaging: 0, total: 0 };
    const consignProducts: ProductDetail[] = [];

    for (const settlement of consignments) {
      consignGross += settlement.totalRevenue;
      consignRevShare += settlement.revShareAmount;
      consignTransactions++;

      // Consignment COGS: resolve via linkedRevenueId if available
      if (settlement.linkedRevenueId) {
        const items =
          itemsMap.get(settlement.linkedRevenueId as string) ?? [];
        resolveItemsCOGS(
          items,
          cogsMap,
          consignCogs,
          consignProducts,
          unmappedProductsMap,
          counters
        );
      }
    }

    const consignNet = consignGross - consignRevShare;
    const hasConsignCogsMissing = consignProducts.some(
      (p) => p.confidence === "missing"
    );

    channels.push({
      source: "consignment",
      displayName: "Consignment",
      gross: consignGross,
      netRevenue: consignNet,
      discount: 0,
      commission: 0,
      adBurn: 0,
      promoBurn: 0,
      revShare: consignRevShare,
      transactions: consignTransactions,
      confidence: hasConsignCogsMissing ? "missing" : "exact",
      cogs: consignCogs,
      products: consignProducts,
    });
  }

  // Sort channels by gross revenue descending
  channels.sort((a, b) => b.gross - a.gross);

  // ── 4d: Build gap analysis ──

  const unmappedProducts = Array.from(unmappedProductsMap.entries()).map(
    ([name, data]) => ({
      name,
      count: data.count,
      revenue: data.revenue,
    })
  );

  // Zero-cost components: active componentTypes where unitCostIdr === 0.
  // Filter out inactive components to avoid false gap alerts for discontinued items.
  const zeroCostComponents = allComponentTypes
    .filter((ct) => ct.isActive && ct.unitCostIdr === 0)
    .map((ct) => ({ name: ct.name, code: ct.code }));

  // Missing channels: known sources with no revenue in the period
  const activeSources = new Set(channels.map((ch) => ch.source));
  const missingChannels: GapAnalysis["missingChannels"] = [];

  for (const known of KNOWN_MISSING_CHANNELS) {
    if (!activeSources.has(known.source)) {
      missingChannels.push({
        source: known.source,
        displayName: platformDisplay(
          resolvePlatform({ source: known.source as ExternalSource }).platform,
        ),
        reason: known.reason,
      });
    }
  }

  const gapAnalysis: GapAnalysis = {
    unmappedProducts,
    zeroCostComponents,
    missingChannels,
    totalMappedProducts: counters.totalMappedProducts,
    totalProducts: counters.totalProducts,
    missingReversals, // ← Phase 75 D-15, passed in as param (Task 2)
  };

  // ── 4e: Compute totals ──

  const totalGross = channels.reduce((sum, ch) => sum + ch.gross, 0);
  const totalDiscounts = channels.reduce((sum, ch) => sum + ch.discount, 0);
  const totalCommission = channels.reduce(
    (sum, ch) => sum + ch.commission,
    0
  );
  const totalAdBurn = channels.reduce((sum, ch) => sum + ch.adBurn, 0);
  const totalPromoBurn = channels.reduce((sum, ch) => sum + ch.promoBurn, 0);
  const totalRevShare = channels.reduce((sum, ch) => sum + ch.revShare, 0);
  const totalDeductions =
    totalDiscounts +
    totalCommission +
    totalAdBurn +
    totalPromoBurn +
    totalRevShare;
  const netRevenue = totalGross - totalDeductions;
  const totalProductionCogs = channels.reduce(
    (sum, ch) => sum + ch.cogs.production,
    0
  );
  const totalPackagingCogs = channels.reduce(
    (sum, ch) => sum + ch.cogs.packaging,
    0
  );
  const totalCogs = totalProductionCogs + totalPackagingCogs;
  const grossProfit = netRevenue - totalCogs;
  // Margin denominator: use totalGross (not netRevenue) so margins reflect
  // the full pre-deduction revenue base. This matches standard accounting
  // practice where gross margin = gross profit / gross revenue.
  const grossMarginPercent =
    totalGross !== 0 ? (grossProfit / totalGross) * 100 : null;

  // ── 4f: Below Gross Profit — OpEx, EBIT, EBITDA, Other, Net Income ──
  const { opex, other } = journalAggregation;
  const totalOpEx = opex.total;
  const ebit = grossProfit - totalOpEx;
  const ebitMarginPercent =
    totalGross !== 0 ? (ebit / totalGross) * 100 : null;

  // EBITDA: add back depreciation and amortization from OpEx
  const depreciationAmount = opex.items
    .filter((item) => item.code === DEPRECIATION_EXPENSE_CODE)
    .reduce((sum, item) => sum + item.total, 0);
  const amortizationAmount = opex.items
    .filter((item) => item.code === AMORTIZATION_EXPENSE_CODE)
    .reduce((sum, item) => sum + item.total, 0);
  const ebitda = ebit + depreciationAmount + amortizationAmount;
  const ebitdaMarginPercent =
    totalGross !== 0 ? (ebitda / totalGross) * 100 : null;

  // Sign convention: aggregateJournalLines returns debit−credit. Other Income accounts
  // are credit-heavy (negative total); Other Expense are debit-heavy (positive total).
  // ebit − totalOther is therefore correct: income reduces the subtracted value, expense increases it.
  const totalOther = other.total;
  const netIncomeValue = ebit - totalOther;
  const netMarginPercentValue =
    totalGross !== 0 ? (netIncomeValue / totalGross) * 100 : null;

  // Phase 75 FIN-01 D-01, D-03, D-04, D-05, D-06: CapEx from fixedAssets
  // Half-open interval [periodStart, periodEnd) matches externalRevenue.by_period convention.
  // D-04: include ALL acquisitions regardless of disposalType (including reclassify_to_expense).
  // D-03: gross acquisitions only — disposal proceeds flow through Net Income via Other Income.
  // D-02: Phase-71 converted expenses (convertedToAssetId) are included automatically because
  //       convertToCapex creates a fixedAssets row AND posts a reversal JE that removes the
  //       expense from OpEx — no separate subtraction needed here.
  // D-06: acquisitionDate already stamped = original expenseDate for converted expenses (verified RESEARCH §2).
  const capExAmount = fixedAssets
    .filter((a) => a.acquisitionDate >= periodStart && a.acquisitionDate < periodEnd)
    .reduce((sum, a) => sum + a.cost, 0);

  // D-08: separate D/A from OpEx
  const depreciationAmortization = depreciationAmount + amortizationAmount;
  const opexExcludingDA = totalOpEx - depreciationAmortization;

  // D-13: FCF = NI + D/A − CapEx
  const freeCashFlow = netIncomeValue + depreciationAmortization - capExAmount;
  const fcfMarginPercent = totalGross !== 0 ? (freeCashFlow / totalGross) * 100 : null;

  return {
    channels,
    totalGross,
    totalDiscounts,
    totalCommission,
    totalAdBurn,
    totalPromoBurn,
    totalRevShare,
    totalDeductions,
    netRevenue,
    totalProductionCogs,
    totalPackagingCogs,
    totalCogs,
    grossProfit,
    grossMarginPercent,
    gapAnalysis,
    // Phase 75 D-08: filter depreciation/amortization codes out of opex list — they render as a separate D/A row.
    // totalOpEx stays inclusive for back-compat; opexExcludingDA is the post-filter sum.
    opex: opex.items.filter(
      (item) =>
        item.code !== DEPRECIATION_EXPENSE_CODE &&
        item.code !== AMORTIZATION_EXPENSE_CODE
    ),
    totalOpEx,
    ebit,
    ebitMarginPercent,
    depreciationAmount,
    amortizationAmount,
    ebitda,
    ebitdaMarginPercent,
    // Phase 75 FIN-01 (real values from computation above)
    opexExcludingDA,
    depreciationAmortization,
    capExAmount,
    freeCashFlow,
    fcfMarginPercent,
    otherItems: other.items,
    totalOther,
    netIncome: netIncomeValue,
    netMarginPercent: netMarginPercentValue,
  };
}

// ─── Shared data-fetching + aggregation helper ───
// Both getWeeklyIncomeStatement and getIncomeStatement delegate here
// to avoid duplicating the ~80 lines of I/O + COGS map + aggregation.

import type { QueryCtx } from "../_generated/server";

export async function fetchAndAggregate(
  ctx: QueryCtx,
  currentStart: number,
  currentEnd: number,
  previousStart: number,
  previousEnd: number,
  includePrevious: boolean = true
) {
  // Phase 1: Parallel fetch of all base data (revenue, consignments, BOM, accounts, journal lines)
  const [
    currentRevenue,
    previousRevenue,
    currentConsignments,
    previousConsignments,
    bomComponents,
    allComponentTypes,
    menuProductsList,
    opexAccounts,
    otherAccounts,
    currentJournalLines,
    previousJournalLines,
    allFixedAssets,
    convertedExpenses,
  ] = await Promise.all([
    // externalRevenue for current period — both bounds applied at index level
    ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) =>
        q
          .gte("periodStart", currentStart)
          .lt("periodStart", currentEnd)
      )
      .collect(),
    // externalRevenue for previous period — gated on includePrevious to skip wasted I/O
    includePrevious
      ? ctx.db
          .query("externalRevenue")
          .withIndex("by_period", (q) =>
            q
              .gte("periodStart", previousStart)
              .lt("periodStart", previousEnd)
          )
          .collect()
      : Promise.resolve([] as Doc<"externalRevenue">[]),
    // consignmentSettlements for current period
    ctx.db
      .query("consignmentSettlements")
      .withIndex("by_period", (q) =>
        q
          .gte("periodStart", currentStart)
          .lt("periodStart", currentEnd)
      )
      .collect(),
    // consignmentSettlements for previous period — gated on includePrevious
    includePrevious
      ? ctx.db
          .query("consignmentSettlements")
          .withIndex("by_period", (q) =>
            q
              .gte("periodStart", previousStart)
              .lt("periodStart", previousEnd)
          )
          .collect()
      : Promise.resolve([] as Doc<"consignmentSettlements">[]),
    // BOM preload (follows getLifetimeTotalsInternal pattern)
    ctx.db.query("menuProductComponents").collect(),
    ctx.db.query("componentTypes").collect(),
    // Phase 70 DA-03: Menu products for COGS override
    ctx.db.query("menuProducts").collect(),
    // Accounts for OpEx/Other aggregation
    ctx.db.query("accounts").withIndex("by_type", (q) => q.eq("type", "opex")).collect(),
    ctx.db.query("accounts").withIndex("by_type", (q) => q.eq("type", "other")).collect(),
    // Single indexed query per period using by_entryDate (PNL-04: not N+1)
    ctx.db.query("journalEntryLines")
      .withIndex("by_entryDate", (q) => q.gte("entryDate", currentStart).lt("entryDate", currentEnd))
      .collect(),
    includePrevious
      ? ctx.db
          .query("journalEntryLines")
          .withIndex("by_entryDate", (q) => q.gte("entryDate", previousStart).lt("entryDate", previousEnd))
          .collect()
      : Promise.resolve([] as Doc<"journalEntryLines">[]),
    // Phase 75 FIN-01: All fixedAssets (scan acceptable at current scale per RESEARCH §1)
    ctx.db.query("fixedAssets").collect(),
    // Phase 75 D-15: Expenses converted to assets (scan — tiny subset)
    ctx.db
      .query("expenses")
      .filter((q) => q.neq(q.field("convertedToAssetId"), undefined))
      .collect(),
  ]);

  // Build lookup structures for journal aggregation
  const opexIds = new Set(opexAccounts.map((a) => a._id as string));
  const otherIds = new Set(otherAccounts.map((a) => a._id as string));
  const accountLookup = new Map<string, { code: string; name: string }>();
  for (const a of [...opexAccounts, ...otherAccounts]) {
    accountLookup.set(a._id as string, { code: a.code, name: a.name });
  }

  // Aggregate journal lines per period (pure function, no ctx)
  const currentOpex = aggregateJournalLines(currentJournalLines, opexIds, accountLookup);
  const currentOther = aggregateJournalLines(currentJournalLines, otherIds, accountLookup);
  const previousOpex = aggregateJournalLines(previousJournalLines, opexIds, accountLookup);
  const previousOther = aggregateJournalLines(previousJournalLines, otherIds, accountLookup);

  // Phase 2: Fetch revenue items for both periods (needs revenue IDs from Phase 1)
  // Dedup IDs: consignment linkedRevenueIds may duplicate revenue record IDs.
  // Using a Set prevents issuing redundant parallel DB queries.
  const seenIds = new Set<string>();
  const uniqueRevenueIds: (typeof currentRevenue)[0]["_id"][] = [];

  for (const r of [...currentRevenue, ...previousRevenue]) {
    const key = r._id as string;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      uniqueRevenueIds.push(r._id);
    }
  }
  for (const s of [...currentConsignments, ...previousConsignments]) {
    if (s.linkedRevenueId) {
      const key = s.linkedRevenueId as string;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        uniqueRevenueIds.push(s.linkedRevenueId);
      }
    }
  }

  const allRevenueItems = await Promise.all(
    uniqueRevenueIds.map((id) =>
      ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", id))
        .collect()
    )
  );

  // Build revenueId -> items map.
  // This shared map is used for both current and previous period aggregation.
  // Safe because aggregateWeek only looks up items for its own revenue list.
  const revenueItemsMap = new Map<
    string,
    Doc<"externalRevenueItems">[]
  >();
  for (let i = 0; i < uniqueRevenueIds.length; i++) {
    revenueItemsMap.set(
      uniqueRevenueIds[i] as string,
      allRevenueItems[i]
    );
  }

  // Phase 3: Fetch internal order data for discount correction.
  // Previous-period map is gated on includePrevious to skip wasted I/O when caller
  // (e.g., plan 02 multi-period exporter) doesn't need previous-period data.
  const [currentOrderDataMap, previousOrderDataMap] = await Promise.all([
    fetchInternalOrderDataMap(ctx, currentRevenue),
    includePrevious
      ? fetchInternalOrderDataMap(ctx, previousRevenue)
      : Promise.resolve(new Map() as Awaited<ReturnType<typeof fetchInternalOrderDataMap>>),
  ]);

  // Phase 75 D-15: Fetch journal entries for converted expenses (parallel, small subset)
  const convertedExpenseJeIds = convertedExpenses
    .filter((e) => e.journalEntryId)
    .map((e) => e.journalEntryId!);
  const convertedExpenseJes = await Promise.all(
    convertedExpenseJeIds.map((id) => ctx.db.get(id))
  );
  const jeByIdMap = new Map<string, Doc<"journalEntries"> | null>();
  for (let i = 0; i < convertedExpenseJeIds.length; i++) {
    jeByIdMap.set(convertedExpenseJeIds[i] as string, convertedExpenseJes[i]);
  }

  // Phase 75 D-15: Build missingReversals lists per period (converted expenses with un-reversed JEs)
  function buildMissingReversals(
    start: number,
    end: number
  ): GapAnalysis["missingReversals"] {
    return convertedExpenses
      .filter(
        (e) =>
          e.expenseDate >= start &&
          e.expenseDate < end &&
          e.journalEntryId
      )
      .map((e) => ({
        expense: e,
        je: jeByIdMap.get(e.journalEntryId! as string) ?? null,
      }))
      .filter(({ je }) => je && je.isReversed !== true)
      .map(({ expense, je }) => ({
        expenseId: expense._id,
        description: expense.description,
        expenseDate: expense.expenseDate,
        journalEntryId: je!._id,
      }));
  }

  const currentMissingReversals = buildMissingReversals(
    currentStart,
    currentEnd
  );
  // Skip previous-period missing-reversal scan when caller opted out of prev I/O.
  const previousMissingReversals = includePrevious
    ? buildMissingReversals(previousStart, previousEnd)
    : ([] as GapAnalysis["missingReversals"]);

  // Build COGS map
  // Filter inactive componentTypes to exclude discontinued items from cost calculations.
  const activeComponentTypes = allComponentTypes.filter((ct) => ct.isActive);
  const cogsMap = buildProductCOGSMap(
    bomComponents.map((c) => ({
      menuProductId: c.menuProductId as string,
      componentTypeId: c.componentTypeId as string,
      quantity: c.quantity,
    })),
    activeComponentTypes.map((ct) => ({
      _id: ct._id as string,
      unitCostIdr: ct.unitCostIdr,
      category: ct.category,
    })),
    menuProductsList.map((mp) => ({
      _id: mp._id as string,
      cogsOverrideIdr: mp.cogsOverrideIdr,
    }))
  );

  // Aggregate both periods (pure — no await needed)
  const currentPeriod = aggregateWeek(
    currentRevenue,
    currentConsignments,
    revenueItemsMap,
    cogsMap,
    currentOrderDataMap,
    allComponentTypes,
    { opex: currentOpex, other: currentOther },
    allFixedAssets,
    currentMissingReversals,
    currentStart,
    currentEnd
  );
  const previousPeriod = aggregateWeek(
    previousRevenue,
    previousConsignments,
    revenueItemsMap,
    cogsMap,
    previousOrderDataMap,
    allComponentTypes,
    { opex: previousOpex, other: previousOther },
    allFixedAssets,
    previousMissingReversals,
    previousStart,
    previousEnd
  );

  // Compute deltas
  const deltas = {
    grossRevenue: computeDelta(
      currentPeriod.totalGross,
      previousPeriod.totalGross
    ),
    netRevenue: computeDelta(
      currentPeriod.netRevenue,
      previousPeriod.netRevenue
    ),
    totalCogs: computeDelta(
      currentPeriod.totalCogs,
      previousPeriod.totalCogs
    ),
    grossProfit: computeDelta(
      currentPeriod.grossProfit,
      previousPeriod.grossProfit
    ),
    grossMarginPp:
      currentPeriod.grossMarginPercent !== null &&
      previousPeriod.grossMarginPercent !== null
        ? currentPeriod.grossMarginPercent - previousPeriod.grossMarginPercent
        : null,
    // Phase 49: OpEx/EBIT/Other/NetIncome deltas
    totalOpEx: computeDelta(
      currentPeriod.totalOpEx,
      previousPeriod.totalOpEx
    ),
    ebit: computeDelta(currentPeriod.ebit, previousPeriod.ebit),
    ebitMarginPp:
      currentPeriod.ebitMarginPercent !== null &&
      previousPeriod.ebitMarginPercent !== null
        ? currentPeriod.ebitMarginPercent - previousPeriod.ebitMarginPercent
        : null,
    // EBITDA deltas
    ebitda: computeDelta(currentPeriod.ebitda, previousPeriod.ebitda),
    ebitdaMarginPp:
      currentPeriod.ebitdaMarginPercent !== null &&
      previousPeriod.ebitdaMarginPercent !== null
        ? currentPeriod.ebitdaMarginPercent - previousPeriod.ebitdaMarginPercent
        : null,
    totalOther: computeDelta(
      currentPeriod.totalOther,
      previousPeriod.totalOther
    ),
    netIncome: computeDelta(
      currentPeriod.netIncome,
      previousPeriod.netIncome
    ),
    netMarginPp:
      currentPeriod.netMarginPercent !== null &&
      previousPeriod.netMarginPercent !== null
        ? currentPeriod.netMarginPercent - previousPeriod.netMarginPercent
        : null,
    // Phase 75 FIN-01 deltas
    opexExcludingDA: computeDelta(
      currentPeriod.opexExcludingDA,
      previousPeriod.opexExcludingDA
    ),
    depreciationAmortization: computeDelta(
      currentPeriod.depreciationAmortization,
      previousPeriod.depreciationAmortization
    ),
    capExAmount: computeDelta(
      currentPeriod.capExAmount,
      previousPeriod.capExAmount
    ),
    freeCashFlow: computeDelta(
      currentPeriod.freeCashFlow,
      previousPeriod.freeCashFlow
    ),
    fcfMarginPp:
      currentPeriod.fcfMarginPercent !== null &&
      previousPeriod.fcfMarginPercent !== null
        ? currentPeriod.fcfMarginPercent - previousPeriod.fcfMarginPercent
        : null,
  };

  return { currentPeriod, previousPeriod, deltas };
}

// ─── Weekly Income Statement Query (backward-compatible) ───

export const getWeeklyIncomeStatement = query({
  args: {
    weekStart: v.number(), // Epoch ms for Monday 00:00 WIB
  },
  handler: async (ctx, args) => {
    const range = calculateWeekRange(args.weekStart);
    const { currentPeriod, previousPeriod, deltas } = await fetchAndAggregate(
      ctx,
      range.currentStart,
      range.currentEnd,
      range.previousStart,
      range.previousEnd
    );

    return {
      weekStart: args.weekStart,
      weekEnd: range.currentEnd,
      current: currentPeriod,
      previous: previousPeriod,
      deltas,
    };
  },
});

// ─── Generalized Income Statement Query (any period) ───

export const getIncomeStatement = query({
  args: {
    periodStart: v.number(), // Epoch ms UTC
    periodEnd: v.number(), // Epoch ms UTC (exclusive)
  },
  handler: async (ctx, args) => {
    // Equal-length comparison window immediately before the selected period
    const duration = args.periodEnd - args.periodStart;
    const previousStart = args.periodStart - duration;
    const previousEnd = args.periodStart;

    const { currentPeriod, previousPeriod, deltas } = await fetchAndAggregate(
      ctx,
      args.periodStart,
      args.periodEnd,
      previousStart,
      previousEnd
    );

    return {
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      current: currentPeriod,
      previous: previousPeriod,
      deltas,
    };
  },
});

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
import type { Doc } from "../_generated/dataModel";
import { buildProductCOGSMap } from "../lib/costCalculator";
import { calculateWeekRange } from "../lib/periodRange";
import { type Confidence, worstConfidence } from "../lib/confidence";
import { sourceToPlatform } from "../lib/externalSource";
import { fetchInternalOrderDataMap } from "../externalData/queries";

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
  allComponentTypes: Doc<"componentTypes">[]
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
      displayName: sourceToPlatform(source),
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
      displayName: sourceToPlatform("consignment"),
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
        displayName: sourceToPlatform(known.source),
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
  const grossMarginPercent =
    netRevenue !== 0 ? (grossProfit / netRevenue) * 100 : null;

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
  };
}

// ─── Shared data-fetching + aggregation helper ───
// Both getWeeklyIncomeStatement and getIncomeStatement delegate here
// to avoid duplicating the ~80 lines of I/O + COGS map + aggregation.

import type { QueryCtx } from "../_generated/server";

async function fetchAndAggregate(
  ctx: QueryCtx,
  currentStart: number,
  currentEnd: number,
  previousStart: number,
  previousEnd: number
) {
  // Phase 1: Parallel fetch of all base data
  const [
    currentRevenue,
    previousRevenue,
    currentConsignments,
    previousConsignments,
    bomComponents,
    allComponentTypes,
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
    // externalRevenue for previous period
    ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) =>
        q
          .gte("periodStart", previousStart)
          .lt("periodStart", previousEnd)
      )
      .collect(),
    // consignmentSettlements for current period
    ctx.db
      .query("consignmentSettlements")
      .withIndex("by_period", (q) =>
        q
          .gte("periodStart", currentStart)
          .lt("periodStart", currentEnd)
      )
      .collect(),
    // consignmentSettlements for previous period
    ctx.db
      .query("consignmentSettlements")
      .withIndex("by_period", (q) =>
        q
          .gte("periodStart", previousStart)
          .lt("periodStart", previousEnd)
      )
      .collect(),
    // BOM preload (follows getLifetimeTotalsInternal pattern)
    ctx.db.query("menuProductComponents").collect(),
    ctx.db.query("componentTypes").collect(),
  ]);

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

  // Phase 3: Fetch internal order data for discount correction (both periods)
  const [currentOrderDataMap, previousOrderDataMap] = await Promise.all([
    fetchInternalOrderDataMap(ctx, currentRevenue),
    fetchInternalOrderDataMap(ctx, previousRevenue),
  ]);

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
    }))
  );

  // Aggregate both periods (pure — no await needed)
  const currentPeriod = aggregateWeek(
    currentRevenue,
    currentConsignments,
    revenueItemsMap,
    cogsMap,
    currentOrderDataMap,
    allComponentTypes
  );
  const previousPeriod = aggregateWeek(
    previousRevenue,
    previousConsignments,
    revenueItemsMap,
    cogsMap,
    previousOrderDataMap,
    allComponentTypes
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

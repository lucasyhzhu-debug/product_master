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
import {
  sourceToPlatform,
  fetchInternalOrderDataMap,
} from "../externalData/queries";

// ─── Types ───

type Confidence = "exact" | "calculated" | "inferred" | "missing";

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
    default:
      return "exact";
  }
}

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
  let totalMappedProducts = 0;
  let totalProducts = 0;

  // Process each source channel from revenue records
  for (const [source, records] of revenueBySource.entries()) {
    // Skip consignment source in externalRevenue — handled separately below
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
      // Internal channel: use order data for accurate gross/discount
      for (const rec of records) {
        channelTransactions += rec.transactionCount ?? 1;

        const orderData = rec.externalTransactionId
          ? orderDataMap.get(rec.externalTransactionId) ?? null
          : null;

        if (orderData) {
          // Gross = totalAmount (pre-discount product value)
          channelGross += orderData.totalAmount;
          // Discount = totalAmount - (finalTotal - deliveryFee)
          // deliveryFee is pass-through, not part of discount calculation base
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
      for (const item of items) {
        totalProducts++;
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

        const itemConfidence: Confidence = productCogs
          ? "calculated"
          : "missing";

        if (productCogs) {
          totalMappedProducts++;
        } else {
          // Track unmapped product for gap analysis
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

    // Channel confidence = revenue confidence (downgrade if any product has missing COGS)
    const revenueConfidence = getChannelRevenueConfidence(source);
    const hasAnyCogsMissing = channelProducts.some(
      (p) => p.confidence === "missing"
    );
    const channelConfidence: Confidence = hasAnyCogsMissing
      ? lowestConfidence(revenueConfidence, "missing")
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
        for (const item of items) {
          totalProducts++;
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

          if (productCogs) {
            totalMappedProducts++;
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

          consignCogs.production += itemCogs.production;
          consignCogs.packaging += itemCogs.packaging;
          consignCogs.total += itemCogs.total;

          consignProducts.push({
            name: item.productName,
            quantity: item.quantity,
            revenue: item.totalPrice,
            cogsPerUnit: productCogs ? productCogs.total : null,
            cogsTotal: itemCogs.total,
            confidence: productCogs ? "calculated" : "missing",
          });
        }
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

  // Zero-cost components: componentTypes where unitCostIdr === 0
  const zeroCostComponents = allComponentTypes
    .filter((ct) => ct.unitCostIdr === 0)
    .map((ct) => ({ name: ct.name, code: ct.code }));

  // Missing channels: known sources with no revenue in the period
  const activeSources = new Set(channels.map((ch) => ch.source));
  const missingChannels: GapAnalysis["missingChannels"] = [];

  // Known channels that should typically have data
  const knownChannels: Array<{
    source: string;
    reason: string;
  }> = [
    { source: "grabfood", reason: "OAuth scope pending" },
  ];

  for (const known of knownChannels) {
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
    totalMappedProducts,
    totalProducts,
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

// ─── Confidence comparison ───

const CONFIDENCE_RANK: Record<Confidence, number> = {
  exact: 0,
  calculated: 1,
  inferred: 2,
  missing: 3,
};

function lowestConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

// ─── Main Query ───

export const getWeeklyIncomeStatement = query({
  args: {
    weekStart: v.number(), // Epoch ms for Monday 00:00 WIB
  },
  handler: async (ctx, args) => {
    // Step 1: Compute week ranges
    const range = calculateWeekRange(args.weekStart);

    // Step 2: Parallel data fetching (all I/O upfront)
    // Phase 1: Parallel fetch of all base data
    const [
      currentRevenue,
      previousRevenue,
      currentConsignments,
      previousConsignments,
      bomComponents,
      allComponentTypes,
    ] = await Promise.all([
      // externalRevenue for current week (by_period index)
      ctx.db
        .query("externalRevenue")
        .withIndex("by_period", (q) =>
          q.gte("periodStart", range.currentStart)
        )
        .filter((q) => q.lt(q.field("periodStart"), range.currentEnd))
        .collect(),
      // externalRevenue for previous week (by_period index)
      ctx.db
        .query("externalRevenue")
        .withIndex("by_period", (q) =>
          q.gte("periodStart", range.previousStart)
        )
        .filter((q) => q.lt(q.field("periodStart"), range.previousEnd))
        .collect(),
      // consignmentSettlements for current week (by_period index)
      ctx.db
        .query("consignmentSettlements")
        .withIndex("by_period", (q) =>
          q.gte("periodStart", range.currentStart)
        )
        .filter((q) => q.lt(q.field("periodStart"), range.currentEnd))
        .collect(),
      // consignmentSettlements for previous week (by_period index)
      ctx.db
        .query("consignmentSettlements")
        .withIndex("by_period", (q) =>
          q.gte("periodStart", range.previousStart)
        )
        .filter((q) => q.lt(q.field("periodStart"), range.previousEnd))
        .collect(),
      // BOM preload (follows getLifetimeTotalsInternal pattern)
      ctx.db.query("menuProductComponents").collect(),
      ctx.db.query("componentTypes").collect(),
    ]);

    // Phase 2: Fetch revenue items for both periods (needs revenue IDs from Phase 1)
    const allRevenueIds = [
      ...currentRevenue.map((r) => r._id),
      ...previousRevenue.map((r) => r._id),
    ];

    // Also include linkedRevenueIds from consignment settlements
    for (const s of [...currentConsignments, ...previousConsignments]) {
      if (s.linkedRevenueId) {
        allRevenueIds.push(s.linkedRevenueId);
      }
    }

    const allRevenueItems = await Promise.all(
      allRevenueIds.map((id) =>
        ctx.db
          .query("externalRevenueItems")
          .withIndex("by_revenue", (q) => q.eq("revenueId", id))
          .collect()
      )
    );

    // Build revenueId -> items map
    const revenueItemsMap = new Map<
      string,
      Doc<"externalRevenueItems">[]
    >();
    for (let i = 0; i < allRevenueIds.length; i++) {
      revenueItemsMap.set(
        allRevenueIds[i] as string,
        allRevenueItems[i]
      );
    }

    // Phase 3: Fetch internal order data for discount correction (both weeks)
    const [currentOrderDataMap, previousOrderDataMap] = await Promise.all([
      fetchInternalOrderDataMap(ctx, currentRevenue),
      fetchInternalOrderDataMap(ctx, previousRevenue),
    ]);

    // Step 3: Build COGS map
    const cogsMap = buildProductCOGSMap(
      bomComponents.map((c) => ({
        menuProductId: c.menuProductId as string,
        componentTypeId: c.componentTypeId as string,
        quantity: c.quantity,
      })),
      allComponentTypes.map((ct) => ({
        _id: ct._id as string,
        unitCostIdr: ct.unitCostIdr,
        category: ct.category,
      }))
    );

    // Step 5: Aggregate both weeks (pure — no await needed)
    const currentWeek = aggregateWeek(
      currentRevenue,
      currentConsignments,
      revenueItemsMap,
      cogsMap,
      currentOrderDataMap,
      allComponentTypes
    );
    const previousWeek = aggregateWeek(
      previousRevenue,
      previousConsignments,
      revenueItemsMap,
      cogsMap,
      previousOrderDataMap,
      allComponentTypes
    );

    // Step 6: Compute deltas
    const deltas = {
      grossRevenue: computeDelta(
        currentWeek.totalGross,
        previousWeek.totalGross
      ),
      netRevenue: computeDelta(
        currentWeek.netRevenue,
        previousWeek.netRevenue
      ),
      totalCogs: computeDelta(
        currentWeek.totalCogs,
        previousWeek.totalCogs
      ),
      grossProfit: computeDelta(
        currentWeek.grossProfit,
        previousWeek.grossProfit
      ),
      grossMarginPp:
        currentWeek.grossMarginPercent !== null &&
        previousWeek.grossMarginPercent !== null
          ? currentWeek.grossMarginPercent - previousWeek.grossMarginPercent
          : null,
    };

    // Step 7: Return structured response
    return {
      weekStart: args.weekStart,
      weekEnd: range.currentEnd,
      current: currentWeek,
      previous: previousWeek,
      deltas,
      gapAnalysis: currentWeek.gapAnalysis,
    };
  },
});

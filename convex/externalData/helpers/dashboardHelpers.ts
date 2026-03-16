/**
 * Dashboard period aggregation helpers.
 * Pure functions that process pre-fetched revenue records into summary objects.
 */
import type { Doc } from "../../_generated/dataModel";
import { sourceToPlatform } from "../../lib/externalSource";

/**
 * Aggregate revenue records into a period summary with per-channel breakdown.
 * Pure function — all DB data must be pre-fetched and passed in.
 *
 * @param records - Revenue records for the period
 * @param orderDataMap - Pre-fetched internal order data (from fetchInternalOrderDataMap)
 */
export function aggregatePeriodRevenue(
  records: Doc<"externalRevenue">[],
  orderDataMap: Map<string, { totalAmount: number; finalTotal: number; deliveryFee: number }>
) {
  // Group records by source
  const bySource = new Map<string, Doc<"externalRevenue">[]>();
  for (const record of records) {
    const existing = bySource.get(record.source) ?? [];
    existing.push(record);
    bySource.set(record.source, existing);
  }

  // Per-channel platform aggregation (for non-internal sources) — single pass
  // Uses stored revenueNet (pre-calculated by platform) with fallback to revenueGross
  function aggregatePlatformChannel(channelRecords: Doc<"externalRevenue">[]) {
    let gross = 0, net = 0, commission = 0, adBurn = 0, promoBurn = 0, deliveryFees = 0, txns = 0;
    for (const r of channelRecords) {
      gross        += r.revenueGross    ?? 0;
      net          += r.revenueNet      ?? (r.revenueGross ?? 0);
      commission   += r.commission      ?? 0;
      adBurn       += r.adBurn          ?? 0;
      promoBurn    += r.promoBurn       ?? 0;
      deliveryFees += r.deliveryFees    ?? 0;
      txns         += r.transactionCount ?? 1;
    }
    return { gross, net, txns, commission, adBurn, promoBurn, deliveryFees };
  }

  // Internal orders: special handling — look up real orders for pre-discount totals
  const internalRecords = bySource.get("internal") ?? [];
  let internalGross = 0;
  let internalNet = 0;
  let internalDiscounts = 0;
  let internalDeliveryFees = 0;
  const internalTxns = internalRecords.reduce((sum, r) => sum + (r.transactionCount ?? 1), 0);

  for (const rec of internalRecords) {
    const orderNumber = rec.externalTransactionId;
    if (!orderNumber) continue;
    const od = orderDataMap.get(orderNumber);
    if (od) {
      const netProduct = od.finalTotal - od.deliveryFee;
      internalGross += od.totalAmount;
      internalNet += netProduct;
      internalDiscounts += od.totalAmount - netProduct;
      internalDeliveryFees += od.deliveryFee;
    } else {
      // Fallback to revenue record data if order deleted
      internalGross += rec.revenueGross ?? 0;
      internalNet += rec.revenueGross ?? 0;
    }
  }

  // Build dynamic channels array, accumulating totals in a single pass
  const channels: Array<{
    source: string; displayName: string;
    gross: number; net: number; transactions: number;
    commission: number; promoBurn: number; deliveryFees: number;
  }> = [];
  let totalCommission = 0;
  let totalAdBurn = 0;
  let totalPromoBurn = 0;
  let platformDeliveryFees = 0;
  let platformGross = 0;
  let totalNet = internalNet;
  let totalTransactions = internalTxns;

  for (const [source, sourceRecords] of bySource) {
    if (source === "internal") continue; // handled separately above
    const agg = aggregatePlatformChannel(sourceRecords);
    totalCommission += agg.commission;
    totalAdBurn += agg.adBurn;
    totalPromoBurn += agg.promoBurn;
    platformDeliveryFees += agg.deliveryFees;
    platformGross += agg.gross;
    totalNet += agg.net;
    totalTransactions += agg.txns;
    if (agg.gross > 0 || agg.txns > 0) {
      channels.push({
        source,
        displayName: sourceToPlatform(source),
        gross: agg.gross,
        net: agg.net,
        transactions: agg.txns,
        commission: agg.commission,
        promoBurn: agg.promoBurn,
        deliveryFees: agg.deliveryFees,
      });
    }
  }

  // Add internal channel if it has data
  if (internalGross > 0 || internalTxns > 0) {
    channels.push({
      source: "internal",
      displayName: sourceToPlatform("internal"),
      gross: internalGross,
      net: internalNet,
      transactions: internalTxns,
      commission: 0,
      promoBurn: 0,
      deliveryFees: internalDeliveryFees,
    });
  }

  // Sort channels by gross revenue descending (biggest first)
  channels.sort((a, b) => b.gross - a.gross);

  // Discounts = internal order discounts + platform promo burn (GoFood promos, etc.)
  const totalDiscounts = internalDiscounts + totalPromoBurn;
  // Delivery fees = internal order delivery + platform shipping (Shopee/TikTok)
  const totalDeliveryFees = internalDeliveryFees + platformDeliveryFees;

  return {
    totalGross: platformGross + internalGross,
    totalNet,
    totalTransactions,
    totalCommission,
    totalAdBurn,
    totalPromoBurn,
    totalDiscounts,
    totalDeliveryFees,
    platformGross,
    internalGross,
    channels,
  };
}

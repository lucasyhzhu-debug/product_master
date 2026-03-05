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
  function aggregatePlatformChannel(channelRecords: Doc<"externalRevenue">[]) {
    let gross = 0, commission = 0, adBurn = 0, promoBurn = 0, txns = 0;
    for (const r of channelRecords) {
      gross      += r.revenueGross    ?? 0;
      commission += r.commission      ?? 0;
      adBurn     += r.adBurn          ?? 0;
      promoBurn  += r.promoBurn       ?? 0;
      txns       += r.transactionCount ?? 0;
    }
    const net = gross - commission - adBurn - promoBurn;
    return { gross, net, txns, commission, adBurn, promoBurn };
  }

  // Internal orders: special handling — look up real orders for pre-discount totals
  const internalRecords = bySource.get("internal") ?? [];
  let internalGross = 0;
  let internalNet = 0;
  let totalDiscounts = 0;
  let totalDeliveryFees = 0;
  const internalTxns = internalRecords.reduce((sum, r) => sum + (r.transactionCount ?? 0), 0);

  for (const rec of internalRecords) {
    const orderNumber = rec.externalTransactionId;
    if (!orderNumber) continue;
    const od = orderDataMap.get(orderNumber);
    if (od) {
      const netProduct = od.finalTotal - od.deliveryFee;
      internalGross += od.totalAmount;
      internalNet += netProduct;
      totalDiscounts += od.totalAmount - netProduct;
      totalDeliveryFees += od.deliveryFee;
    } else {
      // Fallback to revenue record data if order deleted
      internalGross += rec.revenueGross ?? 0;
      internalNet += rec.revenueGross ?? 0;
    }
  }

  // Build dynamic channels array, accumulating totals in a single pass
  const channels: Array<{ source: string; displayName: string; gross: number; net: number; transactions: number }> = [];
  let totalCommission = 0;
  let totalAdBurn = 0;
  let totalPromoBurn = 0;
  let platformGross = 0;
  let totalNet = internalNet;
  let totalTransactions = internalTxns;

  for (const [source, sourceRecords] of bySource) {
    if (source === "internal") continue; // handled separately above
    const agg = aggregatePlatformChannel(sourceRecords);
    totalCommission += agg.commission;
    totalAdBurn += agg.adBurn;
    totalPromoBurn += agg.promoBurn;
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
    });
  }

  // Sort channels by gross revenue descending (biggest first)
  channels.sort((a, b) => b.gross - a.gross);

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

/**
 * GoBiz pure helper functions.
 * Extracted from adapter for testability.
 * No ctx, no fetch - pure functions only.
 */

import { GOBIZ_CONFIG } from "./config";

/**
 * Convert a WIB (UTC+7) date string like "2026-02-08" to UTC millisecond range.
 * WIB midnight = UTC 17:00 previous day.
 * Returns {from: number, to: number} in epoch milliseconds.
 *
 * Example:
 *   Input: "2026-02-08"
 *   WIB range: 2026-02-08 00:00:00 WIB to 2026-02-08 23:59:59.999 WIB
 *   UTC range: 2026-02-07 17:00:00 UTC to 2026-02-08 16:59:59.999 UTC
 */
export function wibDateToUtcRange(dateStr: string): { from: number; to: number } {
  const [year, month, day] = dateStr.split("-").map(Number);

  // Create start of day in WIB (UTC+7)
  // WIB 00:00:00 = UTC -7 hours
  const wibStartHour = 0 - 7; // -7 in UTC
  const startUtc = Date.UTC(year, month - 1, day, wibStartHour, 0, 0, 0);

  // Create end of day in WIB (23:59:59.999 WIB = 16:59:59.999 UTC next day)
  const wibEndHour = 23 - 7; // 16 in UTC
  const endUtc = Date.UTC(year, month - 1, day, wibEndHour, 59, 59, 999);

  return { from: startUtc, to: endUtc };
}

/**
 * Build headers for GoBiz dashboard API (proxy/63).
 * Includes all 5 ref IDs for: net, gross, commission, ad burn, promo burn.
 */
export function buildDashboardHeaders(
  token: string,
  rangeFromMs: number,
  rangeToMs: number
): Record<string, string> {
  return {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "authentication-type": "go-id",
    "authorization": token.startsWith("Bearer ") ? token : `Bearer ${token}`,
    "content-type": "application/json, application/x-ndjson",
    "origin": GOBIZ_CONFIG.portalBaseUrl,
    "referer": `${GOBIZ_CONFIG.portalBaseUrl}/analytics/sales-gofood?date_range=this_week`,
    "x-comp-range-from": "0",
    "x-comp-range-offset": "",
    "x-comp-range-to": "0",
    "x-custom-ad-slot": "",
    "x-custom-interval": "1d",
    "x-custom-merchant-id": "",
    "x-dashboard-id": GOBIZ_CONFIG.dashboardApi.dashboardId,
    "x-grafana-org-id": "1",
    "x-panel-id": GOBIZ_CONFIG.dashboardApi.panelId,
    "x-range-from": String(rangeFromMs),
    "x-range-to": String(rangeToMs),
    "x-ref-ids": GOBIZ_CONFIG.dashboardApi.refIds.join(";"),
    "x-setting-interval": "1d",
  };
}

/**
 * Build request body for journals/search API (future use).
 * This API provides transaction-level detail but requires further validation.
 */
export function buildJournalSearchBody(
  utcFrom: number,
  utcTo: number,
  merchantId: string,
  from: number,
  size: number
): object {
  return {
    from,
    size,
    sort: [{ time: { order: "desc" } }],
    included_categories: ["TRANSACTION"],
    query: [
      {
        clauses: [
          {
            range: {
              time: {
                gte: utcFrom,
                lte: utcTo,
                format: "epoch_millis",
              },
            },
          },
          {
            query_string: {
              analyze_wildcard: true,
              query: `metadata.merchant_id:"${merchantId}" AND metadata.source:("goresto_online" OR "GORESTO_ONLINE_PICKUP")`,
            },
          },
        ],
      },
    ],
  };
}

/**
 * Build request body for orders/search API (future use).
 * This API provides item-level details per order number.
 */
export function buildOrderSearchBody(orderNumber: string): object {
  return {
    query: {
      term: {
        order_number: orderNumber,
      },
    },
  };
}

/**
 * Build a deterministic dedup key for journal entries.
 * Format: orderNumber|txnTimeMs
 */
export function buildJournalDedupKey(orderNumber: string, txnTimeMs: number): string {
  return `${orderNumber}|${txnTimeMs}`;
}

/**
 * Extract 5 metrics from the dashboard API _msearch response.
 * Response order matches ref IDs: [net, gross, commission, adBurn, promoBurn]
 * Values are in aggregations.2.buckets[0].1.value
 */
export function extractDashboardMetrics(response: any): {
  gross: number;
  net: number;
  commission: number;
  adBurn: number;
  promoBurn: number;
  transactionCount: number;
} {
  const responses = response?.responses ?? [];

  // Initialize result with zeros
  const result = {
    net: 0,
    gross: 0,
    commission: 0,
    adBurn: 0,
    promoBurn: 0,
    transactionCount: 0,
  };

  // Response order: [net, gross, commission, adBurn, promoBurn]
  const metricKeys: Array<keyof typeof result> = ["net", "gross", "commission", "adBurn", "promoBurn"];

  for (let i = 0; i < metricKeys.length && i < responses.length; i++) {
    const resp = responses[i];
    if (resp?.status === 200) {
      const buckets = resp?.aggregations?.["2"]?.buckets ?? [];
      if (buckets.length > 0) {
        result[metricKeys[i]] = buckets[0]?.["1"]?.value ?? 0;
      }
    }
  }

  // Transaction count is in the first response's hits total
  if (responses.length > 0 && responses[0]?.hits?.total?.value !== undefined) {
    result.transactionCount = responses[0].hits.total.value;
  }

  return result;
}

/**
 * Parse order items from orders/search response (future use).
 * Extracts item details from a single order.
 */
export function parseOrderItems(orderResponse: any): Array<{
  externalItemId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  variants?: string;
}> {
  const items = orderResponse?.hits?.hits?.[0]?._source?.items ?? [];

  return items.map((item: any) => ({
    externalItemId: item.item_id ?? item.id ?? "",
    productName: item.name ?? item.product_name ?? "",
    unitPrice: item.price ?? item.unit_price ?? 0,
    quantity: item.quantity ?? item.qty ?? 1,
    totalPrice: item.total_price ?? (item.price ?? 0) * (item.quantity ?? 1),
    variants: item.variants ?? undefined,
  }));
}

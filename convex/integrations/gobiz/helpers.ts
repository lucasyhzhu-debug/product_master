/**
 * GoBiz pure helper functions.
 * Extracted from adapter for testability.
 * No ctx, no fetch - pure functions only.
 *
 * Validated against real GoBiz API responses (2026-02-09).
 */

import { GOBIZ_CONFIG } from "./config";

// ─── Date Helpers ────────────────────────────────────────────────────────────

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

  // WIB 00:00:00 = UTC -7 hours
  const wibStartHour = 0 - 7;
  const startUtc = Date.UTC(year, month - 1, day, wibStartHour, 0, 0, 0);

  // WIB 23:59:59.999 = UTC 16:59:59.999
  const wibEndHour = 23 - 7;
  const endUtc = Date.UTC(year, month - 1, day, wibEndHour, 59, 59, 999);

  return { from: startUtc, to: endUtc };
}

/**
 * Convert a WIB date string to ISO 8601 UTC range strings.
 * Used by the journals/search API which expects ISO string timestamps.
 */
export function wibDateToUtcIsoRange(dateStr: string): { from: string; to: string } {
  const { from, to } = wibDateToUtcRange(dateStr);
  return {
    from: new Date(from).toISOString().replace("Z", "") + "Z",
    to: new Date(to).toISOString().replace(".999Z", ".999Z"),
  };
}

// ─── Dashboard API (proxy/63) ────────────────────────────────────────────────

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

  const result = {
    net: 0,
    gross: 0,
    commission: 0,
    adBurn: 0,
    promoBurn: 0,
    transactionCount: 0,
  };

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

  if (responses.length > 0 && responses[0]?.hits?.total?.value !== undefined) {
    result.transactionCount = responses[0].hits.total.value;
  }

  return result;
}

// ─── Journals/Search API (api.gobiz.co.id) ───────────────────────────────────

/**
 * Build headers for GoBiz journal and order APIs (api.gobiz.co.id).
 * These APIs use a simpler auth header than the dashboard proxy.
 */
export function buildGoBizApiHeaders(token: string): Record<string, string> {
  return {
    "accept": "application/json, text/plain, *, application/vnd.journal.v1+json",
    "accept-language": "en-US,en;q=0.9",
    "authentication-type": "go-id",
    "authorization": token.startsWith("Bearer ") ? token : `Bearer ${token}`,
    "content-type": "application/json",
    "origin": GOBIZ_CONFIG.portalBaseUrl,
    "referer": `${GOBIZ_CONFIG.portalBaseUrl}/`,
  };
}

/**
 * Build request body for journals/search API.
 * Matches the real GoBiz query format (clauses/op/field/value structure).
 *
 * Validated against real API request captured 2026-02-09.
 * Note: Time values are ISO 8601 UTC strings, NOT epoch_millis.
 */
export function buildJournalSearchBody(
  utcFromIso: string,
  utcToIso: string,
  merchantIds: string[],
  from: number,
  size: number
): object {
  return {
    from,
    size,
    sort: { time: { order: "desc" } },
    included_categories: {
      incoming: ["transaction_share", "action"],
    },
    query: [
      {
        op: "and",
        clauses: [
          // Exclude GoSave/GoDeals transactions
          {
            op: "not",
            clauses: [
              {
                op: "or",
                clauses: [
                  {
                    field: "metadata.source",
                    op: "in",
                    value: ["GOSAVE_ONLINE", "GoSave", "GODEALS_ONLINE"],
                  },
                  {
                    field: "metadata.gopay.source",
                    op: "in",
                    value: ["GOSAVE_ONLINE", "GoSave", "GODEALS_ONLINE"],
                  },
                ],
              },
            ],
          },
          // Only settled/captured/refunded transactions
          {
            field: "metadata.transaction.status",
            op: "in",
            value: ["settlement", "capture", "refund", "partial_refund"],
          },
          // Payment types (all supported)
          {
            op: "or",
            clauses: [
              {
                op: "or",
                clauses: [
                  {
                    field: "metadata.transaction.payment_type",
                    op: "in",
                    value: ["qris", "gopay", "offline_credit_card", "offline_debit_card", "credit_card"],
                  },
                ],
              },
            ],
          },
          // Date range (ISO 8601 UTC strings)
          {
            field: "metadata.transaction.transaction_time",
            op: "gte",
            value: utcFromIso,
          },
          {
            field: "metadata.transaction.transaction_time",
            op: "lte",
            value: utcToIso,
          },
          // Merchant filter (supports multiple merchants via "in" operator)
          {
            field: "metadata.transaction.merchant_id",
            op: "in",
            value: merchantIds,
          },
        ],
      },
    ],
  };
}

/**
 * Extracted metrics from a single journal hit.
 * Amounts are converted from journal centesimal (÷100) to IDR.
 */
export interface JournalMetrics {
  orderNumber: string;
  referenceId: string;
  transactionTime: string;
  transactionTimeMs: number;
  gross: number;
  net: number;
  commission: number;
  paymentType: string;
  status: string;
  merchantId: string;
}

/**
 * Extract metrics from a single journal API hit.
 *
 * IMPORTANT: Journal API amounts are in centesimal IDR (×100).
 * This function divides by 100 to return real IDR values.
 *
 * Mapping (from real response):
 * - gross = hit.amount / 100
 * - net = hit.transaction_share[0].amount / 100
 * - commission = hit.transaction_share[0].metadata.variables.commission / 100
 * - orderNumber = hit.metadata.transaction.order_id
 */
export function extractJournalMetrics(hit: any): JournalMetrics | null {
  if (!hit) return null;

  const CENTESIMAL_DIVISOR = 100;

  const orderNumber = hit.metadata?.transaction?.order_id ??
    hit.metadata?.transaction?.metadata?.order_id ?? "";
  const referenceId = hit.reference_id ?? hit.id ?? "";
  const transactionTime = hit.time ?? hit.metadata?.transaction?.transaction_time ?? "";
  const transactionTimeMs = transactionTime ? new Date(transactionTime).getTime() : 0;
  const status = hit.metadata?.transaction?.status ?? hit.status ?? "";
  const paymentType = hit.metadata?.transaction?.payment_type ?? "";
  const merchantId = hit.metadata?.transaction?.merchant_id ?? "";

  // Gross from hit.amount (centesimal)
  const grossRaw = hit.amount ?? hit.metadata?.transaction?.gross_amount ?? 0;
  const gross = grossRaw / CENTESIMAL_DIVISOR;

  // Net and commission from transaction_share
  const share = hit.transaction_share?.[0];
  const netRaw = share?.amount ?? share?.metadata?.merchant_share ?? 0;
  const net = netRaw / CENTESIMAL_DIVISOR;

  const commissionRaw = share?.metadata?.variables?.commission ??
    share?.metadata?.total_fee ??
    share?.metadata?.provider_share ?? 0;
  const commission = commissionRaw / CENTESIMAL_DIVISOR;

  return {
    orderNumber,
    referenceId,
    transactionTime,
    transactionTimeMs,
    gross,
    net,
    commission,
    paymentType,
    status,
    merchantId,
  };
}

/**
 * Aggregate journal metrics from multiple hits into daily totals.
 */
export function aggregateJournalMetrics(hits: any[]): {
  gross: number;
  net: number;
  commission: number;
  transactionCount: number;
  transactions: JournalMetrics[];
} {
  const transactions: JournalMetrics[] = [];
  let gross = 0;
  let net = 0;
  let commission = 0;

  for (const hit of hits) {
    const metrics = extractJournalMetrics(hit);
    if (metrics && metrics.status === "settlement") {
      transactions.push(metrics);
      gross += metrics.gross;
      net += metrics.net;
      commission += metrics.commission;
    }
  }

  return {
    gross,
    net,
    commission,
    transactionCount: transactions.length,
    transactions,
  };
}

// ─── Orders/Search API (api.gobiz.co.id) ─────────────────────────────────────

/**
 * Build request body for orders/search API.
 * Confirmed correct against real API (2026-02-09).
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
 * Parsed order item from orders/search response.
 */
export interface ParsedOrderItem {
  externalItemId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  variants?: string;
}

/**
 * Parse order items from orders/search response.
 *
 * Real response structure (validated 2026-02-09):
 *   { status: "success", data: { hits: [{ items: [...], gross_amount, ... }], total } }
 *
 * Note: Order API amounts are in raw IDR (no conversion needed).
 */
export function parseOrderItems(orderResponse: any): ParsedOrderItem[] {
  // Real path: response.data.hits[0].items
  const items = orderResponse?.data?.hits?.[0]?.items ?? [];

  return items.map((item: any) => ({
    externalItemId: item.id ?? "",
    productName: item.name ?? "",
    unitPrice: item.price ?? 0,
    quantity: item.quantity ?? 1,
    totalPrice: (item.price ?? 0) * (item.quantity ?? 1),
    variants: Array.isArray(item.variants) && item.variants.length > 0
      ? JSON.stringify(item.variants)
      : undefined,
  }));
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

/**
 * Build a deterministic dedup key for journal entries.
 * Format: orderNumber|txnTimeMs
 */
export function buildJournalDedupKey(orderNumber: string, txnTimeMs: number): string {
  return `${orderNumber}|${txnTimeMs}`;
}

/**
 * Get human-readable merchant name from merchant ID.
 * Falls back to the raw ID if not found in config.
 */
export function getMerchantName(merchantId: string): string {
  return GOBIZ_CONFIG.merchantNames[merchantId] ?? merchantId;
}

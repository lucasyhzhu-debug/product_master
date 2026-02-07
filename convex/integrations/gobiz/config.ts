/**
 * GoBiz (GoFood) API Configuration
 *
 * Grafana proxy to Elasticsearch for GoFood merchant revenue data.
 * Auth: Bearer token from GoBiz session (GOBIZ_API_TOKEN env var)
 */

export const GOBIZ_CONFIG = {
  baseUrl: "https://portal.gofoodmerchant.co.id",
  analyticsPath: "/analytics-backend/api/datasources",
  proxies: {
    netRevenue: {
      id: 4,
      panelId: "4",
      dashboardId: "7",
      valueField: "metadata.merchant_share",
      description: "Net sales (merchant share after platform fees)",
    },
    grossRevenue: {
      id: 44,
      panelId: "44",
      dashboardId: "18",
      valueField: "amount",
      description: "Gross sales (total before platform fees) + transaction count",
    },
  },
  headers: {
    "authentication-type": "go-id",
    "x-grafana-org-id": "1",
    "x-custom-merchant-id": "",
  },
} as const;

/**
 * Build the Elasticsearch index name for a given date.
 * GoBiz uses monthly indexes: journal_incoming_v2_YYYY-MM
 */
export function buildIndexName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `journal_incoming_v2_${year}-${month}`;
}

/**
 * Build NDJSON body for Elasticsearch _msearch request.
 * Returns two lines: search header + query body, terminated with newline.
 */
export function buildNdjsonBody(indexName: string, rangeFrom: number, rangeTo: number): string {
  const header = JSON.stringify({
    search_type: "query_then_fetch",
    ignore_unavailable: true,
    index: [indexName],
  });

  const query = JSON.stringify({
    size: 0,
    query: {
      bool: {
        filter: [
          {
            range: {
              time: {
                gte: rangeFrom,
                lte: rangeTo,
                format: "epoch_millis",
              },
            },
          },
          {
            query_string: {
              analyze_wildcard: true,
              query: 'metadata.source:("goresto_online" OR "GORESTO_ONLINE_PICKUP")',
            },
          },
        ],
      },
    },
    aggs: {
      total_amount: {
        sum: {
          field: "amount",
        },
      },
      total_merchant_share: {
        sum: {
          field: "metadata.merchant_share",
        },
      },
    },
  });

  return header + "\n" + query + "\n";
}

export interface GoBizMsearchResponse {
  responses: Array<{
    hits: {
      total: {
        value: number;
      };
    };
    aggregations?: {
      total_amount?: { value: number };
      total_merchant_share?: { value: number };
    };
  }>;
}

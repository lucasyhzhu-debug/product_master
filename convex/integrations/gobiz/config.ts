/**
 * GoBiz (GoFood) API Configuration
 *
 * Three API endpoints for revenue data:
 * 1. Dashboard Analytics (proxy/63) - 5-metric daily aggregates (primary)
 * 2. Journals/Search - Transaction-level data (future)
 * 3. Orders/Search - Item details per order (future)
 *
 * Plus token refresh endpoints for auto-renewal.
 */

export const GOBIZ_CONFIG = {
  /** @deprecated Use merchantIds instead */
  merchantId: "G293156297" as const,
  merchantIds: ["G293156297", "G347061572"] as const,
  merchantNames: {
    "G293156297": "Legato Goldfinch",
    "G347061572": "GoFood Crystal",
  } as Record<string, string>,
  portalBaseUrl: "https://portal.gofoodmerchant.co.id",
  dashboardApi: {
    proxyId: 63,
    dashboardId: "107",
    panelId: "22",
    refIds: [
      "total_gmv_bottomline_amount",  // Net sales [0]
      "total_gmv_topline_amount",     // Gross sales [1]
      "total_commission_amount",      // Commission [2]
      "total_ad_burn_amount",         // Ad spend [3]
      "total_promo_burn_amount",      // Promo spend [4]
    ],
  },
  journalApi: {
    url: "https://api.gobiz.co.id/journals/search",
    pageSize: 50,
  },
  orderApi: {
    url: "https://api.gobiz.co.id/cosmo/v1/orders/search",
  },
  tokenRefresh: {
    microAppUrl: "https://portal.gofoodmerchant.co.id/micro-app/auth",
    rotateUrl: "https://portal.gofoodmerchant.co.id/analytics-backend/api/auth/token/rotate",
    apiUrl: "https://api.gobiz.co.id/auth/token/refresh",
  },
  sync: {
    defaultDaysBack: 7,
    overlapDays: 1,
    wibOffsetHours: 7,
  },
} as const;

/**
 * Dashboard API _msearch response structure.
 * Contains array of responses with aggregations for each metric.
 */
export interface GoBizDashboardResponse {
  responses: Array<{
    status?: number;
    hits?: {
      total?: {
        value: number;
      };
    };
    aggregations?: {
      "2"?: {
        buckets: Array<{
          "1"?: { value: number };
          key_as_string?: string;
        }>;
      };
    };
  }>;
}

/**
 * Extracted 5-metric dashboard data.
 */
export interface GoBizDashboardMetrics {
  gross: number;
  net: number;
  commission: number;
  adBurn: number;
  promoBurn: number;
  transactionCount: number;
}

/**
 * Seed data for GoBiz outlets.
 * Both Crystal and Goldfinch must be pre-registered in externalOutlets
 * before the first sync runs.
 *
 * Run `seedGoBizOutlets` from Convex dashboard Functions tab during initial setup.
 */
export const GOBIZ_OUTLET_SEED = [
  { externalId: "G293156297", name: "Legato Goldfinch", source: "gobiz" as const },
  { externalId: "G347061572", name: "GoFood Crystal", source: "gobiz" as const },
] as const;

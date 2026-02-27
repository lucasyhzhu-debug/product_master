/**
 * BigSeller integration helpers -- pure functions for request building,
 * response parsing, and field mapping.
 *
 * No "use node" -- these are pure functions usable in any Convex context.
 */

import type { Id } from "../../_generated/dataModel";
import {
  BIGSELLER_FROLLIE_SHOP_IDS,
  BIGSELLER_PAGE_SIZE,
} from "./config";

// ─── Request Builders ────────────────────────────────────────────────────────

/**
 * Build headers for BigSeller API requests.
 * BigSeller uses cookie-based auth with the muc_token JWT.
 */
export function buildBigSellerHeaders(mucToken: string): Record<string, string> {
  return {
    cookie: `muc_token=${mucToken}; muc_login_account_type=EMAIL_ACCOUNT_TYPE`,
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    referer: "https://www.bigseller.com/",
    origin: "https://www.bigseller.com",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
    clienttype: "1",
  };
}

/**
 * Build the full request body for POST pageList.json.
 * ALL fields are required -- omitting any causes silent code:-1 failures.
 * See docs/BIGSELLER_PROFIT_API.md "Shared Request Schema (Profit)".
 */
export function buildPageListBody(
  startDate: string,
  endDate: string,
  pageNo: number,
  shopIds: number[] = BIGSELLER_FROLLIE_SHOP_IDS,
): Record<string, unknown> {
  return {
    pageNo,
    pageSize: BIGSELLER_PAGE_SIZE,
    searchType: "order",
    platformTemplate: "common",
    startTime: startDate,
    endTime: endDate,
    timeType: "orderCreatedTime",
    currency: "IDR",
    orderState: ["completed", "shipped", "canceled", "other", "new"],
    queryType: "sku",
    orderType: "orderNo",
    orderBy: "",
    desc: false,
    inquireType: 0,
    platforms: [],
    shopIds,
    warehouseIds: [],
    searchContent: null,
    adjustmentUpdateTimeStartTime: null,
    adjustmentUpdateTimeEndTime: null,
    lableIds: null,
    hasLable: "",
    sampleOrder: null,
    dimension: "",
    evalationOrder: "",
    categoryList: "",
  };
}

/**
 * Build request body for sync/task/create.json.
 */
export function buildSyncTaskCreateBody(
  startDate: string,
  endDate: string,
): Record<string, string> {
  return {
    startTime: startDate,
    endTime: endDate,
    timeType: "orderCreatedTime",
  };
}

// ─── Response Parsers ────────────────────────────────────────────────────────

/**
 * Detect HTML response (auth failure indicator).
 * BigSeller returns HTML login page instead of JSON when token is expired.
 * See docs/BIGSELLER_PROFIT_API.md Pitfall 4.
 */
export function detectHtmlResponse(responseText: string): boolean {
  const trimmed = responseText.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

// ─── Field Mappers ───────────────────────────────────────────────────────────

/**
 * Raw BigSeller order row shape from pageList.json response.
 */
export interface BigSellerOrderRow {
  shopId: number;
  shopName: string;
  platform: string;
  platformOrderId: string;
  orderState: string;
  orderTime: number; // Unix ms
  saleAmount: number;
  platformIncome: number;
  costFee: number;
  profit: number;
  profitMargin: string;
  commissionFee: number;
  sellerShippingFee: number;
  buyerShippingFee: number;
  otherFee: number;
  allSkuNum: number;
  skuVoList: Array<{
    sku: string;
    skuNum: number;
    returnNum: number;
    isAddition: number;
  }>;
}

/**
 * Map a BigSeller pageList row to externalRevenue saveRevenue args format.
 * Source = actual platform (shopee/tiktok), NOT "bigseller".
 * Commission stored as positive value (Math.abs of negative fee).
 */
export function mapOrderToRevenue(
  order: BigSellerOrderRow,
  syncLogId: Id<"externalSyncLogs"> | string,
): {
  source: string;
  externalTransactionId: string;
  revenueGross: number;
  revenueNet: number;
  commission: number;
  periodStart: number;
  periodEnd: number;
  transactionDate: number;
  dataOrigin: "api_revenue";
  confidence: "exact";
  transactionType: "sales";
  syncLogId: Id<"externalSyncLogs"> | undefined;
} {
  const platform = order.platform?.toLowerCase() || "shopee";
  const orderTimeMs = order.orderTime || Date.now();

  return {
    source: platform,
    externalTransactionId: `bigseller:${order.platformOrderId}`,
    revenueGross: order.saleAmount || 0,
    revenueNet: order.platformIncome || 0,
    commission: Math.abs(order.commissionFee || 0),
    periodStart: orderTimeMs,
    periodEnd: orderTimeMs,
    transactionDate: orderTimeMs,
    dataOrigin: "api_revenue" as const,
    confidence: "exact" as const,
    transactionType: "sales" as const,
    syncLogId: (typeof syncLogId === "string" ? undefined : syncLogId) as Id<"externalSyncLogs"> | undefined,
  };
}

/**
 * Map a BigSeller pageList row to bigsellerOrders insert format.
 * Preserves raw negative fee values (do NOT abs in storage).
 */
export function mapOrderToStorage(
  order: BigSellerOrderRow,
  syncLogId: Id<"externalSyncLogs"> | string,
): {
  platformOrderId: string;
  shopId: number;
  shopName: string;
  platform: string;
  orderState: string;
  orderTimeMs: number;
  saleAmount: number;
  platformIncome: number;
  costFee: number;
  profit: number;
  profitMargin: string;
  commissionFee: number;
  sellerShippingFee: number;
  buyerShippingFee: number;
  otherFee: number;
  allSkuNum: number;
  skuVoList: Array<{
    sku: string;
    skuNum: number;
    returnNum: number;
    isAddition: number;
  }>;
  syncLogId: Id<"externalSyncLogs"> | undefined;
  createdAt: number;
} {
  return {
    platformOrderId: order.platformOrderId,
    shopId: order.shopId,
    shopName: order.shopName,
    platform: order.platform?.toLowerCase() || "shopee",
    orderState: order.orderState || "unknown",
    orderTimeMs: order.orderTime || Date.now(),
    saleAmount: order.saleAmount || 0,
    platformIncome: order.platformIncome || 0,
    costFee: order.costFee || 0,
    profit: order.profit || 0,
    profitMargin: order.profitMargin || "0%",
    commissionFee: order.commissionFee || 0,
    sellerShippingFee: order.sellerShippingFee || 0,
    buyerShippingFee: order.buyerShippingFee || 0,
    otherFee: order.otherFee || 0,
    allSkuNum: order.allSkuNum || 0,
    skuVoList: (order.skuVoList || []).map((item) => ({
      sku: item.sku || "",
      skuNum: item.skuNum || 0,
      returnNum: item.returnNum || 0,
      isAddition: item.isAddition || 0,
    })),
    syncLogId: (typeof syncLogId === "string" ? undefined : syncLogId) as Id<"externalSyncLogs"> | undefined,
    createdAt: Date.now(),
  };
}

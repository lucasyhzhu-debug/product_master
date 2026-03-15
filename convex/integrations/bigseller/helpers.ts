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
  BIGSELLER_PLATFORM_ENDPOINTS,
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
 *
 * @param platformTemplate - "common" returns 0 for Shopee/TikTok fees.
 *   Use "shopee" or "tiktok" for platform-specific fee breakdown.
 */
export function buildPageListBody(
  startDate: string,
  endDate: string,
  pageNo: number,
  shopIds: number[] = BIGSELLER_FROLLIE_SHOP_IDS,
  platformTemplate: "common" | "shopee" | "tiktok" = "common",
): Record<string, unknown> {
  return {
    pageNo,
    pageSize: BIGSELLER_PAGE_SIZE,
    searchType: "order",
    platformTemplate,
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
 * Get the API endpoint path for a platform-specific pageList call.
 * Returns the path segment after BIGSELLER_API_BASE.
 * Falls back to common endpoint if platform is not recognized.
 */
export function getPageListEndpoint(platform: string): string {
  return BIGSELLER_PLATFORM_ENDPOINTS[platform] || "pageList.json";
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
 * Includes optional platform-specific fee fields returned by
 * shopee/pageList.json and tiktok/pageList.json endpoints.
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
  // Common fields that may be absent on platform-specific endpoints
  orderAmount?: number; // Total buyer paid (product + shipping)
  // Shopee-specific fields (from shopee/pageList.json)
  originalPrice?: number; // Shopee: product sale price (maps to saleAmount)
  buyerTotalAmount?: number; // Shopee: total buyer paid incl. shipping (maps to orderAmount)
  sellerTransactionFee?: number;
  orderAmsCommissionFee?: number;
  campaignFee?: number;
  finalShippingFee?: number;
  sellerOrderProcessingFee?: number;
  shippingSellerProtectionFeeAmount?: number;
  serviceFee?: number;
  // TikTok-specific fields (from tiktok/pageList.json)
  revenueAmount?: number; // TikTok: product revenue (maps to saleAmount)
  settlementAmount?: number; // TikTok: net settlement (maps to platformIncome)
  customerPaidShippingFeeAmount?: number; // TikTok: buyer shipping (maps to buyerShippingFee)
  platformCommissionAmount?: number;
  transactionFeeAmount?: number;
  referralFeeAmount?: number;
  affiliateCommissionAmount?: number;
  affiliatePartnerCommissionAmount?: number;
  dynamicCommissionAmount?: number;
  sfpServiceFeeAmount?: number;
  shippingCostAmount?: number;
  actualShippingFeeAmount?: number;
  codServiceFeeAmount?: number;
  feeTaxAmount?: number;
  extraCostsFee?: number;
  // Case-variant field from platform-specific endpoints (lowercase 'f')
  otherfee?: number;
}

/**
 * Check if a common field should be overwritten with platform-specific data.
 *
 * Returns true when:
 * - field is null or undefined (platform-specific endpoint didn't populate it)
 * - field is 0 AND aggregated is non-zero (common endpoint set it to 0 because
 *   the data was missing from its schema, but platform-specific endpoint has real data)
 *
 * NEVER use `!field` (treats real 0 as missing).
 * NEVER use bare `== null` alone (misses the 0-from-common-endpoint case).
 */
function shouldOverwrite(field: number | undefined | null, aggregated: number): boolean {
  return field == null || (field === 0 && aggregated !== 0);
}

/**
 * Normalize platform-specific fields into common field names.
 *
 * Fixes saleAmount, platformIncome, commissionFee, sellerShippingFee,
 * buyerShippingFee, otherFee, and orderAmount using platform-specific
 * field mappings confirmed via HAR capture analysis.
 *
 * Platform-specific endpoints (shopee/pageList.json, tiktok/pageList.json)
 * return different field names and sign conventions than the common endpoint.
 * This function normalizes them into the common field set.
 *
 * IMPORTANT: The `platform` parameter must come from BIGSELLER_SHOP_PLATFORM_MAP,
 * NOT from order.platform (which is null on platform-specific endpoints).
 *
 * Mutates the order row in place for efficiency.
 */
export function normalizePlatformFees(
  order: BigSellerOrderRow,
  platform: "shopee" | "tiktok" | "common",
): BigSellerOrderRow {
  // Handle otherfee/otherFee case mismatch at top of function.
  // Platform-specific endpoints return `otherfee` (lowercase f) while
  // the common endpoint uses `otherFee` (camelCase).
  if (order.otherFee == null && order.otherfee != null) {
    order.otherFee = order.otherfee;
  }

  if (platform === "shopee") {
    // ── BUG-01: saleAmount missing — use originalPrice ──
    if (shouldOverwrite(order.saleAmount, order.originalPrice ?? 0)) {
      order.saleAmount = order.originalPrice ?? 0;
    }

    // ── BUG-05: Shopee fees are POSITIVE, must negate via -Math.abs() ──
    const aggregatedCommission = (order.sellerTransactionFee ?? 0)
      + (order.orderAmsCommissionFee ?? 0)
      + (order.campaignFee ?? 0)
      + (order.sellerOrderProcessingFee ?? 0);
    if (shouldOverwrite(order.commissionFee, aggregatedCommission)) {
      order.commissionFee = -Math.abs(aggregatedCommission);
    }

    const aggregatedShipping = (order.finalShippingFee ?? 0)
      + (order.shippingSellerProtectionFeeAmount ?? 0);
    if (shouldOverwrite(order.sellerShippingFee, aggregatedShipping)) {
      order.sellerShippingFee = -Math.abs(aggregatedShipping);
    }

    const aggregatedOther = order.serviceFee ?? 0;
    // Use the raw otherFee value (possibly from otherfee case mismatch)
    if (shouldOverwrite(order.otherFee, aggregatedOther)) {
      order.otherFee = -Math.abs(aggregatedOther);
    }

    // ── ENH-ORDERAMOUNT: Shopee orderAmount from buyerTotalAmount ──
    if (shouldOverwrite(order.orderAmount, order.buyerTotalAmount ?? 0)) {
      order.orderAmount = order.buyerTotalAmount ?? 0;
    }

  } else if (platform === "tiktok") {
    // ── BUG-01 + BUG-03: TikTok missing common fields ──
    if (shouldOverwrite(order.saleAmount, order.revenueAmount ?? 0)) {
      order.saleAmount = order.revenueAmount ?? 0;
    }

    if (shouldOverwrite(order.platformIncome, order.settlementAmount ?? 0)) {
      order.platformIncome = order.settlementAmount ?? 0;
    }

    if (shouldOverwrite(order.buyerShippingFee, order.customerPaidShippingFeeAmount ?? 0)) {
      order.buyerShippingFee = order.customerPaidShippingFeeAmount ?? 0;
    }

    // TikTok commissionFee = sum of 6 platform-specific fee fields (already negative)
    const aggregatedCommission = (order.platformCommissionAmount ?? 0)
      + (order.dynamicCommissionAmount ?? 0)
      + (order.transactionFeeAmount ?? 0)
      + (order.referralFeeAmount ?? 0)
      + (order.affiliateCommissionAmount ?? 0)
      + (order.affiliatePartnerCommissionAmount ?? 0);
    if (shouldOverwrite(order.commissionFee, aggregatedCommission)) {
      order.commissionFee = aggregatedCommission; // Already negative, no abs needed
    }

    // TikTok sellerShippingFee: stays 0 (actualShippingFeeAmount is informational)
    if (order.sellerShippingFee == null) {
      order.sellerShippingFee = 0;
    }

    // TikTok otherFee: only extraCostsFee (already negative, HAR-confirmed)
    const extraCosts = order.extraCostsFee ?? 0;
    if (shouldOverwrite(order.otherFee, extraCosts)) {
      order.otherFee = extraCosts;
    }

    // ── ENH-ORDERAMOUNT: TikTok orderAmount computed after saleAmount + buyerShippingFee ──
    const computedOrderAmount = (order.saleAmount ?? 0) + (order.buyerShippingFee ?? 0);
    if (shouldOverwrite(order.orderAmount, computedOrderAmount)) {
      order.orderAmount = computedOrderAmount;
    }
  }
  // "common" platform: no changes (return as-is)

  return order;
}

/**
 * Map a BigSeller pageList row to externalRevenue saveRevenue args format.
 * Source = actual platform (shopee/tiktok), NOT "bigseller".
 * Commission stored as positive value (Math.abs of negative fee).
 *
 * Revenue semantics:
 * - revenueGross = orderAmount (total buyer paid incl. shipping). Falls back to saleAmount.
 * - revenueNet = platformIncome (what Frollie receives after all deductions).
 *
 * Uses explicit platform parameter (not order.platform which is null
 * on platform-specific endpoints). Fixes BUG-02.
 *
 * Financial fields use ?? 0 (not || 0) to preserve real zero values.
 */
export function mapOrderToRevenue(
  order: BigSellerOrderRow,
  syncLogId: Id<"externalSyncLogs"> | string,
  platform: string,
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
  const orderTimeMs = order.orderTime || Date.now();

  return {
    source: platform.toLowerCase(),
    externalTransactionId: `bigseller:${order.platformOrderId}`,
    revenueGross: order.orderAmount ?? order.saleAmount ?? 0,
    revenueNet: order.platformIncome ?? 0,
    commission: Math.abs(order.commissionFee ?? 0),
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
 *
 * Uses explicit platform parameter (not order.platform which is null
 * on platform-specific endpoints). Fixes BUG-02.
 *
 * Financial fields use ?? 0 (not || 0) to preserve real zero values.
 */
export function mapOrderToStorage(
  order: BigSellerOrderRow,
  syncLogId: Id<"externalSyncLogs"> | string,
  platform: string,
): {
  platformOrderId: string;
  shopId: number;
  shopName: string;
  platform: string;
  orderState: string;
  orderTimeMs: number;
  saleAmount: number;
  orderAmount: number;
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
    platform: platform.toLowerCase(),
    orderState: order.orderState || "unknown",
    orderTimeMs: order.orderTime || Date.now(),
    saleAmount: order.saleAmount ?? 0,
    orderAmount: order.orderAmount ?? 0,
    platformIncome: order.platformIncome ?? 0,
    costFee: order.costFee ?? 0,
    profit: order.profit ?? 0,
    profitMargin: order.profitMargin || "0%",
    commissionFee: order.commissionFee ?? 0,
    sellerShippingFee: order.sellerShippingFee ?? 0,
    buyerShippingFee: order.buyerShippingFee ?? 0,
    otherFee: order.otherFee ?? 0,
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

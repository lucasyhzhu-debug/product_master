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
  // Shopee-specific fields (from shopee/pageList.json)
  sellerTransactionFee?: number;
  orderAmsCommissionFee?: number;
  campaignFee?: number;
  finalShippingFee?: number;
  sellerOrderProcessingFee?: number;
  shippingSellerProtectionFeeAmount?: number;
  serviceFee?: number;
  // TikTok-specific fields (from tiktok/pageList.json)
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
}

/**
 * Normalize platform-specific fee fields into the common commissionFee,
 * sellerShippingFee, and otherFee fields.
 *
 * The common pageList.json endpoint returns 0 for these fields on Shopee orders.
 * Platform-specific endpoints (shopee/pageList.json, tiktok/pageList.json) return
 * the real values in platform-specific fields that need to be aggregated.
 *
 * Mutates the order row in place for efficiency.
 */
export function normalizePlatformFees(order: BigSellerOrderRow): BigSellerOrderRow {
  const platform = order.platform?.toLowerCase() || "";

  if (platform === "shopee") {
    // Shopee commission = sellerTransactionFee + orderAmsCommissionFee + campaignFee
    // These are typically negative values (deductions from seller)
    const transactionFee = order.sellerTransactionFee || 0;
    const amsCommission = order.orderAmsCommissionFee || 0;
    const campaignFee = order.campaignFee || 0;
    const processingFee = order.sellerOrderProcessingFee || 0;
    const aggregatedCommission = transactionFee + amsCommission + campaignFee + processingFee;

    // Shopee shipping = finalShippingFee (net cost to seller after rebates)
    const shippingFee = order.finalShippingFee || 0;
    const shippingProtection = order.shippingSellerProtectionFeeAmount || 0;
    const aggregatedShipping = shippingFee + shippingProtection;

    // Shopee other = serviceFee + any remaining uncategorized fees
    const serviceFee = order.serviceFee || 0;
    const aggregatedOther = serviceFee;

    // Only override if common fields are 0 (don't double-count if API already populated them)
    if (order.commissionFee === 0 && aggregatedCommission !== 0) {
      order.commissionFee = aggregatedCommission;
    }
    if (order.sellerShippingFee === 0 && aggregatedShipping !== 0) {
      order.sellerShippingFee = aggregatedShipping;
    }
    if (order.otherFee === 0 && aggregatedOther !== 0) {
      order.otherFee = aggregatedOther;
    }
  } else if (platform === "tiktok") {
    // TikTok commission = platformCommissionAmount + transactionFeeAmount + referralFeeAmount
    //                     + affiliateCommissionAmount + affiliatePartnerCommissionAmount + dynamicCommissionAmount
    const platformCommission = order.platformCommissionAmount || 0;
    const transactionFee = order.transactionFeeAmount || 0;
    const referralFee = order.referralFeeAmount || 0;
    const affiliateCommission = order.affiliateCommissionAmount || 0;
    const affiliatePartner = order.affiliatePartnerCommissionAmount || 0;
    const dynamicCommission = order.dynamicCommissionAmount || 0;
    const aggregatedCommission = platformCommission + transactionFee + referralFee
      + affiliateCommission + affiliatePartner + dynamicCommission;

    // TikTok shipping = shippingCostAmount + actualShippingFeeAmount
    const shippingCost = order.shippingCostAmount || 0;
    const actualShipping = order.actualShippingFeeAmount || 0;
    const aggregatedShipping = shippingCost + actualShipping;

    // TikTok other = sfpServiceFeeAmount + codServiceFeeAmount + feeTaxAmount + extraCostsFee
    const sfpService = order.sfpServiceFeeAmount || 0;
    const codService = order.codServiceFeeAmount || 0;
    const feeTax = order.feeTaxAmount || 0;
    const extraCosts = order.extraCostsFee || 0;
    const aggregatedOther = sfpService + codService + feeTax + extraCosts;

    if (order.commissionFee === 0 && aggregatedCommission !== 0) {
      order.commissionFee = aggregatedCommission;
    }
    if (order.sellerShippingFee === 0 && aggregatedShipping !== 0) {
      order.sellerShippingFee = aggregatedShipping;
    }
    if (order.otherFee === 0 && aggregatedOther !== 0) {
      order.otherFee = aggregatedOther;
    }
  }

  return order;
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

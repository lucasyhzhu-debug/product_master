/**
 * BigSeller integration helpers -- pure functions for request building,
 * response parsing, and field mapping.
 *
 * No "use node" -- these are pure functions usable in any Convex context.
 */

import type { Id } from "../../_generated/dataModel";
import { decodeJwtPayload } from "../../lib/jwt";
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
 * Phase 83-01a (2026-05-19): added 6 newly-required fields (settleStatus,
 * transactionStatus, fbsOrder, groupType, orderStatus, totalCurrency) that
 * BigSeller silently introduced between Feb 2026 and May 2026. Field set is
 * pinned by an HAR-fixture test under `__tests__/fixtures/`.
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
  // Platform endpoints use string "" for groupType + include orderStatus.
  // Common endpoint uses int 0 and omits orderStatus. HAR-verified 2026-05-19.
  const isPlatformSpecific = platformTemplate === "shopee" || platformTemplate === "tiktok";

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

    // Required since 2026-05-19. Omitting any causes BigSeller to return
    // code:-1 "Failed, please try again later" with no field-name indication.
    settleStatus: 1,
    transactionStatus: "",
    fbsOrder: "",
    groupType: isPlatformSpecific ? "" : 0,
    totalCurrency: "IDR",
    ...(isPlatformSpecific ? { orderStatus: [] } : {}),
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

/**
 * Known BigSeller JSON error codes that indicate authentication failure.
 * BigSeller may return JSON auth errors instead of HTML redirects.
 *
 * - 401006: Session/token expired or invalid (observed with errorCode 2001)
 * - 401001: Token missing or malformed
 * - 401003: Account suspended/locked
 */
const BIGSELLER_AUTH_ERROR_CODES = new Set([401006, 401001, 401003]);

/**
 * Detect JSON-based auth failure from a parsed BigSeller API response.
 * BigSeller can return auth failures as JSON (e.g., {code: 401006, errorCode: 2001})
 * instead of HTML login page redirects. This catches cases that detectHtmlResponse() misses.
 *
 * @param parsed - The parsed JSON response object
 * @returns true if the response indicates an authentication failure
 */
export function isJsonAuthError(parsed: { code: number; errorCode?: number; msg?: string }): boolean {
  // Check top-level code for known auth error codes
  if (BIGSELLER_AUTH_ERROR_CODES.has(parsed.code)) {
    return true;
  }
  // Check nested errorCode field (BigSeller sometimes uses this for auth errors)
  if (parsed.errorCode !== undefined && BIGSELLER_AUTH_ERROR_CODES.has(parsed.errorCode)) {
    return true;
  }
  return false;
}

/**
 * Check whether the persisted muc_token JWT is past its `exp`, or within
 * `graceMs` of expiring. Fail-SAFE — if the token is malformed or the payload
 * is missing `exp`, this returns `true` so callers route to the auth-failure
 * path instead of silently retrying.
 *
 * Used by the page-1 readiness-retry path: BigSeller returns generic
 * `code=-1, msg="Failed, please try again later"` for at least three different
 * upstream conditions (sync-task still in progress, missing required field,
 * AND server-side session timeout). The `code=-1` surface is structurally
 * indistinguishable for those cases at the response layer — but if our locally
 * stored JWT is already past `exp`, the only remaining explanation is auth
 * decay. This helper is the disambiguator.
 *
 * `exp` in JWT spec is Unix seconds; we compare against `Date.now() / 1000`.
 */
export function isJwtExpiredOrExpiring(token: string, graceMs: number = 0): boolean {
  if (!token) return true;
  let payload: Record<string, unknown>;
  try {
    payload = decodeJwtPayload(token);
  } catch {
    return true; // malformed → treat as expired (fail-safe)
  }
  const exp = payload.exp;
  if (typeof exp !== "number") return true; // no exp claim → fail-safe
  const nowSec = Date.now() / 1000;
  const graceSec = graceMs / 1000;
  return exp <= nowSec + graceSec;
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
  buyerPaidShippingFee?: number; // Shopee: buyer-paid shipping (maps to buyerShippingFee)
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
  // TODO (deferred from staffreview I2): May 2026 HAR exposed 4 additional
  // optional response fields not modeled here. Add typed entries when a
  // downstream consumer needs them (e.g., COGS feature once Frollie configures
  // per-SKU costs in BigSeller):
  //   costOfGoodsSold?: number;                       // shopee/pageList.json
  //   escrowTax?: number;                             // shopee/pageList.json
  //   shopeeShippingRebate?: number;                  // shopee/pageList.json
  //   deliverySellerProtectionFeePremiumAmount?: number; // shopee/pageList.json
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
 * All fee fields (commissionFee, sellerShippingFee, otherFee) are normalized
 * to POSITIVE values at sync time. This eliminates downstream Math.abs()
 * workarounds and ensures consistent sign convention across all platforms.
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

    // ── BUG-05 + 64-03: Shopee fees normalized to POSITIVE via Math.abs() ──
    const aggregatedCommission = (order.sellerTransactionFee ?? 0)
      + (order.orderAmsCommissionFee ?? 0)
      + (order.campaignFee ?? 0)
      + (order.sellerOrderProcessingFee ?? 0);
    if (shouldOverwrite(order.commissionFee, aggregatedCommission)) {
      order.commissionFee = Math.abs(aggregatedCommission);
    }

    const aggregatedShipping = (order.finalShippingFee ?? 0)
      + (order.shippingSellerProtectionFeeAmount ?? 0);
    if (shouldOverwrite(order.sellerShippingFee, aggregatedShipping)) {
      order.sellerShippingFee = Math.abs(aggregatedShipping);
    }

    const aggregatedOther = order.serviceFee ?? 0;
    // Use the raw otherFee value (possibly from otherfee case mismatch)
    if (shouldOverwrite(order.otherFee, aggregatedOther)) {
      order.otherFee = Math.abs(aggregatedOther);
    }

    // ── ENH-ORDERAMOUNT: Shopee orderAmount from buyerTotalAmount ──
    if (shouldOverwrite(order.orderAmount, order.buyerTotalAmount ?? 0)) {
      order.orderAmount = order.buyerTotalAmount ?? 0;
    }

    // ── BUYER-SHIPPING (Phase 54 research line 351; missed during original
    // execution): Shopee `/shopee/pageList.json` does not return the common
    // `buyerShippingFee` field — use Shopee-specific `buyerPaidShippingFee`.
    // Docs/BIGSELLER_PROFIT_API.md field-availability matrix line 1456
    // confirms common `buyerShippingFee` is MISSING on shopee endpoint; line
    // 1472 confirms the mapping `buyerShippingFee <- buyerPaidShippingFee`.
    // Positive convention — no negate. ──
    if (shouldOverwrite(order.buyerShippingFee, order.buyerPaidShippingFee ?? 0)) {
      order.buyerShippingFee = Math.abs(order.buyerPaidShippingFee ?? 0);
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

    // TikTok commissionFee = abs of sum of 6 platform-specific fee fields (normalized to positive)
    const aggregatedCommission = (order.platformCommissionAmount ?? 0)
      + (order.dynamicCommissionAmount ?? 0)
      + (order.transactionFeeAmount ?? 0)
      + (order.referralFeeAmount ?? 0)
      + (order.affiliateCommissionAmount ?? 0)
      + (order.affiliatePartnerCommissionAmount ?? 0);
    if (shouldOverwrite(order.commissionFee, aggregatedCommission)) {
      order.commissionFee = Math.abs(aggregatedCommission);
    }

    // TikTok sellerShippingFee: stays 0 (actualShippingFeeAmount is informational)
    if (order.sellerShippingFee == null) {
      order.sellerShippingFee = 0;
    }

    // TikTok otherFee: only extraCostsFee (normalized to positive)
    const extraCosts = order.extraCostsFee ?? 0;
    if (shouldOverwrite(order.otherFee, extraCosts)) {
      order.otherFee = Math.abs(extraCosts);
    }

    // ── ENH-ORDERAMOUNT: TikTok orderAmount computed after saleAmount + buyerShippingFee ──
    const computedOrderAmount = (order.saleAmount ?? 0) + (order.buyerShippingFee ?? 0);
    if (shouldOverwrite(order.orderAmount, computedOrderAmount)) {
      order.orderAmount = computedOrderAmount;
    }
  } else {
    // "common" platform: normalize any negative fees to positive
    if ((order.commissionFee ?? 0) < 0) {
      order.commissionFee = Math.abs(order.commissionFee ?? 0);
    }
    if ((order.sellerShippingFee ?? 0) < 0) {
      order.sellerShippingFee = Math.abs(order.sellerShippingFee ?? 0);
    }
    if ((order.otherFee ?? 0) < 0) {
      order.otherFee = Math.abs(order.otherFee ?? 0);
    }
  }

  return order;
}

/**
 * Map a BigSeller pageList row to externalRevenue saveRevenue args format.
 * Source = actual platform (shopee/tiktok), NOT "bigseller".
 * Commission and fees are already positive from normalizePlatformFees().
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
  deliveryFees: number;
  transactionCount: number;
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
    commission: order.commissionFee ?? 0,
    deliveryFees: (order.sellerShippingFee ?? 0) + (order.buyerShippingFee ?? 0),
    transactionCount: 1,
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
 * Fee values are already normalized to positive by normalizePlatformFees().
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

// ─── Phase 79: Price Oracle + Prorate + Dominant-SKU (pure helpers) ──────────
//
// Three pure functions that underpin Shopee item-level revenue emission.
// All logic is deliberately ctx-free so it is unit-testable without
// convex-test. Consumers live in `convex/integrations/bigseller/sync.ts`
// (Plan 03) and `convex/externalData/mutations.ts applyRetroactiveProductMapping`
// (Plan 04).
//
// Anchors (see 79-CONTEXT.md §Implementation Decisions):
//   - D-01: Residual IDR from pro-rata floor() → largest-qty item so
//           Σ items.totalPrice === orderAmount exactly.
//   - D-03: Three-tier price fallback — oracle → menuProduct.price → flat share.
//   - D-04: Parent revenue is the source of truth; items exist for attribution.
//   - D-09: Dominant SKU = max qty; tie → max menuProduct.price; further tie →
//           first-listed wins (assumption A5).

/**
 * Build a per-SKU median-price oracle from historical single-SKU orders.
 *
 * Only single-SKU orders contribute (multi-SKU orders cannot unambiguously
 * attribute price to a specific SKU without the very logic we are bootstrapping).
 * For each SKU, per-unit prices are collected from `baseAmount / skuNum` where
 * `baseAmount = orderAmount ?? saleAmount` (D-01 sum-invariance anchor — see A4
 * in 79-RESEARCH.md), sorted, and reduced to a median (average of two middles
 * when even-length). Final value is `Math.round(median)` to stay in integer IDR.
 *
 * The oracle is rebuilt on every sync invocation (no cache). Acceptable at
 * expected volume (~6K `bigsellerOrders`; see 79-RESEARCH.md §Pitfalls).
 */
export function buildPriceOracle(
  orders: ReadonlyArray<{
    orderAmount?: number;
    saleAmount: number;
    skuVoList: ReadonlyArray<{ sku: string; skuNum: number }>;
  }>,
): Map<string, number> {
  const samples = new Map<string, number[]>();
  for (const order of orders) {
    if (order.skuVoList.length !== 1) continue; // single-SKU only
    const entry = order.skuVoList[0];
    // Division-by-zero guard: skip skuNum <= 0.
    if (entry.skuNum <= 0) continue;
    const baseAmount = order.orderAmount ?? order.saleAmount;
    if (!baseAmount || baseAmount <= 0) continue;
    const perUnit = baseAmount / entry.skuNum;
    if (!samples.has(entry.sku)) samples.set(entry.sku, []);
    samples.get(entry.sku)!.push(perUnit);
  }
  const oracle = new Map<string, number>();
  for (const [sku, prices] of samples) {
    // NOTE: Staff-review Improvement 1 proposed skipping SKUs where
    // `prices.length < 2` (median of n=1 is noise; tier-2 fallback is more
    // reliable). Phase 79 Wave 0 tests intentionally pin the simpler
    // "accept any n>=1" behavior because Frollie's Shopee history is
    // dominated by single-SKU orders — throwing away n=1 samples would
    // leave >50% of common SKUs without oracle coverage at launch. Keeping
    // the code path here as documentation so future work can revisit if
    // mis-priced single-SKU samples are observed.
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
    oracle.set(sku, Math.round(median));
  }
  return oracle;
}

/**
 * Pro-rate an order's `baseAmount` across its SKUs so that
 * `Σ items.totalPrice === baseAmount` exactly (integer IDR equality — D-01/D-04).
 *
 * Algorithm:
 *   1. Tentative per-unit weight = oracle.get(sku) ?? mapping.menuProductPrice ??
 *      (baseAmount / totalQty).   [D-03 three-tier fallback]
 *   2. Weighted pro-rata with Math.floor → each item gets `flooredTotal` IDR.
 *   3. Residual = baseAmount − Σ floored → assigned to the largest-qty item.
 *      Tie-break: V8 Array.sort is stable, so the first item at the max qty
 *      (by original skuVoList order) wins.
 *
 * Returns `unitPrice = Math.round(totalPrice / skuNum)` for display.
 * Returns `[]` for an empty skuVoList or non-positive baseAmount.
 */
export function prorateItems(
  order: {
    orderAmount?: number;
    saleAmount: number;
    skuVoList: Array<{ sku: string; skuNum: number }>;
  },
  oracle: Map<string, number>,
  mappingBySku: Map<string, { menuProductId?: string; menuProductPrice?: number }>,
): Array<{ sku: string; skuNum: number; unitPrice: number; totalPrice: number }> {
  const baseAmount = order.orderAmount ?? order.saleAmount;
  if (order.skuVoList.length === 0 || baseAmount <= 0) return [];

  const totalQty = order.skuVoList.reduce((s, x) => s + x.skuNum, 0);
  // Guard against totalQty === 0 edge case (all skuNum = 0).
  if (totalQty <= 0) return [];

  // Step 1: tentative per-unit weight via 3-tier fallback (D-03).
  const tentative = order.skuVoList.map((e) => {
    const mapping = mappingBySku.get(e.sku);
    const weight =
      oracle.get(e.sku) ?? mapping?.menuProductPrice ?? baseAmount / totalQty;
    // Math.max(1, ...) prevents zero-weight items from collapsing totalWeight.
    return { ...e, tentativeUnit: Math.max(1, Math.round(weight)) };
  });

  // Step 2: weighted pro-rata with Math.floor.
  const totalWeight = tentative.reduce((s, e) => s + e.tentativeUnit * e.skuNum, 0);
  const scaled = tentative.map((e) => {
    const share = (e.tentativeUnit * e.skuNum) / totalWeight;
    const flooredTotal = Math.floor(baseAmount * share);
    return { sku: e.sku, skuNum: e.skuNum, totalPrice: flooredTotal };
  });

  // Step 3: residual → largest-qty item (D-01). Tie-break uses V8's stable
  // Array.sort; the first item at the max qty (original order) wins.
  const residual = baseAmount - scaled.reduce((s, e) => s + e.totalPrice, 0);
  if (residual !== 0) {
    const idx = scaled
      .map((e, i) => ({ i, qty: e.skuNum }))
      .sort((a, b) => b.qty - a.qty)[0].i;
    scaled[idx].totalPrice += residual;
  }

  return scaled.map((e) => ({
    sku: e.sku,
    skuNum: e.skuNum,
    // Math.max(1, skuNum) guards against division-by-zero; but we already
    // filtered totalQty <= 0 above, so skuNum can still be 0 on a per-item
    // basis if skuVoList mixes zero-qty lines with real ones. Guard anyway.
    unitPrice: Math.round(e.totalPrice / Math.max(1, e.skuNum)),
    totalPrice: e.totalPrice,
  }));
}

/**
 * Identify the dominant SKU for a multi-SKU order (D-09).
 *
 * Rules:
 *   - Empty skuVoList → `{ sku: null, menuProductId: null }`.
 *   - Single entry → trivial.
 *   - Multiple entries → max skuNum wins. Ties broken by max
 *     `mapping.menuProductPrice`. Further ties fall back to first-listed
 *     (relies on V8 Array.sort stability; assumption A5 in 79-RESEARCH.md).
 *
 * `menuProductId` is resolved via `mappingBySku.get(sku)?.menuProductId`;
 * returns `null` when no mapping exists.
 */
export function dominantSku(
  skuVoList: ReadonlyArray<{ sku: string; skuNum: number }>,
  mappingBySku: Map<string, { menuProductId?: string; menuProductPrice?: number }>,
): { sku: string | null; menuProductId: string | null } {
  if (skuVoList.length === 0) return { sku: null, menuProductId: null };
  if (skuVoList.length === 1) {
    const entry = skuVoList[0];
    return {
      sku: entry.sku,
      menuProductId: mappingBySku.get(entry.sku)?.menuProductId ?? null,
    };
  }
  const sorted = [...skuVoList].sort((a, b) => {
    if (b.skuNum !== a.skuNum) return b.skuNum - a.skuNum; // max qty
    const ap = mappingBySku.get(a.sku)?.menuProductPrice ?? 0;
    const bp = mappingBySku.get(b.sku)?.menuProductPrice ?? 0;
    return bp - ap; // tie → max price; further tie → first-listed (stable sort)
  });
  return {
    sku: sorted[0].sku,
    menuProductId: mappingBySku.get(sorted[0].sku)?.menuProductId ?? null,
  };
}

/**
 * BigSeller integration configuration constants.
 */

export const BIGSELLER_PLATFORM_ID = "bigseller" as const;

/** Cookie name for the BigSeller JWT access token */
export const BIGSELLER_TOKEN_COOKIE_NAME = "muc_token";

/** Max sync window per BigSeller API constraint */
export const BIGSELLER_MAX_SYNC_DAYS = 31;

/** Base URL for BigSeller profit analytics API */
export const BIGSELLER_API_BASE = "https://www.bigseller.com/api/v1/statis/profit";

/** Maximum poll attempts before declaring timeout (8 polls * 60s = ~8 min) */
export const BIGSELLER_MAX_POLLS = 8;

/** Delay between poll attempts in milliseconds */
export const BIGSELLER_POLL_INTERVAL_MS = 60000;

/**
 * Frollie-specific BigSeller shop IDs -- update if shops change in BigSeller dashboard.
 * Frollie - S = 5090946 (Shopee), Frollie - T = 5092855 (TikTok)
 * Consider moving to platformCredentials metadata in a future iteration for admin-editability.
 */
export const BIGSELLER_FROLLIE_SHOP_IDS = [5090946, 5092855];

/**
 * Shop ID to platform mapping for platform-specific API calls.
 * The common pageList.json returns 0 for Shopee fees -- must use platform-specific
 * endpoints (shopee/pageList.json, tiktok/pageList.json) to get real fee data.
 */
export const BIGSELLER_SHOP_PLATFORM_MAP: Record<number, "shopee" | "tiktok"> = {
  5090946: "shopee",
  5092855: "tiktok",
};

/**
 * Platform-specific API path segments for pageList endpoints.
 * Used to construct: {BIGSELLER_API_BASE}/{segment}/pageList.json
 */
export const BIGSELLER_PLATFORM_ENDPOINTS: Record<string, string> = {
  shopee: "shopee/pageList.json",
  tiktok: "tiktok/pageList.json",
};

/** Page size for BigSeller pageList API requests */
export const BIGSELLER_PAGE_SIZE = 50;

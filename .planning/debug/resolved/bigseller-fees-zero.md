---
status: resolved
trigger: "BigSeller synced orders show Rp 0 for Commission, Shipping, and Other fees"
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T00:05:00Z
---

## Current Focus

hypothesis: Common pageList.json endpoint returns 0 for Shopee commissionFee/sellerShippingFee/otherFee; platform-specific endpoints have the real values in different fields
test: CONFIRMED via API docs (BIGSELLER_PROFIT_API.md lines 1339-1347)
expecting: N/A - root cause confirmed
next_action: Implement fix - use platform-specific endpoints for fetching orders

## Symptoms

expected: Commission, Shipping, and Other fee columns should show actual platform fees from BigSeller API data
actual: All three columns show "Rp 0" for every synced order (33 orders from Shopee via BigSeller)
errors: No error messages - data just silently missing
reproduction: Sync BigSeller orders, view the synced orders table
started: From the beginning of BigSeller integration

## Eliminated

(none needed - root cause found on first hypothesis)

## Evidence

- timestamp: 2026-02-27T00:01:00Z
  checked: helpers.ts buildPageListBody() - uses platformTemplate: "common"
  found: Common endpoint only returns 0 for Shopee fee fields
  implication: Must use platform-specific endpoints to get real fee data

- timestamp: 2026-02-27T00:02:00Z
  checked: BIGSELLER_PROFIT_API.md line 1346
  found: "standard Shopee shows 0" for commissionFee in common endpoint
  implication: Shopee fees are only available via shopee/pageList.json with platformTemplate: "shopee"

- timestamp: 2026-02-27T00:03:00Z
  checked: Shopee-specific endpoint docs (lines 720-753)
  found: Returns sellerTransactionFee, finalShippingFee, orderAmsCommissionFee, etc.
  implication: Need to map these platform-specific fields to our commissionFee/sellerShippingFee/otherFee

## Resolution

root_cause: The sync uses common pageList.json (platformTemplate: "common") which returns 0 for Shopee fee fields. Shopee's actual fees (sellerTransactionFee, finalShippingFee, etc.) are only available via the platform-specific endpoint (shopee/pageList.json with platformTemplate: "shopee"). Same for TikTok.
fix: Changed fetchOrders to iterate per-platform using platform-specific endpoints (shopee/pageList.json, tiktok/pageList.json). Added normalizePlatformFees() to aggregate platform-specific fee fields into the common commissionFee/sellerShippingFee/otherFee fields. Added shop-to-platform mapping in config.
verification: TypeScript type-check passes, npm run build succeeds, all 59 existing BigSeller tests pass.
files_changed:
  - convex/integrations/bigseller/config.ts (added BIGSELLER_SHOP_PLATFORM_MAP, BIGSELLER_PLATFORM_ENDPOINTS)
  - convex/integrations/bigseller/helpers.ts (added platform-specific fields to BigSellerOrderRow, normalizePlatformFees(), getPageListEndpoint(), platformTemplate param to buildPageListBody)
  - convex/integrations/bigseller/sync.ts (refactored fetchOrders to fetch per-platform with platform-specific endpoints)

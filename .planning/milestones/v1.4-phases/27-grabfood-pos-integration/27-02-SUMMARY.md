---
phase: 27-grabfood-pos-integration
plan: 02
subsystem: api
tags: [grabfood, orders, sync, revenue-bridge, webhooks, hmac, menu-availability]

# Dependency graph
requires:
  - phase: 27-01
    provides: GrabFood OAuth2 token confirmed working, grabRequest helper, API endpoint shapes documented
  - phase: 26-platform-auth-schema-foundation
    provides: grabfoodOrders table schema, externalRevenue table, externalSyncLogs, platformCredentials, resolveToken pattern
provides:
  - "syncOrders action with pagination, 401 graceful handling, and externalRevenue bridge"
  - "upsertOrder + upsertOrderBatch internal mutations with dedup on orderID"
  - "listOrders + getOrderStats queries with outlet and date filtering"
  - "batchUpdateAvailability action (two-step: batch PUT + notifyMenuUpdate)"
  - "getMenuItems action to fetch current GrabFood menu"
  - "Webhook HTTP routes at /api/grabfood/order and /api/grabfood/menu-sync"
  - "HMAC-SHA256 validation scaffold using Web Crypto API"
affects:
  - phase: 27-03 (frontend GrabFoodManager page — Orders tab, Menu tab)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GrabFood order sync: paginated GET with batch upsert (50 per mutation call)"
    - "Revenue bridge: each grabfoodOrders insert creates linked externalRevenue record (source: grabfood)"
    - "Two-step menu update: PUT batch/menu then POST menu notification (changes not live without notify)"
    - "Webhook HMAC: Web Crypto API (non-Node httpAction runtime) with constant-time comparison"
    - "401 graceful handling: syncOrders returns descriptive error without crashing"

key-files:
  created:
    - "convex/grabfoodOrders/mutations.ts"
    - "convex/grabfoodOrders/queries.ts"
  modified:
    - "convex/integrations/grabfood/adapter.ts"
    - "convex/integrations/grabfood/webhooks.ts"
    - "convex/http.ts"

key-decisions:
  - "Revenue bridge creates externalRevenue per order with source: grabfood, using schema.ts externalSource validator"
  - "IDR prices stored as-is (no /100 division) — currency.exponent=0 for IDR"
  - "Webhook HMAC uses Web Crypto API (not Node crypto) since httpAction is non-Node runtime"
  - "HMAC secret stored as undefined for now (no env var access in httpAction) — TODO: move to platformCredentials or Convex env"
  - "syncOrders 401 handling: returns descriptive error about OAuth2 scope gap, logs to sync log, does not crash"

patterns-established:
  - "GrabFood batch upsert: collect up to 50 orders per runMutation call to reduce overhead"
  - "Webhook order processing: scheduler.runAfter(0, ...) for async upsert from webhook"
  - "HMAC validation in Convex httpAction: use Web Crypto API subtle.importKey + subtle.sign"

requirements-completed:
  - GF-06
  - GF-08

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 27 Plan 02: GrabFood Backend Summary

**GrabFood order sync with paginated API pull, externalRevenue bridge, menu availability batch update, and webhook HMAC scaffold with HTTP route registration**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-26T02:23:33Z
- **Completed:** 2026-02-26T02:28:06Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Complete grabfoodOrders module with upsertOrder, upsertOrderBatch mutations and listOrders, getOrderStats queries
- syncOrders action with pagination, 401 graceful handling, sync log tracking, and revenue bridge
- batchUpdateAvailability + getMenuItems actions for menu management
- Webhook HMAC-SHA256 validation scaffold using Web Crypto API (not Node crypto)
- HTTP routes registered at /api/grabfood/order and /api/grabfood/menu-sync

## Task Commits

Each task was committed atomically:

1. **Task 1: Order Sync Action + Upsert Mutations + Revenue Bridge** - `defb342` (feat)
2. **Task 2: Menu Availability Action + Webhook HMAC + HTTP Routes** - `49c2010` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `convex/grabfoodOrders/mutations.ts` - upsertOrder + upsertOrderBatch internal mutations with dedup and revenue bridge
- `convex/grabfoodOrders/queries.ts` - listOrders (filtered, paginated) + getOrderStats queries
- `convex/integrations/grabfood/adapter.ts` - Added syncOrders, batchUpdateAvailability, getMenuItems actions
- `convex/integrations/grabfood/webhooks.ts` - Enhanced with HMAC validation scaffold and async order upsert scheduling
- `convex/http.ts` - Registered /api/grabfood/order and /api/grabfood/menu-sync webhook routes

## Decisions Made

1. **Web Crypto API for HMAC** - httpAction runs in non-Node runtime, so Node's `createHmac` is unavailable. Used Web Crypto API (`crypto.subtle.importKey` + `crypto.subtle.sign`) instead with constant-time comparison.

2. **HMAC secret deferred** - `process.env` is not available in Convex httpAction (non-"use node" files). HMAC validation currently skips when no secret configured. TODO: store secret in platformCredentials or use Convex environment variables.

3. **Revenue dedup via externalTransactionId** - Each order's `orderID` is used as `externalTransactionId` in externalRevenue, leveraging the existing `by_source_txn` index for dedup on re-sync.

4. **syncOrders 401 handling** - Returns descriptive error message about OAuth2 scope gap without crashing. Logs to externalSyncLogs with status "error". Frontend can display this message to guide user to contact GrabFood support.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable in handleMenuSyncWebhook**
- **Found during:** Task 2 (build verification)
- **Issue:** `ctx` parameter declared but never read in handleMenuSyncWebhook (TS6133)
- **Fix:** Changed to `_ctx` prefix to suppress unused variable error
- **Files modified:** `convex/integrations/grabfood/webhooks.ts`
- **Verification:** `npm run build` passes
- **Committed in:** `49c2010` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Trivial fix, no scope creep.

## Issues Encountered

None - plan executed as specified.

## User Setup Required

None for this plan. Existing GrabFood client credentials (configured in Phase 26) are sufficient.

**Reminder from Phase 27-01:** Orders endpoint returns 401 due to OAuth2 scope gap. Contact GrabFood developer support to request `orders:read` scope before sync feature can return data.

## Next Phase Readiness

**Phase 27-03 (Frontend) can start immediately:**
- All backend actions ready: syncOrders, batchUpdateAvailability, getMenuItems, getStoreStatus
- All queries ready: listOrders, getOrderStats
- Webhook routes registered and scaffolded
- Revenue bridge operational for analytics aggregation

**Known blockers for full feature activation:**
- Orders 401 scope gap — sync action handles gracefully but returns no data until scope granted
- Crystal/Tamtem merchantIDs still needed from GrabFood Merchant Portal

---
*Phase: 27-grabfood-pos-integration*
*Completed: 2026-02-26*

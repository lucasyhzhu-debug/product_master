# Phase 83 — BigSeller pageList Schema Refresh

> Goal: Restore BigSeller profit-data sync to working state. Last successful
> ingestion: **2026-04-22** (27 days stale as of 2026-05-19). No schema changes
> required — the `bigsellerOrders` table already captures every profit column
> we need (commission, seller/buyer shipping, other fee, profit, margin, costFee).

## Root Cause (verified against HAR, 2026-05-19)

BigSeller silently added **6 new required fields** to the profit `pageList` request
payload between our last working sync (2026-04-22) and now. They documented this
behavior in their own error contract:

> *"All fields in this payload are required. Omitting any required field causes
> the server to return `code: -1` with no indication of which field is missing."*
> — `docs/BIGSELLER_PROFIT_API.md:557-559`

Per a freshly captured HAR
(`C:\Users\Irfan\Downloads\20260315 bigseller specific orders profit tracking.har`),
working calls to `shopee/pageList.json` and `tiktok/pageList.json` now require:

| Field | HAR value (shopee/tiktok) | HAR value (common) | Current `buildPageListBody()` |
|---|---|---|---|
| `settleStatus` | `1` | `1` | **MISSING** |
| `transactionStatus` | `""` | `""` | **MISSING** |
| `fbsOrder` | `""` | `""` | **MISSING** |
| `groupType` | `""` (string) | `0` (int) | **MISSING** |
| `orderStatus` | `[]` | (absent) | **MISSING** |
| `totalCurrency` | `"IDR"` | `"IDR"` | **MISSING** |

Additionally, the `orderState` filter has been tightened upstream:

| Field | HAR value | Current code | Action |
|---|---|---|---|
| `orderState` | `["completed","shipped","other"]` | `["completed","shipped","canceled","other","new"]` | Drop `"canceled"` + `"new"` |
| `searchContent` | `""` (shopee/tiktok) / `null` (common) | `null` | Keep `null` — works on common, may work on platform-specific |
| `currency` | `""` (shopee/tiktok) / `""` (common) | `"IDR"` | Set to `""` — `totalCurrency` now carries currency |

Both Shopee and TikTok platform endpoints are returning the same `code: -1` error,
so both shop loops fail page-1 and the sync ends with `0` orders ingested.

## What was already done (Phase observability fix, 2026-05-08)

The previous debug round (`.planning/debug/bigseller-latest-dates-no-orders.md`)
landed **observability + fail-fast** to make the error surface visibly instead of
silently completing as "No orders found":

- `pollSyncTask` now logs `progressInfo.successOrderNum` + per-shop `errorMsg`
- `fetchOrders` captures full `parsed.msg` + `errorCode` + 500-char body snippet
- Page-1 failure now transitions sync → `stage: "failed"` with real `errorMessage`

That work made the bug visible (the UI now shows the actual rejection message
the user screenshotted), but did NOT fix the request schema. **This phase fixes the schema.**

## Auth model (confirmed from HAR)

The MUC token (`muctoken`) is a JWT with HS256 signature and a **20-day sliding
expiry**. Decoded payload structure:

```json
{
  "sub": "user",
  "exp": <iat + 1728000>,         // 20 days
  "iat": <epoch seconds>,
  "info": "{\"requestId\":\"muc_XXX\",\"loginTime\":<ms>,\"refreshTime\":<ms>,\"puid\":1355260,\"uid\":1356692,...}"
}
```

The server returns a **refreshed `muctoken` in the response header** on every
successful call — the browser then uses the new token on the next request. The
"20 days remaining" badge in our admin UI is literally `exp - now`.

Current code sends the token as a cookie:
```
cookie: muc_token=<JWT>; muc_login_account_type=EMAIL_ACCOUNT_TYPE
```

That matches what HAR shows. **No change needed.** The fix is purely the request body.

> Note: We do NOT currently read the refreshed token from the response header.
> That's a separate optimization documented as future work below (auto-extend
> token TTL by 20 days on every cron run rather than letting it die from disuse).

## Architecture review (unchanged)

```
[UI] BigSellerSyncPanel (Settings page)
       ↓ (paste-token + Sync Now button)
[action] bigseller.sync.startSync                                  "use node"
       ↓
[scheduler chain]
       ↓
[action] sync.triggerSync           — POST /sync/task/create.json
       ↓ (delay 60s × up to 8)
[action] sync.pollSyncTask          — GET /sync/task/detail/new/get.json
       ↓
[action] sync.fetchOrders           — POST /{platform}/pageList.json (THE BUG)
       ↓ per row:
  - bigsellerOrders.upsertOrders          (table: bigsellerOrders)
  - externalData.saveRevenue              (table: externalRevenue parent rows)
  - externalRevenueItems (Phase 79)       (table: externalRevenueItems child rows)
  - bigsellerOrders.linkRevenueToOrders   (backfill bigsellerOrders.linkedRevenueId)

[cron] bigseller.cron.nightlySync — daily 20:00 UTC, trailing 7-day re-sync
```

The architecture is sound. The bug is contained to one function:
**`convex/integrations/bigseller/helpers.ts:43-78` (`buildPageListBody`)**.

## Blast radius (from graphify import graph + repo grep)

68 BigSeller-named nodes in graphify. External callers reaching INTO BigSeller code:
only **2** — `src/contexts/AuthContext.tsx` (admin gate) and
`convex/externalData/mutations.ts` (the `saveRevenue` bridge — which BigSeller
calls, not vice versa).

Data-level fan-out (consumers that read BigSeller-populated tables):
- **`externalRevenue`** → Sales Analytics, Income Statement, Financial Data Export
- **`bigsellerOrders`** → Sales Analytics (orders table on the sync panel)
- **`externalRevenueItems`** → Phase 79 item-level revenue, Unit Economics dashboard
- **`externalSyncLogs`** → admin sync status

None of these consumers will need changes — they're table-schema-stable. The
fix populates the existing tables; the wiring downstream is untouched.

## Deliverables (revised post-staffreview 2026-05-19)

The original single-plan `83-01-pagelist-schema-fix-PLAN.md` was split per
staffreview C1 (over-aggressive change bundling). The pre-review version is
archived as `83-01-OLD-pre-staffreview.md.bak` for diff context.

- **`83-01a-additive-fields-fix-PLAN.md`** — ship-first. Adds 6 new required
  fields. Keeps `orderState`, `currency`, `searchContent` UNCHANGED. Low-risk,
  reversible, includes HAR-fixture body-shape lock test.
- **`83-01b-fallback-and-token-refresh-PLAN.md`** — CONDITIONAL on 83-01a
  results. Wave 1-3 (subtractive `orderState`, value mutations) only execute if
  01a still rejects. **Wave 4 (token auto-refresh from response headers) is
  unconditional** — promoted from 83-02 per staffreview I5.
- **`83-02-sync-optimization-PLAN.md`** — speed-up follow-up. Now contains 5
  optimizations (O5 removed; promoted to 01b Wave 4).
- **`83-RESEARCH.md`** — HAR diff, decoded JWT, response schema, analysis scripts.

Companion: **`docs/reviews/staffreview-83-bigseller-pagelist-refresh-2026-05-19.md`**
— the staff review report addressing 4 critical / 5 improvements / 6 refinements.

---
slug: bigseller-latest-dates-no-orders
status: resolved
trigger: "i can't seem to sync the latest dates into bigseller, can you check the logs and also the api to see if it's working properly?"
created: 2026-05-08
updated: 2026-05-08
resolved: 2026-05-08
---

# Debug Session: BigSeller Sync Returns Zero Orders for Latest Dates

## Symptoms

DATA_START
**User report:** "i can't seem to sync the latest dates into bigseller, can you check the logs and also the api to see if it's working properly?"

**Screenshot evidence (from `/admin` BigSeller card):**
- BigSeller card status: "20 days remaining", "48m ago", "Connected" (green dot)
- Date range entered: `08/04/2026` to `08/05/2026` (DD/MM/YYYY locale display) → ISO `2026-04-08` to `2026-05-08`
- Sync window: 30 days (within 31-day BigSeller `BIGSELLER_MAX_SYNC_DAYS` limit)
- Sync Progress: ALL stages checkmarked (Triggering ✓, Syncing ✓, Fetching ✓, Storing ✓, Complete ✓)
- Result banner: **"No orders found for this date range."**
- "Synced Orders" table BELOW the sync panel shows **198 orders**, with most recent row dated **22 Apr 2026**
- COGS warning: known pre-existing limitation, unrelated to this bug.

**Today's date:** 2026-05-08 (per system prompt)
DATA_END

## Expected Behavior

A sync covering 2026-04-08 → 2026-05-08 should return ~all 198 orders shown in the Synced Orders table (since they fall within that window) PLUS any new orders from 2026-04-23 through 2026-05-08 that haven't been synced yet.

## Actual Behavior

The sync task completes in `taskStatus === "complete"` state, but `fetchOrders` then sees `totalOrders === 0`. UI renders "No orders found for this date range." with all stage checkmarks green — masking a real upstream rejection.

## Reproduction

User picks Apr 8 – May 8 in the BigSeller card sync inputs, clicks "Sync Now", waits ~5–8 minutes for poll cycle, lands on "No orders found".

## Root Cause

**`https://www.bigseller.com/api/v1/statis/profit/{shopee,tiktok}/pageList.json` is returning `code: -1` for both Shopee and TikTok endpoints on every page-1 request.** Three sync attempts (10:28, 10:35, 10:38 WIB on 2026-05-08) all logged identically:

```
[ERROR] 'BigSeller shopee pageList error (page 1): code=-1'
[ERROR] 'BigSeller tiktok pageList error (page 1): code=-1'
[LOG]   'BigSeller sync complete: 0 orders (0 new, 0 updated), revenue: 0 IDR, unmapped SKUs: 0'
```

The previous error handler at `convex/integrations/bigseller/sync.ts:719-722` logged ONLY `parsed.code` (no `msg`, no `errorCode`, no response body) and `pageNo++; continue;` — so the loop silently exhausted, then `fetchOrders` called `updateSyncStage({stage: "complete", summary: {totalOrders: 0...}})` and the user saw the misleading "No orders found" instead of an actionable failure.

**Why `code: -1` is being returned upstream is not yet known** — that's a question we can only answer after the next sync runs with the improved logging. Per `docs/BIGSELLER_PROFIT_API.md` line 558, BigSeller returns `code: -1` "with no indication of which field is missing" when a required field is missing/invalid, OR when the sync task is still in progress. Both `parsed.code` and the response body are now captured in the error log, so the next failure will reveal the real reason.

## Hypotheses Outcome

- **H1 (upstream empty/throttled):** ELIMINATED. Logs show explicit `code: -1` error from BigSeller, not an empty `itemPageVo.rows`.
- **H2 (auth error code we don't catch):** UNLIKELY. `isJsonAuthError` is checked before the `code !== 0` branch. None of the 3 attempts triggered the auth handler. Token was just rotated 48m before the test (per "48m ago" UI badge) and the poll endpoint succeeded against the same token — so it's not a token problem.
- **H3 (date format):** ELIMINATED. `YYYY-MM-DD` matches docs.
- **H4 (stale shop IDs):** UNLIKELY. Same shopIds were used by all 198 historical orders.
- **H5 (orderState filter):** PLAUSIBLE — `["completed","shipped","canceled","other","new"]` may have a value BigSeller now rejects. Cannot confirm without the `parsed.msg` text.
- **NEW H6: Missing/invalid required field surfaced silently as `code: -1`.** Most likely explanation given the doc note at line 558. New observability will reveal which field.

## Resolution

**Branch:** `fix/bigseller-latest-dates-sync`
**Files changed:** `convex/integrations/bigseller/sync.ts`
**Type-check:** PASS  •  **Build:** PASS

Two-part observability + fail-fast fix:

1. **`pollSyncTask` now logs `progressInfo.successOrderNum` and per-shop `detailList[].successOrderNum` + `errorMsg`** when `taskStatus === "complete"`. This closes the observability gap where we couldn't distinguish "BigSeller pulled 0 rows from upstream" vs "BigSeller pulled rows fine, pageList errored later." (sync.ts:430-445)

2. **`fetchOrders` now captures full diagnostic on `parsed.code !== 0`** — `parsed.code`, `parsed.errorCode`, `JSON.stringify(parsed.msg)`, and a 500-char `responseText` snippet. AND when the failure is on page 1 (the request-level rejection case we just hit), the sync now transitions to `stage: "failed"` with a real `errorMessage` instead of silently completing with `totalOrders: 0`. The user sees the real failure ("BigSeller shopee rejected pageList request: code=-1 (msg)") rather than "No orders found." (sync.ts:743-781)

This does NOT yet resolve why BigSeller returns `code: -1`. Next sync will surface the `msg` and the real fix path will be obvious from there (likely one of: drop `"new"` from orderState, drop `"other"`, or add a missing field BigSeller now requires).

## Evidence Log

- timestamp: 2026-05-08T03:28:24Z
  source: `npx convex logs --prod --history 1000 --success` (lines 1539-1543)
  finding: |
    First failure window — sync triggered at 10:27:20 (line 142 startSync), poll completed at 10:28:22 (line 1534), fetchOrders ran at 10:28:23 with both shop endpoints returning `code=-1` and the sync silently transitioning to "complete" with 0 orders.

- timestamp: 2026-05-08T03:35:53Z
  source: `npx convex logs --prod --history 1000 --success` (lines 1723-1728)
  finding: |
    Second failure window — identical pattern. User retry. Same `code=-1` from both platforms.

- timestamp: 2026-05-08T03:38:10Z
  source: `npx convex logs --prod --history 1000 --success` (lines 1752-1757)
  finding: |
    Third failure window — identical. Three failures spread across 10 minutes rules out a transient sync-task race condition (would have cleared by attempt 3).

- timestamp: 2026-05-08T03:40:00Z
  source: `docs/BIGSELLER_PROFIT_API.md:557-559`
  finding: |
    > "All fields in this payload are required. Omitting any required field causes the server to return `code: -1` with no indication of which field is missing."
    AND line 74-76:
    > "`listStatsData` and `pageList` both return `code: -1` with `'Failed, please try again later'` if called while a sync task is still `'progress'`."
    These are the two documented causes of `code: -1`. The new logging will distinguish them via `parsed.msg`.

## Eliminated Hypotheses

- **H1, H3, H4** (see Hypotheses Outcome above).

## Next Action

User: trigger a fresh sync with the same Apr 8 → May 8 range. The new error log line will be the smoking gun:
```
BigSeller shopee pageList error (page 1): code=-1, errorCode=none, msg="<actual reason>", body=<actual response>
```
Paste that single log line back to drive the H5/H6 fix.

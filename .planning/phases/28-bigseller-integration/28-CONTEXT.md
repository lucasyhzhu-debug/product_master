# Phase 28: BigSeller Integration - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can manually trigger a BigSeller sync that pulls per-order data from Shopee/Tokopedia/TikTok (via BigSeller aggregator), stores orders with SKU breakdowns, bridges revenue to the unified analytics layer, and provides admin UI to map BigSeller SKU codes to internal menu products. No cron jobs — manual trigger only.

**Philosophy:** Test-and-learn approach. Get an initial working version, document everything learned about the reverse-engineered API, iterate toward stability. Full API response logging is essential.

</domain>

<decisions>
## Implementation Decisions

### Sync UX & Location
- Sync trigger lives in the **existing Settings tab within Sales Analytics** — expand the BigSeller row with sync controls, progress, and logs
- **Step-by-step progress card** showing each phase: trigger -> polling (attempt N/8) -> fetching data -> storing -> complete, with checkmarks
- **Background sync** — admin can leave the page, come back later, see result. Scheduler-chain runs server-side. Toast notification on completion
- **Incremental sync** — track last sync date internally, only fetch new transactions since then. Same pattern as GrabFood. Admin can override with manual date range for backfill
- If sync already running on BigSeller side: **join existing sync** — detect running task, show "Sync already in progress", start polling that task instead of creating a new one

### SKU Mapping Workflow
- **Inline dropdown per SKU** — same pattern as all other platform integrations (GrabFood, GoFood). Each unmapped SKU shows a dropdown to select a menu product
- **Warning badge + reconciliation section** — yellow badge on BigSeller settings row showing count of unmapped SKUs. Expanding shows the unmapped list with inline mapping dropdowns
- **Revenue only counts after mapping** — unmapped SKU orders are stored but excluded from revenue totals until SKU is mapped. Incentivizes prompt mapping, keeps per-product data clean
- **Retroactive mapping** — when admin maps a SKU, it auto-applies to ALL existing orders with that SKU code. One-time mapping fixes all history

### Error Handling & Resilience
- **8 retries max** (not 20 from original spec) — poll every 60s, 8 attempts (~8 min). If still not complete, mark failed with Retry button
- **Auto-retry once** after failure — if first attempt (8 polls) fails, auto-retry one more time. If second attempt also fails, mark failed, show manual Retry button
- **JWT expiry warning** — inline warning in Settings tab: "Token expired — paste new token" with text input. Sync button disabled until refreshed. No page-level banner
- **Full API response logging** — store ALL raw API responses in a syncLogs table (request params, response body, timestamps, status). Essential for debugging a reverse-engineered API
- HTML response detection: if HTML received instead of JSON, treat as auth failure, set `lastRefreshStatus: "error"`, surface "Re-login required"

### Data Display & Revenue Bridge
- **Compact summary card** after sync: "Synced 47 orders (12 new, 35 updated). Revenue: Rp 2.4M. 3 unmapped SKUs." Expandable for details
- **Simple order list table** for browsing synced orders: date, platform, shop, SKUs, revenue, fees. Filterable by date/platform. Essential for test-and-learn verification
- **Write to externalRevenue on sync** — each synced order creates/updates an externalRevenue record. Phase 30 analytics picks it up automatically
- **Actual platform as source, NOT "bigseller"** — BigSeller is the aggregator/pipe, not the revenue source. Records should use actual platform: "shopee", "tokopedia", "tiktok" etc. with shop name for specificity
- **Full fee breakdown displayed** — revenue, commission fee, shipping fee, other fees, and calculated profit. Transparent view of where money goes
- BigSeller COGS caveat: when all `costFee` values are 0, show "Profit = Revenue (COGS not configured in BigSeller)" banner

### Claude's Discretion
- Exact progress card layout and animations within the Settings tab expansion
- syncLogs table schema details (retention policy, index design)
- Pagination strategy for the order list table
- Exact retry timing and backoff strategy
- How to handle partial sync failures (some pages fetched, some not)

</decisions>

<specifics>
## Specific Ideas

- "Same pattern as GrabFood" for incremental sync — track what was already synced, only pull new
- "Same pattern as all other platforms" for SKU mapping — inline dropdown, consistent UX
- BigSeller is the pipe, actual source is the platform+shop (Shopee, Tokopedia, TikTok)
- Test-and-learn philosophy: "we need to make sure we have an initial test, keep trying and figuring out how to make things stable and efficient"
- "Document everything we learn as we go" — full logging, capture API quirks in docs
- 31-day API limit: sync window must not exceed 31 days; initial backfill requires sequential admin triggers
- BigSeller API reference doc: `docs/BIGSELLER_PROFIT_API.md` (reverse-engineered, Feb 2026)

</specifics>

<deferred>
## Deferred Ideas

- Automated daily BigSeller cron sync — deferred to BS-04 (v1.5+). Manual trigger sufficient for now
- BigSeller inventory sync to Shopee/Tokopedia — deferred to BS-05 (v1.5+)
- Period-over-period comparison using BigSeller growthRatio — deferred to BS-06 (v1.5+)
- Expanding sales revenue filters for all sources — Phase 30 (Unified Sales Analytics)

</deferred>

---

*Phase: 28-bigseller-integration*
*Context gathered: 2026-02-25*

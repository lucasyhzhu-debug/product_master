# Domain Pitfalls: v1.4 Sales & Channel Integration

**Domain:** GrabFood POS API, BigSeller marketplace sync (Shopee + Tokopedia), consignment Excel upload, and unified multi-channel analytics — added to an existing Convex + React 19 + TypeScript production system
**Researched:** 2026-02-25
**Confidence:** HIGH (GrabFood/BigSeller from official SDK + verified API docs in `docs/`; Convex-specific from direct codebase inspection; Excel from known SheetJS patterns confirmed in prior v1.3 research)

---

## Critical Pitfalls

Mistakes that cause data corruption, silent revenue misreporting, API credential suspension, or a rewrite of a complete phase.

---

### Pitfall 1: Requesting a New GrabFood OAuth2 Token on Every API Call

**What goes wrong:**
The adapter calls the OAuth2 token endpoint (`POST https://api.grab.com/grabid/v1/oauth2/token`) before every API request instead of caching the token for its full `expires_in` duration (3600 seconds). GrabFood's official documentation explicitly states: "Requesting a new token per API call is not permitted." This produces HTTP 429 rate limit errors, unnecessary latency per call, and risks GrabFood suspending the partner credentials.

**Why it happens:**
Developers copy the token-fetch example from docs without reading the caching requirement. The existing GoBiz integration in this codebase uses a manual cookie paste (not OAuth2), so there is no prior OAuth2 caching pattern to follow internally.

**How to avoid:**
The `resolveToken()` function in `convex/integrations/grabfood/adapter.ts` already implements the correct pattern: check `platformCredentials` cache first; only fetch a fresh token if `tokenExpiresAt - Date.now() < tokenRefreshBufferMs` (5 minutes). Every new action that calls GrabFood must call `resolveToken()`. Never call `fetchFreshToken()` directly from outside `resolveToken()`.

**Warning signs:**
- HTTP 429 responses from `api.grab.com/grabid/v1/oauth2/token`
- Token fetch logs appearing more than once per hour in Convex function logs
- GrabFood partner support flagging the credentials

**Phase to address:** GrabFood foundation phase (GF credentials + token management). Pattern is already scaffolded — the pitfall is bypassing it during feature expansion.

---

### Pitfall 2: GrabFood Webhook Handler Processes Order Before Returning HTTP 200

**What goes wrong:**
The webhook handler processes the incoming order synchronously — writing to DB, calling `respondToOrder` — before returning HTTP 200. If processing takes longer than GrabFood's acknowledgment timeout, Grab marks the webhook as failed and retries. Each retry re-runs the same processing, creating duplicate order records.

**Why it happens:**
The correct pattern (return 200 immediately, then process asynchronously) feels counterintuitive. The current `handleOrderWebhook` in `convex/integrations/grabfood/adapter.ts` already returns 200 immediately with a TODO for async processing. The trap is moving the DB write above the `return new Response("OK")` line when implementing the actual storage logic.

**How to avoid:**
Structure the HTTP handler as:
1. Parse body
2. `return new Response("OK", { status: 200 })` immediately
3. Schedule async processing: `ctx.scheduler.runAfter(0, internal.grabfood.processIncomingOrder, { order })`

Never `await` a mutation or action before returning 200. Deduplicate on `orderID` in the processing action: check if the order already exists before inserting.

**Warning signs:**
- Duplicate order records for the same `orderID` in `grabfoodIncomingOrders`
- GrabFood dashboard showing webhook delivery failures despite orders appearing in the system
- Convex logs showing the same `orderID` processed twice within 30 seconds

**Phase to address:** GrabFood webhook implementation phase. The TODO comment in the existing adapter marks the exact danger point.

---

### Pitfall 3: Menu Changes Not Going Live — `notifyMenuUpdate` Step Skipped

**What goes wrong:**
After calling `PUT /partner/v1/menu` or `PUT /partner/v1/batch/menu`, menu changes are staged but NOT live in the GrabFood consumer app until `POST /partner/v1/merchant/menu/notification` is called. Developers see no API error from the PUT and assume the change propagated. Items remain at their old availability status in production.

**Why it happens:**
Most REST APIs apply changes immediately on a successful PUT. GrabFood requires an explicit "notify" step to trigger their internal sync job. This two-step requirement is documented but easy to skip.

**How to avoid:**
Always call `notifyMenuUpdate()` as a mandatory second step after any menu write. Treat it as part of the same operation, not optional cleanup. Save the `Job-ID` from the notification response header and store it so `traceMenuSync` can poll for the result. Surface `PARTIAL_FAILURE` results to the admin UI — do not silently discard sync errors.

**Warning signs:**
- Menu changes confirmed via API but not visible in GrabFood app after 10 minutes
- `menuTrace` returns `PENDING` indefinitely (notification step was skipped entirely)
- `PARTIAL_FAILURE` webhooks arriving silently with item errors

**Phase to address:** GrabFood menu sync phase. Add integration test: after batch availability update, confirm `notifyMenuUpdate` was called and `traceMenuSync` reaches `SUCCESS` or surfaces a `PARTIAL_FAILURE` alert.

---

### Pitfall 4: BigSeller Querying Data Before Sync Completes — Silent All-Zero Results

**What goes wrong:**
`POST listStatsData.json` and `POST pageList.json` both return `code: -1, msg: "Failed, please try again later"` when called while `taskStatus = "progress"`. If the query fires before sync completes (which takes 1–10 minutes), the response returns no data. If this `-1` code is treated as a success with empty results, the upsert commits zero records without any error. The codebase appears to have "synced successfully" while storing nothing.

**Why it happens:**
The two-phase async nature of BigSeller is documented in `docs/BIGSELLER_PROFIT_API.md` but easy to short-circuit. A cron that triggers sync and then immediately queries (`await triggerSync(); await queryData()`) will always return empty because sync takes minutes, not seconds.

**How to avoid:**
Implement the complete poll-then-query workflow using Convex scheduler (not a while-loop — see Pitfall 12):
1. Cron triggers `bigsellerStartSync` → creates task → schedules `bigsellerPollSync` in 60 seconds
2. `bigsellerPollSync` checks `sync/task/detail/new/get.json` — if `"progress"`, reschedules in 60 seconds (max 20 retries); if `"complete"`, schedules `bigsellerFetchData`
3. `bigsellerFetchData` calls `listStatsData` + `pageList` (paginating fully) and upserts results

Treat `code: -1` as a hard error that must be logged and retried, never silently skipped.

**Warning signs:**
- BigSeller data never appears despite sync creation succeeding
- `code: -1` responses in Convex action logs being swallowed
- `successOrderNum` shows orders in sync detail but `pageList` returns empty `rows`

**Phase to address:** BigSeller foundation phase. This is the most critical constraint of the entire BigSeller integration.

---

### Pitfall 5: BigSeller Cron Collision — Second Sync Triggered While First is Still Running

**What goes wrong:**
If a daily cron fires and the previous sync task is still `"progress"`, `sync/task/create.json` returns `code: -1, "The sync task is in progress, please try again later"`. If unhandled, the cron fails silently and no data is collected. The next day's cron collides again, creating a permanent gap.

**Why it happens:**
BigSeller enforces one sync at a time per account. Convex crons run on a fixed schedule regardless of whether the previous run completed. A long sync (10+ minutes for large order volumes or slow platform API) overlaps the next scheduled cron.

**How to avoid:**
Before calling `sync/task/create.json`, always check `sync/task/detail/new/get.json` first. If `taskStatus = "progress"`, skip the new sync and re-enter the polling loop to complete the existing task. Persist sync state in the DB (last triggered timestamp, current phase, last completed range) so the poll workflow can resume after a Convex cold start.

**Warning signs:**
- Daily cron logs showing `code: -1` from `sync/task/create.json`
- BigSeller data gap (missing days) with no error in the UI
- `platformCredentials` or sync state record showing `lastSyncAt` not advancing day-over-day

**Phase to address:** BigSeller foundation phase — cron + polling architecture design.

---

### Pitfall 6: BigSeller JWT Cookie Expiry — Silent Auth Failure After 30 Days

**What goes wrong:**
The `muc_token` JWT expires 30 days after the last login. The token refreshes on each authenticated request, but if the Convex cron is disabled or no API calls are made for 30 consecutive days, the cookie expires. Subsequent calls to BigSeller receive an HTML login page redirect instead of JSON — the JSON parser crashes with an opaque error, not a clear "re-authenticate" message.

**Why it happens:**
30-day session cookies feel "permanent enough" during development. The GoBiz integration has the same cookie-paste pattern but has a reconnect UI; BigSeller needs the same. There is currently no proactive expiry warning for session-cookie-based integrations.

**How to avoid:**
Decode the `muc_token` JWT at storage time and persist the `exp` field (Unix seconds) in `platformCredentials.tokenExpiresAt`. Add a pre-flight check before every BigSeller API call: if `exp - Date.now()/1000 < 3 * 24 * 3600` (3 days), surface a "BigSeller session expiring soon — re-login required" warning in the dashboard sync health panel.

Add explicit non-JSON response handling in the BigSeller HTTP client: if `Content-Type` is `text/html`, treat as auth failure and set `lastRefreshStatus: "error"` with message "Re-login required" — never let it propagate as a JSON parse crash.

**Warning signs:**
- JSON parse errors in BigSeller action logs (HTML page being parsed as JSON)
- `lastRefreshStatus: "error"` in `platformCredentials` for BigSeller platform
- Dashboard sync health showing BigSeller stale for more than 3 days

**Phase to address:** BigSeller auth phase — must be addressed before first production deployment.

---

### Pitfall 7: BigSeller 31-Day Range Limit Breaking Historical Backfill

**What goes wrong:**
On initial deployment, the user wants to backfill 3+ months of historical marketplace data. Calling `sync/task/create.json` with a 90-day range returns an error (31-day maximum). If the backfill logic does not chunk the range into 31-day segments and does not respect the "one sync at a time" constraint, the backfill either errors immediately or fires concurrent syncs that all fail.

**Why it happens:**
The 31-day limit is documented in the API reference but developers typically test with small ranges (7 days) and only discover the constraint during the first production backfill.

**How to avoid:**
Implement a sequential chunked backfill: split any date range longer than 31 days into 31-day segments and process each segment serially (trigger → poll → fetch → store → advance window). Never parallelize BigSeller syncs. Store the last successfully synced `endTime` in the DB so a interrupted backfill resumes from where it left off.

**Warning signs:**
- `sync/task/create.json` error on first deploy with a large date range
- Incomplete backfill with no indication of which date range succeeded
- Missing analytics data for the first weeks after deployment

**Phase to address:** BigSeller foundation phase — backfill design must be included in the initial sync architecture.

---

### Pitfall 8: `externalOutlets.source` Schema Union Excludes New Platform Sources

**What goes wrong:**
The `externalOutlets.source` field is currently `v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal"))`. The same union is repeated in `externalRevenue`, `externalRevenueItems`, and `externalSyncLogs`. Adding BigSeller data requires new source values (`"shopee"`, `"tokopedia"`, or `"bigseller"`). If these literals are added to some tables but not all, TypeScript type errors are hidden at the boundaries and analytics queries silently exclude records from the missing source.

**Why it happens:**
The same enum is defined four times across four table schemas rather than in a single shared validator. Updating one is easy; remembering to update all four requires a checklist.

**How to avoid:**
Add `v.literal("shopee")`, `v.literal("tokopedia")`, and `v.literal("bigseller")` to the `source` union in ALL four tables in a single schema change: `externalOutlets`, `externalRevenue`, `externalRevenueItems`, `externalSyncLogs`. Also update `registry.ts` `PlatformId` type. Run `npm run type-check` after the change — TypeScript will catch any missed location.

**Warning signs:**
- TypeScript compile error on new source literals — good, this is early detection
- New revenue records written but not appearing in analytics queries (source filter excludes new value)
- `externalOutlets` query returning zero results for BigSeller outlets

**Phase to address:** Schema migration — must be the FIRST task of the BigSeller integration phase, before any data fetching code is written.

---

### Pitfall 9: SKU-to-MenuProduct Mapping via String Matching — Fragile Like Ingredient Simulation

**What goes wrong:**
BigSeller order data contains SKU codes like `"FRO-DubChe-Reg1"`. Mapping these to `menuProducts` records using substring or similarity string matching (identical to the documented ingredient simulation fragility in `PROJECT.md` technical debt) silently breaks when a SKU code changes or a new product is added. Revenue from unmapped SKUs disappears from analytics without any error.

**Why it happens:**
The `externalRevenueItems` table already has a `matchConfidence` field with fuzzy values — suggesting the existing GoFood/K3Mart item matching uses name-based fuzzy logic. Extending the same pattern to BigSeller SKUs is the path of least resistance but inherits all its fragility.

**How to avoid:**
Build an explicit `bigsellerSkuMappings` table (or extend the existing product mapping system used for GoFood/K3Mart) that stores `sku → menuProductId` with an admin-editable UI. On sync, auto-map SKUs that match a configured mapping exactly. Flag unmapped SKUs in a "needs review" state. Never silently drop unmapped SKU revenue — store every order even with `linkedMenuProductId: undefined` and surface unmapped SKUs in a reconciliation panel.

**Warning signs:**
- Analytics showing lower Shopee/Tokopedia revenue than expected
- No error logs but `linkedMenuProductId` is undefined for most `externalRevenueItems` rows
- Adding a new menu product does not retroactively map existing synced orders

**Phase to address:** BigSeller data mapping phase — SKU mapping table design must be finalized before the first production sync runs.

---

### Pitfall 10: GrabFood Minor-Unit Price Misinterpretation — IDR Divided by 100 Gives 100x Wrong Revenue

**What goes wrong:**
GrabFood API prices are in minor units. For IDR, the minor unit IS the whole Rupiah (IDR has no decimal places; `currency.exponent = 0`). Developers familiar with Stripe or other payment APIs where minor units require division by 100 apply the same rule: `price / 100`. An order with `subtotal: 25000` (Rp 25,000) is stored as Rp 250. In a multi-channel analytics view next to BigSeller's whole-IDR values, this appears as GrabFood revenue being 100x lower than other channels.

**Why it happens:**
The GrabFood API documentation notes that `exponent` varies by currency and is 0 for IDR. This is easy to overlook. The existing `externalRevenue` table stores GoFood and K3Mart revenue as whole IDR, establishing a convention the GrabFood integration must follow.

**How to avoid:**
When ingesting GrabFood order data, check `currency.exponent`: if `exponent === 0` (IDR), store `price` as-is with no conversion. Add a comment in the GrabFood ingest code: "IDR prices from GrabFood are whole Rupiah. No division needed." Write a unit test: parse a sample GrabFood order with `subtotal: 25000` and `currency.exponent: 0` and assert the stored value is `25000`, not `250`.

**Warning signs:**
- GrabFood channel showing 100x lower revenue than expected in analytics
- Order-level margin showing Rp 190 for a product priced at Rp 19,000
- Cross-channel total significantly misaligned with bank settlements

**Phase to address:** GrabFood data ingestion phase and unified analytics schema design phase.

---

### Pitfall 11: BigSeller Negative Fee Fields Added Instead of Subtracted in Profit Calculation

**What goes wrong:**
BigSeller fee fields `commissionFee`, `sellerShippingFee`, and `otherFee` are documented as **negative values when they represent costs**. For example, a Rp 5,850 platform commission is returned as `commissionFee: -5850`. If these fields are naively summed with `platformIncome` in a profit calculation (`platformIncome + commissionFee`), the negative value correctly reduces profit. But if someone "fixes" the sign by writing `platformIncome - commissionFee`, the negative value is subtracted and profit is INCREASED by the commission cost — resulting in inflated analytics.

**Why it happens:**
The sign convention (`negative = cost`) is documented in the API reference's Data Glossary but counterintuitive. The BigSeller UI displays fees as positive numbers to users, so developers assume the API also returns positive values.

**How to avoid:**
Store all fee fields in `externalRevenue` as the raw values from BigSeller (negative for costs). Compute profit as: `platformIncome + commissionFee + sellerShippingFee + otherFee + serviceFee` — because adding a negative number correctly reduces the total. Add a comment to the profit calculation: "Fee fields are negative — adding them reduces profit." Write a unit test with a known order where `commissionFee: -5850` and verify the resulting `profit` is reduced by exactly 5850.

**Warning signs:**
- Tokopedia/TikTok channel showing higher profit margins than Shopee for equivalent orders
- Per-order profit exceeds `platformIncome` (impossible without negative cost fields being sign-flipped)
- BigSeller COGS-less profit margin showing >100%

**Phase to address:** BigSeller data ingestion phase — fee calculation must be unit-tested before analytics queries are built.

---

### Pitfall 12: Convex Action Timeout on BigSeller Polling — While-Loop Approach

**What goes wrong:**
Convex actions have a maximum execution time. A BigSeller sync can take 1–10 minutes. If polling is implemented as a `while` loop with `sleep(60000)` inside a single action, the action times out. When the action times out mid-poll, the sync is left in `"progress"` state with no scheduled continuation — the system is permanently stuck until manually reset.

**Why it happens:**
Polling loops feel natural in synchronous code. The Convex action timeout is easy to forget when developing against small datasets where sync completes in under 60 seconds.

**How to avoid:**
Never implement polling as a loop inside a single Convex action. Use the scheduler-based pattern: each poll check is a separate short-lived action scheduled 60 seconds after the previous one. This pattern also survives Convex deployment restarts because the scheduler persists jobs across function reloads. Cap the maximum poll reschedules at 20 (20 minutes total) before marking the sync as `"fail"` and alerting the admin.

**Warning signs:**
- Convex function logs showing action timeout errors for BigSeller sync actions
- Sync state stuck in `"progress"` indefinitely with no subsequent poll actions scheduled
- Dashboard showing sync running for more than 15 minutes

**Phase to address:** BigSeller foundation phase. The scheduler-based polling architecture must be the design baseline — not a later refactor from a loop-based approach.

---

### Pitfall 13: Consignment Excel Upload — SheetJS Numeric Cell Type Coercion Returns NaN

**What goes wrong:**
SheetJS parses Excel cells as their native type. Indonesian consignment POS exports frequently have number-formatted cells where the value looks like `"Rp 25.000"` (with period as thousands separator) or `"4"` stored as a text cell. SheetJS's default mode returns these as strings. JavaScript `Number("Rp 25.000")` returns `NaN`. Arithmetic on NaN silently propagates. Convex's `v.number()` validator rejects `NaN` with a type error that surfaces as a generic mutation failure, not a per-row validation message.

**Why it happens:**
Developers test with well-formed files they create. Real-world Indonesian POS exports vary in cell formatting. The `.000` thousands separator format is extremely common in Indonesia and always produces NaN via `Number()`.

**How to avoid:**
After parsing with SheetJS, coerce every numeric column explicitly: strip non-digit characters before converting (`parseInt(String(cell).replace(/[^\d]/g, ""), 10)`), then validate `isNaN()`. Return a structured validation result per row (row number, column name, raw value, error message) so the UI shows exactly which rows failed. Reject the entire upload if any required numeric column contains invalid values — do not partially insert.

**Warning signs:**
- Revenue totals showing 0 or NaN after upload despite correct-looking data
- Convex mutation error: "Value is not a valid number" with no indication of which row
- `externalRevenue.revenueGross` stored as 0 (fell through a `Number() || 0` fallback)

**Phase to address:** Consignment upload foundation phase — write validation unit tests against sample files before implementing the upload UI.

---

### Pitfall 14: Consignment Upload Partial Failure — No Idempotent Batch Rollback

**What goes wrong:**
A consignment upload inserts 50 `externalRevenue` records. If row 35 fails, records 1–34 are already committed. The user sees an error and re-uploads the file. Records 1–34 are now duplicated. There is no automatic rollback in Convex for partial batch failures unless the entire batch is in a single mutation.

**Why it happens:**
Progress-reporting during upload tempts developers to split the batch into per-row mutations (one per row allows updating a progress bar). Without idempotency guards, re-uploads double the existing data.

**How to avoid:**
Process the entire upload batch in a single Convex mutation. Use a `uploadBatchId` (UUID generated client-side before the upload) stored on every inserted record. Before inserting, check if any record with this `uploadBatchId` already exists — if so, skip all inserts (idempotent re-upload). Implement a `deleteConsignmentBatch(uploadBatchId)` mutation that atomically removes all records from the bad upload batch. Surface the `uploadBatchId` in the upload confirmation UI so admins can reference it for reversal.

**Warning signs:**
- Duplicate revenue records with the same date and outlet after re-upload attempts
- Revenue totals showing double the expected amount
- No way to identify which records came from which specific upload

**Phase to address:** Consignment upload phase — design the `uploadBatchId` idempotency pattern before writing the upload mutation.

---

### Pitfall 15: Unified Analytics — Adding New Channel as Reactive Subscription Instead of On-Demand Action

**What goes wrong:**
The v1.3 optimization converted heavy analytical queries to on-demand (action-backed) fetches to reduce Convex bandwidth. If new BigSeller/GrabFood analytics queries are added as reactive `useQuery` subscriptions rather than on-demand actions, the bandwidth spikes return. The `externalRevenue` table will grow significantly with multi-channel data — a subscription scanning it on every render becomes increasingly expensive.

**Why it happens:**
Reactive queries are the natural Convex pattern. The on-demand action wrapper pattern (from `convex/externalData/actions.ts`) is a less obvious indirection layer. New developers adding analytics for a new channel default to `useQuery`.

**How to avoid:**
All multi-channel analytics queries must follow the established pattern: `internalQuery` function in `convex/externalData/queries.ts` wrapped in an on-demand `action` in `convex/externalData/actions.ts`. Never expose a reactive `useQuery(api.externalData.*)` subscription for analytical aggregations. Add `by_source_period` composite index scans so source filters apply at the index level, not post-scan.

**Warning signs:**
- Convex bandwidth dashboard spike after adding new analytics queries
- New analytics query not wrapped in an `action` (grep: `useQuery(api.externalData` should return no new results)
- `SalesAnalytics.tsx` re-fetching on every render rather than explicit user-triggered refresh

**Phase to address:** Unified analytics phase — apply the on-demand pattern consistently from the start, not after noticing bandwidth issues.

---

### Pitfall 16: GrabFood Webhook Without HMAC Signature Validation — Fake Orders

**What goes wrong:**
The GrabFood webhook endpoint (`/api/grabfood/order`) is a public HTTPS URL. Without HMAC signature validation, any actor who discovers the URL can POST fake order payloads. The adapter's current `handleOrderWebhook` in `adapter.ts` has a `// TODO: Add HMAC signature validation` comment. Shipping without implementing this means the production order queue can be polluted with fabricated orders.

**Why it happens:**
HMAC validation is a "Phase 5 — Reliability" item in the GrabFood Integration Checklist. Developers implement basic functionality first and defer security hardening, then the TODO remains indefinitely.

**How to avoid:**
GrabFood provides an HMAC Secret in the partner project dashboard (Credentials section). Implement HMAC-SHA256 signature validation before the webhook goes to production. Verify the `X-Grab-Signature` header against the request body using the HMAC Secret. Reject requests with invalid or missing signatures with HTTP 401 (but still ensure the 200-first pattern applies for valid requests). This is a one-time implementation of ~20 lines.

**Warning signs:**
- The `// TODO: Add HMAC signature validation` comment still present in `handleOrderWebhook`
- Unexpected orders appearing in the system with unknown `merchantID` values
- Order queue showing orders with malformed or missing required fields

**Phase to address:** GrabFood webhook implementation phase — HMAC validation must be implemented before the webhook is registered in the GrabFood production portal.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store BigSeller `costFee: 0` without flagging in UI | Simpler schema, no COGS setup required | Profit margin shows ~100% — misleading analytics, wrong business decisions | Never — always surface "COGS not configured" caveat in UI |
| Add new `source` literal to one schema table only | Avoids touching multiple files | TypeScript errors at table boundaries; analytics queries silently exclude new sources | Never — update all four tables in one schema change |
| Poll BigSeller sync with a `while` loop in a single action | Simpler linear code | Action timeout after Convex limit, no recovery path | Never — use scheduler pattern from day one |
| Fuzzy SKU string matching for BigSeller → menuProduct | Auto-maps most SKUs without admin effort | Silent revenue misattribution, compounds over time | Only as fallback — require admin confirmation for non-exact matches |
| Skip webhook HMAC validation for faster shipping | Saves ~20 lines of implementation | Fake orders can be injected into the production queue | Never before production registration of the webhook |
| Fetch GrabFood token per API call for simpler code | No token state management needed | Rate limit errors, possible credential suspension per GrabFood's explicit prohibition | Never |
| Inline hardcoded BigSeller shop IDs instead of table-driven config | Faster to implement | Breaks when a new Shopee/Tokopedia shop is added; requires code deploy to add shop | Never — store shop IDs in `platformCredentials` or a `bigsellerShops` config table |

---

## Integration Gotchas

Common mistakes when connecting to GrabFood, BigSeller, and consignment systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GrabFood OAuth2 | Fetch token per API call | Cache in `platformCredentials`, reuse until `tokenExpiresAt - 5 min`; call `resolveToken()` in every action |
| GrabFood OAuth2 | Use `prdBaseUrl` for staging tests | Always use sandbox `baseUrl` for testing; switch to `prdBaseUrl` only when deploying against production merchant credentials |
| GrabFood menu sync | Assume `PUT /menu` applies immediately | Always call `POST /merchant/menu/notification` after any menu write; poll `traceMenuSync` for result |
| GrabFood webhooks | Process order synchronously before returning 200 | Return 200 immediately; schedule async processing via `ctx.scheduler.runAfter` |
| GrabFood webhooks | Skip HMAC validation for speed | Implement HMAC-SHA256 check before production webhook registration |
| BigSeller auth | Treat `muc_token` as an opaque string | Decode JWT, persist `exp` field, surface expiry warning 3 days before expiry |
| BigSeller sync | Query `listStatsData` immediately after `sync/task/create` | Poll `sync/task/detail/new/get.json` until `taskStatus = "complete"` — takes 1–10 minutes |
| BigSeller sync | Trigger daily cron without checking current sync state | Always check existing task status first; if in-progress, re-enter polling instead of creating new task |
| BigSeller date range | Use a 90-day range for initial backfill | Split into 31-day chunks and process serially |
| BigSeller fees | Assume `commissionFee`, `otherFee`, `sellerShippingFee` are positive costs | These are **negative values** — add them to profit (negative + profit = correctly reduced profit); never subtract |
| BigSeller pagination | Fetch only page 1 of `pageList` | Loop until `pageNo >= totalPage`; Frollie currently small but will grow |
| SheetJS | Assume cell values are typed correctly | Explicitly coerce every numeric column; handle Indonesian Rp thousands separator |
| SheetJS | Trust `sheet['!ref']` range for data extent | Use `sheet_to_json` with explicit header; validate column names before processing |
| `externalRevenue.source` | Cram Shopee/Tokopedia data under `"internal"` | Add proper source literals to the union in all four tables |

---

## Performance Traps

Patterns that work at small scale but fail as multi-channel data accumulates.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Reactive `useQuery` subscription on `externalRevenue` table scan | Analytics page causes high bandwidth; slow on mobile | Use on-demand action pattern established in v1.3 | When `externalRevenue` exceeds ~500 rows (3–4 months of multi-channel data) |
| BigSeller `pageList` not fully paginated | Sync appears complete but 90% of orders missing | Loop until `pageNo >= totalPage` | When monthly Shopee+Tokopedia orders exceed `pageSize: 50` |
| GrabFood order list without pagination loop | Historical backfill incomplete | Loop incrementing `page` until `more: false` | When GrabFood order backfill exceeds one page |
| Storing BigSeller `skuVoList` as a JSON blob | Simple insert, no normalization needed | Store as separate table rows; JSON blobs are not queryable in Convex | Immediately — JSON blobs cannot be indexed or filtered |
| Analytics period aggregation without timezone normalization | Different channels show different "today" totals | Normalize all ingested timestamps to WIB midnight UTC (`T00:00:00+07:00`) at ingest time | On first cross-channel daily comparison |
| BigSeller polling loop inside single Convex action | Linear code, easy to read | Use `ctx.scheduler` chain instead | When sync takes more than Convex action max duration |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging full GrabFood `access_token` in Convex console | Token visible in dashboard logs to any dashboard-access user | Log only `tokenPreview` (first 30 chars) — already done in current `adapter.ts`; ensure no new log lines add the full token |
| GrabFood webhook endpoint without HMAC validation | Fake orders injected into production queue | Implement `X-Grab-Signature` HMAC-SHA256 check before production registration (see Pitfall 16) |
| BigSeller `muc_token` JWT stored in `platformCredentials.password` field without access restriction | JWT grants full BigSeller account access | Acceptable for internal tool (same risk pattern as GoBiz token); ensure only `admin` role can read `platformCredentials` |
| Consignment upload mutation not gated by `requireRole` | `kitchen` role staff can upload and corrupt revenue data | Wrap in `requireRole(ctx, args.token, ["manager", "admin"])` — consignment revenue is manager-level data |
| No file size guard on Excel upload | 50k-row file exhausts Convex document write quota | Reject files >5 MB or >2,000 parsed rows with clear user error message |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| BigSeller sync progress not visible during 8-minute wait | User thinks feature is broken; re-clicks sync, triggering "already in progress" errors | Show sync state machine in dashboard: "Triggering...", "Syncing (est. 5–10 min)", "Fetching data...", "Complete" with timestamps |
| Analytics showing `profit: Rp 1,770,500` with no COGS caveat | Manager thinks margin is 99% when COGS has not been entered in BigSeller | Show "Profit = Revenue (COGS not configured in BigSeller)" whenever all `costFee` values are 0 for BigSeller records |
| Excel upload with no row-level validation feedback | User re-uploads whole file guessing at what was wrong | Show a table of failed rows with column name, raw cell value, and error reason before accepting the upload |
| GrabFood menu sync `PARTIAL_FAILURE` silently logged but not surfaced | Menu items appear available when they are actually unavailable in the GrabFood app | Show a persistent banner on the GrabFood settings page when the last menu sync resulted in `PARTIAL_FAILURE` |
| Multi-channel analytics defaulting to UTC midnight boundaries | Analytics for "today" shows different totals depending on time of day (pre/post midnight UTC) | Apply `Asia/Jakarta UTC+7` offset for all "today", "this week", "this month" period calculations across all channels |

---

## "Looks Done But Isn't" Checklist

- [ ] **GrabFood OAuth**: `resolveToken()` is called in every new action — verify no `fetchFreshToken()` calls outside `resolveToken()`
- [ ] **GrabFood webhooks**: HTTP 200 returned before any `await` — verify no processing logic above the `return new Response("OK")` line
- [ ] **GrabFood HMAC**: Signature validation implemented — the `// TODO: Add HMAC signature validation` comment must be resolved before production webhook registration
- [ ] **GrabFood menu sync**: `notifyMenuUpdate` called after every menu write — verify in Convex logs that the notification endpoint is called
- [ ] **BigSeller polling**: Scheduler-based poll loop, not a `while` loop — no `while` or `do-while` in any BigSeller sync action
- [ ] **BigSeller auth**: `exp` decoded from JWT and stored in `tokenExpiresAt` — verify `platformCredentials` record has expiry date, not `undefined`
- [ ] **BigSeller fees**: Negative fees correctly handled — verify per-order profit calculation with a known test order where `commissionFee: -5850`
- [ ] **BigSeller pagination**: All pages fetched from `pageList` — verify `pageNo < totalPage` loop condition is present
- [ ] **Schema migration**: All four `source` union validators updated — `npm run type-check` passes with new literals
- [ ] **Consignment upload**: `uploadBatchId` stored on every inserted record — verify reversal mutation deletes all records for a given batch ID
- [ ] **Analytics pattern**: All new multi-channel analytics queries use on-demand action pattern — no new direct `useQuery(api.externalData.*)` reactive subscriptions for analytical data
- [ ] **Price units**: GrabFood IDR prices stored as whole Rupiah (not divided by 100) — verify with a known test order where `subtotal: 25000` stores as `25000`
- [ ] **BigSeller COGS**: "COGS not configured" caveat visible in UI whenever `costFee: 0` for BigSeller records

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate GrabFood webhook orders (P2) | MEDIUM | Query for duplicate `orderID` records in `grabfoodIncomingOrders`; run deduplication mutation; add `requestID` uniqueness constraint going forward |
| BigSeller sync stuck in "progress" indefinitely (P4/P5) | LOW | Manually check `sync/task/detail/new/get.json` via Convex action; if truly stuck, wait for BigSeller's own timeout; trigger fresh sync for the affected date range |
| `externalRevenue` records with wrong/missing source enum (P8) | LOW | Schema migration adding new literals is non-destructive; existing records need no field updates; fix enum, redeploy, re-sync affected date ranges |
| Consignment upload with duplicate records (P14) | LOW | Call `deleteConsignmentBatch(uploadBatchId)` to atomically remove all records from bad upload; re-upload corrected file |
| GrabFood minor-unit price stored as /100 IDR (P10) | HIGH | Data migration: multiply affected `externalRevenue.revenueGross` records by 100; identify by `source: "grabfood"` and `revenueGross < 10000` (below minimum plausible product price) |
| BigSeller JWT expired with no warning (P6) | LOW | Admin re-pastes fresh `muc_token` via settings UI (same reconnect pattern as GoBiz); implement proactive expiry warning to prevent recurrence |
| BigSeller fees sign-flipped in profit calculation (P11) | MEDIUM | Recalculate `profit` for all stored BigSeller orders using raw fee fields; update analytics derived values; add unit test to prevent regression |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| GrabFood token per call (P1) | GrabFood foundation — token management | `resolveToken()` in all actions; no direct `fetchFreshToken()` calls outside it |
| Webhook 200 after processing (P2) | GrabFood webhook handler implementation | Send 2 rapid webhook POSTs for same order; confirm only 1 record created |
| Menu sync without notify (P3) | GrabFood menu sync phase | Confirm `notifyMenuUpdate` called in all menu-write flows; `menuTrace` reaches SUCCESS |
| BigSeller query during progress (P4) | BigSeller foundation — polling architecture | `code: -1` from BigSeller is logged as error, not treated as empty success |
| BigSeller cron collision (P5) | BigSeller foundation — cron design | Two rapid sync triggers: second is gracefully skipped or absorbed into existing poll |
| JWT expiry silent failure (P6) | BigSeller auth phase | HTML response from BigSeller → "Re-login required" error, not JSON parse crash |
| 31-day range limit (P7) | BigSeller foundation — backfill design | 90-day backfill request correctly splits into 3 sequential 31-day syncs |
| Schema union excludes new sources (P8) | Schema migration phase — first task | `npm run type-check` passes with new source literals; `externalOutlets` query returns BigSeller outlets |
| SKU mapping via string matching (P9) | BigSeller data mapping phase | Unknown SKU stored with `linkedMenuProductId: undefined` and surfaced in reconciliation UI |
| SheetJS numeric coercion (P10 / old P13) | Consignment upload foundation | Unit tests with Indonesian Rp-formatted cells, text-typed numbers, empty cells |
| GrabFood IDR minor unit (P10) | GrabFood ingest phase | Unit test: `subtotal: 25000` + `exponent: 0` → stored as `25000` |
| BigSeller negative fees (P11) | BigSeller ingest phase | Unit test: known order with `commissionFee: -5850` → profit reduced by 5850 |
| Upload batch no rollback (P14) | Consignment upload mutation design | Upload with invalid row 35; confirm zero records inserted; re-upload succeeds with exactly N records |
| Action timeout on polling (P12) | BigSeller foundation — architecture | Code review: no `while` loops in BigSeller actions; all polls via `ctx.scheduler` |
| Analytics reactive subscription (P15) | Unified analytics phase | No new `useQuery(api.externalData.*)` subscriptions for analytical data; all wrapped in actions |
| Webhook without HMAC (P16) | GrabFood webhook implementation | `// TODO: Add HMAC` comment removed; signature validation tested with a known-valid and known-invalid payload |

---

## Sources

- GrabFood Partner API official SDK documentation — `docs/GRABFOOD_API.md` (OpenAPI v1.1.3, SDK v1.0.2, verified 2026-02-24)
- BigSeller Profit Analytics API — `docs/BIGSELLER_PROFIT_API.md` (reverse-engineered, verified 2026-02-25)
- Existing GrabFood adapter implementation — `convex/integrations/grabfood/adapter.ts` (scaffolded, staging-ready)
- Existing schema design — `convex/schema.ts` (59 tables, specifically `externalRevenue`, `externalOutlets`, `externalSyncLogs`, `externalRevenueItems`)
- Integration registry — `convex/integrations/registry.ts` (current PlatformId union)
- v1.3 on-demand query pattern — `convex/externalData/actions.ts`
- GoBiz integration (comparison pattern) — `convex/integrations/gobiz/`
- Known technical debt — `PROJECT.md` (ingredient simulation name-matching fragility, current source union gaps)
- Production outage lessons — `docs/LESSONS_LEARNED.md` (Vite TDZ crash, gsd-debugger commits to main)
- Prior v1.3 PITFALLS.md — SheetJS date parsing, merged cells, mutation argument limits (patterns applicable to consignment upload in v1.4)

---
*Pitfalls research for: v1.4 Sales & Channel Integration (GrabFood POS, BigSeller, Consignment, Unified Analytics)*
*Researched: 2026-02-25*

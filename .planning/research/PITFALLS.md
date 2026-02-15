# Pitfalls Research: v1.1 Stabilization & QoL

**Domain:** External API integrations, order QoL, kitchen mobile UX, weekly planning, multi-outlet aggregation on Convex serverless
**Researched:** 2026-02-15
**Confidence:** HIGH (based on codebase analysis, existing integration code review, Convex docs, GoBiz API docs)

---

## Critical Pitfalls

### Pitfall 1: GoBiz Token Cascade Silently Fails, Cron Syncs Stop for Days Unnoticed

**What goes wrong:**
The GoBiz token refresh uses a 3-method cascade (cookie, rotate, API). All three methods rely on the refresh token, which GoBiz expires after **9 months** of session inactivity -- but the access token expires every **1 hour**. If the underlying GoBiz session expires (password change, account lockout, Gojek server-side invalidation), all three refresh methods fail silently. The cron job (`autoSyncGoBizRevenue`) logs "no_token" and returns -- but there is **no alerting mechanism**. Revenue data silently stops syncing. The team only discovers the gap days later when sales reports show zero GoFood revenue.

**Why it happens:**
The current `autoSyncGoBizRevenue` cron logs the skip to console but does not surface it to any user. There is no "last successful sync" dashboard indicator, no staleness warning, and no notification system. The cron runs 7 times daily, so console logs scroll past quickly.

**How to avoid:**
1. Add a `syncHealth` query that checks `externalSyncLogs` for the most recent successful GoBiz sync. If the last success is older than 6 hours, surface a warning banner on the Dashboard.
2. Track consecutive cron failures in `platformCredentials`. After 3 consecutive failures, mark the credential as `status: "stale"` which triggers a UI banner: "GoFood sync stopped -- re-authenticate in Settings."
3. The existing `externalSyncLogs` table already has the data. Just need a query + UI indicator.

**Warning signs:**
- `externalSyncLogs` shows multiple consecutive `status: "success"` entries with `productsCount: 0` for GoBiz
- `platformCredentials` for "gobiz" has `lastRefreshStatus: "error"` with recent timestamps
- Dashboard sales reports show zero GoFood revenue for recent days

**Phase to address:**
Phase 2 (API Audit & Auth Architecture) -- design the health check system. Phase 6 (API Integrations) -- implement it.

---

### Pitfall 2: Convex Action Timeout (10 min) Hit During Large GoBiz Sync

**What goes wrong:**
Convex actions have a hard **10-minute timeout**. The current `syncGoBizRevenue` action processes days sequentially: for each day it fetches journals (paginated), saves transactions, then fetches individual order details with 200ms rate-limiting delays. With `daysBack=7` (default) and ~50 transactions/day, Phase B alone needs ~50 orders x 200ms = 10 seconds per day. But on catch-up after a token failure (e.g., `daysBack=30`), the action processes 30 days x (journal fetch + transaction save + order details). This easily exceeds 10 minutes and the action is **killed mid-execution**, leaving partial data.

**Why it happens:**
The action does both Phase A (journals) and Phase B (order details) in a single execution. There is no checkpointing. If the action times out in Phase B after Phase A completed, the sync log shows "started" forever (never updated to success/error because the catch block never runs).

**How to avoid:**
1. Split into two separate actions: `syncJournals` (Phase A) and `syncOrderDetails` (Phase B). Phase A creates revenue records, Phase B enriches them. Chain via `ctx.scheduler.runAfter(0, ...)`.
2. Limit `daysBack` to 3 for cron runs. Only allow larger ranges for manual sync with explicit user action.
3. Add a "stale sync log" cleanup: any `externalSyncLogs` entry with `status: "started"` older than 15 minutes should be marked as `status: "timeout"` by an integrity check.
4. For catch-up scenarios, use Convex's scheduler to process one day per action invocation, chaining the next day via `ctx.scheduler.runAfter`.

**Warning signs:**
- `externalSyncLogs` entries stuck in `status: "started"` with no corresponding success/error
- Convex dashboard shows action timeouts in the logs
- Revenue data has gaps (some days have journals but no order items)

**Phase to address:**
Phase 6 (API Integrations) -- refactor sync into chained actions before scaling up.

---

### Pitfall 3: Modifying Active Order Form Breaks Kitchen Staff Mid-Shift

**What goes wrong:**
The order creation form is used daily by order staff. Moving fields around (customer info to top, dates to RHS, hiding creation date) changes muscle memory. If deployed during business hours, staff who have the old UI open get the new layout on next Convex reactive update. Orders in progress may have fields in unexpected positions, leading to missed fields, wrong dates, or abandoned orders. Worse: if the schema changes (e.g., adding `createdBy` to order status transitions), existing in-flight orders may fail validation on the next mutation.

**Why it happens:**
Convex's real-time nature means frontend updates are **instant** for all connected clients. There is no "deploy during maintenance window" -- Vercel deploys the new frontend and Convex deploys the new backend, and all connected browsers get the new code within seconds. Order staff cannot "finish what they're doing" on the old UI.

**How to avoid:**
1. **Never change field semantics in the same deploy as UI changes.** If adding required fields to order mutations, make them optional first, deploy, then make the UI use them, then make them required in a later deploy.
2. **Deploy UI changes during off-hours** (after 8 PM WIB / 1 PM UTC). The Convex backend can be deployed anytime since it's backward-compatible, but the Vite frontend bundle is what changes the UI.
3. **Feature flag the new layout.** Add a `useNewOrderLayout` flag (even a simple `localStorage` toggle) so staff can switch back if confused. Remove the flag after 1 week.
4. **Test with actual order staff before deploying.** Have one staff member use the new layout for a day before rolling out to all.

**Warning signs:**
- Order staff complaining about "the form changed"
- Increase in draft orders that are never completed
- Orders missing customer information or dates after deployment

**Phase to address:**
Phase 3 (QoL Fixes Batch) -- implement all order form changes with backward-compatible backend mutations.

---

### Pitfall 4: WIB Timezone Bugs at Day Boundaries Corrupt Date-Dependent Features

**What goes wrong:**
The codebase has **multiple independent WIB conversion implementations**: `wibDateToUtcRange()` in gobiz helpers, `getTodayJakarta()` in k3mart helpers, manual `+7 hours` arithmetic in `generateWibDateRange()`, `Date.UTC(..., -7, ...)` in periodRange.ts, and `toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })` in the K3Mart adapter. Each handles edge cases differently. The `getWeekNumber()` function parses dates as `new Date(date + "T00:00:00+07:00")` but `getProductionReadiness` uses `new Date(args.date + "T12:00:00Z")` -- these give different dates at certain times. Adding kitchen due-date display, weekly planning with holiday detection, and day-name quick-tap all introduce more date logic. One wrong timezone conversion means kitchen targets show for the wrong day, dispatch plans land on the wrong week, or due dates show "Saturday" when it is Friday in Jakarta.

**Why it happens:**
JavaScript `Date` is notoriously bad with timezones. Convex runs on UTC servers. The codebase mixes three approaches: (a) manual `+7 hours` offset, (b) `toLocaleDateString` with `timeZone` option, and (c) explicit `+07:00` in date strings. These work in isolation but produce subtle 1-day-off errors when combined or when one function's output feeds another function that assumes a different convention.

**How to avoid:**
1. **Centralize ALL WIB date logic into a single `convex/lib/wibDate.ts` utility.** Functions: `nowWib()`, `toWibDateString(utcMs)`, `wibDateToUtcRange(dateStr)`, `getWibWeekNumber(dateStr)`, `isWibWeekend(dateStr)`. Delete the scattered implementations.
2. **Convention:** All dates stored in Convex are either UTC epoch milliseconds or `YYYY-MM-DD` strings that represent WIB dates (never UTC dates). Document this convention in `CLAUDE.md`.
3. **Test at boundary times.** Write unit tests that run at 23:30 WIB (16:30 UTC), 00:30 WIB (17:30 UTC previous day), and WIB midnight exactly. The existing `periodRange.test.ts` does this -- extend to all new date functions.
4. **For kitchen due-date display:** Always show the WIB date explicitly (e.g., "Sat, Feb 15") -- never show relative dates like "tomorrow" which depend on the viewer's timezone.

**Warning signs:**
- Kitchen view shows targets for "yesterday" early in the morning (before WIB midnight rolls over)
- K3Mart dispatch plans appear in wrong week when created near WIB midnight
- Production readiness query shows wrong day's data

**Phase to address:**
Phase 4 (Kitchen Overhaul) and Phase 5 (K3Mart Cockpit) -- centralize before building new date-dependent features.

---

### Pitfall 5: K3Mart Cockpit "Stubs to Real" Transition Breaks Existing Data

**What goes wrong:**
The K3Mart cockpit already has real data in `k3martDispatchPlans`, `k3martStockMovements`, `k3martRestockTargets`, `externalOutlets`, and `externalRevenue` tables. The weekly planning uses `getWeekNumber()` to index plans by ISO week. If the implementation of "complete weekly planning section with public holidays" changes the week numbering, date format, or adds new required fields to dispatch plans, existing data becomes orphaned or invalid. Plans saved as `weekNumber: "2026-W07"` will not match if the function changes its algorithm.

**Why it happens:**
The stubs are not empty -- they already have production data from the K3Mart integration built in v1.0. Developers treat "cockpit stubs" as greenfield when they are actually brownfield. Changing helpers like `getWeekNumber()` retroactively changes the semantics of stored data.

**How to avoid:**
1. **Never change `getWeekNumber()`'s algorithm.** It uses ISO week numbering with WIB timezone. This is already correct and matches the stored `weekNumber` field values. If you need a different week system, add a new function; do not modify the existing one.
2. **New fields on existing tables must be optional.** For example, adding `isPublicHoliday` to dispatch plans: make it `v.optional(v.boolean())`, not `v.boolean()`.
3. **Before any cockpit work, snapshot the current data.** Run `npx convex export` to backup. Then verify the new code reads existing plans correctly.
4. **Holiday calendar should be a separate table** (`publicHolidays`), not inline on dispatch plans. This way existing plans are not affected.

**Warning signs:**
- Weekly dispatch plan view shows empty weeks that previously had data
- `getWeeklyDispatchPlans` returns empty for weeks that have plans in the DB
- Stock movement history shows "undefined" for new fields

**Phase to address:**
Phase 5 (K3Mart Cockpit) -- verify backward compatibility before any schema changes.

---

### Pitfall 6: Multi-Outlet Revenue Aggregation Double-Counts on Re-Sync

**What goes wrong:**
Both GoBiz and K3Mart sync use deduplication keys (`externalTransactionId`) to prevent duplicate revenue entries. The GoBiz dedup key is built from `orderNumber + transactionTimeMs`. The K3Mart dedup key is built from `transDate + outletName + productCode + qty + total`. If the external API returns slightly different data on re-sync (e.g., a timestamp shifted by 1ms due to rounding, or a product name changed), the dedup key changes and a duplicate record is created. Sales reports then show inflated revenue.

**Why it happens:**
The dedup strategy relies on exact field matching. External APIs are not guaranteed to return byte-identical responses on subsequent calls. GoBiz journal timestamps may have millisecond precision that varies between calls. K3Mart may update product names or prices retroactively.

**How to avoid:**
1. **Use stable identifiers for dedup keys.** For GoBiz: use `orderNumber` alone (not `orderNumber + timestamp`), since order numbers are unique per merchant. For K3Mart: use `transDate + outletName + productCode + qty` (drop `total` since price may be corrected).
2. **Add a revenue reconciliation query** that detects potential duplicates: same source + same date + same amount + different dedup keys.
3. **For the Crystal outlet addition:** When adding the second GoFood merchant (`G347061572`), include the `merchantId` in the dedup key so transactions from different merchants are never confused even if they have the same order number format.
4. **Add a "total revenue vs expected" sanity check** in the integrity check cron.

**Warning signs:**
- Revenue totals from the app exceed what GoBiz/K3Mart portals show
- `externalRevenue` table has entries with near-identical fields but different `_id`s
- Daily revenue shows unexpected spikes after manual re-sync

**Phase to address:**
Phase 2 (API Audit) -- audit current dedup keys. Phase 6 (API Integrations) -- fix before adding Crystal outlet.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Duplicate sync logic between `syncGoBizRevenue` and `autoSyncGoBizRevenue` | Working cron quickly | 200+ lines of duplicated code, bugs fixed in one but not other | Never -- already exists, must refactor in Phase 6 |
| Using `any` casts in K3Mart adapter (`items: batchItems as any`) | Bypasses strict typing | Silent type errors, runtime failures on shape mismatch | Only during rapid prototyping, must clean up in Phase 5 |
| Hardcoded merchant IDs in config files | Fast initial setup | Adding Crystal outlet requires code change + deploy | Acceptable for v1.1 MVP, migrate to DB-stored config in v1.2 |
| Manual `+7 hours` timezone arithmetic | No dependency on Intl API | Off-by-one day bugs, impossible to handle DST if Indonesia ever adopts it | Never -- centralize into wibDate utility |
| `console.log` as only observability | Zero setup | No alerting, logs disappear after Convex log retention | Acceptable for v1.1, add structured logging in v1.2 |
| Rate-limit via `setTimeout(200ms)` in sync actions | Simple, prevents throttling | Wastes action execution time (billed), may still hit rate limits under load | Acceptable for current volume (<100 orders/day) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GoBiz Token API | Storing password in code (already in `docs/apiS/` reference file) | Move to Convex environment variable via `npx convex env set GOBIZ_EMAIL xxx`. The current `platformCredentials` table approach is correct for tokens but credentials should never be in source. |
| GoBiz Journal Search | Assuming `total` field in response is reliable for pagination | Always paginate until `hits.length < pageSize` (already done correctly in current code). |
| GoBiz Order Search | Fetching order details for every transaction including old ones | Only fetch for NEW revenue records (already done -- `allNewRecords` filtering). Keep this pattern. |
| K3Mart Stock Flow | Submitting stock-in without fetching fresh dashboard first | Always fetch current stock before submission (already done with `dashboardCache`). Stale stock leads to K3Mart rejecting the request. |
| K3Mart JWT Token | Assuming JWT expiry from `exp` claim is reliable | K3Mart may invalidate tokens server-side before expiry. Always handle 401 and trigger refresh. The 12-hour cron refresh is a good safety net. |
| Convex Actions + fetch | Assuming `fetch` responses are JSON | Always check `Content-Type` header before `.json()` parse. K3Mart sometimes returns HTML during maintenance (already handled in `performK3MartRefresh`). |
| Multi-merchant GoBiz | Using same dedup key format across merchants | Include `merchantId` in dedup key when adding Crystal outlet to prevent cross-merchant collisions. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching all `externalRevenue` records for aggregation queries | Slow dashboard load, query timeout (1s limit) | Use Convex indexes on `[source, periodStart]`. Pre-aggregate daily totals in a separate table. | >10,000 revenue records (~6 months of data) |
| K3Mart `discoverK3MartOutlets` scanning all products x all outlets | Action takes >30s, UI feels frozen | Already mitigated by product-centric approach (N API calls for N products). Keep product count low. | >20 configured products |
| Kitchen view querying `productionLog` without time-bounded index | Full table scan on every kitchen page load | Ensure `productionLog` has index on `[menuProductId, _creationTime]` and queries filter to current reset period only | >50,000 production log entries (~6 months) |
| Weekly dispatch plan queries scanning all plans | Slow cockpit load | Already indexed by `by_week` and `by_date_outlet`. Maintain these indexes when adding features. | >5,000 dispatch plans (~1 year of daily plans for 10 outlets) |
| `autoMatchMenuProduct` calling DB for every order item individually | N+1 query pattern inside sync action | Batch-load all product mappings at start of sync, match in-memory | >50 items per sync batch |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| GoBiz credentials in `docs/apiS/` reference file committed to git | Email/password for GoBiz merchant portal exposed in repo | Already flagged in `NEXT-MILESTONE-DRAFT.md`. Phase 2 MUST extract to `.env.local` before any work. Add to `.gitignore`. Run `git filter-branch` or BFG to scrub from history if repo is public. |
| K3Mart token stored in `platformCredentials` table without encryption | Anyone with DB read access sees the JWT | Acceptable risk for internal tool with PIN auth. If multi-tenant or public-facing in future, encrypt at rest. |
| Public actions (`syncGoBizRevenue`, `discoverK3MartOutlets`) lack auth checks | Any authenticated user could trigger expensive API syncs | Add `requireRole(ctx, args.token, ["admin"])` to all sync actions. Currently only `refreshK3MartToken` has auth. |
| Rate-limiting not enforced on manual sync triggers | Staff could spam "Sync Now" button, hitting external API rate limits | Add client-side debounce (disable button for 30s after click) and server-side check (reject if last sync was <5 min ago). |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Changing order form layout without visual migration cues | Staff confused, orders take longer, errors increase | Add subtle highlights on moved fields for first week ("NEW: Customer info moved here"). Remove after 7 days via localStorage flag. |
| Kitchen due-date display using relative dates ("tomorrow") | Ambiguous near midnight, different for UTC vs WIB users | Always show absolute dates with day name: "Sat, Feb 15". Highlight overdue in red, today in yellow, future in default. |
| Day-name quick-tap for due dates showing wrong day names | Quick-tap shows "Saturday" but server stores Friday's date | Calculate day names in WIB timezone, display WIB date alongside day name for verification. |
| K3Mart weekly planner assuming Monday-Sunday weeks | Some outlet deliveries happen on specific days, not all 7 | Show all 7 days but grey out days with no scheduled deliveries. Let user configure delivery days per outlet. |
| "Sync Now" button with no progress indicator | Staff thinks it is broken, clicks multiple times | Show spinner, disable button, display last sync time and record count on completion. Already partially done for K3Mart but not for GoBiz. |
| Mobile kitchen UI with small tap targets | Wet hands, small screens, kitchen staff makes wrong selections | Minimum 48px tap targets (current shadcn/ui buttons may be 32px). Test on actual kitchen device before deploy. |
| Inventory "brochure unavailable" bug with no override | Manager cannot correct inventory errors, blocks kitchen | Add manager override button that logs the correction with reason. Never silently adjust -- always require a note. |

## "Looks Done But Isn't" Checklist

- [ ] **GoBiz Crystal outlet:** Adding merchantId to config is NOT enough -- also need: dedup key update, product mapping table entries for Crystal-specific products, outlet display name mapping, commission rate verification (may differ from Goldfinch)
- [ ] **Kitchen due dates:** Showing due dates requires not just display changes but also sorting logic change -- orders must sort by due date ascending, not creation date. Verify the `kitchenOrders` query supports this sort order.
- [ ] **Weekly planning holidays:** A holiday calendar table is NOT enough -- also need: holiday-aware suggested quantity calculation (lower targets on holidays), visual indicators in the weekly grid, and handling of "holiday on delivery day" edge case (skip or move to next day?)
- [ ] **Order audit trail:** Adding "who placed order" requires: user reference on order creation, status transition logging (not just final status), and display of history timeline on order detail page. The `orders` table may need a `statusHistory` array or separate `orderStatusTransitions` table.
- [ ] **K3Mart manual stock in/out:** The API submission works, but the UI needs: confirmation dialog, loading state during API call, error handling for TOKEN_EXPIRED (redirect to settings), and rollback UI if API succeeds but DB save fails.
- [ ] **Consignment flow:** Revenue recognition for consignment is fundamentally different from direct sales -- consignment revenue is recognized on SALE by the outlet, not on DELIVERY. This affects all revenue reports and requires a separate accounting path.
- [ ] **Sync health dashboard:** Showing "last sync: 2 hours ago" looks done but is NOT useful without also showing: records synced, error count, data coverage (which dates have data), and quick-action to re-sync.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| GoBiz token expired, days of missing data | LOW | Re-authenticate manually, run `syncGoBizRevenue` with `daysBack: 30`. Dedup keys prevent duplicates. Data gap fills automatically. |
| Double-counted revenue from dedup key collision | MEDIUM | Query `externalRevenue` for duplicates (same source + date + amount). Delete newer duplicate. Re-run aggregation queries. |
| Wrong dates in dispatch plans from timezone bug | HIGH | Must identify all affected plans by comparing stored dates vs expected WIB dates. Manual correction in Convex dashboard. May need to void and recreate plans. |
| Order form deployment breaks active orders | MEDIUM | Revert Vercel deployment to previous build. Convex backend stays compatible since mutations accept optional fields. In-flight orders resume on old UI. |
| K3Mart API submission succeeds but DB save fails | MEDIUM | Check K3Mart stock flow history via `fetchStockFlowHistory`. Compare with `k3martStockMovements` table. Add missing records manually or re-run stock sync. |
| Action timeout during sync leaves orphaned sync log | LOW | Run integrity check to find `status: "started"` sync logs older than 15 min. Mark as `status: "timeout"`. Re-trigger sync. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| GoBiz token failure unnoticed | Phase 2 (design) + Phase 6 (implement) | Dashboard shows sync health indicator; test by revoking token and verifying warning appears within 6 hours |
| Action timeout on large sync | Phase 6 (API Integrations) | Run `syncGoBizRevenue` with `daysBack: 30`; verify it completes without timeout by checking sync log status |
| Order form breaks staff workflow | Phase 3 (QoL Fixes) | Deploy during off-hours; verify all existing draft orders can still be completed after deployment |
| WIB timezone bugs | Phase 4 (Kitchen) + Phase 5 (K3Mart) | Unit tests at WIB boundary times; integration test comparing app dates with `date` command in Asia/Jakarta |
| K3Mart stub-to-real data breakage | Phase 5 (K3Mart Cockpit) | Export data before changes; verify existing dispatch plans load correctly after deployment |
| Revenue double-counting | Phase 2 (audit dedup keys) + Phase 6 (fix) | Compare app revenue totals with GoBiz/K3Mart portal totals for same date range; variance should be <1% |
| GoBiz credentials in git | Phase 2 (API Audit) | First task of Phase 2: move secrets to env vars, verify `.gitignore` covers API docs with credentials |

## Sources

- Convex action timeout: 10 minutes ([Convex Limits](https://docs.convex.dev/production/state/limits)) -- HIGH confidence
- Convex query/mutation timeout: 1 second ([Convex Limits](https://docs.convex.dev/production/state/limits)) -- HIGH confidence
- GoBiz token expiry: 1 hour access token, 9-month refresh session ([GoBiz Developer Portal](https://developer.gobiz.com/docs/docs/authentication/index.html)) -- MEDIUM confidence (public docs may differ from internal merchant API used by this project)
- Codebase analysis: `convex/integrations/gobiz/adapter.ts`, `convex/integrations/k3mart/adapter.ts`, `convex/k3martCockpit/helpers.ts`, `convex/crons.ts` -- HIGH confidence (direct code review)
- GoBiz API reference documentation: `docs/apiS/gojek search transactions documentation.txt` -- HIGH confidence (captured from real API calls)
- Existing WIB date handling patterns: `convex/lib/periodRange.ts`, `convex/integrations/gobiz/helpers.ts`, `convex/k3martCockpit/helpers.ts` -- HIGH confidence (direct code review)

---
*Pitfalls research for: v1.1 Stabilization & QoL*
*Researched: 2026-02-15*

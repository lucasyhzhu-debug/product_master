# Project Research Summary

**Project:** Frollie Recipe Master v1.4 — Sales & Channel Integration
**Domain:** Multi-channel sales integration (GrabFood POS API, BigSeller marketplace analytics, Consignment Excel upload, Unified Analytics)
**Researched:** 2026-02-25
**Confidence:** HIGH

## Executive Summary

This milestone extends an existing Convex + React 19 production system with four new capability areas: GrabFood POS store control and order history, BigSeller profit sync covering Shopee and Tokopedia channels, consignment outlet Excel upload, and a unified multi-channel Sales Analytics view. The system already has significant foundational work in place — a GrabFood adapter module with token management and most actions is scaffolded, the `externalRevenue` table with `source` discriminator is the correct analytics hub to extend, and the GoBiz/K3Mart integrations provide proven patterns for external data sync. Only one new dependency is required: SheetJS 0.20.3 from the CDN tarball for client-side Excel parsing.

The recommended approach is additive and pattern-consistent. Every new external platform follows the established adapter module pattern in `convex/integrations/{platform}/`. All sales events from all channels flow into the existing `externalRevenue` table with a `source` literal — raw platform tables (`grabfoodOrders`, `bigsellerOrders`) are stored separately for drill-down only. BigSeller's multi-minute async sync workflow requires a scheduler-chain polling pattern (not a blocking loop) because Convex actions have a finite execution timeout. Consignment Excel files should be parsed client-side in the browser, with only validated typed JSON submitted to Convex mutations.

The primary risks are: GrabFood webhook handler returning 200 after processing (produces duplicate orders from retries); BigSeller sync being triggered while one is already running (silent data gap); incorrect sign handling of BigSeller negative fee fields (inflated profit analytics); GrabFood IDR minor-unit prices being divided by 100 (100x revenue underreporting); and SheetJS numeric coercion failing on Indonesian Rp-formatted cells (NaN propagating into revenue records). Each of these has a clear prevention strategy and must be verified before the relevant phase is considered complete.

---

## Key Findings

### Recommended Stack

The existing stack handles all v1.4 requirements without major additions. Convex `"use node"` actions support native `fetch()` with `Cookie` headers (BigSeller auth) and standard OAuth2 flows (GrabFood auth). Recharts is already installed for analytics charts. The only new dependency is SheetJS 0.20.3 installed from the CDN tarball (`npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) — the npm registry version 0.18.5 is stale and must be avoided. GrabFood has no official JS/TypeScript SDK; native `fetch` via the existing adapter is correct.

**Core technologies:**
- **SheetJS 0.20.3 (CDN tarball only):** Client-side `.xlsx` parsing for consignment upload — the only browser-compatible maintained Excel parser; named ESM imports tree-shake correctly with Vite 7.x
- **Convex `ctx.scheduler.runAfter`:** Scheduler-chain polling for BigSeller's 1–10 minute async sync workflow — required because BigSeller does not provide webhooks and Convex action timeouts preclude blocking poll loops
- **Recharts `^3.7.0` (existing):** Unified analytics charts — additive new `<Bar>` data series for GrabFood, Shopee/Tokopedia, and Consignment channels; no chart library change needed
- **`platformCredentials` table (existing):** Credential storage for all new platforms — GrabFood OAuth2 tokens and BigSeller JWT cookie follow the same storage pattern as GoBiz

**Critical install note:** Run `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Do NOT run `npm install xlsx` — the npm registry version is 2+ years stale and abandoned. Verify `package.json` shows the CDN tarball URL, not a semver string.

### Expected Features

**Must have (table stakes for v1.4 launch):**
- GrabFood OAuth2 token management with caching — calling the token endpoint per request is explicitly prohibited by GrabFood and risks credential suspension
- GrabFood outlet store status display (OPEN/CLOSED/PAUSED per outlet) and pause/unpause control — emergency kitchen tool to stop orders when stock runs out
- GrabFood order history pull and storage — managers need revenue data without logging into the GrabFood Merchant portal
- GrabFood menu item availability toggle (batch) — prevents overselling out-of-stock items on the platform
- BigSeller muc_token JWT storage with expiry warning — prerequisite for all BigSeller functionality
- BigSeller sync trigger + scheduler-chain poll until complete + daily stats and per-order data storage
- BigSeller Shopee + Tokopedia revenue visible in Sales Analytics
- Consignment Excel upload with column mapping, row preview table, and per-row validation errors
- Consignment template download (.xlsx pre-formatted)
- Unified Sales Analytics with all channels in one view (GoFood x3 existing + GrabFood + Shopee + Tokopedia + Consignment)
- Lifetime units sold counter with per-product channel breakdown

**Should have (differentiators that eliminate portal context-switching):**
- GrabFood menu sync status tracking — surface PARTIAL_FAILURE results in UI; managers confirm changes propagated
- BigSeller per-shop breakdown (Frollie-S Shopee vs Frollie-T Tokopedia) in analytics filter
- Explicit SKU-to-menuProduct mapping table with admin confirmation UI — no silent fuzzy matching
- BigSeller period-over-period comparison (growthRatio from API response — essentially free to display)
- Consignment upload history with delete (audit log with batch reversal)
- Sync health dashboard covering all channels (extend existing GoFood/K3Mart health panel)

**Defer to v1.5+:**
- GrabFood operating hours management (use GrabFood portal; rare enough that portal access is faster)
- BigSeller inventory sync to Shopee/Tokopedia (COGS is 0 in BigSeller; premature until configured)
- Automated BigSeller daily cron without manual trigger (8-minute sync + one-at-a-time constraint requires careful scheduling)
- GrabFood campaign management (requires special partner scope; use GrabFood portal)
- Full accounting integration for any channel (out of scope; export summaries for accountant)

### Architecture Approach

All four features extend a proven architecture pattern: external platforms live in `convex/integrations/{platform}/` adapter modules; all sales events converge in `externalRevenue` with a `source` discriminator; analytics queries read exclusively from `externalRevenue` using the on-demand action pattern (not reactive `useQuery` subscriptions) established in v1.3. Four new schema tables are needed (`grabfoodOrders`, `bigsellerOrders`, `bigsellerDailyStats`, `consignmentUploads`), three new `source` literals (`"grabfood"`, `"bigseller"`, `"consignment"`), and two new frontend pages (`GrabFoodManager.tsx`, `ConsignmentUpload.tsx`). The GrabFood adapter is already mostly built — the missing pieces are webhook persistence, HTTP route registration in `http.ts`, cron wiring in `crons.ts`, and the `syncOrderHistory` pull action. BigSeller is built from scratch following the GoBiz adapter pattern.

**Major components:**
1. **`integrations/grabfood/adapter.ts` (extend)** — Complete webhook persistence via `ctx.scheduler.runAfter(0, ...)`, register routes in `http.ts`, wire `autoRefreshToken` cron, add `syncOrderHistory` pull action, implement HMAC-SHA256 webhook signature validation
2. **`integrations/bigseller/` (new)** — Full adapter module: `config.ts`, `adapter.ts` with `triggerSync` → `pollSync` → `fetchSyncData` scheduler chain, `mutations.ts` for DB writes; follows GoBiz pattern exactly
3. **`consignment/` Convex module (new)** — `mutations.ts` for batch upsert with `uploadBatchId` idempotency and `deleteConsignmentBatch`, `queries.ts` for upload history
4. **`ConsignmentUpload.tsx` (new frontend page)** — ExcelDropzone, ColumnMapper, SalePreviewTable components; SheetJS parses file in browser; validated JSON submitted to Convex mutation
5. **`GrabFoodManager.tsx` (new frontend page)** — StoreStatusCard per outlet, OrderHistoryTable, pause/unpause controls
6. **`SalesAnalytics.tsx` / `OverviewTab.tsx` (extend)** — 3 new data series in Recharts stacked chart; BigSeller settings panel with JWT paste and sync trigger; updated `getRevenueTimeSeries` query via on-demand action wrapper

### Critical Pitfalls

1. **BigSeller query before sync completes (Pitfall 4)** — `listStatsData` and `pageList` return `code: -1` (empty, no data) while sync is in progress. Never treat `code: -1` as empty success. Implement the full scheduler-chain poll: trigger → pollSync every 60s (max 20 retries) → fetchData only when `taskStatus = "complete"`.

2. **GrabFood webhook returns 200 after processing (Pitfall 2)** — Any `await` before `return new Response("OK")` causes GrabFood to retry and creates duplicate orders. Pattern: parse body → return 200 immediately → `ctx.scheduler.runAfter(0, internal.grabfoodOrders.upsertOrder, order)`. The existing adapter has a TODO comment marking this exact location.

3. **GrabFood IDR minor-unit prices divided by 100 (Pitfall 10)** — IDR has `currency.exponent = 0`; no division needed. `subtotal: 25000` stores as 25000 IDR. Mismatch produces 100x revenue underreporting visible only in cross-channel comparison. Requires a unit test: `subtotal: 25000` + `exponent: 0` → stored as `25000`.

4. **BigSeller negative fee fields sign-flipped (Pitfall 11)** — `commissionFee`, `sellerShippingFee`, and `otherFee` are negative values representing costs. Profit = `platformIncome + commissionFee + sellerShippingFee + otherFee`. Never subtract them. Unit test required: `commissionFee: -5850` → profit reduced by 5850.

5. **Schema source union missing new literals in some tables (Pitfall 8)** — The `source` union appears in four separate table definitions: `externalRevenue`, `externalRevenueItems`, `externalSyncLogs`, `externalOutlets`. All four must be updated in a single schema change. `npm run type-check` catches any missed location.

6. **Consignment upload partial failure without rollback (Pitfall 14)** — Process the entire upload batch in a single Convex mutation. Generate `uploadBatchId` client-side before submitting; store on every record; check for existing batch before inserting (idempotent re-upload). `deleteConsignmentBatch(uploadBatchId)` enables reversal.

7. **GrabFood webhook without HMAC validation (Pitfall 16)** — The `// TODO: Add HMAC signature validation` comment in the existing `handleOrderWebhook` must be resolved before production webhook registration. Implement `X-Grab-Signature` HMAC-SHA256 check. ~20 lines of code; fake orders can be injected without it.

---

## Implications for Roadmap

Based on the dependency graph and architecture, a clear 5-phase structure emerges. Phases 2, 3, and 4 are independent of each other after Phase 1 completes and can be parallelized across agents.

### Phase 1: Schema Foundation

**Rationale:** Four new tables and three new `source` literals across four existing tables must be deployed before any integration code can write data. This is the hard dependency gate for all parallel work in Phases 2–4. A `npx convex deploy` is required after this phase.
**Delivers:** Updated `schema.ts` with `grabfoodOrders`, `bigsellerOrders`, `bigsellerDailyStats`, `consignmentUploads` tables; `source` union extended with `"grabfood"`, `"bigseller"`, `"consignment"` in all four affected tables; `registry.ts` PlatformId union updated; `externalRevenue` gets optional `consignmentUploadId` field
**Addresses:** Prerequisite for all v1.4 features
**Avoids:** Pitfall 8 (source union missing from some tables) — update all four tables atomically in this single phase

### Phase 2: GrabFood Integration

**Rationale:** GrabFood has the most pre-built infrastructure (adapter, token management, config) — lowest implementation friction of the three new integrations. Store control (pause/unpause) has immediate operational value enabling managers to stop incoming orders during kitchen emergencies without switching apps.
**Delivers:** Webhook persistence via scheduler (`handleOrderWebhook` → `ctx.scheduler` → `upsertOrder` → `externalRevenue`); HMAC-SHA256 webhook signature validation; HTTP route registration in `http.ts`; `autoRefreshToken` cron in `crons.ts`; `syncOrderHistory` pull action with pagination; `GrabFoodManager.tsx` page (store status per outlet, pause/unpause, menu availability toggle, order history); GrabFood channel feeding `externalRevenue` with `source: "grabfood"`
**Addresses:** GrabFood token management, order history pull, store status display, outlet pause/unpause, menu item availability toggle
**Avoids:** Pitfall 1 (token per call — use `resolveToken()` in every action); Pitfall 2 (webhook 200-first pattern); Pitfall 3 (menu change without `notifyMenuUpdate` — always call notification endpoint after menu write); Pitfall 10 (IDR minor-unit price — no division, unit test required); Pitfall 16 (HMAC validation before production webhook registration)
**Research flag:** Well-documented via official GrabFood OpenAPI SDK v1.1.3. No additional research needed.

### Phase 3: BigSeller Integration

**Rationale:** Highest technical complexity due to async sync-poll-query workflow and JWT cookie auth. Must be completed before Phase 5 (analytics) can show Shopee/Tokopedia data. The scheduler-chain pattern is the critical design baseline — implementing it incorrectly (while-loop) requires a full rewrite.
**Delivers:** `integrations/bigseller/` adapter module (config, adapter with scheduler chain, helpers, mutations); `triggerSync` → `pollSync` (60s intervals, max 20 retries before fail) → `fetchSyncData` workflow; `bigsellerDailyStats` and `bigsellerOrders` upsert with idempotency; `externalRevenue` bridge (`source: "bigseller"`); daily cron in `crons.ts` with pre-flight sync status check; BigSeller settings panel in SalesAnalytics SettingsTab (JWT paste, sync trigger, progress indicator, last-synced display)
**Addresses:** BigSeller muc_token storage and expiry warning, sync trigger and poll, daily stats, per-order data, shop-level breakdown, sync status visibility
**Avoids:** Pitfall 4 (query during sync — full scheduler-chain poll, `code: -1` is hard error not empty success); Pitfall 5 (cron collision — pre-flight check for in-progress sync before triggering); Pitfall 6 (JWT expiry — decode `exp`, store `tokenExpiresAt`, surface 3-day warning); Pitfall 7 (31-day limit — sequential chunked backfill, sequential not parallel); Pitfall 11 (negative fees — unit test required); Pitfall 12 (while-loop action timeout — scheduler chain pattern only, no `while` loops)
**Research flag:** BigSeller API is reverse-engineered from browser traffic (MEDIUM confidence). Implement with defensive error handling. Verify `taskStatus` values, `code: -1` behavior, and pagination behavior against live Frollie BigSeller account before considering production-ready. Do not skip this validation step.

### Phase 4: Consignment Upload

**Rationale:** Fully independent of GrabFood and BigSeller — no shared code paths. Simpler implementation (no async polling, no OAuth). Can be developed in parallel with Phase 3. Unblocks consignment outlet revenue tracking which is currently done manually outside the system.
**Delivers:** SheetJS installed (CDN tarball); `consignment/` Convex module (`upsertSales` mutation with `uploadBatchId` idempotency, `deleteConsignmentBatch`, `listUploads` query); `ConsignmentUpload.tsx` page (ExcelDropzone, ColumnMapper with fuzzy Indonesian header pre-fill, SalePreviewTable with per-row validation errors); template download; upload history with delete; `/consignment` route in `App.tsx`; consignment channel feeding `externalRevenue` with `source: "consignment"`
**Addresses:** Excel upload (bulk summary + transaction detail formats), outlet selector, row preview, per-row validation, duplicate period detection, upload history, template download
**Avoids:** Pitfall 13/SheetJS coercion (strip non-digit chars from Indonesian Rp-formatted cells, unit test with known `.000`-separator values); Pitfall 14 (partial batch failure — `uploadBatchId` idempotency, single-mutation batch insert); Anti-pattern of parsing Excel in a Convex mutation (parse client-side in browser, submit typed JSON only)
**Research flag:** Column mapping logic for variable-format Indonesian POS Excel exports needs validation against real outlet files before finalizing the ColumnMapper. Recommend collecting sample files from each consignment partner before Phase 4 Wave 2 frontend work begins.

### Phase 5: Unified Analytics Revamp

**Rationale:** This phase makes all new channel data visible in one place — it is the culmination of the milestone. Depends on Phases 2, 3, and 4 having schema and `externalRevenue` records in place. The chart extensions show zero values gracefully before data exists, so the frontend changes can be coded earlier, but the query extensions should wait for real data to validate against.
**Delivers:** Extended `getRevenueTimeSeries` and `getDashboardSummaryByPeriod` queries for three new sources (wrapped in on-demand action pattern); updated `sourceToPlatform()` mapping; Recharts stacked chart with 3 new data series (GrabFood green-600, Shopee orange-500, Tokopedia red-500, Consignment purple-500); PlatformFilter updated for 8+ channels (checkbox multi-select recommended over radio buttons); lifetime totals cross-channel aggregation query; per-product lifetime breakdown table; GrabFood connection status in SettingsTab; BigSeller COGS-not-configured caveat displayed whenever `costFee = 0`
**Addresses:** All-channel unified view, period presets, channel filter, lifetime totals, per-product breakdown, cross-channel strategic insight
**Avoids:** Pitfall 15 (reactive `useQuery` subscription on externalRevenue — wrap all new analytical queries in on-demand action pattern, no new `useQuery(api.externalData.*)` subscriptions for analytical data); COGS-not-configured caveat for BigSeller records surfaced explicitly

### Phase Ordering Rationale

- **Phase 1 first and alone:** Schema is the hard dependency gate. Without new tables and source literals deployed, no integration code can write or be tested against real data. Deploying schema changes before any integration code is also safer — additive schema changes require no data migration.
- **Phases 2, 3, 4 in parallel:** After schema deploys, GrabFood, BigSeller, and Consignment share no code paths. Assigning to separate agents simultaneously compresses calendar time significantly.
- **BigSeller before Consignment (if sequential):** BigSeller's scheduler chain is the most complex new pattern in the codebase. Implementing GrabFood's simpler async pattern (webhook → scheduler → upsert) first gives the team experience with Convex scheduler before tackling BigSeller's multi-phase poll.
- **Phase 5 last:** Analytics revamp reads from all new data sources. Building it last ensures query extensions are validated against real data shapes and `externalRevenue` records actually exist for new channels.

### Research Flags

Phases needing attention during implementation:

- **Phase 3 (BigSeller):** API is reverse-engineered from browser traffic (MEDIUM confidence). Verify `code: -1` error handling, `taskStatus` values, `listStatsData` vs `pageList` data shapes, and pagination behavior against live Frollie BigSeller account before finalizing the adapter. Do not treat the API reference as authoritative without live verification.
- **Phase 4 (Consignment):** Column mapping logic needs validation against actual Excel files from each consignment outlet. The header fuzzy-match list (e.g., "Tanggal" → Date, "Nama Produk" → Product Name, "Qty" → Quantity) should be tested against real outlet files — not just the pre-formatted template — before ColumnMapper is finalized.

Phases with established patterns (no additional research needed):
- **Phase 1 (Schema):** Pure Convex schema extension — additive only, no migration, fully documented pattern
- **Phase 2 (GrabFood):** Official OpenAPI SDK; existing adapter skeleton with scaffolded patterns; HIGH confidence across all endpoints
- **Phase 5 (Analytics):** Extends existing proven Recharts + on-demand action wrapper pattern from v1.3

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only one new dependency (SheetJS 0.20.3 CDN tarball). All other decisions use existing verified libraries. CDN tarball install verified against official SheetJS docs. Version compatibility with Vite 7.x and TypeScript 5.9 confirmed. |
| Features | HIGH | GrabFood features from official OpenAPI SDK v1.1.3. BigSeller features verified against live Frollie account data (19 orders, 2 shops, ~8 min sync observed). Consignment patterns carried forward from v1.3 research with known-good results. |
| Architecture | HIGH | Direct codebase inspection confirms adapter module pattern, `externalRevenue` hub, on-demand action query pattern. Build order is dependency-validated against actual file structure and schema. |
| Pitfalls | HIGH | GrabFood pitfalls from official API docs and existing TODO comments in `adapter.ts`. BigSeller pitfalls from live data verification. Convex-specific pitfalls from direct codebase inspection and CLAUDE.md documented patterns. |

**Overall confidence:** HIGH

### Gaps to Address

- **GrabFood merchant ID setup per outlet:** Research confirms 3 outlets (Crystal, Goldfinch, Tamtem) may have separate `merchantID` values and potentially separate `client_id`/`client_secret` pairs. The per-outlet credential structure must be confirmed with actual GrabFood partner portal credentials before Phase 2 implementation. If all 3 outlets share a single credential, the `platformCredentials` design simplifies considerably.
- **GrabFood grabItemID values per outlet:** Menu availability toggle requires GrabFood's internal item IDs for each product per outlet. These must be obtained from the GrabFood portal or via API product listing before the menu toggle feature can be activated. This is a setup dependency, not a code dependency.
- **Consignment outlet Excel format variability:** Column headers vary by outlet. A real file from each consignment partner is needed before finalizing ColumnMapper logic. Recommend collecting samples before Phase 4 starts.
- **BigSeller COGS is 0:** `costFee = 0` for all current Frollie orders because COGS is not configured in BigSeller. Profit margin analytics are meaningless until COGS is entered. Surface this caveat prominently — this is a data quality gap that persists after v1.4 unless the business configures COGS in BigSeller separately.
- **BigSeller `pageList` pagination at scale:** Current Frollie data is small (19 orders observed during research). The pagination loop (`pageNo < totalPage`) is designed but not yet stress-tested with larger volumes. Monitor on first full production sync and verify the loop terminates correctly.

---

## Sources

### Primary (HIGH confidence)
- `docs/GRABFOOD_API.md` — GrabFood Partner API OpenAPI v1.1.3, SDK v1.0.2; OAuth2 flow, order endpoints, menu batch API, webhook HMAC requirements
- `convex/integrations/grabfood/adapter.ts` — existing GrabFood module skeleton; all existing actions verified
- `convex/integrations/gobiz/adapter.ts` — canonical multi-phase sync pattern; BigSeller adapter follows this model
- `convex/schema.ts` — current 59-table schema; source union definitions across all four affected tables confirmed by direct inspection
- `convex/externalData/actions.ts` and `queries.ts` — on-demand action pattern for analytics queries; `sourceToPlatform()` mapping
- `src/pages/SalesAnalytics.tsx` — existing analytics page structure, Recharts usage, PLATFORM_COLORS, PlatformFilter type
- SheetJS official docs: `https://docs.sheetjs.com/docs/getting-started/installation/frameworks/` — CDN tarball installation verified for Vite and React
- Convex official docs: `https://docs.convex.dev/scheduling/cron-jobs` and `https://docs.convex.dev/functions/actions` — scheduler chain pattern for long-running async work

### Secondary (MEDIUM confidence)
- `docs/BIGSELLER_PROFIT_API.md` — BigSeller API reverse-engineered from browser network traffic; behavior verified against live Frollie data 2026-02-25; no official API documentation exists
- `convex/integrations/registry.ts` — platform registry; current `PlatformId` union confirmed
- Previous v1.3 FEATURES.md and PITFALLS.md (2026-02-22) — consignment upload UX patterns and SheetJS pitfalls carried forward

### Tertiary (context)
- `docs/LESSONS_LEARNED.md` — production outage patterns (Vite TDZ crash, import discipline)
- `.planning/PROJECT.md` — out-of-scope declarations, technical debt acknowledgments (ingredient simulation name-matching fragility)
- `CLAUDE.md` — Pitfall #8 (no dynamic imports in Convex actions); project-wide conventions and file path map

---
*Research completed: 2026-02-25*
*Ready for roadmap: yes*

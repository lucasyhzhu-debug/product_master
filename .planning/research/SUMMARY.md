# Project Research Summary

**Project:** Frollie Recipe Master v1.1 Stabilization & QoL
**Domain:** FMCG snack production management system with external platform integrations (K3Mart consignment, GoFood delivery)
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

This is a stabilization and quality-of-life milestone building on top of an already-complete v1.0 infrastructure. The existing codebase already has robust API integration architecture (platformCredentials, externalData, adapters, token refresh), kitchen production tracking, K3Mart cockpit foundations, and GoBiz revenue sync. **v1.1 is primarily a feature-build milestone, not a stack-change milestone.** Almost nothing new needs to be added to the tech stack -- only one npm dependency (`date-fns` for centralized date handling).

The research reveals that v1.0's infrastructure was exceptionally well-architected. Multi-platform revenue tracking with deduplication, token auto-refresh patterns, weekly dispatch planning tables, BOM-driven production targets, and real-time sync are all proven and production-ready. v1.1's work is about **using this infrastructure better** through UX improvements (order form layout, kitchen due-date ranking, day-name quick-tap) and **scaling it** (adding Crystal outlet to GoBiz, holiday-aware K3Mart planning, audit trails).

The key risk is **breaking existing patterns while extending them**. Six critical pitfalls identified: (1) GoBiz token failures going unnoticed for days due to lack of sync health monitoring, (2) Convex action timeouts during large catch-up syncs, (3) deploying order form changes during business hours breaking staff workflows, (4) WIB timezone bugs at day boundaries from fragmented date logic, (5) treating K3Mart cockpit "stubs" as greenfield when they already have production data, and (6) revenue double-counting from dedup key collisions during multi-outlet expansion. All are preventable through design-before-implementation in Phase 2 and backward-compatible schema changes.

## Key Findings

### Recommended Stack

**Almost nothing new required.** The v1.0 stack (Convex ^1.31.7, React 19, TypeScript 5.9, Vite 7, Tailwind 4, Radix UI, framer-motion, dnd-kit, sonner, lucide-react) handles 90% of v1.1 needs. GoBiz integration (adapter, token refresh, cron sync) already exists. K3Mart auto-refresh already works. The `"use node"` actions architecture, `platformCredentials` storage, and `externalRevenue`/`externalSyncLogs` tables are production-proven.

**Core technologies (already installed):**
- **Convex ^1.31.7** — Backend actions for API calls, crons for auto-sync, mutations for data storage. Multi-platform integration pattern is working.
- **React 19 + TypeScript 5.9** — UI layer with shadcn/ui primitives and framer-motion. No changes needed.
- **Vite ^7.2.4** — Build tooling. Current.

**Single new dependency required:**
- **date-fns ^4.1.0** — ISO week calculations (`getISOWeek`, `startOfISOWeek`), day-name formatting (`format(date, 'EEEE')`), and date arithmetic (`differenceInCalendarDays`, `addDays`). Needed for kitchen due-date ranking and K3Mart weekly planner. Tree-shakeable (only pay for imported functions, ~5KB bundle impact). Replaces fragmented manual date math scattered across codebase.

**What NOT to add:**
- Holiday APIs (`date-holidays`, `holidayapi.com`) — Indonesian holidays change once per year. Static JSON array in `convex/lib/holidays.ts` updated annually is simpler, faster, and more reliable than external API dependency.
- `axios` — Native `fetch()` already used throughout adapters.
- Calendar UI libraries (`react-big-calendar`, `FullCalendar`) — K3Mart weekly planner is a focused 7-day grid, not a generic calendar. Custom component is simpler.

### Expected Features

**Must have (table stakes):**
- **API credential status visibility** — Staff currently blind to K3Mart/GoBiz token health. `platformCredentials` table already stores status; just needs dashboard UI.
- **Customer info at top of order form** — Order staff identify customer first, then select products. Current layout reverses this workflow. Pure frontend reorder.
- **Due date display on kitchen orders** — Kitchen produces FIFO by order-received instead of by due date. The `dueDate` field and `by_kitchen_visible` index already exist. Just needs sorting + UI.
- **Due date ranking in kitchen** — Core prioritization mechanism. Query already uses compound index `["isKitchenVisible", "dueDate"]` that supports ordered retrieval.
- **K3Mart outlet stock visibility** — Manager needs stock across 8 outlets at a glance. `getOutletStockSummary` query exists; cockpit UI stubs need completion.
- **GoFood transaction data storage** — Revenue data must include item-level detail. `externalRevenue` + `externalRevenueItems` tables exist; GoBiz adapter syncs journals but needs to enrich with order details API.

**Should have (competitive advantage):**
- **Day-name quick-tap for due dates** — "Tomorrow", "Saturday", "Monday" pill buttons replace tiny native date picker. Mobile-first UX. Frontend-only, uses `date-fns` for day names.
- **K3Mart weekly dispatch with holiday awareness** — 25+ Indonesian holidays/year including cuti bersama. Dispatch must account for outlet closures and pre-holiday stocking. Static holiday array, not API.
- **GoFood multi-outlet sync (Crystal outlet)** — Two merchants (`G293156297` Goldfinch, `G347061572` Crystal). GoBiz API supports merchant array in journal search. Architecture already multi-outlet ready.
- **Audit trail on order status updates** — Track WHO moved order to which status and WHEN. Requires `statusHistory` array on orders schema or separate transition table.
- **Discounted total on order cards** — Order list shows gross total; staff misjudge revenue. Voucher discount already calculated, just needs display.

**Defer (v2+):**
- **Full GoFood POS integration** — Requires Facilitator Model partnership, webhook infrastructure, real-time SLA. Massive scope for 2 outlets. Sync transaction data for reporting only.
- **Automated K3Mart stock reorder** — K3Mart API requires human approval. Auto-submit risks over/under stocking. Keep suggestion + human confirmation pattern.
- **Production targets linked to specific orders** — Complex aggregation joining orders -> orderItems -> menuProductComponents -> componentTypes. High value but high complexity. v1.1.x enhancement after MVP validation.

### Architecture Approach

The existing Convex serverless architecture is battle-tested. All external API calls run in `action` functions with `"use node"` directive. Mutations handle DB writes called via `ctx.runMutation()` from actions. Queries are pure reactive reads. Token refresh uses a cascade pattern (K3Mart already proven with 12h cron). Deduplication via `externalTransactionId` prevents double-counting on re-sync. Multi-platform revenue aggregation already supports source-scoped outlets.

**Major components:**
1. **platformCredentials** — Unified token storage for all platforms (K3Mart, GoBiz). Already stores email/password (K3Mart), tokens, expiry, refresh status. Extend with GoBiz password-grant credentials.
2. **integrations/gobiz/adapter.ts** — GoBiz API calls with 3-method token refresh cascade (cookie, rotate, API). Add 4th method: password grant (`POST /goid/token` with email/password). Already handles journal sync, order detail fetch, fetchWithAuth with 401 retry.
3. **integrations/k3mart/adapter.ts** — K3Mart API calls with credential-based auto-auth. 12h cron refresh working in production. Weekly dispatch planning helpers (`getWeekNumber`, `calculateSuggestedQty`) exist.
4. **externalData/** — Multi-platform revenue storage. `externalRevenue` (per-transaction), `externalRevenueItems` (per-item, auto-matched to menuProducts), `externalSyncLogs` (dedup + health tracking). Schema already supports multi-outlet with `outletId`.
5. **k3martCockpit/** — Weekly dispatch planning, outlet stock summary, production readiness queries. Tables (`k3martDispatchPlans`, `k3martStockMovements`, `restockTargets`) and queries exist. Stubs need completion.
6. **Kitchen queries (orders/queries.ts)** — Kitchen view with `by_kitchen_visible` index. Compound index `["isKitchenVisible", "dueDate"]` supports ordered retrieval. Post-fetch sort currently used; switch to index-based ordering.

**Key patterns to follow:**
- **Action-Mutation Separation** — External HTTP in actions (`"use node"`), DB writes in mutations. Already proven with GoBiz/K3Mart adapters.
- **Token Resolution Cascade** — Try DB token first, fall back to env var, attempt refresh on 401. Existing K3Mart and GoBiz patterns.
- **Dedup Key for Idempotent Sync** — Every external record gets deterministic `externalTransactionId`. `by_source_txn` index prevents duplicates. GoBiz uses `orderNumber|txnTimeMs`, K3Mart uses `date|outlet|product|qty`.

### Critical Pitfalls

1. **GoBiz token cascade silently fails, cron syncs stop for days unnoticed** — All 3 refresh methods (cookie, rotate, API) rely on refresh token that expires after 9 months of inactivity. When it fails, cron logs "no_token" but no alerting. Revenue data silently stops syncing. **Prevention:** Add `syncHealth` query checking `externalSyncLogs` for last successful GoBiz sync. Yellow warning banner on dashboard if >6h stale. Track consecutive failures in `platformCredentials` and mark credential as `status: "stale"` after 3 failures.

2. **Convex action timeout (10 min) hit during large GoBiz sync** — Current `syncGoBizRevenue` processes days sequentially: fetch journals (paginated) + save transactions + fetch order details (200ms rate-limit per order). With `daysBack=30` during catch-up, easily exceeds 10 min. Action killed mid-execution, leaving partial data and `status: "started"` sync log forever. **Prevention:** Split into two chained actions (`syncJournals` Phase A, `syncOrderDetails` Phase B). Limit cron runs to `daysBack=3`. For catch-up, use `ctx.scheduler.runAfter` to process one day per invocation.

3. **Modifying active order form breaks kitchen staff mid-shift** — Order creation form changes (customer info to top, dates to RHS, hiding creation date) alter muscle memory. Convex real-time updates mean instant deployment to all connected clients. Staff with orders in-progress get new layout mid-task, leading to missed fields or abandoned orders. **Prevention:** Deploy UI changes during off-hours (after 8 PM WIB). Feature flag the new layout with localStorage toggle for 1-week rollback option. Test with one staff member before full rollout.

4. **WIB timezone bugs at day boundaries corrupt date-dependent features** — Codebase has multiple independent WIB conversion implementations: `wibDateToUtcRange()`, `getTodayJakarta()`, manual `+7 hours`, `Date.UTC(..., -7, ...)`, `toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })`. Each handles edge cases differently. `getWeekNumber()` uses `new Date(date + "T00:00:00+07:00")` but `getProductionReadiness` uses `new Date(args.date + "T12:00:00Z")` — different dates at certain times. Kitchen targets show wrong day, dispatch plans land in wrong week. **Prevention:** Centralize ALL WIB logic into single `convex/lib/wibDate.ts` utility (`nowWib()`, `toWibDateString()`, `wibDateToUtcRange()`, `getWibWeekNumber()`, `isWibWeekend()`). Convention: all dates stored as UTC epoch milliseconds or `YYYY-MM-DD` strings representing WIB dates. Test at boundary times (23:30 WIB, 00:30 WIB).

5. **K3Mart cockpit "stubs to real" transition breaks existing data** — Weekly planning has real production data in `k3martDispatchPlans`, `k3martStockMovements`, `restockTargets`. Plans already use `weekNumber: "2026-W07"` from `getWeekNumber()`. If implementation changes week numbering, date format, or adds required fields, existing data becomes orphaned or invalid. **Prevention:** NEVER change `getWeekNumber()` algorithm (already correct ISO week + WIB timezone). New fields must be optional. Holiday calendar should be separate `holidays` table, not inline on dispatch plans. Snapshot data with `npx convex export` before any cockpit work.

6. **Multi-outlet revenue aggregation double-counts on re-sync** — GoBiz dedup key is `orderNumber + transactionTimeMs`. K3Mart dedup key is `transDate + outletName + productCode + qty + total`. If external API returns slightly different data on re-sync (timestamp shifted 1ms, product name changed), dedup key changes and duplicate record created. **Prevention:** Use stable identifiers. GoBiz: use `orderNumber` alone (unique per merchant). K3Mart: drop `total` from dedup key (price may be corrected). When adding Crystal outlet, include `merchantId` in dedup key to prevent cross-merchant collisions.

## Implications for Roadmap

Based on research, suggested 5-phase structure with design-first approach:

### Phase 1: API Audit & Auth Architecture Design (DESIGN DOC)
**Rationale:** All pitfalls trace back to fragmented auth patterns and missing observability. Design before implementation prevents rework. GoBiz password grant integration, multi-merchant config, internal order revenue sync, and sync health monitoring all need architectural decisions before coding.

**Delivers:** Design document covering (1) GoBiz password-grant token refresh cascade, (2) multi-merchant configuration strategy (config vs DB-stored), (3) internal order -> externalRevenue sync approach, (4) sync health monitoring UX, (5) centralized WIB date utility API, (6) dedup key standardization across platforms.

**Addresses Features:** API credential status visibility (design monitoring UX), GoFood multi-outlet sync (design multi-merchant config), audit trail (design status transition storage).

**Avoids Pitfalls:** Pitfall 1 (silent token failures — design health checks), Pitfall 4 (WIB timezone bugs — design date utility), Pitfall 6 (double-counting — standardize dedup keys).

**Research Flag:** SKIP RESEARCH-PHASE. This is an internal system with complete codebase access. All API docs available in `docs/apiS/`. Focus on design synthesis, not external research.

### Phase 2: Order QoL Fixes Batch (INDEPENDENT, LOW RISK)
**Rationale:** Pure frontend layout changes, no schema changes, no external API dependencies. Can run in parallel with Phase 1 design work. Highest user value (daily pain points) with lowest technical risk. Backward-compatible.

**Delivers:** (1) Customer info section moved to top of order form, (2) due date input with day-name quick-tap (7-day pill buttons + fallback calendar), (3) hide order creation date field (auto-set to now), (4) discounted total display on order cards (voucher amount shown), (5) audit trail schema addition (`statusHistory` array on orders, optional).

**Addresses Features:** Customer info at top (table stakes), day-name quick-tap (differentiator), discounted total on cards (differentiator), audit trail (differentiator).

**Uses Stack:** `date-fns` for day-name formatting (`format(date, 'EEEE')`), existing React form components, shadcn/ui primitives.

**Avoids Pitfalls:** Pitfall 3 (breaking staff workflow — deploy after 8 PM WIB, feature flag for 1 week, test with one staff first).

**Research Flag:** SKIP RESEARCH-PHASE. Standard UI/UX patterns on existing tech stack.

### Phase 3: Kitchen Due-Date Ranking & Mobile UX Overhaul
**Rationale:** Kitchen is the production bottleneck. Due date ranking is the core prioritization mechanism. Currently producing in wrong order (FIFO by creation instead of by due date). Query optimization uses existing compound index `["isKitchenVisible", "dueDate"]` — no schema change needed. Mobile UX improvements (48px tap targets, day-name display) reduce wet-hand mis-taps.

**Delivers:** (1) Kitchen query sort by due date (use index ordering, not post-fetch sort), (2) day-name + date display on all kitchen order cards (large, color-coded by urgency), (3) group headers by due date ("DUE TODAY", "DUE TOMORROW", etc.), (4) minimum 48px tap targets for all kitchen buttons/cards, (5) manager override for inventory "brochure unavailable" bug (with reason logging).

**Addresses Features:** Due date display in kitchen (table stakes), due date ranking (table stakes), manager override for inventory (table stakes).

**Uses Stack:** `date-fns` for day-name display and relative date logic (`differenceInCalendarDays`, `format`), existing `by_kitchen_visible` compound index.

**Implements Architecture:** Kitchen queries optimization (switch from post-fetch sort to index-based ordering).

**Avoids Pitfalls:** Pitfall 4 (WIB timezone bugs — use centralized `wibDate.ts` from Phase 1 design for all date display logic). Display absolute WIB dates ("Sat, Feb 15"), never relative ("tomorrow") which is timezone-ambiguous.

**Research Flag:** SKIP RESEARCH-PHASE. Query optimization pattern is well-documented Convex practice. UX improvements are domain-specific based on kitchen staff feedback.

### Phase 4: K3Mart Cockpit Weekly Planning Completion
**Rationale:** K3Mart cockpit has working stubs (K3MART-01 through K3MART-06 TODOs) and production data in backend tables. Weekly dispatch planning, outlet stock summary, manual stock in/out are all partially implemented. Holiday awareness adds dispatch planning intelligence (zero targets on holidays, increased targets pre-holiday).

**Delivers:** (1) Complete weekly dispatch planner UI (7-day grid, product rows, outlet tabs, suggested quantities pre-filled), (2) holiday calendar table (`holidays`) with CRUD + seeding for Indonesian 2026 holidays, (3) holiday-aware suggested quantity calculation (weekend target on holidays, zero on closures, +50% day before holidays), (4) visual holiday/weekend markers on weekly grid, (5) manual stock in/out quick-entry UI (outlet selector, product selector, quantity, direction, source/destination tracking).

**Addresses Features:** K3Mart cockpit completion (table stakes), weekly dispatch with holiday awareness (differentiator), manual stock in/out (table stakes).

**Uses Stack:** `date-fns` for ISO week calculations (`getISOWeek`, `startOfISOWeek`, `endOfISOWeek`, `eachDayOfInterval`), static Indonesian holiday JSON array (no external API).

**Implements Architecture:** Holiday calendar table (new schema), holiday-aware target calculation in `k3martCockpit/helpers.ts`, query enhancement to incorporate holidays.

**Avoids Pitfalls:** Pitfall 5 (breaking existing data — NEVER change `getWeekNumber()`, new fields optional, export data before changes, holiday table separate not inline on dispatch plans). Pitfall 4 (timezone bugs — use centralized `wibDate.ts` for all week calculations).

**Research Flag:** SKIP RESEARCH-PHASE. Weekly planning is UI work on existing backend. Holiday data is static JSON (government-announced, stable for the year).

### Phase 5: API Integrations (Multi-Outlet, Token Hardening, Unified Reporting)
**Rationale:** Depends on Phase 1 design decisions (multi-merchant config, password-grant implementation, dedup key standardization). This phase scales existing integrations: add Crystal outlet to GoBiz, harden token refresh with password grant, sync internal orders to externalRevenue for unified reporting.

**Delivers:** (1) GoBiz password-grant token refresh (4th cascade method using email/password from `platformCredentials`), (2) multi-merchant GoBiz config (array of `{ id, name, outletLabel }`, journal search with merchant array), (3) GoBiz Crystal outlet added (`G347061572`), dedup key includes `merchantId`, product mapping entries created, (4) internal order -> externalRevenue sync (virtual adapter that queries confirmed orders, creates `externalRevenue` with `source: "internal"`), (5) GoBiz/K3Mart token auto-refresh cron hardening (GoBiz every 4h as safety net, on-demand via fetchWithAuth), (6) sync health dashboard (unified API status page showing all platforms: token health, last sync, error counts, quick re-sync actions).

**Addresses Features:** GoFood Crystal outlet (differentiator), API credential status dashboard (table stakes), auto-refresh for all platforms (table stakes), unified sales reporting across channels (differentiator).

**Uses Stack:** Existing Convex actions (`"use node"`), `platformCredentials` table, GoBiz/K3Mart adapters (extend, not rewrite), `externalData` mutations.

**Implements Architecture:** Multi-merchant config (extend `gobiz/config.ts`), password-grant cascade (add to `gobiz/adapter.ts`), internal order adapter (create `integrations/internal/adapter.ts`), sync health query (new `platformCredentials/queries.ts::getAllPlatformStatuses`).

**Avoids Pitfalls:** Pitfall 1 (silent token failures — sync health dashboard with staleness warnings implemented), Pitfall 2 (action timeout — split sync into chained actions, limit `daysBack=3` for cron), Pitfall 6 (double-counting — dedup key includes merchantId, stable identifiers only).

**Research Flag:** SKIP RESEARCH-PHASE. API endpoints documented in `docs/apiS/`, patterns proven in existing adapters, extend not rewrite.

### Phase Ordering Rationale

- **Phase 1 (API Audit) before Phase 5 (API Integrations):** Design before implementation. Multi-merchant config strategy, dedup key standardization, password-grant cascade design, and sync health monitoring UX must be documented before coding. Prevents rework and ensures backward compatibility.
- **Phase 2 (Order QoL) is independent:** Pure frontend layout changes. No schema changes, no API dependencies. Can parallelize with Phase 1 design work. Delivers immediate user value (daily pain points).
- **Phase 3 (Kitchen) uses Phase 1 design outputs:** Due-date display logic depends on centralized `wibDate.ts` utility designed in Phase 1. Can overlap with Phase 4 (different domains).
- **Phase 4 (K3Mart Cockpit) and Phase 3 (Kitchen) are independent:** Kitchen queries vs K3Mart dispatch planning touch completely different files. Can parallelize after Phase 1 design completes.
- **Phase 5 (API Integrations) comes last:** Builds on all prior work. Uses centralized date utility from Phase 1, avoids timezone bugs discovered in Phases 3-4, benefits from sync health monitoring designed in Phase 1.

### Research Flags

**Phases likely needing deeper research during planning:**
- **None.** All 5 phases work within existing tech stack on existing infrastructure. Codebase access is complete. API documentation captured in `docs/apiS/`. Holiday data is static (government-announced). Patterns proven in v1.0.

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** Internal design synthesis. No external research needed.
- **Phase 2:** Standard UI/UX layout changes on React + shadcn/ui.
- **Phase 3:** Query optimization (Convex compound index usage) is well-documented pattern.
- **Phase 4:** UI work on existing backend, static holiday data.
- **Phase 5:** Extend existing adapters, proven action-mutation separation pattern.

**All phases should use `/gsd:plan-phase` directly, skipping `/gsd:research-phase`.**

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 1 new dependency (`date-fns`). All other needs met by existing v1.0 stack. Verified in codebase (`package.json`, adapter implementations). |
| Features | HIGH | Derived from direct codebase analysis, existing user feedback captured in milestone draft, and API documentation in `docs/apiS/`. Table stakes features have existing partial implementations. |
| Architecture | HIGH | Existing patterns proven in production (K3Mart 12h cron, GoBiz 7x daily sync, multi-platform revenue aggregation). Direct code review of `integrations/gobiz/adapter.ts`, `integrations/k3mart/adapter.ts`, `externalData/mutations.ts`, `k3martCockpit/queries.ts`. |
| Pitfalls | HIGH | Identified through code review (fragmented date logic, missing health checks, hardcoded config), Convex documentation (action timeout limits), and API documentation (GoBiz token expiry behavior). All preventable through design-first approach. |

**Overall confidence:** HIGH

### Gaps to Address

**Minor gaps (validate during planning, not blockers):**

- **GoBiz password-grant token API expiry behavior:** Reference doc shows token response format but not documented access token TTL. Existing 3-method cascade has 1-hour assumption. Validate actual TTL during Phase 5 implementation by logging token creation time and first 401 occurrence.

- **K3Mart stock-flow API per-outlet submission constraints:** Current code submits sequentially to avoid conflicts. Unclear if API supports batch submission for multiple outlets. Phase 4 should test concurrent submission vs sequential to optimize dispatch confirmation speed.

- **Indonesian holiday dates for 2027+:** Phase 4 will hardcode 2026 holidays. Government typically announces next year's holidays in September. Add a reminder in Phase 4 changelog to update holiday data annually, or create an admin UI for holiday CRUD to future-proof.

- **Inventory "brochure unavailable" root cause:** Manager override (Phase 3) is a workaround. True fix requires understanding why inventory batch quantities show zero when physical stock exists. Phase 3 should log override reasons to identify if this is a sync issue, batch FIFO logic bug, or data entry error.

**All gaps are low-risk and can be resolved during phase planning or execution.**

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:**
  - `convex/integrations/gobiz/adapter.ts` — 3-method token refresh, fetchWithAuth, journal/order sync
  - `convex/integrations/k3mart/adapter.ts` — K3Mart credential-based auth, stock sync, 12h cron
  - `convex/platformCredentials/` — Token storage, auto-refresh actions, credential CRUD
  - `convex/k3martCockpit/` — Weekly dispatch queries, helpers (`getWeekNumber`, `calculateSuggestedQty`)
  - `convex/externalData/` — Multi-platform revenue storage with dedup, sync logs
  - `convex/schema.ts` — 37 tables including externalRevenue, externalRevenueItems, externalSyncLogs
  - `convex/crons.ts` — K3Mart 12h refresh, GoBiz 7x daily revenue sync
  - `src/components/orders/OrderFormPOS.tsx` — Current order creation layout
  - `src/components/kitchen/` — Kitchen panels (PackingPanel, ProductionLog)
  - `package.json` — Stack versions verified
- **API documentation:**
  - `docs/apiS/gojek search transactions documentation.txt` — GoBiz token grant endpoint, journal search, order search, merchant IDs
- **Official documentation:**
  - [Convex Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs) — Scheduling patterns
  - [Convex Limits](https://docs.convex.dev/production/state/limits) — 10-min action timeout, 1s query timeout
  - [date-fns npm](https://www.npmjs.com/package/date-fns) — v4.1.0 API reference

### Secondary (MEDIUM confidence)
- [Indonesia Public Holidays 2026](https://www.eskimo.travel/en/blog/indonesia-public-holidays) — 17 national holidays + 8 cuti bersama
- [Holiday API Indonesia](https://holidayapi.com/countries/id/2026) — Programmatic holiday data (referenced for validation, not recommended for use)
- [Date Picker UX Best Practices - NN/g](https://www.nngroup.com/articles/date-input/) — Quick-select pattern validation
- [OAuth Token Refresh Patterns](https://oneuptime.com/blog/post/2026-01-24-oauth2-token-refresh/view) — Auto-refresh strategy comparison

### Tertiary (LOW confidence, needs validation)
- **GoBiz token expiry:** 1 hour access token, 9-month refresh session (inferred from reference doc + cron frequency). Official GoBiz developer portal may have different specs (merchant API vs Facilitator API).

---
*Research completed: 2026-02-15*
*Ready for roadmap: yes*

# Milestones
## v1.6 Tech Debt & Resilience (Shipped: 2026-03-09)

**Phases completed:** 6 phases (35-40), 16 plans
**Timeline:** 7 days (2026-03-03 to 2026-03-09)
**Commits:** 112 | **Codebase:** ~131,764 lines TypeScript (65 Convex tables)
**Requirements:** 20/20 satisfied | **Tests:** 690 passing (+6 depot auto-seed tests)

**Key accomplishments:**
1. Schema audit: 42 findings across 65 tables — 20 unused indexes removed, 5 compound indexes added, 10 range bound anti-pattern fixes, critical session cleanup query fixed
2. Backend helper extraction: 5 major files reduced from 6,348 to 4,358 LOC (-31.3%) via pure function extraction — shared confidence, WIB timezone, and sourceToPlatform helpers
3. Frontend giant file splits: 4 components reduced from 5,518 to 1,450 LOC (-74%) via sub-component extraction — shared `dateUtils.ts` for WIB timezone
4. E2E test foundation: 3 Playwright tests for critical paths (order lifecycle, kitchen production, sales analytics) with ~798 LOC
5. Tamtem depot auto-seed: silent failures eliminated — `depotAutoSeed.ts` auto-creates depot location on first GoFood sale (154 LOC + 407 LOC tests)
6. Verification gap closure: retroactive VERIFICATION.md for 3 phases, all 20 requirements 3-source verified (VERIFICATION + SUMMARY + ROADMAP)

**Delivered:** Comprehensive tech debt reduction — schema audit with index cleanup, backend and frontend file splits reducing total LOC in 9 target files by ~46%, E2E test infrastructure for 3 critical paths, and Tamtem depot resilience fix. Pure refactoring milestone: no new feature tables, no API path changes, no schema additions.

---

## v1.5 Financial Statements (Shipped: 2026-03-03)

**Phases completed:** 3 phases (32-34), 9 plans
**Timeline:** 2 days (2026-03-02 to 2026-03-03)
**Commits:** 52 | **Codebase:** ~130,008 lines TypeScript (59 Convex tables)
**Requirements:** 14/14 satisfied | **Tests:** 684 passing (22 income statement-specific)

**Key accomplishments:**
1. Weekly income statement query (`getWeeklyIncomeStatement`) with real-time per-channel Revenue -> Deductions -> COGS -> Gross Profit aggregation across 7 channels
2. Full BOM COGS resolution (production + packaging) via `buildProductCOGSMap` in-memory map preloading — follows `getLifetimeTotalsInternal` pattern
3. Confidence classification on every financial figure (exact/calculated/inferred/missing) with channel-level worst-confidence propagation
4. `/financials` page with week navigation (WIB Monday-start), expandable channel rows, comparison deltas, and data quality panel
5. Flat-format CSV export with formula injection sanitization and per-channel deduction breakdown
6. Sentinel-value dual-path test strategy proving consignment reads from `consignmentSettlements`, not `externalRevenue`

**Delivered:** Added a weekly income statement feature that aggregates revenue from all 8 sales channels, computes full BOM-resolved COGS (production + packaging), and presents a P&L view with data quality transparency. No schema changes — purely read-only feature built on existing v1.4 data infrastructure.

**Design decisions documented in:** `docs/plans/2026-03-01-income-statement-design.md`

---

## v1.4 Sales & Channel Integration (Shipped: 2026-03-01)

**Phases completed:** 9 phases (26-31 including 27.1, 27.2, 29.1), 20 plans
**Timeline:** 5 days (2026-02-25 to 2026-03-01)
**Commits:** 211 | **Files changed:** 242 | **Lines:** +43,799 / -4,990
**Codebase:** ~124,946 lines TypeScript (59 Convex tables)
**Requirements:** 22/22 satisfied | **Audit:** PASSED (tech debt addressed by Phase 31)

**Key accomplishments:**
1. Multi-platform auth: one-click GoBiz password grant refresh, BigSeller paste-once JWT with 30-day auto-refresh and expiry countdown, GrabFood on-demand OAuth2 token resolve — all in unified credential health panel
2. GrabFood POS integration: order history sync, store pause/unpause per outlet, menu availability toggle, 6 HMAC-validated webhook endpoints, standalone menu simulator with push-to-GrabFood and photo upload
3. BigSeller marketplace integration: scheduler-chain sync (Shopee + Tokopedia), per-order data with full fee breakdown and SKU lists, admin SKU-to-menuProduct mapping with retroactive reconciliation
4. Consignment settlements: outlet CRUD with configurable rev share %, settlement entry with auto-calculated payments, payment tracking with status badges, per-outlet running totals, event outlet auto-archive
5. Unified Sales Analytics: 8-channel stacked bar chart with dynamic discovery, per-consignment-outlet segments, lifetime units sold with per-product breakdown, multi-select channel filter (legend-as-filter pattern)
6. Quality: test suite repaired (56→0 failures), ExternalSource type guard replacing `as any` casts, contract test for schema/array sync, dead code removed, pause duration map corrected

**Delivered:** Unified all sales channels (GrabFood, Shopee, Tokopedia, Consignment, GoFood, K3Mart, Direct) into one real-time analytics view with per-channel API integrations, one-click platform auth, and manual-trigger syncs. Revenue flows from all 8 sources through `externalRevenue` bridge to unified Sales Analytics.

**External blockers (documented, not code defects):**
- GrabFood `orders:read` OAuth2 scope not yet granted — sync infrastructure works, returns descriptive 401
- Crystal and Tamtem GrabFood merchantIDs pending — only GFSBPOS-254-353 confirmed
- BigSeller COGS = 0 for all Frollie orders — profit analytics meaningless until configured in BigSeller

---


## v1.0 Concerns Cleanup & Refactor (Shipped: 2026-02-15)

**Phases completed:** 11 phases, 36 plans
**Timeline:** 3 days (2026-02-13 to 2026-02-15)
**Codebase:** 92,416 lines TypeScript

**Key accomplishments:**
1. Comprehensive test safety net for ball distribution, FIFO inventory, order lifecycle, and voucher handling
2. Security hardened: env files removed from VCS, git history scrubbed, credentials rotated, security patterns documented
3. BOM migration complete: all ball composition data flows through unified BOM as single source of truth; deprecated fields removed from schema
4. Performance optimized: N+1 queries eliminated, cursor pagination added, kitchen queries indexed with denormalized isKitchenVisible, COGS cached with eager invalidation
5. Schema tightened: 215 optional fields audited, 13 fields made required, 5 deprecated fields removed, 55 denormalization annotations added
6. UI brand unified: teal brand accent, Inter typography, dark mode, skeleton screens, mobile nav across all 19 pages
7. Frontend factories: EntityManager generic CRUD component + createMutationHook factory reduced boilerplate across 5+ entity pages
8. Production counts consolidated: productionLog is single source of truth, productionCounts archived (read-only), weekly integrity checks automated

**Delivered:** Systematic resolution of 41 concerns across 11 categories (tech debt, bugs, security, performance, testing, BOM migration, schema cleanup, UI brand, frontend factories, and infrastructure). Build passes, no regressions.

---


## v1.1 Stabilization & QoL (Shipped: 2026-02-16)

**Phases completed:** 6 phases (12-16, including 14.1 inserted), 27 plans, 49 tasks
**Timeline:** 2 days (2026-02-15 to 2026-02-16)
**Execution time:** ~3.3 hours (197 minutes across 27 plans)
**Commits:** 133 | **Files changed:** 129 | **Lines:** +12,127 / -4,615 (net +7,512)
**Requirements:** 29/29 satisfied | **Audit:** PASSED (all integration paths verified)

**Key accomplishments:**
1. Multi-platform API integration with auto-auth — GoBiz token auto-refresh cron, Crystal+Goldfinch dual-outlet sync, sync health monitoring, unified product mapping
2. Order management Kanban overhaul — 12+ statuses simplified to 7, horizontal-scroll Kanban board, dedicated creation page, audit trail on every status change
3. Draft order lifecycle — Persistent drafts with auto-save, edit-from-Kanban, incremental updates preserving vouchers
4. Kitchen dashboard with production targets — 4-stat sticky header, due-date grouped orders with checklists, K3Mart synthetic demand cards, manager inventory override
5. K3Mart cockpit completion — Outlet-first weekly planner with auto-suggest, holiday awareness, stock rotation shortcuts, dispatch-to-kitchen pipeline
6. Sales analytics command center — Recharts integration, platform-colored stacked charts, daily/weekly/monthly granularity with drill-down

**Delivered:** Stabilized production workflows with external API auto-auth (GoBiz/GoFood), overhauled order management to Kanban with 7-status model, added kitchen production targets with due-date grouping and K3Mart demand integration, and completed the K3Mart cockpit with outlet-first weekly planning and dispatch-to-kitchen pipeline. Build passes, 29/29 requirements satisfied, zero critical gaps.

**Dropped:** Phase 16.1 (GoBiz OpenAPI Audit) — GoBiz stopped issuing new OAuth2 client credentials; current unofficial integration maintained.

---


## v1.2 Unified Planning & Revenue (Shipped: 2026-02-21)

**Phases completed:** 3 phases (17, 17.1, 18), 20 plans
**Timeline:** 5 days (2026-02-17 to 2026-02-21)
**Files changed:** 290 | **Lines:** +69,508 / -806
**Codebase:** ~97,824 lines TypeScript (62 Convex tables)
**Requirements:** 7/12 satisfied | **Audit:** gaps_found (5 intentionally deferred)

**Key accomplishments:**
1. Unified multi-channel dispatch planner — Weekly planning across GoFood, K3Mart, Direct, and Consignment in one page with demand waterfall, over-capacity highlighting, and direct order auto-population at due-date minus 2 days
2. Tamtem 3rd GoFood outlet — G958262444 (Tamtem/Legato) syncs transactions automatically alongside Goldfinch and Crystal on the existing GoBiz cron
3. Finished goods inventory tracker — Location-aware stock by product, order drawdown (fulfill direct orders without production), GoFood auto-deduction of sales, per-product low-stock alerts
4. Production ingredient tracking & COGS — Big Ball and Mid Ball components get ingredient recipes with quantities; FIFO food ingredient inventory; auto-calculated COGS from ingredient costs replaces manual number entry
5. Dispatch planner simulation — Materials Check panel shows day-by-day packaging + ingredient shortage forecasts with "Runs Out By" day-name resupply dates
6. Inventory sufficiency check — Packaging and ingredient simulation integrated into planner before finalizing weekly plans

**Delivered:** Shipped a unified multi-channel dispatch planner with demand waterfall and inventory simulation, added the Tamtem 3rd GoFood outlet, built a finished goods inventory tracker with order drawdown and GoFood auto-deduction, and extended the BOM pattern to production ingredients with FIFO tracking and auto-calculated COGS.

**Known Gaps (deferred to v1.3):**
- GF-02: Per-outlet product mapping (outlet selector in GoFood mapping tab) — Phase 19 planned
- GF-03: Per-outlet depot stock tracking + alerts (< 5 units) — Phase 19 planned
- GF-04: Depot restock suggestion algorithm (n+1 avg last 3 days) — Phase 19 planned
- KIT-09: Default daily production target 200 units, configurable by manager — Phase 20 planned
- KIT-12: Dispatch planner output drives kitchen display targets — Phase 20 planned

---


## v1.3 GoFood, Kitchen & Legacy Cleanup (Shipped: 2026-02-24)

**Phases completed:** 8 phases (+ 1 inserted decimal: 20.1), 49 plans
**Timeline:** 3 days (2026-02-21 to 2026-02-24)
**Commits:** 348 | **Files changed:** 443 | **Lines:** +48,853 / -12,945 (net +35,908)
**Requirements:** 12/20 satisfied | 8 intentionally deferred (CON-01–05, ANLY-01–03) | **Audit:** gaps_found (no critical blockers)

**Key accomplishments:**
1. GoFood Depot Management: per-outlet product mappings, per-depot stock tracking with low-stock alerts, daily restock suggestions, Tamtem silent-skip fix — closes GF-02/03/04/05
2. Convex query optimization: 5 heaviest analytical queries converted to on-demand fetches, N+1 patterns eliminated, unbounded scans bounded — production bandwidth significantly reduced
3. Kitchen overhaul: simplified kitchen UI with production targets from dispatch plan, end-of-shift recording to Finished Goods inventory, waste logging, shift history, EoS form gap closure
4. Legacy cleanup: 11 unused schema tables removed, 4 editor pages deleted, legacy Dashboard stripped — codebase significantly smaller and cleaner
5. Bundle splitting: React.lazy route-level code splitting reduces main bundle from 1,474kB to 76kB, ChunkErrorBoundary handles deploy-drift gracefully
6. Ingredient simulation fix + restock-kitchen integration: ID-based ingredient linking, dispatch planner UX overhaul with yesterday-anchored grid, Save to Kitchen, FG Adjust dialog
7. Codebase cleanup: dark mode across all 26 pages, useConvex prefix removed from all 161 hooks, protectedMutation expanded to orders/ and productionRecipes/

**Delivered:** Full GoFood depot management, kitchen production target system, legacy editor removal, and systematic codebase modernisation (bundle splitting, dark mode, hook naming). System measurably smaller, faster, and more maintainable.

**Known Gaps (deferred to v1.4+):**
- CON-01 through CON-05: Consignment sales upload via Excel — explicitly deferred during milestone planning
- ANLY-01 through ANLY-03: Sales Analytics consignment segments and lifetime counters — depends on CON-01–05

---


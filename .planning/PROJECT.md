# Frollie Recipe Master

## What This Is

A real-time recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, product concepts, orders, kitchen production, and inventory with full versioning, cost calculations, and margin analysis. Features Kanban order management, unified multi-channel dispatch planning, finished goods inventory with order drawdown, GoFood depot management, kitchen production targets, production ingredient tracking with auto-calculated COGS, full P&L through Free Cash Flow with multi-period CSV export, BCA bank statement reconciliation, kitchen staff attendance with production tracking, unit economics analytics dashboard, and unified multi-channel sales analytics across 7 platforms (Direct, GoFood, GrabFood, Shopee, TikTok, K3Mart, Consignment) — resolved through a typed `Platform` literal union with confidence-tagged `resolvePlatform()`. Integrates with GoBiz, GrabFood Partner API, and BigSeller for real-time platform data.

## Core Value

Production reliability — the system is the single source of truth for recipes, orders, kitchen production, and inventory. Every feature must work correctly under real kitchen conditions with real-time updates.

## Current State

**Last shipped:** v2.0 Financial Management & Data Quality (2026-05-11)
**Total shipped:** 11 milestones, 86 phases, 325 plans
**Codebase:** ~82K lines TypeScript tracked
**Production environment:** Convex prod `decisive-wombat-7` + Vercel auto-deploy from `main`

## Next Milestone: v2.1 (TBD — planning queue)

**Carried-forward candidates:**
- **Phase 77 — Data Health Dashboard** (deferred from v2.0). Surfaces orphan JEs, unmapped products, zero-cost components, missing reversals, and confidence-coverage stats in a single admin view. Phase 81's confidence-tagged `resolvePlatform()` is the per-row primitive Phase 77 will consume. Estimated 3-5 plans. Closes DH-01..DH-05 requirements.
- **`externalRevenue.underlyingSource` schema field** (ADR-0001 follow-on). `resolvePlatform()` ships forward-compatible per Phase 81 D-03 with a graceful "missing → BigSeller transitional + inferred confidence" fallback. Adding the schema field unlocks Test 10 (currently `it.skip` per staffreview I1), enables full BigSeller→underlying-platform resolution. Small phase (1-2 plans).
- **Phase 74.5.3 — Packaging BOM Auto-Deduction** (PLANNED, absorbs 74.5.2 deferred item #2). Extends `processChannelSaleInternal` to BOM-resolve packaging components (sticker, small-box) and emit paired `packagingInventoryTransactions` per sale. Eliminates the daily manual sticker adjustment from the 74.5.2 runbook.

Run `/gsd-new-milestone` to define v2.1 goals + requirements.

## Context

Shipped v2.0 Financial Management & Data Quality (2026-05-11). 11 milestones complete (v1.0–v2.0), 86 phases, 325 plans.

**Latest milestone:** v2.0 — Trustworthy financial reporting layer (full P&L through Free Cash Flow + raw + multi-period CSV export), bulk expense ingestion + dual-mode approval, BCA bank statement reconciliation with split-view UI, kitchen staff attendance + production tracking, unified channel routing spine + cutover (5 adapters refactored), unit economics analytics dashboard, post-shipping cleanup of inventory drift + analytics double-counting, and a domain vocabulary deepening (Phase 81) that mechanically enforces ADR-0001 + 3 long-standing rules via typed primitives + ESLint guard banning 10 legacy exports. User-visible Tokopedia → TikTok and K3 Mart → K3Mart renames.

## Requirements

### Validated

- ✓ Recipe management with versioning and cost calculations — existing
- ✓ Packaging recipe management with materials tracking — existing
- ✓ Product concept management with COGS and margin analysis — existing
- ✓ Order management with full status workflow (Draft → Complete) — existing
- ✓ Kitchen production tracking with ball distribution and tray allocation — existing
- ✓ Inventory management with FIFO batch tracking — existing
- ✓ Menu product system with BOM (Bill of Materials) components — existing
- ✓ PIN-based authentication with role-based access control — existing
- ✓ WhatsApp receipt generation with editable templates — existing
- ✓ Voucher system with usage tracking — existing
- ✓ K3 Mart integration for external stock management — existing
- ✓ Customer management — existing
- ✓ Real-time dashboard with reactive queries — existing
- ~~✓ Visual feedback overlay for user reporting — existing~~ (removed v1.2 — element identification too imprecise)
- ✓ BOM as single source of truth for ball composition — v1.0
- ✓ Comprehensive test coverage for ball distribution, FIFO, order lifecycle, vouchers — v1.0
- ✓ Security hardened: env files removed from VCS, credentials rotated, security patterns documented — v1.0
- ✓ N+1 queries eliminated, cursor pagination, kitchen denormalization, COGS caching — v1.0
- ✓ Schema tightened: 13 fields required, 5 deprecated removed, 55 denormalization annotations — v1.0
- ✓ UI brand unified: teal accent, Inter typography, dark mode, skeleton screens, mobile nav — v1.0
- ✓ Backend factories: protectedMutation wrappers, query helpers across simple entities — v1.0
- ✓ Frontend factories: EntityManager generic CRUD, createMutationHook factory — v1.0
- ✓ Production counts consolidated to productionLog as single source of truth — v1.0
- ✓ Automated weekly integrity checks for production data — v1.0
- ✓ Dependency audit with 6 safe upgrades applied — v1.0
- ✓ GoBiz token auto-refresh cron (30-min), Crystal+Goldfinch dual-outlet sync, sync health monitoring — v1.1
- ✓ Unified product mapping: auto-match by type across GoFood+K3Mart, admin-editable — v1.1
- ✓ Dashboard sync health alerts for stale API connections — v1.1
- ✓ API integration reference documentation (GoBiz, GoFood, K3Mart) — v1.1
- ✓ Kanban board order management with 7-status model (Draft→Complete) — v1.1
- ✓ Dedicated order creation page with customer-first layout, due date pills — v1.1
- ✓ Order audit trail: every status change records who/when — v1.1
- ✓ Draft order lifecycle with auto-save and edit-from-Kanban — v1.1
- ✓ Kitchen dashboard header: min/max targets, remaining balls, orders left — v1.1
- ✓ Due-date grouped kitchen orders with per-item production checklists — v1.1
- ✓ K3Mart synthetic demand in kitchen (auto from dispatch plans) — v1.1
- ✓ Manager inventory override with reason logging — v1.1
- ✓ K3Mart cockpit: outlet-first weekly planner with holiday awareness — v1.1
- ✓ Stock rotation shortcuts and manual stock in/out for K3Mart — v1.1
- ✓ Dispatch-to-kitchen pipeline (confirmDayPlan → production targets) — v1.1
- ✓ Sales analytics: Recharts, platform stacked charts, hourly/daily/weekly/monthly — v1.1
- ✓ Tamtem 3rd GoFood outlet (G958262444) syncs transactions automatically alongside Goldfinch and Crystal — v1.2
- ✓ Unified multi-channel dispatch planner: demand waterfall, direct order auto-population, over-capacity highlighting, inventory sufficiency check — v1.2 (DSP-01 to DSP-06)
- ✓ Finished goods inventory tracker: location-aware stock by product, order drawdown skipping production, GoFood auto-deduction, per-product low-stock alerts — v1.2
- ✓ Production ingredient tracking: ingredient recipes per ball type (BIG_BALL, MID_BALL), FIFO inventory for food ingredients, auto-calculated COGS replacing manual entry — v1.2
- ✓ Dispatch planner simulation: day-by-day packaging + ingredient shortage forecasts with "Runs Out By" resupply dates in Materials Check panel — v1.2
- ✓ GoFood per-outlet product mapping, per-depot stock tracking with alerts, depot restock suggestion algorithm — v1.3 (GF-02, GF-03, GF-04)
- ✓ Kitchen production targets: configurable defaults, dispatch planner drives kitchen targets (singles + triples) — v1.3 (KIT-09, KIT-12)
- ✓ Kitchen overhaul: EoS production recording to Finished Goods, waste logging, shift history — v1.3 (KIT-13–18)
- ✓ Legacy editor removal: 11 unused schema tables dropped, 4 editor pages deleted, Dashboard stripped — v1.3
- ✓ Bundle splitting: React.lazy routes, main bundle 76kB (was 1,474kB), ChunkErrorBoundary for deploy-drift — v1.3
- ✓ Codebase modernisation: dark mode across all pages, useConvex prefix removed, protectedMutation expanded to orders/ — v1.3
- ✓ Convex query optimisation: heavy analytical queries on-demand, N+1 eliminated, delivery fee reporting separated — v1.3
- ✓ Platform auth: one-click GoBiz password grant, BigSeller paste-once JWT with 30-day auto-refresh, GrabFood on-demand OAuth2 token resolve — v1.4 (AUTH-01–04)
- ✓ GrabFood POS: order sync, store pause/unpause, menu toggle, 6 HMAC webhook endpoints, menu simulator with push-to-GrabFood — v1.4 (GF-06–08, WH-01–05)
- ✓ BigSeller marketplace: scheduler-chain sync (Shopee + Tokopedia), per-order data with fee breakdown, SKU-to-menuProduct mapping — v1.4 (BS-01–03)
- ✓ Consignment settlements: outlet CRUD with rev share %, settlement entry with auto-math, payment tracking, revenue bridge — v1.4 (CON-01–04)
- ✓ Unified Sales Analytics: 8-channel stacked bar chart with dynamic discovery, lifetime units sold, multi-select filter — v1.4 (ANLY-01–03)
- ✓ Test suite repair: 56→0 failures, orphaned tests/helpers removed — v1.4 (Phase 29.1)
- ✓ Tech debt cleanup: ExternalSource type guard, pause duration fix, dead code removal — v1.4 (Phase 31)
- ✓ Weekly income statement page (`/financials`) with P&L from Revenue -> Gross Profit per channel — v1.5
- ✓ Per-channel revenue aggregation from `externalRevenue` + `consignmentSettlements` — v1.5
- ✓ Full BOM COGS resolution (production + packaging) via `buildProductCOGSMap` helper — v1.5
- ✓ Previous week comparison with delta amounts and percentages — v1.5
- ✓ Data quality / gap analysis panel (unmapped products, missing channels, zero-cost components) — v1.5
- ✓ Flat-format CSV export for external financial analysis — v1.5
- ✓ Confidence classification on every financial figure (exact/calculated/inferred/missing) — v1.5
- ✓ Schema audit: 42 findings across 65 tables, 20 unused indexes removed, 5 compound indexes added — v1.6
- ✓ Backend helper extraction: shared confidence, WIB timezone, sourceToPlatform helpers — v1.6
- ✓ Backend file splits: 5 major files from 6,348 to 4,358 LOC (-31.3%) — v1.6
- ✓ Frontend file splits: 4 components from 5,518 to 1,450 LOC (-74%) — v1.6
- ✓ E2E Playwright tests for order lifecycle, kitchen production, sales analytics — v1.6
- ✓ Tamtem depot auto-seed: silent failures eliminated — v1.6
- ✓ Double-entry journal engine with balance validation and reversal-only correction — v1.7
- ✓ 39 PSAK-aligned GL accounts seeded with atomic daily counter infrastructure — v1.7
- ✓ Expense lifecycle: Draft → Submitted → Approved → Reimbursed with receipt upload (SHA-256 dedup) — v1.7
- ✓ Delegation of Authority approval: <=500K manager, >500K admin, mandatory comments — v1.7
- ✓ Fraud detection: duplicate, late submission, split, approver concentration, unfamiliar vendor — v1.7
- ✓ Reimbursement batching per employee with bank transfer tracking and void support — v1.7
- ✓ Payroll entry with auto-generated journal entries (DR 6100 Salaries, CR 1100 Cash) — v1.7
- ✓ P&L extension: Operating Expenses → EBIT → Other Income/Expense → Net Income — v1.7
- ✓ Expense Analytics dashboard with spend breakdowns, monthly trends, fraud monitoring — v1.7
- ✓ Bulk CSV import for 350+ historical expense records as journal entries — v1.7
- ✓ GoBiz promo discount fix (use stored revenueNet) and BigSeller schema mismatch fixes — v1.7

- ✓ Help Center with searchable landing page, guide registry, and 7 reusable components — v1.8
- ✓ Interactive visual expense tutorials with WalkthroughPlayer engine and mock UI panels — v1.8
- ✓ Invoice generation: WYSIWYG form, auto-save, sequential numbering (INV-YYMM-NNN), print view — v1.8
- ✓ Business Settings page with seller identity, logo upload, default bank account — v1.8
- ✓ Asset Register with PSAK-aligned depreciation, batch JE generation, disposal with gain/loss — v1.8
- ✓ Income Statement depreciation reminder (yellow banner + inline note) — v1.8
- ✓ Expense payment method overhaul: company-paid direct debit + multi-action approval queue — v1.8
- ✓ Manual journal entry with 5 balance sheet templates, Hub split into Financials + Accounting — v1.8
- ✓ Help file indexing architecture with docs-manifest.json and GSD staleness detection skills — v1.8

### Active

- [ ] Full P&L income statement with per-channel breakdown (Revenue → FCF) — v2.0
- [ ] Revenue recognition fix: direct sales missing from sales analytics — v2.0
- [ ] Financial data export (raw transactions + P&L summary, CSV) — v2.0
- [ ] COGS override: flat per-product cost field bypassing BOM calculation — v2.0
- [ ] Data Health page with automated integrity checks — v2.0
- [ ] Bank statement reconciliation: CSV upload, auto-match, manual match UI — v2.0
- [ ] Staff attendance: clock-in/out, per-staff production tracking, monthly summary — v2.0
- [ ] Employee profile: bank account, hire date, base rate fields — v2.0

### Out of Scope

| Feature | Reason |
|---------|--------|
| PIN hash migration to bcrypt/scrypt | SHA256 acceptable for 6-digit PINs with rate limiting on internal tool |
| Moving to HTTP-only cookies or Convex Auth | Token-in-args pattern acceptable for internal tool |
| Error monitoring integration (Sentry/LogRocket) | Separate initiative |
| Archival strategy for old orders | Separate initiative after backup automation is in place |
| ~~GoBiz programmatic login (password grant)~~ | ~~API blocks non-browser clients~~ — **Completed in v1.4**: discovered working password grant endpoint |
| Full GoFood POS integration (accept orders) | Requires GoFood Facilitator Model partnership; massive scope |
| GoBiz official OAuth2 migration | GoBiz stopped issuing new client credentials (Phase 16.1 dropped) |
| Mobile app (React Native) | Responsive web design covers kitchen mobile use |
| Multi-language i18n | All users are Indonesian staff comfortable with English UI |
| Kitchen integration from dispatch planner (auto-push) | Dispatch planner now drives targets via confirmDayPlan; auto-push complete — v1.3 |
| Audio alerts for kitchen (KIT-11) | Deferred indefinitely; visual alerts sufficient |
| Automated settlement reconciliation | Metric flagging sufficient at this scale; CON-04 simplified |
| Full double-entry accounting for consignment | Production system, not accounting; export summaries to spreadsheets |
| Per-unit consignment serialization | Batch tracking sufficient for Rp 40-120k product |
| ~~Consignment sales upload (CON-01–05)~~ | **Completed in v1.4** as manual settlement entry form (simpler than Excel upload) |
| ~~Sales Analytics consignment segments (ANLY-01–03)~~ | **Completed in v1.4** — per-outlet segments in unified chart |
| ~~E2E Playwright tests (E2E-01–04)~~ | **Completed in v1.6** — order lifecycle, kitchen production, sales analytics E2E tests |
| Line-item voucher codes (VCH-01) | Current order-level vouchers work; per-product discounts deferred |
| Customer CRM / Sales pipeline | Deferred |
| Notifications bell (NTF-01) | Deferred |
| Visual feedback overlay | Removed — element identification too imprecise |
| Bank transaction import for OpEx | Deferred to v1.6; income statement (revenue → gross profit) is v1.5 scope |
| Monthly/quarterly P&L views | Start with weekly; period switching is additive |
| Budget vs. actual comparison | Requires budget input system; after OpEx tracking |
| Print-friendly P&L view | Nice-to-have; export to CSV covers external sharing |

## Context

Shipped v1.9 Bugs & Quality of Life (2026-03-28). 10 milestones complete (v1.0-v1.9), 69 phases, 246 plans.
~148K lines TypeScript across 70 Convex tables.
Tech stack: Convex 1.31 + React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4 + shadcn/ui + Recharts.
Deployed via Vercel with GitHub Actions CI.

**Current state after v1.9:**
- Financial: journal engine, full P&L (Revenue → Net Income), expense lifecycle with DoA approval, reimbursement batching, payroll entry, asset register with depreciation
- Sales: 8-channel unified analytics (GoFood, GrabFood, Shopee, Tokopedia, K3Mart, Direct, Consignment, BigSeller), income statement with confidence classification
- Kitchen: production targets from dispatch, EoS recording, component-level reporting, staff performance report
- Infrastructure: Help Center with tutorials, invoice generation, business settings, manual journal entry
- All prior capabilities intact: recipes, packaging, orders, inventory, BOM, vouchers, K3Mart cockpit, dispatch planner

**Known technical debt:**
- Generic query factory not applied to all query files (only simple entities)
- Integration adapter files large but stable (gobiz 1,207 LOC, k3mart 1,106 LOC, grabfood 829 LOC)
- Order form components large (OrderFormPOS 1,068 LOC, OrderCreate 1,017 LOC)
- GrabFood orders:read OAuth2 scope not yet granted (infrastructure works, 401 handled gracefully)
- BigSeller COGS = 0 for all Frollie orders (profit analytics meaningless until configured in BigSeller)
- Direct sales orders not consistently flowing into externalRevenue bridge (revenue recognition gap)

## Constraints

- **Tech Stack**: Convex + React 19 + TypeScript + Vite — no stack changes
- **Zero Downtime**: Production system — changes must not break existing features
- **Backward Compatibility**: Schema changes must handle existing data (migrations where needed)
- **Build Gate**: `npm run build` must pass after every phase
- **Git Workflow**: Feature branches, no direct commits to main

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep SHA256 for PIN hashing | 6-digit PINs with rate limiting sufficient for internal tool | ✓ Good — documented in SECURITY.md |
| Kill old KitchenView.tsx | V2 is production-ready, maintaining two UIs causes confusion | ✓ Good — deleted in Phase 3 |
| Build generic factories (queries, hooks, mutations, UI) | 2000+ lines of duplicate code, high maintenance burden | ✓ Good — EntityManager + createMutationHook reduce boilerplate significantly |
| Consolidate productionCounts to log-derived | Dual-write system risks inconsistency | ✓ Good — productionLog is sole source of truth, integrity checks validate |
| Include dependency upgrades | Staying current reduces future migration pain | ✓ Good — 6 safe upgrades applied, 7 major deferred with rationale |
| Include automated backup | Production data at risk without it | ✓ Good — weekly cron + integrity checks configured |
| Teal #0D9488 brand accent | Fresh, natural feel for snack brand; replaces terracotta | ✓ Good — applied across all 19 pages |
| Inter-only typography | Single font reduces FOUT, matches Notion-style reference | ✓ Good — Playfair Display removed entirely |
| BOM strangler fig migration | Gradual migration avoids breaking existing orders | ✓ Good — dual-read pattern worked cleanly |
| isKitchenVisible denormalization | Avoids multi-status loop in kitchen queries | ✓ Good — significant query simplification |
| Eager COGS caching on unitCost | Avoids recalculating on every product list view | ✓ Good — stale badge for transparency |
| 7-status Kanban model | 12+ statuses too complex; 7 covers all real workflows | ✓ Good — simpler schema, cleaner UI, audit trail built-in |
| GoBiz manual paste + cron refresh | Password grant blocked by API; refresh token keeps session alive | ✓ Good — 30-min cron works reliably |
| Outlet-first K3Mart calendar | Users think in outlets, not products across outlets | ✓ Good — natural workflow for dispatch planning |
| Kitchen dashboard above existing panels | Kitchen staff need both metrics and batch production | ✓ Good — non-disruptive addition to proven V2 layout |
| Unified product mapping by type | GoFood prices differ from internal; match by type not price | ✓ Good — auto-match + admin-editable covers all platforms |
| Drop Phase 16.1 GoBiz OAuth2 | GoBiz stopped issuing new client credentials | — Accepted — unofficial integration maintained |
| 4 separate dispatch planner tables | Separation of concerns over monolithic config object | ✓ Good — each table has distinct read/write patterns |
| Unified dispatch planner as standalone page | K3Mart cockpit stays for K3Mart-specific API workflows; planner reads from both | ✓ Good — no feature regression, clear separation of responsibilities |
| productInventory as simple aggregate (not FIFO) | GoFood outlets need negative stock for auto-deduction; FIFO adds complexity without value for finished goods | ✓ Good — simpler, predictable; negative stock flagged visually |
| fulfillFromInventory bypasses status transition guard | PaymentReceived→AwaitingDelivery requires special path outside normal forward-only transitions | ✓ Good — documented in statusTransitions.ts; intentional bypass with clear comment |
| Forward-only COGS for production ingredients | Historical orders keep original costs; recalculation would invalidate past profitability data | ✓ Good — clean separation of historical vs. new records |
| GoBiz token accepted as full JSON blob | Dual-field input caused paste errors; single JSON paste is safer and faster | ✓ Good — improved UX, no functional regression |
| commissionRate removed from dispatch schema | Net/gross revenue comes from external APIs; commission is API-derived, not locally stored | ✓ Good — avoided data duplication and sync mismatch |
| Direct Sales "Planned (Manual)" outlet | Managers need ad-hoc planning for non-confirmed direct orders | ✓ Good — flexible without polluting confirmed order data |
| GoFood depot stock as simple aggregate (not FIFO) | GoFood deductions are approximate batch totals; FIFO adds complexity without traceability benefit | ✓ Good — simpler model, negative stock flagged visually |
| Kitchen EoS records to Finished Goods immediately | Avoids double-entry; kitchen output directly feeds inventory drawdown | ✓ Good — productionLog → productInventory pipeline clean |
| React.lazy route splitting over manual chunk config | Automatic code splitting per route, no manual Rollup config needed | ✓ Good — main bundle shrunk from 1,474kB to 76kB |
| Defer consignment (CON-01–05) to v1.4+ | GoFood + kitchen integration was higher priority; consignment revenue tracking needs separate planning | — Accepted — consignment outlets use manual records for now |
| Remove 11 legacy schema tables in Phase 22 | Legacy editors unused post v1.1; tables held orphan data with no UI | ✓ Good — schema 62→59 tables, no data loss (tables were empty or UI-dead) |
| protectedMutation expanded to orders/ in Phase 25 | Consistency across all mutation patterns; orders/ was last holdout | ✓ Good — uniform auth pattern, type safety improved |
| No cron jobs for data sync (v1.4) | All syncs manual-trigger only — simpler, predictable, no background cost | ✓ Good — button press workflow natural for admin |
| GoBiz password grant auto-login (v1.4) | Discovered working password grant endpoint despite earlier assumption it was blocked | ✓ Good — one-click refresh, no browser paste needed |
| BigSeller "paste once, forget" JWT (v1.4) | CAPTCHA blocks auto-login; JWT lasts 30 days, auto-refreshes on use | ✓ Good — acceptable UX for monthly token refresh |
| Consignment manual form, not Excel (v1.4) | Simple settlement entry replaces complex CON-01–05 Excel upload | ✓ Good — much simpler, rev share % per outlet sufficient |
| externalRevenue bridge pattern (v1.4) | All 8 sources write to single externalRevenue table for unified analytics | ✓ Good — single aggregation path, dynamic channel discovery |
| Scheduler-chain for BigSeller polling (v1.4) | No while-loops in Convex actions; ctx.scheduler.runAfter(60s) for retry | ✓ Good — Convex-idiomatic, auto-cleanup on failure |
| ExternalSource type guard pattern (v1.4) | Runtime `isExternalSource()` narrows string→union for Convex index queries | ✓ Good — replaces `as any` casts, contract test catches drift |
| Dynamic channel discovery in analytics (v1.4) | Charts discover channels from data instead of hardcoded list | ✓ Good — new sources auto-appear, no frontend changes needed |
| Single color source of truth: platformColors.ts (v1.4) | All chart/card/badge colors derive from `getPlatformPalette(source)` | ✓ Good — eliminated 3-way color map duplication |
| Real-time query aggregation for P&L (v1.5) | No snapshot tables — income statement computed from live data on each request | ✓ Good — zero schema changes, safe rollback, always fresh |
| In-memory BOM COGS map preloading (v1.5) | `buildProductCOGSMap` loads all BOM data into memory maps in one batch, resolves per-item inline | ✓ Good — follows `getLifetimeTotalsInternal` pattern, avoids N+1 |
| Confidence classification on every figure (v1.5) | Each amount tagged exact/calculated/inferred/missing instead of hiding data quality issues | ✓ Good — transparent, users know what to trust |
| Consignment folded into unified P&L (v1.5) | Consignment settlements treated as another channel in the same query, not a separate report | ✓ Good — single view, consistent structure |
| Sentinel-value dual-path testing (v1.5) | Seed deliberately wrong values in unused data paths to catch double-counting bugs | ✓ Good — proved consignment reads from settlements, not externalRevenue |
| Schema audit before refactoring (v1.6) | Expert review of all tables before helper extraction ensures correct index usage | ✓ Good — 42 findings, 20 unused indexes removed, 5 compound indexes added |
| Pure function extraction pattern (v1.6) | Move logic that doesn't need ctx into helper modules; keep Convex registrations in original files | ✓ Good — 31.3% backend LOC reduction, zero API path changes |
| queryHelpers/ directory naming (v1.6) | Avoids Windows case-insensitive collision with existing helpers.ts file | ✓ Good — k3martCockpit extraction worked cleanly |
| Auto-seed depot on first sale (v1.6) | DEPOT_CONFIG array makes adding new depot patterns trivial; eliminates silent failures | ✓ Good — Tamtem depot fixed, pattern reusable for new outlets |
| Retroactive verification for audit gaps (v1.6) | Created VERIFICATION.md after execution when audit revealed missing docs | ✓ Good — all 20 requirements 3-source verified |
| Shared dateUtils.ts for WIB timezone (v1.6) | Frontend WIB helpers consolidated into single module instead of per-component duplicates | ✓ Good — 6 exports, single source of truth |
| Double-entry with reversal-only correction (v1.7) | No update mutations on journal entries — only way to fix is create a reversing entry | ✓ Good — immutable audit trail, PSAK-compliant |
| PSAK-aligned GL numbering (v1.7) | 4xxx Revenue, 5xxx COGS, 6xxx OpEx, 7xxx Other, 1xxx-3xxx Balance Sheet | ✓ Good — familiar to Indonesian accountants |
| DoA approval thresholds (v1.7) | <=500K manager, >500K admin; mandatory comment >=500K | ✓ Good — simple, enforceable, covers real workflow |
| Broadcast approval routing (v1.7) | First approver to act wins, self-submitted excluded | ✓ Good — no bottleneck, no gaming |
| SHA-256 receipt dedup (v1.7) | Hash-based duplicate detection hard-blocks submission | ✓ Good — prevents accidental double-submit |
| Single-query journal aggregation for P&L (v1.7) | OpEx sourced from journalEntryLines by entryDate index, grouped in-memory | ✓ Good — no N+1, single indexed scan |
| 3-agent simplification review (v1.7) | Automated code review found 17 findings before refactoring | ✓ Good — F1-F14 fixed, F15-F17 deferred with rationale |
| Playwright E2E with multi-role auth (v1.7) | 4 test users (admin, manager, kitchen, order_staff) in global-setup.ts | ✓ Good — 4 new test suites, lifecycle coverage |

---
*Last updated: 2026-04-07 after v2.0 milestone started*

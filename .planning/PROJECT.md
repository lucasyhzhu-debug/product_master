# Frollie Recipe Master

## What This Is

A real-time recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, product concepts, orders, kitchen production, and inventory with full versioning, cost calculations, and margin analysis. Features Kanban order management, unified multi-channel dispatch planning, finished goods inventory with order drawdown, GoFood depot management, kitchen production targets, production ingredient tracking with auto-calculated COGS, and unified multi-channel sales analytics across 8 sources (GoFood, GrabFood, Shopee, Tokopedia, K3Mart, Direct, Consignment outlets). Integrates with GoBiz, GrabFood Partner API, and BigSeller for real-time platform data.

## Core Value

Production reliability — the system is the single source of truth for recipes, orders, kitchen production, and inventory. Every feature must work correctly under real kitchen conditions with real-time updates.

## Current State

**Latest milestone:** v1.4 Sales & Channel Integration (shipped 2026-03-01)
**Next milestone:** Not yet planned — run `/gsd:new-milestone` to start v1.5

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

### Active

(No active requirements — run `/gsd:new-milestone` to define v1.5 requirements)

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
| E2E Playwright tests (E2E-01–04) | Deferred to v1.5; API integrations are v1.4 priority |
| Line-item voucher codes (VCH-01) | Current order-level vouchers work; per-product discounts deferred |
| Customer CRM / Sales pipeline | Deferred |
| Notifications bell (NTF-01) | Deferred |
| Visual feedback overlay | Removed — element identification too imprecise |

## Context

Shipped v1.4 with ~124,946 lines TypeScript across 59 Convex tables.
Tech stack: Convex 1.31 + React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4 + shadcn/ui + Recharts.
Deployed via Vercel with GitHub Actions CI. 5 milestones shipped (v1.0–v1.4), 31 phases, 152 plans.

**Current state after v1.4:**
- Multi-platform integration: GoBiz (GoFood × 3 outlets), GrabFood Partner API (store control + webhooks + menu simulator), BigSeller (Shopee + Tokopedia sync), Consignment settlements
- Sales Analytics: 8-channel unified view with dynamic discovery, lifetime totals, multi-select filter
- Kitchen: targets from dispatch plan, EoS recording to Finished Goods, waste logging, shift history
- Codebase: bundle split (main 76kB), dark mode complete, hook naming unified, protectedMutation expanded, ExternalSource type guard pattern
- Schema: 59 tables, 643 unit tests passing
- UI: 26+ pages, route-level code splitting with React.lazy

**Known technical debt:**
- E2E Playwright tests not yet written (deferred from v1.3/v1.4)
- Generic query factory not applied to all query files (only simple entities)
- Tamtem depot deduction silently skips when seedFinishedGoodsLocations not run
- GrabFood orders:read OAuth2 scope not yet granted (infrastructure works, 401 handled gracefully)
- BigSeller COGS = 0 for all Frollie orders (profit analytics meaningless until configured in BigSeller)
- SUMMARY frontmatter `requirements_completed` empty across all v1.4 plans (metadata gap only)

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

---
*Last updated: 2026-03-01 after v1.4 milestone completion*

# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2026-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2026-02-16)
- ✅ **v1.2 Unified Planning & Revenue** — Phases 17-18 (shipped 2026-02-21)
- ✅ **v1.3 GoFood, Kitchen & Legacy Cleanup** — Phases 19-25 (shipped 2026-02-24)
- 🚧 **v1.4 Sales & Channel Integration** — Phases 26-30 (in progress)

## Phases

<details>
<summary>✅ v1.0 Concerns Cleanup & Refactor (Phases 1-11) — SHIPPED 2026-02-15</summary>

- [x] Phase 1: Test Infrastructure (4/4 plans) — completed 2026-02-13
- [x] Phase 2: Quick Fixes — Security & Docs (2/2 plans) — completed 2026-02-13
- [x] Phase 3: Quick Fixes — Tech Debt (4/4 plans) — completed 2026-02-13
- [x] Phase 4: Quick Fixes — Bugs (2/2 plans) — completed 2026-02-13
- [x] Phase 5: Backend Factories (3/3 plans) — completed 2026-02-13
- [x] Phase 6: BOM Migration (3/3 plans) — completed 2026-02-14
- [x] Phase 7: Query Optimization (3/3 plans) — completed 2026-02-14
- [x] Phase 8: Schema Cleanup (4/4 plans) — completed 2026-02-14
- [x] Phase 9: UI Brand Consolidation (5/5 plans) — completed 2026-02-14
- [x] Phase 10: Frontend Factories (3/3 plans) — completed 2026-02-14
- [x] Phase 11: Infrastructure & Consolidation (3/3 plans) — completed 2026-02-14

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Stabilization & QoL (Phases 12-16) — SHIPPED 2026-02-16</summary>

- [x] Phase 12: UI Brand Verification (1/1 plan) — completed 2026-02-15
- [x] Phase 13: API Audit & Auth Architecture (5/5 plans) — completed 2026-02-15
- [x] Phase 14: Order QoL (8/8 plans) — completed 2026-02-16
- [x] Phase 14.1: Draft Order Update (3/3 plans) — completed 2026-02-16
- [x] Phase 15: Kitchen Overhaul (4/4 plans) — completed 2026-02-16
- [x] Phase 16: K3Mart Cockpit (6/6 plans) — completed 2026-02-16
- ~~Phase 16.1: GoBiz OpenAPI Audit~~ — DROPPED (GoBiz stopped issuing OAuth2 keys)

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Unified Planning & Revenue (Phases 17-18) — SHIPPED 2026-02-21</summary>

- [x] Phase 17: Unified Dispatch Planner & 3rd Outlet (6/6 plans) — completed 2026-02-17
- [x] Phase 17.1: Product Inventory Tracker (5/5 plans) — completed 2026-02-21 (inserted)
- [x] Phase 18: Production Ingredient Tracking & COGS (9/9 plans) — completed 2026-02-21

**Known gaps (deferred to v1.3):** GF-02, GF-03, GF-04 (GoFood depot management), KIT-09, KIT-12 (kitchen targets)

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 GoFood, Kitchen & Legacy Cleanup (Phases 19-25) — SHIPPED 2026-02-24</summary>

- [x] Phase 19: GoFood Depot Management (9/9 plans) — completed 2026-02-22
- [x] Phase 20: Optimize Convex query reads (8/8 plans) — completed 2026-02-22
- [x] Phase 20.1: Delivery fee reporting separation (1/1 plan) — completed 2026-02-22 (inserted)
- [x] Phase 21: Kitchen Production Targets & Overhaul (10/11 plans + UAT gap closure) — completed 2026-02-23
- [x] Phase 22: Remove legacy editors, tags & Dashboard (5/5 plans) — completed 2026-02-23
- [x] Phase 23: Bundle Size & Lazy Routes (3/3 plans) — completed 2026-02-23
- [x] Phase 24: Ingredient Simulation Fix + Restock-Kitchen Integration (7/7 plans) — completed 2026-02-23
- [x] Phase 25: Codebase Cleanup (6/6 plans) — completed 2026-02-24

**Known gaps (deferred to v1.4+):** CON-01–05 (consignment upload), ANLY-01–03 (Sales Analytics consignment)

Full details: `.planning/milestones/v1.3-ROADMAP.md`

</details>

### 🚧 v1.4 Sales & Channel Integration (In Progress)

**Milestone Goal:** Unify sales data across all channels — GrabFood POS, BigSeller (Shopee + Tokopedia), and Consignment outlets — with one-click platform auth, manual-trigger syncs, and a revamped multi-channel Sales Analytics view.

- [x] **Phase 26: Platform Auth & Schema Foundation** — One-click GoBiz token refresh, BigSeller paste-once JWT management, GrabFood on-demand token resolve, unified credential health panel, and all new schema tables + source union extensions deployed (completed 2026-02-25)
- [ ] **Phase 27: GrabFood POS Integration** — Manual-trigger order history pull, store status display with one-click pause/unpause per outlet, and menu item availability toggle with `notifyMenuUpdate` call
- [ ] **Phase 28: BigSeller Integration** — Manual-trigger sync with scheduler-chain poll, per-order data storage with SKU breakdown, and admin SKU-to-menuProduct mapping UI
- [ ] **Phase 29: Consignment Settlements** — Outlet CRUD with configurable rev share %, settlement entry form with auto-calculated payment amounts, payment status tracking, and running totals per outlet
- [ ] **Phase 30: Unified Sales Analytics** — All channels in one stacked bar chart, per-consignment-outlet segments, lifetime units sold headline counter with per-product breakdown, and multi-select channel filter

## Phase Details

### Phase 19: GoFood Depot Management

**Goal:** Admin can configure per-outlet product mappings for each GoFood depot, track per-depot stock levels with low-stock alerts, receive daily restock suggestions, and see an explicit warning when the finished goods seed has not been run
**Depends on:** Phase 17.1 (builds on finished goods inventory + GoFood deduction infrastructure)
**Requirements:** GF-02, GF-03, GF-04, GF-05
**Implementation Notes:**
- `gofoodDepotStock` table must gain `outletId` field + composite index `(outletId, productId, date)` before any other work — this is the blocking schema dependency for per-depot tracking
- Use `/frontend-design` skill for holistic UI definition before implementation waves
**Success Criteria** (what must be TRUE):
  1. Mapping tab has an outlet selector — admin can view and edit product mappings per GoFood depot; a new depot defaults its mapping to the previous depot's configuration
  2. Each GoFood depot page shows current stock level; system auto-deducts based on synced GoFood sales after the admin sets starting stock
  3. Alert fires and is visible on the depot page when any depot drops below 5 total products remaining
  4. Restock suggestion is shown per depot: n+1 average of last 3 days; n+2 on Friday and Saturday; Monday resets to the previous Thursday total
  5. When `seedFinishedGoodsLocations` has not been run, an admin-visible warning appears on the GoFood depot page instead of a silent skip
**Plans:** 9/9 plans complete

Plans:
- [ ] 19-01-PLAN.md — Schema migration + core backend (transferStock, isSeedRequired, per-outlet queries)
- [ ] 19-02-PLAN.md — Restock suggestion algorithm + product mapping CRUD
- [ ] 19-03-PLAN.md — GoFood Depot page (cockpit table, mapping section, stock transfers, seed warning)
- [ ] 19-04-PLAN.md — Finished Goods tab redesign (hero, grouping toggle, transfer actions)
- [ ] 19-05-PLAN.md — Restock Planner GoFood restock extension
- [ ] 19-06-PLAN.md — [GAP] Fix build type mismatch + wire destinationLocationId through transfer dialog chain
- [ ] 19-07-PLAN.md — [GAP] By Platform grouping, location type labels, dark mode Alerts card, location type editor in Settings
- [ ] 19-08-PLAN.md — [GAP] Rename Dispatch→Restock Planner (route + nav + title), remove Simulate Inventory button, add GoFood restock usage guidance
- [ ] 19-09-PLAN.md — [GAP] Tooltip contrast, inline edit affordance, Move/Receive button styling, sync prerequisite note

### Phase 20: Optimize top Convex query reads to reduce production bandwidth

**Goal:** Reduce production bandwidth by converting the 5 heaviest analytical queries from reactive subscriptions to on-demand fetches, bounding unbounded table scans, fixing N+1 patterns, pruning query return shapes, and making internal order sync incremental
**Depends on:** Phase 19 (GoFood depot management)
**Plans:** 8/8 plans complete

Plans:
- [ ] 20-01-PLAN.md — Incremental internal sync (saveRevenue frequency fix)
- [ ] 20-02-PLAN.md — getDashboardSummaryByPeriod subscription-to-fetch conversion
- [ ] 20-03-PLAN.md — getRevenue period bounding (eliminate unbounded table scan)
- [ ] 20-04-PLAN.md — getRestockOverview on-demand fetch + N+1 fixes
- [ ] 20-05-PLAN.md — getOutletStockSummary on-demand fetch
- [ ] 20-06-PLAN.md — getRevenueByOutlet on-demand fetch
- [ ] 20-07-PLAN.md — listForKanban field pruning (lean return shape)
- [ ] 20-08-PLAN.md — getKitchenStats payload audit + optimization

### Phase 20.1: Delivery fee reporting separation (INSERTED)

**Goal:** Separate delivery fees from product revenue in Sales Analytics — show delivery fees as a new summary card and exclude them from Net Sales, with corrected discount calculation, all computed at query time using existing schema fields
**Depends on:** Phase 20
**Plans:** 1/1 plans complete

Plans:
- [ ] 20.1-01-PLAN.md — Backend aggregate fix + frontend Delivery Fees card (3 files)

### Phase 21: Kitchen Production Targets & Overhaul

**Goal:** Full kitchen view redesign — simplified production-focused UI (remove boxing/stickering), display today's targets (ball totals + packaging breakdown from dispatch plan or defaults), end-of-shift recording that updates Finished Goods Inventory, optional waste logging by reason, shift history with manager edit capability, and manager daily override
**Depends on:** Phase 17 (dispatch planner), Phase 17.1 (finished goods inventory), Phase 20 (query optimization)
**Requirements:** KIT-09, KIT-12, KIT-13, KIT-14, KIT-15, KIT-16, KIT-17, KIT-18
**Implementation Notes:**
- Use `/frontend-design` skill for holistic UI definition before implementation waves
- Target derivation: (1) ball totals from BOM quantities via dispatch plan; (2) packaging breakdown from menu products + BOM linkage
- Priority order for targets: per-day override > dispatch plan > configured defaults
- End-of-shift submission triggers Finished Goods Inventory update at Kitchen storage location
- Waste categories: QA/testing, spoilage, waste (all optional)
- Past shift editing requires inventory impact confirmation dialog
**Success Criteria** (what must be TRUE):
  1. Kitchen view is simplified: no boxing/stickering columns; full-screen production focus; targets at top-center; collapsible order context toggle
  2. Today's targets show ball totals by type (Original/Jumbo) + packaging breakdown (singles, triples, cafe-singles, etc.) derived from dispatch plan via BOM or configured defaults
  3. Manager can configure default targets on the kitchen page; manager can also override today's targets (per-day, does not affect defaults)
  4. End-of-shift input at middle-bottom accepts produced quantities by product type + optional waste by reason (QA/testing, spoilage, waste); two-step confirmation (review → success screen)
  5. Submitting end-of-shift adds produced quantities to Finished Goods Inventory at Kitchen location; waste quantities are deducted
  6. Shift production records are stored and viewable by managers; manager can edit past shifts with inventory impact warning
**Plans:** 11/11 plans complete

Plans:
- [x] 21-01-PLAN.md — Schema (kitchenShiftRecords, kitchenDailyOverrides, kitchenConfig extension) + target query + config/override mutations
- [x] 21-02-PLAN.md — Shift record mutations (submit + update with inventory integration) + queries
- [x] 21-03-PLAN.md — Frontend redesign: ProductionTargetsBar, EndOfShiftForm with two-step confirm, KitchenViewV2 restructure
- [x] 21-04-PLAN.md — Manager settings (defaults + daily override), shift history list, shift edit dialog
- [x] 21-05-PLAN.md — Raw ingredient FIFO deduction at shift submit/update
- [x] 21-06-PLAN.md — [GAP-r1] Fix form binding inversion, defaultPackagingMix flow, food-only product filter
- [x] 21-07-PLAN.md — [GAP-r1] Read-only order summary + showJumbo toggle (schema + backend + frontend)
- [ ] 21-08-PLAN.md — [GAP-r2] Schema: chef field on shift records + enabledProductionComponents replacing showJumbo
- [ ] 21-09-PLAN.md — [GAP-r2] Unified Manager Settings + Packaging Mix redesign (BOM info, allocation counters, per-component toggles)
- [ ] 21-10-PLAN.md — [GAP-r2] Per-component toggle cascade (targets bar, badges, EoS form) + target display + order notes + chef display
- [ ] 21-11-PLAN.md — [GAP-r2] Review summary deltas + success screen Framer Motion polish + chef in shift history

### Phase 22: Remove legacy editors, tags & Dashboard

**Goal:** Remove the legacy recipe/packaging/product editor pages, tags system, and Dashboard page. Drop 11 unused schema tables, clean cost invalidation, remove 4 editor routes, strip legacy Dashboard (/ becomes clean landing). ~5,200 lines of dead code removed.
**Depends on:** Phase 21
**Implementation Notes:**
- Formerly Phase 24; renumbered after Phases 22 (Consignment Upload) and 23 (Sales Analytics Extension) were deferred to a future milestone
- 11 schema tables to drop: recipes, recipeVersions, recipeComponents, componentIngredients, packagingRecipes, packagingVersions, packagingComponents, packagingComponentMaterials, products, productVersions, tags
- Dashboard.tsx renders recipe/packaging/product carousels with tag filter — remove entirely, / route becomes clean landing
- costInvalidation.ts: remove invalidateRecipeCosts and invalidatePackagingCosts, keep only menu product + production component invalidation
- ingredients/mutations.ts and materials/mutations.ts: remove scheduler calls to legacy invalidation
- Tags are ONLY used by legacy entities — safe to remove entirely
- Verify production data in tables is either empty or exported before schema drop
- No active system (orders, kitchen, inventory, menu products) references these tables
**Success Criteria** (what must be TRUE):
  1. RecipeEditor, PackagingEditor, ProductEditor, TagsManager pages removed; routes removed from App.tsx
  2. All 11 legacy schema tables dropped from convex/schema.ts
  3. Dashboard page removed; / route is a clean landing or redirect
  4. costInvalidation.ts only contains menu product and production component invalidation
  5. `npm run type-check` passes
  6. `npm run build` succeeds
  7. No dead imports or references to removed tables/pages
**Plans:** 5/5 plans complete

Plans:
- [ ] 22-01-PLAN.md — Drop 11 legacy schema tables, delete 5 backend modules, strip costInvalidation.ts
- [ ] 22-02-PLAN.md — Delete legacy frontend pages, hooks, components; clean barrel exports, routes, permissions
- [ ] 22-03-PLAN.md — Build Frollie Pro hub page at /home with role-filtered navigation cards
- [ ] 22-04-PLAN.md — Rebrand to Frollie Pro + update navigation (Home link, remove dead nav items)
- [ ] 22-05-PLAN.md — Final verification sweep (type-check, build, dead reference grep)

### Phase 23: Bundle Size & Lazy Routes

**Goal:** Reduce 1.8MB JS bundle size by implementing route-level code splitting with React.lazy and dynamic imports for heavy pages. Eliminate Vite bundle size warning.
**Depends on:** Phase 22 (legacy pages removed first — fewer routes to split)
**Implementation Notes:**
- React.lazy + Suspense for all route-level page components in App.tsx
- Dynamic imports for heavy dependencies (Recharts, Framer Motion, SheetJS)
- Vite manual chunk configuration if needed
- Measure before/after bundle sizes
**Success Criteria** (what must be TRUE):
  1. All page routes use React.lazy with Suspense fallback
  2. Vite bundle size warning eliminated
  3. Initial load bundle significantly reduced from 1.8MB
  4. `npm run build` succeeds with no warnings
  5. No visual regressions (loading states graceful)
**Plans:** 5 plans (3 complete + 2 gap closure)

Plans:
- [x] 23-01-PLAN.md — Shared utilities: lazyWithPreload, RouteLoadingFallback (spinning Frollie logo, 200ms delay), ChunkErrorBoundary
- [x] 23-02-PLAN.md — Vite config: manualChunks vendor splitting + vite-plugin-bundlesize CI guard
- [x] 23-03-PLAN.md — App.tsx lazy conversion + nav prefetch + remove page fades + human verify checkpoint

### Phase 24: Ingredient Simulation Fix + Restock-Kitchen Integration

**Goal:** Fix dispatch planner simulation: replace name string matching with ID-based ingredient linking, review simulation algorithm for correctness, remove standalone Capacity setting, wire production capacity from kitchenConfig, and add "Save targets for kitchen" button that writes kitchenDailyOverrides with source tag.
**Depends on:** Phase 21 (kitchen targets infrastructure)
**Context:** `24-CONTEXT.md` (gathered 2026-02-23)
**Design doc:** `docs/plans/2026-02-23-v1.4-milestone-brief.md`
**Implementation Notes:**
- Merged former Phase 24 (ID linking) + Phase 25 (restock-kitchen integration) — both touch same simulation code
- Replace 2 name-match sites in `dispatchPlanner/queries.ts` with ID-based lookup via `ingredients.ingredientComponentTypeId`
- Thread `ingredientId` through hierarchy traversal chain
- Remove Capacity tab from Restock Planner Settings — read from kitchenConfig.defaultTargets
- Simulation uses same priority chain as kitchen: kitchenDailyOverrides > kitchenConfig defaults
- "Save targets for kitchen" button per day saves full packaging breakdown with source="restock_planner"
- Add `source` field to kitchenDailyOverrides: `"manual"` | `"restock_planner"`
- Kitchen UI shows source badge for restock-originated overrides
- Admin mapping UI on Ingredients Manager for unlinked ingredients
- Unlinked ingredients: skip in simulation + show warning (both in Materials Check and Ingredients Manager)
- Health check of simulation algorithm while modifying code
**Success Criteria** (what must be TRUE):
  1. Ingredient simulation uses ID-based linking, not name matching
  2. Unlinked ingredients show warnings in Materials Check panel and Ingredients Manager
  3. Admin can link ingredients to componentTypes on Ingredients Manager page
  4. Restock Planner Settings no longer has a Capacity tab — capacity from kitchen defaults
  5. Simulation uses kitchenDailyOverrides > kitchenConfig defaults priority chain
  6. "Save targets for kitchen" button exists per day in restock calendar
  7. Clicking "Save targets" creates kitchenDailyOverride with source="restock_planner" and full packaging breakdown
  8. Kitchen view shows restock-originated target with source indicator
  9. Manager can overwrite restock override from kitchen page
  10. `npm run type-check` passes
  11. `npm run build` succeeds
**Plans:** 7/7 plans complete

Plans:
- [ ] 24-01-PLAN.md — Schema: kitchenDailyOverrides source field + setDailyOverride mutation + linkIngredientToComponentType mutation
- [ ] 24-02-PLAN.md — Backend core: simulateInventory ID-fix + capacity migration + getKitchenTargetsForDate overrideSource + getBallTotalsForDispatchPlanDate query
- [ ] 24-03-PLAN.md — Frontend cleanup: remove Capacity tab, unlinked warning in MaterialsCheckPanel, source badge in ProductionTargetsBar, ManagerTargetSettings source field
- [ ] 24-04-PLAN.md — Frontend integration: "Save to Kitchen" button in DispatchPlanner + admin link UI in IngredientsManager
- [ ] 24-05-PLAN.md — [GAP] Planner grid UX: fix direct-manual save, remove blur-save, rename to Planner, yesterday-anchored dates, Save to Kitchen button placement
- [ ] 24-06-PLAN.md — [GAP] Planner data completeness: Direct Sales in ball totals, BOM expansion, Balls footer row
- [ ] 24-07-PLAN.md — [GAP] Ingredients Manager: double toast fix, unlink mutation, FG Adjust dialog

### Phase 25: Codebase Cleanup

**Goal:** Fix dark mode gaps in all src/ components (not just K3Mart), remove `useConvex` prefix from hook names across all 24 hooks + all import sites, expand protectedMutation to orders/ and productionRecipes/ mutations, selectively expand generic query factory to remaining candidate files.
**Depends on:** Phase 22 (legacy code removed first — less to refactor)
**Implementation Notes:**
- Dark mode: full audit of all src/ — fix ANY hardcoded bg-white/bg-gray/text-gray/border-gray without dark: counterparts; WhatsApp preview bubble uses WhatsApp's own dark mode aesthetic
- Hook rename: useConvex prefix stripped from 161 hooks across 15 files; batched execution (5-6 per batch) with type-check after each
- protectedMutation: apply to orders/ (orderCrud, statusUpdates, itemCrud, packaging, inventoryIntegration) + productionRecipes/mutations.ts; kitchen.ts and migrations.ts stay bare
- Frontend hooks: useOrders.ts, useKitchenStats.ts, useProductionRecipes.ts migrate from useMutation → useSessionMutation
- Query factory: selective — menuProducts, whatsappTemplates, kitchenConfig candidates; orders/queries.ts and inventory/queries.ts skip (too complex)
**Success Criteria** (what must be TRUE):
  1. All hardcoded color classes in src/ fixed — dark mode works across entire app
  2. No `useConvex` prefix on any hook names
  3. orders/ and productionRecipes/ mutations use protectedMutation wrapper
  4. Frontend hooks use useSessionMutation for protectedMutation-backed mutations
  5. Generic query factory applied to applicable query files
  6. `npm run type-check` passes
  7. `npm run build` succeeds
**Plans:** 6/6 plans complete

Plans:
- [ ] 25-01-PLAN.md — Dark mode fix: all 18 files with hardcoded colors + WhatsApp preview bubble dark aesthetic
- [ ] 25-02-PLAN.md — Hook rename Batches 1-3: 34 hooks across useMenuProductComponents, useSalesAnalytics, useProductionUnitTypes, useWhatsAppTemplates, useStorageLocations, useCustomers, useKitchenStats
- [ ] 25-03-PLAN.md — protectedMutation backend: orders/ (5 files) + productionRecipes/mutations.ts migration
- [ ] 25-04-PLAN.md — Hook rename Batches 4-5: 88 hooks across useComponentTypes, useIngredients, useOrders, useInventory, useFeedback, useMenuProducts, useExternalData, useK3MartCockpit + test file
- [ ] 25-05-PLAN.md — protectedMutation frontend (useSessionMutation migration) + query factory selective rollout
- [ ] 25-06-PLAN.md — Verification sweep: type-check, build, test, grep sweeps + human dark mode verify

### Phase 26: Platform Auth & Schema Foundation

**Goal:** Establish authentication for all three new platforms (GoBiz one-click refresh, BigSeller paste-once JWT with expiry monitoring, GrabFood on-demand token resolve) and deploy all new schema tables and source union extensions that every subsequent phase depends on.
**Depends on:** Phase 25 (codebase cleanup complete)
**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Implementation Notes:**
- GoBiz auto-login: `POST https://api.gobiz.co.id/goid/token` with email/password from Convex env vars — no browser paste, one-click refresh button in credentials panel
- BigSeller: decode `muc_token` JWT at paste time, persist `exp` field as `tokenExpiresAt`, show dashboard warning when < 5 days remaining; token auto-extended on each sync use
- GrabFood: `resolveToken()` already scaffolded in `convex/integrations/grabfood/adapter.ts` — verify pattern, no cron needed (on-demand)
- Schema: 4 new tables (`grabfoodOrders`, `bigsellerOrders`, `consignmentOutlets`, `consignmentSettlements`) + source union extended with `"grabfood"`, `"bigseller"`, `"consignment"` in ALL 4 affected tables (`externalRevenue`, `externalRevenueItems`, `externalSyncLogs`, `externalOutlets`)
- Update `integrations/registry.ts` PlatformId union to include new platforms
- Credential health panel: extend existing Sales Analytics Settings panel — add GrabFood connection row (client credentials configured + last token refresh) and BigSeller row (JWT expiry countdown badge, green/yellow/red)
- Deploy schema with `npx convex deploy` before any integration code writes data
**Success Criteria** (what must be TRUE):
  1. Admin can click "Refresh GoBiz Token" in credentials panel and get a fresh token without pasting anything — system uses stored email/password env vars
  2. Admin can paste BigSeller `muc_token` once; settings panel shows expiry countdown (e.g. "28 days remaining") and turns yellow/red when under 5 days
  3. GrabFood token resolves automatically when any GrabFood action is triggered — no manual paste required, no cron needed
  4. Credential health panel shows green/yellow/red status indicator for all three platforms (GoBiz, GrabFood, BigSeller) in one unified view
  5. `npm run type-check` passes with new schema tables and source union literals — all 4 union tables updated
  6. `npx convex deploy` succeeds with new schema deployed to production
**Plans:** 5/5 plans complete

Plans:
- [ ] 26-01-PLAN.md — Registry extension (6 platforms + PlatformMeta fields) + 4 new schema tables + source union extension + credential health query
- [ ] 26-02-PLAN.md — GoBiz password grant action + BigSeller paste-token flow with JWT decode preview
- [ ] 26-03-PLAN.md — Frontend credential health panel (registry-driven SettingsTab, GoBiz refresh button, BigSeller paste dialog, build verification)
- [ ] 26-04-PLAN.md — [GAP] Fix GoBiz credential body nesting + BigSeller uid lookup fallback
- [ ] 26-05-PLAN.md — [GAP] Restore sync log expand/collapse on last_sync platform cards

### Phase 27: GrabFood POS Integration

**Goal:** Admin can manually pull GrabFood order history into the system, manager can view and control store status (open/pause/unpause) per outlet, and manager can toggle individual menu item availability — all via manual button trigger with no cron dependency.
**Depends on:** Phase 26 (grabfoodOrders table deployed, GrabFood token management in place)
**Requirements:** GF-06, GF-07, GF-08
**Implementation Notes:**
- Order history pull: `GET /partner/v1/orders?merchantID=...&fromDate=...&page=N`, paginate while `more: true`; each order upserted into `grabfoodOrders` (dedup on `orderID`) and bridged to `externalRevenue` with `source: "grabfood"`
- IDR price handling: `currency.exponent = 0` for IDR — store price as-is, no division by 100; add unit test: `subtotal: 25000` + `exponent: 0` → stored as `25000`
- Webhook handler: `handleOrderWebhook` must return HTTP 200 before any processing; schedule async upsert via `ctx.scheduler.runAfter(0, ...)`; implement HMAC-SHA256 `X-Grab-Signature` validation before production webhook registration
- Register webhook HTTP routes in `http.ts`: `/api/grabfood/order` → `handleOrderWebhook`, `/api/grabfood/menu-sync` → `handleMenuSyncWebhook`
- Store status: call `getStoreStatus` action per outlet, display OPEN/CLOSED/PAUSED badge; pause/unpause via `pauseStore` action (30/60/120 min options)
- Menu toggle: `PUT /partner/v1/batch/menu` to set AVAILABLE/UNAVAILABLE; MUST call `notifyMenuUpdate()` as second step or changes do not go live; save `Job-ID` from notification response for status tracking
- GrabFood merchant ID setup: confirm whether Crystal/Goldfinch/Tamtem share a credential or use separate client_id/client_secret per outlet before implementation
- New page: `src/pages/GrabFoodManager.tsx` with store status cards per outlet, order history table, pause/unpause controls, menu availability toggle panel
- New hook: `src/hooks/convex/useGrabFoodOrders.ts`
- New backend modules: `convex/grabfoodOrders/mutations.ts` (upsertOrder internal + externalRevenue bridge), `convex/grabfoodOrders/queries.ts` (listOrders, getOrdersByMerchant)
**Success Criteria** (what must be TRUE):
  1. Admin clicks "Sync Order History" button and GrabFood orders for configured date range are pulled, stored, and visible in an order history table — no cron, manual trigger only
  2. GrabFood orders appear as `source: "grabfood"` records in `externalRevenue` after sync, ready for analytics aggregation
  3. Manager can see current store status (OPEN/CLOSED/PAUSED) for each outlet and one-click pause for 30/60/120 minutes or unpause from within the system
  4. Manager can toggle a menu item from AVAILABLE to UNAVAILABLE (or back); system calls `notifyMenuUpdate` automatically — change goes live in GrabFood app
  5. Webhook endpoint receives GrabFood order pushes, returns HTTP 200 immediately, and processes the order asynchronously without duplicates
**Plans:** 3 plans

Plans:
- [ ] 27-01-PLAN.md — API discovery: validate GrabFood credentials, test all endpoints, map fields, document merchantIDs (gate)
- [ ] 27-02-PLAN.md — Backend: syncOrders action, grabfoodOrders mutations/queries, revenue bridge, menu batch update, webhook HMAC, HTTP routes
- [ ] 27-03-PLAN.md — Frontend: GrabFoodManager.tsx page (Orders/Store Status/Menu tabs), useGrabFood hook, App.tsx route

### Phase 28: BigSeller Integration

**Goal:** Admin can manually trigger a BigSeller sync that uses the scheduler-chain pattern to poll until complete, stores per-order data with SKU breakdowns, and bridges revenue to the unified analytics layer — with an admin UI to map BigSeller SKU codes to internal menu products.
**Depends on:** Phase 26 (bigsellerOrders table deployed, BigSeller JWT credential management in place)
**Requirements:** BS-01, BS-02, BS-03
**Implementation Notes:**
- Scheduler-chain: `triggerSync` → schedules `pollSync` every 60s → when `taskStatus="complete"` → `fetchSyncData`; max 20 poll retries before marking as failed; NO while-loops in Convex actions
- Pre-flight check before triggering: call `sync/task/detail/new/get.json` first; if `taskStatus="progress"`, show "Sync already running" and re-enter polling — never create a new task while one is running
- Per-order data: `POST /pageList.json`, paginate loop while `pageNo < totalPage`; store in `bigsellerOrders` with `platformOrderId` as dedup key; skip `bigsellerDailyStats` table — derive aggregates from per-order data
- Fee sign convention: `commissionFee`, `sellerShippingFee`, `otherFee` are negative values representing costs; profit = `platformIncome + commissionFee + sellerShippingFee + otherFee`; unit test required with `commissionFee: -5850` → profit reduced by 5850
- BigSeller JWT expiry: decode `exp` from JWT; if HTML response received instead of JSON → treat as auth failure, set `lastRefreshStatus: "error"` — never let HTML propagate as a JSON parse crash
- 31-day limit: sync window must not exceed 31 days; UI exposes date range picker; initial backfill requires sequential triggers by admin
- SKU mapping: store all orders even with `linkedMenuProductId: undefined`; admin UI to explicitly map SKU codes to menuProducts; surface unmapped SKUs in a reconciliation panel — never silently drop unmapped SKU revenue
- No cron jobs — manual trigger only per architecture decision
- BigSeller COGS caveat: when all `costFee` values are 0 for BigSeller records, show "Profit = Revenue (COGS not configured in BigSeller)" in analytics
- New backend module: `convex/integrations/bigseller/` with `config.ts`, `adapter.ts` ("use node"), `helpers.ts`, `mutations.ts` (internalMutation)
- New backend module: `convex/bigsellerOrders/mutations.ts` (upsertOrder internal), `convex/bigsellerOrders/queries.ts` (listOrders, getDailyStats)
- New frontend: BigSeller panel in `src/components/salesAnalytics/BigSellerPanel.tsx` (sync trigger button, progress indicator showing sync state machine, last synced display, SKU mapping access)
- New hook: `src/hooks/convex/useBigSeller.ts`
**Success Criteria** (what must be TRUE):
  1. Admin clicks "Sync BigSeller" button; system triggers sync, shows progress through state machine ("Triggering..." → "Syncing (est. 5-10 min)" → "Fetching data..." → "Complete") — no cron, manual trigger only
  2. BigSeller per-order data stored in `bigsellerOrders` with platform (shopee/tokopedia), shop name, SKU list, and all fee fields; duplicate sync for same date range does not create double records
  3. BigSeller orders bridge to `externalRevenue` with `source: "bigseller"` — Shopee and Tokopedia revenue visible in Sales Analytics after sync
  4. Admin can map BigSeller SKU codes to internal menu products via an explicit mapping UI; unmapped SKUs are flagged in a reconciliation view rather than silently dropped
  5. System handles BigSeller JWT expiry gracefully — shows "Re-login required" warning rather than crashing; admin can paste new token in settings without redeploying
**Plans:** 2 plans

Plans:
- [ ] 28-01-PLAN.md — Schema extension (shopee/tiktok sources, bigsellerSyncState table) + scheduler-chain sync action + order storage + revenue bridge
- [ ] 28-02-PLAN.md — Frontend: BigSellerSyncPanel progress UI, orders table, SKU mapping wiring in Settings tab

### Phase 29: Consignment Settlements

**Goal:** Admin can manage consignment outlets with per-outlet revenue sharing percentages, enter settlement records for each period, mark payments as received, and see running totals per outlet — all via a simple form-based UI with no Excel dependency.
**Depends on:** Phase 26 (consignmentOutlets and consignmentSettlements tables deployed)
**Requirements:** CON-01, CON-02, CON-03, CON-04
**Implementation Notes:**
- No Excel upload — consignment is manual settlement entry form; no SheetJS dependency for this phase
- Outlet CRUD: `consignmentOutlets` table (name, revSharePercent, isActive); simple CRUD page section; existing outlets (Goldfinch 10%, Tamtem 10%) as defaults
- Settlement entry: admin selects outlet, enters period (date range), enters total revenue; system auto-calculates: rev share amount = totalRevenue × revSharePercent, payment to Frollie = totalRevenue - revShareAmount
- Payment tracking: `consignmentSettlements` table with `status: "pending" | "paid"`, `paidAt` date; "Mark as Paid" button updates status
- Running totals: per-outlet aggregate view — total settlements, total due, total paid, outstanding balance; settlement history list sorted by period descending
- Revenue bridge: each settlement creates `externalRevenue` record with `source: "consignment"`, `externalOutletId` linking to consignment outlet, for unified analytics aggregation
- Access: manager/admin only — consignment revenue is manager-level data
- New backend module: `convex/consignment/mutations.ts` (createOutlet, updateOutlet, createSettlement, markPaid), `convex/consignment/queries.ts` (listOutlets, listSettlements, getOutletTotals)
- New page: `src/pages/ConsignmentManager.tsx` with outlet list + CRUD panel and settlement history per outlet
- New hook: `src/hooks/convex/useConsignment.ts`
- Route: `/consignment` in App.tsx
**Success Criteria** (what must be TRUE):
  1. Admin can create and edit consignment outlets with a configurable revenue sharing percentage (e.g. Goldfinch 10%, Tamtem 15%); outlet list is visible and manageable
  2. Admin can enter a settlement record (select outlet, date range, total revenue); system auto-displays the calculated rev share and payment to Frollie amounts before saving
  3. Admin can mark a settlement as paid with a payment date; status visibly changes from "Pending" to "Paid" in the settlement history
  4. Consignment page shows per-outlet running totals — total revenue, total rev share paid out, outstanding balance — alongside full settlement history with status
  5. Each settlement creates an `externalRevenue` record with `source: "consignment"` — consignment revenue is available for unified analytics aggregation
**Plans:** TBD

### Phase 30: Unified Sales Analytics

**Goal:** All sales channels appear in one stacked bar chart with per-outlet consignment segments, a lifetime units sold headline counter across all channels with per-product breakdown, and a multi-select channel filter — making cross-channel sales comparison the primary analytics experience.
**Depends on:** Phase 26 (source union deployed), Phase 27 (GrabFood externalRevenue records), Phase 28 (BigSeller externalRevenue records), Phase 29 (consignment externalRevenue records)
**Requirements:** ANLY-01, ANLY-02, ANLY-03
**Implementation Notes:**
- All new analytics queries must follow the established on-demand action pattern from v1.3: `internalQuery` in `convex/externalData/queries.ts` wrapped in an `action` in `convex/externalData/actions.ts` — no new direct `useQuery(api.externalData.*)` subscriptions for analytical data
- Extend `getRevenueTimeSeries` and `getDashboardSummaryByPeriod` for new sources: `"grabfood"`, `"bigseller"`, `"consignment"` — additive only, existing channel totals unaffected
- Update `sourceToPlatform()` display name mapping for new sources
- Recharts stacked bar chart: 3 new data series with distinct colors (GrabFood green-600, Shopee orange-500, Tokopedia red-500; Consignment outlets each get their own color segment — only shown when revenue data exists)
- Consignment segmentation: each outlet (Goldfinch, Tamtem) appears as its own bar segment differentiated by outlet name, not just `source: "consignment"`; query groups consignment by `externalOutletId`
- Channel filter: upgrade from current radio-button platform filter to multi-select checkbox filter (8+ channels); channels only appear in filter when data exists for selected period
- Lifetime totals: new `getLifetimeTotals` query (full `externalRevenue` scan — acceptable at current scale per architecture decisions; v1.5+ cache if >50K rows); headline counter shows total units sold across all channels; per-product breakdown table
- BigSeller COGS caveat: display "Profit = Revenue (COGS not configured in BigSeller)" banner whenever BigSeller records are in view with all `costFee = 0`
- Extend SettingsTab: GrabFood connection status row (client credentials configured, last token refresh date); BigSeller JWT expiry row (already added in Phase 28 panel — integrate here for unified view); consignment link to `/consignment` page
- Timezone: all period calculations use Asia/Jakarta UTC+7 for "today", "this week", "this month" boundaries
**Success Criteria** (what must be TRUE):
  1. Sales Analytics stacked bar chart shows all channels — GoFood, GrabFood, K3Mart, Shopee, Tokopedia, Direct, and each consignment outlet as its own segment — with segments only rendered when revenue data exists for the selected period
  2. Multi-select channel filter lets admin show/hide individual channels and outlets; defaults to all channels selected; persists within the session
  3. Lifetime units sold headline displays a total counter across all channels; expanding the view shows a per-product breakdown table with units sold per channel
  4. GrabFood and BigSeller data flows into the existing Sales Analytics aggregation layer via `externalRevenue` — no separate analytics path; existing GoFood/K3Mart/Direct data unaffected
  5. No new reactive `useQuery` subscriptions on `externalRevenue` — all new analytics queries use the on-demand action pattern; no bandwidth regression from v1.3 optimization work
**Plans:** TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-11. Foundation → Infrastructure | v1.0 | 36/36 | Complete | 2026-02-15 |
| 12-16. UI → K3Mart Cockpit | v1.1 | 27/27 | Complete | 2026-02-16 |
| 17. Unified Dispatch Planner & 3rd Outlet | v1.2 | 6/6 | Complete | 2026-02-17 |
| 17.1. Product Inventory Tracker | v1.2 | 5/5 | Complete | 2026-02-21 |
| 18. Production Ingredient Tracking & COGS | v1.2 | 9/9 | Complete | 2026-02-21 |
| 19. GoFood Depot Management | v1.3 | 9/9 | Complete | 2026-02-22 |
| 20. Optimize Convex Query Reads | v1.3 | 8/8 | Complete | 2026-02-22 |
| 21. Kitchen Production Targets | v1.3 | 11/11 | Complete | 2026-02-23 |
| 22. Remove legacy editors & Dashboard | v1.3 | 5/5 | Complete | 2026-02-23 |
| 23. Bundle Size & Lazy Routes | v1.3 | 3/3 | Complete | 2026-02-23 |
| 24. Simulation Fix + Restock-Kitchen | v1.3 | 7/7 | Complete | 2026-02-23 |
| 25. Codebase Cleanup | v1.3 | 6/6 | Complete | 2026-02-24 |
| 26. Platform Auth & Schema Foundation | 5/5 | Complete    | 2026-02-25 | - |
| 27. GrabFood POS Integration | v1.4 | 0/3 | Planned | - |
| 28. BigSeller Integration | v1.4 | 0/2 | Planned | - |
| 29. Consignment Settlements | v1.4 | 0/TBD | Not started | - |
| 30. Unified Sales Analytics | v1.4 | 0/TBD | Not started | - |

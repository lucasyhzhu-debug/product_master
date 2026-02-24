# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2026-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2026-02-16)
- ✅ **v1.2 Unified Planning & Revenue** — Phases 17-18 (shipped 2026-02-21)
- 📋 **v1.3 GoFood, Kitchen & Legacy Cleanup + Tech Debt** — Phases 19-25 (planned)
- 📋 **v1.4 Testing & Quality** — Phase 26+ (planned)

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

### 📋 v1.3 GoFood, Kitchen & Legacy Cleanup (Planned)

**Milestone Goal:** Close GoFood depot management gaps, link dispatch planning to kitchen production targets, and remove legacy recipe/packaging/product editors to clean the codebase.

- [x] **Phase 19: GoFood Depot Management** — Per-outlet product mapping, per-depot stock tracking with alerts, restock suggestion algorithm, Tamtem silent-skip fix (GF-02, GF-03, GF-04, GF-05) (completed 2026-02-22)
- [x] **Phase 20: Optimize top Convex query reads** — Reduce production bandwidth by optimizing high-traffic queries (completed 2026-02-22)
- [x] **Phase 21: Kitchen Production Targets & Overhaul** — Simplified kitchen UI, targets from dispatch plan/defaults, end-of-shift production recording → Finished Goods, waste logging, shift history (KIT-09, KIT-12, KIT-13–18) — 5/5 core plans complete; 2 UAT gap closure plans in progress (completed 2026-02-23)
- [x] **Phase 22: Remove legacy editors, tags & Dashboard** — Drop 11 unused schema tables, remove 4 editor pages, strip legacy Dashboard, clean cost invalidation (formerly Phase 24) (completed 2026-02-23)
- [x] **Phase 23: Bundle Size & Lazy Routes** — Route-level code splitting with React.lazy, vendor chunk splitting, ChunkErrorBoundary, lazyWithPreload utility (completed 2026-02-23)
- [x] **Phase 24: Ingredient Simulation Fix + Restock-Kitchen Integration** — ID-based ingredient linking, dispatch planner UX overhaul (yesterday-anchored grid, Save to Kitchen, Balls footer), direct sales aggregation, FG Adjust dialog, ingredient untrack (completed 2026-02-23)

**Deferred to future milestone:**
- ~~Consignment Upload~~ — CON-01 through CON-05
- ~~Sales Analytics Extension~~ — ANLY-01 through ANLY-03

### 📋 v1.4 Testing & Quality (Planned)

**Milestone Goal:** Add end-to-end test coverage for critical user flows and improve overall quality assurance.

- **Phase 26: E2E Playwright Tests** — Browser-level E2E tests for login, order creation, kitchen shift, restock planner + CI integration (context gathered 2026-02-23)

**Also deferred from v1.3:**
- Consignment Upload — CON-01 through CON-05
- Sales Analytics Extension — ANLY-01 through ANLY-03

#### Phase 26: E2E Playwright Tests

**Goal:** Add Playwright browser-level end-to-end tests for critical user flows: login, order creation, kitchen shift submission, restock planner.
**Depends on:** Phase 25 (codebase cleanup complete — test the final state)
**Context:** `26-CONTEXT.md` (gathered 2026-02-23)
**Implementation Notes:**
- Existing Playwright infrastructure (config, global setup, helpers) — extend with 4 critical flow tests
- Prod-to-dev snapshot script for realistic test data
- `[E2E]` prefix convention for test-created entities
- CI via GitHub Actions workflow_dispatch (manual, with suite/headed options)
- Happy path + 1-2 error cases per flow
- Sequential test chain (login → order → kitchen → restock)
**Success Criteria** (what must be TRUE):
  1. Prod-to-dev snapshot script works
  2. Login flow E2E test passes (+ wrong PIN error case)
  3. Order creation E2E test passes (full lifecycle: create → confirm → fulfill)
  4. Kitchen shift submission E2E test passes (balls produced + wastage)
  5. Restock planner E2E test passes
  6. GitHub Actions workflow_dispatch with suite selection runs tests in CI

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
**Plans:** 3/3 plans complete

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
| 25. Codebase Cleanup | 6/6 | Complete    | 2026-02-24 | - |
| 26. E2E Playwright Tests | v1.4 | 0/0 | Deferred (context ready) | - |

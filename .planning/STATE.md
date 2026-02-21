# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-21)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.3 — GoFood depot mgmt (Phase 19), Kitchen targets (Phase 20), Consignment upload (Phase 21), Sales analytics extension (Phase 22)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-21 — Milestone v1.3 started

Progress (v1.3): [░░░░░░░░░░] 0% — Phases 19-22 being defined

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 36
- Average duration: 6.3 min
- Total execution time: ~3.8 hours

**Velocity (v1.1):**
- Total plans completed: 27
- Average duration: 7.3 min
- Total execution time: ~3.3 hours

**Velocity (v1.2 Phase 20):**
- Plans completed: 9 (01-09)
- Estimated average: ~8 min

## Accumulated Context

### Decisions

All v1.0 and v1.1 decisions archived in PROJECT.md Key Decisions table.

- [17-01] 4 separate dispatch planner tables (plans, channelConfig, consignmentOutlets, plannerSettings)
- [17-01] Consignment outlets as dedicated table with embedded product mappings array
- [17-01] Default daily capacity 200 balls in planner settings
- [17-02] Reuse getWeekDates from k3martCockpit helpers (no duplication)
- [17-02] Direct order quantities count only at dueDate in dailyTotals (avoid double-counting)
- [17-02] K3Mart channel always read-only in unified planner
- [17-03] Up/down arrows for priority reorder (4 items don't need DnD)
- [17-03] 3-tab settings dialog (channels, outlets, capacity) -- merged from original 4-tab in 17-06
- [17-03] Direct useQuery for menu products in settings to avoid type transform
- [17-04] Route at /dispatch-planner with canAccessDashboard permission (manager + admin)
- [17-04] HTML flex layout matching K3Mart cockpit (no grid library)
- [17-04] CHANNEL_COLORS defined inline in CapacityBar (cannot import from convex/ in frontend)
- [17-05] Nav label shortened to "Dispatch" for space efficiency in header
- [17-05] CalendarRange icon from lucide-react for Dispatch Planner nav entry
- [17-06] Intl.DateTimeFormat for timezone-safe day-of-week (replaces Date.getDay())
- [17-06] commissionRate removed from schema (unused; net/gross tracked from external APIs)
- [17-06] Direct Sales has "Planned (Manual)" outlet for ad-hoc planning
- [17-06] Packaging-only products filtered from dispatch planner grid
- [20-01] Used new Set(visited) per branch in DFS to avoid cross-branch false positives
- [20-01] batchSize conversion: childUnits = (qty * multiplier) / batchSize when batchSize > 0
- [20-02] recalculateComponentCogs only writes to componentTypes (forward-only COGS, historical orders keep original costs)
- [20-02] Cost invalidation walks upward via productionComponentLinks.by_child to cascade stale markers
- [20-02] cogsMode toggle preserves manualUnitCostIdr as fallback when switching to calculated
- [20-03] Removed production+trackInventory restriction entirely (simpler than isIngredientTracker flag)
- [20-03] Negative stock via adjustment transaction on shortfall (never blocks fulfillment)
- [20-03] Ingredient deduction fires at BeingPrepared matching existing material consumption pattern
- [20-04] Row click opens recipe modal; separate Edit button opens settings dialog (dual interaction)
- [20-04] Tier-grouped view with section headers when sorted by tier
- [20-04] COGS mode toggle only in edit dialog (not create -- defaults to manual)
- [20-04] __create_new__ sentinel value in Select dropdown for inline creation
- [20-05] Type badges: Ball (blue) for non-tracking production, Ingredient (green) for trackInventory
- [20-05] Negative stock: red-50 bg + red text + AlertTriangle, prioritized over low-stock styling
- [20-05] simulateInventory return shape changed to { days, ingredientStatus } for ingredient simulation
- [20-05] Ingredient stock matching uses case-insensitive name comparison between ingredients and componentTypes
- [20-06] MaterialsCheckPanel as standalone card below main grid (not embedded in PlannerGrid)
- [20-06] Collapsible sections via useState toggle (no accordion dependency)
- [20-06] Ingredient resupply forecast uses day name (e.g., "Wednesday") for runs-out-by display
- [20-07] Cost-leaf uses isCostLeaf (no ingredients + no sub-links) OR cogsMode=manual to synthesize entry from stored unit cost
- [20-07] Category canonicalization in createComponentAndReceiveStock: production passes through, legacy packaging variants map to "packaging"
- [20-07] dispatchPlans.outletId union type (externalOutlets OR dispatchConsignmentOutlets) replaces single-table ID
- [20-08] SubComponentSection display formula: (qty/batchSize)*unitCost not qty*unitCost for correct COGS per-batch economics
- [20-08] EnableTrackingButton as top-level component (not inline render fn) to safely call React hooks
- [20-08] ReceiveStockDialog category toggle resets selectedLocationId=null so useEffect re-fires with Kitchen/default preference
- [20-09] posSlot filter in menuProductMap build loop hides legacy unslotted products from Planned Manual
- [20-09] WeeklyPlannerGrid removed from K3MartCockpit; /dispatch-planner is now sole planning interface
- [20-09] GoFood gobiz outlets confirmed present in production DB -- no seeding required
- [17.1-01] productInventory is simple aggregate (not FIFO) — quantity can go negative for GoFood outlets
- [17.1-01] Reuse existing Legato Goldfinch venue location for GoFood Goldfinch mapping — no duplicate
- [17.1-01] Manager adjustStock allows negative stock with annotated reason override note
- [17.1-01] initializeSettings is internalMutation — called from seed only, not exposed to frontend
- [Phase 17.1]: processGofoodSales accepts outletId (not merchantId) — outlet already resolved in revenue record, avoids redundant lookup
- [Phase 17.1]: Phase D items aggregated by (outletId::menuProductId) composite key for correct per-outlet deduction
- [Phase 17.1]: fulfillFromInventory bypasses FORWARD_TRANSITIONS and patches status directly (PaymentReceived->AwaitingDelivery special path)
- [17.1-03] FG prefix naming for finished goods dialogs (FGAddStockDialog, FGAdjustStockDialog) to avoid conflict with existing AdjustStockDialog for packaging/batch inventory
- [17.1-03] categoryFilter state removed from InventoryManager — effectiveCategoryFilter derived fully from mainTab
- [17.1-03] Settings panel is inline collapsible Card in FinishedGoodsTab, visible to manager/admin
- [17.1-03] ProductStockGroup grouping done client-side in FinishedGoodsTab useMemo (not backend)
- [17.1-04] FulfillFromInventoryButton placed in src/components/inventory/ (inventory concern accessed from order page)
- [17.1-04] Inner FulfillFromInventoryPanel pattern: outer returns null early, inner has all hooks — avoids hooks ordering violation
- [17.1-04] Confirm button disabled when any item short via getStockForOrder pre-check — avoids doomed mutation calls
- [17.1-04] ConvexError.data.type === 'insufficient_stock' parsed for per-item shortage display
- [Phase 17.1]: Current stock in FGAdjustStockDialog via getStockOverview query (inline, no prop drilling from ProductStockCard)
- [Phase 17.1]: productNameMap pre-loaded in fulfillFromInventory step 3 to avoid second DB reads in step 4 deduction loop
- [Phase 17.1]: Category toggle in ProductionComponentsManager is edit-only; new components always production category

### Roadmap Evolution

- v1.0: Phases 1-11 shipped 2026-02-15
- v1.1: Phases 12-16 shipped 2026-02-16 (Phase 14.1 inserted, Phase 16.1 dropped)
- v1.2: Phases 17-19 planned 2026-02-17 (GoFood + Dispatch + Kitchen)
- Phase 20 added: Production Ingredient Tracking & COGS (extends BOM/inventory pattern to food ingredients)
- Phase 17.1 inserted after Phase 17: Product inventory tracker with location tracking and order fulfilment drawdown (URGENT)
- Phase 19 added: GoFood Depot Management and Kitchen Production Targets (deferred GF-02/03/04 + KIT-09/12 from v1.2 audit)

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 7 | Verify and seed GoBiz external outlets for Dispatch Planner | 2026-02-17 | 65a7d60 | Needs Review | [7-verify-and-seed-gobiz-external-outlets-f](.planning/quick/7-verify-and-seed-gobiz-external-outlets-f/) |
| 8 | Fix ingredient inventory bugs: ComponentTypeDialog unit default, ReceiveStockDialog category toggle, IngredientsManager Enable Tracking | 2026-02-20 | aadd441 | Verified | [8-fix-ingredient-inventory-bugs](.planning/quick/8-fix-ingredient-inventory-bugs/) |
| 9 | Update GoBiz API input to accept full auth JSON blob (access_token + refresh_token from single paste) | 2026-02-20 | e820383 | Complete | [9-update-gojek-api-input-to-accept-access-](.planning/quick/9-update-gojek-api-input-to-accept-access-/) |
| 10 | Fix ingredient components missing from Inventory Manager Production tab (union query + bypass zero-stock filter for production rows) | 2026-02-20 | 0530a47 | Verified | [10-fix-ingredient-components-missing-from-i](.planning/quick/10-fix-ingredient-components-missing-from-i/) |
| Phase 17.1 P05 | 25 | 8 tasks | 10 files |
| 11 | Fix Sales Analytics revenue table chronological sorting | 2026-02-21 | 256392d | | [11-fix-order-list-chronological-sorting-to-](.planning/quick/11-fix-order-list-chronological-sorting-to-/) |

### Blockers/Concerns

- [Pitfall]: Tamtem merchant ID (G958262444) must be verified against GoBiz portal before Phase 17 implementation
- [Pitfall]: `gofoodDepotStock` table has no `outletId` field -- Phase 17 must extend schema for per-depot tracking
- [Resolved]: K3Mart cockpit duplicate WeeklyPlannerGrid removed in 20-09

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 17.1-05-PLAN.md — UAT feedback applied (persistent panel UX, commit 899cdb9). Phase 17.1 FULLY COMPLETE + UAT APPROVED.
Resume file: .planning/phases/17.1-product-inventory-tracker-with-location-tracking-and-order-fulfilment-drawdown/17.1-05-SUMMARY.md
Resume notes: Phase 17.1 complete across 5 plans. All UAT gaps resolved and approved. Type-check + build pass. Ready to merge feature branch to main, update CHANGELOG on main, proceed to next phase.

---
*Last updated: 2026-02-21 (v1.3-milestone-started)*

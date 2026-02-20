# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-17)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** Phase 20: Production Ingredient Tracking & COGS

## Current Position

Phase: 20 (2 of 4 in v1.2) — Production Ingredient Tracking & COGS
Plan: 09 of 9 (COMPLETE — all gap-closure plans done)
Status: Phase 20 complete — all 9 plans executed, ready for merge review
Last activity: 2026-02-17 — Completed 20-09 (dispatch planner posSlot filter + K3Mart cockpit WeeklyPlannerGrid removal)

Progress (v1.2): [██████░░░░] 60%

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

### Roadmap Evolution

- v1.0: Phases 1-11 shipped 2026-02-15
- v1.1: Phases 12-16 shipped 2026-02-16 (Phase 14.1 inserted, Phase 16.1 dropped)
- v1.2: Phases 17-19 planned 2026-02-17 (GoFood + Dispatch + Kitchen)
- Phase 20 added: Production Ingredient Tracking & COGS (extends BOM/inventory pattern to food ingredients)
- Phase 17.1 inserted after Phase 17: Product inventory tracker with location tracking and order fulfilment drawdown (URGENT)

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 7 | Verify and seed GoBiz external outlets for Dispatch Planner | 2026-02-17 | 65a7d60 | Needs Review | [7-verify-and-seed-gobiz-external-outlets-f](.planning/quick/7-verify-and-seed-gobiz-external-outlets-f/) |
| 8 | Fix ingredient inventory bugs: ComponentTypeDialog unit default, ReceiveStockDialog category toggle, IngredientsManager Enable Tracking | 2026-02-20 | aadd441 | Verified | [8-fix-ingredient-inventory-bugs](.planning/quick/8-fix-ingredient-inventory-bugs/) |
| 9 | Update GoBiz API input to accept full auth JSON blob (access_token + refresh_token from single paste) | 2026-02-20 | e820383 | Complete | [9-update-gojek-api-input-to-accept-access-](.planning/quick/9-update-gojek-api-input-to-accept-access-/) |

### Blockers/Concerns

- [Pitfall]: Tamtem merchant ID (G958262444) must be verified against GoBiz portal before Phase 17 implementation
- [Pitfall]: `gofoodDepotStock` table has no `outletId` field -- Phase 17 must extend schema for per-depot tracking
- [Resolved]: K3Mart cockpit duplicate WeeklyPlannerGrid removed in 20-09

## Session Continuity

Last session: 2026-02-20
Stopped at: Phase 17.1 context gathered — product inventory tracker (finished goods, location-aware, order drawdown)
Resume file: .planning/phases/17.1-product-inventory-tracker-with-location-tracking-and-order-fulfilment-drawdown/17.1-CONTEXT.md
Resume notes: Phase 17.1 context complete. Run /gsd:plan-phase 17.1 to create implementation plans. Note: user also wants settings/configuration UI (low-stock threshold, etc.) included in this phase.

---
*Last updated: 2026-02-17 (20-gap-closure-verified)*

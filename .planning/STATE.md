# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-17)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** Phase 20: Production Ingredient Tracking & COGS

## Current Position

Phase: 20 (2 of 4 in v1.2) — Production Ingredient Tracking & COGS
Plan: 07 of 9 (IN PROGRESS — gap closure)
Status: Executing gap-closure plans (07-09) from UAT diagnosis
Last activity: 2026-02-17 — Completed 20-07 (3 backend bug fixes)

Progress (v1.2): [█████░░░░░] 50%

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 36
- Average duration: 6.3 min
- Total execution time: ~3.8 hours

**Velocity (v1.1):**
- Total plans completed: 27
- Average duration: 7.3 min
- Total execution time: ~3.3 hours

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

### Roadmap Evolution

- v1.0: Phases 1-11 shipped 2026-02-15
- v1.1: Phases 12-16 shipped 2026-02-16 (Phase 14.1 inserted, Phase 16.1 dropped)
- v1.2: Phases 17-19 planned 2026-02-17 (GoFood + Dispatch + Kitchen)
- Phase 20 added: Production Ingredient Tracking & COGS (extends BOM/inventory pattern to food ingredients)

### Pending Todos

None yet.

### Blockers/Concerns

- [Pitfall]: Tamtem merchant ID (G958262444) must be verified against GoBiz portal before Phase 17 implementation
- [Pitfall]: `gofoodDepotStock` table has no `outletId` field -- Phase 17 must extend schema for per-depot tracking
- [Strategic]: Phase 18 (Dispatch Planning) is the most complex phase -- 6 requirements, demand waterfall, inventory sufficiency
- [Strategic]: K3Mart cockpit stays as-is; unified planner reads from K3Mart data but does not replace cockpit

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 20-07-PLAN.md (3 backend bug fixes: hierarchy cost-leaf, production inventory, dispatch outletId union)
Resume file: .planning/phases/20-production-ingredient-tracking-and-cogs/20-07-SUMMARY.md
Resume notes: 20-07 complete. Continue with 20-08 and 20-09 gap-closure plans to fully resolve UAT issues.

---
*Last updated: 2026-02-17 (20-07-complete)*

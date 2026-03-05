# Phase 37: Order & Dispatch Backend Simplification - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Split the order management and dispatch planner query/mutation files by extracting validation logic, enrichment helpers, and simulation code into pure helper modules. No Convex API path changes, no mutation signature changes, no UI changes.

**Target files:**
- `convex/orders/queries.ts` (1,279 → <800 LOC)
- `convex/orders/mutations/orderCrud.ts` (1,085 → <700 LOC)
- `convex/dispatchPlanner/queries.ts` (1,226 → <800 LOC)

</domain>

<decisions>
## Implementation Decisions

### Helper file organization
- **Mirror the existing orders pattern across all modules:** `helpers.ts` for pure functions (no ctx), `helpers/` directory for ctx-dependent helpers
- **dispatchPlanner gets a `helpers/` directory** — currently only has flat `helpers.ts` (137 LOC). New ctx-dependent extractions (plan building, simulation) go into `helpers/` directory files
- **All new order helpers go into the existing `helpers/` directory** — both query-specific and mutation-specific helpers share the same `helpers/` folder (currently 9 files, 1,493 LOC)
- **Domain-based file naming** — e.g., `kitchenEnrichment.ts`, `kanbanBuilders.ts`, `simulationHelpers.ts` (matches existing pattern: `ballDistribution.ts`, `statusTransitions.ts`)
- **Update `helpers/index.ts` barrel re-export** with all new helper files — maintain existing import convenience pattern

### Extraction granularity
- **Orders queries: extract enrichment logic only** — move data enrichment/aggregation (order-to-items joins, kitchen stats calculation, kanban column building) to helpers. Query registrations stay with their args/handler shells in queries.ts
- **Order mutations: extract validation + item processing** — input validation, item building/processing, and draft-to-submitted transformation logic moves to helpers. Mutations keep auth, DB writes, and event logging inline
- **Dispatch planner: extract plan building + simulation** — weekly plan assembly (channel sections, outlet rows, product rows) and inventory simulation engine move to helpers/. Config queries stay inline
- **Pure functions preferred** — pass pre-fetched data as arguments wherever practical. Only use ctx in helpers when the helper needs its own queries. Easier to test, matches helpers.ts convention

### Type/interface placement
- **Create `types.ts` for each module** — `dispatchPlanner/types.ts` for shared interfaces (PlanCell, ProductRow, OutletRow, ChannelSection, UnifiedWeeklyPlan, simulation types). Orders already has types.ts (15 LOC)
- **Export types from types.ts** — available for cross-module consumers and frontend hooks
- **Add explicit return types to all extracted helper functions** — makes API contract clear, helps catch shape regressions

### Query file splitting
- **Keep single queries.ts per module** — do NOT split into domain-specific query files (kitchenQueries.ts, kanbanQueries.ts, etc.) because that changes Convex API paths. Extract heavy logic to helpers/ instead
- **Same pattern for dispatchPlanner** — queries.ts stays as single entry point, getUnifiedWeeklyPlan internals move to `helpers/weeklyPlanBuilder.ts`, simulateInventory internals move to `helpers/inventorySimulation.ts`

### Documentation
- **Update docs/API_REFERENCE.md** — document the new helper module structure and extraction pattern rationale
- **Update docs/CHANGELOG.md** — standard entry after merge with actual LOC measurements

### Claude's Discretion
- Exact function boundaries within each extraction (how to slice the ~685 LOC getUnifiedWeeklyPlan)
- Whether a specific helper needs ctx or can be pure — decide per function based on data dependencies
- Helper function naming within the domain-based files
- Whether orders/types.ts needs expansion or is sufficient as-is

</decisions>

<specifics>
## Specific Ideas

- The existing `helpers/index.ts` barrel pattern is the template — all new helpers must follow it
- `getUnifiedWeeklyPlan` (~685 LOC) is the single biggest extraction candidate — it builds channel sections, outlet rows, product rows, and capacity calculations all inline
- `simulateInventory` (~300 LOC) does ingredient traversal and BOM resolution — these are distinct sub-functions
- `orderCrud.ts` already imports from 10 helpers — the extraction pattern is well-established, just extend it
- User noted: architectural context should be documented for future developers (API_REFERENCE.md update)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/orders/helpers/` (9 files, 1,493 LOC): Mature helper directory — ballDistribution, statusTransitions, voucherHandling, productionRecords, batchFetching, usageTracking, statusFetching, autoEntry + barrel index.ts
- `convex/orders/helpers.ts` (242 LOC): Pure functions — calculateLineTotals, generateOrderNumber, parseDeliveryAddress
- `convex/orders/types.ts` (15 LOC): OrderWithItems type
- `convex/orders/validators.ts` (49 LOC): Shared input validators
- `convex/dispatchPlanner/helpers.ts` (137 LOC): Pure functions — generateWeekDates, epochToDateString, CHANNEL_COLORS
- `convex/lib/hierarchyTraversal.ts`: collectLeafIngredients (used by simulateInventory)
- `convex/k3martCockpit/helpers.ts`: getTodayJakarta (imported by dispatchPlanner)

### Established Patterns
- **helpers.ts** = pure functions (no ctx dependency, testable) — used in orders
- **helpers/** directory = ctx-dependent helpers (take MutationCtx/QueryCtx) — used in orders
- **Barrel re-export** via helpers/index.ts — single import point for consumers
- **Domain-based naming** — files named after business domain (ballDistribution, statusTransitions, not "helper1", "helper2")
- **Types in types.ts** — OrderWithItems exported from orders/types.ts

### Integration Points
- `convex/orders/queries.ts` — imported by 24 frontend hooks via `api.orders.*`
- `convex/orders/mutations/orderCrud.ts` — imported by `useOrders.ts` hook and several pages
- `convex/dispatchPlanner/queries.ts` — imported by dispatch planner frontend components
- `convex/orders/helpers/batchFetching.ts` — already used by queries.ts (fetchOrdersWithItemsAndProduction)

</code_context>

<deferred>
## Deferred Ideas

- Splitting queries.ts into domain-specific query files (kitchenQueries.ts, kanbanQueries.ts) — would require API path changes, consider for a future "Convex module restructure" phase
- Unit tests for the new extracted helper functions — Phase 39 (E2E Test Foundation) is the testing phase

</deferred>

---

*Phase: 37-order-dispatch-simplification*
*Context gathered: 2026-03-05*

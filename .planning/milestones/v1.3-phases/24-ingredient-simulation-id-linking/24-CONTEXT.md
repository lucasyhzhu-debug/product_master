# Phase 24: Ingredient Simulation Fix + Restock-Kitchen Integration - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Three concerns in the dispatch planner simulation, merged into one phase because they touch the same code (`dispatchPlanner/queries.ts`):

1. **ID Linking Fix** — Replace name string matching with ID-based lookup using existing `ingredientComponentTypeId` FK
2. **Simulation Algorithm Review** — Health check of the ~300-line `simulateInventory` query for correctness and edge cases
3. **Kitchen Target Integration** — Remove standalone Capacity setting from Restock Planner; read production capacity from kitchenConfig; add "Save targets for kitchen" button that writes kitchenDailyOverrides with source tag

Formerly Phase 24 (ingredient ID linking) + Phase 25 (restock-kitchen integration), merged because both modify the same simulation code.

</domain>

<decisions>
## Implementation Decisions

### Linking Strategy
- Replace the 2 name-match sites in `dispatchPlanner/queries.ts` (lines ~939 and ~994) with ID-based lookup using `ingredients.ingredientComponentTypeId`
- Thread `ingredientId` through the hierarchy traversal chain so it's available at the simulation point (currently only `ingredientName` string is passed forward)
- Build a pre-loaded map of ingredientId → componentTypeId to avoid N+1 lookups
- Kitchen shift deduction (`ingredientDeduction.ts`) already uses the correct ID-based pattern — simulation should match

### Migration / Admin Mapping
- Research phase should check production data to determine how many ingredients are missing `ingredientComponentTypeId`
- Add admin mapping UI on the **Ingredients Manager page** — show which ingredients are linked to inventory componentTypes and allow admin to fix missing links
- No auto-migration by name match — admin explicitly maps each ingredient

### Fallback Behavior
- When an ingredient has no `ingredientComponentTypeId` link, simulation **skips it** and shows a warning
- Warning appears in **both places**:
  - Amber banner in Materials Check simulation results: "N ingredients not linked — forecasts may be incomplete"
  - Badge/alert on Ingredients Manager page for unlinked records
- No fallback to name matching — clean break

### Kitchen Target Source
- Remove the Capacity tab from Restock Planner Settings dialog entirely
- Simulation reads daily production capacity from `kitchenConfig.defaultTargets` (same values managers configure on Kitchen page)
- Simulation uses the **same priority chain as kitchen view**: kitchenDailyOverrides (if exists for that day) > kitchenConfig defaults
- Forecasts reflect actual planned production, not a separate static number

### Save Targets for Kitchen
- "Save targets for kitchen" button per day at top of restock calendar
- Saves the **full packaging breakdown** (e.g. 106 singles, 40 triples) — not just ball totals
- Writes to `kitchenDailyOverrides` with new `source` field: `"manual"` | `"restock_planner"`
- Kitchen UI shows source badge when override comes from Restock Planner (e.g. "from Restock Planner")
- Manager can always overwrite a restock-originated override from kitchen page (source changes to "manual")
- Last write wins — both restock and manager overrides live in same table

### Algorithm Review
- Health check only — no known bugs or performance issues
- Review for correctness and edge cases while modifying the simulation code
- Not a rewrite — targeted fixes if issues are found

### Claude's Discretion
- Pre-loaded map implementation details (Map vs object, query structure)
- Exact placement and styling of unlinked ingredients warning
- How to thread ingredientId through hierarchy traversal (extend IngredientUsage interface or separate lookup)
- Algorithm edge case fixes if found during review
- "Save targets for kitchen" button placement and interaction design

</decisions>

<specifics>
## Specific Ideas

- The design doc at `docs/plans/2026-02-23-v1.4-milestone-brief.md` has the full restock-kitchen integration flow with examples
- Example flow: Restock Planner for Tuesday needs 106 singles + 40 triples → click "Save targets for kitchen" → kitchenDailyOverride created with source="restock_planner" → Kitchen view on Tuesday shows 226 balls with "from Restock Planner" badge
- Ingredients Manager should make it obvious which ingredients are unlinked — not hidden behind a settings page

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-ingredient-simulation-id-linking*
*Context gathered: 2026-02-23*

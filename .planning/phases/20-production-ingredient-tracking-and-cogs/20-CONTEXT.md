# Phase 20: Production Ingredient Tracking & COGS - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the packaging BOM/inventory pattern to production components: ingredient recipes per ball type with hierarchical sub-components (up to 3 tiers), FIFO inventory tracking for food ingredients, auto-calculated COGS from ingredient costs, and usage simulation in the dispatch planner. This phase does NOT add new menu products, change order flows, or modify the dispatch planner's planning logic -- only adds ingredient tracking and simulation to existing structures.

</domain>

<decisions>
## Implementation Decisions

### Hierarchical Production Components
- Production components can contain **other production components** (sub-components) AND **direct ingredients**
- Max nesting depth: **3 tiers** (e.g., Tier 3 ball -> Tier 2 marshmallow outer -> Tier 1 ingredients)
- Tier is **implicit** -- inferred from nesting depth, no explicit tier label on components
- Circular references **must be validated and prevented** when linking sub-components
- Each production component has a **batch/production size** (e.g., marshmallow outer = 100g, Mid Ball = 45g) set during creation, editable later
- Components can exist with **zero ingredients and zero sub-components** (empty recipe allowed, COGS shows as 'not set')

### Ingredient Linking UX (Modal Flow)
- **Access:** Click a production component row in ProductionComponentsManager to open a **dialog/modal overlay** (not a dedicated page)
- **Modal layout:** Two **stacked sections** -- Section 1: "Sub-components" (linked production components with quantity), Section 2: "Direct ingredients" (ingredients with quantity). Both sections always visible, even if empty.
- **Add flow:** Pick from existing ingredients/components via dropdown, **plus "Create new" inline** option (matching packaging BOM pattern)
- **Quantities:** Per **single component** (e.g., "Mid Ball needs 15g marshmallow"), not per batch
- **Units:** Respect the sub-component's/ingredient's **original unit** (grams, ml, etc.) -- don't force everything to grams
- **Live COGS preview:** As ingredients and sub-components are added with quantities, a **running COGS total updates in real-time** in the modal
- **No stock display in modal** -- stock levels visible only in the Inventory page, not in the recipe editor modal

### Production Components List Display
- Default sort: **Highest tiers first** (components with most nesting at top), grouped by tier
- Can switch to **alphabetical** sort
- Uses **existing search and filtering patterns** from the codebase
- Type badge distinguishes components from ingredients in the flat inventory list

### Ingredient Inventory
- Food ingredients appear in the **same Production tab** of the existing Inventory page (not a new tab)
- **One flat list** with type badges to distinguish production components from ingredients (no sub-grouping)
- Receive modal is **identical to packaging inventory** -- same fields: vendor, cost per unit, quantity, batch tracking, FIFO
- **One batch at a time** for receiving (matches packaging flow, no bulk entry)
- **No storage location tracking** for food ingredients -- they're all in the kitchen
- **Same low-stock alert system** as packaging inventory

### Ingredient Deduction
- Triggered by **order fulfillment** (when order moves to Boxed/Labeled), not production log entry
- **Full hierarchy trace** -- deducts all leaf ingredients through the component tree (Mid Ball -> marshmallow outer -> marshmallow ingredients + direct ingredients)
- If insufficient stock: **warn but allow** -- show warning that stock will go negative, but don't block the fulfillment
- Negative stock displayed with **red highlight and warning icon** in inventory list

### COGS Transition (Manual to Calculated)
- **User explicitly toggles** per-component between "Manual COGS" and "Calculated COGS" -- not automatic
- Toggle is **per-component** (each production component independently chooses manual or calculated)
- When toggling to calculated, **manual value is preserved as fallback** -- can toggle back and manual value is still there
- **Partial calculation with warning** if some ingredients have no cost data -- shows "COGS incomplete -- 2 ingredients missing cost data"
- COGS recalculates **lazy/on-demand** -- when someone views the component or explicitly refreshes, cached otherwise
- **Forward-only** -- historical orders keep their original COGS, no retroactive recalculation
- **Enhanced display** with breakdown tooltip showing full hierarchy: click to see sub-component costs expanding to their ingredients, plus direct ingredient costs

### Usage Simulation in Dispatch Planner
- **Combined view** -- one "Materials Check" panel showing both packaging AND ingredient sufficiency
- **7-day horizon** matching the planner window
- Shows **projected resupply dates** -- "Marshmallow runs out by Wednesday" based on current stock and planned production
- Triggered by **manual "Simulate" button** -- user clicks when ready (not auto on view)

### Claude's Discretion
- Exact modal sizing and scroll behavior for the ingredient recipe editor
- COGS caching strategy implementation details
- Hierarchy traversal algorithm for deduction
- Specific warning UI for insufficient stock during fulfillment
- Simulation calculation performance optimization
- Exact FIFO batch selection logic for cost calculation

</decisions>

<specifics>
## Specific Ideas

- **Two-tier example from user:** Mid Ball (45g) contains marshmallow outer (Tier 1 sub-component, 15g used) + direct ingredients (cocoa powder 1g, crushed pistachios 2g). Marshmallow outer (100g batch) has its own ingredients. Final COGS = sum of all ingredient costs through hierarchy.
- User wants to be able to create Tier 1 components first (with only ingredients), then compose them into Tier 2/3 components
- Live COGS preview during editing is important for decision-making when composing recipes
- Ingredient batch receiving should feel identical to packaging -- no learning curve

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 20-production-ingredient-tracking-and-cogs*
*Context gathered: 2026-02-17*

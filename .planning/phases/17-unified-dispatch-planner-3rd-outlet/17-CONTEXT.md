# Phase 17: Unified Dispatch Planner & 3rd Outlet - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Manager plans the entire week's production dispatch across all sales channels in one page. Rolling 7-day calendar grid shows demand per channel/outlet/product, with a capacity waterfall visualization. The 3rd GoFood outlet (Tamtem) syncs transactions on the existing cron schedule. Does NOT replace the K3Mart cockpit -- reads from it. Does NOT include procurement planning or P&L reporting.

</domain>

<decisions>
## Implementation Decisions

### Planner Layout
- Rolling 7-day calendar grid, building on K3Mart Weekly Planner pattern
- Left/right arrow buttons shift the view by 7 days
- **Past days**: Show actual sales data (retrospective, read-only)
- **Future days**: Editable cells -- manager inputs planned dispatch quantities
- **Pre-filled defaults**: Future cells pre-filled based on recent averages (like K3Mart pattern), manager adjusts as needed
- **Row hierarchy**: Channel -> Outlet/Order -> Product (3 levels)
  - Channels: Direct Sales, GoFood, K3Mart, Other Consignment
  - Under Direct Sales: Each order with a due date in the 7-day window is its own row
  - Under GoFood: 3 outlets (Goldfinch, Crystal, Tamtem)
  - Under K3Mart: Active outlets from K3Mart settings
  - Under Other Consignment: Configurable outlets (currently Legato Tamtem, Legato Goldfinch)
  - Under each outlet/order: Products (Original Single, Original Triple)
- **Collapsible channel groups** with subtotal rows visible when collapsed (default: expanded)
- **Top summary**: Total balls per day with segmented capacity bar (200-ball default, configurable) + mini channel breakdown showing distribution shape
- **Direct order display**: Orders show on BOTH the production-start day (due date minus 2, faded) and the due date column (solid) -- visual range showing production window
- **Empty rows**: Show with placeholder dash ("--") when no data for a day
- **Desktop only** -- no mobile optimization needed
- **Auto-save on blur**: Each cell saves immediately when user clicks away (Convex real-time)

### Demand Waterfall
- **Integrated into the grid header** -- no separate chart. Column totals at top ARE the waterfall
- **Segmented capacity bar per day**: Each channel gets its own color segment (Direct=blue, GoFood=green, K3Mart=orange, Other=gray). Bar fills toward the configurable capacity threshold
- **Daily capacity is configurable** by manager (default 200 balls), regardless of composition between original and triple
- **Over-capacity handling**: Auto-redistribute using priority-based logic -- lowest-priority channels are reduced first
- **All channels are flexible** during redistribution (including Direct, though Direct is highest priority so last to be cut)
- Manager sees the redistribution suggestion and can override individual cells
- **Historical days show same segmented bar** with actual sales data for comparison

### Channel Configuration
- **Settings dialog** (gear icon on planner page) for all channel config
- **Channel priority**: Drag-to-reorder list. Top = highest priority. Default: Direct > GoFood > K3Mart > Other Consignment
- **Commission rates**: Per-channel (not per-outlet). Percentage of gross sales
- **Channels are semi-fixed**: Direct, GoFood, K3Mart are built-in. Other Consignment outlets are configurable (add/rename/remove)
- **New consignment outlet requires**: Name, product mapping (internal product -> external name + external price, same pattern as GoFood mapping), and commission rate as % of gross sales
- **Outlet enable/disable**: All channels support enabling/disabling outlets in settings. Disabled outlets don't appear in the planner grid
- **GoFood outlets**: All 3 enabled by default (Goldfinch, Crystal, Tamtem)
- **K3Mart outlets**: Synced with existing K3Mart cockpit settings -- configurable from both places, backed by same data source

### Inventory Simulation
- **Manual "Simulate" button** -- does NOT auto-run on cell changes
- **Checks all direct packaging BOM items** linked to each product via menuProductComponents, plus food components (sub/ball level)
- **Result display**: Day column gets a colored left border (green=OK, yellow=low, red=out). Hover for details on which items are short and by how much
- **Advisory only** -- does not block planning. Used to inform procurement decisions
- Simulation projects current inventory stock against planned dispatch quantities across the 7-day window

### Tamtem (3rd GoFood Outlet)
- Merchant ID: G958262444
- Syncs automatically alongside Goldfinch and Crystal on the existing cron schedule
- Enabled by default in the planner

### Claude's Discretion
- Exact grid component library and implementation approach
- Color palette for channel segments (as long as channels are visually distinct)
- How pre-filled defaults are calculated (recent average logic)
- Auto-redistribute algorithm details (priority waterfall math)
- Exact hover tooltip design for simulation results
- How to handle edge cases: weeks with no data, outlets with no products mapped

</decisions>

<specifics>
## Specific Ideas

- "Build on and re-use what we have in K3Mart's Weekly Planner" -- same rolling calendar paradigm, special day highlights, weekend styling
- Past days are retrospective (actual sales), future days are proactive (planned production) -- clear visual distinction
- "This is truly about production planning" -- the output defines what to produce each day, not sales predictions
- Consignment product mapping should follow the same pattern as GoFood's menu product mapping (internal product -> external name + price)
- Capacity bar should show "at a glance what's the shape of our distribution" -- channel composition matters, not just the total

</specifics>

<deferred>
## Deferred Ideas

- **P&L Financial Reporting** -- P&L statement / financial reporting as a standalone feature (future roadmap item)
- **Ingredients Inventory & Procurement Flow** -- Expand food component tracking to full BOM-level inventory and procurement planning similar to packaging/sticker inventory (future roadmap item)
- **Procurement Planner** -- Procurement planning UI driven by inventory simulation insights (future roadmap item)

</deferred>

---

*Phase: 17-unified-dispatch-planner-3rd-outlet*
*Context gathered: 2026-02-17*

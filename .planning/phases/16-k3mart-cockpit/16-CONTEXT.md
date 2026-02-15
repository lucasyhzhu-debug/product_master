# Phase 16: K3Mart Cockpit - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete K3Mart cockpit replacing stub implementations with real data. Manager can plan weekly dispatches per outlet with holiday awareness, record manual stock movements (stock-in, stock-out, rotation), and push confirmed day-plans to kitchen as synthetic orders. All cockpit stubs (K3MART-01 through K3MART-06) become fully functional.

</domain>

<decisions>
## Implementation Decisions

### Weekly Planning Grid
- **Grid structure:** Outlet-first with product sub-rows. Primary rows = active outlets (SCBD, Lippo Puri, Bintaro, Old Shanghai, Goldfinch, etc.), sub-rows = K3Mart-mapped products per outlet
- **Cell display:** Single editable number per product-day cell. Tap to edit inline
- **Save behavior:** Auto-save on blur. No batch save button needed
- **Totals:** Row totals (per product across week), column totals (daily production targets -- most important), and weekly grand total. Grand total row at bottom sums all outlets
- **Subtotals:** Per-outlet subtotal row. Hidden when only 1 product is planned for that outlet
- **Product visibility:** Option to hide specific product rows (e.g., hide Triple when sunsetting). Only K3Mart-mapped products appear
- **Copy last week:** "Copy last week's plan" button. Copies all saved values regardless of confirm status
- **Current stock column:** Extra column before day columns showing current K3Mart stock per product per outlet (fetched from K3Mart API)
- **Column headers:** Three-row format: (1) Day name ("Monday"), (2) Date ("17 Feb"), (3) Special event name if applicable (holiday, sales day, Ramadan, etc.)
- **Week navigation:** Default to current week. Big arrow navigation for next/previous week. Prominent date display with color difference between current week and other weeks

### Confirm & Push to Kitchen
- **Confirm granularity:** Day by day, not whole week at once
- **Draft vs confirmed indicators:** Visual distinction between draft days and confirmed days in the grid
- **Edit after confirm:** Allowed. If a confirmed day is edited, save button changes to "Update Kitchen" to re-push the updated plan
- **Unsaved changes warning:** If manager navigates away with unsaved edits, prompt to save or discard

### Outlet Management
- **All outlets always expanded** in the grid (no collapse/expand)
- **Active outlets only** shown in the planning grid. Active/inactive toggle on each outlet card
- **Modal for bulk management** of active/inactive outlets
- **Outlets defined by K3Mart cockpit** -- more than 5 exist in K3Mart but only active ones are planned
- **Per-outlet product selection:** Settings to choose which products to plan for each outlet
- **Per-outlet product pricing:** Outlet settings include price per product (admin-only configuration)
- **Default pricing:** Menu product price is the default. "Custom pricing" toggle enables per-outlet overrides
- **Price sanity check:** Before any K3Mart API call (stock-in/stock-out), validate that price is present and non-zero. Never send a request without price

### Stock Movement Recording
- **Entry point:** Tap outlet info cards (showing current stock, sold today, avg sales/day from last week)
- **Expand behavior:** Tapping outlet card expands to show stock-in/stock-out form + history log
- **Stock-in fields:** Quantity + optional notes. Price auto-included from outlet product pricing
- **Stock-out fields:** Same as stock-in: quantity + optional notes + auto-price
- **Rotation shortcut:** Dedicated "Rotate" button that does stock-out of remaining + stock-in of new quantity in one action. Auto-fills stock-out quantity from current K3Mart stock. Auto-generates comment "rotation stock-out/stock-in"
- **Manual only:** Stock movements are always manual (no auto-creation from confirmed plans). Rotation workflow (stock-out 3-5 remaining + stock-in 30 fresh) is a common pattern
- **Confirmation step:** Always confirm before sending to K3Mart API. Show summary (outlet, product, qty, price)
- **Error handling:** Show K3Mart API error message + retry button. Don't save locally if API fails
- **History log:** Below the stock-in/out form, show API-pulled list of all movements with statuses. Tap a log entry to see full details of that specific stock-in/out

### Holiday & Weekend Handling
- **Holiday source:** Pre-loaded Indonesian public holidays for 2026. Reminder to load 2027 holidays in January 2027
- **Commercial/sales dates:** Include Valentine's Day, 11/11 (Singles' Day), and all sequential dates (1/1, 2/2, 3/3, ..., 12/12)
- **Ramadan:** Only mark Lebaran (Eid al-Fitr) days, not the full fasting month
- **Visual treatment:** Special color highlight for holidays, weekends, and sales dates in column headers. Holiday/event name shown in third header row
- **Demand patterns for auto-suggest:**
  - Weekday: baseline rate (~20/day if 100/5 days)
  - Weekend: ~2.5x weekday rate (~50/day if 100/2 days)
  - Holiday/sales date: same as weekend rate (~50/day)
- **Auto-suggest quantities:** Pre-fill cells with suggested quantities based on weekday/weekend/holiday patterns. Manager can override

### Claude's Discretion
- Exact color palette for day types (weekday, weekend, holiday, sales date)
- Grid cell interaction animations and feedback
- Loading states and skeleton patterns
- Responsive behavior for different screen sizes
- Exact layout of outlet info cards
- History log pagination and sorting
- Auto-suggest algorithm (simple multiplier vs rolling average)

</decisions>

<specifics>
## Specific Ideas

- Outlet info cards should show: current stock, number sold today, average sales/day from last week
- Column totals link to production targets (kitchen planning reference)
- "Copy last week's plan" as a prominent button for weekly planning workflow
- Rotation is a key daily workflow: stock-out remaining 3-5 units + stock-in fresh 30 units
- K3Mart-mapped products only in grid. New products can be mapped from menuProducts but cannot be stocked in K3Mart unless the product exists in K3Mart's own database
- UI must be designed with high frontend design quality (frontend-design skill)
- Price must ALWAYS be in the API payload -- sanity check prevents zero/null price situations

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 16-k3mart-cockpit*
*Context gathered: 2026-02-15*

# Phase 19: GoFood Depot Management - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin-facing GoFood depot management system: configure per-outlet product mappings, track per-depot stock levels with auto-deduction from GoFood sales, show low-stock alerts, display daily restock suggestions on the depot page, and surface a full-page blocking warning when the finished goods seed has not been run. Additionally, extend the existing Dispatch Planner to show GoFood depot restock data.

Creating/editing depots themselves and the underlying GoFood sync mechanism are out of scope — those are established infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Depot navigation & layout
- Model after K3Mart Cockpit: cockpit-style one-glance dashboard per depot
- Each depot has its own page/view (navigation between depots via depot selector or list)
- Single scrollable page per depot — not tabbed — with sections stacked: cockpit table at top, mapping section below
- The seed warning (when `seedFinishedGoodsLocations` has not been run) is a **full-page blocker**: nothing else loads until the seed is run

### Cockpit table — key numbers per product
- **Primary number:** current remaining (largest, most prominent)
- **Secondary number:** sold today
- Same visual hierarchy as K3Mart Cockpit
- Restock suggestion shown as an additional column: "Restock Tomorrow: X"

### Mapping tab UX
- Mapping configuration is a section/tab within the depot page (not a separate admin area)
- New depot auto-populated silently with previous depot's mapping — admin sees it pre-filled and edits if needed
- Mapping shows: each GoFood product + which `menuProduct` in the system it maps to; unmapped products are flagged visually
- **Explicit Save button** for mapping changes (not auto-save)

### Stock level display & alerts
- Starting stock is **inline editable** directly in the cockpit table — designed to be updated multiple times throughout the day as stock is replenished
- Visual cue to indicate editability (e.g., pencil icon, input styling)
- Low-stock alert (< 5 total remaining) appears as:
  1. Alert banner at the top of the depot page
  2. Red row highlight on the affected product(s)
- "Last synced: [time]" shown on the depot page so admin knows if numbers are current

### Restock suggestion display
- Shown as a column in the cockpit table: "Restock Tomorrow: X"
- Final number shown inline; **hover tooltip** reveals calculation breakdown (e.g., "3-day avg: 8 → +1 buffer = 9 | Friday rule: +2 = 11")
- Calculation rules: n+1 of 3-day average; n+2 on Friday and Saturday; Monday resets to previous Thursday's total
- Also extend existing Dispatch Planner page to show GoFood depot restock data (additional deliverable within Phase 19)

### Claude's Discretion
- Exact cockpit table column order and widths
- Loading skeleton design
- Empty state when no GoFood sales data exists yet
- Specific color tokens for low-stock highlighting (red/orange)
- Tooltip trigger design (hover vs. info icon click)

</decisions>

<specifics>
## Specific Ideas

- "Make it like the K3Mart Cockpit — one-glance view, same pattern" (reference: `src/pages/K3MartCockpit.tsx`)
- Starting stock should be easily updatable throughout the day, not just once — inline edit is critical for operational use
- Mapping must flag unmapped products (GoFood product with no `menuProduct` link) — this is a data integrity concern for cost tracking

</specifics>

<deferred>
## Deferred Ideas

- **Multi-platform depot management** (Tokopedia, Shopee, etc.) — user wants the patterns from Phase 19 to generalize; design with extensibility in mind but don't implement multi-platform now. Future phase: "Platform Depot Management" that abstracts the GoFood-specific structure.
- **Inline-editable 7-day restock table across all GoFood + K3Mart locations** — user described a dispatch planner expansion where every location shows recommended restock for the next 7 days with inline editing. This is a significant Dispatch Planner feature expansion, not Phase 19 scope. Capture for a future "Dispatch Planner v2" phase.

</deferred>

---

*Phase: 19-gofood-depot-management-and-kitchen-production-targets*
*Context gathered: 2026-02-22*

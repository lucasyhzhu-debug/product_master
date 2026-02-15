# Phase 15: Kitchen Overhaul - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Kitchen dashboard with production targets, due-date-ranked orders, and K3Mart demand integration. A new sticky summary header appears above the existing swipeable batch production panels. Orders flow in from Phase 14's Kanban (status: "Being Prepared") and are tracked through per-item checklists until "Complete Order" sends them back to Awaiting Delivery.

This phase does NOT include: order creation, Kanban board, status transitions (Phase 14), K3Mart dispatch planning (Phase 16), or batch production panel changes.

</domain>

<decisions>
## Implementation Decisions

### Dashboard header layout
- Sticky bar at top — always visible while scrolling through orders, never collapsible
- 4 compact stat cards in a row (2x2 grid on mobile)
- Metrics shown: min target today, max production target, remaining balls needed, orders left to complete
- Remaining balls uses color-coded urgency: green (on track), amber (behind), red (overdue orders exist)
- Combined ball total by default; tap to see Big Ball / Mid Ball breakdown
- Gear icon in header opens popover/bottom sheet for target configuration (manager only)

### Due-date order grouping
- Orders grouped under due-date headers: "OVERDUE", "Due Today", "Due Tomorrow", "Due Saturday", etc.
- OVERDUE section pinned at top with red styling — impossible to miss
- EXPEDITED orders (pushed in early via Phase 14) get an orange/yellow EXPEDITED badge, pinned to top of their due-date group
- Per-item production checklist: one checkbox per menu product line (e.g., "2x Original Box" = one tick)
- Single "done" tick per product line — no sub-steps for boxed/stickered/etc.
- Kitchen clicks "Complete Order" when all items ticked → order moves to Awaiting Delivery (Phase 14 handles the status transition)
- "Send back to order desk" button: unclicks all packages, returns order to Payment Received in Phase 14 Kanban; won't auto-re-enter kitchen unless manually expedited again (if ≤2 days to due date, the crossing event already happened)

### K3Mart synthetic orders
- Visually distinct card style (different border/layout) — not the same as regular order cards
- One combined K3Mart order per day (not per outlet) with outlet breakdown inside the card
- Manager can inline-edit quantity directly on the card — tap the number to adjust
- Same checklist/tick-off flow as real orders — kitchen marks items complete just like any order
- Auto-generated from confirmed K3Mart dispatch plans (Phase 16 creates these)

### Target configuration
- Max production target: default 200 balls, manager-configurable via gear icon in header
- Composition set as absolute numbers (e.g., "150 Big Balls, 50 Mid Balls"), not percentages
- Min target auto-calculated from confirmed orders due today; displayed as "Min: 85 (4 orders)" — number + order count for context
- Manager override for unavailable inventory: inline "Override" button appears next to unavailable items, manager enters reason and marks available (manager role required)

### Claude's Discretion
- Exact card styling and color scheme for K3Mart synthetic orders
- Loading skeleton design for the dashboard header
- Error state handling when target calculation fails
- Animation/transition when orders move between due-date groups
- Exact urgency thresholds for green/amber/red on remaining balls
- Gear icon popover vs bottom sheet decision based on screen size

</decisions>

<specifics>
## Specific Ideas

- Kitchen staff primarily use phones — everything must be tap-friendly and readable at a glance
- The order-to-kitchen flow from Phase 14: orders auto-enter kitchen 2 days before due date (crossing from >2 days to ≤2 days), or via "Expedite" button. Kitchen's "Send back to order desk" prevents auto-re-entry.
- Sales reversal consideration: if an order is sent back from kitchen and subsequently moved back to Awaiting Payment (Phase 14), sales aggregator mutations must be reversed
- Due date should show day name (e.g., "Sat, Feb 17") across all views for quick scanning

</specifics>

<deferred>
## Deferred Ideas

- Batch production panel changes — existing panels stay as-is, not in scope
- Historical production analytics / trends — future phase
- Push notifications when new orders enter kitchen queue — future consideration

</deferred>

---

*Phase: 15-kitchen-overhaul*
*Context gathered: 2026-02-15*

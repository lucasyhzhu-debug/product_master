# Phase 14: Order QoL - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Order management UX overhaul: replace current order list with a Kanban board, simplify order statuses from 10+ to 6, add a Draft status for in-progress orders, streamline order creation form, and add audit trail for status changes. Kitchen integration via automatic queue entry based on due date.

</domain>

<decisions>
## Implementation Decisions

### Kanban Board Layout
- 6 columns: **Draft** | **Awaiting Payment** | **Payment Received** | **Being Prepared** | **Awaiting Delivery** | **Complete**
- Horizontal scroll on mobile (swipe through columns, one column visible at a time)
- All columns sorted by due date
- Column headers show order count (e.g., "Awaiting Payment (3)")
- Urgency colors: amber when due tomorrow, red when due today or overdue
- No drag-and-drop; each column has forward/backward action buttons

### Status Transitions (Forward)
- **Draft -> Awaiting Payment**: Automatic on "Submit Order"; WhatsApp modal pops up with payment details (also accessible later from order details)
- **Awaiting Payment -> Payment Received**: "Customer Paid!" button (simple confirmation, no payment channel selection)
- **Payment Received -> Being Prepared**: **Automatic** when order is 2 days before due date, OR **manual** via "Expedite Production" button (enters today's production run, card marked EXPEDITED with amber/orange badge + border highlight)
- **Being Prepared -> Awaiting Delivery**: Kitchen clicks "Complete Order"
- **Awaiting Delivery -> Complete**: Order staff confirms delivered/picked up

### Status Transitions (Backward)
- All backward transitions use a backward arrow button + confirmation modal with optional reason text field
- **Awaiting Payment -> Draft**: Simple revert
- **Payment Received -> Awaiting Payment or Draft**: Must reverse sales aggregator mutations (sale was recognized on payment received)
- **Being Prepared -> Payment Received**: Kitchen has "Send back to order desk" button; unclicks all allocated packages; order will NOT auto-enter kitchen again if due date is ≤2 days (threshold already crossed); WILL auto-enter again if still >2 days out (threshold hasn't fired yet)
- **Awaiting Delivery -> Being Prepared**: Packages stay ticked; kitchen can re-tick/untick specific package lines
- **Complete -> Awaiting Delivery**: Revert if courier didn't show, etc.

### Cancelled Orders
- Cancelled orders sit inside the "Complete" column with a toggle "Show cancelled orders" (off by default)
- Cancelled orders cannot be revived; must create new order
- "Copy to new order" button on cancelled orders: same details, new creation date, due date defaults to next day, all vouchers removed

### Auto-Entry to Kitchen Logic
- Trigger: order crosses from >2 days to ≤2 days before due date
- This is a one-time threshold check; once the order enters kitchen queue, the trigger is consumed
- If sent back from kitchen while ≤2 days, stays in Payment Received without re-entry (must manually expedite again)
- If sent back from kitchen while >2 days, will auto-enter at the threshold crossing

### Order Card Content
- All cards show: customer name + order #, due date with day name ("Sat, Feb 17"), discounted total, item summary, creator name ("by Lia")
- Show ALL line items (no truncation) -- card grows taller
- Discount display: final price prominently + discount badge ("-Rp 50k") + smaller struck-through gross price
- Creator shown on all columns
- Tapping a card opens a slide-over panel from the right (Kanban stays visible behind)
- Expedited orders: amber/orange "EXPEDITED" badge + subtle border highlight

### Order Card Information Architecture
- Claude has discretion on sizing, positioning, typography, and visual hierarchy to achieve best-in-class card design
- Prioritize scannability: customer name and due date should be instantly readable

### Order Creation Form
- "+" New Order" button on Kanban navigates to a dedicated creation page
- Customer input: search + autocomplete from existing customers; new customers added on the fly
- Due date: quick-tap pills for next 7 days with day names (Today, Tomorrow, Sat, Sun, Mon...) + manual date picker fallback
- Keep existing POS-style product selection UI (slot-based menu product grid) -- do not reinvent
- Auto-save as Draft when customer name is filled
- **Remove:** sales channel field (GoFood/Direct/K3Mart/etc.)
- **Remove:** payment method field (BCA/QRIS/Cash)

### Audit Trail
- Vertical timeline at the bottom of the order details slide-over panel
- Records status changes only (who moved the order, when, which status transition)
- Revert reason captured in confirmation modal stored in audit trail
- Does NOT track field edits (quantity, due date, notes changes)

### Status Schema Migration
- Full schema migration: migrate existing orders to new 6 statuses in the database
- Old statuses (Boxed, Labeled, WaitingShipment, WaitingPickup, CompleteShipped, PickedUp, InProduction) are removed
- Map existing orders: InProduction/Boxed/Labeled -> BeingPrepared; WaitingShipment/WaitingPickup -> AwaitingDelivery; CompleteShipped/PickedUp -> Complete; AwaitingPayment stays; Confirmed -> PaymentReceived
- Add new "Draft" status
- Clean break -- no UI mapping layer

### Creator Attribution
- Every order automatically records who created it (linked to logged-in account)
- Displayed on order cards (all columns) and in order details
- Not editable -- system-assigned at creation time

### Claude's Discretion
- Card information architecture (sizing, spacing, typography hierarchy)
- Slide-over panel layout and animation
- Exact WhatsApp modal design
- Loading states and skeleton design
- Exact urgency color values (amber/red thresholds)
- Mobile responsiveness details beyond horizontal scroll
- Audit trail timeline visual design

</decisions>

<specifics>
## Specific Ideas

- WhatsApp payment details modal should pop up immediately after "Submit Order" -- this is the primary workflow for sending payment info to customers
- "Expedite Production" is a power-user feature for rush orders that need to enter today's kitchen run regardless of due date
- "Copy to new order" on cancelled orders saves time when re-creating similar orders
- Due date pills should feel quick and tappable -- the most common scenario is orders due in the next few days
- The slide-over panel for order details should feel like a native panel (not a full page navigation) so order staff can quickly check details without losing Kanban context
- TDD comprehensive testing requested for edge cases (status transitions, reversals, sales aggregator mutations, auto-entry logic) -- route to tdd-test-architect during planning

</specifics>

<deferred>
## Deferred Ideas

- **Line-item specific voucher codes** -- Per-product voucher discounts (e.g., "10k off per Original product") instead of order-level percentage discounts. Would solve the problem of precise per-unit discounting for mixed orders. Significant voucher system rework -- own phase.
- **Payment channel tracking** -- Removed in this phase for simplicity; may revisit if financial reporting needs it
- **Sales channel tracking** -- Removed in this phase; GoFood/K3Mart orders are tracked via their own sync systems anyway

</deferred>

---

*Phase: 14-order-qol*
*Context gathered: 2026-02-15*

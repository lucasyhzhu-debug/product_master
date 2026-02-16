---
phase: 14-order-qol
plan: 08
subsystem: ui
tags: [react, orders, kanban, mobile, discount, stock-override, audit-trail]

# Dependency graph
requires:
  - phase: 14-07
    provides: "Backend: creator name resolution, audit trail Draft event, auto-expedite"
provides:
  - "Stock override dialog with reason input for manager/admin"
  - "Kanban card discount display (order-level + voucher)"
  - "Expedite warning on Today/Tomorrow date pills"
  - "Delivery section simplified to text input + quick buttons"
  - "Mobile responsive Kanban (430px viewport)"
  - "Auto-open slide-over after order creation"
  - "Redesigned Kanban card layout with price top-right"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: ["Auto-open slide-over via URL query param ?open="]

key-files:
  created: []
  modified:
    - src/components/orders/StatusActionButtons.tsx
    - src/components/orders/OrderSlideOver.tsx
    - src/components/orders/KanbanCard.tsx
    - src/components/orders/KanbanBoard.tsx
    - src/components/orders/KanbanColumn.tsx
    - src/components/orders/DueDatePills.tsx
    - src/pages/OrderCreate.tsx
    - src/pages/OrderManager.tsx
    - src/hooks/convex/useOrders.ts
    - convex/orders/queries.ts
    - convex/orders/mutations/statusUpdates.ts

key-decisions:
  - "WhatsApp auto-trigger cancelled — user opens WhatsApp from slide-over manually"
  - "Auto-open slide-over after order creation via ?open= query param"
  - "Kanban card redesign: price top-right, order# + creator on one line, discount below price"
  - "finalTotal (pre-computed) preferred over manual discount calculation"
  - "updateStatus mutation now logs audit trail events for full coverage"

patterns-established:
  - "URL query param for auto-opening slide-over panels on navigation"

# Metrics
duration: 25min
completed: 2026-02-16
---

# Phase 14 Plan 08: Frontend Gap Fixes Summary

**Stock override dialog, discount display, mobile responsive, delivery simplification, Kanban card redesign**

## Performance

- **Duration:** 25 min (including UAT iteration)
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 11

## Accomplishments
- GAP-04: Expedite warning on Today/Tomorrow date pills (amber text)
- GAP-05: Delivery section simplified — single text input + Crystal/Goldfinch quick-tap buttons
- GAP-06: Mobile responsive Kanban — columns fit iPhone 14 Pro (430px), compact header
- GAP-07: Discount display in slide-over with voucher + order-level discount, struck-through price
- GAP-08: Stock override AlertDialog with shortage details, reason textarea, manager/admin gated
- GAP-09: Cancelled (WhatsApp auto-trigger) — replaced with auto-open slide-over after order creation
- GAP-01 (frontend): Creator name wired from auth session, passed as createdByUserId + createdBy
- GAP-02 (frontend): Audit trail renders "created" event; updateStatus now logs transitions
- Kanban card redesigned: customer name + price top-right, order# + creator merged, discount below price

## Task Commits

1. **Task 1: Stock override + discount + audit trail + WhatsApp + creator** - `62a3c55`
2. **Task 2: Order creation UX + mobile responsive** - `a264aaf`
3. **Fix: Creator name, audit trail user names** - `055e05f`
4. **Fix: Auto-open slide-over, drop WhatsApp** - `92e0dba`
5. **Fix: Kanban card voucher discount + finalTotal** - `e6a776c`
6. **Fix: Kanban card layout redesign** - `a819663`

## Deviations from Plan

### User-requested Changes

**1. WhatsApp auto-trigger cancelled**
- User tested GAP-09, modal didn't trigger reliably
- Replaced with auto-open slide-over on order creation
- User can manually click "Send WhatsApp" from slide-over

**2. Kanban card layout redesign**
- User requested price top-right, larger font, order# + creator merged
- Discount badge + struck-through price below net price
- Due date and expedited badge share a row

### Auto-fixed Issues

**1. OrderCreate not passing createdByUserId**
- Root cause of GAP-01: frontend never sent user identity to create mutation
- Fixed by extracting userId from useAuth() and passing to both create and status update

**2. Kanban card missing voucher discount**
- Only calculated orderLevelDiscount, ignored voucherDiscountValue
- Added voucherDiscountValue + finalTotal to KanbanOrder type and calculation

**3. updateStatus mutation missing audit trail**
- Old escape-hatch mutation had no logStatusTransition call
- Added audit logging so Draft→AwaitingPayment transitions are tracked

## Issues Encountered
None

---
*Phase: 14-order-qol*
*Completed: 2026-02-16*

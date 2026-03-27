---
phase: 58-invoice-form-print-view-order-integration
plan: 03
subsystem: ui
tags: [react, invoice, sidebar, order-detail, role-gating]

# Dependency graph
requires:
  - phase: 58-01
    provides: barrel export at src/components/invoice/index.ts
  - phase: 57-02
    provides: useInvoicesByOrder, useDiscardInvoiceDraft hooks
provides:
  - InvoiceSidebarCard component with 3 states (no-invoice, draft, finalized)
  - OrderDetail right sidebar integration (above OrderItems)
  - Role-gated rendering (manager/admin only via parent)
  - Cancelled order edge case handling (view-only or hidden)
  - Multiple finalized invoices with expandable older list
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [parent-delegates role gating, status-based conditional rendering]

key-files:
  created:
    - src/components/invoice/InvoiceSidebarCard.tsx
  modified:
    - src/pages/OrderDetail.tsx
    - src/components/invoice/index.ts

# Decisions
decisions:
  - title: "No useAuth in InvoiceSidebarCard"
    choice: "Parent (OrderDetail) handles isManagerOrAdmin check"
    reason: "Follows parent-delegates pattern used throughout codebase"
  - title: "Optional generatedAt type narrowing"
    choice: "Added ternary guard for formatDateTimeId"
    reason: "generatedAt is v.optional(v.number()) in schema"

# Deviations
deviations:
  - rule: 1
    type: bug-fix
    description: "Fixed optional generatedAt type narrowing — added ternary guard for formatDateTimeId calls"

# Self-Check: PASSED
---

## What was built

InvoiceSidebarCard — a 3-state sidebar card integrated into Order Detail's right sidebar, positioned above OrderItems. The component renders contextually based on invoice state:

- **No invoice**: Shows "Generate Invoice" button (invoiceable statuses only)
- **Draft**: Shows "Continue Editing" + "Discard" with confirmation dialog
- **Finalized**: Shows latest invoice number/date, View/Re-print buttons, +New Invoice, expandable older invoices

Role gating handled by parent (OrderDetail checks `isManagerOrAdmin`). Status gating handled internally (returns null for Draft/AwaitingPayment orders). Cancelled orders with no invoices return null; cancelled orders with existing invoices show view-only mode (no create buttons).

## Commits

| Commit | Description |
|--------|-------------|
| `cdfe88b` | feat(58-03): add InvoiceSidebarCard with 3-state rendering |
| `23481bc` | feat(58-03): integrate InvoiceSidebarCard into OrderDetail right sidebar |

## Verification

- `npm run build` passes
- `npm run type-check` passes
- Human verification: approved

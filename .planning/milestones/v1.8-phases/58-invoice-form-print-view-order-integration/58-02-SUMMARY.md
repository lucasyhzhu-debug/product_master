---
phase: 58-invoice-form-print-view-order-integration
plan: 02
subsystem: ui
tags: [react, invoice, wysiwyg, auto-save, debounce, print, vitest]

# Dependency graph
requires:
  - phase: 58-01
    provides: InvoiceFieldInput, InvoicePrintView, formatIndonesianDate, CSS tokens, barrel export
  - phase: 57-02
    provides: useInvoice hooks, canAccessInvoices permission, useBusinessSettings hook
provides:
  - InvoiceForm WYSIWYG component with debounced auto-save and field color coding
  - InvoicePage route handler with form/preview/print view modes
  - 2 invoice routes in App.tsx with canAccessInvoices permission guard
  - useAutoSave hook (extracted, tested) with 2s setTimeout debounce
  - 5 debounce unit tests with vi.useFakeTimers()
affects: [58-03-InvoiceSidebarCard, order-detail-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [useAutoSave extracted hook for debounce testability, toInvoicePrintData adapter for Invoice-to-PrintData mapping]

key-files:
  created:
    - src/components/invoice/InvoiceForm.tsx
    - src/components/invoice/__tests__/InvoiceForm.test.ts
    - src/pages/InvoicePage.tsx
  modified:
    - src/components/invoice/index.ts
    - src/App.tsx

key-decisions:
  - "Used useDocumentTitle hook (existing project convention) instead of raw useEffect for browser tab title"
  - "Extracted useAutoSave as testable hook with scheduleChange/markInitialized API, tested via renderHook"
  - "toInvoicePrintData adapter function converts Invoice to InvoicePrintData (Pick<Doc> type) to bridge query layer and print view"
  - "Save status 'Saving...' fires inside setTimeout callback, not on keypress -- confirmed by test 5"

patterns-established:
  - "useAutoSave hook: accumulates field changes in ref, debounces with setTimeout, sets status inside callback"
  - "toInvoicePrintData: adapter pattern for converting query-layer types to component-specific Pick types"

requirements-completed: [INV-01, INV-02, INV-04, INV-05, INV-06, INV-07, INV-08, INV-09, INV-10]

# Metrics
duration: 6min
completed: 2026-03-17
---

# Phase 58 Plan 02: InvoiceForm + InvoicePage Summary

**WYSIWYG invoice form with 9-section layout, 2s debounced auto-save via useAutoSave hook, 3-mode InvoicePage (form/preview/print), and 2 App.tsx routes with canAccessInvoices guard**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-17T03:47:44Z
- **Completed:** 2026-03-17T03:53:44Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- InvoiceForm renders 9-section WYSIWYG layout with field color coding (auto=blue, needs-input=amber, edited=white) and debounced auto-save
- useAutoSave hook extracted for testability with 5 passing debounce tests confirming timing, accumulation, and status behavior
- InvoicePage handles form mode (draft editing), preview mode (InvoicePrintView in bordered card), and print view mode (finalized with Print button)
- Both routes registered in App.tsx with canAccessInvoices permission guard and lazy loading

## Task Commits

Each task was committed atomically:

1. **Task 1: InvoiceForm with WYSIWYG layout, auto-save, and debounce tests** - `7669c4c` (feat)
2. **Task 2: InvoicePage route handler + App.tsx routes** - `297a77c` (feat)

## Files Created/Modified
- `src/components/invoice/InvoiceForm.tsx` - WYSIWYG invoice form with useAutoSave hook, field source tracking, 9-section layout
- `src/components/invoice/__tests__/InvoiceForm.test.ts` - 5 debounce unit tests with vi.useFakeTimers()
- `src/components/invoice/index.ts` - Barrel export updated with InvoiceForm + useAutoSave
- `src/pages/InvoicePage.tsx` - 3-mode route handler (form/preview/print) with orderId validation, creatingRef safety, save status tracking
- `src/App.tsx` - 2 lazy-loaded invoice routes with canAccessInvoices permission guard

## Decisions Made
- Used existing `useDocumentTitle` hook instead of raw `useEffect` for browser tab title (project convention)
- Extracted `useAutoSave` as a standalone testable hook rather than testing at component level -- simpler and more reliable with `renderHook`
- Created `toInvoicePrintData` adapter to bridge `Invoice` (query layer type) and `InvoicePrintData` (Pick<Doc> + sellerLogoUrl)
- Save status text transitions: "Saving..." -> "Saved just now" -> "Saved N min ago" with setInterval cleanup on unmount

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- InvoiceForm and InvoicePage complete, ready for Plan 58-03 (InvoiceSidebarCard integration with OrderDetail)
- Both invoice routes are live and accessible to manager/admin roles
- The InvoiceSidebarCard component already exists (from 58-03) and is imported in OrderDetail

## Self-Check: PASSED

All 5 created/modified files exist. Both task commits (7669c4c, 297a77c) found in git log. 5/5 debounce tests pass. npm run build succeeds.

---
*Phase: 58-invoice-form-print-view-order-integration*
*Completed: 2026-03-17*

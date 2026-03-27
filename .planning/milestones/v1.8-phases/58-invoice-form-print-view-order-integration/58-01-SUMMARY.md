---
phase: 58-invoice-form-print-view-order-integration
plan: 01
subsystem: ui
tags: [invoice, date-fns, print-css, react, tailwind, accessibility]

# Dependency graph
requires:
  - phase: 57-invoice-backend-business-settings
    provides: "invoices schema (Doc<'invoices'>), invoice queries/mutations, useInvoice hooks"
provides:
  - "formatIndonesianDate helper for Indonesian full-date formatting"
  - "InvoiceFieldInput component with FieldSource color coding"
  - "InvoicePrintView 9-section invoice layout component"
  - "Barrel export at src/components/invoice/index.ts"
  - "Invoice semantic CSS color tokens (--invoice-field-auto, --invoice-field-input)"
  - "@media print global styles for invoice printing"
affects: [58-02, 58-03]

# Tech tracking
tech-stack:
  added: ["date-fns locale/id (Indonesian locale)"]
  patterns: ["CSS custom property tokens for invoice field states", "Pick<Doc<table>> for derived types"]

key-files:
  created:
    - src/lib/__tests__/formatIndonesianDate.test.ts
    - src/components/invoice/InvoiceFieldInput.tsx
    - src/components/invoice/InvoicePrintView.tsx
    - src/components/invoice/index.ts
  modified:
    - src/lib/dateUtils.ts
    - src/index.css

key-decisions:
  - "InvoicePrintData uses Pick<Doc<'invoices'>, ...> & { sellerLogoUrl } since query layer enriches storage ID to URL"
  - "Invoice field tokens defined as CSS custom properties in :root (light-mode only, print-oriented feature)"
  - "Brand bar uses h-1 (4px) with bg-brand class and print-color-adjust: exact for print fidelity"

patterns-established:
  - "Invoice CSS tokens: --invoice-field-auto, --invoice-field-auto-border, --invoice-field-input, --invoice-field-input-border"
  - "Query-enriched types: Pick<Doc<T>> + query-added fields via intersection type"

requirements-completed: [IPRNT-01, IPRNT-02, IPRNT-03, IPRNT-04, INV-03, INV-06]

# Metrics
duration: 8min
completed: 2026-03-17
---

# Phase 58 Plan 01: Invoice Foundation Components Summary

**formatIndonesianDate helper with 4 unit tests, InvoiceFieldInput with CSS token color coding, 9-section InvoicePrintView layout, barrel export, and @media print global styles**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-17T01:48:23Z
- **Completed:** 2026-03-17T01:56:23Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- formatIndonesianDate produces "Senin, 16 Maret 2026" format using date-fns with Indonesian locale
- InvoiceFieldInput renders color-coded inputs via CSS custom property tokens (auto=blue, needs-input=amber, edited=white)
- InvoicePrintView renders complete 9-section invoice: brand bar, header, bill-to, order details, items table, totals, payment info, signature area, footer
- InvoicePrintData derived from Pick<Doc<"invoices">> to prevent type drift
- All major invoice sections have aria-label attributes for accessibility
- @media print CSS hides app chrome, forces white background, prints brand bar in color

## Task Commits

Each task was committed atomically:

1. **Task 1: Indonesian date formatter + tests + InvoiceFieldInput** - `1fb69e1` (feat, TDD)
2. **Task 2: InvoicePrintView + barrel + CSS tokens + print styles** - `a4b394c` (feat)

## Files Created/Modified
- `src/lib/dateUtils.ts` - Added formatIndonesianDate using date-fns locale/id
- `src/lib/__tests__/formatIndonesianDate.test.ts` - 4 unit tests for date formatting
- `src/components/invoice/InvoiceFieldInput.tsx` - Color-coded input with FieldSource tracking
- `src/components/invoice/InvoicePrintView.tsx` - 9-section invoice print layout
- `src/components/invoice/index.ts` - Barrel export for invoice components
- `src/index.css` - Invoice semantic color tokens + @media print global styles

## Decisions Made
- InvoicePrintData uses `Pick<Doc<"invoices">, ...> & { sellerLogoUrl }` since the query layer resolves `sellerLogoStorageId` to a URL -- the schema has `sellerLogoStorageId` but queries enrich with `sellerLogoUrl`
- Invoice field source tokens defined as CSS custom properties in `:root` (light-mode only, deliberate choice since invoices are a print-oriented feature)
- Brand accent bar uses `h-1` (4px) with `bg-brand` class and `print-color-adjust: exact` for print fidelity

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] InvoicePrintData sellerLogoUrl field not on Doc<"invoices">**
- **Found during:** Task 2 (InvoicePrintView creation)
- **Issue:** Plan specifies `Pick<Doc<"invoices">, ... | "sellerLogoUrl">` but schema has `sellerLogoStorageId`, not `sellerLogoUrl`. The query layer resolves the storage ID to a URL and adds `sellerLogoUrl` to the returned object.
- **Fix:** Used `Pick<Doc<"invoices">, ...schemaFields> & { sellerLogoUrl?: string | null }` intersection type
- **Files modified:** src/components/invoice/InvoicePrintView.tsx
- **Verification:** TypeScript type-check passes, build succeeds
- **Committed in:** a4b394c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential type correctness fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All foundation components ready for Plan 02 (InvoiceForm, InvoicePage) and Plan 03 (InvoiceSidebarCard)
- InvoicePrintView accepts InvoicePrintData derived from Doc<"invoices"> -- Plan 02 will map query results to this type
- Barrel export ready for imports from Plan 02 and Plan 03

---
*Phase: 58-invoice-form-print-view-order-integration*
*Completed: 2026-03-17*

## Self-Check: PASSED
- All 7 files exist on disk
- Both task commits (1fb69e1, a4b394c) verified in git log

---
phase: 57-invoice-backend-business-settings
plan: 01
subsystem: api
tags: [convex, invoices, business-settings, schema, mutations, queries, testing]

# Dependency graph
requires:
  - phase: 41-accounting-foundation
    provides: bankAccounts table and Chart of Accounts
provides:
  - businessSettings singleton table and CRUD API
  - invoiceCounters table for race-safe sequential numbering
  - invoices table with seller/buyer/order snapshots
  - customer companyName/npwp/billingAddress extension
  - Invoice createDraft/updateDraft/discardDraft/finalize mutations
  - Invoice getByOrder/getById queries
  - 51 unit tests for invoice logic and businessSettings behavior
affects: [57-02-business-settings-ui, 58-invoice-form-print-view]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-helper-extraction for testable invoice logic, INVOICEABLE_STATUSES allowlist pattern, singleton upsert with storage cleanup]

key-files:
  created:
    - convex/businessSettings/queries.ts
    - convex/businessSettings/mutations.ts
    - convex/invoices/queries.ts
    - convex/invoices/mutations.ts
    - convex/invoices/__tests__/mutations.test.ts
    - convex/businessSettings/__tests__/mutations.test.ts
  modified:
    - convex/schema.ts
    - convex/customers/mutations.ts

key-decisions:
  - "Extracted 5 pure helpers from invoice mutations for testability (isInvoiceableStatus, buildInvoicePrefix, formatInvoiceNumber, computeDiscount, computeCustomerWriteBack)"
  - "Used .first() not .unique() for invoiceCounters lookup (gracefully handles duplicate rows)"
  - "Used INVOICEABLE_STATUSES allowlist (not blocklist) for invoice creation validation"
  - "paymentStatus/paymentMethod snapshotted at draft creation, excluded from updateDraft args"

patterns-established:
  - "Invoice number format: INV-YYMM-NNN with WIB timezone for month boundary"
  - "Allowlist pattern: INVOICEABLE_STATUSES Set for forward-compatible status validation"
  - "Customer write-back: finalize writes buyerCompany/buyerNpwp/buyerAddress back to customer record"

requirements-completed: [IDAT-01, IDAT-02, IDAT-03, IDAT-04]

# Metrics
duration: 11min
completed: 2026-03-17
---

# Phase 57 Plan 01: Invoice Backend & Business Settings Summary

**3 new tables (businessSettings, invoiceCounters, invoices), 9 Convex functions, customer extension, and 51 unit tests for invoice numbering, status validation, and singleton lifecycle**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-16T19:42:12Z
- **Completed:** 2026-03-16T19:53:42Z
- **Tasks:** 4
- **Files modified:** 8

## Accomplishments
- Schema extended with 3 new tables (businessSettings singleton, invoiceCounters for sequential numbering, invoices with full seller/buyer/order snapshots) and customers extended with companyName, npwp, billingAddress
- Complete invoice API: createDraft auto-fills from order+customer+settings with allowlist validation and bank account guard; updateDraft for draft editing; discardDraft for deletion; finalize assigns race-safe INV-YYMM-NNN number and writes back buyer data to customer
- businessSettings API: get query resolves logo URL and bank account; upsert mutation creates/updates singleton with old logo cleanup; generateUploadUrl for logo uploads
- 51 unit tests covering INVOICEABLE_STATUSES allowlist (all non-invoiceable statuses rejected), WIB prefix generation, INV-YYMM-NNN formatting, discount computation (flat + percentage), customer write-back diff, and businessSettings singleton behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema -- Add 3 new tables and extend customers** - `8d17090` (feat)
2. **Task 2: Backend -- businessSettings queries and mutations** - `735a907` (feat)
3. **Task 3: Backend -- invoice queries, mutations, and customer write-back** - `6857556` (feat)
4. **Task 4: Tests -- invoice mutations and businessSettings** - `a8f265c` (test)

## Files Created/Modified
- `convex/schema.ts` - Added businessSettings, invoiceCounters, invoices tables; extended customers with companyName, npwp, billingAddress
- `convex/businessSettings/queries.ts` - get query returning singleton with resolved logoUrl and bank account
- `convex/businessSettings/mutations.ts` - upsert (create/update singleton with logo cleanup) and generateUploadUrl
- `convex/invoices/queries.ts` - getByOrder (sorted by creation time desc) and getById with logo URL resolution
- `convex/invoices/mutations.ts` - createDraft, updateDraft, discardDraft, finalize with 5 exported pure helpers
- `convex/customers/mutations.ts` - Added companyName, npwp, billingAddress to update mutation args
- `convex/invoices/__tests__/mutations.test.ts` - 44 tests for invoice logic
- `convex/businessSettings/__tests__/mutations.test.ts` - 7 tests for singleton behavior

## Decisions Made
- Extracted 5 pure helpers from invoice mutations for testability, following project convention of pure function testing over convex-test runtime (per bigsellerOrders test pattern)
- Used `.first()` not `.unique()` for invoiceCounters lookup to gracefully handle potential duplicate rows
- Used INVOICEABLE_STATUSES as a Set allowlist (not blocklist) -- prevents future status additions from silently becoming invoiceable
- paymentStatus and paymentMethod are snapshotted from order at draft creation time and excluded from updateDraft editable fields
- Placed businessSettings table after channelUsage/shippingAgencyUsage section; invoiceCounters/invoices after bankAccounts in the accounting section

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All schema and backend functions ready for Plan 02 (Business Settings UI page)
- Invoice mutations ready for Phase 58 (Invoice Form, Print View, Order Integration)
- Full test suite passing: 1050 tests across 60 files (51 new tests added)
- `npm run type-check`, `npm run build`, `npm run test` all pass

## Self-Check: PASSED

All 8 created/modified files verified present. All 4 task commits verified in git history.

---
*Phase: 57-invoice-backend-business-settings*
*Completed: 2026-03-17*

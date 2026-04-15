# Phase 73 Deferred Items

## Pre-existing test failures observed during 73-02 execution

These failures were verified to pre-date Plan 73-02 changes (ran at 73-01 base
commit 0bff182d and same failures reproduced). Out of scope for this plan.

- `tests/convex/gobizAdapter.test.ts` — 2 failures in "saveRevenue with new
  GoBiz fields" (adBurn/promoBurn/gobizOrderNumber handling)
- `tests/convex/k3martCockpit.test.ts` — 4 failures in "getStockMovementHistory"
  (filters and limit parameter)
- `convex/bigsellerOrders/__tests__/integration.test.ts` — 1 failure in
  "BigSeller sync data flow simulation > all orders produce valid revenue records"
- `src/lib/__tests__/csvImportValidation.test.ts` — 10 failures in
  "parseAndValidateCsv" (CSV parsing edge cases)

None of these files were modified by Phase 73 Plan 01 or Plan 02. They
should be addressed by the owning phase/subsystem.

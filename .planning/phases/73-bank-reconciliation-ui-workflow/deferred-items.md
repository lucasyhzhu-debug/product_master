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

## Pre-existing `npm run build` failures (discovered during Plan 04)

`npm run build` fails with ~35 TypeScript errors in analytics files:

- `src/components/analytics/*.tsx` — `Parameter 'x' implicitly has an 'any' type` (TS7006)
- `src/hooks/convex/useAnalytics.ts` — `Property 'unitEconomics' does not exist on type ...` (TS2339)

**Root cause:** These files are **untracked** in the base commit `7270b827` (73-03
tip). They are leftover artifacts from a previous worktree's Phase 80 execution
that weren't cleaned up. The supporting backend files (`convex/reports/unitEconomics.ts`,
`productionUnitHelpers.ts`, `channelTaxonomy.ts`, `revenueHelpers.ts`) are also
untracked.

**Out of scope for Plan 04** — per SCOPE BOUNDARY rule, Plan 04 only auto-fixes
issues DIRECTLY caused by its own changes. `npm run type-check` (tsc --noEmit)
passes cleanly against all Plan 04 work. `npm run build` (tsc -b + vite build)
fails because of the pre-existing stray files. Verified by stashing Plan 04
changes and re-running build — same errors reproduce at the base commit.

**Resolution:** The orchestrator should clean the worktree (remove untracked
analytics files) OR regenerate Convex `_generated/api.d.ts` from a clean
checkout before merging Phase 73.

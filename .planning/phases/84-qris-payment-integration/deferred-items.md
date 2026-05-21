# Phase 84 — Deferred Items

## Pre-existing convex-tree tsc errors in `convex/qrisPayments/__tests__/_factory.ts`

- **Discovered during:** Plan 04 (webhook) `npm run build` (`tsc -b` includes the convex project).
- **Errors (3):** `_factory.ts:232-233` — `withIndex("by_component_location", q => q.eq("componentTypeId", ...).eq("locationId", ...))` fails type resolution (`'by_component_location' not assignable to keyof SystemIndexes`).
- **Root cause:** Stale/structural convex `_generated` typing does not surface the `componentStock.by_component_location` compound index to `tsc` — even though `convex/schema.ts:953-955` defines it correctly. This is a Plan-01 RED-scaffold artifact.
- **Pre-existing:** Documented out-of-scope in `84-03-SUMMARY.md` (lines 89, 108) — Plan 03 shipped with `npm run type-check` (frontend) green while this convex-tree error existed. It pre-dates Plan 04 and is NOT caused by the webhook work.
- **Impact:** Does NOT affect vitest (the qris suites pass) nor frontend `npm run type-check` (exit 0). Only `tsc -b` / `npx tsc -p convex` surface it.
- **Disposition:** Out of scope for Plan 04 (unrelated test-factory file). Should be fixed in the phase verification/cleanup pass — likely by aligning the factory's index read with the canonical `componentStock` aggregate read helper or correcting the test-factory typing.

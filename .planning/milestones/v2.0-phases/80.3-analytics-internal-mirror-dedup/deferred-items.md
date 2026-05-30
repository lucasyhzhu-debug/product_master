# Phase 80.3 — Deferred Items

Out-of-scope discoveries during execution. Not fixed; documented per the SCOPE BOUNDARY rule (only auto-fix issues directly caused by the current task's changes).

## Pre-existing lint errors in `convex/reports/unitEconomics.ts`

```
717:3   error  '_args' is defined but never used  @typescript-eslint/no-unused-vars
718:3   error  '_mode' is defined but never used  @typescript-eslint/no-unused-vars
839:59  error  '_pre' is defined but never used   @typescript-eslint/no-unused-vars
```

These were introduced in Phase 80 / 80.1 (commits `daf2997a`, `ecd42b8f`) and exist on `main` before this branch. The Phase 80.3 R5 edit did not touch lines 717/718/839. Suggest a follow-up cleanup phase to either remove the underscore-prefixed unused params or annotate ESLint to ignore underscore-prefixed identifiers.

## Pre-existing lint errors elsewhere (504 total project-wide)

`npm run lint` reports 504 errors / 19 warnings across the whole codebase (mostly `@typescript-eslint/no-explicit-any` in test fixtures, `@typescript-eslint/no-unused-vars` in legacy code paths). None are in files modified by this phase. Out of scope.

## Verification for the lint scope claim

Files touched by Phase 80.3:
- `convex/reports/unitEconomics.ts` (3 pre-existing errors at 717/718/839 — none introduced)
- `convex/reports/__tests__/unitEconomics.test.ts` (NEW — 0 lint errors)
- `convex/reports/__tests__/unitEconomics-unlinked.test.ts` (modified — 0 lint errors)

---
phase: 70-data-accuracy-foundation
plan: 02
subsystem: database, ui
tags: [convex, schema, cost-calculator, inline-editing, employee-profile]

# Dependency graph
requires:
  - phase: 70-01
    provides: internal revenue pipeline for Income Statement COGS consumption
provides:
  - cogsOverrideIdr field on menuProducts for flat COGS bypass
  - buildProductCOGSMap override parameter for Income Statement accuracy
  - Inline COGS override editing on MenuProductsManager product cards
  - Employee profile fields (hireDate, baseSalaryIdr, bankAccountHolderName) on users
affects: [72-bank-reconciliation, 74-staff-attendance, income-statement]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-editing-with-override-badge, optional-third-param-backward-compat]

key-files:
  created: []
  modified:
    - convex/schema.ts
    - convex/lib/costCalculator.ts
    - convex/menuProducts/mutations.ts
    - convex/reports/incomeStatement.ts
    - convex/auth/mutations.ts
    - convex/auth/queries.ts
    - src/pages/MenuProductsManager.tsx
    - src/hooks/convex/useMenuProducts.ts
    - src/pages/UsersManager.tsx
    - tests/convex/costCalculator.test.ts

key-decisions:
  - "COGS override uses optional third param on buildProductCOGSMap for backward compatibility"
  - "Override sets production=override, packaging=0, total=override (flat combined value)"
  - "Inline editing on product card (not ProductForm dialog) per D-09 pattern"

patterns-established:
  - "Inline override editing: click value to edit, Enter/blur to save, Escape to cancel, amber Override badge"
  - "Backward-compatible function extension: optional third param with null-check skip logic"

requirements-completed: [DA-03, DA-04]

# Metrics
duration: 15min
completed: 2026-04-10
---

# Phase 70 Plan 02: COGS Override & Employee Profile Summary

**Flat COGS override per menu product with inline editing on product cards, plus employee financial metadata (hire date, salary, bank holder name) on users table**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-10T06:55:38Z
- **Completed:** 2026-04-10T07:10:45Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- COGS override field on menuProducts schema that bypasses BOM calculation in Income Statement when set
- Inline click-to-edit COGS override on MenuProductsManager product cards with amber Override badge
- Employee profile fields (hireDate, baseSalaryIdr, bankAccountHolderName) on users table for downstream payroll/reconciliation
- 5 new unit tests for buildProductCOGSMap override behavior (TDD)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED):** TDD failing tests - `317aa62` (test)
2. **Task 1 (GREEN):** Schema + costCalculator + mutations backend - `c8be102` (feat)
3. **Task 2:** Inline COGS override UI + UsersManager employment section - `fbb81e1` (feat)

## Files Created/Modified
- `convex/schema.ts` - Added cogsOverrideIdr on menuProducts, hireDate/baseSalaryIdr/bankAccountHolderName on users
- `convex/lib/costCalculator.ts` - buildProductCOGSMap accepts optional menuProducts param for override
- `convex/menuProducts/mutations.ts` - update mutation accepts cogsOverrideIdr and clearCogsOverride
- `convex/reports/incomeStatement.ts` - Passes menuProductsList to buildProductCOGSMap
- `convex/auth/mutations.ts` - updateUser accepts hireDate, baseSalaryIdr, bankAccountHolderName
- `convex/auth/queries.ts` - listUsers returns new employee profile fields
- `src/pages/MenuProductsManager.tsx` - Inline COGS override editing with Override badge
- `src/hooks/convex/useMenuProducts.ts` - cogsOverrideIdr on interfaces, clearCogsOverride on update input
- `src/pages/UsersManager.tsx` - Employment Details section in edit dialog
- `tests/convex/costCalculator.test.ts` - 5 new override tests

## Decisions Made
- COGS override uses optional third param on buildProductCOGSMap for backward compatibility (all existing callers unaffected)
- Override sets production=override, packaging=0, total=override (flat combined value since override represents total COGS)
- Inline editing on product card per D-09 pattern (NOT in ProductForm dialog)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added employee fields to listUsers query**
- **Found during:** Task 2 (UsersManager frontend)
- **Issue:** `convex/auth/queries.ts` listUsers selects specific fields and did not include the new hireDate/baseSalaryIdr/bankAccountHolderName fields, causing TS2339 errors
- **Fix:** Added the 3 new fields to the listUsers return map
- **Files modified:** `convex/auth/queries.ts`
- **Verification:** `npm run type-check` passes
- **Committed in:** fbb81e1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for the frontend to access new fields. No scope creep.

## Issues Encountered
- Pre-existing type error in `src/pages/MyExpenses.tsx` (line 176, TS2322) causes `npm run build` (`tsc -b`) to fail. This is NOT caused by this plan - it was introduced by commit `20a940e1`. Logged to `deferred-items.md`. `npm run type-check` passes and `vite build` succeeds.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- COGS override ready for production use once deployed
- Employee profile fields ready for Phase 74 (Staff Attendance) and Phase 72 (Bank Reconciliation)
- Pre-existing MyExpenses.tsx type error should be fixed before next `npm run build` verification

## Self-Check: PASSED

All 10 modified files verified present. All 3 task commits verified in git log.

---
*Phase: 70-data-accuracy-foundation*
*Completed: 2026-04-10*

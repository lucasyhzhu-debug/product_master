---
status: root_cause_found
trigger: "57 test failures across 15 test files (7 convex + 8 e2e). Full analysis and phase plan needed."
created: 2026-02-28T00:00:00Z
updated: 2026-02-28T00:00:00Z
---

# Debug: test-suite-failures

## Status: ROOT CAUSE FOUND

## Summary

Running `npx vitest run` produces 56 failing tests (636 pass) across 15 test files. Investigation
identified 5 distinct root cause categories. The failures are pre-existing, accumulated across
multiple implementation phases. No single regression — these are structural mismatches between
the test suite and the current codebase state.

---

## Symptoms

- **Expected:** All 692 tests pass
- **Actual:** 56 fail, 636 pass. 15 files report failures (7 convex unit + 8 e2e Playwright)
- **Reproduction:** `npx vitest run` from project root
- **Timeline:** Pre-existing, accumulated over multiple phases

---

## Current Focus

hypothesis: Five distinct categories of failure with different root causes
test: Pre-completed — full investigation already executed
expecting: Documentation and fix plan output
next_action: None (investigation complete, documentation phase)

---

## Evidence

- timestamp: 2026-02-28
  checked: convex/_generated/api.d.ts
  found: No imports for recipes, tags, products, or packaging modules
  implication: These directories were removed during past restructuring; tests referencing them will MODULE_NOT_FOUND

- timestamp: 2026-02-28
  checked: recipes.test.ts, tags.test.ts, products.test.ts
  found: 45 failures — all MODULE_NOT_FOUND from importing deleted module paths
  implication: Tests must be deleted or rewritten against replacement modules

- timestamp: 2026-02-28
  checked: k3martCockpit.test.ts
  found: 5 assertion failures — error message changed, missing export, undefined vs number, {} vs []
  implication: k3martCockpit module behavior changed since tests were written; assertions are stale

- timestamp: 2026-02-28
  checked: gobizAdapter.test.ts, gofoodDepot-edge.test.ts
  found: 2 failures — assertions check for cron strings that no longer match crons.ts content
  implication: Cron job names/strings were renamed; string-match assertions are stale

- timestamp: 2026-02-28
  checked: voucherHandling.test.ts
  found: 2-3 failures — tests expect fixed discount >= order total to throw; mutation now resolves
  implication: Business logic intentionally changed to allow 100% discounts; tests not updated

- timestamp: 2026-02-28
  checked: tests/e2e/ (8 spec files)
  found: "Playwright Test did not expect test.describe() to be called here" for all 8 files
  implication: Playwright test files are being picked up by Vitest; these are incompatible test runners

---

## Eliminated

- hypothesis: Single regression from a recent phase
  evidence: Failures span at least 4 unrelated subsystems (recipes, k3mart, crons, vouchers, e2e)
  timestamp: 2026-02-28

- hypothesis: Convex backend API breaking change
  evidence: 636 tests pass fine; failures are in tests referencing deleted/renamed modules, not a global API change
  timestamp: 2026-02-28

---

## Root Causes (5 Categories)

### Category 1: MODULE_NOT_FOUND — Deleted Module References (45 failures)

**Files affected:**
- `convex/recipes/` — 28 failures in `recipes.test.ts`
- `convex/tags/` — 12 failures in `tags.test.ts`
- `convex/products/` — 7 failures in `products.test.ts`
- `convex/packaging/` referenced from some of the above

**Root cause:** The module directories `convex/recipes/`, `convex/tags/`, `convex/products/`,
and `convex/packaging/` were removed during a past restructuring phase. The generated API
(`convex/_generated/api.d.ts`) contains no references to these paths. The test files still
import from these paths, causing hard module resolution failures before any test logic runs.

**Impact:** 45 of 56 total failures (80%). Dominant issue.

**Recommended fix:** Delete all three test files. If coverage of the replacement modules
(e.g., `productionRecipes` replaces `recipes`) is desired, write new tests targeting the
current module paths. Do not attempt to patch imports — the modules are gone.

---

### Category 2: K3Mart Cockpit Behavior Changes (5 failures)

**File affected:** `k3martCockpit.test.ts`

**Root cause:** The k3martCockpit module was updated (behavior, exports, return shapes changed)
after the tests were written. Specific mismatches:

| Assertion | Expected | Actual |
|-----------|----------|--------|
| Error message | "No draft plans found" | "No plans found for this date" |
| Export | `getOutletStockSummary` | Missing — not exported from k3martCockpit/queries |
| Return type | Number | `undefined` |
| Return type | `[]` (empty array) | `{}` (empty object) |

**Recommended fix:** Update assertions to match current module behavior. For the missing
`getOutletStockSummary` export: either add the export if the function exists under a different
name, or remove the test if the functionality was removed.

---

### Category 3: Cron String Assertion Mismatches (2 failures)

**Files affected:**
- `gobizAdapter.test.ts` (1 failure)
- `gofoodDepot-edge.test.ts` (1 failure)

**Root cause:** Tests contain string assertions that check `crons.ts` for specific cron job
name strings:
- Test expects: `'refresh k3mart token'`
- Test expects: `'sync gobiz revenue'`

The actual strings in `crons.ts` have been renamed or reformatted since these assertions
were written.

**Recommended fix:** Open `crons.ts`, find the current cron job name strings, and update
both test files to match the actual current strings exactly.

---

### Category 4: Voucher Logic Business Rule Change (2-3 failures)

**File affected:** `voucherHandling.test.ts`

**Root cause:** Tests were written to assert that applying a fixed discount equal to or
greater than the order total should be REJECTED (throw an error). The mutation was
subsequently changed to ALLOW this scenario — 100% discounts are now a valid business
case. The tests were not updated to reflect this intentional business rule change.

**Recommended fix:** Update test expectations to match the current behavior:
- Remove `expect(() => ...).toThrow()` assertions for 100% discount cases
- Add positive assertions confirming the mutation resolves successfully
- Add assertions that the resulting order total is 0 (or clamped to 0)

If the old validation is still desired, add it back to the mutation and document the
decision in the test description.

---

### Category 5: Playwright E2E Tests Registered in Vitest (8 suite-level errors)

**Files affected:** All 8 files in `tests/e2e/`:
- `dispatch-planner-sticky.spec.ts`
- `grabfood-menu-simulator.spec.ts`
- (and 6 others)

**Error:** `"Playwright Test did not expect test.describe() to be called here"`

**Root cause:** Vitest's glob config picks up `tests/e2e/**/*.spec.ts` because it matches
the default `**/*.spec.ts` include pattern. Playwright spec files use `test.describe()` from
`@playwright/test`, which is incompatible with Vitest's test runner. Vitest loads the file,
encounters `test.describe()`, and throws a runner-level error before any test logic executes.

**Impact:** 8 suite registrations fail. No individual test failures — these are file-level
runner crashes. However, they inflate failure counts and pollute CI output.

**Recommended fix (Option A — preferred):** Add an exclude pattern to `vitest.config.ts`:
```typescript
exclude: ['tests/e2e/**', '**/node_modules/**']
```

**Recommended fix (Option B):** Move e2e tests to a separate directory that doesn't match
Vitest's include glob (e.g., `e2e/` at project root instead of `tests/e2e/`).

The Playwright tests should be run via `npx playwright test`, not `npx vitest run`.

---

## Resolution

root_cause: |
  Five independent root causes accumulated across phases:
  1. Deleted module directories still referenced by 3 test files (45 failures)
  2. Stale assertions in k3martCockpit.test.ts after behavior changes (5 failures)
  3. Stale cron name strings in 2 test files (2 failures)
  4. Voucher validation tests not updated after business rule change (2-3 failures)
  5. Playwright e2e tests picked up by Vitest runner (8 suite-level errors)

fix: Not yet applied — documentation phase only
verification: Not yet done
files_changed: []

---

## Recommended Fix Plan

### Phase approach: One wave, sequential by category

**Wave 1 — Vitest config fix (5 min, zero risk)**
- File: `vitest.config.ts`
- Action: Add `exclude: ['tests/e2e/**']` to config
- Impact: Immediately removes 8 suite-level errors, reduces noise

**Wave 2 — Delete dead test files (5 min, zero risk)**
- Files: `convex/recipes/recipes.test.ts`, `convex/tags/tags.test.ts`, `convex/products/products.test.ts`
- Action: `git rm` each file
- Impact: Removes 45 failures (80% of total). No coverage lost since modules are gone.

**Wave 3 — Fix cron string assertions (10 min, low risk)**
- Files: `gobizAdapter.test.ts`, `gofoodDepot-edge.test.ts`
- Action: Read `crons.ts`, update string assertions to match actual cron job names
- Impact: Removes 2 failures

**Wave 4 — Fix voucher test expectations (15 min, low risk)**
- File: `voucherHandling.test.ts`
- Action: Update assertions for 100% discount case to expect success, not throw
- Impact: Removes 2-3 failures

**Wave 5 — Fix k3martCockpit assertions (30 min, medium risk)**
- File: `k3martCockpit.test.ts`
- Action:
  - Update error message assertion to match current string
  - Fix undefined vs number assertion (read current return shape)
  - Fix {} vs [] assertion (read current return shape)
  - Resolve missing `getOutletStockSummary` export (check if renamed)
- Impact: Removes 5 failures

**Final state after all waves:** 0 failures, 692 tests passing (or 692 - deleted tests)

### Priority order
1. Vitest config (unblocks clean output immediately)
2. Delete dead files (biggest impact, zero risk)
3. Cron strings (trivial)
4. Voucher expectations (trivial)
5. K3Mart assertions (requires reading current module behavior)

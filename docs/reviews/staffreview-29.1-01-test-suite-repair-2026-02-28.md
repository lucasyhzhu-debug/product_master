# Staff Review: Plan 29.1-01 — Test Suite Repair

**Date:** 2026-02-28
**Plan:** `.planning/phases/29.1-test-suite-repair/29.1-01-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** Revise (minor)

The plan correctly identifies all 5 root cause categories and proposes sensible fixes. The wave structure is sound and the diagnostic work is thorough. However, several implementation details are underspecified — particularly the K3Mart `internalQuery` migration, the cron test fix approach, and the helper pruning scope. Addressing these gaps before implementation will prevent unnecessary back-and-forth during execution.

---

## 2. Critical Issues (Must Fix)

Issues that would cause implementation failure or incorrect test assertions.

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | K3Mart `getOutletStockSummary` → `internalQuery` requires `api.` → `internal.` import switch | Logic | Wave 2, K3Mart task |
| 2 | Vitest E2E exclude pattern must merge with existing `exclude` array | Implementation | Wave 1, Vitest config task |
| 3 | Voucher test fix is ambiguous (two options offered, neither chosen) | Ambiguity | Wave 2, Voucher task |

**Details:**

### Issue 1: K3Mart internalQuery import switch not specified

The plan says: *"Change `getOutletStockSummary` to `getOutletStockSummaryInternal`"*

**Actual situation:** `getOutletStockSummary` was renamed AND changed from a public `query` to an `internalQuery` (see `convex/k3martCockpit/queries.ts:18`). This means:
- The function no longer appears in `api.k3martCockpit.queries` (confirmed: grep of `api.d.ts` returns no matches)
- Tests must switch from `api.` to `internal.` import path
- Test calls must change from `t.query(api.k3martCockpit.queries.getOutletStockSummary, ...)` to `t.query(internal.k3martCockpit.queries.getOutletStockSummaryInternal, ...)`

**Recommendation:** Explicitly specify in the plan:
1. Add `internal` to the import from `../../convex/_generated/api` (if not already imported)
2. Replace `api.k3martCockpit.queries.getOutletStockSummary` → `internal.k3martCockpit.queries.getOutletStockSummaryInternal` in both test calls (lines 604, 616)

### Issue 2: Vitest exclude pattern must merge with existing array

The plan says: *"Exclude `tests/e2e/**` from Vitest include patterns"*

**Actual situation:** `vitest.config.ts` already has an `exclude` array at line 16:
```typescript
exclude: ['node_modules', 'dist', 'convex/_generated'],
```

The fix must ADD `'tests/e2e/**'` to this existing array, not create a new `exclude` property (which would overwrite the existing exclusions and break the config).

**Recommendation:** Specify the exact change:
```typescript
exclude: ['node_modules', 'dist', 'convex/_generated', 'tests/e2e/**'],
```

### Issue 3: Voucher test fix is ambiguous

The plan says: *"either (a) assert the mutation resolves successfully with 0 final price, or (b) be removed if the scenario is no longer meaningful"*

An implementer should not be making business logic decisions during execution. The plan should choose.

**Recommendation:** Choose option (a) — update assertions to expect successful resolution. The 100% discount was an intentional business rule change (confirmed in CONTEXT.md). The tests should verify the new behavior:
```typescript
// Was: .rejects.toThrow('Final price must be greater than 0')
// Now: resolves successfully
const result = await createOrderWithVoucher(t, { voucherId, orderTotal: 100000 });
expect(result.orderId).toBeDefined();
```

---

## 3. Improvements (Recommended)

Changes that would significantly improve the implementation.

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Specify orphaned helper functions to remove | Medium | Low |
| 2 | Specify cron test fix approach concretely | Medium | Low |
| 3 | Add `npm run type-check` to success criteria | Low | Trivial |
| 4 | Simplify Wave 1 agent assignment | Low | Trivial |

**Details:**

### Improvement 1: Specify orphaned helper functions to remove

The plan says: *"Remove test helper functions only used by deleted tests — `tests/convex/helpers.ts` (audit + prune unused exports)"*

After analysis, these 7 functions are ONLY used by `recipes.test.ts` and `products.test.ts` (both being deleted) and should be explicitly listed for removal:

| Function | Used By (all deleted) |
|----------|----------------------|
| `setupRecipeWithVersion` | recipes.test.ts, products.test.ts |
| `setupReusableRecipe` | recipes.test.ts |
| `setupRecipeWithLinkedComponent` | recipes.test.ts |
| `setupPackagingWithVersion` | recipes.test.ts, products.test.ts |
| `setupProductWithRecipe` | recipes.test.ts, products.test.ts |
| `createPackagingMaterial` | products.test.ts |
| `createIngredient` | recipes.test.ts, products.test.ts |

Functions to KEEP (used by surviving tests): `createDefaultStorageLocation`, `createCustomer`, `createTag`, `createMenuProduct`, `createExternalRevenue`, `createStorageLocation`, `createPackagingComponentType`, `createInventoryBatch`, `verifyBatchState`, `createVoucher`, `createOrderWithVoucher`, `verifyVoucherUsage`, `createComponentType`, `createMenuProductWithBOM`, `createBasicOrder`, `verifyNoGhostBalls`, `createOrderAtStatus`, `verifyInventoryReserved`, `verifyInventoryReleased`, `verifyOrderFullyCancelled`.

### Improvement 2: Specify cron test fix approach concretely

The plan says: *"Update `gobizAdapter.test.ts` cron test to assert crons file has no active jobs"*

Both test files (`gobizAdapter.test.ts:20-28`, `gofoodDepot-edge.test.ts:471-479`) read `crons.ts` via `readFileSync` and assert specific cron string contents. Since `crons.ts` is now empty (just `cronJobs()` with no registered crons), the fix should:

1. Replace `expect(cronsContent).toContain("refresh k3mart token")` with `expect(cronsContent).not.toContain("refresh k3mart token")` — OR —
2. Simply delete the entire cron assertion test blocks from both files (since asserting "file doesn't contain X" is fragile and low-value)

**Recommendation:** Option 2 — delete the cron assertion blocks entirely. They're testing file content via string matching, which is brittle. If crons are re-added later, proper behavioral tests should be written.

### Improvement 3: Add `npm run type-check` to success criteria

CLAUDE.md requires explicit `npm run type-check` in success criteria. The plan only lists `npm run build` (which includes tsc). Add it explicitly:
```
- [ ] `npm run type-check` passes
```

### Improvement 4: Simplify Wave 1 agent assignment

Wave 1 assigns 3 parallel `convex-backend` agents for: (a) Vitest config edit, (b) delete 3 test files, (c) audit helpers.ts. These are simple file operations — a single agent handling all 3 sequentially would be faster than coordinating 3 parallel agents with shared filesystem access.

**Recommendation:** Collapse Wave 1 into a single agent task.

---

## 4. Refinements (Minor Suggestions)

- "Estimated Impact" says "~580+ passed" — after removing 45 dead tests (3 files) and fixing ~11 assertions across 4 files, the actual number should be closer to 647 passed (692 - 45 deleted).
- The `tags.test.ts` file imports from `../helpers/authTestHelper` (not from `./helpers`). Verify whether `tests/helpers/authTestHelper.ts` has other consumers or should also be audited.
- E2E test count: there are 8 `.spec.ts` files plus `global-setup.ts` and `helpers.ts` in `tests/e2e/`. Ensure the exclude pattern covers all of them (it does — `tests/e2e/**` catches everything).

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| Vitest exclude array | `vitest.config.ts:16` | Extend existing array, don't create new one |
| `internal` import | Already present in `k3martCockpit.test.ts:4` | Verify `internal` is already imported |

### Potential Duplication Risks
- None identified — this is a repair plan, not new feature development.

---

## 6. Phase/Wave Accuracy

| Wave | Assessment | Notes |
|------|------------|-------|
| Wave 1: Config & Dead Tests | Needs adjustment | 3 parallel agents is overkill for simple file ops — collapse to 1 |
| Wave 2: Assertion Fixes | Good | 3 parallel agents make sense since each file is independent |
| Wave 3: Verification | Good | Sequential verification is correct |

**Ordering Issues:**
- None — Wave 1 (config + cleanup) before Wave 2 (assertion fixes) is correct since Wave 1 removes noise that could confuse Wave 2 test runs.

**Missing Phases:**
- None — the plan covers all 5 failure categories.

---

## 7. Specialist Agent Recommendations

| Wave | Recommended Agent | Rationale |
|------|-------------------|-----------|
| Wave 1 (all tasks) | `convex-backend` (single) | File deletions + config edit — one agent handles all |
| Wave 2: Cron tests | `convex-backend` | Test file edits |
| Wave 2: K3Mart tests | `convex-backend` | Test file edits requiring `internal` import knowledge |
| Wave 2: Voucher tests | `convex-backend` | Test file edits |
| Wave 3: Verification | `code-auditor` | Type check + build + test count verification |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes: `fix/test-suite-repair` |
| Branch naming convention | ✅ Correct (`fix/` prefix for bug fix) |
| Merge strategy documented | ⚠️ Implicit (CLAUDE.md rules apply) |

### Commit Strategy
| Wave | Expected Commits | Commit Type | Notes |
|------|------------------|-------------|-------|
| Wave 1 | 1-2 | fix | Atomic: config change + dead test removal |
| Wave 2 | 1-3 | fix | One per test file fixed |
| Wave 3 | 0 | — | Verification only, no commits |

### Recommended Commit Checkpoints
1. After Wave 1: `fix(tests): remove dead test files and exclude E2E from Vitest`
2. After Wave 2 crons: `fix(tests): update cron assertions for empty crons.ts`
3. After Wave 2 K3Mart: `fix(tests): update K3Mart cockpit test assertions`
4. After Wave 2 voucher: `fix(tests): update voucher tests for 100% discount allowance`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [ ] Plan includes `npm run type-check` verification (MISSING — add)
- [x] Plan includes test count baseline verification

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Simple git revert — no schema changes |
| Deployment order | ✅ N/A — test-only changes, no deployment needed |
| Data backup needed | No |
| Migration safety | ✅ N/A |

### Git Workflow Issues Found
- None — branch name is specified and follows convention

---

## 9. Documentation Checkpoints

| Wave | Documentation Update Required |
|------|-------------------------------|
| After all waves | `docs/CHANGELOG.md` |
| After all waves | Move `.planning/debug/test-suite-failures.md` → `.planning/debug/resolved/` |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-28 - Test Suite Repair (Phase 29.1)

**Fix all pre-existing test failures to establish clean green baseline.**

- Removed 3 orphaned test files (`recipes.test.ts`, `tags.test.ts`, `products.test.ts`) for deleted modules
- Excluded 8 Playwright E2E specs from Vitest runner
- Fixed K3Mart cockpit test assertions (`internalQuery` migration, error messages, return shapes)
- Fixed cron string assertions (empty crons.ts)
- Fixed voucher handling tests (100% discount now allowed)
- Pruned 7 orphaned helper functions from `tests/convex/helpers.ts`

**Test suite:** 0 failures, ~647 passing (from 56 failures, 636 passing)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Adequate

This IS a test repair plan — the tests are the deliverable. The plan's verification wave correctly checks:
- All tests pass (`npx vitest run` shows 0 failures)
- Build passes (`npm run build`)
- Test count baseline maintained (>= 636)

### Test Execution Checkpoints
1. After Wave 1: `npx vitest run` (intermediate check — should reduce failures from 56 to ~11)
2. After Wave 2: `npx vitest run` (should show 0 failures)
3. Before merge: `npm run test && npm run build && npm run type-check`

### Regression Risk
- **Low** — all changes are in test files. No production code is modified.
- Verify the 636 passing tests remain passing after each wave.

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] Confirm `createTag` helper (used by `componentTypes.test.ts`) is NOT orphaned by tag test deletion — ✅ verified: `createTag` is exported from helpers.ts and may be used by other tests
- [ ] Verify `tests/helpers/authTestHelper.ts` (imported by `tags.test.ts`) has no other consumers to audit
- [ ] After helper pruning, run type-check to confirm no import breakage in surviving tests

---

## 12. Approval Conditions

**For Approval, address these 3 critical issues:**
1. Specify `api.` → `internal.` import switch for K3Mart `getOutletStockSummaryInternal` tests
2. Specify exact Vitest exclude array merge (add to existing array, not replace)
3. Choose voucher test fix approach decisively (recommend option a: assert successful resolution)

**Recommended before implementation:**
1. List the 7 orphaned helper functions explicitly for removal
2. Specify cron test fix approach (recommend: delete string-match blocks entirely)
3. Add `npm run type-check` to success criteria
4. Collapse Wave 1 into single agent

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

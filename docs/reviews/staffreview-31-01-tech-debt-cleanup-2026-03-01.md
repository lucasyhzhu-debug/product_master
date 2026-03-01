# Staff Review: Phase 31-01 Tech Debt Cleanup

**Date:** 2026-03-01
**Plan:** `.planning/phases/31-tech-debt-cleanup/31-01-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## Plan Validation

```
PLAN VALIDATION CHECKLIST
=========================

[x] Git Workflow section exists?
  -> Branch name specified: feature/phase-31-tech-debt-cleanup
  -> Checkpoint strategy defined: 3 checkpoints (after type guard, after GrabFood, after cleanup)

[x] Implementation Waves section exists?
  -> Agents assigned: Claude (Wave 1), Bash (Wave 3)
  -> File paths specified: 6 files (1 new + 5 modified)
  -> PARALLEL/SEQUENTIAL marked: SEQUENTIAL

[x] Documentation Updates section exists?
  -> CHANGELOG.md checkbox: Present

[x] Success Criteria section exists?
  -> Type check requirement: Present
  -> Build requirement: Present

=========================
```

Plan structure validated.

---

## 1. Summary

**Overall Assessment:** Approve (with minor improvements)

This is a well-scoped, low-risk cleanup plan that addresses all 4 items from the v1.4 milestone audit. The plan provides exact file paths, line numbers, and before/after code snippets. The type guard approach is the correct pattern for narrowing `string` to a union type in Convex index queries. Two minor improvements would make this even better: (1) fix a third identical `as any` cast discovered in `externalData/queries.ts:331` and (2) add a lightweight contract test for the new `EXTERNAL_SOURCES` array.

---

## 2. Critical Issues (Must Fix)

None.

All 4 audit items are correctly addressed. The implementation approach is sound, line numbers and code snippets match the current codebase state (verified), and the changes are safe.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Fix third `as any` cast in `externalData/queries.ts:331` | Medium | Low (5 min) |
| 2 | Add contract test for `EXTERNAL_SOURCES` array | Medium | Low (10 min) |
| 3 | Change `checkProductMapping` arg from `v.string()` to `externalSource` validator | Low | Low (2 min) |

**Details:**

### Improvement 1: Third `as any` cast in externalData/queries.ts

The `getLatestWebhookError` query at `convex/externalData/queries.ts:326` has the exact same pattern:
```typescript
export const getLatestWebhookError = query({
  args: { source: v.string() },  // <-- string arg
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", args.source as any))  // <-- line 331
```

Since we're creating `isExternalSource` anyway, fixing this third instance is trivial: import the guard, add a null-return early check. This prevents the same audit finding from recurring in v1.5.

**Recommendation:** Add to Task 1 or create a sub-step. Import `isExternalSource` into `externalData/queries.ts`, add guard before the index query. One additional file, ~3 lines changed.

### Improvement 2: Contract test for EXTERNAL_SOURCES sync

The plan creates a hardcoded `EXTERNAL_SOURCES` array in `convex/lib/externalSource.ts` that must match the `externalSource` union in `convex/schema.ts`. A cross-reference comment is good but fragile -- if someone adds a 9th platform to the schema validator, they might not update the array.

The project already has a contract test pattern: `convex/externalData/__tests__/sourceToPlatform.test.ts` validates that `sourceToPlatform()` handles all known sources. A similar lightweight test for `EXTERNAL_SOURCES` would catch desync at CI time.

**Recommendation:** Add a unit test in `convex/lib/__tests__/externalSource.test.ts`:
```typescript
import { EXTERNAL_SOURCES, isExternalSource } from "../externalSource";

describe("EXTERNAL_SOURCES", () => {
  it("should contain exactly 8 known sources", () => {
    expect(EXTERNAL_SOURCES).toHaveLength(8);
    expect(EXTERNAL_SOURCES).toContain("k3mart");
    expect(EXTERNAL_SOURCES).toContain("tiktok");
    // ... or just snapshot the array
  });

  it("isExternalSource narrows valid sources", () => {
    expect(isExternalSource("gobiz")).toBe(true);
    expect(isExternalSource("unknown")).toBe(false);
    expect(isExternalSource("")).toBe(false);
  });
});
```

This test runs in `npm run test` and would catch any schema/array drift.

### Improvement 3: Tighten `checkProductMapping` arg type

In `convex/integrations/bigseller/queries.ts:55`, the `checkProductMapping` internal query accepts `source: v.string()`. Since this is an `internalQuery` called only from the BigSeller `fetchOrders` action, and the source always comes from parsing a known format, the arg could be changed to `source: externalSource` (the Convex validator imported from schema). This would make the `as any` cast unnecessary entirely -- Convex would validate at the framework level.

However, the plan's `isExternalSource` guard approach is also correct and more defensive (handles unexpected input gracefully). This is a minor style preference -- either approach works.

**Recommendation:** Optional. The current plan approach is fine.

---

## 4. Refinements (Minor Suggestions)

- **Rename `durationMap` reference in PLAN.md:** The plan's Task 2 refers to "line 312" for the duration lookup, but the actual variable name change from `durationMap` to `PAUSE_DURATION_MAP` means the line reference in Step 1 and Step 2 need to match. The executor should rename both usages atomically. (Plan already covers this, just confirming.)

- **Branch naming consistency:** CLAUDE.md says `feature/{name}` and MEMORY.md shows prior phases used `gsd/phase-N-slug`. The plan uses `feature/phase-31-tech-debt-cleanup`. Both formats work, but the GSD branching config may generate a different prefix. The executor should use whatever `gsd-tools` generates.

- **Consider `as const` for PAUSE_DURATION_MAP:** Making the map `as const` would give TypeScript exact literal types for the keys, catching mismatches between frontend button values and backend map keys at compile time. Minor -- the current approach works.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `externalSource` validator | `convex/schema.ts:18` | Already used as schema validator; new `EXTERNAL_SOURCES` array mirrors it |
| `sourceToPlatform()` | `convex/externalData/queries.ts:1523` | Maps source strings to display names; uses same 8 sources |
| `sourceValidator` alias | `convex/externalData/queries.ts:10` | Shows pattern of aliasing the schema validator |

### Potential Duplication Risks
- **EXTERNAL_SOURCES vs schema.ts literals:** The 8-literal array in the new file duplicates the 8 literals in the schema validator. This is necessary (Convex validators don't expose literals at runtime for introspection), but the sync risk is real. Mitigated by: (a) cross-reference comment in plan, (b) contract test (Improvement 2).
- **No other duplication risks.** The type guard is new code, not duplicating existing functionality.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Tasks 1-3 (Sequential) | Good | Correct ordering: guard first, then consumers, then cleanup + verify |
| Wave 3: Verification | Good | Full suite: type-check + test + build |

**Ordering Issues:**
- None. Sequential within Wave 1 is correct because Task 1 creates the import that Tasks 2-3 could optionally use.

**Missing Phases:**
- None for the stated scope. If Improvement 1 (third `as any`) is added, it fits naturally into Task 1.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Task 1: Type guard + BigSeller fixes | `convex-backend` | Pure backend changes, new shared module |
| Task 2: GrabFood pause fix | `convex-backend` + manual frontend edit | Backend adapter + one frontend line change |
| Task 3: Dead code removal | `code-auditor` (verify) then `convex-backend` (remove) | Verify-then-delete pattern |

Given the small scope (6 files, all changes are ~5 lines each), a single `general-purpose` agent or even direct execution is appropriate. No need for multi-agent orchestration.

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes: `feature/phase-31-tech-debt-cleanup` |
| Branch naming convention | Correct (`feature/` prefix) |
| Merge strategy documented | Implicit (follows CLAUDE.md standard) |

### Commit Strategy
| Task | Expected Commits | Commit Type | Notes |
|------|------------------|-------------|-------|
| Task 1 | 1 | refactor | Type guard + BigSeller fixes (atomic) |
| Task 2 | 1 | fix | GrabFood pause map (atomic, backend+frontend together) |
| Task 3 | 1 | chore | Dead code removal |

### Recommended Commit Checkpoints
1. After Task 1: `refactor: replace BigSeller as-any casts with ExternalSource type guard`
2. After Task 2: `fix: correct GrabFood pause duration map (120 -> 1440 for 24h)`
3. After Task 3: `chore: remove dead createTag export from test helpers`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [x] Plan includes `npm run test` verification

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Safe -- all changes are non-breaking refactors |
| Deployment order | No special ordering needed (no schema changes) |
| Data backup needed | No |
| Migration safety | N/A (no schema changes) |

### Git Workflow Issues Found
- None. Plan follows CLAUDE.md workflow correctly.

---

## 9. Documentation Checkpoints

| Task | Documentation Update Required |
|------|-------------------------------|
| All | docs/CHANGELOG.md (after phase complete) |

No SCHEMA.md, CODE_STYLE.md, or API_REFERENCE.md updates needed (no schema changes, no new patterns, no API changes).

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-03-01 - Phase 31: Tech Debt Cleanup

**Address accumulated tech debt from v1.4 milestone audit.**

- Replace `as any` casts in BigSeller queries with runtime ExternalSource type guard
- Fix GrabFood pause duration map: key 120 (confusing) -> 1440 (actual minutes in 24h)
- Remove dead `createTag` export from test helpers
- Document SKU index evaluation: no new index needed (existing composite index covers pattern)

**New file:** `convex/lib/externalSource.ts` (shared type guard)

**Files Modified:**
- convex/bigsellerOrders/queries.ts
- convex/integrations/bigseller/queries.ts
- convex/integrations/grabfood/adapter.ts
- src/pages/GrabFoodManager.tsx
- tests/convex/helpers.ts
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Sufficient (for a cleanup phase)

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | Type correctness of index queries | `npm run type-check` | Planned |
| Backend | All existing tests pass | `npm run test` | Planned |
| Frontend | Build succeeds | `npm run build` | Planned |
| Manual | grep verification of `as any` removal | Bash commands | Planned |

### Why "Sufficient" Not "Missing"
This is a code cleanup phase, not a feature phase. The changes are:
1. **Type-level only** (BigSeller): Runtime behavior is identical -- the `isExternalSource` guard adds a skip for unknown sources, which never occurs in practice.
2. **Constant rename** (GrabFood): `120 -> 1440` changes the number sent to the API map, but the API receives the same `"24h"` string.
3. **Dead code removal** (createTag): No runtime impact.

Existing tests cover the affected code paths. Type-check catches the primary value (type safety).

### Recommended Additional Test (Optional)
| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Unit test for `isExternalSource` | New runtime code; validates guard correctness | Vitest: `isExternalSource("gobiz") === true`, `isExternalSource("x") === false` |
| 2 | Contract test for `EXTERNAL_SOURCES` count | Catches schema/array drift | Vitest: `EXTERNAL_SOURCES.length === 8` |

### Test Execution Checkpoints
1. After Task 1: `npm run type-check` (type guard compiles, BigSeller files compile)
2. After Task 2: `npm run type-check` (GrabFood files compile)
3. After Task 3: `npm run type-check && npm run test && npm run build` (full verification)

### Regression Risk
- **Low.** No behavioral changes. All changes are type-level or constant-value.
- Existing BigSeller tests (`bigsellerOrders/__tests__/mutations.test.ts`, `integrations/bigseller/__tests__/helpers.test.ts`) cover the affected query logic.
- GrabFood pause is exercised via action call (no automated test, but runtime behavior unchanged).

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [x] Unknown source string in `platform.split("::")` -- Handled by `isExternalSource` guard (skips unknown)
- [x] Unknown source string in `checkProductMapping` -- Handled by `isExternalSource` guard (returns null)
- [x] pauseDuration not in PAUSE_DURATION_MAP -- Handled by `?? "30m"` fallback (unchanged)
- [x] `createTag` imported elsewhere -- Verified: zero imports across codebase

No unhandled edge cases found.

---

## 12. Approval Conditions

**For Approval, address:**
- No critical issues. Plan is approved as-is.

**Recommended before implementation:**
1. Add `externalData/queries.ts:331` to Task 1 scope (same pattern, same fix, ~3 lines)
2. Add lightweight `isExternalSource` unit test (optional but valuable for future platform additions)

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

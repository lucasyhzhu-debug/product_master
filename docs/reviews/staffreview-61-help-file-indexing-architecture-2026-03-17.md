# Staff Review: Phase 61 - Help File Indexing Architecture

**Date:** 2026-03-17
**Plans:** `.planning/phases/61-help-file-indexing-architecture/61-01-PLAN.md`, `61-02-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** Revise

The plans are well-structured with clear objectives and sensible task decomposition. The docs-manifest approach is pragmatic and the ExpenseGuide refactor is a solid proving ground. However, there are several issues that need attention: the plans use an unconventional task-based format that omits the CLAUDE.md-mandated Git Workflow, Implementation Waves, Documentation Updates, and Success Criteria sections; the validation script has contradictory requirements; there is no testing plan beyond "run build"; and the source glob accuracy in the manifest needs verification. Plan 02 (GSD skills) is well-specified but could benefit from addressing a few operational edge cases.

---

## 2. Critical Issues (Must Fix)

Issues that would cause implementation failure or serious bugs.

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Missing mandatory plan structure sections | Process | Both plans |
| 2 | No testing plan beyond type-check/build | Testing | 61-01-PLAN, Verification |
| 3 | Validation script requirements are contradictory | Logic | 61-01-PLAN, Task 1 |
| 4 | Import path ambiguity after file-to-directory refactor | Implementation | 61-01-PLAN, Task 2 step 4 |

**Details:**

### Issue 1: Missing mandatory plan structure sections

Both plans use a `<tasks>/<verification>/<success_criteria>` XML format instead of the CLAUDE.md-mandated plan structure. The following required sections are absent:

- **Git Workflow section** -- No branch name specified, no commit checkpoint strategy
- **Implementation Waves section** -- Tasks are described but not organized into waves with agent assignments and PARALLEL/SEQUENTIAL markers
- **Documentation Updates section** -- No mention of CHANGELOG.md, SCHEMA.md, or other docs

The plans do have `<success_criteria>` and `<verification>` blocks which partially cover the Success Criteria requirement, but they lack `npm run type-check` and `npm run build` as explicit requirements (they appear in task-level verify blocks instead).

**Plan Structure Additions (auto-generated):**

```markdown
## Git Workflow
**Branch:** `feature/61-help-file-indexing-architecture`
**Checkpoints:**
1. After docs-manifest.json + validation script: `feat(help): add docs-manifest and validation script`
2. After ExpenseGuide refactor: `refactor(help): split ExpenseGuide into 8 section files`
3. After GSD skills: `feat(help): add check-docs and update-docs GSD skills`
4. Final: `npm run build && npm run validate:docs-manifest` passing

## Implementation Waves
### Wave 1: Infrastructure [SEQUENTIAL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend / code-auditor | Create docs-manifest.json + validation script | `.planning/docs-manifest.json`, `scripts/validate-docs-manifest.cjs`, `package.json` |

### Wave 2: Refactor [SEQUENTIAL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Split ExpenseGuide into section files | `src/pages/guides/ExpenseGuide/*`, `src/lib/helpGuides.ts` |

### Wave 3: Skills [PARALLEL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| agent-builder | Create check-docs + update-docs skills | `.agent/skills/check-docs/SKILL.md`, `.agent/skills/update-docs/SKILL.md` |

### Wave 4: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | `npm run build && npm run validate:docs-manifest` |

## Documentation Updates
- [ ] CHANGELOG.md (new docs-manifest, ExpenseGuide refactor, GSD skills)
- [ ] CLAUDE.md Quick File Finder -- add help guides entry
```

**Recommendation:** Adopt these sections or integrate them into the plan format before execution.

### Issue 2: No testing plan beyond type-check/build

**Testing Verdict: Missing**

Neither plan includes any unit tests, integration tests, or manual test verification beyond `npm run type-check`, `npm run build`, and `npm run validate:docs-manifest`. Specific gaps:

1. **Validation script has no tests** -- `scripts/validate-docs-manifest.cjs` performs JSON parsing, file existence checks, and structural validation. These should have test cases:
   - Valid manifest passes
   - Missing `docFile` triggers error
   - Duplicate mapping IDs trigger error
   - Malformed JSON triggers error
   - Empty mappings array behavior

2. **ExpenseGuide refactor has no visual/functional verification** -- The plan says "renders identically after refactor" but provides no mechanism to verify this. No snapshot tests, no render tests, no manual test checklist.

3. **No regression test for existing guide search** -- The `searchGuides()` function in `src/lib/helpGuides.ts` depends on the import of `ExpenseGuide`. After changing the import path, this needs verification.

4. **GSD skills (Plan 02) have no smoke tests** -- While skills are markdown files, the plan should at minimum include a manual verification step: "Run `/gsd:check-docs` on the current codebase and verify output format."

**Recommendation:** Add at minimum:
- Unit tests for `validate-docs-manifest.cjs` (Vitest or standalone Node assertions)
- A manual test checklist for the ExpenseGuide refactor (load /help/expenses, verify all 8 sections render, verify sidebar TOC, verify search still works)
- A smoke test instruction for both GSD skills

### Issue 3: Validation script requirements are contradictory

Task 1 describes the validation script with conflicting requirements:

- First paragraph says: "For each guide with status 'live' in the registry, check that every section ID has at least one mapping entry" and "Warn about unmapped sections"
- Later it says: "The validation script does NOT need to parse TypeScript imports" and "it reads the manifest JSON"
- Even later: "accept an optional `--guide-sections` JSON file or simply warn that 'no coverage check possible without guide registry data' and skip that check"

The script cannot check "every section ID has at least one mapping" without knowing what sections exist. Since `helpGuides.ts` is TypeScript and the script is CJS, it cannot import the section list. The plan acknowledges this but does not resolve the contradiction.

**Recommendation:** Simplify the validation script scope to what it can actually verify:
1. Valid JSON structure with required fields per mapping
2. No duplicate mapping IDs
3. Every `docFile` path exists on disk
4. No orphaned `docFile` paths (files in `src/pages/guides/*/` not referenced in manifest)
5. Drop the "unmapped sections" check entirely -- it requires parsing TypeScript and is better handled by the `/gsd:check-docs` skill itself

### Issue 4: Import path ambiguity after file-to-directory refactor

The plan correctly identifies the risk: when `src/pages/guides/ExpenseGuide.tsx` is deleted and replaced with `src/pages/guides/ExpenseGuide/index.tsx`, the existing import `from "@/pages/guides/ExpenseGuide"` *should* resolve to the directory's `index.tsx`. However:

1. The plan hedges: "verify this works with the project's Vite config. If the old import path still resolves..."
2. No explicit verification step is provided
3. Vite resolution behavior for `@/` alias + directory index files should be confirmed

This is the single most likely source of a build breakage.

**Recommendation:** Add an explicit verification step: after creating the directory and deleting the old file, run `npm run type-check` immediately (before proceeding to other tasks). Also explicitly state that `src/lib/helpGuides.ts` does NOT need an import path change -- `@/pages/guides/ExpenseGuide` will resolve to `ExpenseGuide/index.tsx` via Vite's default resolution. Remove the suggestion to change to `@/pages/guides/ExpenseGuide/index` as it's unnecessary and introduces a non-standard import.

---

## 3. Improvements (Recommended)

Changes that would significantly improve the implementation.

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Source glob accuracy verification | High | Low |
| 2 | Add BATCH_NODES/EDGES to reimbursement section mapping | Medium | Low |
| 3 | Clarify data constant ownership during split | Medium | Low |
| 4 | Add `--guide-sections` config to manifest itself | Medium | Medium |
| 5 | Handle JSX in FAQ answers during section split | Medium | Low |

**Details:**

### Improvement 1: Source glob accuracy verification

The plan maps source globs like `convex/expenses/**/*.ts` to sections, but does not verify these globs actually match relevant files. For example:
- `convex/expenses/constants.ts` exists but is not mentioned in any section mapping
- `convex/expenses/auditTrail.ts` exists but is not in any source glob list
- `convex/expenses/__tests__/` would be matched by `convex/expenses/**/*.ts` but test file changes should NOT trigger staleness

**Recommendation:**
1. Explicitly exclude `__tests__` from source globs: `convex/expenses/*.ts` instead of `convex/expenses/**/*.ts`
2. Run `git log --oneline HEAD~5..HEAD -- convex/expenses/*.ts` to verify the globs match intended files
3. Include `convex/expenses/constants.ts` and `convex/expenses/auditTrail.ts` in relevant section mappings

### Improvement 2: Missing data constants in section split instructions

The plan's section file mapping (Task 2) lists line ranges from the current file, but misses some data constants:
- `BATCH_NODES` and `BATCH_EDGES` (lines 97-114) belong to `ReimbursementSection.tsx` but are not mentioned in the mapping
- `PAYROLL_FAQ` (lines 120-146) belongs to `PayrollSection.tsx` but is not mentioned in the mapping

The plan says "Move each constant to the section file where it's USED" which is correct in principle, but the explicit mapping should list all constants to prevent confusion.

**Recommendation:** Add a complete constant-to-section mapping table:
| Constant | Target Section File |
|----------|-------------------|
| LIFECYCLE_NODES, LIFECYCLE_EDGES | OverviewSection.tsx |
| SUBMITTING_FAQ | SubmittingSection.tsx |
| DOA_NODES, DOA_EDGES | ApprovingSection.tsx |
| BATCH_NODES, BATCH_EDGES | ReimbursementSection.tsx |
| PAYROLL_FAQ | PayrollSection.tsx |
| PNL_NODES, PNL_EDGES | PnlSection.tsx |
| FULL_FAQ | FaqSection.tsx |

### Improvement 3: Clarify data constant ownership during split

The plan notes "Each section file takes NO props (all data is self-contained)" which is correct, but some sections use JSX in their FAQ answers (e.g., `FULL_FAQ` has `<p>` elements with HTML entities). When splitting, these need React imports in the section file.

**Recommendation:** Add a note that `FaqSection.tsx` must import React (or use JSX transform) because `FULL_FAQ` contains JSX elements as answer values.

### Improvement 4: Add guide sections config to manifest

Instead of requiring the validation script to parse TypeScript to know which sections exist, add a `guides` key to the manifest itself:

```json
{
  "$schema": "docs-manifest-v1",
  "guides": {
    "expenses": {
      "sections": ["overview", "submitting", "approving", "reimbursement", "payroll", "analytics", "pnl", "faq"],
      "status": "live"
    }
  },
  "mappings": [...]
}
```

This makes the manifest self-contained and the validation script can check coverage without external dependencies.

**Recommendation:** Add a `guides` key to the manifest schema. This eliminates the contradictory "optional --guide-sections" workaround.

### Improvement 5: Handle JSX in FAQ answers

`FULL_FAQ` (lines 171-300) contains React JSX elements as `answer` values (e.g., `<p>There is no &ldquo;Frollie Pro.&rdquo;...</p>`). The `FaqSection.tsx` file will need to ensure it has proper React/JSX support and the `FaqGroup` type allows `ReactNode` answers.

**Recommendation:** Verify that the `FaqGroup` type's `answer` field accepts `ReactNode`, and note this explicitly in the plan so the implementer does not accidentally stringify JSX answers.

---

## 4. Refinements (Minor Suggestions)

- **Plan 01, Task 1**: The `$schema` field value `"docs-manifest-v1"` is non-standard JSON Schema. Consider using a more descriptive field like `"version": "1.0"` instead, since there is no actual JSON Schema file to reference.
- **Plan 01, Task 1**: Consider using short commit hashes (7 chars) for `lastReviewedCommit` for readability, since `git log` with `..HEAD` accepts both.
- **Plan 02, Task 1**: The check-docs skill could benefit from a `--json` output mode for programmatic consumption (future CI integration).
- **Plan 02, Task 2**: The update-docs skill's Step 3b says "Present proposed changes to user for review. Apply edits after approval." This is inherent Claude behavior and doesn't need to be in the skill doc. Simplify to "Analyze diff and edit section file."
- **Plan 02**: Both skills reference `gsd-tools.cjs` for commits, but the commit format `docs(help): ack {guide}#{section}` uses `#` which may conflict with shell comment parsing in some contexts. Ensure the commit message is properly quoted.
- **Plan 01**: The `.planning/docs-manifest.json` location is good (version-controlled, planning artifact), but consider whether this should be in project root or `docs/` for easier discovery by contributors.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `GuideLayout` component | `src/components/help/GuideLayout.tsx` | Already used by ExpenseGuide; section files just need `GuideSection` |
| Help component barrel | `src/components/help/index.ts` | All 6 exports available for section files |
| `GuideSection` wrapper | `src/components/help/GuideSection.tsx` | Each section file wraps content in this |
| `HELP_GUIDES` registry | `src/lib/helpGuides.ts` | Source of truth for section IDs -- should be reflected in manifest |
| Existing CJS scripts | `scripts/parse-har.cjs`, `scripts/analyze-har.cjs` | Pattern for CommonJS scripts (simple, no dependencies) |
| Existing skill patterns | `.agent/skills/handover/SKILL.md`, `.agent/skills/validate-plan/SKILL.md` | Template for check-docs and update-docs skill format |

### Potential Duplication Risks
- The validation script's "unmapped sections" check duplicates what `/gsd:check-docs` would provide -- keep them separate (script checks structural integrity, skill checks content staleness)
- The `guides` metadata in the manifest (if added per Improvement 4) partially duplicates `HELP_GUIDES` in `helpGuides.ts` -- acceptable since they serve different audiences (script vs runtime)

---

## 6. Phase/Wave Accuracy

Assessment of the implementation phases:

| Phase | Assessment | Notes |
|-------|------------|-------|
| 61-01 Task 1 (Manifest + Script) | Good | Clean scope, well-defined outputs |
| 61-01 Task 2 (ExpenseGuide Split) | Needs Adjustment | Missing constant mapping completeness, JSX handling note |
| 61-02 Task 1 (check-docs skill) | Good | Well-specified, clear output format |
| 61-02 Task 2 (update-docs skill) | Good | Comprehensive workflow with edge cases |

**Ordering Issues:**
- Plan 01 Task 1 creates the manifest with `docFile` paths that don't exist yet (Task 2 creates them). The plan acknowledges this ("docFile validation will initially FAIL"), which is fine -- but the verification command in Task 1's `<verify>` block will fail. Either skip docFile validation in Task 1's verify, or run it after Task 2.

**Missing Phases:**
- No explicit "delete old ExpenseGuide.tsx" verification step -- `git diff --stat` is mentioned in the overall verification but should be a checklist item in Task 2's done criteria
- No CHANGELOG update task

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| 61-01 Task 1 (Manifest + Script) | `code-auditor` | Structural validation, no UI |
| 61-01 Task 2 (ExpenseGuide Split) | `react-ui-builder` | React component refactoring |
| 61-02 Task 1 (check-docs skill) | `agent-builder` | Creating new GSD skill |
| 61-02 Task 2 (update-docs skill) | `agent-builder` | Creating new GSD skill |
| Verification | `code-auditor` | Type check, build, validation |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Missing -- not in plan |
| Branch naming convention | Missing -- inferred as `feature/61-help-file-indexing-architecture` |
| Merge strategy documented | Missing |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| 61-01 Task 1 | 1 | feat | Manifest + script + package.json |
| 61-01 Task 2 | 1-2 | refactor | Section files + delete old file |
| 61-02 Task 1 | 1 | feat | check-docs skill |
| 61-02 Task 2 | 1 | feat | update-docs skill |

### Recommended Commit Checkpoints
1. After manifest + validation script: `feat(help): add docs-manifest.json and validation script`
2. After ExpenseGuide refactor: `refactor(help): split ExpenseGuide into 8 section files`
3. After check-docs skill: `feat(help): add /gsd:check-docs staleness detection skill`
4. After update-docs skill: `feat(help): add /gsd:update-docs section update skill`
5. After all verification passes: merge to main + CHANGELOG update

### Pre-Push Verification
- [x] Plan includes `npm run build` check (in task verify blocks)
- [x] Plan includes `npm run type-check` verification (in task verify blocks)
- [ ] Plan includes local testing before push (Missing -- no manual test plan)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Missing |
| Deployment order | Good -- frontend-only changes, no backend/schema changes |
| Data backup needed | No |
| Migration safety | N/A -- no schema changes |

### Git Workflow Issues Found
- No feature branch creation step at the start of either plan
- No commit checkpoints between tasks within a plan
- Missing CHANGELOG.md update requirement
- No merge-to-main strategy documented

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| After 61-01 | CHANGELOG.md (docs-manifest, validation script, ExpenseGuide refactor) |
| After 61-02 | CHANGELOG.md (check-docs, update-docs skills) |
| After all | CLAUDE.md Quick File Finder (add help guides row) |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-03-17 - Help File Indexing Architecture (Phase 61)

**Documentation drift detection infrastructure**

- Added `.planning/docs-manifest.json` mapping source files to tutorial sections
- Added `npm run validate:docs-manifest` validation script
- Refactored ExpenseGuide.tsx (812 lines) into 8 section files for targeted updates
- Added `/gsd:check-docs` skill for detecting stale tutorial sections via git history
- Added `/gsd:update-docs` skill for proposing and applying section-level edits with `--ack` flag

**Files Modified:**
- `.planning/docs-manifest.json` (new)
- `scripts/validate-docs-manifest.cjs` (new)
- `package.json` (new script)
- `src/pages/guides/ExpenseGuide/` (new directory, 9 files)
- `src/pages/guides/ExpenseGuide.tsx` (deleted)
- `src/lib/helpGuides.ts` (import path update)
- `.agent/skills/check-docs/SKILL.md` (new)
- `.agent/skills/update-docs/SKILL.md` (new)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Script | validate-docs-manifest.cjs | None | Missing |
| Frontend | ExpenseGuide section rendering | None | Missing |
| Frontend | Import resolution after refactor | type-check | Planned |
| Skills | check-docs output correctness | None | Missing |
| Skills | update-docs workflow | None | Missing |
| Build | Production build passes | npm run build | Planned |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Validation script unit tests | Script validates critical manifest integrity | Create `scripts/__tests__/validate-docs-manifest.test.cjs` or use inline assertions in the script with a `--test` flag |
| 2 | ExpenseGuide render equivalence | Refactor must not break user-facing guide | Manual checklist: load /help/expenses, verify all 8 sections visible, verify sidebar TOC highlights correctly, verify search for "payroll" returns results |
| 3 | Import resolution smoke test | Directory index resolution is the key risk | `npm run type-check` covers this -- already planned |
| 4 | searchGuides still works | Import path change could break search | Add assertion: `searchGuides("payroll")` returns results after refactor |

### Test Execution Checkpoints
1. After manifest + validation script: `node scripts/validate-docs-manifest.cjs` (even if docFile validation warns)
2. After ExpenseGuide refactor: `npm run type-check && npm run build && npm run validate:docs-manifest`
3. Before merge: Full `npm run test && npm run build` verification

### Regression Risk
- `searchGuides()` in `src/lib/helpGuides.ts` depends on `ExpenseGuide` import -- verify import still resolves
- `GuideRouter` renders the guide component from the registry -- verify it still works
- Any test files that import from `src/pages/guides/ExpenseGuide` directly will break

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [ ] What if `git rev-parse HEAD` returns a different commit between Task 1 and Task 2? (lastReviewedCommit in manifest may not reflect final state)
- [ ] What if `src/pages/guides/ExpenseGuide/` directory already exists from a previous attempt?
- [ ] What if the ExpenseGuide component has been modified since the plan was written? (Plan acknowledges this but the line number references will be wrong)
- [ ] Windows file path separators in the validation script -- `fs.existsSync` should handle both `/` and `\`
- [ ] What if `gsd-tools.cjs` is not available or has been updated? (Plan 02 depends on it for commits)
- [ ] Source globs matching `__tests__` directories in expense module -- test file changes should not flag documentation as stale

---

## 12. Approval Conditions

**For Approval, address:**
1. Add Git Workflow section with branch name and commit checkpoints (Critical #1)
2. Add a testing plan -- at minimum manual test checklist for the refactor and basic script validation tests (Critical #2)
3. Resolve validation script contradictions -- simplify scope to structural checks only (Critical #3)
4. Confirm import resolution strategy explicitly (Critical #4)

**Recommended before implementation:**
1. Verify source glob accuracy -- exclude `__tests__/`, include `constants.ts` and `auditTrail.ts` (Improvement #1)
2. Add complete constant-to-section mapping table (Improvement #2)
3. Add `guides` key to manifest for self-contained section coverage checking (Improvement #4)
4. Note JSX in FAQ answers requires React import in FaqSection.tsx (Improvement #5)

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

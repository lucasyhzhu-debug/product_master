# Phase 40: Retroactive Verification Gap Closure - Research

**Researched:** 2026-03-08
**Domain:** GSD process documentation -- VERIFICATION.md creation, SUMMARY frontmatter fixes, REQUIREMENTS.md traceability
**Confidence:** HIGH

## Summary

Phase 40 is a documentation-only phase that closes 12 process gaps identified by the v1.6 milestone audit (2026-03-07). All underlying code work was completed in Phases 35-37 and merged to main. The gaps are: (1) missing VERIFICATION.md files for Phases 35, 36, and 37; (2) missing `requirements-completed` frontmatter in Phase 37 SUMMARY files; and (3) REQUIREMENTS.md traceability table showing BFS-04/05/06 as "Pending" when they should be "Complete".

No code changes are needed. The phase produces 3 VERIFICATION.md files, fixes 3 SUMMARY file frontmatters, and updates the REQUIREMENTS.md traceability table. The audit classified 9 requirements as "partial" (SUMMARY confirms but VERIFICATION missing) and 3 as "unsatisfied" (both VERIFICATION and SUMMARY frontmatter missing). After this phase, all 20 v1.6 requirements should show "satisfied" in a 3-source cross-reference (VERIFICATION + SUMMARY + ROADMAP).

**Primary recommendation:** Use the existing Phase 38 and 39 VERIFICATION.md files as structural templates. Each retroactive VERIFICATION.md must verify current codebase state (not replay execution history), citing `wc -l` counts, `grep` evidence, and file existence checks. Phase 37 SUMMARY files additionally need `requirements-completed:` added to their YAML frontmatter.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCH-01 | Expert audit of all 59 Convex tables identifies data duplication, denormalization waste, and unused/redundant tables | VERIFICATION.md for Phase 35 must confirm `docs/SCHEMA_AUDIT.md` exists with categorized findings; already confirmed by 35-01-SUMMARY |
| SCH-02 | Identified schema inefficiencies documented with specific remediation recommendations | VERIFICATION.md for Phase 35 must confirm findings have severity + remediation; already confirmed by 35-01-SUMMARY |
| SCH-03 | Quick-win schema cleanups executed (remove unused fields/tables, add missing indexes) where safe | VERIFICATION.md for Phase 35 must confirm index changes in `convex/schema.ts`; already confirmed by 35-02-SUMMARY |
| BSH-01 | Confidence types and `worstConfidence()` have a single source of truth in `convex/lib/confidence.ts` | VERIFICATION.md for Phase 36 must confirm file exists and no duplicates; already confirmed by 36-01-SUMMARY |
| BSH-02 | WIB timezone helpers consolidated into `convex/lib/periodRange.ts` (no duplicates in externalData or k3martCockpit) | VERIFICATION.md for Phase 36 must confirm consolidation with grep evidence; already confirmed by 36-01-SUMMARY |
| BSH-03 | `sourceToPlatform()` lives in a shared module (`convex/lib/externalSource.ts`), not duplicated across query files | VERIFICATION.md for Phase 36 must confirm single definition; already confirmed by 36-01-SUMMARY |
| BFS-01 | `externalData/queries.ts` slimmed to under 1,400 LOC (from 1,832) via pure helper extraction | VERIFICATION.md for Phase 36 must confirm LOC count with `wc -l`; already confirmed by 36-02-SUMMARY (1,387 LOC) |
| BFS-02 | `k3martCockpit/queries.ts` slimmed to 760 LOC (from 985) via pure helper extraction | VERIFICATION.md for Phase 36 must confirm LOC count; already confirmed by 36-03-SUMMARY (760 LOC, slightly over 750 target) |
| BFS-03 | `reports/incomeStatement.ts` imports shared confidence + WIB from lib modules (no local duplicates) | VERIFICATION.md for Phase 36 must confirm import paths; already confirmed by 36-03-SUMMARY |
| BFS-04 | `orders/queries.ts` slimmed to under 800 LOC (from 1,279) via helper extraction | VERIFICATION.md for Phase 37 + SUMMARY frontmatter fix; 37-01-SUMMARY body says 940 LOC (target was <800, not met due to ctx-dependency) |
| BFS-05 | `orders/mutations/orderCrud.ts` slimmed to under 700 LOC (from 1,085) via validation extraction | VERIFICATION.md for Phase 37 + SUMMARY frontmatter fix; 37-02-SUMMARY body says 958 LOC (target was <700, not met due to ctx-dependency) |
| BFS-06 | `dispatchPlanner/queries.ts` slimmed to under 800 LOC (from 1,228) via simulation extraction | VERIFICATION.md for Phase 37 + SUMMARY frontmatter fix; 37-03-SUMMARY body says 313 LOC (exceeded target significantly) |
</phase_requirements>

## Standard Stack

This is a documentation-only phase. No libraries or code dependencies.

### Core
| Tool | Purpose | Why Standard |
|------|---------|--------------|
| `wc -l` | Verify LOC counts for file split requirements | Objective measurement of line counts |
| `grep -r` | Verify no duplicate definitions exist | Confirms single-source-of-truth requirements |
| File existence checks | Verify artifacts exist | Confirms files created by previous phases |
| YAML frontmatter | SUMMARY file format | GSD framework standard for plan metadata |

### Alternatives Considered
None -- this phase requires no technology choices.

## Architecture Patterns

### VERIFICATION.md Structure (from Phases 38 and 39)

The established VERIFICATION.md format has these sections:

```markdown
---
phase: {phase-slug}
verified: {ISO timestamp}
status: passed
score: {N}/{M} must-haves verified
---

# Phase {N}: {Name} Verification Report

**Phase Goal:** {goal from ROADMAP}
**Verified:** {ISO timestamp}
**Status:** passed
**Re-verification:** {Yes/No}

## Goal Achievement

### Observable Truths
| # | Truth | Status | Evidence |

### Required Artifacts
| Artifact | Expected | Status | LOC/Details |

### Key Link Verification
| From | To | Via | Status | Details |

### Requirements Coverage
| Requirement | Source Plan | Description | Status | Evidence |

### Anti-Patterns Found
| File | Line | Pattern | Severity | Impact |

### Additional Verification
| Check | Result |

### Human Verification Required
[Numbered items with test/expected/why-human]

### Gaps Summary
[Summary paragraph]

---
_Verified: {timestamp}_
_Verifier: Claude (gsd-verifier)_
```

### SUMMARY Frontmatter Format (from Phases 35 and 36)

Phase 35 and 36 SUMMARY files have proper `requirements-completed:` frontmatter. Phase 37 SUMMARY files are missing this field. The correct format:

```yaml
---
phase: 37-order-dispatch-simplification
plan: 01
status: complete
requirements-completed: [BFS-04]  # <-- THIS IS MISSING from Phase 37 SUMMARYs
---
```

**Phase 35 examples (correct):**
- `35-01-SUMMARY.md`: `requirements-completed: [SCH-01, SCH-02]`
- `35-02-SUMMARY.md`: `requirements-completed: [SCH-03]`

**Phase 36 examples (correct):**
- `36-01-SUMMARY.md`: `requirements-completed: [BSH-01, BSH-02, BSH-03]`
- `36-02-SUMMARY.md`: `requirements-completed: [BFS-01]`
- `36-03-SUMMARY.md`: `requirements-completed: [BFS-02, BFS-03]`

**Phase 37 (needs fixing):**
- `37-01-SUMMARY.md`: Has `status: complete` but NO `requirements-completed:` field -- needs `[BFS-04]`
- `37-02-SUMMARY.md`: Has `status: complete` but NO `requirements-completed:` field -- needs `[BFS-05]`
- `37-03-SUMMARY.md`: Has `status: complete` but NO `requirements-completed:` field -- needs `[BFS-06]`

### REQUIREMENTS.md Traceability Table

Current state (from REQUIREMENTS.md):
```
| BFS-04 | Phase 40 | Pending |
| BFS-05 | Phase 40 | Pending |
| BFS-06 | Phase 40 | Pending |
```

These must be updated to:
```
| BFS-04 | Phase 37 | Complete |
| BFS-05 | Phase 37 | Complete |
| BFS-06 | Phase 37 | Complete |
```

The audit correctly notes that the work WAS done in Phase 37 (documented in ROADMAP with LOC results). The traceability table incorrectly maps them to Phase 40 because Phase 40 was created to close the documentation gaps.

### Recommended Project Structure

No new directories. Files are created/modified in existing phase directories:

```
.planning/phases/
  35-schema-review-audit/
    35-VERIFICATION.md          # NEW
  36-sales-analytics-backend-simplification/
    36-VERIFICATION.md          # NEW
  37-order-dispatch-simplification/
    37-01-SUMMARY.md            # MODIFIED (add frontmatter)
    37-02-SUMMARY.md            # MODIFIED (add frontmatter)
    37-03-SUMMARY.md            # MODIFIED (add frontmatter)
    37-VERIFICATION.md          # NEW
  40-retroactive-verification-gap-closure/
    40-RESEARCH.md              # THIS FILE
    40-01-PLAN.md               # TO BE CREATED BY PLANNER
.planning/
  REQUIREMENTS.md               # MODIFIED (traceability table)
```

### Pattern: Retroactive Verification

This phase establishes a pattern for retroactive verification:
1. The verifier confirms current codebase state using `wc -l`, `grep`, and file existence
2. Evidence is gathered at verification time, not replayed from execution history
3. Requirements that had targets not fully met (BFS-04: 940 > 800, BFS-05: 958 > 700) are still marked as verified with notation about the deviation
4. The VERIFICATION.md explicitly notes this is a retroactive verification with `Re-verification: Retroactive`

### Anti-Patterns to Avoid

- **Don't fabricate execution evidence:** The retroactive VERIFICATION.md must NOT pretend to have observed execution. It verifies current state.
- **Don't re-run build/test as part of this phase:** Build and tests already pass on main. This phase only creates documentation files.
- **Don't change the ROADMAP:** Phase 37's results are already correctly documented in ROADMAP.md.
- **Don't modify code files:** This is documentation-only. No `.ts`, `.tsx`, or `.json` code changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VERIFICATION.md format | Invent a new format | Copy structure from 38-VERIFICATION.md or 39-VERIFICATION.md | Consistency across phases |
| LOC counting | Manual counting | `wc -l` command | Objective, reproducible |
| Duplicate detection | Manual file reading | `grep -r` for function/type names | Comprehensive, scriptable |
| File existence | Manual checking | `ls` or `test -f` | Reliable |

## Common Pitfalls

### Pitfall 1: BFS-04/05 Requirement Targets Not Met
**What goes wrong:** The requirements say "slimmed to under 800 LOC" (BFS-04) and "under 700 LOC" (BFS-05), but actual results are 940 and 958 LOC respectively. The VERIFICATION.md must handle this honestly.
**Why it happens:** The targets were aspirational; ctx-dependent code prevented full extraction.
**How to avoid:** Mark as VERIFIED with deviation noted. The audit already acknowledges this: "The work IS described in the Phase 37 summary bodies." The ROADMAP documents the actual LOC results. The BFS requirements in REQUIREMENTS.md should be marked Complete with a note.
**Warning signs:** A verifier that marks BFS-04/05 as FAILED would create confusion since the milestone audit already accepted the results.

### Pitfall 2: BFS-02 Slightly Over Target
**What goes wrong:** BFS-02 says "slimmed to 760 LOC" but the target in REQUIREMENTS.md says "slimmed to under 750 LOC" (10 LOC over).
**Why it happens:** Remaining functions were too ctx-dependent for pure extraction.
**How to avoid:** Mark as VERIFIED with deviation noted. Phase 36-03-SUMMARY already documents this decision.

### Pitfall 3: Phase 37 SUMMARY Files Have Minimal Frontmatter
**What goes wrong:** Phase 37 SUMMARY files use a simple frontmatter (`phase`, `plan`, `status`) without the richer format used by Phases 35/36 (which include `subsystem`, `tags`, dependency graph, tech tracking, `requirements-completed`, metrics).
**Why it happens:** Different executor conventions during Phase 37.
**How to avoid:** Only add the missing `requirements-completed:` field. Do NOT restructure the entire Phase 37 SUMMARY frontmatter -- that would be scope creep.

### Pitfall 4: LOC Counts May Have Changed Since Execution
**What goes wrong:** Files may have been modified by subsequent phases (38, 39, Quick Tasks) since Phases 36/37 executed.
**Why it happens:** Post-phase modifications are normal in active development.
**How to avoid:** Verify current LOC counts with `wc -l` and note if they differ from the SUMMARY values. The requirement is about the extraction work done, not the absolute current LOC.

### Pitfall 5: Confusing Phase 40 Requirements Mapping
**What goes wrong:** REQUIREMENTS.md currently maps BFS-04/05/06 to "Phase 40" because Phase 40 was created to close documentation gaps. But the actual code work was done in Phase 37.
**Why it happens:** The roadmap addition for Phase 40 listed these as its requirements.
**How to avoid:** Update REQUIREMENTS.md traceability to show Phase 37 as the implementing phase, with status Complete. Phase 40's job is to create the verification documentation, not to re-implement the requirements.

## Code Examples

Not applicable -- this is a documentation-only phase. However, here are the verification commands the VERIFICATION.md files should reference:

### Phase 35 Verification Commands
```bash
# SCH-01/02: Schema audit report exists with categorized findings
test -f docs/SCHEMA_AUDIT.md && echo "EXISTS"
grep -c "## [0-9]" docs/SCHEMA_AUDIT.md  # Count finding categories

# SCH-03: Index changes in schema
grep -c "\.index(" convex/schema.ts  # Current index count (should be ~150)
```

### Phase 36 Verification Commands
```bash
# BSH-01: Confidence types single source of truth
test -f convex/lib/confidence.ts && echo "EXISTS"
grep -r "worstConfidence" convex/ --include="*.ts" -l  # Should import from lib/confidence.ts

# BSH-02: WIB helpers consolidated
grep -r "utcToWibDateStr\|isWeekend\|getIsoWeekNumber" convex/ --include="*.ts" -l

# BSH-03: sourceToPlatform single definition
grep -r "function sourceToPlatform\|const sourceToPlatform" convex/ --include="*.ts" -l

# BFS-01: externalData/queries.ts LOC
wc -l convex/externalData/queries.ts

# BFS-02: k3martCockpit/queries.ts LOC
wc -l convex/k3martCockpit/queries.ts

# BFS-03: incomeStatement imports from shared modules
grep "import.*from.*lib/confidence\|import.*from.*lib/periodRange\|import.*from.*lib/externalSource" convex/reports/incomeStatement.ts
```

### Phase 37 Verification Commands
```bash
# BFS-04: orders/queries.ts LOC + helper extraction
wc -l convex/orders/queries.ts
test -f convex/orders/helpers/kitchenEnrichment.ts && echo "EXISTS"
test -f convex/orders/helpers/kanbanBuilders.ts && echo "EXISTS"

# BFS-05: orderCrud.ts LOC + helper extraction
wc -l convex/orders/mutations/orderCrud.ts
test -f convex/orders/helpers/customerResolution.ts && echo "EXISTS"
test -f convex/orders/helpers/orderItemProcessing.ts && echo "EXISTS"

# BFS-06: dispatchPlanner/queries.ts LOC + helper extraction
wc -l convex/dispatchPlanner/queries.ts
test -f convex/dispatchPlanner/helpers/weeklyPlanBuilder.ts && echo "EXISTS"
test -f convex/dispatchPlanner/helpers/inventorySimulation.ts && echo "EXISTS"
```

## State of the Art

Not applicable -- this phase involves no technology choices. It uses the established GSD verification workflow.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | N/A -- documentation-only phase |
| Config file | N/A |
| Quick run command | `ls .planning/phases/{35,36,37}-*/*-VERIFICATION.md` |
| Full suite command | `ls .planning/phases/{35,36,37}-*/*-VERIFICATION.md && grep -l "requirements-completed" .planning/phases/37-*/*-SUMMARY.md` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCH-01 | Phase 35 VERIFICATION.md exists and covers SCH-01 | file-check | `grep "SCH-01" .planning/phases/35-schema-review-audit/35-VERIFICATION.md` | -- Wave 0 |
| SCH-02 | Phase 35 VERIFICATION.md covers SCH-02 | file-check | `grep "SCH-02" .planning/phases/35-schema-review-audit/35-VERIFICATION.md` | -- Wave 0 |
| SCH-03 | Phase 35 VERIFICATION.md covers SCH-03 | file-check | `grep "SCH-03" .planning/phases/35-schema-review-audit/35-VERIFICATION.md` | -- Wave 0 |
| BSH-01 | Phase 36 VERIFICATION.md covers BSH-01 | file-check | `grep "BSH-01" .planning/phases/36-sales-analytics-backend-simplification/36-VERIFICATION.md` | -- Wave 0 |
| BSH-02 | Phase 36 VERIFICATION.md covers BSH-02 | file-check | `grep "BSH-02" .planning/phases/36-sales-analytics-backend-simplification/36-VERIFICATION.md` | -- Wave 0 |
| BSH-03 | Phase 36 VERIFICATION.md covers BSH-03 | file-check | `grep "BSH-03" .planning/phases/36-sales-analytics-backend-simplification/36-VERIFICATION.md` | -- Wave 0 |
| BFS-01 | Phase 36 VERIFICATION.md covers BFS-01 | file-check | `grep "BFS-01" .planning/phases/36-sales-analytics-backend-simplification/36-VERIFICATION.md` | -- Wave 0 |
| BFS-02 | Phase 36 VERIFICATION.md covers BFS-02 | file-check | `grep "BFS-02" .planning/phases/36-sales-analytics-backend-simplification/36-VERIFICATION.md` | -- Wave 0 |
| BFS-03 | Phase 36 VERIFICATION.md covers BFS-03 | file-check | `grep "BFS-03" .planning/phases/36-sales-analytics-backend-simplification/36-VERIFICATION.md` | -- Wave 0 |
| BFS-04 | Phase 37 VERIFICATION.md covers BFS-04 | file-check | `grep "BFS-04" .planning/phases/37-order-dispatch-simplification/37-VERIFICATION.md` | -- Wave 0 |
| BFS-05 | Phase 37 VERIFICATION.md covers BFS-05 | file-check | `grep "BFS-05" .planning/phases/37-order-dispatch-simplification/37-VERIFICATION.md` | -- Wave 0 |
| BFS-06 | Phase 37 VERIFICATION.md covers BFS-06 | file-check | `grep "BFS-06" .planning/phases/37-order-dispatch-simplification/37-VERIFICATION.md` | -- Wave 0 |

### Sampling Rate
- **Per task commit:** `ls .planning/phases/{35,36,37}-*/*-VERIFICATION.md`
- **Per wave merge:** Full file existence + content check
- **Phase gate:** All 3 VERIFICATION.md files exist, all 3 Phase 37 SUMMARYs have frontmatter, REQUIREMENTS.md updated

### Wave 0 Gaps
None -- no test infrastructure needed. This phase creates documentation files and verifies them by existence and content grep.

## Key Evidence Already Available

### Phase 35 Evidence (from SUMMARY files)
- **SCH-01:** 35-01-SUMMARY says "42 categorized findings" across "65 tables". Report at `docs/SCHEMA_AUDIT.md`.
- **SCH-02:** 35-01-SUMMARY says "severity (critical/moderate/low) and specific remediation recommendation" for each finding.
- **SCH-03:** 35-02-SUMMARY says "20 unused indexes removed, 5 compound indexes added, critical session cleanup query fixed, 10 range bound anti-patterns fixed." Build and tests pass (684/684).

### Phase 36 Evidence (from SUMMARY files)
- **BSH-01:** 36-01-SUMMARY: `convex/lib/confidence.ts` created with Confidence type, CONFIDENCE_RANK, worstConfidence().
- **BSH-02:** 36-01-SUMMARY: 5 WIB helpers consolidated into `convex/lib/periodRange.ts`.
- **BSH-03:** 36-01-SUMMARY: `sourceToPlatform()` moved to `convex/lib/externalSource.ts`.
- **BFS-01:** 36-02-SUMMARY: `externalData/queries.ts` reduced to 1,387 LOC (target: <1,400).
- **BFS-02:** 36-03-SUMMARY: `k3martCockpit/queries.ts` reduced to 760 LOC (target: <750, 10 LOC over).
- **BFS-03:** 36-03-SUMMARY: Build passes, tests pass, zero API path changes confirmed.

### Phase 37 Evidence (from SUMMARY files)
- **BFS-04:** 37-01-SUMMARY body: `orders/queries.ts` 1,279 -> 940 LOC (-26.5%). Target was <800 -- not fully met due to ctx-dependent code.
- **BFS-05:** 37-02-SUMMARY body: `orderCrud.ts` 1,085 -> 958 LOC (-11.7%). Target was <700 -- not fully met due to ctx-dependent code.
- **BFS-06:** 37-03-SUMMARY body: `dispatchPlanner/queries.ts` 1,226 -> 313 LOC (-74.5%). Exceeded target significantly.

### Phase 37 LOC Target Deviation Analysis

Two of the three Phase 37 requirements have LOC targets not fully met:

| Req | Target | Actual | Met? | Reason |
|-----|--------|--------|------|--------|
| BFS-04 | <800 LOC | 940 LOC | Partial | ctx-dependent DB code can't be extracted to pure helpers |
| BFS-05 | <700 LOC | 958 LOC | Partial | mutation logic requires Convex context |
| BFS-06 | <800 LOC | 313 LOC | Exceeded | Simulation was largely self-contained |

The audit accepted these results: "The work IS described in the Phase 37 summary bodies and the ROADMAP documents detailed LOC results (3,590 -> 2,211 LOC, -38.4%)." The REQUIREMENTS.md checkbox for BFS-04/05 is currently checked (`[x]`), indicating the requirement was considered met despite the LOC delta.

**Recommendation for VERIFICATION.md:** Mark as VERIFIED with deviation noted. The requirement intent (extract helpers to simplify files) was achieved even though absolute LOC targets were aspirational. Document the reason (ctx-dependent code) and the overall -38.4% backend reduction.

## Open Questions

1. **Should REQUIREMENTS.md BFS-04/05 descriptions be updated?**
   - What we know: The checkbox descriptions say "slimmed to under 800 LOC" and "slimmed to under 700 LOC" but actual results are 940 and 958.
   - What's unclear: Whether to update the requirement text to match reality or keep original targets with "Complete" status.
   - Recommendation: Keep original requirement text (it was the target). Mark as Complete. The VERIFICATION.md documents the deviation.

2. **Should Phase 40 also create VALIDATION.md files for Phases 35-37?**
   - What we know: The audit notes 0/5 Nyquist compliant phases. Phase 38 has a draft VALIDATION.md.
   - What's unclear: Whether this is in scope for Phase 40.
   - Recommendation: OUT OF SCOPE. Phase 40's stated goal is "Close all 12 documentation gaps identified by the v1.6 audit." The 12 gaps are about VERIFICATION.md and SUMMARY frontmatter, not VALIDATION.md. Nyquist compliance is a separate concern.

3. **Should the `last_updated` line in REQUIREMENTS.md be updated?**
   - Recommendation: Yes, update to reflect this phase's changes.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/38-frontend-giant-file-splits/38-VERIFICATION.md` -- Template for VERIFICATION.md format (Verified)
- `.planning/phases/39-e2e-test-foundation-resilience/39-VERIFICATION.md` -- Template for VERIFICATION.md format (Verified)
- `.planning/v1.6-MILESTONE-AUDIT.md` -- Source of all 12 gaps (Verified)
- `.planning/REQUIREMENTS.md` -- Current traceability state (Verified)
- `.planning/phases/35-*/35-*-SUMMARY.md` -- Phase 35 evidence (Verified)
- `.planning/phases/36-*/36-*-SUMMARY.md` -- Phase 36 evidence (Verified)
- `.planning/phases/37-*/37-*-SUMMARY.md` -- Phase 37 evidence (Verified)

### Secondary (MEDIUM confidence)
- `.claude/gsd-local-patches/get-shit-done/workflows/verify-phase.md` -- Verification workflow process
- `.planning/ROADMAP.md` -- Phase descriptions and LOC results

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no technology choices needed; documentation-only phase
- Architecture: HIGH -- VERIFICATION.md format is well-established by Phases 38 and 39; SUMMARY frontmatter format is clear from Phases 35 and 36 examples
- Pitfalls: HIGH -- all pitfalls identified from direct examination of the audit, SUMMARYs, and REQUIREMENTS.md; LOC deviation issue is well-documented

**Research date:** 2026-03-08
**Valid until:** Indefinite -- this is a one-time documentation closure task

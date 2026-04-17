# Local GSD Patches

Frollie Recipe Master customizations to GSD workflows. These modifications add quality gates (triple-review, simplify, staff review) and automated documentation + PR merge so every workflow that produces code changes closes its own loop.

**Scope:** Five patches reapplied against GSD v1.36.0 on 2026-04-17 after the 1.34.2 → 1.36.0 clean install wiped the original 11. The other 6 patches from the 1.34.2 era were evaluated against v1.36.0 intent and dropped — either obsolete, covered by upstream, or no longer needed.

**Tier handling rule (applies to every review step below):** When a review skill (triple-review, staffreview) returns tiered feedback (Critical + Important + Refinements + Minor + Nitpick), route the COMPLETE tiered list back to the fixer/planner. Do NOT filter by tier. Every finding is addressed, so review output is not silently discarded. This rule is embedded inline in each patch's review step rather than kept as a separate cross-cutting patch — it only exists where there's a review step to apply it to.

---

## Patch 1: execute-phase — Triple-review, simplify, document & merge

**File:** `get-shit-done/workflows/execute-phase.md`
**Purpose:** After phase verification and roadmap update, run quality gates (triple-review, simplify) and close the loop with automated CHANGELOG update, PR creation, squash-merge, and main sync. Eliminates manual post-phase merge ceremony.
**Insertion anchor:** Three new steps between `</step>` closing `update_project_md` and `<step name="offer_next">`, in order: `triple_review` → `simplify` → `document_and_merge`.
**Dependencies:**
- `docs/CHANGELOG.md` (must exist; skipped with warning if missing)
- `gh` CLI authenticated
- `workflow.triple_review` config key (default `false`, opt-in)
- `workflow.simplify` config key (default `false`, opt-in)
- Git `branching_strategy` in `.planning/config.json` is not `"none"`
- `.claude/commands/triple-review.md` skill

**Content summary:**
- `triple_review` step: config-gated, runs `Skill(triple-review, PHASE_NUMBER)`. Routes ALL tiered findings (Critical + Important + Refinements + Minor + Nitpick) to gsd-executor for fixes. Non-blocking on skill failure.
- `simplify` step: config-gated, runs `Skill(simplify)`. Commits cleanup as `refactor(phase-N): simplify after review`.
- `document_and_merge` step: updates CHANGELOG, pushes branch, `gh pr create`, `gh pr merge --squash --delete-branch`, syncs main. Skips when `branching_strategy=none`. Surfaces PR URL on any post-PR failure so the user can complete the merge manually.

**Verification:**
```bash
grep -c "triple_review" .claude/get-shit-done/workflows/execute-phase.md
# Expected: >= 2 (step name + narrative reference)
grep -c "document_and_merge" .claude/get-shit-done/workflows/execute-phase.md
# Expected: >= 1
grep -c "Route the COMPLETE tiered list" .claude/get-shit-done/workflows/execute-phase.md
# Expected: >= 1
```

---

## Patch 2: quick — Triple-review, simplify, document & merge

**File:** `get-shit-done/workflows/quick.md`
**Purpose:** Brings quick tasks to the same quality bar as full phase execution when `--full` is passed. Adds tiered-findings routing, simplify pass, and automated PR merge for feature branches.
**Insertion anchors:**
- Steps 6.3 (triple review) and 6.4 (simplify): between `Step 6.25: Code review (auto)` (ends after "Error handling: Failures are non-blocking — catch and proceed.") and `**Step 6.5: Verification**`
- Step 9 (document and merge): between final `Ready for next task: /gsd-quick ${GSD_WS}` block and the closing `</process>` / `<success_criteria>`

**Dependencies:**
- `workflow.triple_review` config key
- `workflow.simplify` config key
- `docs/CHANGELOG.md` (skipped with warning if missing)
- `gh` CLI authenticated
- `.claude/commands/triple-review.md` skill

**Content summary:**
- Step 6.3: `$FULL_MODE` and `workflow.triple_review` gated. `Skill(triple-review, ${QUICK_DIR}/${quick_id}-PLAN.md)`. Routes ALL tiered findings to fixer. Commits as `fix(quick-${quick_id}): address triple-review findings`.
- Step 6.4: `$FULL_MODE` and `workflow.simplify` gated. `Skill(simplify)`. Commits as `refactor(quick-${quick_id}): simplify after review`.
- Step 9: Skip if on main or if `branch_name` was empty. Updates CHANGELOG, pushes branch, `gh pr create`, squash-merge, sync main.

**Verification:**
```bash
grep -c "Step 6.3: Triple review" .claude/get-shit-done/workflows/quick.md
# Expected: >= 1
grep -c "Step 6.4: Simplify" .claude/get-shit-done/workflows/quick.md
# Expected: >= 1
grep -c "Step 9: Document and merge" .claude/get-shit-done/workflows/quick.md
# Expected: >= 1
grep -c "Route the COMPLETE tiered list" .claude/get-shit-done/workflows/quick.md
# Expected: >= 1
```

---

## Patch 3: debug — Quality gates + document & merge

**File:** `commands/gsd/debug.md`
**Purpose:** After a debug fix is applied, run quality gates (triple-review, simplify) and close the loop with CHANGELOG + PR merge. Prevents debug fixes from bypassing the quality bar that phased work enforces.
**Insertion anchor:** Between the session manager return block (ending with `If summary shows 'ABANDONED': ...`) and `</process>`. Adds `## 5. Quality Gates` and `## 6. Document and Merge`.
**Dependencies:**
- `workflow.triple_review` config key
- `workflow.simplify` config key
- `docs/CHANGELOG.md` (skipped with warning if missing)
- `gh` CLI authenticated
- `.claude/commands/triple-review.md` skill

**Content summary:**
- Step 5a (Triple review): Skipped when `diagnose_only` is true or session `ABANDONED`. Routes ALL tiered findings to fix loop.
- Step 5b (Simplify): Runs after triple-review, commits as `refactor(debug-{slug}): simplify after review`.
- Step 6 (Document and Merge): Skipped when on main or when no fix was applied. Updates CHANGELOG with bug-fix entry, creates PR titled `fix: {slug}`, squash-merges, syncs main.

Also modifies the session manager's return-handling to route `DEBUG SESSION COMPLETE` into Step 5 (instead of stopping) and `ABANDONED` skips Steps 5-6.

**Verification:**
```bash
grep -c "## 5. Quality Gates" .claude/commands/gsd/debug.md
# Expected: >= 1
grep -c "## 6. Document and Merge" .claude/commands/gsd/debug.md
# Expected: >= 1
grep -c "Route the COMPLETE tiered list" .claude/commands/gsd/debug.md
# Expected: >= 1
```

---

## Patch 4: plan-phase — Staff Review Gate (step 12.6)

**File:** `get-shit-done/workflows/plan-phase.md`
**Purpose:** Runs `/staffreview` on every plan after the checker loop and optional bounce pass, catching architecture tradeoffs and cross-plan coupling that the automated plan-checker misses. Routes ALL tiered findings back to the revision loop.
**Insertion anchor:** New `## 12.6. Staff Review Gate` section between `## 12.5. Plan Bounce (Optional External Refinement)` (ends with "Remove all `*-PLAN.pre-bounce.md` backup files...") and `## 13. Requirements Coverage Gate`.

**Additional routing fixes in Step 11 and Step 12 of the same file:**
- Step 11 `VERIFICATION PASSED` branch: "proceed to step 13" → "proceed to step 12.5 (plan bounce, if enabled) and step 12.6 (staff review)"
- Step 12 no-issues branch (in the comment about issue_count == 0): "Proceed to step 13." → "Proceed to step 12.5 (plan bounce, if enabled) and step 12.6 (staff review)."
- Step 12 stall "Proceed anyway" (first occurrence): "continue to step 13" → "continue to step 12.6 (staff review)"
- Step 12 stall "Proceed anyway" (second occurrence): "continue to step 13" → "continue to step 12.6 (staff review)"

**Why step 12.6 (not the original 12.5):** v1.36.0 upstream now uses step 12.5 for "Plan Bounce (Optional External Refinement)" — a different workflow. Staff review is renumbered to 12.6 so both can coexist (bounce runs first if enabled, then staff review).

**Dependencies:**
- `.agent/skills/staffreview/SKILL.md`
- `.claude/commands/staffreview.md`
- `workflow.staffreview` config key (default `true`; opt-out via `false` or `--skip-staffreview` flag)
- `--gaps` flag skips the gate (gap-closure plans already have narrow scope)

**Content summary:**
- Invokes `Skill(staffreview, ${PHASE_DIR}/*-PLAN.md)` after step 12.5 bounce.
- Routes ALL tiered findings (Critical + Important + Refinements + Minor + Nitpick) back to step 12 revision loop — do NOT filter by tier.
- Capped at 2 additional revision iterations to prevent runaway loops.
- Non-blocking on skill unavailability: logs warning and proceeds to step 13.

**Verification:**
```bash
grep -c "## 12.6. Staff Review Gate" .claude/get-shit-done/workflows/plan-phase.md
# Expected: >= 1
grep -c "step 12.6 (staff review)" .claude/get-shit-done/workflows/plan-phase.md
# Expected: >= 3 (verification-passed + 2 stall-proceed routes)
grep -c "Route the COMPLETE tiered list" .claude/get-shit-done/workflows/plan-phase.md
# Expected: >= 1
```

---

## Patch 5: updateGSD — Parameter consistency + help file checks

**File:** `commands/updateGSD.md`
**Purpose:** Prevents stale autocomplete hints and help docs when changing flags/parameters. Claude Code slash commands have two layers (command file for metadata/autocomplete, workflow file for logic) plus a help file. All three must stay in sync when flags change. This patch adds mandatory cross-layer verification to the `/updateGSD` workflow itself.
**Insertion anchors:**
- Step 2 (Discover Target Files): after lookup table, before "Read each identified file"
- Step 6 (Verify): after grep verification, before Step 7

**Dependencies:** None.

**Content summary:**
- Step 2 "Parameter consistency rule": when change involves flags/parameters/argument names, ALWAYS include both the command file AND workflow file in the candidate list.
- Step 2 "Help file rule": when change modifies command behavior/flags/description, ALWAYS check `help.md` for stale description.
- Step 6 "Parameter consistency verification": explicit grep checks confirming (a) old flags absent from argument-hint, (b) new flags present in argument parsing, (c) help.md description matches new behavior.

**Why this patch survived the 1.34.2 → 1.36.0 wipe:** `commands/updateGSD.md` is a custom command outside the `commands/gsd/` and `get-shit-done/` directories that the GSD installer re-extracts over. It's retained as a patch entry for documentation purposes, not because it needs reapplying.

**Verification:**
```bash
grep -c "Parameter consistency" .claude/commands/updateGSD.md
# Expected: >= 2
grep -ic "help file" .claude/commands/updateGSD.md
# Expected: >= 1
```

---

## Dropped patches (from 1.34.2 era)

The following patches existed in the 1.34.2 PATCHES.md and were evaluated against v1.36.0 before being dropped on 2026-04-17. Record kept here for traceability.

| # | Original title | Reason dropped |
|---|----------------|----------------|
| 5 | quick: `--quick` default inversion (full mode as default) | User preference no longer desired; `--full` opt-in model retained |
| 8 | progress: parallel sub-agents + phase table + dependency analysis | Not reapplied per user instruction |
| 9 | update: auto-reapply patches after GSD update | Not reapplied per user instruction (manual `/gsd-reapply-patches` workflow retained) |
| 10 | execute-plan + execute-phase: auto-run Convex seed functions | Not reapplied per user instruction; `seed_functions` config key in `.planning/config.json` is orphaned but harmless |
| 11 | All workflows: explicit TaskCreate task tree | Not reapplied per user instruction |

**Original Patch 7 (ALL findings tier handling)** was fused directly into Patches 1, 2, 3, and 4 above rather than kept as a separate cross-cutting patch. Each review step embeds the "Route the COMPLETE tiered list" rule inline, making patches self-contained for future reapplication.

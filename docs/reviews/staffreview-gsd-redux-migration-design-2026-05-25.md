# Staff Review: GSD Redux Migration Design

**Date:** 2026-05-25
**Plan:** `docs/superpowers/specs/2026-05-25-gsd-redux-migration-design.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

This spec is a **meta-tooling migration plan**, not a Frollie feature plan. CLAUDE.md's mandatory "Planning Requirements" (Git Workflow / Implementation Waves / Documentation Updates / Success Criteria) are written for product code changes that flow through `npm run build` / Convex deploy / Vercel CI. They don't map cleanly to a user-config migration that touches `~/.claude/` rather than `src/` or `convex/`.

The Frollie-rubric checklist verdict:

| Required Section | Frollie Form | Spec Equivalent | Status |
|---|---|---|---|
| Git Workflow | branch + commit checkpoints | "Detailed Steps → Phase B Step B.8" (commit/merge) + "Committed Defaults → chore-branch fate" | ⚠️ Implicit — branch creation is in pre-flight A.1 but not explicit; commit checkpoints granular only to "end of Phase B" |
| Implementation Waves | parallel agent table | Phase A 1-8 + Phase B 1-8 (sequential, single-operator) | ⚠️ Restructured — no parallel waves applicable; sequential phases serve same role |
| Documentation Updates | CHANGELOG checkbox | "Detailed Steps → Phase B Step B.8 → CHANGELOG.md gets a one-line entry" | ✅ Present |
| Success Criteria | type-check + build | "Acceptance Tests" section with grep battery + smoke tests + workflow dry-run | ✅ Present (equivalent form) |

**Plan Structure Additions made silently to this review output:**
- See Section 8 (Git Workflow Assessment) for an explicit breakdown of branch / commit / verification checkpoints that the spec does NOT enumerate clearly.
- See Section 10 (Testing Plan Assessment) for the test/acceptance plan re-presented in standard form.

**Overall validation:** ✅ Plan structure validated (with substitutions noted) — proceeding to dual-persona review.

---

## 1. Summary

**Overall Assessment:** **Revise** — comprehensive design with 4 Critical issues that should be addressed before execution.

The spec is well-structured, captures the brainstorming decisions accurately, and has a clear two-phase architecture (1.0.0 baseline → 1.1.0 upgrade-as-audit). The dual backups + rollback paths give it strong reversibility. However, four execution-time gotchas could turn an estimated ~4-hour migration into a multi-day debugging session: (1) pre-flight git state handling is vague, (2) the `gsd-tools.cjs` smoke test assumes a binary entry path that the new fork may have renamed, (3) the `model-profiles.cjs` patch (Cohort 2 #5) has no concrete fallback if the fork restructured model resolution into a different file, and (4) two Critical anchors in plan-phase.md and execute-phase.md were not independently re-verified against gsd-redux 1.0.0's actual installed tree.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Pre-flight git state handling is vague — dirty `fix/bigseller-jwt-expiry-detection` branch with uncommitted .planning/, convex/_generated/, and untracked files at migration start | Workflow | Phase A Step A.1 + Detailed Steps Step A.1 |
| 2 | `gsd-tools.cjs --version` smoke test assumes a binary path the new fork may have renamed or removed | Logic | Phase A Step A.4 / Step A.8 / Phase B Step B.8 |
| 3 | Cohort 2 patch #5 (`model-profiles.cjs`) has no recovery path if 1.0.0 restructured model resolution | Logic | Detailed Steps Phase A Step A.5 |
| 4 | Critical anchors in plan-phase.md and execute-phase.md were not independently re-verified against gsd-redux 1.0.0 — Plan agent's "verified" list came from a WebFetch a few days ago, not a live install | Verification | Detailed Steps Phase A Step A.5 + Open Risks table |

**Details:**

### Issue 1: Pre-flight git state handling is vague

The spec's Phase A Step A.1 says: *"Git branch | `git -C "<project>" branch --show-current` | Note current"*. This tells the operator to *note* the branch — not to do anything about it. The Committed Defaults section says "Migration commits land on `chore/gsd-redux-migration`, merged to main when verified," but the actual branch creation isn't in pre-flight.

The user is currently on `fix/bigseller-jwt-expiry-detection` with modifications to:
- `.planning/phases/80.1-analytics-perf-consolidation/runtime-baseline.txt`
- `convex/_generated/api.d.ts`
- Multiple untracked test results, screenshots, and `.planning/` artifacts

If migration starts without explicitly handling this:
- Backup 1 captures `.claude/` correctly but the project tree's UNCOMMITTED edits are not part of git history, so a Rollback A `robocopy /MIR` will overwrite them with whatever was in the backup snapshot. The user-tree backup includes uncommitted state. The project-tree backup also includes uncommitted state. But the GIT INDEX state (staged-but-not-committed) isn't captured by robocopy — only the working-tree files.
- The Cohort 3 verification (Phase A Step A.5: `git status --short .claude/commands/` expects no output) will produce false positives if pre-existing uncommitted changes to `.claude/commands/` exist. That check needs to be against the pre-migration baseline, not "no output ever."
- The chore branch is referenced at commit time (Phase B Step B.8) but the operator never created it.

**Recommendation:** Replace Phase A Step A.1's git row with an explicit sequence:

```powershell
cd "D:\Claude\Product Manager\product_master"
git stash push -u -m "pre-migration-stash-$(Get-Date -Format yyyyMMdd-HHmmss)"
git status   # expect: nothing to commit, working tree clean
git switch -c chore/gsd-redux-migration
git status   # expect: clean tree on chore branch
```

Capture the stash message to a known location so Rollback A can restore via `git stash pop` of the correct stash. Without this, the rollback procedure ends with a `git stash pop` that may pop the WRONG stash if the user accumulated other stashes during a long migration session.

### Issue 2: `gsd-tools.cjs` binary path assumption

The spec assumes the binary path `C:/Users/Irfan/.claude/get-shit-done/bin/gsd-tools.cjs` survives the migration to gsd-redux. References:
- Phase A Step A.4 step: `node ~/.claude/get-shit-done/bin/gsd-tools.cjs ...` for pristine refresh (actually that one's about copying, not invoking — re-read)
- Phase A Step A.8 / Acceptance Tests "Smoke tests": `node C:/Users/Irfan/.claude/get-shit-done/bin/gsd-tools.cjs --version`
- Phase B Step B.8 commit messages reference the binary

The earlier research found that gsd-redux's bin entries are `get-shit-done`, `gsd-sdk`, `gsd-tools` — these are npm bin entries (shims in `$PATH`), not necessarily files at `bin/gsd-tools.cjs`. The new fork may have:
- Renamed the file (e.g., `bin/gsd.cjs`, `bin/cli.cjs`)
- Removed the `.cjs` extension (some packages use `.mjs` or no extension)
- Reorganised `bin/` into a different directory structure entirely

If `~/.claude/get-shit-done/bin/gsd-tools.cjs` doesn't exist post-install, every smoke test fails and the operator can't tell whether the install broke or just the smoke test's path is wrong. Compounding: the spec uses these failures as Phase A green-gate signals → false rollback trigger.

**Recommendation:** Add to Phase A Step A.3 (Install 1.0.0) an explicit "post-install path discovery" sub-step:

```powershell
# Find the actual gsd-tools binary post-install (Windows-compatible):
$gsdToolsPath = Get-ChildItem -Path "C:\Users\Irfan\.claude\get-shit-done\bin" -Filter "gsd-tools*" -Recurse | Select-Object -First 1
Write-Host "gsd-tools resolves to: $($gsdToolsPath.FullName)"

# Bin shim:
where.exe gsd-tools

# Use whichever path exists for all subsequent smoke tests.
```

Capture the resolved path to a variable used throughout the rest of the migration. If neither resolves, halt — the install didn't deposit the expected files.

### Issue 3: `model-profiles.cjs` Cohort 2 patch has no recovery path

Spec section "Detailed Steps → Phase A Step A.5" has a one-line note: *"Cohort 2 patch #5 sub-step: Before applying the model-profiles.cjs patch, inspect the file's current structure in 1.0.0 to confirm the JS object literal format hasn't been restructured (multi-file split, key renaming). If structure has diverged, adapt the patch's content to match the new shape rather than applying mechanically."*

"Adapt the patch's content to match the new shape" assumes the patch is STILL applicable in some form. What if:
- `bin/lib/model-profiles.cjs` no longer exists (e.g., the new fork uses JSON or TypeScript config)
- Model resolution moved into a different mechanism entirely (e.g., a `gsd-config.json` file, an environment variable, a database)
- The `gsd-debugger` agent name was renamed (the agent list at the conversation start includes `gsd-debugger` but the new fork's published skill list mentions `/gsd-debug`, not `gsd-debugger` as an agent)

The patch is *"insert this object literal into the model-profiles export"* — if there's nothing called model-profiles in 1.0.0, the patch has no target.

**Recommendation:** Add an explicit decision tree to Phase A Step A.5 for Cohort 2 #5:

```
1. Locate model-profiles file in 1.0.0:
   - .cjs/.js/.mjs at bin/lib/model-profiles.{ext}?
   - JSON at config/models.json or similar?
   - TypeScript at src/models.ts?
   - None — model resolution removed?

2. If file exists with similar structure → adapt and patch
3. If file exists with different structure → manual config edit, document as Patch 17 (new patch class)
4. If no model resolution layer found → halt. The Opus override for gsd-debugger may not be achievable in gsd-redux.
   Options: (a) accept that gsd-debugger will use default model in 1.0.0,
            (b) file an issue against open-gsd repo,
            (c) rollback to v1.41.0 and stay there.
```

Also: the gsd-debugger AGENT may not exist in gsd-redux. The new skill list shows `gsd-debug` (the skill/command, calls agents internally) but no top-level `gsd-debugger` agent. If the model-profiles patch references an agent name that doesn't exist post-install, the override does nothing even if applied.

### Issue 4: Critical anchors not independently re-verified

The spec's "Anchor risk surface" subsection in Phase A Step A.5 lists:

> **Verified present in v1.0.0 (research phase):**
> - `<step name="code_review_gate">` — Cohort 1 patches #2, #6 anchor
> - `verify_phase_goal` — sequencing anchor
> - `handle_partial_wave_execution` — Patch 1 anchor
> - `Step 6: Generate SPEC.md` — Patch 4 (RETIRES.md) anchor
> - `Step 7: Commit` — Patch 4 boundary

These were "verified" via a WebFetch of GitHub `main` branch source. That's not the npm-published 1.0.0 source — the GitHub main branch could be ahead of 1.0.0 (the WebFetch found a README mentioning "v1.42.1 release highlights" while npm only had v1.0.0 published). Anchors that exist in `main` but not in the npm 1.0.0 tarball will fail at migration time, and the operator won't know whether to (a) wait for npm to catch up, (b) install from GitHub, (c) downgrade expectations.

Additionally, the spec calls out that "Step 12.5" in plan-phase.md is NOT verified — but this is the anchor for Customisation #1 (the staffreview gate that you're running RIGHT NOW). If this anchor is gone in 1.0.0, the entire staffreview workflow that gates your plan-phase output disappears until it's manually re-anchored.

**Recommendation:** Add to Phase A Step A.3 (immediately after Install 1.0.0 completes) an "anchor verification" sub-step that runs grep checks against the freshly-installed tree:

```bash
echo "=== Anchor verification against fresh 1.0.0 install ==="
for anchor in \
  'code_review_gate' \
  'verify_phase_goal' \
  'handle_partial_wave_execution' \
  'Step 6: Generate SPEC.md' \
  'Step 7: Commit' \
  'Step 12.5' \
  'Step 12:' \
  ; do
  echo "--- '$anchor' ---"
  grep -rn "$anchor" "C:/Users/Irfan/.claude/get-shit-done/workflows/" || echo "NOT FOUND"
done
```

Capture output to `anchor-verification-1.0.0.log`. If any Critical anchor (especially Step 12.5) is missing, route to a research sub-task BEFORE proceeding to Phase A Step A.5. The cost is ~5 minutes; the upside is catching the unanchorable case before halfway through a 50-minute patch session.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Per-phase atomic commits, not single end-of-phase-B commit | High | Low |
| 2 | npm cache check before install (avoid stale `get-shit-done-cc` reinstall) | Medium | Low |
| 3 | Programmatic confirmation for the 4 workflow dry-run scenarios (not just visual) | Medium | Medium |
| 4 | Recovery path if PATCHES.md becomes inconsistent mid-step-B.6 | Medium | Low |
| 5 | `robocopy /MIR` mirror sync (Step A.6) should NOT delete project-tree files unique to project | Medium | Medium |
| 6 | Settings.json regex check (Step A.7) doesn't handle `$CLAUDE_PROJECT_DIR` substitution | Medium | Low |
| 7 | Verify `.claude/commands/updateGSD.md` is actually invocable post-install (not just file-exists) | High | Low |

**Details:**

### Improvement 1: Per-phase atomic commits

Spec section "Detailed Steps → Phase B Step B.8" has a single big commit at the very end covering all migration outcomes. If something breaks AFTER Phase A green-gate but BEFORE Phase B step B.8, you can't `git checkout` to "Phase A complete" — there's no commit there.

**Recommendation:** Add commit checkpoints at:
- End of Phase A Step A.8 (green-gate pass): `chore(gsd): phase A complete — gsd-redux@1.0.0 + 11 patches re-applied, all 15 grep checks pass`
- After Phase B Step B.2 (updateGSD audit complete): `chore(gsd): updateGSD lookup audit + e2e smoke test against 1.0.0`
- After Phase B Step B.6 if successful (re-apply complete): `chore(gsd): re-applied N patches against 1.1.0 via /updateGSD`
- After Phase B Step B.7 if it ran (self-fix bootstrap): `chore(gsd): updateGSD self-fix bootstrap — Patch 16 documents corrected lookup table for 1.1.0`
- After Phase B Step B.8 final acceptance: `chore(gsd): migration to @opengsd/get-shit-done-redux@1.1.0 complete`

Each commit becomes a meaningful rollback point via `git reset --hard <commit>` independent of robocopy-based file restores.

### Improvement 2: npm cache check before install

`npx` will use cached versions if available. If your machine has a cached `get-shit-done-cc@1.41.0`, a stale `npx get-shit-done-cc` somewhere (e.g., a script or muscle memory) could re-install the archived package.

**Recommendation:** Add to Phase A Step A.1:

```bash
npm cache verify
# Optional aggressive:
npm cache clean --force
```

And document at top of migration: "If you accidentally re-run `npx get-shit-done-cc@latest` AFTER this migration, you'll reinstall the archived package. Use `npx @opengsd/get-shit-done-redux@<version>` always."

### Improvement 3: Programmatic confirmation for workflow dry-run

Spec section "Acceptance Tests → Real workflow dry-run (Gate 2 only)" lists 4 scenarios, each ending with a manual visual check (e.g., "Step 12.5 prompt for Skill(staffreview) appears"). Manual visual checks in a 4-hour migration are easy to miss or rationalise.

**Recommendation:** For each scenario, capture stdout to a log file and grep for the expected gate name:

```bash
# Scenario 3 example — execute-phase gates:
# In Claude Code, invoke: /gsd-execute-phase 999
# Pipe stdout (or copy from log after the run) to a file
# Then verify:
grep -c "quad_review" /tmp/execute-999.log              # >= 1
grep -c "document_and_merge_gate" /tmp/execute-999.log  # >= 1
```

Trade-off: requires the operator to copy/pipe Claude Code stdout to a file, which is currently a UI quirk. If too cumbersome, at minimum require the operator to screenshot the gate prompt for each scenario.

### Improvement 4: PATCHES.md inconsistency recovery

Spec section "Phase B Step B.6 (Re-apply via /updateGSD)" implicitly trusts that `/updateGSD` is atomic — write file + write PATCHES.md entry + grep verify all succeed-or-fail together. updateGSD's actual flow has these as four separate stages. If migration is interrupted (network blip, Claude Code session restart, OS reboot) between PATCHES.md update and the grep-verify, PATCHES.md may claim a patch is applied that the actual file doesn't have.

**Recommendation:** Add a "PATCHES.md ↔ file consistency check" to Phase A Step A.8 and Phase B Step B.8 acceptance tests:

```bash
# For each Patch entry in PATCHES.md, run its verification grep and confirm count > 0:
# (Pseudo-code; needs PATCHES.md parser)
while IFS= read -r patch_section; do
  patch_file=$(echo "$patch_section" | grep "^\\*\\*File:" | cut -d':' -f2 | tr -d '` ')
  patch_verify=$(echo "$patch_section" | grep -A2 "\\*\\*Verification:" | grep "grep" | head -1)
  if [ -n "$patch_verify" ] && [ -n "$patch_file" ]; then
    eval "$patch_verify" || echo "INCONSISTENT: $patch_file claims patch but file lacks it"
  fi
done < PATCHES.md
```

If any patch claims-but-lacks, route to re-apply or remove the false PATCHES.md entry.

### Improvement 5: `robocopy /MIR` deletes destination-unique files

Phase A Step A.6 uses `/MIR` for mirror sync user→project. `/MIR` deletes anything in the destination that isn't in the source. If the project tree has any GSD-related files unique to it (e.g., a project-specific helper, an experimental agent, a custom hook), they'd be silently deleted.

Earlier inventory said the project tree's agents/hooks/get-shit-done were pure mirrors with no extras. But the spec should NOT trust that — it should explicitly check before mirroring.

**Recommendation:** Add to Phase A Step A.6 a pre-mirror diff check:

```powershell
# Before robocopy /MIR, identify files in project tree that are NOT in user tree:
$projGsd = Get-ChildItem "D:\Claude\Product Manager\product_master\.claude\get-shit-done" -Recurse -File | ForEach-Object { $_.FullName.Replace("D:\Claude\Product Manager\product_master\.claude\", "") }
$userGsd = Get-ChildItem "C:\Users\Irfan\.claude\get-shit-done" -Recurse -File | ForEach-Object { $_.FullName.Replace("C:\Users\Irfan\.claude\", "") }
$unique = Compare-Object $projGsd $userGsd | Where-Object SideIndicator -eq '<=' | ForEach-Object InputObject
if ($unique) {
  Write-Host "WARNING: Project tree has files not in user tree — /MIR will delete them:"
  $unique | ForEach-Object { Write-Host "  $_" }
  Read-Host "Proceed anyway? (Ctrl+C to abort)"
}
```

### Improvement 6: Settings.json regex doesn't handle `$CLAUDE_PROJECT_DIR`

The Node one-liner in Phase A Step A.7:
```js
const m = h.cmd.match(/C:\\Users\\Irfan\\\.claude\\hooks\\[a-zA-Z0-9_.-]+/);
```

This regex matches absolute Windows paths under user-level `~/.claude/hooks/`. The PROJECT settings.json uses `$CLAUDE_PROJECT_DIR/.claude/hooks/...` — the regex never matches, so every project hook reports as "no path found" (silent skip), not "MISSING."

**Recommendation:** Extend regex to handle `$CLAUDE_PROJECT_DIR`:

```js
const m = h.cmd.match(/(?:C:\\Users\\Irfan\\\.claude\\hooks|\$CLAUDE_PROJECT_DIR\\\.claude\\hooks)\\[a-zA-Z0-9_.-]+/);
// Then resolve $CLAUDE_PROJECT_DIR to actual project path before fs.existsSync:
const resolved = m[0].replace('$CLAUDE_PROJECT_DIR', 'D:\\Claude\\Product Manager\\product_master');
```

### Improvement 7: Verify `.claude/commands/updateGSD.md` is actually invocable

Spec Cohort 3 verification only confirms file existence. updateGSD's invocation depends on:
1. File at the correct path
2. Frontmatter format that the runtime parses
3. Registration with the runtime's command/skill registry

If gsd-redux 1.0.0 changed the slash-command registration mechanism (e.g., now requires `.claude/skills/updateGSD/SKILL.md` instead of `.claude/commands/updateGSD.md`), the file exists but `/updateGSD` doesn't fire.

**Recommendation:** Add to Phase A Step A.8 (Green-gate) and Phase B Step B.2 (e2e smoke test):

```
In Claude Code, type `/up` and confirm autocomplete shows `/updateGSD`.
Then type `/updateGSD --help` (or invoke with no args) — confirm the command's
description is rendered. If autocomplete misses it OR --help doesn't render,
the command isn't registered. Halt.
```

This catches the "file exists but isn't invocable" failure mode.

---

## 4. Refinements (Minor Suggestions)

- The CHANGELOG.md entry could link to PATCHES.md for the full customisation manifest, giving future readers a navigation aid.
- The "Decision Log" section is good but could link each row to the brainstorming question that prompted it (so reviewers can audit the reasoning chain).
- Mirror parity check lists 8 patched files, but Cohort 1 has 9 unique patch targets (counting `plan-phase.md`, `execute-phase.md` ×3 patches, `spec-phase.md` ×2 patches, `discuss-phase.md`, `quick.md`, `debug.md`) = 6 unique workflow files + 2 Cohort 2 files = 8. The number is correct; just confirm the count comment in the spec matches the file list.
- The "Plugin marketplace skills" risk in Open Risks has Low severity but mitigation says "inspect `~/.claude/plugins/` for stale entries" — could specify which paths (`plugins/cache/claude-plugins-official/superpowers/` for the skill cache).
- The robocopy `/XD backups .cache` exclusion list is correct but could also exclude `projects/` (user's MEMORY directory) — currently included in backup which is fine, but worth noting that restoring will also restore memory state.
- The "Anchor risk surface" table in Phase A Step A.5 has "Verified present in v1.0.0" entries from the research phase. The verification should be RE-done at execution time (research was done 2026-05-22..23, install happens later — could drift).
- The spec uses both "Step A.N" prefix notation (✅ post-self-review) and bare numbers in some places (e.g., "Step 5 quality gates" referring to debug.md's INTERNAL Step 5, which is correct but readers may confuse it with migration Step A.5). Consider a clarifying note distinguishing migration steps from GSD-workflow-internal steps.

---

## 5. Duplication Analysis

### Existing Code/Tools to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `verify-reapply-patches.cjs` | `C:\Users\Irfan\.claude\get-shit-done\bin\verify-reapply-patches.cjs` | OLD package's patch-verification tool. Read for reference patterns BEFORE it gets deleted by Phase A Step A.3 install. Captures the OLD package's mental model of patch verification — useful for understanding PATCHES.md grep verification format. |
| `backup-meta.json` | `C:\Users\Irfan\.claude\gsd-local-patches\backup-meta.json` | Existing patch-tracking metadata file — spec updates it in Phase A Step A.4. Pattern: `{ from_version, backed_up_at }`. Already familiar to the OLD package's machinery. |
| `gsd-pristine/` directory structure | `C:\Users\Irfan\.claude\gsd-pristine\` | Existing per-file baseline snapshot system. Phase A Step A.4 refreshes it. Mental model already proven. |
| `robocopy /MIR` | Windows built-in | Used throughout — well-understood, idempotent, no symlinks (Windows-friendly). Right tool for the job. |
| `fc /B` | Windows built-in | Binary file compare — used for mirror parity check + Phase B Step B.5 diff classification. Right tool. |

### Potential Duplication Risks

- **The spec re-defines acceptance gates that already exist in PATCHES.md's per-patch Verification blocks.** Acceptance tests should READ FROM PATCHES.md rather than hard-code the grep commands. Otherwise, the next time a patch is added, the spec's hard-coded grep battery falls out of sync with PATCHES.md.
  - **Recommendation:** Make the acceptance gate a PATCHES.md-driven loop (per Improvement 4). Single source of truth.
- **The spec's `chore/gsd-redux-migration` branch creation is a Frollie convention** (per CLAUDE.md, every code-change phase runs on a feature branch). But this migration doesn't touch Frollie code — only `.claude/` config files. The branch ceremony may be over-engineered for the actual change blast radius.
  - **Counter-argument:** Project mirror at `D:\...\.claude\` IS in the Frollie git tree. Changes there DO show in `git status` and CI may have hooks. Branch IS appropriate.

---

## 6. Phase/Wave Accuracy

Assessment of the implementation phases:

| Phase | Assessment | Notes |
|-------|------------|-------|
| Phase A (1.0.0 baseline) | Good | Sequential ordering is correct: pre-flight → backup → install → patch → mirror → settings → green-gate. Each step has clear inputs and outputs. |
| Phase B (audit + 1.1.0) | Needs Adjustment | Step B.1 (lookup audit against 1.0.0) and Step B.4 (install 1.1.0) are separated by Step B.2 (e2e smoke) and Step B.3 (Backup 2). The audit happens against 1.0.0, but the REAL audit value is whether updateGSD survives the 1.0.0→1.1.0 BUMP. Consider moving Step B.1 to AFTER Step B.4 — run the audit against the NEW install, not the OLD one. |

**Ordering issues:**
- Phase B Step B.1 lookup audit currently runs against 1.0.0. If 1.0.0 lookup audit passes (no drift) and 1.1.0 introduces drift, the spec's flow doesn't capture that — it assumes drift only appears once. Running the audit against BOTH 1.0.0 (pre-bump) and 1.1.0 (post-bump) is more thorough.
  - **Recommendation:** Split into Step B.1a (audit vs 1.0.0) and Step B.5a (audit vs 1.1.0). The DIFF between them is the real "what did 1.1.0 break" signal.

**Missing phases:**
- No explicit "post-migration validation soak time" phase. The spec ends with commit/merge. Reality: GSD workflows aren't exercised the moment they're installed — they fire on the NEXT plan/execute/debug invocation, days later. A "1-week soak" phase that says "do not delete Backup 2 until you've used /gsd-plan-phase, /gsd-execute-phase, /gsd-debug, /gsd-spec-phase against the new install in real work" would catch latent issues that grep battery + workflow dry-run miss.
  - **Recommendation:** Add Phase C (Soak) as a post-merge tracking checklist, not a step-by-step procedure.

---

## 7. Specialist Agent Recommendations

This spec is for a META-TOOLING migration, not a Frollie feature. The standard Frollie agent roster (`convex-backend`, `react-ui-builder`, etc.) does not apply.

**Appropriate agents for execution:**

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| All phases | `claude` (default, general-purpose) | The operator runs migration directly via Edit/Bash/Read/Write tools. No specialist needed. |
| Anchor re-research (if Step A.5 halts) | `Explore` (read-only) | Finding new anchor locations in 1.0.0 tree without modifying anything. |
| Diff classification (Phase B Step B.5) | `Explore` or `general-purpose` | Fan-out file comparison across the 11 patched files. |
| Self-fix bootstrap (Phase B Step B.7) | `claude` (manual editing of updateGSD.md) | One-time hand-edit; no specialist needed. |

**Note:** The skill's standard agent list includes `convex-backend` (irrelevant — no Convex changes), `react-ui-builder` (irrelevant — no UI changes), `code-auditor` (could be used for the acceptance grep battery but overkill), `cto-orchestrator` (could be used to manage Phase A and Phase B as separate orchestrated runs — worth considering if the operator wants context isolation between phases). `refactor-architect` is irrelevant.

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|------------|--------|
| Feature branch specified | ⚠️ Implicit — `chore/gsd-redux-migration` referenced at commit-time only, not pre-flight |
| Branch naming convention | ✅ Correct (matches `chore/` prefix convention from CLAUDE.md) |
| Merge strategy documented | ✅ Yes (`--no-ff` to main per Phase B Step B.8) |

### Commit Strategy (Critical Gap)

| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Phase A Step A.1–A.8 | **Currently 0; should be 1 at green-gate** | chore | All work bundled into end-of-migration commit |
| Phase B Step B.1–B.2 | **Currently 0; should be 1 after audit** | chore | Audit logs not committed |
| Phase B Step B.5–B.6 | **Currently 0; should be 1 after re-apply** | chore | Re-apply outcomes not committed |
| Phase B Step B.7 | **Currently 0; should be 1 if self-fix ran** | chore | updateGSD self-fix is significant — deserves own commit |
| Phase B Step B.8 | 1 (the only one currently planned) | chore | Single fat commit |

### Recommended Commit Checkpoints

The plan should commit at these natural boundaries:
1. After Phase A green-gate passes → `chore(gsd): phase A — install gsd-redux@1.0.0, re-apply 11 patches`
2. After Phase B Step B.2 → `chore(gsd): phase B audit — updateGSD lookup table + e2e smoke against 1.0.0`
3. After Phase B Step B.6 (only if re-applies happened) → `chore(gsd): phase B re-apply — re-applied N patches against 1.1.0 via /updateGSD`
4. After Phase B Step B.7 (only if self-fix ran) → `chore(gsd): phase B self-fix — Patch 16 corrects updateGSD lookup table for gsd-redux`
5. After Phase B Step B.8 → `chore(gsd): phase B complete — gsd-redux@1.1.0 verified`
6. Merge to main → `Merge chore/gsd-redux-migration to main`

### Pre-Push Verification

- [x] Plan includes `npm run build` check? — **N/A for this migration.** GSD migration doesn't affect Frollie code. Spec correctly omits this.
- [x] Plan includes `npm run type-check`? — **N/A**
- [x] Plan includes local testing before push? — ✅ Yes (Acceptance Tests section runs before commit)

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Documented (3 explicit rollback paths) |
| Deployment order | ✅ Correct (user-level first, then project mirror) |
| Data backup needed | ✅ Yes — 3 robocopy snapshots |
| Migration safety | ⚠️ Review needed — Critical issues 1-4 must be addressed |

### Git Workflow Issues Found

- **Issue:** Branch creation step missing from pre-flight. Currently only described in "Committed Defaults" section. Operator may forget.
- **Issue:** Single large commit at end means no intermediate rollback granularity. Already covered in Improvement 1.
- **Issue:** `git stash pop` in Rollback A is unsafe if other stashes accumulated during migration. Already covered in Critical Issue 1.

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Phase B Step B.8 | `docs/CHANGELOG.md` — one-line "Dev tooling" entry |
| Phase B Step B.7 (if self-fix) | `PATCHES.md` — new Patch 16 entry for updateGSD self-modification |
| Phase B Step B.8 | `MEMORY.md` — could add a "Migrated to gsd-redux 1.1.0 on YYYY-MM-DD" note under Production Environment section |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-MM-DD — GSD Redux Migration

**Migrated GSD development tooling from `get-shit-done-cc@1.41.0` (archived) to `@opengsd/get-shit-done-redux@1.1.0`.**

- Replaced unmaintained upstream package with the active fork at `@opengsd/get-shit-done-redux`.
- Re-applied 11 customisation patches against new baseline (5 workflow patches + 3 graphify patches + 2 code/agent patches + 1 cross-cutting rule).
- Fixed pre-existing `updateGSD` lookup-table drift (Patch 16).
- Verified compatibility via 15-customisation grep battery + 4-scenario workflow dry-run.

**Files Modified:**
- `.claude/get-shit-done/` (whole directory — new install)
- `.claude/agents/gsd-*.md` (re-patched)
- `.claude/gsd-local-patches/PATCHES.md` (Patch 16 added)
- `.claude/commands/updateGSD.md` (lookup table corrected for gsd-redux)

**Backups retained:**
- `KEEP-pre-redux-<ts>/` (permanent — v1.41.0 fallback)
- `KEEP-redux-110-final-<ts>/` (permanent — new reference state)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** **Adequate (for a tooling migration)**

This is a migration spec, not a feature plan — there are no new business logic functions to unit-test. The "testing" surface is acceptance gates + grep checks + workflow dry-runs. Evaluated against that:

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| File presence | All 15 customisations present in patched files | grep battery | ✅ Planned (Acceptance Tests section) |
| Tool availability | `gsd-tools --version`, `--help`, `graphify status` | Smoke tests | ⚠️ Planned but assumes binary path (see Critical #2) |
| Command registration | `/gsd-help` lists expected commands | Manual visual | ⚠️ Planned, manual only |
| Workflow gates fire | Plan-phase/Spec-phase/Execute-phase/Debug gates trigger | Workflow dry-run | ⚠️ Planned, manual visual confirmation |
| Mirror parity | User-tree files == project-tree files | `fc /B` | ✅ Planned |
| PATCHES.md integrity | Patch counts match expected | grep | ✅ Planned |
| Settings.json hooks | All hook file refs resolve | Node fs.existsSync | ⚠️ Regex misses `$CLAUDE_PROJECT_DIR` (see Improvement 6) |
| updateGSD function | Lookup table valid + e2e smoke + post-upgrade re-apply | Phase B audit | ✅ Planned (Phase B Steps B.1, B.2, B.6) |

### Missing Test Coverage (Should Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Anchor verification against fresh 1.0.0 install before patch application | Without this, patch application can fail halfway through with no recovery context (see Critical #4) | Add to Phase A Step A.3: grep loop for each anchor against installed tree |
| 2 | Command-invocability check for `/updateGSD` and other custom commands | File-existence ≠ command-registered (see Improvement 7) | Add to Phase A Step A.8 and Phase B Step B.8: type-and-autocomplete-check |
| 3 | PATCHES.md ↔ file consistency check | Atomicity assumption may not hold across interrupts (see Improvement 4) | Add to acceptance batteries: per-patch verify grep loop |

### Test Execution Checkpoints

Should run tests at:
1. After Phase A Step A.3 (install 1.0.0): anchor verification grep loop
2. After Phase A Step A.5 (patch application): per-patch verification grep
3. Phase A Step A.8 (green-gate): full 15-customisation battery
4. Phase B Step B.2 (e2e smoke): updateGSD invocation + revert
5. Phase B Step B.5 (diff classification): per-file fc/B + grep
6. Phase B Step B.6 (re-apply): per-patch verification grep
7. Phase B Step B.8 (final): full battery + workflow dry-run

### Regression Risk

- **Frollie code:** None. This migration doesn't touch `src/` or `convex/`.
- **GSD workflows in active use:** All 15 customisations. The grep battery covers presence; the workflow dry-run covers behavioural firing.
- **Custom commands (`triple-review`, `staffreview`, `updateGSD`):** These ARE in active use. Workflow dry-run scenario 1 (staffreview gate) tests one indirectly. Should add a scenario for `/triple-review --external-review=<path>` to verify the custom arg parsing still works.

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] **Operator interrupts migration mid-Phase A** — what's the state? Are backups still valid? (Spec covers full rollback but not "I'm halfway through patch 5 of 11 and need to stop")
- [ ] **Operator runs Phase B before Phase A green-gate fully passes** — should be blocked. Spec implies it but doesn't enforce.
- [ ] **`npx @opengsd/...@1.0.0` resolves to a different version due to npm registry mirror lag** — `npx` doesn't always pin exactly. Suggest: `--prefer-online` flag to force fresh resolve.
- [ ] **Multiple Claude Code sessions running during migration** — robocopy may hit file locks. Spec mentions closing sessions in pre-flight but doesn't say what to do if they re-spawn (some IDE integrations re-launch automatically).
- [ ] **User has a custom skill at `~/.claude/skills/gsd-something/` that the new installer overwrites with same name but different content** — installer's "preserve local mods" doesn't cover this scenario explicitly per the audit.
- [ ] **`@opengsd/get-shit-done-redux@1.1.0` introduces a breaking config-schema change** that auto-migration handles but with a warning — operator may miss the warning in a long log.
- [ ] **The migration commits get rejected by main's branch protection** (if `chore/` branches aren't allowed to merge without PR review). Spec assumes direct merge OK.
- [ ] **PowerShell vs Git Bash path resolution differences** — spec uses `C:/Users/Irfan/.claude/` with forward slashes (Git Bash style) AND `C:\Users\Irfan\.claude\` with backslashes (PowerShell style) — both work in most contexts but some commands (especially `robocopy`) prefer one style.

---

## 12. Approval Conditions

**For Approval, address:**

1. **Critical #1:** Pre-flight git state handling — explicit stash + branch creation in Step A.1.
2. **Critical #2:** Add post-install binary path discovery sub-step to Step A.3.
3. **Critical #3:** Add explicit decision tree for Cohort 2 #5 if `model-profiles.cjs` is missing/restructured.
4. **Critical #4:** Add anchor verification sub-step to Step A.3 — grep each Critical anchor against fresh 1.0.0 install.

**Recommended before implementation:**

1. **Improvement #1:** Add per-phase atomic commit checkpoints (Phase A green-gate, Phase B audit, Phase B re-apply, Phase B self-fix, Phase B final).
2. **Improvement #5:** Add pre-mirror diff check to Step A.6 to surface project-tree-unique files before `/MIR` deletes them.
3. **Improvement #6:** Extend Step A.7 settings.json regex to handle `$CLAUDE_PROJECT_DIR` substitution.
4. **Improvement #7:** Add command-invocability check (autocomplete + `--help`) for `/updateGSD` in green-gate.

**Optional refinements:**
- Section 4 minor items (CHANGELOG links, Decision Log source-question links, regex cleanup, plugin path specificity).
- Section 6 phase ordering: split Step B.1 into pre-bump + post-bump audits.
- Section 6 Phase C: add post-migration soak-time tracking checklist.

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

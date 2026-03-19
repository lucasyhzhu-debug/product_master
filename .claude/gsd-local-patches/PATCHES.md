# Local GSD Patches

Frollie Recipe Master customizations to GSD workflows. These modifications add automated documentation (CHANGELOG), PR creation, and merge steps to close the loop on every workflow that produces code changes.

---

## Patch 1: execute-phase — Document & Merge PR

**File:** `get-shit-done/workflows/execute-phase.md`
**Purpose:** After phase verification and roadmap update, automatically update CHANGELOG.md, create a PR, squash-merge, and sync local main. Eliminates manual post-phase merge ceremony.
**Insertion anchor:** Between `</step>` closing `update_roadmap` and `<step name="offer_next">`
**Dependencies:**
- `docs/CHANGELOG.md` (must exist)
- `gh` CLI authenticated
- Git branch strategy set to `"phase"` in `.planning/config.json`

**Content:**
```markdown
<step name="document_and_merge">
**Update documentation and merge the phase branch to main via PR.**

**Skip if:** `branching_strategy` is `"none"` (no branch to merge).

**1. Update CHANGELOG.md:**
Read `docs/CHANGELOG.md` and add an entry under the current `[Unreleased]` section.
Source details from SUMMARY.md files. Keep it concise.
Commit: `docs({X}): add changelog entry`

**2. Push branch and create PR:**
```bash
git push origin "${BRANCH_NAME}" -u
gh pr create --title "{short title}" --body "..."
```

**3. Squash-merge PR:**
```bash
gh pr merge {PR_NUMBER} --squash --delete-branch
```

**4. Sync local main:**
```bash
git checkout main && git pull origin main
```
</step>
```

**Verification:**
```bash
grep -c "document_and_merge" .claude/get-shit-done/workflows/execute-phase.md
# Expected: >= 1
```

---

## Patch 2: quick — Triple Review + Simplify + Document & Merge

**File:** `get-shit-done/workflows/quick.md`
**Purpose:** Add quality gates (triple-review, simplify) in `--full` mode and automated doc+merge for feature branches. Brings quick tasks to the same quality bar as full phase execution.
**Insertion anchors:**
- Steps 6.1 and 6.2: Between "Note: For quick tasks producing multiple plans..." and "**Step 6.5: Verification**"
- Step 9: After the final `</process>` closing marker (before `<success_criteria>`)
**Dependencies:**
- `workflow.triple_review` config key in `.planning/config.json`
- `workflow.simplify` config key in `.planning/config.json`
- `.claude/commands/triple-review.md` (skill file)
- `docs/CHANGELOG.md` (must exist)
- `gh` CLI authenticated

**Content (Step 6.1 — Triple Review):**
```markdown
**Step 6.1: Triple review (only when `$FULL_MODE`)**
Skip if NOT `$FULL_MODE`. Check `workflow.triple_review` config.
If true: spawn triple-review sub-agent. Fix Critical + Important findings.
```

**Content (Step 6.2 — Simplify):**
```markdown
**Step 6.2: Simplify (only when `$FULL_MODE`)**
Skip if NOT `$FULL_MODE`. Check `workflow.simplify` config.
If true: spawn simplify sub-agent. Commit fixes.
```

**Content (Step 9 — Document & Merge):**
```markdown
**Step 9: Document and merge (only when on a feature branch)**
Skip if on main. Update CHANGELOG, push, create PR, squash-merge, sync.
```

**Verification:**
```bash
grep -c "Triple review" .claude/get-shit-done/workflows/quick.md
# Expected: >= 1
grep -c "document_and_merge\|Document and merge" .claude/get-shit-done/workflows/quick.md
# Expected: >= 1
```

---

## Patch 3: debug — Triple Review + Simplify + Document & Merge

**File:** `commands/gsd/debug.md`
**Purpose:** After a debug fix is applied, run quality gates (triple-review, simplify) and automated doc+merge. Prevents debug fixes from bypassing the quality bar that phased work enforces.
**Insertion anchor:** Between `</process>` and `<success_criteria>`
**Dependencies:**
- `workflow.triple_review` config key in `.planning/config.json`
- `workflow.simplify` config key in `.planning/config.json`
- `docs/CHANGELOG.md` (must exist)
- `gh` CLI authenticated

**Content (Step 6 — Quality Gates):**
```markdown
## 6. Quality Gates (After Fix Applied)
Skip if fix was "Plan fix" or "Manual fix".
6a. Triple review (if config enabled)
6b. Simplify (if config enabled)
```

**Content (Step 7 — Document & Merge):**
```markdown
## 7. Document and Merge (After Quality Gates)
Skip if on main. Update CHANGELOG, push, create PR, squash-merge, sync.
```

**Verification:**
```bash
grep -c "Quality Gates" .claude/commands/gsd/debug.md
# Expected: >= 1
grep -c "Document and Merge" .claude/commands/gsd/debug.md
# Expected: >= 1
```

---

## Patch 5: quick — Swap --full default (full mode is now default)

**Files:**
- `get-shit-done/workflows/quick.md` (workflow logic)
- `commands/gsd/quick.md` (command metadata / autocomplete)
- `get-shit-done/workflows/help.md` (command reference documentation)

**Purpose:** Makes full mode (plan-checking, verification, triple-review, simplify) the default behavior of `/gsd:quick`. Adds `--quick` flag to opt out of quality gates for fast execution. Previously, quality gates required `--full` flag.
**Insertion anchor:** Multiple locations — purpose block, Step 1 argument parsing, banner logic, success criteria (workflow); description, argument-hint, objective (command); Quick Mode section (help)
**Dependencies:**
- None (pure flag rename + default inversion; all conditional logic uses `$FULL_MODE` which is now derived as `NOT $QUICK_MODE`)

**Content (workflow):**
```markdown
- Replaced `--full` flag with `--quick` flag in argument parsing
- Added derivation: `$FULL_MODE = NOT $QUICK_MODE` (true by default)
- Updated banners: default shows "Plan checking + verification enabled (default)", --quick shows "Quality gates skipped"
- Updated composable flag docs: `--discuss --quick` gives discussion but skips quality gates
- Updated success criteria: "(--full)" → "(default, skip with --quick)"
- All internal $FULL_MODE conditional logic unchanged — just fires by default now
```

**Content (command):**
```markdown
- argument-hint changed from "[--full] [--discuss]" to "[--quick] [--discuss]"
- description updated to reflect full quality gates as default
- objective text: --full flag docs replaced with --quick flag docs
```

**Content (help):**
```markdown
- Updated /gsd:quick header to show `[--quick] [--discuss]` flags
- Description changed from "skip optional agents" to "full GSD quality gates by default"
- Added --quick and --discuss flag descriptions
- Added composable flags note and multiple usage examples
```

**Verification:**
```bash
grep -c "\-\-quick" .claude/get-shit-done/workflows/quick.md
# Expected: >= 5
grep -c "FULL_MODE = NOT" .claude/get-shit-done/workflows/quick.md
# Expected: >= 1
grep -c "\-\-quick" .claude/commands/gsd/quick.md
# Expected: >= 3
grep -c "\-\-full" .claude/commands/gsd/quick.md
# Expected: 0
grep -c "\-\-quick" .claude/get-shit-done/workflows/help.md
# Expected: >= 2
```

---

## Patch 6: updateGSD — Parameter consistency + help file checks

**File:** `commands/updateGSD.md`
**Purpose:** Prevents stale autocomplete hints and help docs when changing flags/parameters. Claude Code slash commands have two layers (command file for metadata/autocomplete, workflow file for logic) plus a help file. All three must stay in sync when flags change. This patch adds mandatory cross-layer verification.
**Insertion anchors:**
- Step 2 (Discover Target Files): after lookup table, before "Read each identified file"
- Step 6 (Verify): after grep verification, before Step 7
**Dependencies:**
- None

**Content (Step 2 — discovery rule):**
```markdown
Added "Parameter consistency rule" and "Help file rule":
- When change involves flags/parameters/argument names, ALWAYS include both the command file AND workflow file
- When change modifies command behavior/flags/description, ALWAYS check help.md for stale description
```

**Content (Step 6 — verification sub-step):**
```markdown
Added "Parameter consistency verification" after standard grep checks:
- Grep command file argument-hint for old flags (expect 0) and new flags (expect >=1)
- Grep workflow file argument parsing for old flags (expect 0) and new flags (expect >=1)
- Grep help.md for command name and verify description matches new behavior
- Fix any stale references before proceeding to PATCHES.md update
```

**Verification:**
```bash
grep -c "Parameter consistency" .claude/commands/updateGSD.md
# Expected: >= 2
grep -c "help file" .claude/commands/updateGSD.md
# Expected: >= 1 (case insensitive)
```

---

## Patch 4: plan-phase — Staff Review integration

**File:** `get-shit-done/workflows/plan-phase.md`
**Purpose:** Pre-existing patch — runs /staffreview on plans before execution.
**Insertion anchor:** After plan-checker loop completes, before offering next step.
**Dependencies:**
- `.agent/skills/staffreview/SKILL.md`

**Verification:**
```bash
grep -c "staffreview\|Staff Review" .claude/get-shit-done/workflows/plan-phase.md
# Expected: >= 1
```

---

## Patch 7: All review workflows — Address ALL feedback tiers, not just critical

**Files:**
- `get-shit-done/workflows/plan-phase.md` (Step 12.5 staff review handling)
- `get-shit-done/workflows/execute-phase.md` (triple_review step handling + auto-advance)
- `get-shit-done/workflows/quick.md` (Step 6.1 triple review handling)

**Purpose:** Previously, only Critical issues (and sometimes Important) were sent back for revision after staff/triple review. Refinements and Minor/Nitpick items were merely noted in status output and skipped. This patch changes all three workflows to send the COMPLETE tiered feedback list for revision, ensuring every finding is addressed — not just the high-severity ones.
**Insertion anchors:**
- plan-phase.md: "Handle results from sub-agent return" block in Step 12.5
- execute-phase.md: "Handle results from sub-agent return" block in triple_review step + auto-advance bullet
- quick.md: "Handle results" line after triple-review sub-agent spawn in Step 6.1
**Dependencies:**
- None (behavioral change only — same sub-agents, same revision loops)

**Content:**
```markdown
All three files changed from tier-selective handling to:
- **ALL findings (Critical + Important + [Refinements|Minor + Nitpick])** → route to revision/fix. Include the complete tiered list so all items are addressed.
- Removed: "Minor/Nitpick → note and continue" and "Refinements → note in status output"
- execute-phase auto-advance: changed "Critical/Important items pause" to "All review findings pause"
```

**Verification:**
```bash
grep -c "ALL findings" .claude/get-shit-done/workflows/plan-phase.md
# Expected: >= 1
grep -c "ALL findings" .claude/get-shit-done/workflows/execute-phase.md
# Expected: >= 1
grep -c "ALL findings" .claude/get-shit-done/workflows/quick.md
# Expected: >= 1
grep -c "All review findings pause" .claude/get-shit-done/workflows/execute-phase.md
# Expected: >= 1
```

---

## Patch 8: progress — Parallel sub-agents + phase table + dependency analysis

**Files:**
- `commands/gsd/progress.md` (allowed-tools: added Agent)
- `get-shit-done/workflows/progress.md` (major restructure)
- `get-shit-done/workflows/help.md` (updated description)

**Purpose:** `/gsd:progress` was slow because it ran 6+ sequential steps (init, load, analyze_roadmap, recent, position, report). This patch replaces the 4 data-gathering steps (load, analyze_roadmap, recent, position) with a single `parallel_gather` step that dispatches 3 concurrent Explore sub-agents. Also adds two new report sections: a Phase Overview table showing status per phase (Pending/Discussed/Planned/In Progress/Complete) with key objectives, and a "Ready to Work In Parallel" section showing which phases can be discussed/planned simultaneously based on dependency analysis.
**Insertion anchors:**
- progress.md (command): `allowed-tools` list — added `Agent`
- progress.md (workflow): Replaced steps `load`, `analyze_roadmap`, `recent`, `position` with `parallel_gather`; replaced `report` step with enhanced version
- help.md: `/gsd:progress` description block

**Dependencies:**
- Agent tool must be available to the orchestrator
- `gsd-tools.cjs roadmap analyze` must return `dependencies` per phase and `disk_status`

**Content:**
```markdown
3 parallel sub-agents replace 4 sequential steps:
- Agent 1 (Roadmap & Phase Table): runs roadmap analyze + progress bar, checks each phase directory for CONTEXT/PLAN/SUMMARY files, builds status table
- Agent 2 (Recent Work & State): runs state-snapshot, finds 3 most recent SUMMARYs, counts todos and debug sessions, reads profile
- Agent 3 (Dependency Analysis): parses phase dependencies from roadmap analyze, determines which non-complete phases have all deps satisfied, suggests /gsd: action per parallelizable phase

Report enhanced with:
- "Phase Overview" table: | # | Phase | Status | Key Objective |
- "Ready to Work In Parallel" section: lists parallelizable phases with suggested commands + blocked phases with missing deps

Success criteria updated: agents must dispatch in single message, table must appear, parallelizable phases must be listed.
```

**Verification:**
```bash
grep -c "Agent" .claude/commands/gsd/progress.md
# Expected: >= 1
grep -c "parallel_gather" .claude/get-shit-done/workflows/progress.md
# Expected: >= 1
grep -c "Phase Overview" .claude/get-shit-done/workflows/progress.md
# Expected: >= 1
grep -c "Parallelizable" .claude/get-shit-done/workflows/progress.md
# Expected: >= 2
grep -c "parallel sub-agents" .claude/get-shit-done/workflows/help.md
# Expected: >= 1
```

---

## Patch 9: update — Auto-reapply patches after GSD update

**Files:**
- `commands/gsd/update.md` (command metadata + allowed-tools)
- `get-shit-done/workflows/update.md` (workflow execution logic)

**Purpose:** Eliminates the manual `/gsd:reapply-patches` step after every GSD update. The update workflow now automatically detects PATCHES.md, parses all patch entries, and reapplies them using intent-aware anchor merging immediately after the npm install completes. This makes GSD updates a single atomic operation: update + reapply.
**Insertion anchors:**
- commands/gsd/update.md: `allowed-tools` list — added Read, Write, Edit, Glob, Grep; `description` and `<objective>` updated to mention auto-reapply
- workflows/update.md: Replaced `<step name="check_local_patches">` (which only printed "run /gsd:reapply-patches") with `<step name="reapply_patches">` containing full intent-aware merging logic; updated `<success_criteria>` with patch verification items
**Dependencies:**
- `.claude/gsd-local-patches/PATCHES.md` (must exist for auto-reapply; falls back gracefully if missing)
- `.claude/gsd-local-patches/backup-meta.json` (created by GSD installer during update)

**Content (command):**
```markdown
- Added allowed-tools: Read, Write, Edit, Glob, Grep (needed for reading PATCHES.md and editing files during reapply)
- Updated description: "Update GSD to latest version, then auto-reapply local patches from PATCHES.md"
- Updated objective: added bullet for "Automatic patch reapplication" and "Verification of reapplied patches"
```

**Content (workflow):**
```markdown
Replaced `check_local_patches` step (4 lines: detect backup-meta.json, print "run /gsd:reapply-patches") with `reapply_patches` step containing:
1. Detect patches directory across all runtime dirs (.claude, .opencode, .gemini)
2. Load and parse PATCHES.md into structured patch list
3. For each patch: grep for key phrase → if missing, find anchor in new file → Edit tool to insert content
4. Handle multi-file patches and behavioral patches (diff backed-up vs new version)
5. Run all verification commands from PATCHES.md
6. Display summary table with per-patch status (Merged / Already upstream / Anchor missing)
7. Graceful fallback: if no PATCHES.md, suggests manual /gsd:reapply-patches
```

**Verification:**
```bash
grep -c "reapply_patches" .claude/get-shit-done/workflows/update.md
# Expected: >= 1
grep -c "PATCHES.md" .claude/get-shit-done/workflows/update.md
# Expected: >= 3
grep -c "intent-aware" .claude/get-shit-done/workflows/update.md
# Expected: >= 1
grep -c "auto-reapply" .claude/commands/gsd/update.md
# Expected: >= 1
grep -c "Read" .claude/commands/gsd/update.md
# Expected: >= 1
```

---

## Patch 10: execute-plan + execute-phase — Auto-run Convex seed functions

**Files:**
- `get-shit-done/workflows/execute-plan.md` (dev seeding after each plan)
- `get-shit-done/workflows/execute-phase.md` (prod seeding after merge)

**Purpose:** Eliminates manual "User Setup Required" notes for idempotent seed functions (like `accounts:seedDefaults`). Instead, the executor auto-runs all registered seed functions after each plan completes (dev), and the phase orchestrator runs them on production after merge. Also ensures Convex dev is running before attempting seeds — starts it automatically if not.
**Insertion anchors:**
- execute-plan.md: New `<step name="run_seed_functions">` between `generate_user_setup` and `create_summary` steps
- execute-phase.md: New step **3.5** inside `document_and_merge`, between squash-merge PR and sync local main
**Dependencies:**
- `.planning/config.json` must have `convex.seed_functions` array (e.g., `["accounts/mutations:seedDefaults", "tags:seedDefaults", "menuProducts:seedDefaults"]`)
- `npx convex` CLI must be available
- Seed functions MUST be idempotent upserts (safe to run repeatedly)

**Content (execute-plan.md — dev seeding):**
```markdown
<step name="run_seed_functions">
1. Read convex.seed_functions from config.json (skip if missing/empty)
2. Ensure Convex dev is reachable — test by running first seed
3. If "Could not find public function" error: start `npx convex dev &`, wait for "Convex functions ready" (max 90s)
4. Run each seed: `npx convex run {fn}` — log ✓/✗ per function
5. Non-blocking: seed failures warn but don't stop the plan
</step>
```

**Content (execute-phase.md — prod seeding):**
```markdown
Step 3.5 inside document_and_merge:
1. Read convex.seed_functions from config.json (skip if missing/empty)
2. Wait 30s for CI/CD to deploy Convex functions to production
3. Run each seed: `npx convex run {fn} --prod` — log ✓/✗
4. Non-blocking: failures warn but don't stop the merge flow
```

**Verification:**
```bash
grep -c "run_seed_functions" .claude/get-shit-done/workflows/execute-plan.md
# Expected: >= 1
grep -c "Seed production" .claude/get-shit-done/workflows/execute-phase.md
# Expected: >= 1
grep -c "seed_functions" .planning/config.json
# Expected: >= 1
```

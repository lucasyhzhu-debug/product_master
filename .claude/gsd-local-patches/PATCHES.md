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

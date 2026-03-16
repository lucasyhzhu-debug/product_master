---
name: updateGSD
description: Modify GSD workflows, commands, agents, templates, or references with automatic patch documentation
argument-hint: [description of what to change]
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Task
---

<objective>
Apply targeted modifications to GSD workflow files and keep PATCHES.md in sync so every local customization survives future GSD updates.

**Scope of files this command may modify:**
- `.claude/get-shit-done/workflows/*.md`
- `.claude/get-shit-done/references/*.md`
- `.claude/get-shit-done/templates/*.md`
- `.claude/commands/gsd/*.md`
- `.claude/agents/gsd-*.md`
- `.claude/gsd-local-patches/PATCHES.md` (patch registry — always updated)

**Never modify files outside the GSD scope listed above.**
</objective>

<process>

## Step 1: Parse Intent

The user's request: $ARGUMENTS

**If $ARGUMENTS is empty:**

Use AskUserQuestion:
```
What GSD workflow change do you want to make?
Examples:
  - "add triple-review step to debug workflow after fix is applied"
  - "make execute-phase skip simplify when --quick flag is passed"
  - "add a new config toggle workflow.auto_merge that controls whether PRs are auto-merged"
```

Set `USER_INTENT` to the response (or to $ARGUMENTS if provided).

---

## Step 2: Discover Target Files

Based on `USER_INTENT`, identify which GSD files are likely candidates.

**Lookup table — match keywords to file locations:**

| Keyword in intent | Candidate files |
|-------------------|----------------|
| "execute-phase", "execute phase" | `.claude/get-shit-done/workflows/execute-phase.md` |
| "plan-phase", "plan phase" | `.claude/get-shit-done/workflows/plan-phase.md` |
| "quick", "quick task" | `.claude/get-shit-done/workflows/quick.md` |
| "debug" | `.claude/commands/gsd/debug.md` |
| "update", "gsd update" | `.claude/commands/gsd/update.md` |
| "verify", "verify-work" | `.claude/commands/gsd/verify-work.md` |
| "new milestone", "milestone" | `.claude/commands/gsd/new-milestone.md` |
| "agent", "gsd-debugger", "gsd-planner" | `.claude/agents/gsd-*.md` matching name |
| "reference", "ui-brand", "brand" | `.claude/get-shit-done/references/ui-brand.md` |
| "template" | `.claude/get-shit-done/templates/*.md` |

When keywords are ambiguous or multiple files match, list all candidates.

**Read each identified file** to understand current structure before proposing changes. Look for:
- Existing step names (`## Step N:` or `<step name="...">`)
- Section headers that serve as stable anchor points
- Whether the desired content already exists (if so, report "Already present" and stop)

---

## Step 3: Assess Complexity

Classify the change:

**Simple** — ALL of the following are true:
- 1-2 files affected
- Clear insertion point (a specific step or section is the obvious anchor)
- Adding or modifying a step, not restructuring the file
- No new config keys, no new files, no branching logic changes

**Complex** — ANY of the following:
- 3+ files need changes
- New command, workflow, or agent being created from scratch
- Structural changes (reordering steps, splitting sections)
- New config keys with branching logic
- Trade-offs exist between multiple valid approaches
- Insertion point is unclear

---

## Step 4a: Simple Path — Confirm and Apply

Present a clear preview to the user:

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Decision Required                               ║
╚══════════════════════════════════════════════════════════════╝

Proposed change:

  File:             {relative path}
  Insertion point:  {anchor — e.g., "after ## Step 6: Quality Gates"}
  Change type:      {Add step / Modify step / Replace section}

Before:
  {1-5 lines of surrounding context at insertion point}

After:
  {same context + new/modified content}

──────────────────────────────────────────────────────────────
→ Apply these changes? (yes / adjust: describe what to change)
──────────────────────────────────────────────────────────────
```

If user says "adjust" or describes a correction, incorporate feedback and show the preview again.
If user says "yes" or equivalent, proceed to Step 5.

---

## Step 4b: Complex Path — Full Brainstorm

### 4b.1: Clarifying questions

Ask 2-4 questions, one at a time via AskUserQuestion. Prefer multiple choice. Only ask what is genuinely unclear.

Examples of useful clarifying questions:
- "Should this apply to all runs, or only when a config flag is set? (all runs / config-gated)"
- "Which workflows need this change? (list candidates)"
- "Should this be a new step or an addition to an existing step?"
- "Is this for new code only, or should existing phases be affected retroactively?"

### 4b.2: Propose approaches

After gathering answers, propose 2-3 approaches:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► UPDATE — APPROACH SELECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Option A — {name}**
Files: {list}
Trade-offs: {pros and cons}

**Option B — {name}**
Files: {list}
Trade-offs: {pros and cons}

**Option C — {name}** ← Recommended
Files: {list}
Trade-offs: {pros and cons}
Reason recommended: {one sentence}
```

### 4b.3: Design for approval

Once the user selects an option, present the full design (all files, all insertions, all content). Ask for approval before applying.

---

## Step 5: Apply Modifications

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► UPDATE — APPLYING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

For each file to modify:

1. **Read the current file** (confirm content hasn't changed since Step 2)
2. **Find the exact insertion point** — locate the anchor text that was confirmed in the preview
3. **Use Edit tool** for surgical changes (never Write, which would overwrite surrounding content)
4. **Confirm the edit did not corrupt structure** by reading back the affected section

If the same change is needed in multiple files, apply them sequentially (read → edit → verify per file).

---

## Step 6: Verify

For each modified file, run a grep check to confirm the change landed:

```bash
grep -c "{key_phrase_from_the_added_content}" "{file_path}"
```

Evaluate result:
- Count >= 1: `✓ Verified`
- Count = 0: `✗ Not found — edit may have failed`

If any verification fails, re-read the file to diagnose and retry the edit.

---

## Step 7: Update PATCHES.md

Read `.claude/gsd-local-patches/PATCHES.md` to understand existing patches.

**Determine patch number:**
- Count existing `## Patch N:` entries
- If a patch for the same file AND same purpose already exists: UPDATE that entry (same number)
- If new: use `N = existing_count + 1`

**Write the patch entry** using this exact structure:

```markdown
## Patch {N}: {filename without path} — {short title (5-8 words)}

**File:** `{path relative to .claude/ — e.g., get-shit-done/workflows/execute-phase.md}`
**Purpose:** {1-2 sentences explaining why this patch exists and what problem it solves}
**Insertion anchor:** {precise description of where the change goes, using step names or section headers from the file — e.g., "Between `</step>` closing `update_roadmap` and `<step name="offer_next">`"}
**Dependencies:**
- {Any file, config key, CLI tool, or skill file that this patch requires to function}
- {Use "None" if no dependencies}

**Content:**
```markdown
{Summary of what was added or changed — enough for a future agent to reconstruct the intent without reading the actual file. Use the real content for insertions, a diff-style description for replacements.}
```

**Verification:**
```bash
grep -c "{key_phrase}" {file_path_relative_to_project_root}
# Expected: >= 1
```
```

**Use Edit tool to insert the new/updated entry into PATCHES.md.** Do not rewrite the entire file.

---

## Step 8: Report Completion

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► UPDATE COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Modified:
  {✓ or ✗}  {file path 1}
  {✓ or ✗}  {file path 2}

Patches: {total} entries in PATCHES.md ({new} new, {updated} updated)

Verification:
  {✓ or ✗}  {key_phrase} in {file} — {result}
```

If any step failed, show the error box:

```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

{What failed and why}

**To fix:** {Resolution steps}
```

</process>

<success_criteria>
- [ ] Intent parsed from $ARGUMENTS or gathered via AskUserQuestion
- [ ] Target files identified and read before modification
- [ ] Complexity assessed (simple vs complex path taken)
- [ ] User confirmed changes before they were applied
- [ ] Edit tool used for all modifications (not Write)
- [ ] Every modification grep-verified after applying
- [ ] PATCHES.md updated with correct patch entry (new or updated)
- [ ] Completion report shown with pass/fail per file
- [ ] No files outside GSD scope were modified
</success_criteria>

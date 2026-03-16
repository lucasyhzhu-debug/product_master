---
description: Reapply local modifications after a GSD update
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

<purpose>
After a GSD update wipes and reinstalls files, this command merges user's previously saved local modifications back into the new version. Uses intelligent comparison to handle cases where the upstream file also changed.
</purpose>

<process>

## Step 1: Detect backed-up patches

Check for local patches directory:

```bash
# Global install — detect runtime config directory
if [ -d "$HOME/.config/opencode/gsd-local-patches" ]; then
  PATCHES_DIR="$HOME/.config/opencode/gsd-local-patches"
elif [ -d "$HOME/.opencode/gsd-local-patches" ]; then
  PATCHES_DIR="$HOME/.opencode/gsd-local-patches"
elif [ -d "$HOME/.gemini/gsd-local-patches" ]; then
  PATCHES_DIR="$HOME/.gemini/gsd-local-patches"
else
  PATCHES_DIR="./.claude/gsd-local-patches"
fi
# Local install fallback — check all runtime directories
if [ ! -d "$PATCHES_DIR" ]; then
  for dir in .config/opencode .opencode .gemini .claude; do
    if [ -d "./$dir/gsd-local-patches" ]; then
      PATCHES_DIR="./$dir/gsd-local-patches"
      break
    fi
  done
fi
```

Read `backup-meta.json` from the patches directory.

**If no patches found:**
```
No local patches found. Nothing to reapply.

Local patches are automatically saved when you run /gsd:update
after modifying any GSD workflow, command, or agent files.
```
Exit.

## Step 1.5: Load PATCHES.md (intent-aware merging)

Check for a `PATCHES.md` file in the patches directory:

```bash
PATCHES_DOC="$PATCHES_DIR/PATCHES.md"
if [ -f "$PATCHES_DOC" ]; then
  echo "PATCHES_DOC_FOUND=true"
else
  echo "PATCHES_DOC_FOUND=false"
fi
```

**If found:** Read `PATCHES.md` fully. This file documents each custom modification with:
- **Purpose** — why the patch exists
- **Insertion point** — where in the file the change goes (anchored to stable step/section names)
- **Exact content** — the full text to insert
- **Dependencies** — project-level files the patch requires
- **Verification commands** — how to confirm the patch is active

Parse each `## Patch N:` section into a structured list: `{patch_id, file, purpose, insertion_anchor, content, dependencies}`.

**If not found:** Fall back to file-level diffing only (original behavior). Display:
```
⚠ No PATCHES.md found — using file-level diff merge only.
  Tip: Create gsd-local-patches/PATCHES.md to document your modifications
  for intent-aware merging in future upgrades.
```

## Step 2: Show patch summary

```
## Local Patches to Reapply

**Backed up from:** v{from_version}
**Current version:** {read VERSION file}
**Files modified:** {count}

| # | File | Status |
|---|------|--------|
| 1 | {file_path} | Pending |
| 2 | {file_path} | Pending |
```

## Step 3: Merge each file

For each file in `backup-meta.json`:

1. **Read the backed-up version** (user's modified copy from `gsd-local-patches/`)
2. **Read the newly installed version** (current file after update)
3. **Compare and merge:**

   - If the new file is identical to the backed-up file: skip (modification was incorporated upstream)
   - If the new file differs: identify the user's modifications and apply them to the new version

   **Merge strategy (intent-aware — when PATCHES.md exists):**

   For each file being merged, check if any patch in PATCHES.md targets it. If so:
   - Read the patch's **insertion anchor** (e.g., "between `aggregate_results` and `close_parent_artifacts`")
   - Find that anchor in the **new** version of the file (not the backed-up version)
   - Insert the patch content at the anchor point in the new file
   - If the anchor text is missing from the new version (upstream restructured): flag as conflict, show the patch description and purpose so the user can decide where to place it
   - If the anchor exists but the patch content is already present (upstream adopted it): skip with note "Already upstream"

   This is more reliable than blind diffing because it uses semantic anchors instead of line-level matching.

   **Merge strategy (fallback — no PATCHES.md):**
   - Read both versions fully
   - Identify sections the user added or modified (look for additions, not just differences from path replacement)
   - Apply user's additions/modifications to the new version
   - If a section the user modified was also changed upstream: flag as conflict, show both versions, ask user which to keep

4. **Check patch dependencies:** For each applied patch, verify its dependencies exist (e.g., skill files, config keys). Warn if missing.
5. **Write merged result** to the installed location
6. **Report status:**
   - `Merged (intent-aware)` — patch applied using PATCHES.md anchor
   - `Merged (diff)` — modification applied via file-level diff (no PATCHES.md entry)
   - `Skipped` — modification already in upstream
   - `Conflict` — anchor not found or upstream restructured, user chose resolution

## Step 4: Update manifest

After reapplying, regenerate the file manifest so future updates correctly detect these as user modifications:

```bash
# The manifest will be regenerated on next /gsd:update
# For now, just note which files were modified
```

## Step 5: Cleanup option

Ask user:
- "Keep patch backups for reference?" → preserve `gsd-local-patches/`
- "Clean up patch backups?" → remove `gsd-local-patches/` directory

## Step 6: Report

```
## Patches Reapplied

| # | File | Strategy | Status |
|---|------|----------|--------|
| 1 | {file_path} | Intent-aware | ✓ Merged |
| 2 | {file_path} | Diff | ✓ Merged |
| 3 | {file_path} | — | ○ Skipped (already upstream) |
| 4 | {file_path} | Intent-aware | ⚠ Anchor missing, user resolved |

{count} file(s) updated. Your local modifications are active again.

### Dependency Check
| Patch | Dependency | Status |
|-------|-----------|--------|
| {patch_name} | {dependency_file} | ✓ Present |
```

## Step 7: Run verification commands

If PATCHES.md includes verification commands for applied patches, run them:

```bash
# Example from PATCHES.md verification section
grep -c "triple_review" .claude/get-shit-done/workflows/execute-phase.md
grep -c "Staff Review" .claude/get-shit-done/workflows/plan-phase.md
grep "triple_review" .planning/config.json
```

Report pass/fail for each verification check.

</process>

<success_criteria>
- [ ] PATCHES.md loaded if present (intent-aware mode)
- [ ] All backed-up patches processed
- [ ] Intent-aware merging used when PATCHES.md entry exists for a file
- [ ] Fallback to file-level diff for files without PATCHES.md entries
- [ ] Patch dependencies verified after merge
- [ ] User modifications merged into new version
- [ ] Conflicts resolved with user input
- [ ] Verification commands run and reported
- [ ] Status reported for each file
</success_criteria>

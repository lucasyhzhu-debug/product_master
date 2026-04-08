---
name: gsd:reapply-patches
description: Reapply local modifications after a GSD update
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

<purpose>
After a GSD update wipes and reinstalls files, this command merges user's previously saved local modifications back into the new version. Uses three-way comparison (pristine baseline, user-modified backup, newly installed version) to reliably distinguish user customizations from version drift.

**Critical invariant:** Every file in `gsd-local-patches/` was backed up because the installer's hash comparison detected it was modified. The workflow must NEVER conclude "no custom content" for any backed-up file — that is a logical contradiction. When in doubt, classify as CONFLICT requiring user review, not SKIP.
</purpose>

<process>

## Step 1: Detect backed-up patches

Check for local patches directory:

```bash
expand_home() {
  case "$1" in
    "~/"*) printf '%s/%s\n' "$HOME" "${1#~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

PATCHES_DIR=""

# Env overrides first — covers custom config directories used with --config-dir
if [ -n "$KILO_CONFIG_DIR" ]; then
  candidate="$(expand_home "$KILO_CONFIG_DIR")/gsd-local-patches"
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
  fi
elif [ -n "$KILO_CONFIG" ]; then
  candidate="$(dirname "$(expand_home "$KILO_CONFIG")")/gsd-local-patches"
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
  fi
elif [ -n "$XDG_CONFIG_HOME" ]; then
  candidate="$(expand_home "$XDG_CONFIG_HOME")/kilo/gsd-local-patches"
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
  fi
fi

if [ -z "$PATCHES_DIR" ] && [ -n "$OPENCODE_CONFIG_DIR" ]; then
  candidate="$(expand_home "$OPENCODE_CONFIG_DIR")/gsd-local-patches"
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
  fi
elif [ -z "$PATCHES_DIR" ] && [ -n "$OPENCODE_CONFIG" ]; then
  candidate="$(dirname "$(expand_home "$OPENCODE_CONFIG")")/gsd-local-patches"
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
  fi
elif [ -z "$PATCHES_DIR" ] && [ -n "$XDG_CONFIG_HOME" ]; then
  candidate="$(expand_home "$XDG_CONFIG_HOME")/opencode/gsd-local-patches"
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
  fi
fi

if [ -z "$PATCHES_DIR" ] && [ -n "$GEMINI_CONFIG_DIR" ]; then
  candidate="$(expand_home "$GEMINI_CONFIG_DIR")/gsd-local-patches"
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
  fi
fi

if [ -z "$PATCHES_DIR" ] && [ -n "$CODEX_HOME" ]; then
  candidate="$(expand_home "$CODEX_HOME")/gsd-local-patches"
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
  fi
fi

if [ -z "$PATCHES_DIR" ] && [ -n "$CLAUDE_CONFIG_DIR" ]; then
  candidate="$(expand_home "$CLAUDE_CONFIG_DIR")/gsd-local-patches"
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
  fi
fi

# Global install — detect runtime config directory defaults
if [ -z "$PATCHES_DIR" ]; then
  if [ -d "$HOME/.config/kilo/gsd-local-patches" ]; then
    PATCHES_DIR="$HOME/.config/kilo/gsd-local-patches"
  elif [ -d "$HOME/.config/opencode/gsd-local-patches" ]; then
    PATCHES_DIR="$HOME/.config/opencode/gsd-local-patches"
  elif [ -d "$HOME/.opencode/gsd-local-patches" ]; then
    PATCHES_DIR="$HOME/.opencode/gsd-local-patches"
  elif [ -d "$HOME/.gemini/gsd-local-patches" ]; then
    PATCHES_DIR="$HOME/.gemini/gsd-local-patches"
  elif [ -d "$HOME/.codex/gsd-local-patches" ]; then
    PATCHES_DIR="$HOME/.codex/gsd-local-patches"
  else
    PATCHES_DIR="D:/Claude/Product Manager/product_master/.claude/gsd-local-patches"
  fi
fi
# Local install fallback — check all runtime directories
if [ ! -d "$PATCHES_DIR" ]; then
  for dir in .config/kilo .kilo .config/opencode .opencode .gemini .codex .claude; do
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

Local patches are automatically saved when you run /gsd-update
after modifying any GSD workflow, command, or agent files.
```
Exit.

## Step 1.5: Load PATCHES.md (intent-aware merge metadata)

Check for a `PATCHES.md` file in the patches directory:

```bash
PATCHES_MD="$PATCHES_DIR/PATCHES.md"
if [ -f "$PATCHES_MD" ]; then
  HAS_PATCHES_MD=true
fi
```

If `PATCHES.md` exists, parse it into structured patch data. Each patch section follows this format:

```markdown
## Patch N: {purpose}
- **File:** {relative_path}
- **Insertion anchor:** {text or regex to locate insertion point}
- **Position:** {before|after|replace} anchor
- **Dependencies:** {comma-separated patch IDs, or "none"}
- **Verify:** {bash command to confirm patch applied correctly}

```
{patch content}
```
```

Parse each `## Patch N:` section into structured data:
- `patch_id` — the patch number
- `file` — target file path (relative to config directory)
- `purpose` — human-readable description from the heading
- `insertion_anchor` — text/regex to locate where content goes
- `position` — whether to insert before, after, or replace the anchor
- `content` — the fenced code block contents
- `dependencies` — list of patch IDs that must be applied first
- `verify_command` — bash command to verify successful application

Store as an ordered list for dependency-aware application in Step 4.

## Step 2: Determine baseline for three-way comparison

The quality of the merge depends on having a **pristine baseline** — the original unmodified version of each file from the pre-update GSD release. This enables three-way comparison:
- **Pristine baseline** (original GSD file before any user edits)
- **User's version** (backed up in `gsd-local-patches/`)
- **New version** (freshly installed after update)

Check for baseline sources in priority order:

### Option A: Git history (most reliable)
If the config directory is a git repository:
```bash
CONFIG_DIR=$(dirname "$PATCHES_DIR")
if git -C "$CONFIG_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  HAS_GIT=true
fi
```
When `HAS_GIT=true`, use `git log` to find the commit where GSD was originally installed (before user edits). For each file, the pristine baseline can be extracted with:
```bash
git -C "$CONFIG_DIR" log --diff-filter=A --format="%H" -- "{file_path}"
```
This gives the commit that first added the file (the install commit). Extract the pristine version:
```bash
git -C "$CONFIG_DIR" show {install_commit}:{file_path}
```

### Option B: Pristine snapshot directory
Check if a `gsd-pristine/` directory exists alongside `gsd-local-patches/`:
```bash
PRISTINE_DIR="$CONFIG_DIR/gsd-pristine"
```
If it exists, the installer saved pristine copies at install time. Use these as the baseline.

### Option C: No baseline available (two-way fallback)
If neither git history nor pristine snapshots are available, fall back to two-way comparison — but with **strengthened heuristics** (see Step 3).

## Step 3: Show patch summary

```
## Local Patches to Reapply

**Backed up from:** v{from_version}
**Current version:** {read VERSION file}
**Files modified:** {count}
**Merge strategy:** {three-way (git) | three-way (pristine) | two-way (enhanced)}

| # | File | Status |
|---|------|--------|
| 1 | {file_path} | Pending |
| 2 | {file_path} | Pending |
```

## Step 4: Merge each file

For each file in `backup-meta.json`:

1. **Read the backed-up version** (user's modified copy from `gsd-local-patches/`)
2. **Read the newly installed version** (current file after update)
3. **If available, read the pristine baseline** (from git history or `gsd-pristine/`)

### Three-way merge (when baseline is available)

Compare the three versions to isolate changes:
- **User changes** = diff(pristine → user's version) — these are the customizations to preserve
- **Upstream changes** = diff(pristine → new version) — these are version updates to accept

**Merge rules:**
- Sections changed only by user → apply user's version
- Sections changed only by upstream → accept upstream version
- Sections changed by both → flag as CONFLICT, show both, ask user
- Sections unchanged by either → use new version (identical to all three)


### Intent-aware merge (when PATCHES.md is available)

For files that have corresponding entries in `PATCHES.md`, use **anchor-based insertion** instead of blind line-by-line diffing:

1. **Locate the anchor** in the newly installed file using the `insertion_anchor` field
2. **Verify anchor exists** — if the anchor text is not found (upstream restructured the file), fall back to three-way or two-way merge and flag as CONFLICT
3. **Apply the patch content** at the specified `position` (before/after/replace) relative to the anchor
4. **Mark as intent-applied** — these patches are higher confidence than diff-based merges because the user explicitly documented what goes where

**Priority:** When both PATCHES.md entries and diff-based customizations exist for the same file, apply PATCHES.md entries first (they are authoritative), then layer any remaining diff-based customizations that don't overlap.

### Two-way merge (fallback when no baseline)

When no pristine baseline is available, use these **strengthened heuristics**:

**CRITICAL RULE: Every file in this backup directory was explicitly detected as modified by the installer's SHA-256 hash comparison. "No custom content" is never a valid conclusion.**

For each file:
a. Read both versions completely
b. Identify ALL differences, then classify each as:
   - **Mechanical drift** — path substitutions (e.g. `/Users/xxx/.claude/` → `D:/Claude/Product Manager/product_master/.claude/`), variable additions (`${GSD_WS}`, `${AGENT_SKILLS_*}`), error handling additions (`|| true`)
   - **User customization** — added steps/sections, removed sections, reordered content, changed behavior, added frontmatter fields, modified instructions

c. **If ANY differences remain after filtering out mechanical drift → those are user customizations. Merge them.**
d. **If ALL differences appear to be mechanical drift → still flag as CONFLICT.** The installer's hash check already proved this file was modified. Ask the user: "This file appears to only have path/variable differences. Were there intentional customizations?" Do NOT silently skip.

### Git-enhanced two-way merge

When the config directory is a git repo but the pristine install commit can't be found, use commit history to identify user changes:
```bash
# Find non-update commits that touched this file
git -C "$CONFIG_DIR" log --oneline --no-merges -- "{file_path}" | grep -v "gsd:update\|GSD update\|gsd-install"
```
Each matching commit represents an intentional user modification. Use the commit messages and diffs to understand what was changed and why.

4. **Write merged result** to the installed location

### Post-merge verification

After writing each merged file, verify that user modifications survived the merge:

1. **Line-count check:** Count lines in the backup and the merged result. If the merged result has fewer lines than the backup minus the expected upstream removals, flag for review.
2. **Hunk presence check:** For each user-added section identified during diff analysis, search the merged output for at least the first significant line (non-blank, non-comment) of each addition. Missing signature lines indicate a dropped hunk.
3. **Report warnings inline** (do not block):
   ```
   ⚠ Potential dropped content in {file_path}:
     - Missing hunk near line {N}: "{first_line_preview}..." ({line_count} lines)
     - Backup available: {patches_dir}/{file_path}
   ```
4. **Track verification status** — add to per-file report: `Merged (verified)` vs `Merged (⚠ {N} hunks may be missing)`

### Dependency checking

After all files are merged, verify patch dependencies are satisfied:

1. **Build dependency graph** from PATCHES.md `dependencies` fields
2. **Topological sort** — confirm patches were applied in dependency order
3. **Cross-patch validation** — for each patch with dependencies, verify the dependent content exists in the merged output (not just that the patch was applied, but that the content it depends on is present)
4. **Report dependency issues:**
   ```
   Dependency check: {passed_count}/{total_count} patches have satisfied dependencies
   {If any failed:}
   WARNING: Patch {N} depends on Patch {M}, but Patch {M} content not found in {file}
   ```

5. **Report status per file:**
   - `Merged` — user modifications applied cleanly (show summary of what was preserved)
   - `Conflict` — user reviewed and chose resolution
   - `Incorporated` — user's modification was already adopted upstream (only valid when pristine baseline confirms this)

**Never report `Skipped — no custom content`.** If a file is in the backup, it has custom content.

## Step 5: Cleanup option

Ask user:
- "Keep patch backups for reference?" → preserve `gsd-local-patches/`
- "Clean up patch backups?" → remove `gsd-local-patches/` directory

## Step 5.5: Run verification commands

If PATCHES.md was loaded in Step 1.5, run each patch's `verify_command`:

```
## Patch Verification

| Patch | File | Verify Command | Result |
|-------|------|---------------|--------|
| 1 | {file} | {command} | PASS/FAIL |
| 2 | {file} | {command} | PASS/FAIL |
```

For each verification command:
1. Run the bash command from the `verify` field
2. Exit code 0 = PASS, non-zero = FAIL
3. On FAIL, show the command output and flag the patch for manual review
4. Continue running all verification commands even if some fail

If no PATCHES.md was loaded, skip this step.

## Step 6: Report

```
## Patches Reapplied

| # | File | Result | User Changes Preserved |
|---|------|--------|----------------------|
| 1 | {file_path} | Merged | Added step X, modified section Y |
| 2 | {file_path} | Incorporated | Already in upstream v{version} |
| 3 | {file_path} | Conflict resolved | User chose: keep custom section |

{count} file(s) updated. Your local modifications are active again.
```

</process>

<success_criteria>
- [ ] All backed-up patches processed — zero files left unhandled
- [ ] No file classified as "no custom content" or "SKIP" — every backed-up file is definitionally modified
- [ ] Three-way merge used when pristine baseline available (git history or gsd-pristine/)
- [ ] User modifications identified and merged into new version
- [ ] Conflicts surfaced to user with both versions shown
- [ ] Status reported for each file with summary of what was preserved
- [ ] Post-merge verification checks each file for dropped hunks and warns if content appears missing
- [ ] PATCHES.md loaded and parsed when present in patches directory
- [ ] Intent-aware (anchor-based) merge used for files with PATCHES.md entries
- [ ] Patch dependencies verified after all merges complete
- [ ] Verification commands from PATCHES.md executed and results reported
</success_criteria>

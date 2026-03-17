---
name: update-docs
description: Propose and apply section-level edits to stale tutorial sections, or acknowledge them as reviewed
---

# Skill: /gsd:update-docs

## Purpose

Update stale tutorial sections by reading the affected section file + git diff of mapped source files, proposing targeted edits, and auto-committing after approval. Supports an `--ack` flag to acknowledge sections as reviewed without making content changes (useful after pure refactors).

## Usage

```
/gsd:update-docs                               # Interactive: show stale sections, pick which to update
/gsd:update-docs --section expenses#overview    # Update a specific section directly
/gsd:update-docs --ack expenses#overview        # Acknowledge as reviewed without changes
/gsd:update-docs --ack-all                      # Acknowledge ALL stale sections (e.g., after pure refactor)
```

## When to Use

- After `/gsd:check-docs` reports stale sections
- After completing a feature phase that changes documented behavior
- Use `--ack` after refactor-only phases (no behavior change = no content edits needed)
- Use `--ack-all` after major refactors affecting many source files without behavior changes

## Workflow

### Step 1: Detect stale sections

Run the same staleness detection as `/gsd:check-docs`:

```bash
cat .planning/docs-manifest.json
```

For each mapping, check staleness:

```bash
git log --oneline {lastReviewedCommit}..HEAD -- {sourceGlob1} {sourceGlob2} ...
```

Filter to only stale sections (those with non-empty git log output).

If `--section` or `--ack` specifies a particular section (e.g., `expenses#overview`), filter to that single mapping by matching `{guide}#{section}` against `mapping.guide` and `mapping.section`.

### Step 2: Select section (if no --section flag)

If no specific section was provided via `--section` or `--ack`, present a numbered list of stale sections:

```
Stale sections found:
1. expenses#overview (3 commits)
2. expenses#approving (1 commit)

Which section to update? (number, or 'all' for batch):
```

Wait for user input before proceeding.

If no stale sections are found, report `"All sections up to date!"` and exit.

### Step 3a: If --ack or --ack-all flag

Skip content editing. Just bump `lastReviewedCommit` to current HEAD:

```bash
git rev-parse HEAD
```

Update the mapping entry's `lastReviewedCommit` in `.planning/docs-manifest.json` to the HEAD hash.

For `--ack-all`, update ALL stale mapping entries at once.

Commit with properly shell-quoted message (the `#` in `guide#section` must be quoted to prevent shell interpretation):

```bash
node "./.claude/get-shit-done/bin/gsd-tools.cjs" commit 'docs(help): ack expenses#overview as reviewed (no content changes)' --files .planning/docs-manifest.json
```

For `--ack-all` with multiple sections:

```bash
node "./.claude/get-shit-done/bin/gsd-tools.cjs" commit 'docs(help): ack all stale sections as reviewed (no content changes)' --files .planning/docs-manifest.json
```

**Use case:** After a pure refactor phase that changed source code structure but not user-facing behavior.

### Step 3b: If updating content

Read the affected section file (typically ~50-80 lines):

```bash
cat {docFile}
```

Read the git diff of source files since last review:

```bash
git diff {lastReviewedCommit}..HEAD -- {sourceGlob1} {sourceGlob2} ...
```

If the diff is very large (>500 lines), switch to a summary approach:

```bash
git log --stat {lastReviewedCommit}..HEAD -- {sourceGlob1} {sourceGlob2} ...
```

Then read only the most relevant changed files individually to understand the nature of the changes.

**Analyze what changed** and propose specific edits to the tutorial section:
- New fields/features added -> add new StepCard or CalloutBox
- Removed features -> remove or update references
- Changed behavior -> update descriptions
- Renamed concepts -> find-and-replace in section text

Present proposed changes to the user for review. Apply edits only after approval.

### Step 4: Update manifest + commit

After the section file is updated (or acknowledged):

```bash
git rev-parse HEAD
```

Update `lastReviewedCommit` for the affected mapping entry in `.planning/docs-manifest.json` to the new HEAD hash.

Commit both the section file change and the manifest update together. Always use single quotes around the commit message to prevent shell interpretation of the `#` character:

```bash
node "./.claude/get-shit-done/bin/gsd-tools.cjs" commit 'docs(help): update expenses#overview for new status field' --files {docFile} .planning/docs-manifest.json
```

### Step 5: Repeat or finish

If more stale sections remain, offer to continue:

```
Updated expenses#overview. 1 stale section remaining.
Continue with expenses#approving? (y/n)
```

If the user declines or all sections are done, print a summary of actions taken:

```
=== Update Summary ===
- expenses#overview: UPDATED (3 commits addressed)
- expenses#approving: ACKNOWLEDGED (1 commit, no content changes)
- expenses#payroll: SKIPPED (user declined)

Manifest updated. 2 sections now up to date.
```

## Edge Cases

- **Deleted source files**: If a source glob no longer matches any files, warn: `"WARNING: Source files for '{glob}' may have been renamed or deleted -- manual review needed."` Suggest running `npm run validate:docs-manifest` first.
- **Renamed/missing sections**: If the manifest references a `docFile` that does not exist on disk, warn: `"WARNING: Doc file {docFile} does not exist. Run npm run validate:docs-manifest to check manifest integrity."` Do not attempt to update a missing file.
- **Large diffs (>500 lines)**: Switch from `git diff` to `git log --stat` summary + targeted file reads. This avoids flooding context with irrelevant changes.
- **No stale sections**: Report `"All sections up to date!"` and exit without making any changes.
- **Multiple guides**: If `--ack-all` is used and stale sections span multiple guides, update all of them in a single manifest write and commit.

## Notes

- Each section file is ~50-80 lines -- small enough for precise, targeted edits without full-guide context
- The git diff provides exact context of what changed -- no guessing needed
- Commit message format: `docs(help): update {guide}#{section} for {brief reason}` -- always use single quotes around the message to prevent shell interpretation of `#`
- Ack commit format: `docs(help): ack {guide}#{section} as reviewed (no content changes)` -- same quoting rule
- Manifest location: `.planning/docs-manifest.json`
- To validate manifest integrity: `npm run validate:docs-manifest`
- To detect stale sections without making changes, use `/gsd:check-docs`
- Uses existing `gsd-tools.cjs` for git commit operations (consistent with project conventions)

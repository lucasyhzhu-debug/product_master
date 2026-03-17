---
name: check-docs
description: Detect stale tutorial sections by comparing git history against the docs manifest
---

# Skill: /gsd:check-docs

## Purpose

Detect which tutorial sections have become stale because the source code they document has changed since last review. Operates at section granularity (~60 lines per section file) to keep context cost low.

This is a READ-ONLY skill -- it does not modify any files.

## Usage

```
/gsd:check-docs                    # Check all mapped sections
/gsd:check-docs --guide expenses   # Check only one guide
```

## When to Use

- After completing a phase that touched feature code documented in tutorials
- Before starting a new milestone (check all guides)
- When a user reports that a tutorial seems outdated
- Periodically as part of documentation maintenance

## Workflow

### Step 1: Load manifest

```bash
cat .planning/docs-manifest.json
```

Parse the JSON. Extract all mapping entries from the `mappings` array.

If `--guide` flag is provided, filter mappings to only those where `mapping.guide` matches the provided guide name (e.g., `expenses`).

### Step 2: Check staleness per mapping

For each mapping entry, run:

```bash
git log --oneline {lastReviewedCommit}..HEAD -- {sourceGlob1} {sourceGlob2} ...
```

**Interpreting results:**
- If output is **non-empty**: the section is **STALE**. Count the commit lines and capture their one-line summaries.
- If output is **empty**: the section is **UP TO DATE** (no source changes since last review).

**Edge cases to handle:**

1. **Invalid commit hash** (e.g., repo was rebased or commit no longer exists):
   ```bash
   git cat-file -t {lastReviewedCommit} 2>/dev/null
   ```
   If this fails, warn: `"WARNING: lastReviewedCommit {hash} is not a valid commit. Treating as stale."` and treat the section as stale. Use `git log --oneline -20 -- {sourceGlobs}` to show recent history instead.

2. **Source glob matches no files:**
   ```bash
   git ls-files {sourceGlob}
   ```
   If empty, warn: `"WARNING: No source files found for glob '{glob}'. Mapping may need updating."`

3. **Missing docFile:**
   Check if the section file exists:
   ```bash
   test -f {docFile} && echo "exists" || echo "MISSING"
   ```
   If missing, warn: `"WARNING: Doc file {docFile} does not exist. Run npm run validate:docs-manifest."`

### Step 3: Generate report

Format output as follows:

```
=== Documentation Staleness Report ===

Guide: Expenses & Reimbursement

[STALE] overview (3 commits since last review)
  - abc1234 feat: add new expense status field
  - def5678 fix: receipt validation edge case
  - ghi9012 refactor: extract expense helpers
  Source: convex/expenses/*.ts
  Doc: src/pages/guides/ExpenseGuide/OverviewSection.tsx

[OK] submitting (0 commits since last review)

[STALE] approving (1 commit since last review)
  - jkl3456 feat: add DoA threshold for contractors
  Source: convex/expenses/mutations.ts, convex/expenses/fraudHelpers.ts
  Doc: src/pages/guides/ExpenseGuide/ApprovingSection.tsx

---
Summary: 2 stale, 6 up-to-date (out of 8 sections)
```

**Impact assessment** (optional, at Claude's discretion):

For stale sections with many commits or large diffs, add an impact indicator:
- **HIGH** (5+ commits or behavioral changes like new features/removed features)
- **MEDIUM** (2-4 commits, mostly refactors or fixes)
- **LOW** (1 commit, minor change)

This can help prioritize which sections to update first.

## Notes

- Manifest location: `.planning/docs-manifest.json`
- To validate manifest integrity: `npm run validate:docs-manifest`
- To fix stale sections, use `/gsd:update-docs`
- The manifest `guides` object lists available guide names and their section keys for reference

---
name: shipit
description: Use when work on a feature branch is complete and ready to merge. Handles documentation, build verification, merge to main, push to remote, and branch cleanup in one command.
---

# Ship It

Complete the feature branch lifecycle: document, verify, merge, push, clean up.

## Prerequisites

- On a feature branch (NOT main)
- All code changes committed
- Build passing

## Workflow

### Step 1: Verify Ready to Ship

```bash
# Must NOT be on main
git branch --show-current  # FAIL if "main"

# Must have no uncommitted changes
git status --porcelain      # FAIL if output non-empty

# Must have commits ahead of main
git log main..HEAD --oneline  # FAIL if empty
```

**If any check fails, stop and tell the user what needs fixing.**

### Step 2: Build Verification

```bash
npm run build
```

**FAIL = STOP. Do not proceed. Fix build errors first.**

### Step 3: Document Changes

Run the `/document` skill logic:
1. Gather change context (`git diff --name-only main...HEAD`)
2. Update `docs/CHANGELOG.md` (always required)
3. Update `docs/SCHEMA.md` if `convex/schema.ts` changed
4. Update `docs/API_REFERENCE.md` if backend queries/mutations changed
5. Commit documentation: `docs: update changelog for {branch-name}`

### Step 4: Merge to Main

```bash
BRANCH=$(git branch --show-current)
git switch main
git pull origin main
git merge "$BRANCH" --no-ff -m "Merge $BRANCH: {one-line summary}"
```

**If merge conflict: STOP. Report conflicts and let user resolve.**

### Step 5: Push to Remote

```bash
git push origin main
```

### Step 6: Clean Up

```bash
# Delete local feature branch
git branch -d "$BRANCH"

# Delete remote feature branch (if it exists)
git push origin --delete "$BRANCH" 2>/dev/null || true
```

### Step 7: Report

Print summary:

```
Shipped {branch-name} to main

  Commits merged: {count}
  Docs updated:   {list}
  Remote:         pushed to origin/main
  Cleanup:        branch deleted (local + remote)
```

## Error Handling

| Error | Action |
|-------|--------|
| On main already | STOP - "Switch to a feature branch first" |
| Uncommitted changes | STOP - "Commit or stash changes first" |
| Build fails | STOP - "Fix build errors before shipping" |
| Merge conflict | STOP - Report conflicting files, let user resolve |
| Push rejected | STOP - "Remote has new commits. Pull and retry." |

## What This Skill Does NOT Do

- Does NOT create PRs (direct merge workflow per project convention)
- Does NOT run tests (build check only - add `npm run test` to Step 2 if test suite is stable)
- Does NOT deploy (CI/CD handles deployment on push to main)

# GSD Redux Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the user's GSD installation from `get-shit-done-cc@1.41.0` (archived upstream) to `@opengsd/get-shit-done-redux@1.1.0` (active maintained fork) while preserving 15 customisations AND verifying that the `updateGSD` meta-skill remains functional against the new fork.

**Architecture:** Two-phase migration. Phase A installs gsd-redux@1.0.0 and re-applies 11 customisation patches (4 Cohort 3 custom commands verified untouched). Phase B uses the 1.0.0→1.1.0 upgrade event as the real-world audit of updateGSD's resilience to GSD version bumps. Each phase has explicit acceptance gates and atomic commits, with three rollback paths (Backup 1 = pre-migration, Backup 2 = Phase A patched, Backup 3 = final).

**Tech Stack:** Windows PowerShell, Git Bash, robocopy `/MIR`, `fc /B`, Node.js ≥22, npx, Claude Code, `Edit` tool for surgical file modifications.

---

## Pre-Migration Reading

| Document | Purpose |
|---|---|
| `docs/superpowers/specs/2026-05-25-gsd-redux-migration-design.md` | Design spec (Critical context — read fully before starting) |
| `docs/reviews/staffreview-gsd-redux-migration-design-2026-05-25.md` | Staffreview findings folded into spec v2 |
| `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md` | Authoritative patch manifest for customisations #1–#11 |
| `C:\Users\Irfan\.claude\gsd-local-patches\PATCHES.md` | Graphify patches #12–#14 |
| `D:\Claude\Product Manager\product_master\.claude\commands\updateGSD.md` | The meta-skill being audited |

**Operator prerequisites:** Familiarity with PowerShell, robocopy `/MIR` semantics, and the spec's customisation manifest. Claude Code already installed. Node ≥22 already available.

---

## File Map

This migration **modifies** existing files rather than creating new code. Per-file impact:

| File | Action | Owner |
|---|---|---|
| `C:\Users\Irfan\.claude\get-shit-done\` (260 files) | Overwritten by new install (Phase A Task 4) + selectively re-patched (Tasks 7–14) | gsd-redux installer + manual patches |
| `C:\Users\Irfan\.claude\agents\gsd-*.md` | Overwritten + re-patched (`gsd-phase-researcher.md`, Task 14) | gsd-redux installer + manual patches |
| `C:\Users\Irfan\.claude\skills\gsd-*\SKILL.md` (67 dirs) | Overwritten by installer | gsd-redux installer |
| `C:\Users\Irfan\.claude\hooks\gsd-*` | Untouched by installer (verified pre-flight) | User-owned, sourced from Backup 1 if missing |
| `C:\Users\Irfan\.claude\settings.json` | Untouched (only verified, not edited) | User-owned |
| `C:\Users\Irfan\.claude\gsd-local-patches\PATCHES.md` | Untouched by installer | User-owned |
| `C:\Users\Irfan\.claude\gsd-local-patches\backup-meta.json` | Refreshed in Task 6 with new baseline metadata | User-owned |
| `C:\Users\Irfan\.claude\gsd-pristine\` | Refreshed in Task 6 with new install copies | User-owned |
| `D:\Claude\Product Manager\product_master\.claude\get-shit-done\` | Mirrored from user-level in Task 15 | Mirror of user-level |
| `D:\Claude\Product Manager\product_master\.claude\agents\` | Mirrored in Task 15 | Mirror of user-level |
| `D:\Claude\Product Manager\product_master\.claude\hooks\` | Mirrored in Task 15 | Mirror of user-level |
| `D:\Claude\Product Manager\product_master\.claude\commands\{updateGSD,triple-review,staffreview}.md` | Verified untouched in Task 18 | Custom commands, project-scoped |
| `D:\Claude\Product Manager\product_master\.claude\commands\updateGSD.md` | Potentially edited in Phase B Task 27 (self-fix) | User-owned |
| `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md` | Modified in Task 1.5 (adds Patch 6 RETIRES.md + Patch 7 Opus override) and in Task 31 (adds Patch 8 updateGSD self-fix, if Task 31 runs) | User-owned |
| `D:\Claude\Product Manager\product_master\docs\CHANGELOG.md` | One-line entry added in Task 32 | Project doc |
| `C:\Users\Irfan\.claude\backups\KEEP-pre-redux-<ts>\` | Created in Task 3 | Backup 1 |
| `C:\Users\Irfan\.claude\backups\KEEP-phase-a-patched-<ts>\` | Created in Phase B Task 22 | Backup 2 |
| `C:\Users\Irfan\.claude\backups\KEEP-redux-110-final-<ts>\` | Created in Task 31 | Backup 3 |

---

## Customisation-to-Patch Cross-Reference

The Customisation Manifest (in spec section "Customisation Manifest") uses numbers #1–#15 to identify user intent. The PATCHES.md files use independent "Patch N" numbering. They are N:1 — one PATCHES.md Patch often covers multiple Customisations. Use this table whenever a task says "apply Patch X for Customisation #Y":

| Customisation # | Tracked in | As | Notes |
|---|---|---|---|
| #1 (plan-phase staffreview gate) | Project PATCHES.md | **Patch 4** | Anchored at `## 12.6` per PATCHES.md (NOT `## 12.5`; see Refinement at Task 8) |
| #2 (execute triple_review_gate) | Project PATCHES.md | **Patch 1** (sub-component) | Folded into `quad_review` step |
| #3 (execute document_and_merge_gate) | Project PATCHES.md | **Patch 1** (sub-component) | |
| #4 (spec-phase Step 6.5 RETIRES.md) | Project PATCHES.md | **Patch 6** (added by Task 1.5) | NOT tracked pre-migration — Task 1.5 adds the entry |
| #5 (gsd-debugger Opus model preference) | Project PATCHES.md | **Patch 7** (added by Task 1.5) | NOT tracked pre-migration — Task 1.5 adds the entry |
| #6 (execute quad_review) | Project PATCHES.md | **Patch 1** (replaces upstream `code_review_gate`) | |
| #7 (tiered findings routing rule) | Project PATCHES.md | Embedded across Patches 1–4 | Cross-cutting rule, not a standalone patch |
| #8 (triple-review.md `--external-review` arg) | Project PATCHES.md | **Patch 1** (secondary file) | |
| #9 (quick.md quad-review + simplify + doc-merge) | Project PATCHES.md | **Patch 2** | |
| #10 (debug.md Quality Gates + Doc-merge) | Project PATCHES.md | **Patch 3** | |
| #11 (updateGSD parameter-consistency) | Project PATCHES.md | **Patch 5** | |
| #12 (gsd-phase-researcher blast_radius) | User PATCHES.md | **Patch 3** | |
| #13 (spec-phase Step 2.5 graph blast-radius scout) | User PATCHES.md | **Patch 1** | |
| #14 (discuss-phase scout_graph_blast_radius + CONTEXT.md template) | User PATCHES.md | **Patch 2** | |
| #15 (custom `staffreview.md` command) | NOT a patch (Cohort 3) | — | Verified-untouched in Task 16 |

**Reserved future numbering:** Patch 8 in project PATCHES.md is reserved for the updateGSD self-fix that Task 31 writes if it runs.

---

# Phase A — Install gsd-redux@1.0.0 + Re-apply 11 Patches

## Task 1: Pre-flight checks

**Files:**
- Read: `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md`
- Read: `C:\Users\Irfan\.claude\gsd-local-patches\PATCHES.md`

- [ ] **Step 1: Verify Node version**

Run in PowerShell:
```powershell
node --version
```
Expected: `v22.x.x` or higher (currently `v24.13.0`). If lower, install Node 22+ before proceeding.

- [ ] **Step 2: Verify disk space**

Run:
```powershell
Get-PSDrive C,D | Select-Object Name,Used,Free | Format-Table
```
Expected: ≥ 2 GB free on both C: and D:.

- [ ] **Step 3: Verify npm cache health**

Run:
```powershell
npm cache verify
```
Expected: No errors reported. If errors appear, run `npm cache clean --force` and re-verify.

- [ ] **Step 4: Close all Claude Code sessions**

Manually close all running Claude Code IDE integrations and CLI sessions. Robocopy will hit file locks if any session has `.claude/` files open.

Verify with:
```powershell
Get-Process | Where-Object { $_.Name -like "*claude*" -or $_.Name -like "*Code*" } | Select-Object Id,Name
```
If any Claude Code processes appear, close them before continuing.

- [ ] **Step 5: Stop dev servers**

In any terminal running `npx convex dev`, file watchers, or other long-running processes, press Ctrl+C to stop.

- [ ] **Step 6: Verify PATCHES.md inventories**

Run:
```bash
cat "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md" | grep -c "^## Patch"
cat "C:/Users/Irfan/.claude/gsd-local-patches/PATCHES.md" | grep -c "^## Patch"
```
Expected (BEFORE Task 1.5 runs):
- Project PATCHES.md: 5 (Patches 1–5 covering customisations #1–#3, #6–#11)
- User PATCHES.md: 3 (Patches 1–3 covering customisations #12–#14)

After Task 1.5 completes, project PATCHES.md will have **7 patches** (5 original + Patch 6 RETIRES.md + Patch 7 Opus override). After Task 31 if it runs, project PATCHES.md will have **8 patches** (adding Patch 8 updateGSD self-fix).

If counts are lower than 5/3 right now, STOP. Document the missing patches before proceeding.

- [ ] **Step 7: PATCHES.md content-integrity check (pre-migration baseline must be intact)**

Each PATCHES.md Patch entry has a `**Verification:**` block with grep commands. Run them now against the CURRENT install. Any returning 0-but-expected-≥1 means pre-existing drift — Phase A's green-gate would be comparing against a wrong "expected" state.

```bash
# Project patches (Patches 1–5):
# Patch 1 (execute-phase quad_review):
grep -c '<step name="quad_review">' C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # >= 1
grep -c '<step name="code_review_gate"' C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # == 0
grep -c '<step name="simplify">' C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # >= 1
grep -c '<step name="document_and_merge">' C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # >= 1
grep -c "Route the COMPLETE tiered list" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # >= 1
grep -c "external-review" "D:/Claude/Product Manager/product_master/.claude/commands/triple-review.md"  # >= 3
grep -c "EXTERNAL_REVIEW" "D:/Claude/Product Manager/product_master/.claude/commands/triple-review.md"  # >= 3
grep -c "Quad Review" "D:/Claude/Product Manager/product_master/.claude/commands/triple-review.md"  # >= 1

# Patch 2 (quick.md):
grep -c "Step 6.3: Quad review" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md  # >= 1
grep -c "external-review=\${REVIEW_FILE}" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md  # >= 1
grep -c "Step 6.4: Simplify" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md  # >= 1
grep -c "Step 9: Document and merge" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md  # >= 1
grep -c "Route the COMPLETE tiered list" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md  # >= 1

# Patch 3 (debug.md):
grep -c "## 5. Quality Gates" C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md  # >= 1
grep -c "## 6. Document and Merge" C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md  # >= 1

# Patch 4 (plan-phase staffreview gate):
grep -c "Staff[Rr]eview Gate" C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md  # >= 1
grep -c "Route the COMPLETE tiered list" C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md  # >= 1

# Patch 5 (updateGSD):
grep -c "Parameter consistency" "D:/Claude/Product Manager/product_master/.claude/commands/updateGSD.md"  # >= 2
grep -ic "help file" "D:/Claude/Product Manager/product_master/.claude/commands/updateGSD.md"  # >= 1

# User patches (Patches 1–3):
grep -c "Step 2.5: Graph Blast Radius Scout" C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md  # == 1
grep -c "graph-surfaced anchor symbol" C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md  # >= 2
grep -c "scout_graph_blast_radius" C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md  # >= 2
grep -c "### Blast Radius" C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md  # >= 2
grep -c "blast_radius_awareness" C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md  # == 2
grep -c "fan_in >= 10" C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md  # == 1
```

Inspect output. Any 0-where-≥1-was-expected: stop and reconcile PATCHES.md vs install state BEFORE the installer runs, otherwise Phase A green-gate will pass mechanically against a half-broken baseline.

---

## Task 1.5: Document Customisations #4 and #5 + extract content for re-apply (NEW)

**Files:**
- Read: `C:\Users\Irfan\.claude\get-shit-done\workflows\spec-phase.md` (current install)
- Read: `C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.cjs` (current install)
- Create: `C:\Users\Irfan\.claude\backups\cust-4-retires-content.md` (captured baseline)
- Create: `C:\Users\Irfan\.claude\backups\cust-5-opus-line.txt` (captured baseline)
- Modify: `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md` (add Patch 6 + Patch 7)

**Purpose:** Customisations #4 (RETIRES.md) and #5 (gsd-debugger Opus override) exist in the installed files but are **not documented as patches** in either PATCHES.md. Task 4 (installer) will wipe both files. Without this task, Tasks 10 and 14 have nothing to read.

This task **(a)** captures the current content of both customisations to disk for safety, and **(b)** adds proper Patch 6 + Patch 7 entries to project PATCHES.md so Tasks 10 and 14 can read them normally.

- [ ] **Step 1: Extract Customisation #4 (spec-phase Step 6.5 RETIRES.md) content**

```powershell
$spec = Get-Content "C:\Users\Irfan\.claude\get-shit-done\workflows\spec-phase.md" -Raw
# Step 6.5 starts at "## Step 6.5: Charter Removals (RETIRES.md)" and ends at "## Step 7:"
$startIdx = $spec.IndexOf("## Step 6.5: Charter Removals (RETIRES.md)")
$endIdx   = $spec.IndexOf("## Step 7:")
if ($startIdx -lt 0 -or $endIdx -lt 0 -or $endIdx -le $startIdx) {
  Write-Error "Cannot locate Step 6.5 boundaries in spec-phase.md. Halt."
  exit 1
}
$retiresContent = $spec.Substring($startIdx, $endIdx - $startIdx).TrimEnd()
$retiresContent | Out-File "C:\Users\Irfan\.claude\backups\cust-4-retires-content.md" -Encoding UTF8
Write-Host "Cust #4 captured: $((Get-Item 'C:\Users\Irfan\.claude\backups\cust-4-retires-content.md').Length) bytes"
```

- [ ] **Step 2: Extract Customisation #5 (gsd-debugger Opus override) content**

```powershell
$modelProfilesFull = Get-Content "C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.cjs" -Raw
$modelProfilesFull | Out-File "C:\Users\Irfan\.claude\backups\cust-5-model-profiles-baseline.cjs" -Encoding UTF8

$opusLine = (Get-Content "C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.cjs") |
            Where-Object { $_ -match "^\s*'gsd-debugger':" }
if (-not $opusLine) {
  Write-Error "Cannot locate gsd-debugger line in model-profiles.cjs. Halt."
  exit 1
}
$opusLine | Out-File "C:\Users\Irfan\.claude\backups\cust-5-opus-line.txt" -Encoding ASCII
Write-Host "Cust #5 captured: $opusLine"
```

Expected output:
```
Cust #5 captured:   'gsd-debugger': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet', adaptive: 'opus' },
```

- [ ] **Step 3: Append Patch 6 (RETIRES.md) to project PATCHES.md**

Open `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md` and append AFTER the existing Patch 5 entry (and BEFORE the "Dropped patches" section if present), using the captured content from Step 1:

```markdown
## Patch 6: spec-phase — Step 6.5 Charter Removals (RETIRES.md)

**File:** `get-shit-done/workflows/spec-phase.md`
**Purpose:** For any phase that deletes, deprecates, or cuts over functionality, generate a RETIRES.md alongside SPEC.md so what is REMOVED is chartered with the same rigor as what is ADDED. Prevents silent retirement of side effects, callers, or upstream dependencies during refactor phases.
**Insertion anchor:** Between `## Step 6: Generate SPEC.md` (ends with the SPEC.md write completion text) and `## Step 7: Commit`.
**Dependencies:**
- `{phase_dir}/{padded}-SPEC.md` written in Step 6
- Phase scope contains deletion/deprecation/cutover language (scan triggers Step 6.5 conditionally)

**Content:** (see captured baseline at `C:\Users\Irfan\.claude\backups\cust-4-retires-content.md`)
The step block "## Step 6.5: Charter Removals (RETIRES.md)" defines: when to generate RETIRES.md (scan SPEC.md for deletion phrases), the RETIRES.md template (Phase header, retirement list, side-effect map, caller audit, rollback plan, verification checks), the write target `{phase_dir}/{padded_phase}-RETIRES.md`, and the inclusion of RETIRES.md in the same atomic commit as SPEC.md.

**Verification:**
```bash
grep -c "## Step 6.5: Charter Removals (RETIRES.md)" .claude/get-shit-done/workflows/spec-phase.md
# Expected: 1
grep -c "RETIRES.md" .claude/get-shit-done/workflows/spec-phase.md
# Expected: >= 5
```

---

## Patch 7: model-profiles — gsd-debugger Opus override

**File:** `get-shit-done/bin/lib/model-profiles.cjs` (or the equivalent post-fork path — see Task 14 decision tree)
**Purpose:** Force the `gsd-debugger` agent to use Opus on both `quality` and `adaptive` profiles (defaults route it to Sonnet on `adaptive`). Debugging benefits disproportionately from deeper reasoning, and the user's standing preference (MEMORY.md → "Always use Opus for gsd-debugger") makes this a hard requirement.
**Insertion anchor:** Inside the agent→model map object literal in `model-profiles.cjs`, alongside sibling entries for `gsd-planner`, `gsd-executor`, etc.
**Dependencies:**
- `model-profiles.cjs` (or equivalent) must exist with a recognisable agent→model mapping structure
- `gsd-debugger` agent must exist in the install (verify with `Test-Path C:\Users\Irfan\.claude\agents\gsd-debugger.md` post-install)

**Content:** (see captured baseline at `C:\Users\Irfan\.claude\backups\cust-5-opus-line.txt`)
Add the line:
```javascript
  'gsd-debugger': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet', adaptive: 'opus' },
```

**Verification:**
```bash
grep "'gsd-debugger':.*adaptive.*'opus'" .claude/get-shit-done/bin/lib/model-profiles.cjs
# Expected: 1 match
```

**Fallback (per Task 14 decision tree Cases B/C/D/E):** If the file is restructured or removed by gsd-redux, this Patch entry's `**File:**` and `**Content:**` fields are amended in place, OR the patch is marked `**Status:** RETIRED` with rationale. Task 14 documents which case applied.
```

- [ ] **Step 4: Append Patch 7 to project PATCHES.md**

Already covered in Step 3's block (Patch 6 and Patch 7 are added together in one Edit).

- [ ] **Step 5: Verify both patches now exist in PATCHES.md**

```bash
grep -c "^## Patch [1-7]:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"
# Expected: 7
grep -c "^## Patch 6:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"
# Expected: 1
grep -c "^## Patch 7:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"
# Expected: 1
```

If any returns 0, re-apply the Edit operation from Step 3.

---

## Task 2: Git state setup (stash + create chore branch)

**Files:**
- Modify (git only): `D:\Claude\Product Manager\product_master\` working tree
- Create: `C:\Users\Irfan\.claude\backups\.last-migration-stash-tag`

- [ ] **Step 1: Change to project root**

```powershell
cd "D:\Claude\Product Manager\product_master"
```

- [ ] **Step 2: Capture current branch (PERSIST TO FILE — survives session restarts)**

```powershell
$origBranch = (git branch --show-current).Trim()
if (-not $origBranch) {
  Write-Error "Could not detect current branch (detached HEAD?). Halt and resolve before migration."
  exit 1
}
mkdir -Force "C:\Users\Irfan\.claude\backups" | Out-Null
$origBranch | Out-File -FilePath "C:\Users\Irfan\.claude\backups\.last-origin-branch" -Encoding ASCII
Write-Host "Migration starting from branch: $origBranch (saved to .last-origin-branch)"
```
Expected output: `Migration starting from branch: <branch-name> (saved to .last-origin-branch)`. The migration may span multiple PowerShell sessions over ~5 hours — file persistence guarantees Task 37 lands the operator on the correct branch even if the variable was lost.

- [ ] **Step 3: Stash uncommitted work with a tagged message**

```powershell
$stashTag = "pre-redux-migration-$(Get-Date -Format yyyyMMdd-HHmmss)"
git stash push -u -m $stashTag
Write-Host "Stashed pre-migration work as: $stashTag"
```
Expected output: `Saved working directory and index state On <branch>: <stashTag>`. The `-u` flag includes untracked files.

If `git stash push` says "No local changes to save", that's fine — proceed to step 4.

- [ ] **Step 4: Save stash tag to a known location**

```powershell
mkdir -Force "C:\Users\Irfan\.claude\backups" | Out-Null
$stashTag | Out-File -FilePath "C:\Users\Irfan\.claude\backups\.last-migration-stash-tag" -Encoding ASCII
```

- [ ] **Step 5: Verify clean tree**

```powershell
git status
```
Expected: `nothing to commit, working tree clean`.

- [ ] **Step 6: Create and switch to chore branch**

```powershell
git switch -c chore/gsd-redux-migration
git status
```
Expected output: `On branch chore/gsd-redux-migration` ... `nothing to commit, working tree clean`.

---

## Task 3: Backup 1 — Pre-migration full snapshot

**Files:**
- Create: `C:\Users\Irfan\.claude\backups\KEEP-pre-redux-<ts>\` (whole-tree mirror)
- Create: `D:\Claude\Product Manager\product_master\.claude\backups\KEEP-pre-redux-<ts>\` (whole-tree mirror)

- [ ] **Step 1: Generate shared timestamp**

```powershell
$ts1 = Get-Date -Format "yyyyMMdd-HHmmss"
Write-Host "Backup 1 timestamp: $ts1"
# Save to a file so subsequent tasks can reference:
$ts1 | Out-File -FilePath "C:\Users\Irfan\.claude\backups\.last-backup1-ts" -Encoding ASCII
```

- [ ] **Step 2: Create user-level backup directory + run robocopy**

```powershell
$backup1User = "C:\Users\Irfan\.claude\backups\KEEP-pre-redux-$ts1"
mkdir -Force $backup1User | Out-Null
robocopy "C:\Users\Irfan\.claude" $backup1User /MIR /R:0 /W:0 /XD backups .cache /TEE /LOG:"$backup1User\robocopy.log"
```
Expected: robocopy exits with code 1 (success with new files copied) or 0 (no copy needed). Codes ≥ 8 indicate errors — diagnose before proceeding.

- [ ] **Step 3: Create project-level backup directory + run robocopy**

```powershell
$backup1Proj = "D:\Claude\Product Manager\product_master\.claude\backups\KEEP-pre-redux-$ts1"
mkdir -Force $backup1Proj | Out-Null
robocopy "D:\Claude\Product Manager\product_master\.claude" $backup1Proj /MIR /R:0 /W:0 /XD backups .cache /TEE /LOG:"$backup1Proj\robocopy.log"
```
Expected: same as Step 2.

- [ ] **Step 4: Verify backup file counts**

```powershell
$srcCount = (Get-ChildItem "C:\Users\Irfan\.claude\get-shit-done" -Recurse -File).Count
$bakCount = (Get-ChildItem "$backup1User\get-shit-done" -Recurse -File).Count
Write-Host "Source: $srcCount files, Backup: $bakCount files"
if ($srcCount -ne $bakCount) { Write-Error "Backup file count mismatch — file lock during copy. Re-run Task 3." }
```
Expected: counts match (~260 files for `get-shit-done/`).

- [ ] **Step 5: Verify representative file integrity**

```powershell
fc /B "C:\Users\Irfan\.claude\get-shit-done\workflows\plan-phase.md" `
      "$backup1User\get-shit-done\workflows\plan-phase.md" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "Backup integrity check failed — re-run Task 3." }
```
Expected: `fc /B` reports "no differences encountered" (exit 0).

---

## Task 3.5: Rollback A dry-run (verify restore works BEFORE the installer wipes anything)

**Files:**
- Create (then delete): `C:\Users\Irfan\.claude\test-rollback-marker.txt` (probe file)
- Read-only: `$backup1User` (Backup 1)

**Purpose:** The plan has three rollback procedures (A, B, C) but the operator only exercises them at failure time. If a rollback procedure is itself broken (file lock, robocopy permission denied), discovering this at migration-failure time is the worst possible moment. Dry-run now while everything is still nominal.

- [ ] **Step 1: Place a marker file outside the backup**

```powershell
$marker = "C:\Users\Irfan\.claude\test-rollback-marker.txt"
"This file should disappear after Rollback A dry-run." | Out-File -FilePath $marker -Encoding ASCII
if (-not (Test-Path $marker)) { Write-Error "Could not create marker. Halt."; exit 1 }
Write-Host "Marker created at: $marker"
```

- [ ] **Step 2: Run the Rollback A robocopy command in dry-run mode**

`/L` flag = list-only, no actual changes. Confirms the restore would touch the marker:

```powershell
$ts1 = (Get-Content "C:\Users\Irfan\.claude\backups\.last-backup1-ts" -Raw).Trim()
$backup1User = "C:\Users\Irfan\.claude\backups\KEEP-pre-redux-$ts1"

robocopy $backup1User "C:\Users\Irfan\.claude" /MIR /L /R:0 /W:0 /XD backups .cache /TEE | Out-String | Select-String "EXTRA File.*test-rollback-marker"
```
Expected: matching line shows robocopy WOULD delete `test-rollback-marker.txt` if run for-real. If no match, the rollback path isn't actually mirroring back from Backup 1 — diagnose before continuing.

- [ ] **Step 3: Run the actual restore (small scope) to prove it works**

For-real restore. This DELETES the marker because Backup 1 doesn't contain it:

```powershell
robocopy $backup1User "C:\Users\Irfan\.claude" /MIR /R:0 /W:0 /XD backups .cache /TEE /LOG:"C:\Users\Irfan\.claude\backups\rollback-dryrun.log"
```

- [ ] **Step 4: Verify marker is gone AND a sample patched file matches Backup 1**

```powershell
if (Test-Path $marker) {
  Write-Error "Rollback A FAILED — marker file still exists. Robocopy didn't actually restore."
  exit 1
}
Write-Host "Marker correctly removed."

fc /B "C:\Users\Irfan\.claude\get-shit-done\workflows\plan-phase.md" `
      "$backup1User\get-shit-done\workflows\plan-phase.md" | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Rollback A FAILED — restored plan-phase.md doesn't match Backup 1."
  exit 1
}
Write-Host "Rollback A dry-run: PASS"
```

- [ ] **Step 5: Inspect the dry-run log for file-lock or permission errors**

```powershell
Select-String -Path "C:\Users\Irfan\.claude\backups\rollback-dryrun.log" `
              -Pattern "ERROR|ACCESS_DENIED|sharing violation" | Format-Table
```
Expected: empty (no errors). If errors appear, investigate (Claude Code session re-spawned? antivirus interference?) BEFORE Task 4, because the actual rollback at failure time would hit the same issue.

---

## Task 4: Install gsd-redux@1.0.0

**Files:**
- Modify (via installer): `C:\Users\Irfan\.claude\get-shit-done\` (whole directory)
- Modify (via installer): `C:\Users\Irfan\.claude\skills\gsd-*\SKILL.md`
- Modify (via installer): `C:\Users\Irfan\.claude\agents\gsd-*.md`

- [ ] **Step 1: Change to home directory**

```powershell
cd C:\Users\Irfan
```

- [ ] **Step 2: Run installer with captured log**

```powershell
npx @opengsd/get-shit-done-redux@1.0.0 --claude --global --profile=full 2>&1 | Tee-Object -FilePath "C:\Users\Irfan\.claude\backups\install-100.log"
```
Expected: installer runs, prints progress, exits 0. Watch stdout for "applied migration" lines from the migration framework.

If the installer prompts interactively (runtime, scope, profile), select: runtime = Claude Code, scope = global, profile = full.

- [ ] **Step 3: Verify exit code**

```powershell
if ($LASTEXITCODE -ne 0) { Write-Error "Installer failed with exit $LASTEXITCODE. Review install-100.log." }
```
If install failed, halt and diagnose.

- [ ] **Step 4: Confirm install delivered files**

```powershell
$installRoot = "C:\Users\Irfan\.claude\get-shit-done"
if (-not (Test-Path "$installRoot\workflows")) { Write-Error "workflows/ directory missing — install incomplete." }
if (-not (Test-Path "$installRoot\bin")) { Write-Error "bin/ directory missing — install incomplete." }
```

---

## Task 5: Post-install binary path discovery

**Files:**
- Create: `C:\Users\Irfan\.claude\backups\.gsd-tools-path` (resolved binary location)

- [ ] **Step 1: Search for gsd-tools binary**

```powershell
$gsdToolsCandidates = @(
  "C:\Users\Irfan\.claude\get-shit-done\bin\gsd-tools.cjs",
  "C:\Users\Irfan\.claude\get-shit-done\bin\gsd-tools.js",
  "C:\Users\Irfan\.claude\get-shit-done\bin\gsd-tools.mjs",
  "C:\Users\Irfan\.claude\get-shit-done\bin\gsd-tools"
)
$gsdToolsPath = $gsdToolsCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $gsdToolsPath) {
  $gsdToolsPath = (Get-ChildItem -Path "C:\Users\Irfan\.claude\get-shit-done\bin" -Filter "gsd-tools*" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
Write-Host "gsd-tools resolved to: $gsdToolsPath"
```

- [ ] **Step 2: Halt if not found**

```powershell
if (-not $gsdToolsPath) {
  Write-Error "gsd-tools binary NOT FOUND. Install may have restructured. HALT — do not proceed to patch application."
  exit 1
}
```

- [ ] **Step 3: Save resolved path to a file for later tasks**

```powershell
$gsdToolsPath | Out-File "C:\Users\Irfan\.claude\backups\.gsd-tools-path" -Encoding ASCII
```

- [ ] **Step 4: Smoke-test the binary**

```powershell
node $gsdToolsPath --version
```
Expected: exits 0, prints a version string. If it fails or exits non-zero, halt and diagnose — the binary may need different invocation in gsd-redux.

---

## Task 6: Anchor verification against fresh 1.0.0 install

**Files:**
- Create: `C:\Users\Irfan\.claude\backups\anchor-verification-1.0.0.log`

- [ ] **Step 1: Run anchor grep loop**

In Git Bash or PowerShell with `grep` available:
```bash
LOG="C:/Users/Irfan/.claude/backups/anchor-verification-1.0.0.log"
echo "=== Anchor verification against fresh 1.0.0 install ===" > "$LOG"

for anchor in \
  'code_review_gate' \
  'verify_phase_goal' \
  'handle_partial_wave_execution' \
  'Step 6: Generate SPEC.md' \
  'Step 7: Commit' \
  'Step 12.5' \
  ; do
  echo "--- '$anchor' ---" >> "$LOG"
  grep -rln "$anchor" "C:/Users/Irfan/.claude/get-shit-done/workflows/" >> "$LOG" 2>&1 || echo "NOT FOUND" >> "$LOG"
done

cat "$LOG"
```

- [ ] **Step 2: Inspect log for NOT FOUND lines**

Open `C:\Users\Irfan\.claude\backups\anchor-verification-1.0.0.log` and check each anchor's section.

For each anchor that returned `NOT FOUND`:
- `code_review_gate` missing → Customisations #2 and #6 unanchorable. HALT and re-research execute-phase.md structure.
- `Step 12.5` missing → Customisation #1 needs new anchor. Open `C:\Users\Irfan\.claude\get-shit-done\workflows\plan-phase.md` and find the iteration-loop closure step. Update PATCHES.md's Patch entry for Customisation #1 with new anchor BEFORE Task 7.
- Other anchors missing → re-research the new location, update PATCHES.md.

- [ ] **Step 3: Decision gate**

If any Critical anchor is missing AND can't be re-anchored in <30 min, halt migration here. Backup 1 still exists; Rollback A still possible.

If all anchors green OR re-anchoring complete, proceed.

---

## Task 7: Refresh pristine baseline

**Files:**
- Modify: `C:\Users\Irfan\.claude\gsd-pristine\get-shit-done\workflows\` (refreshed copies)
- Modify: `C:\Users\Irfan\.claude\gsd-local-patches\backup-meta.json`

- [ ] **Step 1: Refresh workflows directory in pristine**

```powershell
robocopy "C:\Users\Irfan\.claude\get-shit-done\workflows" `
         "C:\Users\Irfan\.claude\gsd-pristine\get-shit-done\workflows" `
         /MIR /R:0 /W:0
```

- [ ] **Step 2: Refresh agents directory in pristine**

```powershell
robocopy "C:\Users\Irfan\.claude\agents" `
         "C:\Users\Irfan\.claude\gsd-pristine\agents" `
         /MIR /R:0 /W:0
```

- [ ] **Step 3: Refresh bin/lib in pristine (for Cohort 2 #5)**

```powershell
robocopy "C:\Users\Irfan\.claude\get-shit-done\bin\lib" `
         "C:\Users\Irfan\.claude\gsd-pristine\get-shit-done\bin\lib" `
         /MIR /R:0 /W:0
```

- [ ] **Step 4: Update backup-meta.json with new baseline metadata**

```powershell
$meta = @{
  from_version = "@opengsd/get-shit-done-redux@1.0.0"
  backed_up_at = (Get-Date).ToString("o")
  notes = "Refreshed during migration from get-shit-done-cc@1.41.0 to gsd-redux@1.0.0"
} | ConvertTo-Json
Set-Content "C:\Users\Irfan\.claude\gsd-local-patches\backup-meta.json" $meta
```

- [ ] **Step 5: Verify meta file**

```powershell
Get-Content "C:\Users\Irfan\.claude\gsd-local-patches\backup-meta.json"
```
Expected: JSON with `from_version: "@opengsd/get-shit-done-redux@1.0.0"`.

---

## Task 8: Apply Patch — plan-phase.md (Customisation #1 → Project PATCHES.md Patch 4)

**Files:**
- Modify: `C:\Users\Irfan\.claude\get-shit-done\workflows\plan-phase.md`

**Numbering note (Refinement #2 — fixes pre-existing collision):** The pre-migration install has a duplicate `## 12.5` section heading in `plan-phase.md` — upstream's `## 12.5. Plan Bounce` AND our `## 12.5. Staffreview Gate` collided. Project PATCHES.md Patch 4 documents the staffreview gate as `## 12.6` (NOT 12.5). On this fresh install, apply at `## 12.6` per PATCHES.md to eliminate the collision.

- [ ] **Step 1: Read PATCHES.md Patch 4 for content**

Open `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md` and locate **Patch 4** (Customisation #1, staffreview gate). Note the *Insertion anchor* (between `## 12.5. Plan Bounce` and `## 13. Requirements Coverage Gate`) and the *Content* (the new `## 12.6. Staff Review Gate` block).

- [ ] **Step 2: Re-verify anchor in fresh 1.0.0 file**

```bash
grep -n "## 12.5. Plan Bounce\|## 13. Requirements Coverage Gate\|staffreview" "C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md"
```
Expected: at least one hit for `## 12.5. Plan Bounce` and one for `## 13.`. Zero hits for `staffreview` (fresh install has no patch yet). If `## 12.5. Plan Bounce` is missing, the anchor moved — refer to Task 6 Step 2 for re-anchoring procedure.

- [ ] **Step 3: Apply the patch using Edit tool**

Use the `Edit` tool to insert the patch content. The new section heading **must be `## 12.6. Staff Review Gate (MANDATORY)`** — NOT `## 12.5`. This eliminates the pre-existing numbering collision with upstream's Plan Bounce step (which uses 12.5).

The Edit tool's `old_string` should be the line(s) IMMEDIATELY before `## 13. Requirements Coverage Gate` (i.e., the closing lines of `## 12.5. Plan Bounce`). The `new_string` should be those same lines PLUS the new `## 12.6. Staff Review Gate` block from PATCHES.md.

Also re-route the routing references in Step 11 and Step 12 per Patch 4 content ("proceed to step 13" → "proceed to step 12.6 (staff review)" in the listed 4 spots — verification-passed, no-issues, both stall "Proceed anyway" branches).

- [ ] **Step 4: Verify patch landed (matches PATCHES.md Patch 4 verification block)**

```bash
grep -c "## 12.6. Staff Review Gate" "C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md"
# Expected: >= 1

grep -c "step 12.6 (staff review)" "C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md"
# Expected: >= 3 (verification-passed + 2 stall-proceed routes)

grep -c "Route the COMPLETE tiered list" "C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md"
# Expected: >= 1

grep -c "staffreview" "C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md"
# Expected: >= 4

# Numbering-collision check (must be ZERO after fix):
grep -c "^## 12.5. Staffreview Gate\|^## 12.5. Staff Review Gate" "C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md"
# Expected: 0 (the gate is now at 12.6, NOT 12.5 — 12.5 belongs to upstream's Plan Bounce only)
```

- [ ] **Step 5: If verify fails, diagnose**

If grep returns 0 or less than 4, re-open the file, re-locate anchor, re-apply patch. Common causes: anchor was inside a different section than expected, Edit's `old_string` didn't match exactly.

---

## Task 9: Apply 3 patches to execute-phase.md (Customisations #2, #3, #6)

**Files:**
- Modify: `C:\Users\Irfan\.claude\get-shit-done\workflows\execute-phase.md`

These 3 patches all target execute-phase.md. Apply them in order, verifying each before moving to the next.

- [ ] **Step 1: Apply Patch — triple_review_gate (Customisation #2)**

Read the Patch entry from `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md`. The anchor is `<step name="code_review_gate">` — verify it exists with `grep -n 'code_review_gate' "C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md"`. Use Edit tool to insert/wrap the triple_review_gate step per PATCHES.md.

Verify:
```bash
grep -c "triple_review_gate\|quad_review" "C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md"
```
Expected: ≥ 1.

- [ ] **Step 2: Apply Patch — document_and_merge_gate (Customisation #3)**

Anchor: after the `update_roadmap` step. Verify exists: `grep -n 'update_roadmap' "C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md"`. Apply per PATCHES.md.

Verify:
```bash
grep -c "document_and_merge_gate" "C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md"
```
Expected: 1.

- [ ] **Step 3: Apply Patch — quad_review consolidation (Customisation #6)**

This patch REPLACES the upstream `code_review_gate` block with a consolidated `quad_review` block. Use Edit's `old_string` to match the existing code_review_gate step block, `new_string` to replace it with the quad_review block from PATCHES.md.

Verify:
```bash
grep -c "quad_review" "C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md"
```
Expected: ≥ 1.

- [ ] **Step 4: Verify tiered findings rule (Customisation #7) is embedded**

```bash
grep -c "Route the COMPLETE tiered list" "C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md"
```
Expected: ≥ 1 (rule is embedded inside the patches from Steps 1–3).

---

## Task 10: Apply 2 patches to spec-phase.md (Customisations #4, #13)

**Files:**
- Modify: `C:\Users\Irfan\.claude\get-shit-done\workflows\spec-phase.md`

- [ ] **Step 1: Apply Patch — Step 6.5 RETIRES.md (Customisation #4 → Project PATCHES.md Patch 6, added by Task 1.5)**

Read Patch 6 from `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md`. The *Content* field directs to the captured baseline at `C:\Users\Irfan\.claude\backups\cust-4-retires-content.md` (extracted in Task 1.5 Step 1 BEFORE the installer wiped the original).

Anchor: between `Step 6: Generate SPEC.md` and `Step 7: Commit`. Verify both exist:
```bash
grep -n "Step 6: Generate SPEC.md\|Step 7: Commit" "C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md"
```

Apply via Edit tool. The `new_string` should be the captured content from `cust-4-retires-content.md` inserted between the located anchors.

Verify (per Patch 6's documented verification block):
```bash
grep -c "## Step 6.5: Charter Removals (RETIRES.md)" "C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md"
# Expected: 1
grep -c "RETIRES.md" "C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md"
# Expected: >= 5
```

- [ ] **Step 2: Apply Patch — Step 2.5 Graph Blast Radius Scout (Customisation #13)**

Read from `C:\Users\Irfan\.claude\gsd-local-patches\PATCHES.md` (user-level, not project-level — this is a graphify patch). Anchor: between Step 2 and Step 3.

Apply via Edit tool.

Verify:
```bash
grep -c "Step 2.5: Graph Blast Radius Scout" "C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md"
```
Expected: 1.

```bash
grep -c "graph-surfaced anchor symbol" "C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md"
```
Expected: ≥ 2.

---

## Task 11: Apply Patch to discuss-phase.md (Customisation #14)

**Files:**
- Modify: `C:\Users\Irfan\.claude\get-shit-done\workflows\discuss-phase.md`

- [ ] **Step 1: Read PATCHES.md for graphify patch**

Read from `C:\Users\Irfan\.claude\gsd-local-patches\PATCHES.md` (user-level). Note the *Insertion anchor* (between `scout_codebase` step and `analyze_phase` step) and the CONTEXT.md template extension.

- [ ] **Step 2: Apply the scout_graph_blast_radius step**

Locate `scout_codebase` and `analyze_phase` anchors. Apply Edit tool to insert the new `scout_graph_blast_radius` step block between them.

- [ ] **Step 3: Apply the CONTEXT.md template extension**

The patch also adds a `### Blast Radius (from graphify)` subsection to the CONTEXT.md template embedded in this file. Locate the template section and apply per PATCHES.md.

- [ ] **Step 4: Verify both parts of the patch**

```bash
grep -c "scout_graph_blast_radius" "C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md"
```
Expected: ≥ 2.

```bash
grep -c "### Blast Radius" "C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md"
```
Expected: ≥ 2.

---

## Task 12: Apply Patch to quick.md (Customisation #9)

**Files:**
- Modify: `C:\Users\Irfan\.claude\get-shit-done\workflows\quick.md`

- [ ] **Step 1: Read Patch from PATCHES.md**

Project-level PATCHES.md, Patch 2. Adds Step 6.3 quad-review, Step 6.4 simplify, Step 9 document-and-merge.

- [ ] **Step 2: Apply Edit per PATCHES.md content**

Anchor: existing Step 6 boundary. Insert/replace per PATCHES.md.

- [ ] **Step 3: Verify both new steps**

```bash
grep -c "Step 6.3.*[Qq]uad" "C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md"
```
Expected: ≥ 1.

```bash
grep -c "Step 6.4.*[Ss]implify" "C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md"
```
Expected: ≥ 1.

---

## Task 13: Apply Patch to debug.md (Customisation #10)

**Files:**
- Modify: `C:\Users\Irfan\.claude\get-shit-done\workflows\debug.md`

- [ ] **Step 1: Read Patch from PATCHES.md**

Project-level PATCHES.md, Patch 3. Adds Step 5 (Quality Gates: triple-review + simplify) and Step 6 (Document and Merge).

- [ ] **Step 2: Apply Edit per PATCHES.md content**

Anchor: between session-manager return and process close.

- [ ] **Step 3: Verify both new sections**

```bash
grep -c "Quality Gates" "C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md"
```
Expected: ≥ 1.

```bash
grep -c "Document and Merge" "C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md"
```
Expected: ≥ 1.

---

## Task 14: Apply Cohort 2 patch — model-profiles.cjs (Customisation #5 → Project PATCHES.md Patch 7, added by Task 1.5)

**Files:**
- Modify (decision tree below): `C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.cjs` OR equivalent

**Read Patch 7 from `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md`.** The captured baseline content is at `C:\Users\Irfan\.claude\backups\cust-5-opus-line.txt` (extracted in Task 1.5 Step 2).

This task has a decision tree because the new fork may have restructured model resolution. **All "update PATCHES.md" instructions in this task refer to Patch 7 (NOT Patch 5 — Patch 5 is the unrelated updateGSD parameter-consistency patch).**

- [ ] **Step 1: Locate model-profiles configuration in gsd-redux 1.0.0**

```powershell
$candidates = @(
  "C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.cjs",
  "C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.js",
  "C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.mjs",
  "C:\Users\Irfan\.claude\get-shit-done\config\models.json",
  "C:\Users\Irfan\.claude\get-shit-done\config\model-profiles.json"
)
$candidates | ForEach-Object { if (Test-Path $_) { Write-Host "FOUND: $_" } }

# Also grep for gsd-debugger references:
Get-ChildItem -Path "C:\Users\Irfan\.claude\get-shit-done" -Recurse -File -Include *.cjs,*.js,*.mjs,*.json |
  Select-String -Pattern "gsd-debugger|quality.*opus|adaptive.*opus" |
  Select-Object Filename, LineNumber, Line | Format-Table
```

- [ ] **Step 2: Branch based on findings**

Apply the decision tree from the spec:

**Case A — Same `.cjs` file with same object-literal structure** (most likely if Plan agent's research was accurate):
- Locate the section defining model resolutions
- Use Edit tool to insert the captured line verbatim: `'gsd-debugger': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet', adaptive: 'opus' },`

**Case B — Same file, different structure (e.g., JSON)**:
- Adapt patch content to JSON format
- Update **Patch 7's** *Content* field in PATCHES.md to reflect the new structure
- Apply via Edit tool

**Case C — Different file path, recognisable model-profiles concept**:
- Apply equivalent override at the new location
- Update **Patch 7's** *File:* field in PATCHES.md to the new path

**Case D — Model resolution mechanism removed entirely**:
- This is a hard regression on MEMORY.md user preference ("Always use Opus for gsd-debugger agent — not Sonnet"). Do NOT silently accept.
- **REQUIRED PAUSE — ask the user via AskUserQuestion before declaring Patch 7 RETIRED:**

  Use the `AskUserQuestion` tool with these options:
  - **Accept default model** — document Patch 7 as RETIRED in PATCHES.md. gsd-debugger will use whatever default the fork ships with. User preference downgraded with explicit acknowledgement.
  - **File issue against open-gsd/get-shit-done-redux** — keep Patch 7 unresolved, document as PENDING_UPSTREAM in PATCHES.md, proceed with default model in the meantime.
  - **Rollback Phase A** — abort migration, restore Backup 1, stay on `get-shit-done-cc@1.41.0` until upstream solution emerges.

- Only after explicit user choice: update Patch 7 in PATCHES.md per the decision (RETIRED note, PENDING_UPSTREAM note, or trigger Rollback A).

**Case E — `gsd-debugger` agent name doesn't exist in the fresh install**:
- Verify with: `Test-Path "C:\Users\Irfan\.claude\agents\gsd-debugger.md"` — if False, the agent itself was renamed/removed.
- Same as Case D: this drops a user preference silently. **Use AskUserQuestion** with these options:
  - **Accept the rename** — search for the renamed agent (`Get-ChildItem ...\agents\ -Filter "*debug*"`) and apply Patch 7 against the new agent name if found, else mark RETIRED.
  - **Treat as upstream regression** — file issue, mark Patch 7 PENDING_UPSTREAM, proceed with default model.
  - **Rollback Phase A** — abort migration.

- [ ] **Step 3: Apply override (Cases A/B/C, or post-AskUserQuestion for Cases D/E)**

For Cases A/B/C, use Edit tool to apply the override.
For Cases D/E, only apply if user chose a path that retains an override (e.g., Case E "Accept the rename" with new agent name); otherwise skip to Step 4.

- [ ] **Step 4: Verify (Cases A/B/C, and Case E when override retargeted)**

```bash
grep "'gsd-debugger':.*adaptive.*'opus'" "C:/Users/Irfan/.claude/get-shit-done/bin/lib/model-profiles.cjs" 2>&1
# OR for Case C, the new path:
# grep "gsd-debugger" "C:/Users/Irfan/.claude/get-shit-done/config/models.json"
# OR for Case E retarget, substitute the renamed agent name
```
Expected: 1 match showing the override entry (matches Patch 7's verification block).

For Cases D/E with RETIRED outcome, verify Patch 7's status in PATCHES.md:
```bash
grep -B1 -A3 "^## Patch 7:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md" | grep -i "status:\|retired\|pending_upstream"
# Expected: 1 match showing the status annotation
```

- [ ] **Step 5: Document in PATCHES.md (Cases B/C/D/E)**

For Cases B, C, D, or E, update **Patch 7's** Content/File/Status section to reflect the new state. This keeps the patch manifest accurate for future updates. **Do NOT touch Patch 5 — Patch 5 is the unrelated updateGSD parameter-consistency patch.**

---

## Task 15: Apply Cohort 2 patch — gsd-phase-researcher.md (Customisation #12)

**Files:**
- Modify: `C:\Users\Irfan\.claude\agents\gsd-phase-researcher.md`

- [ ] **Step 1: Read Patch from PATCHES.md**

User-level PATCHES.md, Patch 3 (re-targeted from deleted research-phase.md to this agent). Adds `<blast_radius_awareness>` block.

- [ ] **Step 2: Verify anchor**

```bash
grep -n "</downstream_consumer>\|<philosophy>" "C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md"
```
Expected: both anchors found. Block goes BETWEEN them.

- [ ] **Step 3: Apply Edit**

Insert the `<blast_radius_awareness>` block per PATCHES.md content, between `</downstream_consumer>` and `<philosophy>` tags.

- [ ] **Step 4: Verify**

```bash
grep -c "blast_radius_awareness" "C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md"
```
Expected: 2 (opening and closing tags).

```bash
grep -c "fan_in >= 10" "C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md"
```
Expected: 1.

---

## Task 16: Verify Cohort 3 commands untouched

**Files:**
- Read-only verify: `D:\Claude\Product Manager\product_master\.claude\commands\{updateGSD,triple-review,staffreview}.md`

- [ ] **Step 1: Check files exist**

```powershell
$cohort3 = @("updateGSD.md", "triple-review.md", "staffreview.md")
foreach ($f in $cohort3) {
  $path = "D:\Claude\Product Manager\product_master\.claude\commands\$f"
  if (Test-Path $path) { Write-Host "EXISTS: $f" } else { Write-Error "MISSING: $f" }
}
```
Expected: all 3 EXISTS.

- [ ] **Step 2: Verify git sees no modifications**

```powershell
cd "D:\Claude\Product Manager\product_master"
git status --short .claude/commands/
```
Expected: no output. If any line appears (M, ??, etc.), the installer modified a file that shouldn't have been touched. Restore from Backup 1's `commands/` directory.

- [ ] **Step 3: Verify Customisation #8 (triple-review --external-review)**

```bash
grep -c "external-review" "D:/Claude/Product Manager/product_master/.claude/commands/triple-review.md"
```
Expected: ≥ 1.

---

## Task 17: Pre-mirror diff check

**Files:**
- Read-only (compare): user-level vs project-level `.claude/` GSD subtrees

- [ ] **Step 1: Compare get-shit-done/ trees**

```powershell
$projDir = "D:\Claude\Product Manager\product_master\.claude\get-shit-done"
$userDir = "C:\Users\Irfan\.claude\get-shit-done"

$projFiles = Get-ChildItem $projDir -Recurse -File -ErrorAction SilentlyContinue |
             ForEach-Object { $_.FullName.Substring($projDir.Length + 1) }
$userFiles = Get-ChildItem $userDir -Recurse -File -ErrorAction SilentlyContinue |
             ForEach-Object { $_.FullName.Substring($userDir.Length + 1) }

$unique = Compare-Object -ReferenceObject $projFiles -DifferenceObject $userFiles |
          Where-Object SideIndicator -eq '<=' | ForEach-Object InputObject

if ($unique) {
  Write-Host "WARNING: $projDir has files NOT in $userDir:"
  $unique | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host "OK: get-shit-done/ has no project-tree-unique files"
}
```

- [ ] **Step 2: Compare agents/ and hooks/**

Repeat Step 1 for `agents` and `hooks`:
```powershell
foreach ($dir in @("agents", "hooks")) {
  $projDir = "D:\Claude\Product Manager\product_master\.claude\$dir"
  $userDir = "C:\Users\Irfan\.claude\$dir"
  if (-not (Test-Path $projDir)) { continue }

  $projFiles = Get-ChildItem $projDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Substring($projDir.Length + 1) }
  $userFiles = Get-ChildItem $userDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Substring($userDir.Length + 1) }
  $unique = Compare-Object -ReferenceObject $projFiles -DifferenceObject $userFiles | Where-Object SideIndicator -eq '<=' | ForEach-Object InputObject

  if ($unique) {
    Write-Host "WARNING: $dir has project-tree-unique files:"
    $unique | ForEach-Object { Write-Host "  $_" }
  } else {
    Write-Host "OK: $dir has no project-tree-unique files"
  }
}
```

- [ ] **Step 3: Decision gate (use this rubric, don't freeze)**

If WARNING lines appeared, apply the heuristic below before deciding:

| Heuristic on the unique file | Decision |
|---|---|
| Path contains `/cache/`, `/.tmp/`, `.bak`, `.swp`, or `~` suffix | **Obsolete** — let MIR delete (Task 18) |
| File appears in `git ls-files` under `.claude/` (tracked + clean) | **Preserve** — restore from Backup 1's project tree after Task 18 |
| File is in `.planning/` or has `.md` extension AND modified date > 2026-04-18 | **Inspect** — likely a fresh project artifact, preserve unless clearly stale |
| File is in `.claude/get-shit-done/` AND modified date > last GSD-update timestamp (2026-05-08) | **Inspect** — likely a local mod NOT tracked in PATCHES.md (a missed customisation) — STOP, document, then decide |
| File is in `.claude/get-shit-done/` AND modified date < 2026-05-08 | **Safe to delete** — pre-existing drift from old install, not part of current customisation set |
| File has identical name + path in `gsd-pristine/` | **Safe to delete** — was once part of the GSD install, now removed upstream |
| None of the above applies | Halt and inspect manually before continuing |

Pseudo-script to apply the rubric:
```powershell
foreach ($f in $unique) {
  $full = "$projDir\$f"
  if (-not (Test-Path $full)) { continue }
  $info = Get-Item $full
  $tracked = (git -C "D:\Claude\Product Manager\product_master" ls-files ".claude/$f" 2>$null) -ne ""
  $age = $info.LastWriteTime
  if ($f -match "\.bak$|\.swp$|~$|/cache/|/\.tmp/") { Write-Host "DELETE: $f" }
  elseif ($tracked) { Write-Host "PRESERVE: $f (git-tracked)" }
  elseif ($f -match "^\.planning/" -and $age -gt [datetime]"2026-04-18") { Write-Host "INSPECT: $f (fresh project artifact)" }
  elseif ($f -match "get-shit-done/" -and $age -gt [datetime]"2026-05-08") { Write-Host "INSPECT-CRITICAL: $f (possible untracked customisation — HALT and document)" }
  elseif ($age -lt [datetime]"2026-05-08") { Write-Host "DELETE: $f (pre-existing drift)" }
  else { Write-Host "INSPECT: $f (uncategorised)" }
}
```

For PRESERVE items: after Task 18 finishes, copy them back from Backup 1's project tree.
For INSPECT-CRITICAL items: STOP. These could be undocumented customisations (like #4 and #5 were before Task 1.5).

---

## Task 18: Mirror sync user→project

**Files:**
- Modify: `D:\Claude\Product Manager\product_master\.claude\get-shit-done\` (mirrored from user)
- Modify: `D:\Claude\Product Manager\product_master\.claude\agents\` (mirrored from user)
- Modify: `D:\Claude\Product Manager\product_master\.claude\hooks\` (mirrored from user)

- [ ] **Step 1: Mirror get-shit-done/**

```powershell
robocopy "C:\Users\Irfan\.claude\get-shit-done" `
         "D:\Claude\Product Manager\product_master\.claude\get-shit-done" `
         /MIR /R:0 /W:0
```
Expected: exit code 1 (success).

- [ ] **Step 2: Mirror agents/**

```powershell
robocopy "C:\Users\Irfan\.claude\agents" `
         "D:\Claude\Product Manager\product_master\.claude\agents" `
         /MIR /R:0 /W:0
```

- [ ] **Step 3: Mirror hooks/**

```powershell
robocopy "C:\Users\Irfan\.claude\hooks" `
         "D:\Claude\Product Manager\product_master\.claude\hooks" `
         /MIR /R:0 /W:0
```

- [ ] **Step 4: Do NOT mirror commands/**

Project `commands/` contains custom commands (Cohort 3) that should NOT be overwritten by user-level. Skip this directory deliberately.

- [ ] **Step 5: Verify mirror parity on 3 representative files**

```powershell
$samples = @(
  "get-shit-done\workflows\plan-phase.md",
  "agents\gsd-phase-researcher.md",
  "get-shit-done\bin\lib\model-profiles.cjs"
)
foreach ($f in $samples) {
  $u = "C:\Users\Irfan\.claude\$f"
  $p = "D:\Claude\Product Manager\product_master\.claude\$f"
  fc /B $u $p > $null
  if ($LASTEXITCODE -ne 0) { Write-Host "DIFFERS: $f" } else { Write-Host "OK: $f" }
}
```
Expected: all 3 OK.

---

## Task 19: Settings.json reconciliation

**Files:**
- Read-only verify: `C:\Users\Irfan\.claude\settings.json`
- Read-only verify: `D:\Claude\Product Manager\product_master\.claude\settings.json`

- [ ] **Step 1: Save the verification script as a file**

Create `C:\Users\Irfan\.claude\backups\verify-hooks.js`:
```javascript
const settingsPath = process.argv[2];
const projectRoot = process.argv[3] || '';
const s = require(settingsPath);
const fs = require('fs');

const HOOK_PATH_RE = /(?:C:\\Users\\Irfan\\\.claude\\hooks|\$CLAUDE_PROJECT_DIR\\\.claude\\hooks)\\[a-zA-Z0-9_.-]+/;

const hooks = [];
for (const k of Object.keys(s.hooks || {}))
  for (const e of s.hooks[k])
    for (const h of e.hooks || [])
      hooks.push({event: k, matcher: e.matcher, cmd: h.command});

let okCount = 0, missingCount = 0, noPathCount = 0;
for (const h of hooks) {
  const m = h.cmd.match(HOOK_PATH_RE);
  if (!m) { console.log('NO-PATH-FOUND', h.event, h.cmd.slice(0, 80)); noPathCount++; continue; }
  const resolved = m[0].replace('$CLAUDE_PROJECT_DIR', projectRoot);
  if (fs.existsSync(resolved)) { console.log('OK', h.event, resolved); okCount++; }
  else { console.log('MISSING', h.event, resolved); missingCount++; }
}
console.log(`\n=== Total: ${hooks.length}, OK: ${okCount}, MISSING: ${missingCount}, NO-PATH: ${noPathCount} ===`);
process.exit(missingCount > 0 ? 1 : 0);
```

- [ ] **Step 2: Run against user-level settings**

```powershell
node "C:\Users\Irfan\.claude\backups\verify-hooks.js" "C:\Users\Irfan\.claude\settings.json"
```
Expected: all `OK` lines, exit 0.

If any `MISSING`, restore the missing hook file from Backup 1:
```powershell
$ts1 = Get-Content "C:\Users\Irfan\.claude\backups\.last-backup1-ts" -Raw
$hookFile = "<the missing hook filename from MISSING line>"
copy "C:\Users\Irfan\.claude\backups\KEEP-pre-redux-$ts1\hooks\$hookFile" "C:\Users\Irfan\.claude\hooks\$hookFile"
# Re-run verify-hooks.js
```

- [ ] **Step 3: Run against project-level settings**

```powershell
node "C:\Users\Irfan\.claude\backups\verify-hooks.js" "D:\Claude\Product Manager\product_master\.claude\settings.json" "D:\Claude\Product Manager\product_master"
```
Expected: all `OK` lines.

- [ ] **Step 4: If NO-PATH-FOUND lines appear**

Hooks use an unrecognised path pattern. Manually inspect those entries. If they're valid but use an unexpected format (e.g., relative paths, env var combos), extend the regex in `verify-hooks.js` to handle them.

---

## Task 20: Phase A green-gate — grep battery

**Files:**
- Read-only verify: all 11 patched files at user level + project level

- [ ] **Step 1: Run user-level grep battery**

```bash
echo "=== USER TREE GREP BATTERY ===" > C:/Users/Irfan/.claude/backups/green-gate-user.log

# Cohort 1 patches
grep -c "staffreview" C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md             # expect >= 4
grep -c "triple_review_gate\|quad_review" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # expect >= 1
grep -c "document_and_merge_gate" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md         # expect == 1
grep -c "Step 6.5: Charter Removals (RETIRES.md)" C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md  # expect == 1
grep -c "quad_review" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md          # expect >= 1
grep -c "Route the COMPLETE tiered list" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md   # expect >= 1
grep -c "Step 6.3.*[Qq]uad" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md            # expect >= 1
grep -c "Step 6.4.*[Ss]implify" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md        # expect >= 1
grep -c "Quality Gates" C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md                # expect >= 1
grep -c "Document and Merge" C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md           # expect >= 1
grep -c "Step 2.5: Graph Blast Radius Scout" C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md   # expect == 1
grep -c "scout_graph_blast_radius" C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md         # expect >= 2
grep -c "### Blast Radius" C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md     # expect >= 2

# Cohort 2 patches
grep "'gsd-debugger':.*adaptive.*'opus'" C:/Users/Irfan/.claude/get-shit-done/bin/lib/model-profiles.cjs   # 1 match (or RETIRED note in PATCHES.md)
grep -c "blast_radius_awareness" C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md         # expect == 2
grep -c "fan_in >= 10" C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md                   # expect == 1
```
Tee output to the log file. Inspect each line — compare actual count vs expected. Any mismatch = patch didn't land.

- [ ] **Step 2: Run project-level grep battery**

Repeat the same commands but with `D:/Claude/Product Manager/product_master/` paths instead of `C:/Users/Irfan/`. Tee to `D:/Claude/Product Manager/product_master/.claude/backups/green-gate-project.log`.

- [ ] **Step 3: Run Cohort 3 verification**

```bash
grep -c "external-review" "D:/Claude/Product Manager/product_master/.claude/commands/triple-review.md"
# Expected: >= 1
```

```powershell
cd "D:\Claude\Product Manager\product_master"
git status --short .claude/commands/
# Expected: no output
```

- [ ] **Step 4: Decision gate**

If all checks pass: proceed to Task 21.
If any fail and can't be fixed in <15 min: Rollback A (see spec Rollback A procedure).

---

## Task 21: Phase A green-gate — smoke tests + command invocability

**Files:**
- Read-only verify: binary execution + Claude Code command registry

- [ ] **Step 1: Smoke test the binary**

```powershell
$gsdToolsPath = Get-Content "C:\Users\Irfan\.claude\backups\.gsd-tools-path" -Raw
node $gsdToolsPath.Trim() --version
node $gsdToolsPath.Trim() --help
```
Expected: both commands exit 0 with output.

- [ ] **Step 2: Smoke test graphify status**

```powershell
node $gsdToolsPath.Trim() graphify status
```
Expected: exit 0 with status output. If gsd-redux doesn't have a graphify subcommand, expect a "command not found" error from the binary's own help — that's still informative (means the subcommand renamed/removed).

- [ ] **Step 3: Non-interactive frontmatter validation (fallback / lower bound)**

Before the interactive check (Step 4), confirm each custom command file has parseable frontmatter — slash-command registration requires it. Catches the "file exists but malformed" failure non-interactively:

```powershell
foreach ($f in @("updateGSD.md", "staffreview.md", "triple-review.md")) {
  $path = "D:\Claude\Product Manager\product_master\.claude\commands\$f"
  $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
  if (-not $content) { Write-Error "FAIL: $f missing"; continue }
  if ($content -notmatch "(?s)^---\s*\n.*?\nname:.*?\n.*?---") {
    Write-Error "FAIL: $f frontmatter malformed (no top-of-file --- block with name: field) — slash-command registration will silently miss"
  } else {
    Write-Host "OK: $f has parseable frontmatter"
  }
}
```
Expected: all three `OK`. If any `FAIL`, halt — fix the frontmatter before the interactive check (which would just exhibit the same symptom).

- [ ] **Step 4: Interactive command invocability in Claude Code**

Open Claude Code in the project directory. Test each:
1. Type `/up` → autocomplete should suggest `/updateGSD`. Press Tab. Invoke with no args. Confirm command renders (asks for what to change).
2. Type `/st` → autocomplete should suggest `/staffreview`. Invoke with no args (or test path).
3. Type `/tr` → autocomplete should suggest `/triple-review`. Invoke with `--help` or no args.
4. Type `/gsd` → autocomplete should suggest multiple `gsd-*` commands (gsd-help, gsd-plan-phase, etc.).

For each: note PASS or FAIL.

- [ ] **Step 5: Decision gate**

If Step 3 frontmatter check passed AND all Step 4 interactive checks PASS: proceed to Task 22.
If Step 3 failed: fix frontmatter first.
If Step 3 passed but Step 4 failed (file structure OK but command doesn't fire): halt before commit. May need investigation into gsd-redux's command registration mechanism — frontmatter is well-formed but registration isn't picking it up.

---

## Task 22: Phase A atomic commit

**Files:**
- Modify (git only): `chore/gsd-redux-migration` branch HEAD

- [ ] **Step 1: Stage all migration outcomes**

```powershell
cd "D:\Claude\Product Manager\product_master"
git add .claude/get-shit-done/ .claude/agents/ .claude/hooks/ .claude/gsd-local-patches/
```

- [ ] **Step 2: Verify what's staged**

```powershell
git status
```
Expected: changes staged in `.claude/get-shit-done/`, `.claude/agents/`, `.claude/hooks/`, `.claude/gsd-local-patches/`. Nothing in `commands/` (Cohort 3 untouched).

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(gsd): phase A — install gsd-redux@1.0.0, re-apply 11 patches

- Installed @opengsd/get-shit-done-redux@1.0.0 via npx
- Re-applied 11 customisation patches against new baseline
- All 15 customisation grep checks pass
- All custom commands invocable in Claude Code
- Backup 1 retained at KEEP-pre-redux-<timestamp>/"
```
Replace `<timestamp>` with the actual value from `.last-backup1-ts` file.

- [ ] **Step 4: Verify commit landed**

```powershell
git log -1 --oneline
```
Expected: latest commit is the chore(gsd) phase A commit. This is your first meaningful rollback point.

---

# Phase B — Audit updateGSD via 1.0.0→1.1.0 Upgrade

## Task 23: updateGSD lookup-table audit

**Files:**
- Read-only verify: paths from updateGSD.md's Step 2 lookup table
- Create: `C:\Users\Irfan\.claude\backups\updategsd-lookup-audit.log`

- [ ] **Step 1: Run path-existence check**

```powershell
$LOG = "C:\Users\Irfan\.claude\backups\updategsd-lookup-audit.log"
"=== updateGSD lookup-table audit against gsd-redux@1.0.0 ===" | Out-File $LOG

$paths = @(
  "C:\Users\Irfan\.claude\get-shit-done\workflows\execute-phase.md",
  "C:\Users\Irfan\.claude\get-shit-done\workflows\plan-phase.md",
  "C:\Users\Irfan\.claude\get-shit-done\workflows\quick.md",
  "C:\Users\Irfan\.claude\commands\gsd\debug.md",
  "C:\Users\Irfan\.claude\commands\gsd\update.md",
  "C:\Users\Irfan\.claude\commands\gsd\verify-work.md",
  "C:\Users\Irfan\.claude\commands\gsd\new-milestone.md",
  "C:\Users\Irfan\.claude\get-shit-done\references\ui-brand.md",
  "C:\Users\Irfan\.claude\get-shit-done\workflows\help.md"
)
foreach ($p in $paths) {
  if (Test-Path $p) { "OK: $p" | Tee-Object -FilePath $LOG -Append }
  else { "MISSING: $p" | Tee-Object -FilePath $LOG -Append }
}
```

- [ ] **Step 2: Inspect log for MISSING lines**

Open `C:\Users\Irfan\.claude\backups\updategsd-lookup-audit.log`. Expect several `MISSING` lines for `.claude/commands/gsd/*.md` paths — these were already wrong in v1.41.0 (pre-existing drift, in-scope to fix in Task 27).

Record each MISSING path for Task 27 self-fix consideration.

- [ ] **Step 3: Determine if drift is structural or pre-existing**

For each MISSING path, ask:
- Was this missing BEFORE the migration? (Check Backup 1.) → pre-existing drift, fix in Task 27.
- Is this missing only AFTER gsd-redux installed? → new drift introduced by gsd-redux, also fix in Task 27.

Either way, the fix routes to Task 27. Continue.

---

## Task 24: updateGSD e2e smoke test

**Files:**
- Temporary modify: `C:\Users\Irfan\.claude\get-shit-done\workflows\debug.md` (HACK-test marker, reverted after)

- [ ] **Step 1: Invoke updateGSD with a no-op test patch**

In Claude Code, run:
```
/updateGSD add a temporary marker comment "<!-- HACK-test-2026-05-25 -->" to the top of debug.md right after the frontmatter close --- line
```

- [ ] **Step 2: Observe the 4-stage flow**

Note whether each stage completes:
- Stage A (Find): does updateGSD locate `debug.md`? If lookup table is stale, this may fail.
- Stage B (Edit): does Edit tool apply cleanly?
- Stage C (Verify): does grep find the marker?
- Stage D (PATCHES.md): does it write a new patch entry?

Capture which stages passed/failed.

- [ ] **Step 3: If e2e succeeded — revert the marker**

```bash
# Manually edit debug.md to remove the HACK-test-2026-05-25 marker comment.
# Use Edit tool with old_string = the line containing the marker, new_string = empty (or the previous content).
```

Also remove the PATCHES.md entry that updateGSD added for this test patch — it shouldn't pollute the manifest.

- [ ] **Step 4: If e2e failed — note failure mode**

Record which stage failed. Common modes:
- Stage A failed → lookup table stale (Task 27 territory)
- Stage B failed → Edit can't apply (likely two-layer assumption broken or anchor mismatch)
- Stage C failed → grep verify regex doesn't match
- Stage D failed → PATCHES.md write failed (permissions? format change?)

Do NOT proceed to Task 26 (1.1.0 install) if updateGSD failed catastrophically — fix updateGSD first (Task 27) before relying on it for Phase B re-applies.

---

## Task 25: Phase B audit commit

**Files:**
- Modify (git only): `chore/gsd-redux-migration`

- [ ] **Step 1: Stage audit outputs**

```powershell
cd "D:\Claude\Product Manager\product_master"
# If any PATCHES.md changes happened during smoke test cleanup:
git add .claude/gsd-local-patches/
```

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "chore(gsd): phase B audit — updateGSD lookup + e2e smoke against 1.0.0

- Audited updateGSD's 11 lookup-table entries against gsd-redux@1.0.0
- Catalogued pre-existing drift (.claude/commands/gsd/*.md paths)
- E2E smoke test: invoked /updateGSD with no-op marker patch, reverted after
- Smoke test result: <PASS or FAIL with mode>"
```

The `--allow-empty` flag lets the commit proceed even if no file changes were staged (the audit was read-only).

---

## Task 26: Backup 2 — Phase A patched state

**Files:**
- Create: `C:\Users\Irfan\.claude\backups\KEEP-phase-a-patched-<ts>\`

- [ ] **Step 1: Generate timestamp**

```powershell
$ts2 = Get-Date -Format "yyyyMMdd-HHmmss"
$ts2 | Out-File -FilePath "C:\Users\Irfan\.claude\backups\.last-backup2-ts" -Encoding ASCII
Write-Host "Backup 2 timestamp: $ts2"
```

- [ ] **Step 2: Create backup directory and run robocopy**

```powershell
$backup2 = "C:\Users\Irfan\.claude\backups\KEEP-phase-a-patched-$ts2"
mkdir -Force $backup2 | Out-Null
robocopy "C:\Users\Irfan\.claude" $backup2 /MIR /R:0 /W:0 /XD backups .cache /TEE /LOG:"$backup2\robocopy.log"
```

- [ ] **Step 3: Verify file count**

```powershell
$srcCount = (Get-ChildItem "C:\Users\Irfan\.claude\get-shit-done" -Recurse -File).Count
$bakCount = (Get-ChildItem "$backup2\get-shit-done" -Recurse -File).Count
Write-Host "Source: $srcCount, Backup 2: $bakCount"
if ($srcCount -ne $bakCount) { Write-Error "Backup 2 file count mismatch." }
```

- [ ] **Step 4: Verify a patched file copied correctly**

```powershell
fc /B "C:\Users\Irfan\.claude\get-shit-done\workflows\spec-phase.md" `
      "$backup2\get-shit-done\workflows\spec-phase.md"
```
Expected: no differences (exit 0).

Also confirm patch survived in backup:
```bash
grep -c "Step 2.5: Graph Blast Radius Scout" "$backup2/get-shit-done/workflows/spec-phase.md"
```
Expected: 1.

---

## Task 27: Install gsd-redux@1.1.0

**Files:**
- Modify (via installer): `C:\Users\Irfan\.claude\get-shit-done\` (overwritten)
- Modify (via installer): `C:\Users\Irfan\.claude\skills\gsd-*\SKILL.md`
- Modify (via installer): `C:\Users\Irfan\.claude\agents\gsd-*.md`

- [ ] **Step 1: Run upgrade installer**

```powershell
cd C:\Users\Irfan
npx @opengsd/get-shit-done-redux@1.1.0 --claude --global --profile=full 2>&1 | Tee-Object -FilePath "C:\Users\Irfan\.claude\backups\install-110.log"
```

- [ ] **Step 2: Verify exit code**

```powershell
if ($LASTEXITCODE -ne 0) { Write-Error "1.1.0 installer failed. Review install-110.log." }
```

- [ ] **Step 3: Smoke test new install**

```powershell
$gsdToolsPath = Get-Content "C:\Users\Irfan\.claude\backups\.gsd-tools-path" -Raw
node $gsdToolsPath.Trim() --version
```
Expected: prints a version string. If the binary path resolved in Task 5 no longer exists, re-discover via Task 5 logic.

---

## Task 28: Diff classification vs Backup 2

**Files:**
- Read-only compare: 11 patched files vs Backup 2 equivalents
- Create: `C:\Users\Irfan\.claude\backups\diff-classification.log`

- [ ] **Step 1: Per-file diff**

```powershell
$ts2 = (Get-Content "C:\Users\Irfan\.claude\backups\.last-backup2-ts" -Raw).Trim()
$backup2 = "C:\Users\Irfan\.claude\backups\KEEP-phase-a-patched-$ts2"
$LOG = "C:\Users\Irfan\.claude\backups\diff-classification.log"

$patchedFiles = @(
  @{ path = "get-shit-done\workflows\plan-phase.md"; verify = "staffreview" },
  @{ path = "get-shit-done\workflows\execute-phase.md"; verify = "triple_review_gate|quad_review" },
  @{ path = "get-shit-done\workflows\spec-phase.md"; verify = "Step 6.5: Charter Removals" },
  @{ path = "get-shit-done\workflows\discuss-phase.md"; verify = "scout_graph_blast_radius" },
  @{ path = "get-shit-done\workflows\quick.md"; verify = "Step 6.3" },
  @{ path = "get-shit-done\workflows\debug.md"; verify = "Quality Gates" },
  @{ path = "get-shit-done\bin\lib\model-profiles.cjs"; verify = "gsd-debugger" },
  @{ path = "agents\gsd-phase-researcher.md"; verify = "blast_radius_awareness" }
)

"=== Diff classification: gsd-redux@1.1.0 vs Backup 2 (Phase A patched) ===" | Out-File $LOG

foreach ($f in $patchedFiles) {
  $current = "C:\Users\Irfan\.claude\$($f.path)"
  $backup = "$backup2\$($f.path)"
  if (-not (Test-Path $current)) { "DELETED-BY-1.1.0: $($f.path)" | Tee-Object -FilePath $LOG -Append; continue }
  if (-not (Test-Path $backup)) { "BACKUP-MISSING: $($f.path)" | Tee-Object -FilePath $LOG -Append; continue }

  fc /B $current $backup > $null
  $byteDiffers = ($LASTEXITCODE -ne 0)
  $verifyMatch = (Select-String -Path $current -Pattern $f.verify -Quiet)

  $verdict = ""
  if (-not $byteDiffers -and $verifyMatch) { $verdict = "UNCHANGED" }
  elseif ($byteDiffers -and $verifyMatch) { $verdict = "EVOLVED" }
  elseif ($byteDiffers -and -not $verifyMatch) { $verdict = "OVERWRITTEN" }
  else { $verdict = "IMPOSSIBLE" }

  "$verdict : $($f.path)" | Tee-Object -FilePath $LOG -Append
}
```

- [ ] **Step 2: Inspect classification log**

```powershell
cat "C:\Users\Irfan\.claude\backups\diff-classification.log"
```

For each file's verdict:
- UNCHANGED: 1.1.0 left it alone, no action.
- EVOLVED: 1.1.0 changed the file but the patch's verify pattern still matches. Inspect manually — patch may have survived in a new location.
- OVERWRITTEN: 1.1.0 wiped the patch. Queue for Task 29 re-apply.
- DELETED-BY-1.1.0: file removed by upgrade. Patch can't be re-applied. Document as RETIRED or find new home.
- IMPOSSIBLE: Backup 2 was corrupt. STOP.

- [ ] **Step 3: Build the re-apply queue**

List all OVERWRITTEN files from the log. These are the inputs to Task 29.

---

## Task 29: Re-apply OVERWRITTEN patches via /updateGSD

**Files:**
- Modify (via /updateGSD): each OVERWRITTEN file from Task 28

This task runs once per OVERWRITTEN file. If no files are OVERWRITTEN, skip to Task 31.

- [ ] **Step 1: For each OVERWRITTEN file, invoke /updateGSD**

In Claude Code:
```
/updateGSD re-apply Patch <N> from .claude/gsd-local-patches/PATCHES.md against the post-1.1.0 install of <file path>
```

Replace `<N>` with the Patch number from PATCHES.md and `<file path>` with the OVERWRITTEN file.

- [ ] **Step 2: Observe outcome per invocation**

For each /updateGSD invocation:
- SUCCESS: PATCHES.md updated, verify grep passes → next file
- FAILURE: note failure mode (stage A/B/C/D from Task 24's classification) → Task 30 self-fix territory

- [ ] **Step 3: Track outcomes**

Keep a simple list:
```
Patch 1 (plan-phase.md): SUCCESS
Patch 2 (execute-phase.md): FAILED — stage A (lookup table missing)
...
```

- [ ] **Step 4: Decision gate**

If all /updateGSD invocations SUCCEEDED, skip to Task 31.
If any FAILED, proceed to Task 30.

---

## Task 30: Phase B re-apply commit (conditional)

**Files:**
- Modify (git only): `chore/gsd-redux-migration`

Run this task ONLY if Task 29 made changes. Otherwise skip.

- [ ] **Step 1: Stage changes**

```powershell
cd "D:\Claude\Product Manager\product_master"
git add .claude/get-shit-done/ .claude/agents/ .claude/gsd-local-patches/
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(gsd): phase B re-apply — N patches re-applied to gsd-redux@1.1.0

- After 1.0.0 → 1.1.0 upgrade, N of 11 patches needed re-application
- Re-applied via /updateGSD against the 1.1.0 baseline
- PATCHES.md updated with re-apply log"
```
Replace `N` with the actual count of re-applies.

---

## Task 31: Self-fix updateGSD bootstrap (conditional)

**Files:**
- Modify: `D:\Claude\Product Manager\product_master\.claude\commands\updateGSD.md`
- Modify: `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md`

Run this task ONLY if /updateGSD FAILED in Task 29 OR if Task 23 catalogued drift that needs fixing.

- [ ] **Step 1: Diagnose failure**

Identify the failure class:
- **Stale lookup table**: updateGSD's Step 2 table references files that don't exist. Note which rows.
- **Two-layer assumption broken**: `.claude/commands/gsd/*.md` doesn't exist as separate from `workflows/*.md` in gsd-redux. The patch needs to skip the two-layer check.
- **Step-naming convention drift**: gsd-redux uses different step names (e.g., `<gate>` instead of `<step>`).

- [ ] **Step 2: Hand-edit updateGSD.md**

Open `D:\Claude\Product Manager\product_master\.claude\commands\updateGSD.md` directly. Apply the fix using the `Edit` tool. Examples:

For stale lookup table — update the keyword-to-file mappings table to reflect actual gsd-redux paths:
```
| Keyword in intent | Candidate files |
|-------------------|----------------|
| "execute-phase", "execute phase" | `.claude/get-shit-done/workflows/execute-phase.md` |
... (corrected paths)
```

For two-layer assumption — update the section "Parameter consistency rule" to say "Check both command file and workflow file IF both exist; gsd-redux may have collapsed these."

- [ ] **Step 3: Document as Patch 8 in PATCHES.md** (sequential numbering — Patches 6 + 7 are taken by Task 1.5's RETIRES.md + Opus override)

Add a new Patch entry to `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md`, AFTER Patch 7:

```markdown
## Patch 8: updateGSD.md — lookup table + scope correction for gsd-redux 1.1.0

**File:** `.claude/commands/updateGSD.md`
**Purpose:** Pre-existing lookup-table drift (`.claude/commands/gsd/*.md` paths that never existed in any GSD install) + post-1.1.0 corrections discovered during Phase B audit. Without these fixes, /updateGSD cannot locate target files for patch application.
**Insertion anchor:** Step 2 lookup table + Parameter consistency rule
**Dependencies:**
- gsd-redux@1.1.0 file layout

**Content:**
(Summary of what was changed — specifics depend on diagnosis in Step 1)

**Verification:**
```bash
grep -c "<key_phrase_from_fix>" .claude/commands/updateGSD.md
# Expected: >= 1
```
```

Fill in actual content and verification per your specific fix.

- [ ] **Step 4: Retry failed /updateGSD invocation**

```
/updateGSD re-apply Patch <N> from .claude/gsd-local-patches/PATCHES.md against the post-1.1.0 install of <file path>
```

Verify it now succeeds.

- [ ] **Step 5: Commit self-fix**

```powershell
cd "D:\Claude\Product Manager\product_master"
git add .claude/commands/updateGSD.md .claude/gsd-local-patches/PATCHES.md
```
```bash
git commit -m "chore(gsd): phase B self-fix — Patch 8 corrects updateGSD for gsd-redux

- updateGSD failed against gsd-redux 1.1.0 due to <specific issue>
- Bootstrap hand-edit applied to commands/updateGSD.md
- Documented as Patch 8 in PATCHES.md
- Retried /updateGSD against failed patches — now succeeds"
```

---

## Task 32: Final acceptance — full grep battery against 1.1.0

**Files:**
- Read-only verify: all patched files at user + project level

- [ ] **Step 1: Run full user-level grep battery**

Same commands as Task 20 Step 1, but now against the 1.1.0-installed tree:
```bash
grep -c "staffreview" C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md             # expect >= 4
grep -c "triple_review_gate\|quad_review" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # expect >= 1
grep -c "document_and_merge_gate" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md         # expect == 1
grep -c "Step 6.5: Charter Removals (RETIRES.md)" C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md  # expect == 1
grep -c "Route the COMPLETE tiered list" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md   # expect >= 1
grep -c "Step 6.3.*[Qq]uad" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md            # expect >= 1
grep -c "Step 6.4.*[Ss]implify" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md        # expect >= 1
grep -c "Quality Gates" C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md                # expect >= 1
grep -c "Document and Merge" C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md           # expect >= 1
grep -c "Step 2.5: Graph Blast Radius Scout" C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md   # expect == 1
grep -c "scout_graph_blast_radius" C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md         # expect >= 2
grep -c "### Blast Radius" C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md     # expect >= 2
grep -c "blast_radius_awareness" C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md         # expect == 2
grep -c "fan_in >= 10" C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md                   # expect == 1
```

- [ ] **Step 2: Run project-level grep battery**

Same commands with `D:/Claude/Product Manager/product_master/.claude/` paths.

- [ ] **Step 3: PATCHES.md integrity check**

```bash
grep -c "^## Patch [1-7]:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"
# Expected: == 7 (Patches 1–5 original + Patch 6 RETIRES.md + Patch 7 Opus override added by Task 1.5)

grep -c "^## Patch [1-3]:" "C:/Users/Irfan/.claude/gsd-local-patches/PATCHES.md"
# Expected: == 3

grep -c "^## Patch 8:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"
# Expected: 0 or 1 (1 if Task 31 self-fix ran)

grep -c "## Patch Reapplication History" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"
# Expected: == 1
```

- [ ] **Step 4: Decision gate**

All checks pass → proceed to Task 33. Any fail → diagnose or Rollback C (Backup 2).

---

## Task 33: Final acceptance — workflow dry-run scenarios

**Files:**
- Read-only: GSD workflow files (test invocations only)

Create test phase 999 if it doesn't exist (one-time setup). Then run all 4 scenarios.

- [ ] **Step 1: Scenario 1 — Plan-phase staffreview gate**

In Claude Code:
```
/gsd-plan-phase 999
```
Expected: At step 12.5 (or the renumbered equivalent), workflow prompts to invoke Skill(skill="staffreview").

Abort the run after observing the prompt. Note: PASS if staffreview prompt appears, FAIL if it doesn't.

- [ ] **Step 2: Scenario 2 — Spec-phase RETIRES.md generation**

In Claude Code, with test phase 999:
```
/gsd-spec-phase 999
```
Provide a hint about retiring/deprecating something. Expected: at Step 6.5, workflow generates `999-RETIRES.md` file.

Verify:
```powershell
Test-Path "D:\Claude\Product Manager\product_master\.planning\phases\999-*\999-RETIRES.md"
```
Expected: True (or the file exists in whatever phase directory layout the project uses).

- [ ] **Step 3: Scenario 3 — Execute-phase gates**

In Claude Code:
```
/gsd-execute-phase 999
```
Expected: Workflow output mentions `quad_review` AND `document_and_merge_gate` step names in its execution log.

Abort before any real changes commit.

- [ ] **Step 4: Scenario 4 — Opus for gsd-debugger**

In Claude Code:
```
/gsd-debug
```
Trigger a debug session. Inspect the spawned debugger agent's model selection. Expected: model resolves to `opus`.

If Task 14 was Case D/E (Opus override RETIRED), this scenario is expected to FAIL — that's documented in PATCHES.md. Mark as RETIRED-expected.

- [ ] **Step 5: Record results**

For each scenario: PASS / FAIL / RETIRED-expected. All 4 should be PASS or RETIRED-expected for migration to be declared complete.

---

## Task 34: Final acceptance — mirror parity

**Files:**
- Read-only compare: 8 patched files at user vs project level

- [ ] **Step 1: Compare each patched file**

```powershell
$patchedFiles = @(
  "get-shit-done\workflows\plan-phase.md",
  "get-shit-done\workflows\execute-phase.md",
  "get-shit-done\workflows\spec-phase.md",
  "get-shit-done\workflows\discuss-phase.md",
  "get-shit-done\workflows\quick.md",
  "get-shit-done\workflows\debug.md",
  "get-shit-done\bin\lib\model-profiles.cjs",
  "agents\gsd-phase-researcher.md"
)
foreach ($f in $patchedFiles) {
  $u = "C:\Users\Irfan\.claude\$f"
  $p = "D:\Claude\Product Manager\product_master\.claude\$f"
  fc /B $u $p > $null
  if ($LASTEXITCODE -ne 0) { Write-Host "DIFFERS: $f" } else { Write-Host "OK: $f" }
}
```

- [ ] **Step 2: Resolve any DIFFERS**

If a file DIFFERS, the project tree didn't get the post-1.1.0 patches. Re-run robocopy for that file:
```powershell
robocopy "C:\Users\Irfan\.claude\$dir" "D:\Claude\Product Manager\product_master\.claude\$dir" $filename /R:0 /W:0
```
(Adjust `$dir` and `$filename` per the offending file.)

Re-verify the `fc /B` check.

---

## Task 35: Backup 3 — Final state snapshot

**Files:**
- Create: `C:\Users\Irfan\.claude\backups\KEEP-redux-110-final-<ts>\`

- [ ] **Step 1: Generate timestamp and create backup**

```powershell
$ts3 = Get-Date -Format "yyyyMMdd-HHmmss"
$backup3 = "C:\Users\Irfan\.claude\backups\KEEP-redux-110-final-$ts3"
mkdir -Force $backup3 | Out-Null
robocopy "C:\Users\Irfan\.claude" $backup3 /MIR /R:0 /W:0 /XD backups .cache /TEE /LOG:"$backup3\robocopy.log"
$ts3 | Out-File -FilePath "C:\Users\Irfan\.claude\backups\.last-backup3-ts" -Encoding ASCII
```

- [ ] **Step 2: Verify**

```powershell
$srcCount = (Get-ChildItem "C:\Users\Irfan\.claude\get-shit-done" -Recurse -File).Count
$bakCount = (Get-ChildItem "$backup3\get-shit-done" -Recurse -File).Count
Write-Host "Backup 3: source=$srcCount, backup=$bakCount"
```
Expected: counts match.

---

## Task 36: CHANGELOG.md update

**Files:**
- Modify: `D:\Claude\Product Manager\product_master\docs\CHANGELOG.md`

- [ ] **Step 1: Read existing CHANGELOG.md to find insertion point**

```powershell
cat "D:\Claude\Product Manager\product_master\docs\CHANGELOG.md" | Select-Object -First 50
```
Find the top of the file. The new entry goes at the top per Frollie convention (newest first).

- [ ] **Step 2: Add the migration entry**

Use Edit tool to insert at the top of the file (just below the title/header):

```markdown
## 2026-05-25 — GSD Redux Migration

**Migrated GSD development tooling from `get-shit-done-cc@1.41.0` (archived) to `@opengsd/get-shit-done-redux@1.1.0`.**

- Replaced unmaintained upstream package with the active fork at `@opengsd/get-shit-done-redux`.
- Re-applied 11 customisation patches against new baseline (5 workflow patches + 3 graphify patches + 2 code/agent patches + 1 cross-cutting rule). Full manifest in `.claude/gsd-local-patches/PATCHES.md`.
- Added Patch 6 (spec-phase RETIRES.md) and Patch 7 (gsd-debugger Opus override) to project PATCHES.md to formalise previously-undocumented customisations.
- Fixed pre-existing `updateGSD` lookup-table drift (Patch 8) if Task 31 ran.
- Verified compatibility via 15-customisation grep battery + 4-scenario workflow dry-run.
- Backups retained at `~/.claude/backups/KEEP-pre-redux-*` (v1.41.0 fallback) and `KEEP-redux-110-final-*` (new reference state).
```

- [ ] **Step 3: Verify entry landed**

```bash
grep -c "GSD Redux Migration" "D:/Claude/Product Manager/product_master/docs/CHANGELOG.md"
```
Expected: ≥ 1.

---

## Task 37: Final commit + merge to main

**Files:**
- Modify (git only): `chore/gsd-redux-migration` HEAD, then `main` HEAD

- [ ] **Step 1: Stage CHANGELOG + any final artifacts**

```powershell
cd "D:\Claude\Product Manager\product_master"
git add docs/CHANGELOG.md
```

- [ ] **Step 2: Final commit on chore branch**

```bash
git commit -m "chore(gsd): migration to @opengsd/get-shit-done-redux@1.1.0 complete

- Phase A: install + 11 patches re-applied (committed earlier)
- Phase B: audit + 1.1.0 upgrade + N re-applies + self-fix if any (committed earlier)
- Final: 15-customisation battery + workflow dry-run scenarios 1-4 passed
- CHANGELOG entry added
- Backups retained: KEEP-pre-redux-<ts>, KEEP-redux-110-final-<ts>"
```

- [ ] **Step 3: Push chore branch**

```powershell
git push origin chore/gsd-redux-migration
```

- [ ] **Step 4: Switch to main and merge**

```powershell
git switch main
git pull origin main
git merge --no-ff chore/gsd-redux-migration
git push origin main
```
Expected: clean merge (no conflicts). If conflicts arise, the migration overlapped with someone else's work — resolve manually.

- [ ] **Step 5: Restore the original stashed work**

```powershell
$origStashTag = (Get-Content "C:\Users\Irfan\.claude\backups\.last-migration-stash-tag" -Raw).Trim()
$stashList = git stash list
$stashIndex = ($stashList | Select-String -SimpleMatch $origStashTag | Select-Object -First 1) -replace 'stash@\{(\d+)\}:.*','$1'
if ($stashIndex) {
  git stash pop "stash@{$stashIndex}"
  Write-Host "Restored pre-migration stash: $origStashTag"
} else {
  Write-Warning "Could not locate pre-migration stash by tag '$origStashTag'. Inspect 'git stash list' manually:"
  git stash list
}
```

- [ ] **Step 6: Switch back to original branch (read from file persisted in Task 2)**

```powershell
$origBranch = (Get-Content "C:\Users\Irfan\.claude\backups\.last-origin-branch" -Raw -ErrorAction SilentlyContinue).Trim()
if (-not $origBranch) {
  Write-Error "Original branch not captured (file .last-origin-branch missing or empty). Run 'git branch' to confirm where you should land before continuing."
  exit 1
}
Write-Host "Returning to pre-migration branch: $origBranch"
git switch $origBranch
git status   # confirm clean tree on original branch (the stash pop in Step 5 restored uncommitted work)
```

---

## Post-Migration

After Task 37, migration is complete. Optional follow-ups:

- Open a fresh Claude Code session and verify all custom commands still autocomplete + invoke.
- Try `/updateGSD` with a real customisation request to confirm end-to-end against 1.1.0.
- After ~1 week of using the new install in real work, delete Backup 2 (`KEEP-phase-a-patched-*`) to save ~200 MB. Keep Backups 1 and 3 indefinitely.

---

## Self-Review Notes

**Spec coverage check** — every section of the spec maps to one or more tasks:

| Spec section | Covered by tasks |
|---|---|
| Pre-flight | Task 1, 1.5 (new — patch-manifest reconciliation), 2 |
| Backup 1 | Task 3 |
| Rollback A dry-run (new — Improvement #6) | Task 3.5 |
| Install 1.0.0 | Task 4 |
| Binary path discovery | Task 5 |
| Anchor verification | Task 6 |
| Refresh pristine | Task 7 |
| Apply 11 patches | Tasks 8–15 |
| Cohort 3 verify | Task 16 |
| Pre-mirror diff | Task 17 |
| Mirror sync | Task 18 |
| Settings.json reconcile | Task 19 |
| Phase A green-gate | Tasks 20, 21 |
| Phase A commit | Task 22 |
| updateGSD audit | Task 23 |
| updateGSD smoke test | Task 24 |
| Phase B audit commit | Task 25 |
| Backup 2 | Task 26 |
| Install 1.1.0 | Task 27 |
| Diff classification | Task 28 |
| Re-apply via /updateGSD | Task 29 |
| Phase B re-apply commit | Task 30 |
| Self-fix bootstrap | Task 31 |
| Final acceptance grep | Task 32 |
| Workflow dry-run | Task 33 |
| Mirror parity | Task 34 |
| Backup 3 | Task 35 |
| CHANGELOG | Task 36 |
| Final commit + merge | Task 37 |

**Placeholder scan:** Verified no TBDs, no "TODO: implement", no "similar to Task N." All grep commands are exact. All file paths are absolute. The model-profiles patch (Task 14) has a decision tree rather than vague "adapt as needed" — each case has a concrete action. Cases D/E include explicit `AskUserQuestion` pauses to prevent silent regression on MEMORY.md user preferences.

**Type consistency:** PowerShell variable names consistent across tasks (`$ts1/2/3` for backup timestamps, `$gsdToolsPath` for resolved binary path, `$origStashTag` for stash identifier, `$origBranch` for original branch). **All session-state values are persisted to files** so the migration survives PowerShell session restarts (`.last-backup1-ts`, `.last-backup2-ts`, `.last-backup3-ts`, `.gsd-tools-path`, `.last-migration-stash-tag`, `.last-origin-branch`). Backup directory naming consistent (`KEEP-<purpose>-<ts>/`). Patch-number cross-reference table (top of plan, between File Map and Phase A) disambiguates Customisation numbers (#1–#15) from PATCHES.md Patch numbers (Project 1–7, plus 8 if Task 31 runs; User 1–3).

**Conditional tasks marked:** Task 30 ("only if Task 29 made changes"), Task 31 ("only if Task 29 had failures"). Task 1.5 is **mandatory** (adds Patch 6 + Patch 7 entries that Tasks 10 and 14 depend on). Task 3.5 is **mandatory** (proves Rollback A works while the operator is fresh).

**Time budget:** Phase A ~145 min (Tasks 1–22 with new Tasks 1.5 + 3.5 adding ~15 min). Phase B ~110 min (Tasks 23–37). Total ~5 hours expected, including padding for diagnosis. Can be split: Task 22 (Phase A atomic commit) is a meaningful resume point. Estimate may extend 30–60% if Task 14 hits Cases B/C/D/E, Task 29 has failures requiring Task 31 self-fix, or Task 17 surfaces multiple INSPECT-CRITICAL files.

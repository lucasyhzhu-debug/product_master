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
| `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md` | Updated with Patch 16 if Phase B Task 27 runs | User-owned |
| `D:\Claude\Product Manager\product_master\docs\CHANGELOG.md` | One-line entry added in Task 32 | Project doc |
| `C:\Users\Irfan\.claude\backups\KEEP-pre-redux-<ts>\` | Created in Task 3 | Backup 1 |
| `C:\Users\Irfan\.claude\backups\KEEP-phase-a-patched-<ts>\` | Created in Phase B Task 22 | Backup 2 |
| `C:\Users\Irfan\.claude\backups\KEEP-redux-110-final-<ts>\` | Created in Task 31 | Backup 3 |

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
Expected:
- Project PATCHES.md: 5 (Patches 1–5 covering customisations #1–#11)
- User PATCHES.md: 3 (Patches 1–3 covering customisations #12–#14)

If counts are lower, STOP. Document the missing patches before proceeding.

---

## Task 2: Git state setup (stash + create chore branch)

**Files:**
- Modify (git only): `D:\Claude\Product Manager\product_master\` working tree
- Create: `C:\Users\Irfan\.claude\backups\.last-migration-stash-tag`

- [ ] **Step 1: Change to project root**

```powershell
cd "D:\Claude\Product Manager\product_master"
```

- [ ] **Step 2: Capture current branch**

```powershell
$origBranch = (git branch --show-current).Trim()
Write-Host "Migration starting from branch: $origBranch"
```
Expected output: `Migration starting from branch: fix/bigseller-jwt-expiry-detection` (or whatever branch is current).

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

## Task 8: Apply Patch — plan-phase.md (Customisation #1)

**Files:**
- Modify: `C:\Users\Irfan\.claude\get-shit-done\workflows\plan-phase.md`

- [ ] **Step 1: Read PATCHES.md to get Patch content**

Open `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md` and locate the entry for Customisation #1 (staffreview gate). Note the *Insertion anchor* and *Content* fields.

- [ ] **Step 2: Re-verify anchor in fresh 1.0.0 file**

```bash
grep -n "Step 12.5\|staffreview" "C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md"
```
If matches found, note line numbers. If no matches, the anchor moved — refer to Task 6 Step 2 for re-anchoring procedure.

- [ ] **Step 3: Apply the patch using Edit tool**

Use the `Edit` tool (in Claude Code) to insert the patch content at the located anchor. The patch from PATCHES.md contains the new step block (Step 12.5 staffreview gate) — copy it verbatim.

The Edit tool's `old_string` should be the lines IMMEDIATELY preceding where the new step goes (e.g., the end of Step 12). The `new_string` should be those same lines PLUS the new Step 12.5 block.

- [ ] **Step 4: Verify patch landed**

```bash
grep -c "staffreview" "C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md"
```
Expected: ≥ 4 matches (Step 12.5 references staffreview multiple times).

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

- [ ] **Step 1: Apply Patch — Step 6.5 RETIRES.md (Customisation #4)**

Anchor: between `Step 6: Generate SPEC.md` and `Step 7: Commit`. Verify both exist:
```bash
grep -n "Step 6: Generate SPEC.md\|Step 7: Commit" "C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md"
```
Apply via Edit tool per PATCHES.md content.

Verify:
```bash
grep -c "Step 6.5: Charter Removals (RETIRES.md)" "C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md"
```
Expected: 1.

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

## Task 14: Apply Cohort 2 patch — model-profiles.cjs (Customisation #5)

**Files:**
- Modify (decision tree below): `C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.cjs` OR equivalent

This task has a decision tree because the new fork may have restructured model resolution.

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
- Use Edit tool to insert: `'gsd-debugger': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet', adaptive: 'opus' }`

**Case B — Same file, different structure (e.g., JSON)**:
- Adapt patch content to JSON format
- Update PATCHES.md Patch 5's *Content* field to reflect the new structure
- Apply via Edit tool

**Case C — Different file path, recognisable model-profiles concept**:
- Apply equivalent override at the new location
- Update PATCHES.md Patch 5's *File:* field to the new path

**Case D — Model resolution mechanism removed**:
- Document Patch 5 as RETIRED in PATCHES.md with an explanation
- Skip the Opus override (gsd-debugger will use default model)
- Move to Step 4 (this task ends without an actual edit)

**Case E — `gsd-debugger` agent name doesn't exist**:
- Same as Case D — document RETIRED and skip

- [ ] **Step 3: Apply override (if applicable)**

For Cases A/B/C, use Edit tool to apply the override.

- [ ] **Step 4: Verify (Cases A/B/C only)**

```bash
grep "gsd-debugger" "C:/Users/Irfan/.claude/get-shit-done/bin/lib/model-profiles.cjs" 2>&1
# OR for Case C, the new path:
# grep "gsd-debugger" "C:/Users/Irfan/.claude/get-shit-done/config/models.json"
```
Expected: 1 match showing the gsd-debugger entry.

For Case D/E, verify PATCHES.md has the RETIRED note:
```bash
grep -A2 "Patch 5" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md" | grep -i "retired"
```

- [ ] **Step 5: Document in PATCHES.md (Cases B/C/D/E)**

For Cases B, C, D, or E, update PATCHES.md Patch 5's Content section to reflect the new state. This keeps the patch manifest accurate for future updates.

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

- [ ] **Step 3: Decision gate**

If WARNING lines appeared, decide:
- These are files I want to preserve → restore them after Task 18's mirror by copying from Backup 1's project tree
- These are obsolete → let Task 18 delete them (acceptable)
- Unclear → halt and inspect before continuing

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

- [ ] **Step 3: Command invocability in Claude Code**

Open Claude Code in the project directory. Test each:
1. Type `/up` → autocomplete should suggest `/updateGSD`. Press Tab. Invoke with no args. Confirm command renders (asks for what to change).
2. Type `/st` → autocomplete should suggest `/staffreview`. Invoke with no args (or test path).
3. Type `/tr` → autocomplete should suggest `/triple-review`. Invoke with `--help` or no args.
4. Type `/gsd` → autocomplete should suggest multiple `gsd-*` commands (gsd-help, gsd-plan-phase, etc.).

For each: note PASS or FAIL.

- [ ] **Step 4: Decision gate**

If any command isn't autocomplete-suggested OR doesn't render when invoked: halt before commit. The file exists (per Task 16) but isn't registered with Claude Code's command system. May need investigation into gsd-redux's command registration mechanism.

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

- [ ] **Step 3: Document as Patch 16 in PATCHES.md**

Add a new Patch entry to `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md`:

```markdown
## Patch 16: updateGSD.md — lookup table + scope correction for gsd-redux 1.1.0

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
git commit -m "chore(gsd): phase B self-fix — Patch 16 corrects updateGSD for gsd-redux

- updateGSD failed against gsd-redux 1.1.0 due to <specific issue>
- Bootstrap hand-edit applied to commands/updateGSD.md
- Documented as Patch 16 in PATCHES.md
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
grep -c "^## Patch [1-5]:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"
# Expected: == 5

grep -c "^## Patch [1-3]:" "C:/Users/Irfan/.claude/gsd-local-patches/PATCHES.md"
# Expected: == 3

grep -c "^## Patch 16:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"
# Expected: 0 or 1 (1 if Task 31 ran)

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
- Fixed pre-existing `updateGSD` lookup-table drift (Patch 16) if Task 31 ran.
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

- [ ] **Step 6: Switch back to original branch**

```powershell
$origBranch = "fix/bigseller-jwt-expiry-detection"  # or whatever was captured in Task 2
git switch $origBranch
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
| Pre-flight | Task 1, 2 |
| Backup 1 | Task 3 |
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

**Placeholder scan:** Verified no TBDs, no "TODO: implement", no "similar to Task N." All grep commands are exact. All file paths are absolute. The model-profiles patch (Task 14) has a decision tree rather than vague "adapt as needed" — each case has a concrete action.

**Type consistency:** PowerShell variable names consistent across tasks (`$ts1`, `$ts2`, `$ts3` for backup timestamps; `$gsdToolsPath` for the resolved binary path; `$origStashTag` for the stash identifier). Backup directory naming consistent (`KEEP-<purpose>-<ts>/`). Patch number conventions consistent (Cohort 1 #1–#7, Cohort 2 #5, #12, Cohort 3 #8, #11, #15 — these reference the customisation numbers from the spec's manifest).

**Conditional tasks marked:** Task 30 ("only if Task 29 made changes"), Task 31 ("only if Task 29 had failures or Task 23 catalogued drift"). Operator/agent should skip these tasks if conditions aren't met — explicit in task headers.

**Time budget:** Phase A ~130 min (Tasks 1–22). Phase B ~110 min (Tasks 23–37). Total ~5 hours expected, including padding for diagnosis. Can be split: Task 22 (Phase A atomic commit) is a meaningful resume point.

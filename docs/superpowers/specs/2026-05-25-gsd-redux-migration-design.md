# GSD Redux Migration Design

| Field | Value |
|---|---|
| Date | 2026-05-25 |
| Status | Design v2 — staffreview Critical findings addressed; pending user approval to transition to writing-plans |
| Author | Lucas (via Claude Code brainstorming) |
| Supersedes | `C:\Users\Irfan\.claude\plans\sorted-mapping-sparkle.md` (initial plan, refined in brainstorming) |
| Revision history | v1 (2026-05-25): initial spec from brainstorming. v2 (2026-05-25): staffreview revision — addressed 4 Criticals (git state, binary path discovery, model-profiles decision tree, anchor verification) + 4 key Improvements (per-phase commits, pre-mirror diff check, settings regex fix, command-invocability check). See `docs/reviews/staffreview-gsd-redux-migration-design-2026-05-25.md` for the full review report. |

## Context

The currently-installed GSD package is `get-shit-done-cc@1.41.0`. Its upstream repository is archived: the original maintainer became unreachable in April 2026 and the project is no longer maintained. The active fork lives at `@opengsd/get-shit-done-redux` on npm (org: `open-gsd`). At time of writing, two versions are published: `1.0.0` (2026-05-22) and `1.1.0` (2026-05-24).

The migration is mechanically simple — `.planning/` artifacts are forward-compatible, skills install to the same `C:/Users/Irfan/.claude/` paths, and the installer auto-detects existing state. It is, however, high-risk for *this* install because **15 user customisations** sit on top of the GSD baseline (5 documented workflow patches + 3 graphify patches + 4 custom project commands + 2 code/agent patches + 1 cross-cutting tiered-findings routing rule). The new fork's installer has zero awareness of the `gsd-local-patches/` patch-management system (verified by reading all 11,468 lines of `bin/install.js` in the new fork's `main` branch). A naive `npx @opengsd/...` will silently revert every workflow gate baked into the user's process: staffreview-before-completion, triple/quad-review, document-and-merge sequencing, RETIRES.md generation, graphify blast-radius integrations, Opus-override for `gsd-debugger`, and the custom `triple-review`/`staffreview`/`updateGSD` commands.

A second, equally important goal: ensure `updateGSD` — the user's meta-skill that maintains all *other* customisations across GSD updates — continues to work against the gsd-redux baseline. updateGSD has hardcoded assumptions (file paths, filename conventions, two-layer command/workflow architecture, step-naming patterns) that may or may not hold in the fork. If updateGSD silently breaks, future customisations could fail to apply, succeed against the wrong file, or evade the PATCHES.md tracking that keeps customisations alive across future updates.

The intended outcome: a clean, reversible migration to `@opengsd/get-shit-done-redux@1.1.0` with all 15 customisations preserved AND verified updateGSD compatibility with the new fork, achieved through a two-phase plan that uses the 1.0.0→1.1.0 upgrade event itself as the real-world test of updateGSD's resilience.

## Customisation Manifest

The 15 things to preserve. Authoritative sources: `D:\Claude\Product Manager\product_master\.claude\gsd-local-patches\PATCHES.md` (project-tracked, #1–#11) and `C:\Users\Irfan\.claude\gsd-local-patches\PATCHES.md` (user-tracked, #12–#14).

| # | Customisation | Target file (post-install path) | Cohort |
|---|---|---|---|
| 1 | plan-phase Step 12.5 staffreview gate | `C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md` | 1 |
| 2 | execute-phase `triple_review_gate` | `C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md` | 1 |
| 3 | execute-phase `document_and_merge_gate` | `C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md` | 1 |
| 4 | spec-phase Step 6.5 RETIRES.md | `C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md` | 1 |
| 5 | gsd-debugger Opus model preference | `C:/Users/Irfan/.claude/get-shit-done/bin/lib/model-profiles.cjs` | 2 |
| 6 | execute-phase `quad_review` (folds code-review into triple-review) | `C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md` | 1 |
| 7 | Tiered findings routing rule (all tiers → fixer, no filter) | embedded across patches 1–4 | 1 |
| 8 | `triple-review.md` `--external-review=PATH` arg | `D:\...\product_master\.claude\commands\triple-review.md` | 3 |
| 9 | `quick.md` quad-review + simplify + doc-and-merge (`--full`) | `C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md` | 1 |
| 10 | `debug.md` Step 5 quality gates + Step 6 doc-and-merge | `C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md` | 1 |
| 11 | `updateGSD.md` parameter-consistency checks | `D:\...\product_master\.claude\commands\updateGSD.md` | 3 |
| 12 | `gsd-phase-researcher` `<blast_radius_awareness>` section | `C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md` | 2 |
| 13 | spec-phase Step 2.5 graph blast-radius scout | `C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md` | 1 |
| 14 | discuss-phase `scout_graph_blast_radius` + CONTEXT.md template | `C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md` | 1 |
| 15 | Custom `staffreview.md` command | `D:\...\product_master\.claude\commands\staffreview.md` | 3 |

**Cohorts:**
- **Cohort 1 (9 workflow patches):** files overwritten by installer — manual re-apply against new anchors
- **Cohort 2 (2 code/agent patches):** files overwritten — manual re-patch
- **Cohort 3 (4 custom project commands):** outside GSD install scope, should not be touched — verify untouched with `git status`

## Approach

**Two-phase migration** with the 1.0.0→1.1.0 upgrade as the load-bearing audit of updateGSD compatibility.

```
PHASE A — Get to a working gsd-redux@1.0.0 baseline (~100 min)
  A.1. Pre-flight (Node, disk, git, sessions)
  A.2. Backup 1 (whole-tree, both user + project, KEEP-pre-redux-<ts>/)
  A.3. Install gsd-redux@1.0.0 (--claude --global --profile=full)
  A.4. Refresh pristine baseline against new install
  A.5. Apply 11 patches (Cohort 1+2), verify Cohort 3 untouched
  A.6. Mirror sync user→project (robocopy /MIR get-shit-done/, agents/, hooks/)
  A.7. Settings.json reconciliation (9 hook refs each level)
  A.8. Phase A green-gate: 15-customisation grep battery + smoke tests
  ↓ pass-gate → Phase B; fail-gate → Rollback A

PHASE B — Audit updateGSD via real upgrade to 1.1.0 (~90 min)
  B.1. updateGSD lookup-table audit against 1.0.0 tree
  B.2. updateGSD e2e smoke test (trivial no-op patch, then revert)
  B.3. Backup 2 (whole-tree, KEEP-phase-a-patched-<ts>/)
  B.4. Install gsd-redux@1.1.0
  B.5. Diff vs Backup 2 — classify each patched file: UNCHANGED / OVERWRITTEN / EVOLVED
  B.6. Re-apply OVERWRITTEN patches via /updateGSD (the real audit moment)
  B.7. Self-fix gate: if /updateGSD fails, bootstrap-edit updateGSD.md by hand,
       document fix as Patch 16 in PATCHES.md, retry
  B.8. Final acceptance: 15-customisation battery + 4-scenario workflow dry-run +
       mirror parity + Backup 3 + commit chore branch + merge to main
```

**Rejected alternatives:**
- **Trust the installer's preserve logic:** no `gsd-local-patches/` awareness in installer code, would silently revert 11 patches.
- **Sandbox + diff approach:** v1.0.0-of-fork rewrite produces too much unrelated noise that drowns out real patch conflicts.

## Committed Defaults

These were brought to user attention and confirmed during brainstorming:

- **Version targets:** Pin `@1.0.0` for Phase A install, `@1.1.0` for Phase B step B.4 — never `@latest`.
- **Custom commands routing:** `staffreview.md` / `triple-review.md` / `updateGSD.md` stay project-scoped (current state).
- **Namespace auto-rewrites:** Accept any `/gsd:foo` → `/gsd-foo` rewrites the installer performs.
- **Mirror strategy:** Migrate both trees in lockstep. Mirror direction is user→project via `robocopy /MIR`.
- **Backup scope:** Whole-tree (~200 MB) for all three backups, not selective dirs — simpler mental model.
- **Test phase:** Permanent test phase number `999` for the 4 workflow dry-run scenarios.
- **CHANGELOG entry:** One-line dev-tooling note in `docs/CHANGELOG.md`.
- **Chore-branch fate:** Commit migration outcomes on `chore/gsd-redux-migration`, merge to main when verified.
- **Plans/ snapshot:** Included in backups (rollback can restore plan files).

## Detailed Steps

### Phase A — Step A.1: Pre-flight

| Check | Command | Expected |
|---|---|---|
| Node version | `node --version` | `≥ v22.0.0` (currently v24.13.0) |
| Disk space (C:) | `Get-PSDrive C` | ≥ 2 GB free |
| Disk space (D:) | `Get-PSDrive D` | ≥ 2 GB free |
| npm cache health | `npm cache verify` | No errors |
| Convex dev / watchers | manual check | All stopped |
| Claude Code sessions | task manager / verify | All closed before robocopy |

**Then explicit git state handling — do this BEFORE Backup 1:**

```powershell
cd "D:\Claude\Product Manager\product_master"

# Capture current branch for the audit trail:
$origBranch = (git branch --show-current).Trim()
Write-Host "Migration starting from branch: $origBranch"

# Stash with a uniquely-named message so Rollback A can find this exact stash:
$stashTag = "pre-redux-migration-$(Get-Date -Format yyyyMMdd-HHmmss)"
git stash push -u -m $stashTag
Write-Host "Stashed pre-migration work as: $stashTag"

# Save the stash tag to a known file for Rollback A:
$stashTag | Out-File -FilePath "C:\Users\Irfan\.claude\backups\.last-migration-stash-tag" -Encoding ASCII

# Verify clean tree:
git status   # MUST show: nothing to commit, working tree clean

# Create and switch to chore branch:
git switch -c chore/gsd-redux-migration
git status   # MUST show: clean tree on chore/gsd-redux-migration
```

**Pre-flight pass criteria:**
- `git status` returns "nothing to commit, working tree clean" on `chore/gsd-redux-migration`
- `.last-migration-stash-tag` file exists with the stash message inside

**If `git stash push` produces errors** (e.g., gitignored files conflicts, no changes to stash): diagnose before proceeding. Do not run migration from a partially-clean state.

### Phase A — Step A.2: Backup 1

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = "C:\Users\Irfan\.claude\backups\KEEP-pre-redux-$ts"
mkdir $backupRoot
robocopy "C:\Users\Irfan\.claude" $backupRoot /MIR /R:0 /W:0 /XD backups .cache /TEE /LOG:"$backupRoot\robocopy.log"

$backupRoot2 = "D:\Claude\Product Manager\product_master\.claude\backups\KEEP-pre-redux-$ts"
mkdir $backupRoot2
robocopy "D:\Claude\Product Manager\product_master\.claude" $backupRoot2 /MIR /R:0 /W:0 /XD backups .cache /TEE /LOG:"$backupRoot2\robocopy.log"
```

Verify file counts match. Robocopy log file is the audit trail.

### Phase A — Step A.3: Install 1.0.0

```powershell
cd C:\Users\Irfan
npx @opengsd/get-shit-done-redux@1.0.0 --claude --global --profile=full 2>&1 | Tee-Object -FilePath install-100.log
```

Watch stdout for "applied migration" lines from the installer migration framework. Capture log.

**Sub-step A.3.1 — Post-install binary path discovery:**

The migration assumes a binary at `~/.claude/get-shit-done/bin/gsd-tools.cjs`. The new fork may have renamed/restructured. Resolve actual paths and capture for later use:

```powershell
# Discover gsd-tools binary location:
$gsdToolsCandidates = @(
  "C:\Users\Irfan\.claude\get-shit-done\bin\gsd-tools.cjs",
  "C:\Users\Irfan\.claude\get-shit-done\bin\gsd-tools.js",
  "C:\Users\Irfan\.claude\get-shit-done\bin\gsd-tools.mjs",
  "C:\Users\Irfan\.claude\get-shit-done\bin\gsd-tools"
)
$gsdToolsPath = $gsdToolsCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $gsdToolsPath) {
  # Fallback: glob search
  $gsdToolsPath = (Get-ChildItem -Path "C:\Users\Irfan\.claude\get-shit-done\bin" -Filter "gsd-tools*" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
if (-not $gsdToolsPath) {
  Write-Error "gsd-tools binary NOT FOUND in C:\Users\Irfan\.claude\get-shit-done\bin\ — install may have failed or restructured. HALT."
  exit 1
}
Write-Host "gsd-tools resolved to: $gsdToolsPath"

# Also verify shell-resolvable shim:
where.exe gsd-tools  # may produce 0 or multiple lines — informational only

# Save path for subsequent steps to reference:
$gsdToolsPath | Out-File "C:\Users\Irfan\.claude\backups\.gsd-tools-path" -Encoding ASCII
```

**Sub-step A.3.2 — Anchor verification against fresh 1.0.0 install:**

Before applying patches in Step A.5, verify that the anchors PATCHES.md depends on actually exist in the freshly-installed 1.0.0 tree:

```bash
echo "=== Anchor verification against fresh 1.0.0 install ===" | Tee-Object -FilePath anchor-verification-1.0.0.log

# Critical anchors:
for anchor in \
  '<step name="code_review_gate">' \
  'verify_phase_goal' \
  'handle_partial_wave_execution' \
  'Step 6: Generate SPEC.md' \
  'Step 7: Commit' \
  'Step 12.5' \
  ; do
  echo "--- '$anchor' ---" | Tee-Object -FilePath anchor-verification-1.0.0.log -Append
  grep -rln "$anchor" "C:/Users/Irfan/.claude/get-shit-done/workflows/" 2>&1 | Tee-Object -FilePath anchor-verification-1.0.0.log -Append
done
```

**Pass criteria:** Every Critical anchor produces ≥1 file hit.

**Failure handling:**
- If `Step 12.5` is missing (likely — flagged as unverified): pause migration here. Open `~/.claude/get-shit-done/workflows/plan-phase.md` in the editor. Find the equivalent semantic location (the iteration-loop closure step that gates plan completion). Update PATCHES.md's Patch entry for Customisation #1 with the new anchor BEFORE Step A.5.
- If `code_review_gate` is missing: gsd-redux removed the code-review gate from execute-phase. Customisations #2 and #6 need rework — they patch into / replace this step. Halt and re-research.
- Other anchors missing: similar re-research; do not proceed to Step A.5 with unanchored patches.

Total elapsed time for sub-step A.3.2: ~5 min if all green; up to 30 min if a Critical anchor needs re-research.

### Phase A — Step A.4: Refresh pristine baseline

```powershell
# After 1.0.0 install, snapshot the NEW clean versions as the new pristine:
robocopy "C:\Users\Irfan\.claude\get-shit-done\workflows" `
         "C:\Users\Irfan\.claude\gsd-pristine\get-shit-done\workflows" `
         /MIR /R:0 /W:0

# Update backup-meta.json:
$meta = @{ from_version = "@opengsd/get-shit-done-redux@1.0.0"; backed_up_at = (Get-Date).ToString("o") } | ConvertTo-Json
Set-Content "C:\Users\Irfan\.claude\gsd-local-patches\backup-meta.json" $meta
```

### Phase A — Step A.5: Apply 11 patches

Per-patch loop (Cohort 1 + Cohort 2). For each patch in PATCHES.md:

```
1. Read patch's "Insertion anchor" + "Content" from PATCHES.md
2. Open target file (post-install 1.0.0 baseline)
3. grep for anchor literal:
   - Found exactly once → proceed to step 4
   - Found multiple times → re-anchor with tighter context
   - Not found → STOP. Re-research anchor location in 1.0.0.
4. Use Edit tool (NOT Write) for surgical insertion
5. Run patch's documented verification grep
6. If verify fails → diagnose, re-edit, re-verify
```

**Cohort 2 patch #5 sub-step — Explicit decision tree for model-profiles patch:**

The patch inserts a `'gsd-debugger': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet', adaptive: 'opus' }` entry into a model-profile configuration. The new fork may have restructured model resolution. Walk this tree:

```
1. Locate the model-profiles configuration in 1.0.0:
   ├── Test-Path "C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.cjs"
   ├── Test-Path "C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.js"
   ├── Test-Path "C:\Users\Irfan\.claude\get-shit-done\bin\lib\model-profiles.mjs"
   ├── Test-Path "C:\Users\Irfan\.claude\get-shit-done\config\models.json"
   ├── Test-Path "C:\Users\Irfan\.claude\get-shit-done\config\model-profiles.json"
   ├── grep -rln "gsd-debugger" "C:\Users\Irfan\.claude\get-shit-done\"
   └── grep -rln "quality.*opus\|adaptive.*opus" "C:\Users\Irfan\.claude\get-shit-done\"

2. Branch on what was found:

   A) Same .cjs file with same object-literal structure → apply patch mechanically.

   B) Same file path, different structure (e.g., JSON instead of JS, key names changed) →
      adapt the patch content to match the new shape. Document the adaptation in
      PATCHES.md Patch 5 as a content revision (not a new patch).

   C) Different file path, recognisable model-profiles concept (e.g., now at
      config/models.json or bin/lib/models/profiles.js) →
      apply equivalent override at new location. Document in PATCHES.md Patch 5
      with revised "File:" field.

   D) Model resolution mechanism replaced entirely (e.g., now config-flag-driven,
      env-var-driven, or removed) → the Opus override may not be achievable.
      Three options:
        (i) Accept that gsd-debugger uses default model in gsd-redux. Document
            this acceptance in PATCHES.md as "Patch 5 — RETIRED (model resolution
            mechanism removed in gsd-redux fork)".
        (ii) File an issue against open-gsd/get-shit-done-redux for the override
             feature.
        (iii) Rollback Phase A entirely and stay on get-shit-done-cc@1.41.0.

   E) The `gsd-debugger` agent name doesn't exist in gsd-redux (only `gsd-debug`
      skill remains) → the override targets a non-existent agent. Same options
      as (D).
```

**Acceptance criteria for the model-profiles patch in 1.0.0:**
- Either: a recognisable model-resolution config file containing a `gsd-debugger` (or equivalent) key with `opus` as the value
- Or: an explicit RETIRED note in PATCHES.md documenting why the patch can't apply

Spend at most 30 minutes on this sub-step. If still unresolved, fall back to option (D-i) or pause migration to ask the user.

**Cohort 3 verification (no patching):**
```bash
git -C "D:/Claude/Product Manager/product_master" status --short .claude/commands/
# Expected: no output. Any modified output → restore from Backup 1.
ls D:/Claude/Product Manager/product_master/.claude/commands/{triple-review,updateGSD,staffreview}.md
# All 3 must exist.
```

### Phase A — Step A.6: Mirror sync

**Sub-step A.6.1 — Pre-mirror diff check (avoid silent destination wipe):**

`robocopy /MIR` deletes anything in destination that's not in source. Before running it, surface any project-tree-unique files so they don't disappear silently:

```powershell
$dirs = @("get-shit-done", "agents", "hooks")
foreach ($dir in $dirs) {
  $userDir = "C:\Users\Irfan\.claude\$dir"
  $projDir = "D:\Claude\Product Manager\product_master\.claude\$dir"
  if (-not (Test-Path $projDir)) { continue }

  $projFiles = Get-ChildItem $projDir -Recurse -File -ErrorAction SilentlyContinue |
               ForEach-Object { $_.FullName.Substring($projDir.Length + 1) }
  $userFiles = Get-ChildItem $userDir -Recurse -File -ErrorAction SilentlyContinue |
               ForEach-Object { $_.FullName.Substring($userDir.Length + 1) }

  $unique = Compare-Object -ReferenceObject $projFiles -DifferenceObject $userFiles |
            Where-Object SideIndicator -eq '<=' | ForEach-Object InputObject

  if ($unique) {
    Write-Host "WARNING: $projDir has files NOT in $userDir — /MIR will delete them:"
    $unique | ForEach-Object { Write-Host "  $_" }
    $confirm = Read-Host "Proceed with mirror anyway? Type 'yes' to continue"
    if ($confirm -ne 'yes') { Write-Error "Mirror aborted"; exit 1 }
  } else {
    Write-Host "OK: $dir has no project-tree-unique files"
  }
}
```

**Sub-step A.6.2 — Mirror:**

```powershell
robocopy "C:\Users\Irfan\.claude\get-shit-done" `
         "D:\Claude\Product Manager\product_master\.claude\get-shit-done" `
         /MIR /R:0 /W:0
robocopy "C:\Users\Irfan\.claude\agents" `
         "D:\Claude\Product Manager\product_master\.claude\agents" `
         /MIR /R:0 /W:0
robocopy "C:\Users\Irfan\.claude\hooks" `
         "D:\Claude\Product Manager\product_master\.claude\hooks" `
         /MIR /R:0 /W:0
# Do NOT mirror commands/ — project owns its custom commands.
```

### Phase A — Step A.7: Settings.json reconciliation

The regex below handles BOTH user-level absolute paths (`C:\Users\Irfan\.claude\hooks\...`) AND project-level `$CLAUDE_PROJECT_DIR\.claude\hooks\...` substitutions:

```javascript
// Run this twice — once per settings.json file:
//   - "C:/Users/Irfan/.claude/settings.json" (user-level)
//   - "D:/Claude/Product Manager/product_master/.claude/settings.json" (project-level)
// Set PROJECT_ROOT when running against project settings.
const PROJECT_ROOT = 'D:\\Claude\\Product Manager\\product_master';
const SETTINGS_PATH = '<path>/settings.json';

const s = require(SETTINGS_PATH);
const fs = require('fs');
const hooks = [];
for (const k of Object.keys(s.hooks || {}))
  for (const e of s.hooks[k])
    for (const h of e.hooks || [])
      hooks.push({event: k, matcher: e.matcher, cmd: h.command});

// Match either absolute user-level path or $CLAUDE_PROJECT_DIR-prefixed path:
const HOOK_PATH_RE = /(?:C:\\Users\\Irfan\\\.claude\\hooks|\$CLAUDE_PROJECT_DIR\\\.claude\\hooks)\\[a-zA-Z0-9_.-]+/;

for (const h of hooks) {
  const m = h.cmd.match(HOOK_PATH_RE);
  if (!m) { console.log('NO-PATH-FOUND', h.event, h.cmd.slice(0, 80)); continue; }
  // Resolve $CLAUDE_PROJECT_DIR if present:
  const resolved = m[0].replace('$CLAUDE_PROJECT_DIR', PROJECT_ROOT);
  console.log((fs.existsSync(resolved) ? 'OK' : 'MISSING'), h.event, resolved);
}
```

**Pass criteria:**
- Every line starts with `OK`
- Zero `MISSING` lines (any → restore the hook file from Backup 1's `hooks/` directory)
- Zero `NO-PATH-FOUND` lines (any → hook uses an unrecognised path pattern; manual inspection needed)

### Phase A — Step A.8: Green-gate

**Sub-step A.8.1 — Mechanical checks:**

Run the full 15-customisation grep battery (see Acceptance Tests section). All must pass.

**Sub-step A.8.2 — Command-invocability check:**

File-existence ≠ command-registered. Open Claude Code and verify each custom command actually fires:

```
In Claude Code, type `/up` and confirm autocomplete shows `/updateGSD`.
Then type `/up` then `Tab` to autocomplete, then `--help` (or invoke with no args).
Confirm the command's description renders.

Repeat for:
  /st  → /staffreview (autocomplete + invoke with no args)
  /tr  → /triple-review (autocomplete + invoke with --help)
  /gsd → /gsd-help, /gsd-plan-phase, etc. (autocomplete shows multiple)

If autocomplete misses ANY of these, OR invocation produces "command not found",
the command isn't registered. Note which ones missed and halt before Rollback A.
```

**Sub-step A.8.3 — Atomic commit for Phase A:**

After both mechanical and invocability checks pass:

```bash
cd "D:/Claude/Product Manager/product_master"
git add .claude/get-shit-done/ .claude/agents/ .claude/hooks/ .claude/gsd-local-patches/
git commit -m "chore(gsd): phase A — install gsd-redux@1.0.0, re-apply 11 patches

- Installed @opengsd/get-shit-done-redux@1.0.0 via npx
- Re-applied 11 customisation patches against new baseline
- All 15 customisation grep checks pass
- All custom commands invocable in Claude Code
- Backup 1 retained at KEEP-pre-redux-<ts>/"
```

**If any check in A.8.1 or A.8.2 fails and can't be fixed in <15 min → Rollback A. Do NOT commit a half-broken Phase A state.**

---

### Phase B — Step B.1 (updateGSD lookup audit)

```powershell
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
  if (Test-Path $p) { Write-Host "OK: $p" } else { Write-Host "MISSING: $p" }
}
```

**Expected:** Several `MISSING` lines for `.claude/commands/gsd/*.md` paths — these were already wrong in v1.41.0. This pre-existing drift is in-scope to fix (becomes Patch 16 work in step B.7).

Catalogue all missing paths. They feed into the self-fix queue.

### Phase B — Step B.2 (updateGSD e2e smoke test)

Invoke from Claude Code:
```
/updateGSD add a temporary marker comment `<!-- HACK-test-2026-05-25 -->`
to the top of debug.md right after the frontmatter close `---` line
```

Watch for the 4 stages of updateGSD's flow:
1. File found (likely fails if debug.md isn't at expected lookup-table path)
2. Edit applied
3. Grep verifies
4. PATCHES.md updated

After observation, **revert the HACK-test marker** before Backup 2. No permanent test fixtures.

**Atomic commit for Phase B audit:**

```bash
cd "D:/Claude/Product Manager/product_master"
git add .claude/gsd-local-patches/
git commit -m "chore(gsd): phase B audit — updateGSD lookup + e2e smoke against 1.0.0

- Audited updateGSD's 11 lookup-table entries against gsd-redux@1.0.0
- Catalogued pre-existing drift (e.g., .claude/commands/gsd/*.md paths)
- E2E smoke test: invoked /updateGSD with no-op marker patch, reverted after"
```

### Phase B — Step B.3 (Backup 2)

```powershell
$ts2 = Get-Date -Format "yyyyMMdd-HHmmss"
$backup2 = "C:\Users\Irfan\.claude\backups\KEEP-phase-a-patched-$ts2"
mkdir $backup2
robocopy "C:\Users\Irfan\.claude" $backup2 /MIR /R:0 /W:0 /XD backups .cache /TEE /LOG:"$backup2\robocopy.log"
```

### Phase B — Step B.4 (Install 1.1.0)

```powershell
cd C:\Users\Irfan
npx @opengsd/get-shit-done-redux@1.1.0 --claude --global --profile=full 2>&1 | Tee-Object -FilePath install-110.log
```

### Phase B — Step B.5 (Diff classification)

For each of the 11 patched files in Backup 2:

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
  $current = "C:\Users\Irfan\.claude\$f"
  $backup = "$backup2\$f"
  fc /B $current $backup > $null
  $byteDiffers = ($LASTEXITCODE -ne 0)
  # Then grep for the file's verification phrase (per-file mapping)
  # Classify: UNCHANGED / OVERWRITTEN / EVOLVED
}
```

Classification matrix:

| `fc /B` | grep verify | Verdict |
|---|---|---|
| identical | passes | UNCHANGED — 1.1.0 left file alone |
| differs | passes | EVOLVED — file changed, patch survived |
| differs | fails | OVERWRITTEN — 1.1.0 wiped your patch |
| identical | fails | IMPOSSIBLE — Backup 2 itself corrupt. STOP. |

### Phase B — Step B.6 (Re-apply via /updateGSD)

For each OVERWRITTEN patch:
```
/updateGSD re-apply Patch <N> from .claude/gsd-local-patches/PATCHES.md
against the post-1.1.0 install of <target file>
```

This is the audit's truth moment. Failures route to step B.7.

**Atomic commit if re-applies happened:**

```bash
cd "D:/Claude/Product Manager/product_master"
git add .claude/get-shit-done/ .claude/agents/ .claude/gsd-local-patches/
git commit -m "chore(gsd): phase B re-apply — N patches re-applied to gsd-redux@1.1.0

- After 1.0.0 → 1.1.0 upgrade, N of 11 patches needed re-application
- Re-applied via /updateGSD against the 1.1.0 baseline
- PATCHES.md updated with re-apply log"
```

Skip this commit if all patches were UNCHANGED (no re-applies needed).

### Phase B — Step B.7 (Self-fix bootstrap)

When /updateGSD fails on step B.6 OR step B.1's lookup audit catalogued drift:

1. **Diagnose** — read /updateGSD's stdout. Identify failure class:
   - Stale lookup table row → fix the table
   - Two-layer assumption broken (commands/gsd/* doesn't exist as separate from workflows/) → adapt
   - Step-naming convention drift → adapt
2. **Hand-edit** `D:\Claude\Product Manager\product_master\.claude\commands\updateGSD.md` using Edit tool directly (bypasses /updateGSD's own scope protection).
3. **Document as Patch 16** in `.claude/gsd-local-patches/PATCHES.md`:
   - Title: "updateGSD lookup-table + scope correction for gsd-redux 1.1.0"
   - Purpose: what was wrong, what's now fixed
   - Verification grep
4. **Retry** the failed /updateGSD invocation.

**Hard rule:** No silent edits to updateGSD. Every change → PATCHES.md entry.

**Atomic commit if self-fix ran:**

```bash
cd "D:/Claude/Product Manager/product_master"
git add .claude/commands/updateGSD.md .claude/gsd-local-patches/PATCHES.md
git commit -m "chore(gsd): phase B self-fix — Patch 16 corrects updateGSD for gsd-redux

- updateGSD failed against gsd-redux 1.1.0 due to <stale lookup row | scope assumption | etc>
- Bootstrap hand-edit applied to commands/updateGSD.md
- Documented as Patch 16 in PATCHES.md
- Retried /updateGSD against the failed patch — now succeeds"
```

Skip this commit if step B.7 did not run.

### Phase B — Step B.8 (Final acceptance + commit)

Full 15-customisation grep battery against the 1.1.0 tree. Settings.json check. Real workflow dry-run (4 scenarios). Mirror parity (`fc /B` patched files user vs project). Backup 3 captured.

Then final commit (capping the chore branch) + merge:

```bash
cd "D:/Claude/Product Manager/product_master"

# Final commit captures only what wasn't already committed in earlier checkpoints
# (workflow dry-run logs if any, plus the CHANGELOG entry):
git add docs/CHANGELOG.md
# Plus any final workflow-dry-run artifacts if captured to files
git commit -m "chore(gsd): migration to @opengsd/get-shit-done-redux@1.1.0 complete

- Phase A: install + 11 patches re-applied (committed earlier)
- Phase B: audit + 1.1.0 upgrade + N re-applies + self-fix if any (committed earlier)
- Final: 15-customisation battery + workflow dry-run scenarios 1-4 passed
- CHANGELOG entry added
- Backups retained: KEEP-pre-redux-<ts>, KEEP-redux-110-final-<ts>"

# Push branch:
git push origin chore/gsd-redux-migration

# Merge to main (per CLAUDE.md doc-only paths rule, .claude/** can go direct):
git switch main
git merge --no-ff chore/gsd-redux-migration
git push origin main

# Restore the original stash from pre-flight A.1:
$origStashTag = Get-Content "C:\Users\Irfan\.claude\backups\.last-migration-stash-tag" -Raw
$stashIndex = (git stash list | Select-String -SimpleMatch $origStashTag.Trim() | Select-Object -First 1) -replace 'stash@\{(\d+)\}:.*','$1'
if ($stashIndex) {
  git stash pop "stash@{$stashIndex}"
} else {
  Write-Warning "Could not locate pre-migration stash by tag. Inspect 'git stash list' manually."
}
```

The per-phase atomic commits (A.8, B.2, B.6, B.7 — each documented in its respective step) make this final commit lightweight. Each prior commit is a meaningful rollback point via `git reset --hard <commit>` independent of robocopy.

CHANGELOG.md gets a one-line `### Dev tooling` entry.

## Backup Strategy

| Backup | When | Captures | Lifetime | Purpose |
|---|---|---|---|---|
| 1 | Phase A step A.2 | v1.41.0 (pre-migration) | Permanent | Full retreat to pre-migration state |
| 2 | Phase B step B.3 | 1.0.0 + 11 patches applied | Until Phase B verified clean (~1 week) | Restore point if 1.1.0 fails; diff source for step B.5 |
| 3 | Phase B step B.8 | 1.1.0 + all patches + self-fixes | Permanent | New reference "good state" |

All backups: whole-tree `robocopy /MIR`, ~200 MB each, naming `KEEP-<purpose>-<YYYYMMDD-HHmmss>/`.

Robocopy exclusions: `/XD backups .cache` (don't backup the backups; don't backup caches).

Verification per backup: file count parity + `fc /B` on one representative file.

## Rollback Paths

| Trigger | Restore from | Result | Procedure |
|---|---|---|---|
| Phase A green-gate fails | Backup 1 | v1.41.0 clean | Rollback A (below) |
| Phase B install of 1.1.0 corrupts | Backup 2 | 1.0.0 + 11 patches working | Rollback B |
| Phase B step B.6–B.7 unrecoverable | Backup 2 (preferred) or Backup 1 | 1.0.0 patched OR v1.41.0 | Rollback C-1 / C-2 |
| Late-discovered regression | Backup 1 | v1.41.0 | Rollback A again, indefinite |

### Rollback A procedure

```powershell
$ts = "<timestamp from Backup 1>"
robocopy "C:\Users\Irfan\.claude\backups\KEEP-pre-redux-$ts" `
         "C:\Users\Irfan\.claude" /MIR /R:0 /W:0 /XD backups .cache
robocopy "D:\Claude\Product Manager\product_master\.claude\backups\KEEP-pre-redux-$ts" `
         "D:\Claude\Product Manager\product_master\.claude" /MIR /R:0 /W:0 /XD backups .cache
git -C "D:\Claude\Product Manager\product_master" switch main
git -C "D:\Claude\Product Manager\product_master" branch -D chore/gsd-redux-migration

# Restore the original stash by its known tag (saved in pre-flight A.1):
$origStashTag = Get-Content "C:\Users\Irfan\.claude\backups\.last-migration-stash-tag" -Raw
$stashIndex = (git -C "D:\Claude\Product Manager\product_master" stash list | Select-String -SimpleMatch $origStashTag.Trim() | Select-Object -First 1) -replace 'stash@\{(\d+)\}:.*','$1'
if ($stashIndex) {
  git -C "D:\Claude\Product Manager\product_master" stash pop "stash@{$stashIndex}"
} else {
  Write-Warning "Could not locate pre-migration stash by tag. Inspect 'git stash list' manually."
}
```

Sanity verify: `grep -c "Step 2.5: Graph Blast Radius Scout" C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md` returns 1.

## Acceptance Tests

### 15-customisation grep battery

Run against user tree (Gate 1 and Gate 2) and against project tree (Gate 2 only, after mirror sync).

```bash
# Cohort 1 (workflow patches)
grep -c "staffreview" C:/Users/Irfan/.claude/get-shit-done/workflows/plan-phase.md                # >= 4
grep -c "triple_review_gate\|quad_review" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # >= 1
grep -c "document_and_merge_gate" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # == 1
grep -c "Step 6.5: Charter Removals (RETIRES.md)" C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md  # == 1
grep -c "quad_review" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md             # >= 1
grep -c "Route the COMPLETE tiered list" C:/Users/Irfan/.claude/get-shit-done/workflows/execute-phase.md  # >= 1
grep -c "Step 6.3.*[Qq]uad" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md               # >= 1
grep -c "Step 6.4.*[Ss]implify" C:/Users/Irfan/.claude/get-shit-done/workflows/quick.md           # >= 1
grep -c "Quality Gates" C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md                   # >= 1
grep -c "Document and Merge" C:/Users/Irfan/.claude/get-shit-done/workflows/debug.md              # >= 1
grep -c "Step 2.5: Graph Blast Radius Scout" C:/Users/Irfan/.claude/get-shit-done/workflows/spec-phase.md  # == 1
grep -c "scout_graph_blast_radius" C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md  # >= 2
grep -c "### Blast Radius" C:/Users/Irfan/.claude/get-shit-done/workflows/discuss-phase.md         # >= 2

# Cohort 2 (code config + agent prompt)
grep "'gsd-debugger':.*adaptive: 'opus'" C:/Users/Irfan/.claude/get-shit-done/bin/lib/model-profiles.cjs   # 1 match
grep -c "blast_radius_awareness" C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md             # == 2
grep -c "fan_in >= 10" C:/Users/Irfan/.claude/agents/gsd-phase-researcher.md                       # == 1

# Cohort 3 (custom commands)
grep -c "external-review" "D:/Claude/Product Manager/product_master/.claude/commands/triple-review.md"  # >= 1
ls "D:/Claude/Product Manager/product_master/.claude/commands/updateGSD.md"                              # exists
ls "D:/Claude/Product Manager/product_master/.claude/commands/staffreview.md"                            # exists
git -C "D:/Claude/Product Manager/product_master" status --short .claude/commands/                       # no output
```

### Smoke tests

```bash
node C:/Users/Irfan/.claude/get-shit-done/bin/gsd-tools.cjs --version    # exits 0
node C:/Users/Irfan/.claude/get-shit-done/bin/gsd-tools.cjs --help       # exits 0
node C:/Users/Irfan/.claude/get-shit-done/bin/gsd-tools.cjs graphify status  # exits 0
# Plus: /gsd-help in Claude Code lists expected commands
```

### Real workflow dry-run (Gate 2 only)

| Scenario | Action | Pass criterion |
|---|---|---|
| 1. Plan-phase staffreview gate | `/gsd-plan-phase 999` in CC | Step 12.5 prompt for Skill(staffreview) appears |
| 2. Spec-phase RETIRES.md | `/gsd-spec-phase 999` with "retires X" hint | `999-RETIRES.md` is generated |
| 3. Execute-phase gates | `/gsd-execute-phase 999` | quad_review + document_and_merge_gate names appear in stdout |
| 4. Opus for gsd-debugger | `/gsd-debug` session | Spawned agent's model resolves to opus |

Test phase: permanent number `999`. Abort each scenario after gate verification — no real commits.

### Mirror parity

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

All 8 files must report `OK`.

### PATCHES.md integrity

```bash
grep -c "^## Patch [1-5]:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"  # == 5
grep -c "^## Patch [1-3]:" "C:/Users/Irfan/.claude/gsd-local-patches/PATCHES.md"          # == 3
grep -c "^## Patch 16:" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"     # 0 or 1
grep -c "## Patch Reapplication History" "D:/Claude/Product Manager/product_master/.claude/gsd-local-patches/PATCHES.md"  # == 1
```

## Critical Files & Tools Referenced

| File / Tool | Role |
|---|---|
| `D:\...\product_master\.claude\gsd-local-patches\PATCHES.md` | Authoritative patch manifest for customisations #1–#11 (project-tracked) |
| `C:\Users\Irfan\.claude\gsd-local-patches\PATCHES.md` | Patch manifest for customisations #12–#14 (graphify, user-tracked) |
| `D:\...\product_master\.claude\commands\updateGSD.md` | The meta-skill being audited; project-scoped, outside GSD install scope |
| `C:\Users\Irfan\.claude\settings.json` | 9 hook references to verify in Phase A step A.7 |
| `D:\...\product_master\.claude\settings.json` | Project hook references to verify in Phase A step A.7 |
| `C:\Users\Irfan\.claude\gsd-file-manifest.json` | Install manifest — backed up in Backup 1, rewritten by new install |
| `C:\Users\Irfan\.claude\gsd-pristine\` | Per-version pristine baselines; refreshed in Phase A step A.4 |
| `robocopy` (Windows builtin) | Idempotent mirror, primary file-op tool throughout |
| `fc /B` (Windows builtin) | Binary file compare for diff classification + mirror parity |
| `npx @opengsd/get-shit-done-redux@<version>` | Installer for both phases |
| `Edit` tool (Claude Code) | Surgical patch application — never `Write` |
| `/updateGSD` slash command | Patch manager + audit target |

## Open Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Anchor #1 (plan-phase Step 12.5) missing in 1.0.0 | Medium | Step A.5 halts on first-fail and re-researches before retry |
| model-profiles.cjs structure changed in 1.0.0 | Medium | Step A.5 has explicit inspect-before-patch sub-step for Cohort 2 #5 |
| updateGSD lookup-table drift turns out structural (workflows/ dir removed) | Low-Medium | Step B.7's bootstrap edit can fix lookup table; if structural, fall back to Rollback C-2 (stay on 1.0.0) |
| 1.1.0 has minor-bump regressions in workflows currently in use | Low | Step B.5's diff catches this; Backup 2 retains the 1.0.0 patched state |
| Robocopy hits file lock during backup | Low | Pre-flight step A.1 closes Claude Code sessions; backup verifies file count parity |
| Project mirror drifts during migration | Low | Step A.6 mirror sync is one-way user→project; commands/ explicitly excluded |
| Plugin marketplace `staffreview` / `triple-review` skills sourced from a plugin cache not audited in this spec | Low | If skill registry changes post-install, inspect `C:/Users/Irfan/.claude/plugins/` for stale entries |

## Decision Log

| Decision | Rationale |
|---|---|
| Two-phase plan (A + B) | Separates "get to working baseline" from "audit updateGSD." Phase A gives a known-good state to fall back to if Phase B audit reveals deep updateGSD issues. |
| 1.0.0→1.1.0 upgrade IS the audit | Real version-bump event exercises updateGSD's reapply mechanism — the exact thing it needs to survive. Paper test alternatives wouldn't validate this. |
| In-scope to fix pre-existing lookup-table drift | The drift (`.claude/commands/gsd/debug.md` etc. don't exist) is pre-existing. Fixing it now via Patch 16 means updateGSD goes forward correct, not just compatible. |
| Bootstrap edit allowed for updateGSD.md self-fix | updateGSD's own scope rule excludes itself. The one-time hand-edit is documented as Patch 16 in PATCHES.md to maintain the "no silent customisations" discipline. |
| Whole-tree backups not selective | Simpler. ~200 MB cost negligible vs. easier mental model + reduced risk of forgetting a directory. |
| Permanent test phase 999 | Easier to repeat dry-runs. One phase slot occupied, but reusable across all future updateGSD audits. |
| Mirror direction user→project | Patches applied once at user level, then mirrored. Single source of truth for the patched state. |
| Commit chore branch to main | Migration outcomes are real changes to project-tracked `.claude/` files. Doc-only paths per CLAUDE.md allow direct-to-main, but the chore branch keeps history clean. |

## Verification End-to-End

After Backup 3 and the commit/merge:

1. New Claude Code session (closes old context that may have stale plugin caches)
2. Invoke `/gsd-help` — confirm full command list including custom additions
3. Run the 4-scenario dry-run sequence above
4. Inspect PATCHES.md to confirm all 5 base patches + 3 graphify patches + any new Patch 16+ are present
5. Try `/updateGSD` with a real (non-trivial) customisation request — e.g., "add a temporary banner to debug.md before Step 1" — to confirm it works end-to-end against 1.1.0
6. Revert that test edit
7. Migration complete

Total expected elapsed time: **~5 hours of focused work** (Phase A ~130 min, Phase B ~110 min, final acceptance ~30 min, padding for diagnosis). The estimate grew from the v1 spec's ~4 hours after staffreview revision added these sub-steps: anchor verification (A.3.2), binary path discovery (A.3.1), model-profiles decision tree (A.5 expanded), pre-mirror diff (A.6.1), command-invocability check (A.8.2), and per-phase atomic commits. Can split across two sessions if Phase A green-gate is reached and committed first — the A.8.3 commit makes Phase A a meaningful resume point.

## Next Step

After user approval of this spec, transition to `superpowers:writing-plans` to produce the detailed implementation plan with task-by-task breakdown, dependencies, and review checkpoints.

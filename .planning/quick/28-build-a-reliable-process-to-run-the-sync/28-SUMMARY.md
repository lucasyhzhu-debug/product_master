---
phase: quick-28
plan: "01"
subsystem: scripts
tags: [sync, devops, auth, windows, ci]
dependency_graph:
  requires: []
  provides: [hardened-sync-script]
  affects: [scripts/sync-prod-to-dev.sh]
tech_stack:
  added: []
  patterns: [pre-flight-auth-check, non-interactive-flag, windows-path-guard, post-import-spot-check]
key_files:
  created: []
  modified:
    - scripts/sync-prod-to-dev.sh
decisions:
  - "Auth pre-flight uses `npx convex whoami --prod`; gated behind `--help` availability check for older CLI versions"
  - "WORK_DIR_WIN validated against drive-letter regex before use; cygpath and plain pwd as two-level fallback"
  - "Post-import spot-check uses python3 for JSON count with grep -c '\"_id\"' as no-python3 fallback"
  - "Step numbering kept as 0/6 + 1/6..6/6 (pre-flight is step 0, not renumbered) for clearest UX"
  - "Cleanup (rm -rf temp files) moved inside Step 6 block; no longer a separate 7th step"
metrics:
  duration: "4 min"
  completed: "2026-02-25"
  tasks_completed: 2
  files_modified: 1
---

# Quick Task 28: Build a Reliable Process to Run the Sync — Summary

**One-liner:** Hardened `sync-prod-to-dev.sh` with Convex CLI auth pre-flight (`npx convex whoami`), `--no-confirm` CI flag, `pwd -W`/cygpath Windows path guard, and `ingredients:list` post-import spot-check.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add auth pre-flight check and --no-confirm flag | 3b3af6f | scripts/sync-prod-to-dev.sh |
| 2 | Add post-import spot-check and verify Windows path handling | 3b3af6f | scripts/sync-prod-to-dev.sh |

Both tasks were committed together (single file, no intermediate state to preserve).

## What Was Built

### Auth Pre-flight (Step 0/6)
Before any destructive action, the script now runs `npx convex whoami --prod` and checks for "not logged in", "unauthorized", or "401" patterns. If found, it prints:
```
ERROR: Not authenticated with Convex CLI.
       Run: npx convex login
       Then re-run this script.
```
...and exits 1. If the `whoami` subcommand is unavailable (older CLI), a warning is printed and the script continues gracefully.

### Non-interactive Mode (`--no-confirm`)
```bash
bash scripts/sync-prod-to-dev.sh --no-confirm  # autonomous / CI mode
```
Parses `$1` at startup. When `--no-confirm`, skips the `read -p "Continue? (y/N)"` prompt entirely. USAGE comment in the header documents both modes.

### Windows Path Hardening (Step 4/6)
Replaced bare `pwd -W` with a guarded block:
1. Try `pwd -W`; validate result matches `^[A-Za-z]:/` (Windows drive letter)
2. If invalid/empty, fall back to `cygpath -w "$(pwd)" | tr '\\' '/'`
3. If cygpath also fails, fall back to plain `pwd`
`WORK_DIR_WIN` is always a usable path before constructing `WORK_DIR_ABS` and `SANITIZED_ABS`.

### Post-import Spot-check (Step 6/6)
After import completes, queries `ingredients:list` from dev:
- If output starts with `[` or `{` (JSON), counts entries via python3 (or grep -c '"_id"' fallback)
- Prints: `ingredients table: N records found in dev`
- If query fails, prints first 3 lines of output + dashboard fallback hint
Footer changed from manual spot-check hints to: "Spot-check (automated above). Manual fallback: ..."

## Verification

```
bash -n scripts/sync-prod-to-dev.sh
# SYNTAX CHECK: PASSED

grep -n "whoami|NO_CONFIRM|no-confirm|SPOT_CHECK|WORK_DIR_WIN" scripts/sync-prod-to-dev.sh
# All 5 patterns confirmed present
```

## Deviations from Plan

None — plan executed exactly as written. Both tasks applied to the same file and committed atomically.

## Self-Check: PASSED

- [x] `scripts/sync-prod-to-dev.sh` exists and modified
- [x] Commit `3b3af6f` present in git log
- [x] `bash -n scripts/sync-prod-to-dev.sh` exits 0
- [x] All 5 plan verification patterns (`whoami`, `NO_CONFIRM`, `no-confirm`, `SPOT_CHECK`, `WORK_DIR_WIN`) confirmed via grep

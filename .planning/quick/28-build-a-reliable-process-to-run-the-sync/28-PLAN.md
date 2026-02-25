---
phase: quick-28
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/sync-prod-to-dev.sh
autonomous: true
requirements:
  - SYNC-01
  - SYNC-02
  - SYNC-03
  - SYNC-04
  - SYNC-05

must_haves:
  truths:
    - "Running the script without authentication fails immediately with a clear human-readable error and instructions to run `npx convex login`"
    - "Running with `--no-confirm` skips the y/N prompt entirely (suitable for CI/automation)"
    - "Running interactively still shows the warning and requires confirmation"
    - "After import completes, the script queries a table count from dev and prints the result so the operator can confirm data landed"
    - "Windows path handling (pwd -W fallback for Compress-Archive) does not regress"
  artifacts:
    - path: "scripts/sync-prod-to-dev.sh"
      provides: "Hardened sync script with auth pre-flight, non-interactive flag, and post-import spot-check"
      contains: "auth_check"
  key_links:
    - from: "scripts/sync-prod-to-dev.sh"
      to: "npx convex export --prod"
      via: "pre-flight auth check before export is attempted"
      pattern: "npx convex whoami"
    - from: "scripts/sync-prod-to-dev.sh"
      to: "npx convex run"
      via: "post-import spot-check query against dev"
      pattern: "npx convex run.*--env-file .env.local"
---

<objective>
Harden `scripts/sync-prod-to-dev.sh` with four targeted improvements:

1. Pre-flight auth check — detect unauthenticated Convex CLI before attempting export, fail fast with a clear `npx convex login` instruction instead of a cryptic 401.
2. Non-interactive mode (`--no-confirm` flag) — skip the y/N prompt for autonomous/CI runs.
3. Solid Windows path handling — verify the `pwd -W` fallback for `Compress-Archive` is robust.
4. Post-import spot-check — after import, actually query a table count from dev and print it so the operator can visually confirm data landed.

Purpose: The sync script is used manually (local dev data refresh) and will eventually run in CI. Current pain points are opaque 401 failures and interactive prompts that block automation.

Output: Updated `scripts/sync-prod-to-dev.sh` that handles all four cases.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@scripts/sync-prod-to-dev.sh
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add auth pre-flight check and --no-confirm flag</name>
  <files>scripts/sync-prod-to-dev.sh</files>
  <action>
Edit `scripts/sync-prod-to-dev.sh` with these two changes:

**A. Auth pre-flight check (insert after the .env.local safety check, before the echo banner):**

Run `npx convex whoami --prod 2>&1` and capture output. If the exit code is non-zero OR the output contains "not logged in" / "Unauthorized" / "401", print a clear error and exit:

```bash
echo "Step 0/6: Checking Convex authentication..."
AUTH_CHECK=$(npx convex whoami --prod 2>&1) || true
if echo "$AUTH_CHECK" | grep -qiE "not logged in|unauthorized|401|error"; then
  echo ""
  echo "ERROR: Not authenticated with Convex CLI."
  echo "       Run: npx convex login"
  echo "       Then re-run this script."
  echo ""
  exit 1
fi
echo "  -> Authenticated: $AUTH_CHECK"
```

If `npx convex whoami` is not available (older CLI), fall back gracefully: attempt a minimal `npx convex export --help` dry-run or just print a warning and continue (do not block). Check with `npx convex whoami --help &>/dev/null` first to gate.

**B. Non-interactive mode (--no-confirm flag):**

At the top of the script, parse `$1`:

```bash
NO_CONFIRM=false
if [[ "$1" == "--no-confirm" ]]; then
  NO_CONFIRM=true
fi
```

Replace the interactive prompt block:

```bash
read -p "Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi
```

With:

```bash
if [[ "$NO_CONFIRM" == true ]]; then
  echo "Running in non-interactive mode (--no-confirm). Proceeding automatically."
else
  read -p "Continue? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi
```

**C. Update the USAGE comment block at the top** to document both modes:

```
# USAGE:
#   bash scripts/sync-prod-to-dev.sh               # interactive (prompts y/N)
#   bash scripts/sync-prod-to-dev.sh --no-confirm  # autonomous / CI mode
```

Also update the step numbering: the pre-flight check becomes "Step 0/6", existing steps remain 1/6–6/6. (Or renumber to 1/7–7/7 if preferred for cleanliness — choose whichever feels right.)
  </action>
  <verify>
Run `bash scripts/sync-prod-to-dev.sh --help 2>&1 || head -20 scripts/sync-prod-to-dev.sh` to confirm comment block is updated.

Inspect the script with `grep -n "NO_CONFIRM\|no-confirm\|whoami\|Step 0" scripts/sync-prod-to-dev.sh` to confirm all three insertions are present.
  </verify>
  <done>
Script contains `--no-confirm` flag parsing, auth pre-flight using `npx convex whoami`, and updated USAGE comment. Non-interactive mode skips the y/N prompt. Auth failure prints "Run: npx convex login" and exits 1.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add post-import spot-check and verify Windows path handling</name>
  <files>scripts/sync-prod-to-dev.sh</files>
  <action>
**A. Post-import spot-check (replace Step 6/6 or insert after Step 5/6 import):**

After the import completes and before cleanup, run a real query against dev to confirm data landed:

```bash
echo ""
echo "Step 6/6: Post-import spot-check..."
# Query ingredient count from dev as a lightweight confirmation
SPOT_CHECK=$(npx convex run ingredients:list --env-file .env.local 2>&1) || true
if echo "$SPOT_CHECK" | grep -qE "^\[|^\{"; then
  # Output looks like JSON array/object — count entries
  ENTRY_COUNT=$(echo "$SPOT_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'object')" 2>/dev/null || echo "?")
  echo "  -> ingredients table: $ENTRY_COUNT records found in dev"
else
  echo "  -> Spot-check query returned: $SPOT_CHECK"
  echo "  -> (If import succeeded but query failed, data may still be present — check Convex dashboard)"
fi
```

If `python3` is not available, fall back to a simpler check: just print the raw output of the query truncated to the first 3 lines. The goal is to show SOMETHING from dev, not a perfect count.

**B. Windows path robustness in Step 4/6 (re-zip):**

The existing PowerShell fallback uses `pwd -W` to get the Windows-native path. Add a guard that verifies `pwd -W` actually returned a Windows path (starts with a drive letter like `D:/`):

```bash
  WORK_DIR_WIN=$(pwd -W 2>/dev/null) || WORK_DIR_WIN=""
  if [[ -z "$WORK_DIR_WIN" || ! "$WORK_DIR_WIN" =~ ^[A-Za-z]:/ ]]; then
    # pwd -W not available or returned non-Windows path — try cygpath
    WORK_DIR_WIN=$(cygpath -w "$(pwd)" 2>/dev/null | tr '\\' '/') || WORK_DIR_WIN=$(pwd)
  fi
  WORK_DIR_ABS="${WORK_DIR_WIN}/${WORK_DIR}"
  SANITIZED_ABS="${WORK_DIR_WIN}/${SANITIZED}"
  powershell.exe -NoProfile -Command "Compress-Archive -Path '${WORK_DIR_ABS}/*' -DestinationPath '${SANITIZED_ABS}' -Force"
```

Replace the existing `WORK_DIR_ABS=$(pwd -W)/"$WORK_DIR"` / `SANITIZED_ABS=$(pwd -W)/"$SANITIZED"` lines with this guarded version.

**C. Update the "Spot-check" footer at the bottom of the script** (the manual echo hints) to note the automated spot-check already ran, but keep the manual commands as fallback reference:

```bash
echo "Spot-check (automated above). Manual fallback:"
echo "  npx convex run orders:list --env-file .env.local"
echo "  npx convex run recipes:list --env-file .env.local"
```
  </action>
  <verify>
Run `grep -n "spot.check\|SPOT_CHECK\|WORK_DIR_WIN\|cygpath\|pwd -W" scripts/sync-prod-to-dev.sh` to confirm both the spot-check block and hardened Windows path detection are present.

Dry-read the full script (`cat scripts/sync-prod-to-dev.sh`) and confirm there are no syntax errors by running `bash -n scripts/sync-prod-to-dev.sh` (bash syntax check without executing).
  </verify>
  <done>
`bash -n scripts/sync-prod-to-dev.sh` exits 0 (no syntax errors). Script contains post-import spot-check that queries `ingredients:list` from dev and prints record count. Windows path block uses `pwd -W` with cygpath fallback guard.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. Syntax check: `bash -n scripts/sync-prod-to-dev.sh` must exit 0.
2. Grep confirmation — all five improvements present:
   ```bash
   grep -n "whoami\|NO_CONFIRM\|no-confirm\|SPOT_CHECK\|WORK_DIR_WIN" scripts/sync-prod-to-dev.sh
   ```
   Must return lines for all five patterns.
3. Dry-run the flag parsing: `bash scripts/sync-prod-to-dev.sh --no-confirm` while NOT authenticated — should hit the auth pre-flight and exit with "Run: npx convex login" before doing anything destructive.
</verification>

<success_criteria>
- `bash -n scripts/sync-prod-to-dev.sh` exits 0
- Unauthenticated run prints "Run: npx convex login" and exits 1 before any export attempt
- `--no-confirm` flag skips the interactive y/N prompt
- Post-import section queries `ingredients:list` from dev and prints a record count (or graceful fallback message)
- Windows path block uses `pwd -W` with cygpath/plain-pwd fallback — `WORK_DIR_WIN` is always a usable path
- USAGE comment in script header documents both modes
</success_criteria>

<output>
After completion, create `.planning/quick/28-build-a-reliable-process-to-run-the-sync/28-SUMMARY.md` following the standard summary template.
</output>

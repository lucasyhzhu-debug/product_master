# Prod → Dev Data Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a repeatable shell script that exports a sanitized production snapshot and imports it into dev, replacing all business data while leaving auth/credential tables untouched.

**Architecture:** Single bash script at `scripts/sync-prod-to-dev.sh`. Uses Convex CLI `export --prod` to dump all tables, unzips and deletes 3 sensitive table directories, re-zips, then imports with `--replace-all` targeting dev via `--env-file .env.local`. No code changes to the app itself.

**Tech Stack:** Convex CLI (`npx convex export`, `npx convex import`), bash, unzip/zip

---

### Task 1: Create the sync script

**Files:**
- Create: `scripts/sync-prod-to-dev.sh`

**Step 1: Create the script file**

```bash
#!/usr/bin/env bash
# sync-prod-to-dev.sh — Replaces dev data with sanitized prod snapshot
#
# WHAT IT DOES:
#   1. Exports all tables from prod:decisive-wombat-7
#   2. Strips users, sessions, platformCredentials (sensitive tables)
#   3. Imports the sanitized snapshot into dev:exciting-fennec-671
#
# WHAT IT DOES NOT TOUCH IN DEV:
#   - users          (dev login credentials)
#   - sessions       (dev session tokens)
#   - platformCredentials (dev K3Mart/GoBiz API tokens)
#
# PREREQUISITES:
#   - npx convex CLI available
#   - unzip and zip available (install with: brew install zip / apt install zip)
#   - .env.local exists pointing to dev:exciting-fennec-671
#   - You are authenticated: npx convex login
#
# USAGE:
#   bash scripts/sync-prod-to-dev.sh
#
set -e

DATE=$(date +%Y%m%d)
SNAPSHOT="prod-snapshot-${DATE}.zip"
SANITIZED="prod-snapshot-sanitized-${DATE}.zip"
WORK_DIR="prod-snapshot-work"

echo ""
echo "=== Prod → Dev Sync ==="
echo "FROM: prod:decisive-wombat-7"
echo "TO:   dev:exciting-fennec-671"
echo ""
echo "WARNING: This will REPLACE ALL business data in dev."
echo "         users, sessions, platformCredentials are NOT touched."
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "Step 1/6: Exporting prod snapshot..."
npx convex export --prod --path "$SNAPSHOT"
echo "  -> Saved to $SNAPSHOT"

echo ""
echo "Step 2/6: Unzipping..."
mkdir -p "$WORK_DIR"
unzip -q "$SNAPSHOT" -d "$WORK_DIR"
echo "  -> Tables found:"
ls "$WORK_DIR" | sed 's/^/     /'

echo ""
echo "Step 3/6: Stripping sensitive tables..."
rm -rf "$WORK_DIR/users" "$WORK_DIR/sessions" "$WORK_DIR/platformCredentials"
echo "  -> Removed: users, sessions, platformCredentials"
echo "  -> Tables to import:"
ls "$WORK_DIR" | sed 's/^/     /'

echo ""
echo "Step 4/6: Re-zipping sanitized snapshot..."
(cd "$WORK_DIR" && zip -rq "../$SANITIZED" .)
echo "  -> Saved to $SANITIZED"

echo ""
echo "Step 5/6: Importing to dev..."
npx convex import "$SANITIZED" --replace-all --yes --env-file .env.local
echo "  -> Import complete"

echo ""
echo "Step 6/6: Cleaning up temp files..."
rm -rf "$WORK_DIR" "$SNAPSHOT" "$SANITIZED"
echo "  -> Cleaned up"

echo ""
echo "=== Done! ==="
echo "Dev (dev:exciting-fennec-671) now has sanitized prod data."
echo ""
echo "Spot-check:"
echo "  npx convex run orders:list --env-file .env.local"
echo "  npx convex run recipes:list --env-file .env.local"
```

**Step 2: Verify the file looks correct**

Open `scripts/sync-prod-to-dev.sh` and confirm:
- Shebang line is `#!/usr/bin/env bash`
- `set -e` is present (exits on any error)
- The 3 table names to strip are exactly: `users`, `sessions`, `platformCredentials`
- Import uses `--env-file .env.local` (not `.env` which would target prod)

**Step 3: Set the executable bit (Git-tracked)**

```bash
git update-index --chmod=+x scripts/sync-prod-to-dev.sh
```

> Why `git update-index` instead of `chmod +x`? On Windows, `chmod` doesn't persist in Git. This command sets the executable bit in the Git index so it works when cloned on any OS.

**Step 4: Verify executable bit is set**

```bash
git ls-files --stage scripts/sync-prod-to-dev.sh
```

Expected output starts with `100755` (755 = executable). If you see `100644`, the bit wasn't set — redo step 3.

**Step 5: Commit**

```bash
git add scripts/sync-prod-to-dev.sh
git commit -m "feat: add prod-to-dev sync script

Exports sanitized prod snapshot (strips users/sessions/platformCredentials)
and imports into dev with --replace-all. Run with: bash scripts/sync-prod-to-dev.sh"
```

---

### Task 2: Update .gitignore

The script produces temp files (`prod-snapshot-*.zip`, `prod-snapshot-work/`). These must never be committed — they contain production data.

**Files:**
- Modify: `.gitignore`

**Step 1: Add entries to the PLAYWRIGHT / SCRIPTS section of .gitignore**

Find the section that currently reads:
```
# =============================================================================
# PLAYWRIGHT / SCRIPTS
# =============================================================================
scripts/debug-screenshots/
scripts/.gobiz_creds.json
```

Add two lines after `scripts/.gobiz_creds.json`:
```
prod-snapshot*.zip
prod-snapshot-work/
```

So it becomes:
```
# =============================================================================
# PLAYWRIGHT / SCRIPTS
# =============================================================================
scripts/debug-screenshots/
scripts/.gobiz_creds.json
prod-snapshot*.zip
prod-snapshot-work/
```

**Step 2: Verify gitignore works**

```bash
echo "test" > prod-snapshot-20260224.zip
git status
```

Expected: the `.zip` file does NOT appear in `git status` output (it's ignored).

```bash
rm prod-snapshot-20260224.zip
```

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore prod snapshot temp files"
```

---

### Task 3: Add Dev Refresh section to ENVIRONMENTS.md

**Files:**
- Modify: `docs/ENVIRONMENTS.md`

**Step 1: Add the Dev Refresh section**

Find the `## See Also` section at the bottom of `docs/ENVIRONMENTS.md` and insert this section *before* it:

```markdown
---

## Refreshing Dev with Production Data

When dev data gets stale, you can replace it with a sanitized snapshot of production.

**What gets replaced:** All business tables (~56 tables: orders, recipes, products, inventory, customers, etc.)

**What stays untouched:** `users`, `sessions`, `platformCredentials` (dev credentials remain intact)

### Prerequisites

- `unzip` and `zip` must be installed (`brew install zip` / `apt install zip` / Git Bash on Windows has both)
- You must be authenticated with Convex: `npx convex login`
- `.env.local` must exist and point to `dev:exciting-fennec-671`

### Run the sync

```bash
bash scripts/sync-prod-to-dev.sh
```

The script will:
1. Export all tables from `prod:decisive-wombat-7`
2. Strip `users`, `sessions`, `platformCredentials` from the export
3. Import the sanitized snapshot into `dev:exciting-fennec-671` with `--replace-all`
4. Clean up all temp files

**Duration:** ~2–5 minutes depending on data size.

### After the sync

Restart your dev server to pick up the new data:

```bash
# Terminal 1 (if running): stop and restart
npx convex dev

# Spot-check in a new terminal
npx convex run orders:list --env-file .env.local
```

### ⚠ Caution

- This is **destructive to dev** — all existing dev data will be replaced
- Do NOT run while someone else is actively using dev for testing
- The script has a confirmation prompt before it does anything

```

**Step 2: Verify the file reads correctly**

Open `docs/ENVIRONMENTS.md` and confirm the new section appears between the last `---` divider and `## See Also`.

**Step 3: Commit**

```bash
git add docs/ENVIRONMENTS.md
git commit -m "docs: document dev refresh process in ENVIRONMENTS.md"
```

---

### Task 4: Verify end-to-end (dry run)

Before running against real data, do a quick sanity check.

**Step 1: Verify Convex CLI is available and authenticated**

```bash
npx convex --version
```

Expected: prints a version number (e.g., `1.x.x`). If it prompts for login, run `npx convex login` first.

**Step 2: Verify the script is syntactically valid**

```bash
bash -n scripts/sync-prod-to-dev.sh
```

Expected: no output (no syntax errors). Any output means a syntax error — fix it.

**Step 3: Verify .env.local points to dev**

```bash
grep CONVEX_DEPLOYMENT .env.local
```

Expected: `CONVEX_DEPLOYMENT=dev:exciting-fennec-671`

If it shows `prod:decisive-wombat-7`, stop — do NOT run the sync until you fix `.env.local`.

**Step 4: (Optional) Run for real**

```bash
bash scripts/sync-prod-to-dev.sh
```

When prompted `Continue? (y/N)`, type `y`.

Watch for:
- Step 1 completes without auth errors
- Step 3 confirms `users`, `sessions`, `platformCredentials` removed
- Step 5 completes without import errors
- Step 6 cleans up (no leftover `.zip` files)

**Step 5: Spot-check the result**

After the sync, verify data landed in dev:

```bash
# Should show production orders
npx convex run orders:list --env-file .env.local

# Should show production recipes
npx convex run recipes:list --env-file .env.local
```

Also restart `npx convex dev` and open the frontend — you should see production data.

---

## Success Criteria

- [ ] `bash -n scripts/sync-prod-to-dev.sh` exits with no errors
- [ ] `git ls-files --stage scripts/sync-prod-to-dev.sh` shows `100755` (executable)
- [ ] `prod-snapshot*.zip` does not appear in `git status`
- [ ] `docs/ENVIRONMENTS.md` has a "Refreshing Dev" section
- [ ] When run: `users`, `sessions`, `platformCredentials` are unchanged in dev
- [ ] When run: business data in dev matches prod (spot-check passes)
- [ ] No leftover temp files after script completes

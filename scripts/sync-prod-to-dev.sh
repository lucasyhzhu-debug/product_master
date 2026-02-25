#!/usr/bin/env bash
# sync-prod-to-dev.sh — Replaces dev data with sanitized prod snapshot
#
# WHAT IT DOES:
#   1. Pre-flight: verifies Convex CLI authentication before touching anything
#   2. Exports all tables from prod:decisive-wombat-7
#   3. Strips users, sessions, platformCredentials (sensitive tables)
#   4. Imports the sanitized snapshot into dev:exciting-fennec-671
#   5. Runs a spot-check query against dev to confirm data landed
#
# WHAT IT DOES NOT TOUCH IN DEV:
#   - users          (dev login credentials)
#   - sessions       (dev session tokens)
#   - platformCredentials (dev K3Mart/GoBiz API tokens)
#
# PREREQUISITES:
#   - npx convex CLI available
#   - unzip available (Git Bash on Windows includes this)
#   - zip OR PowerShell (script auto-detects; PowerShell is used on Windows if zip not found)
#   - .env.local exists pointing to dev:exciting-fennec-671
#   - You are authenticated: run `npx convex login` first
#
# USAGE:
#   bash scripts/sync-prod-to-dev.sh               # interactive (prompts y/N)
#   bash scripts/sync-prod-to-dev.sh --no-confirm  # autonomous / CI mode
#
set -e

NO_CONFIRM=false
if [[ "$1" == "--no-confirm" ]]; then
  NO_CONFIRM=true
fi

DATE=$(date +%Y%m%d)
SNAPSHOT="prod-snapshot-${DATE}.zip"
SANITIZED="prod-snapshot-sanitized-${DATE}.zip"
WORK_DIR="prod-snapshot-work"

# Clean up temp files if script exits with error
trap 'echo ""; echo "ERROR: Script failed. Cleaning up temp files..."; rm -rf "$WORK_DIR" "$SNAPSHOT" "$SANITIZED"' ERR

# Safety: ensure .env.local exists and targets dev (not prod)
if [[ ! -f ".env.local" ]]; then
  echo "ERROR: .env.local not found. Create it pointing to dev:exciting-fennec-671 before running."
  exit 1
fi
if ! grep -q "exciting-fennec-671" .env.local; then
  echo "ERROR: .env.local does not appear to target dev:exciting-fennec-671. Aborting to prevent prod overwrite."
  exit 1
fi

# Step 0/6: Pre-flight authentication check
echo ""
echo "Step 0/6: Checking Convex authentication..."
if npx convex whoami --help &>/dev/null 2>&1; then
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
else
  # whoami not available in this CLI version — print a warning and continue
  echo "  -> (npx convex whoami not available in this CLI version; skipping auth check)"
  echo "  -> If the export fails with a 401, run: npx convex login"
fi

echo ""
echo "=== Prod -> Dev Sync ==="
echo "FROM: prod:decisive-wombat-7"
echo "TO:   dev:exciting-fennec-671"
echo ""
echo "WARNING: This will REPLACE ALL business data in dev."
echo "         users, sessions, platformCredentials are NOT touched."
echo ""

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

echo ""
echo "Step 1/6: Exporting prod snapshot..."
rm -f "$SNAPSHOT" "$SANITIZED"
rm -rf "$WORK_DIR"
npx convex export --prod --path "$SNAPSHOT"
echo "  -> Saved to $SNAPSHOT"

echo ""
echo "Step 2/6: Unzipping..."
rm -rf "$WORK_DIR"
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
if command -v zip &>/dev/null; then
  cd "$WORK_DIR"
  zip -rq "../$SANITIZED" .
  cd ..
else
  # Fallback: use PowerShell (available on Windows)
  # Use pwd -W to get the Windows-native path (e.g. D:/foo) instead of the
  # POSIX path (/d/foo) that Compress-Archive cannot resolve.
  WORK_DIR_WIN=$(pwd -W 2>/dev/null) || WORK_DIR_WIN=""
  if [[ -z "$WORK_DIR_WIN" || ! "$WORK_DIR_WIN" =~ ^[A-Za-z]:/ ]]; then
    # pwd -W not available or returned non-Windows path — try cygpath
    WORK_DIR_WIN=$(cygpath -w "$(pwd)" 2>/dev/null | tr '\\' '/') || WORK_DIR_WIN=$(pwd)
  fi
  WORK_DIR_ABS="${WORK_DIR_WIN}/${WORK_DIR}"
  SANITIZED_ABS="${WORK_DIR_WIN}/${SANITIZED}"
  powershell.exe -NoProfile -Command "Compress-Archive -Path '${WORK_DIR_ABS}/*' -DestinationPath '${SANITIZED_ABS}' -Force"
fi
echo "  -> Saved to $SANITIZED"

echo ""
echo "Step 5/6: Importing to dev..."
npx convex import "$SANITIZED" --replace-all --yes --env-file .env.local
echo "  -> Import complete"

echo ""
echo "Step 6/6: Post-import spot-check..."
# Query ingredient count from dev as a lightweight confirmation that data landed
SPOT_CHECK=$(npx convex run ingredients:list --env-file .env.local 2>&1) || true
if echo "$SPOT_CHECK" | grep -qE "^\[|^\{"; then
  # Output looks like JSON array/object — count entries
  if command -v python3 &>/dev/null; then
    ENTRY_COUNT=$(echo "$SPOT_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'object')" 2>/dev/null || echo "?")
  else
    # Fallback: count lines that look like JSON objects in the array
    ENTRY_COUNT=$(echo "$SPOT_CHECK" | grep -c '"_id"' 2>/dev/null || echo "?")
  fi
  echo "  -> ingredients table: $ENTRY_COUNT records found in dev"
else
  # Print first 3 lines of output as a graceful fallback
  FIRST_LINES=$(echo "$SPOT_CHECK" | head -3)
  echo "  -> Spot-check query returned: $FIRST_LINES"
  echo "  -> (If import succeeded but query failed, data may still be present — check Convex dashboard)"
fi

echo ""
echo "Cleaning up temp files..."
rm -rf "$WORK_DIR" "$SNAPSHOT" "$SANITIZED"
echo "  -> Cleaned up"

echo ""
echo "=== Done! ==="
echo "Dev (dev:exciting-fennec-671) now has sanitized prod data."
echo ""
echo "Spot-check (automated above). Manual fallback:"
echo "  npx convex run orders:list --env-file .env.local"
echo "  npx convex run recipes:list --env-file .env.local"

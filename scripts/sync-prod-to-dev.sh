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
#   - unzip available (Git Bash on Windows includes this)
#   - zip OR PowerShell (script auto-detects; PowerShell is used on Windows if zip not found)
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
  WORK_DIR_ABS=$(pwd)/"$WORK_DIR"
  SANITIZED_ABS=$(pwd)/"$SANITIZED"
  powershell.exe -NoProfile -Command "Compress-Archive -Path '${WORK_DIR_ABS}/*' -DestinationPath '${SANITIZED_ABS}' -Force"
fi
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

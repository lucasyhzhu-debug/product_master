# Design: Prod → Dev Data Sync

**Date:** 2026-02-24
**Purpose:** Refresh dev environment (`dev:exciting-fennec-671`) with sanitized production data from `prod:decisive-wombat-7`
**Frequency:** One-time / occasional (ad-hoc as needed)

---

## Overview

A one-way, full-replace sync from production to dev. Dev data is completely replaced with a sanitized snapshot of production. Three sensitive tables are stripped from the export *before* the data touches dev.

**Direction:** `prod:decisive-wombat-7` → `dev:exciting-fennec-671`
**Mode:** Full replace (`--replace-all`)

---

## Scope

### Tables synced (all ~56 business tables)

All tables **except** the three below. This includes: recipes, packaging, products, ingredients, materials, orders, order items, customers, inventory, production logs, kitchen config/overrides, GoFood depot data, restock data, vouchers, tags, BOM components, menu products, reports, external data, and everything else.

### Tables excluded (stay as-is in dev)

| Table | Reason |
|-------|--------|
| `users` | Dev login credentials should not be replaced |
| `sessions` | Production session tokens have no meaning in dev |
| `platformCredentials` | K3Mart and GoBiz API tokens must stay dev-only to prevent double-writes |

---

## Process

### Shell Script: `scripts/sync-prod-to-dev.sh`

```bash
#!/usr/bin/env bash
# sync-prod-to-dev.sh — Replaces dev data with sanitized prod snapshot
# Safe: strips users, sessions, platformCredentials before import
set -e

SNAPSHOT="prod-snapshot-$(date +%Y%m%d).zip"
WORK_DIR="prod-snapshot-work"

echo "1. Exporting prod snapshot..."
npx convex export --prod --path "$SNAPSHOT"

echo "2. Unzipping..."
mkdir -p "$WORK_DIR"
unzip -q "$SNAPSHOT" -d "$WORK_DIR"

echo "3. Stripping sensitive tables..."
rm -rf "$WORK_DIR/users" "$WORK_DIR/sessions" "$WORK_DIR/platformCredentials"

echo "4. Re-zipping sanitized snapshot..."
SANITIZED="prod-snapshot-sanitized-$(date +%Y%m%d).zip"
cd "$WORK_DIR" && zip -rq "../$SANITIZED" . && cd ..

echo "5. Importing to dev (this will REPLACE ALL dev data)..."
npx convex import "$SANITIZED" --replace-all --yes \
  --env-file .env.local

echo "6. Cleaning up..."
rm -rf "$WORK_DIR" "$SNAPSHOT" "$SANITIZED"

echo "Done! Dev is now a sanitized copy of prod."
```

### Key CLI Flags

| Flag | Purpose |
|------|---------|
| `--prod` (on export) | Reads from `prod:decisive-wombat-7` |
| `--env-file .env.local` (on import) | Targets `dev:exciting-fennec-671` explicitly |
| `--replace-all` | Atomically replaces all dev data |
| `--yes` | Skips confirmation prompt |

---

## Safety

### Cron Safety
Dev has running crons (GoBiz revenue sync, GoBiz/K3Mart token refresh). All crons reference `platformCredentials` — which is *not* imported. Dev's existing credentials stay in place. Crons will no-op or fail gracefully. No risk of double-writes to real platforms.

### Reversibility
The script is destructive to dev. Dev data will be fully replaced. If dev has any in-progress test data worth keeping, note it before running.

### Zip Audit
The script uses date-suffixed filenames (`prod-snapshot-20260224.zip`, `prod-snapshot-sanitized-20260224.zip`). The sanitized zip persists until the final cleanup step — inspect it before cleanup if needed.

---

## Implementation

1. Create `scripts/sync-prod-to-dev.sh` with the script above
2. Make it executable: `chmod +x scripts/sync-prod-to-dev.sh`
3. Add `prod-snapshot*.zip` and `prod-snapshot-work/` to `.gitignore`
4. Document in `docs/ENVIRONMENTS.md` under a "Dev Refresh" section

---

## Success Criteria

- [ ] Script runs without errors
- [ ] `users`, `sessions`, `platformCredentials` tables are unchanged in dev
- [ ] Business data in dev matches prod (spot-check: order count, recipe count)
- [ ] Dev Convex backend still runs: `npx convex dev` starts cleanly
- [ ] Frontend loads with prod data visible

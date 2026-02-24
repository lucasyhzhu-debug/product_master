# Environment Configuration

## Overview

Frollie Recipe Master uses two separate Convex deployments with independent databases and quotas.

---

## Environments

| Aspect | Development | Production |
|--------|-------------|------------|
| **Deployment ID** | `dev:exciting-fennec-671` | `prod:decisive-wombat-7` |
| **Database** | Dev/test data | Live production data |
| **Used By** | Local development (`npx convex dev`) | Vercel + GitHub Actions CI |
| **Deploy Command** | `npx convex dev` (auto) | `npx convex deploy` (CI/CD) |
| **Risk Level** | Low -- dev data | High -- live data |

---

## Local Development

```bash
# Terminal 1: Convex backend (connects to dev:exciting-fennec-671)
npx convex dev

# Terminal 2: Vite frontend
npm run dev
```

The `.env.local` file points to the dev environment. This is gitignored.

---

## Production Deployment

Production deploys happen via CI/CD:
1. Push to `main` triggers GitHub Action
2. GitHub Action runs `npx convex deploy` (targets `prod:decisive-wombat-7`)
3. Vercel rebuilds frontend

Manual production deploy (if needed):
```bash
npx convex deploy
```

---

## Environment Files

| File | Points To | Committed? | Purpose |
|------|-----------|-----------|---------|
| `.env.local` | `dev:exciting-fennec-671` | No (gitignored) | Active local dev config |
| `.env.local.production` | `prod:decisive-wombat-7` | Yes | Production config reference |
| `.env.local.testing` | `dev:exciting-fennec-671` | Yes | Testing config reference |
| `.env` | `prod:decisive-wombat-7` | Yes | Default for CI/CD deploy |
| `.env.example` | Template | Yes | Setup template |

---

## Verify Current Environment

```bash
# Windows
type .env.local | findstr CONVEX_DEPLOYMENT

# Linux/Mac
grep CONVEX_DEPLOYMENT .env.local
```

- `dev:exciting-fennec-671` = Development (safe for testing)
- `prod:decisive-wombat-7` = Production (live data)

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

---

## See Also

- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Testing workflows
- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment
- [CLAUDE.md](../CLAUDE.md) - Project overview

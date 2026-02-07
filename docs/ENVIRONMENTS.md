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

## See Also

- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Testing workflows
- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment
- [CLAUDE.md](../CLAUDE.md) - Project overview

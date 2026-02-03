# RCA Implementation Plan: Kitchen Dynamic Import Incident

**Created:** 2026-02-03
**Status:** Ready for execution
**Prerequisite completed:** CONVEX_DEPLOY_KEY added to GitHub Secrets

## Overview

This plan implements all action items from the RCA (`docs/reports/RCA-2026-02-03-kitchen-dynamic-import.md`).

**User Decisions:**
- Environment Migration: Option B (Proper separation)
- Add CODE_STYLE.md rule for dynamic imports
- Add GitHub Action CI check (lint + auto-deploy)
- Add deployment checklist to WORKFLOW.md

---

## Understanding the Architecture

### How Code and Data Flow

```
+-----------------------------------------------------------------------------+
|                              GIT REPO                                       |
|                         (convex/ = CODE)                                    |
+-----------------------------------------------------------------------------+
            |                    |                         |
       git push            npx convex dev            npx convex deploy
            |                    |                         |
            v                    v                         v
+-------------------+  +---------------------+  +---------------------+
|     GITHUB        |  |   DEV DEPLOYMENT    |  |   PROD DEPLOYMENT   |
|  (stores code,    |  | exciting-fennec-671 |  | decisive-wombat-7   |
|   triggers CI)    |  |                     |  |                     |
+-------------------+  |  CODE + DATA        |  |  CODE + DATA        |
                       +----------+----------+  +----------+----------+
                                  |                        |
                           localhost:5173           Vercel (users)
```

### Key Insight: Code Can Drift!

Each deployment has its OWN copy of code. If you push frontend to GitHub (which auto-deploys to Vercel) but forget `npx convex deploy`, production breaks.

**Solution:** GitHub Action auto-deploys Convex on every push to main.

---

## Part 1: Environment Migration (Tonight)

### Current State

| Convex Label | Deployment ID | Contains | Vercel Points To |
|--------------|---------------|----------|------------------|
| Development | `exciting-fennec-671` | Your REAL data | Yes |
| Production | `decisive-wombat-7` | Empty | No |

### Target State

| Convex Label | Deployment ID | Contains | Vercel Points To |
|--------------|---------------|----------|------------------|
| Development | `exciting-fennec-671` | Backup (kept) | No |
| Production | `decisive-wombat-7` | Your REAL data | Yes |

### Pre-Migration Checklist

- [x] Check decisive-wombat-7 for existing data -> **VERIFIED EMPTY**
- [ ] Ensure no one is using the system (late night)
- [ ] Verify latest code is committed (`bc3163d` - the fix)
- [ ] Have Vercel dashboard open

### Migration Commands (In Order)

```bash
# Step 1: Export current data with files
npx convex export --path ./backups/migration-2026-02-03.zip --include-file-storage

# Step 2: Deploy code to production (schema must exist before import)
npx convex deploy --yes

# Step 3: Import data to production
npx convex import ./backups/migration-2026-02-03.zip --replace-all --prod --yes

# Step 4: Update Vercel environment variables (MANUAL)
# Dashboard -> Settings -> Environment Variables
# Change: VITE_CONVEX_URL = https://decisive-wombat-7.convex.cloud
# Redeploy

# Step 5: Verify
# Visit frollie-product.vercel.app/kitchen
```

### Post-Migration File Updates

**Files to modify:**

1. **`.env`** - Update to proper dev deployment
2. **`.env.local`** - Clear misleading comments
3. **`.env.local.production`** - Point to actual production
4. **`CLAUDE.md`** - Update environment documentation

---

## Part 2: CODE_STYLE.md Update

### Add Section: Convex Runtime Restrictions

**Location:** After "Convex Backend Patterns" section (~line 14)

**Content to add:**

```markdown
### Convex Runtime Restrictions

**CRITICAL: Dynamic imports are NOT supported in Convex**

The Convex serverless runtime runs in restricted V8 isolates that do not support ES dynamic `import()`. This will work locally but **fail silently in production**.

// FORBIDDEN - Will cause 204 No Content in production
export const myQuery = query({
  handler: async (ctx) => {
    const { helper } = await import("./helpers"); // BREAKS IN PRODUCTION
  },
});

// CORRECT - Use static imports at file top
import { helper } from "./helpers";

export const myQuery = query({
  handler: async (ctx) => {
    // Use helper directly
  },
});

**Why this matters:**
- Dynamic imports may work in `npx convex dev` but fail when deployed
- Errors appear as `TypeError: dynamic module import unsupported`
- The query returns 204 No Content with no obvious error to users

**If you have circular dependencies:**
- Restructure code to eliminate the cycle
- Move shared types/interfaces to a separate file
- Never use dynamic imports as a workaround
```

**File:** `docs/CODE_STYLE.md`

---

## Part 3: GitHub Action - Lint + Auto-Deploy

### Why This Matters

```
Without auto-deploy:
  git push -> Vercel deploys frontend -> Calls new mutation -> CRASH
             (Convex still has old code)

With auto-deploy:
  git push -> GitHub Action deploys Convex FIRST -> Vercel deploys -> Works
```

### Create Workflow File

**File:** `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  # Job 1: Lint check (runs on PRs and pushes)
  lint-convex:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check for forbidden dynamic imports
        run: |
          echo "Checking for dynamic imports in convex/ directory..."
          if grep -r "await import(" convex/ --include="*.ts"; then
            echo "ERROR: Dynamic imports found in Convex code!"
            echo "Dynamic import() is not supported in the Convex runtime."
            echo "Use static imports at the top of the file instead."
            exit 1
          fi
          echo "No dynamic imports found"

  # Job 2: Deploy Convex (only on main, runs BEFORE Vercel builds)
  deploy-convex:
    runs-on: ubuntu-latest
    needs: lint-convex  # Only deploy if lint passes
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Deploy to Convex Production
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
        run: npx convex deploy --yes
```

### Also Add npm Script (Optional Convenience)

**File:** `package.json`

Add to scripts:
```json
"lint:convex": "! grep -r 'await import(' convex/ --include='*.ts'"
```

### Setup Already Completed

- [x] Generate Production Deploy Key in Convex Dashboard
- [x] Add `CONVEX_DEPLOY_KEY` to GitHub Secrets (Settings -> Secrets -> Actions)

---

## Part 4: WORKFLOW.md Deployment Checklist

### Add Section: Convex Deployment Checklist

**Location:** After existing deployment/PR sections

**Content to add:**

```markdown
## Convex Deployment Checklist

Use this checklist before deploying any changes that touch `convex/` files.

### Pre-Deployment

- [ ] **No dynamic imports**: Run `npm run lint:convex` or check CI
- [ ] **Schema changes reviewed**: If `schema.ts` changed, verify indexes and field types
- [ ] **Test locally**: Run `npx convex dev` and test the affected features
- [ ] **Check for N+1 queries**: Review any new queries for batch fetching opportunities

### Deployment

- [ ] **Deploy code first**: `npx convex deploy --yes`
- [ ] **Verify in dashboard**: Check Convex dashboard for any errors
- [ ] **Test production**: Visit the affected pages on production URL

### Post-Deployment

- [ ] **Monitor logs**: Watch Convex logs for 5 minutes after deployment
- [ ] **Check Kitchen view**: If orders/kitchen code changed, verify `/kitchen` works
- [ ] **Verify real-time updates**: Test that mutations trigger query updates

### Rollback Plan

If issues occur:
1. Check Convex dashboard logs for error messages
2. If critical: Restore previous code via `git revert` + `npx convex deploy`
3. Data issues: Use `npx convex import` with a recent backup

### Environment Commands Reference

| Command | Target | Use When |
|---------|--------|----------|
| `npx convex dev` | Development | Local development |
| `npx convex dev --once` | Development | One-time push to dev |
| `npx convex deploy` | Production | Ready for users |
| `npx convex export --prod` | Production | Backup production data |
```

**File:** `docs/WORKFLOW.md`

---

## Part 5: Update RCA Document

Mark completed items in the RCA:

**File:** `docs/reports/RCA-2026-02-03-kitchen-dynamic-import.md`

Update action items section to reflect completed status.

---

## Files to Modify

| File | Change |
|------|--------|
| `.env` | Update deployment reference |
| `.env.local` | Remove misleading "Production" comments |
| `.env.local.production` | Point to `decisive-wombat-7` |
| `docs/CODE_STYLE.md` | Add dynamic import restriction section |
| `docs/WORKFLOW.md` | Add Convex deployment checklist |
| `.github/workflows/deploy.yml` | **CREATE** - Lint + auto-deploy |
| `package.json` | Add `lint:convex` script |
| `CLAUDE.md` | Update environment documentation |
| `docs/reports/RCA-2026-02-03-kitchen-dynamic-import.md` | Mark items complete |

---

## Environment Setup Summary

### What Each Service Needs

| Service | Variable | Value | Purpose |
|---------|----------|-------|---------|
| **GitHub Secrets** | `CONVEX_DEPLOY_KEY` | `prod:decisive-wombat-7\|xxx` | CI deploys code |
| **Vercel** | `VITE_CONVEX_URL` | `https://decisive-wombat-7.convex.cloud` | Frontend connects to prod |
| **Local .env.local** | `CONVEX_DEPLOYMENT` | `dev:exciting-fennec-671` | Local dev uses dev DB |

### Update Timing

- **GitHub Secrets**: Already done
- **Vercel**: Update DURING migration (after data import)
- **Local .env.local**: No change needed (stays on dev)

---

## Execution Order

### Tonight (Migration)
1. Run migration commands (Part 1)
2. Update Vercel environment variables
3. Verify production works

### After Migration (Documentation & CI)
4. Update `.env` files (Part 1 file updates)
5. Add CODE_STYLE.md section (Part 2)
6. Create GitHub Action (Part 3)
7. Add WORKFLOW.md checklist (Part 4)
8. Update RCA document (Part 5)
9. Commit all changes

---

## Verification

### Migration Verification
1. `frollie-product.vercel.app/kitchen` loads and shows orders
2. `npx convex dev` connects to development (backup data visible)
3. Create test order in dev -> does NOT appear in production

### CI Verification
1. Create test branch with `await import(` in convex/
2. Push -> GitHub Action should fail
3. Remove dynamic import -> GitHub Action passes

### Documentation Verification
1. CODE_STYLE.md has new section
2. WORKFLOW.md has deployment checklist
3. CLAUDE.md reflects correct environment setup

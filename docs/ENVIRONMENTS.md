# Environment Configuration

## Overview

Frollie Recipe Master supports multiple Convex deployments to enable **safe testing** alongside **live production**.

---

## Environment Comparison

| Aspect | Production | Testing |
|--------|-----------|---------|
| **Deployment ID** | `dev:exciting-fennec-671` | `dev:exciting-fennec-671:testing` |
| **Database** | Live customer orders, recipes | Test data only |
| **Frontend URL** | http://localhost:5173 | http://localhost:5173 (or :5174) |
| **Backend Code** | Same (`convex/`) | Same (`convex/`) |
| **Schema** | Same (`convex/schema.ts`) | Same (`convex/schema.ts`) |
| **Data Isolation** | Production data | Testing data |
| **Purpose** | Real business operations | Development & testing |
| **Risk Level** | 🔴 High - affects real orders | 🟢 Low - isolated test data |

---

## Switching Environments

### Quick Switch (NPM Scripts)

```bash
# Switch to testing
npm run env:testing

# Switch to production
npm run env:prod
```

### Manual Switch

```bash
# Switch to testing
cp .env.local.testing .env.local

# Switch to production
cp .env.local.production .env.local
```

**After switching:**
```bash
npx convex dev   # Restart backend (REQUIRED)
npm run dev      # Restart frontend
```

---

## Environment Files

### .env.local (Active - DO NOT EDIT)

This file is **auto-generated** by `npm run env:*` commands. Never edit it manually.

```bash
# Current active environment
CONVEX_DEPLOYMENT=dev:exciting-fennec-671          # or :testing
VITE_CONVEX_URL=https://exciting-fennec-671.convex.cloud
VITE_CONVEX_SITE_URL=https://exciting-fennec-671.convex.site
```

**Committed?** ❌ No (gitignored via `.env*.local`)

---

### .env.local.production

Production deployment configuration.

```bash
VITE_CONVEX_URL="https://exciting-fennec-671.convex.cloud"
CONVEX_DEPLOYMENT=dev:exciting-fennec-671
VITE_CONVEX_SITE_URL=https://exciting-fennec-671.convex.site
```

**Committed?** ✅ Yes (safe - no secrets)

**When to use:**
- Running production frontend locally
- Viewing real customer orders
- Generating production reports

---

### .env.local.testing

Testing deployment configuration.

```bash
CONVEX_DEPLOYMENT=dev:exciting-fennec-671:testing
VITE_CONVEX_URL=https://exciting-fennec-671.convex.cloud
VITE_CONVEX_SITE_URL=https://exciting-fennec-671.convex.site
```

**Committed?** ✅ Yes (safe - no secrets)

**When to use:**
- Testing new features
- Experimenting with ball distribution
- Testing schema changes
- Debugging without production risk

---

## When to Use Each Environment

### Use Production When:

- ✅ Viewing real orders
- ✅ Generating customer WhatsApp receipts
- ✅ Managing live kitchen operations
- ✅ Viewing production metrics
- ✅ Creating reports for management

### Use Testing When:

- ✅ Testing new features before release
- ✅ Experimenting with ball distribution logic
- ✅ Testing schema migrations
- ✅ Debugging complex order flows
- ✅ Training new team members
- ✅ Testing UI changes
- ✅ Verifying WhatsApp message formatting

---

## Database Isolation

### How It Works

Each deployment has a **completely separate database**:

```
Production Database              Testing Database
├── 50 recipes                  ├── 5 test recipes
├── 200 orders                  ├── 10 test orders
├── 30 customers                ├── 3 test customers
└── Live kitchen data           └── Test kitchen data
```

**Key Points:**
- Changes in testing **never** affect production
- Data is **not synced** between environments
- Schema changes apply to **both** (on deploy)

---

## Convex Dashboard Access

Each environment has its own dashboard:

### Production Dashboard
```bash
npm run env:prod
npx convex dashboard
```

View: Live orders, real customer data, production metrics

### Testing Dashboard
```bash
npm run env:testing
npx convex dashboard
```

View: Test orders, sample data, development metrics

---

## Schema Management

### Schema is Shared

Both environments use the **same schema** from `convex/schema.ts`.

When you edit `convex/schema.ts`:
1. Change applies to **active environment** when `npx convex dev` runs
2. Deploy to production: `npm run env:prod && npx convex deploy`
3. Deploy to testing: `npm run env:testing && npx convex deploy`

### Testing Schema Changes

**Always test schema changes in testing first:**

```bash
# 1. Switch to testing
npm run env:testing

# 2. Edit convex/schema.ts
# Add new field to orders table

# 3. Start Convex dev (auto-migrates)
npx convex dev

# 4. Verify migration succeeded in dashboard
npx convex dashboard

# 5. Test UI with new field
npm run dev

# 6. If successful, deploy to production
npm run env:prod
npx convex deploy
```

---

## Data Management

### Copy Production Data to Testing

```bash
# 1. Export from production
npm run env:prod
npx convex export --output prod-backup.zip

# 2. Switch to testing
npm run env:testing

# 3. Import to testing (replaces all data)
npx convex import --replace prod-backup.zip
```

**Use cases:**
- Testing with realistic data volumes
- Reproducing production bugs
- Training with real-world scenarios

---

### Reset Testing Database

```bash
npm run env:testing
npx convex deploy --reset-tables
```

**Warning:** This **deletes all data** in the testing environment.

---

## Running Both Environments Simultaneously

### Option 1: Same Machine, Different Ports

**Terminal 1 (Production):**
```bash
npm run env:prod
npx convex dev
npm run dev              # Port 5173
```

**Terminal 2 (Testing):**
```bash
npm run env:testing
npx convex dev --url https://exciting-fennec-671.convex.cloud
PORT=5174 npm run dev    # Port 5174
```

Access:
- Production: http://localhost:5173
- Testing: http://localhost:5174

### Option 2: Different Machines

Run production on your main computer, testing on a laptop.

### Option 3: Different Browser Profiles

Use Chrome profiles or different browsers (Chrome for prod, Firefox for testing).

---

## Environment Verification

### Check Current Environment

**Windows:**
```bash
type .env.local | findstr CONVEX_DEPLOYMENT
```

**Linux/Mac:**
```bash
cat .env.local | grep CONVEX_DEPLOYMENT
```

**Output:**
- `dev:exciting-fennec-671` → You're on **production**
- `dev:exciting-fennec-671:testing` → You're on **testing**

### Visual Indicators

Add to your frontend (optional):

```tsx
// src/components/layout/Header.tsx
const isProduction = import.meta.env.VITE_CONVEX_URL?.includes(':testing')
  ? false
  : true;

{!isProduction && (
  <div className="bg-yellow-500 text-black px-2 py-1 text-xs font-bold">
    TESTING
  </div>
)}
```

---

## Best Practices

### DO ✅

- **Always** switch environments explicitly before starting work
- **Test** destructive operations in testing first
- **Backup** production data before major changes
- **Document** any manual data fixes in both environments
- **Verify** current environment before running mutations
- **Seed** testing with realistic data

### DON'T ❌

- Don't assume you're in the right environment
- Don't test directly on production
- Don't share `.env.local` (it's auto-generated)
- Don't edit `.env.local` manually (use `npm run env:*`)
- Don't commit `.env.local` (it's gitignored)
- Don't forget to restart `npx convex dev` after switching

---

## Troubleshooting

### "Wrong deployment" Error

**Problem:** Frontend connected to different deployment than backend.

**Solution:**
```bash
# 1. Check active environment
type .env.local

# 2. Restart Convex dev server
npx convex dev

# 3. Restart frontend
npm run dev
```

---

### Schema Mismatch Between Environments

**Problem:** Testing has newer schema than production.

**Solution:**
```bash
# Deploy schema to production
npm run env:prod
npx convex deploy
```

---

### Port Conflict

**Problem:** `npm run dev` fails - port already in use.

**Solution:**
```bash
# Use different port
PORT=5174 npm run dev
```

---

### Can't Switch Environments

**Problem:** `npm run env:testing` doesn't change anything.

**Solution:**
```bash
# Manually copy
cp .env.local.testing .env.local

# Verify
type .env.local

# Restart servers
npx convex dev
npm run dev
```

---

## Adding New Environments

Want staging? QA? Demo?

### Step 1: Create Config File

```bash
# .env.local.staging
CONVEX_DEPLOYMENT=dev:exciting-fennec-671:staging
VITE_CONVEX_URL=https://exciting-fennec-671.convex.cloud
VITE_CONVEX_SITE_URL=https://exciting-fennec-671.convex.site
```

### Step 2: Update Switch Script

Edit `scripts/switch-env.js`:

```js
const envMap = {
  testing: '.env.local.testing',
  production: '.env.local.production',
  staging: '.env.local.staging',  // Add this
  prod: '.env.local.production',
  test: '.env.local.testing',
};
```

### Step 3: Add NPM Script

Edit `package.json`:

```json
"scripts": {
  "env:staging": "node scripts/switch-env.js staging"
}
```

### Step 4: Use It

```bash
npm run env:staging
npx convex dev
npm run dev
```

---

## Security Considerations

### Safe to Commit

✅ `.env.local.production` - No secrets, just deployment names
✅ `.env.local.testing` - No secrets, just deployment names
✅ `.env.example` - Template file

### Never Commit

❌ `.env.local` - Auto-generated
❌ `.env` - May contain local overrides
❌ API keys, passwords, tokens

---

## See Also

- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Full testing workflows
- [TESTING_QUICK_START.md](../TESTING_QUICK_START.md) - 5-minute quick start
- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment
- [CLAUDE.md](../CLAUDE.md) - Project overview

---

**Questions?** Check [Convex Docs](https://docs.convex.dev) or ask the team.

# Testing Guide

## Overview

**Updated 2026-02-03:** We now have separate development and production environments.

This guide explains the dual-environment setup and best practices for testing.

---

## Current Setup

You have **two Convex deployments**:

| Environment | Deployment ID | Database | Used By |
|-------------|---------------|----------|---------|
| **Production** | `prod:decisive-wombat-7` | Production data (real users) | Vercel, GitHub Actions |
| **Development** | `dev:exciting-fennec-671` | Test/dev data | Local development |

**Key Points:**
- Local `npx convex dev` connects to the **development** database
- Pushing to `main` deploys to **production** via GitHub Actions
- The two databases are completely isolated

---

## Recommended Workflow

### Development Mode (Default)

Since you're still in development and don't have real production users yet, treat your current database as a development database:

```bash
# Start development
npx convex dev      # Terminal 1
npm run dev         # Terminal 2
```

### When You Need Clean Data

If your database gets cluttered with test data, you can clean it:

```bash
# Via Convex Dashboard
npx convex dashboard
# Functions tab → Run: orders/deleteAll:deleteAllOrders

# This deletes:
# - All orders
# - All customers
# - All kitchen inventory
# - All production records
```

⚠️ **Warning:** The delete script removes ALL orders and customers. Use carefully!

---

## Environment Isolation (Active)

**We now have proper environment separation:**

| What You Do | Where It Goes | Impact |
|-------------|---------------|--------|
| `npx convex dev` | Development (`exciting-fennec-671`) | Only you see changes |
| `git push origin main` | Production (`decisive-wombat-7`) | Real users see changes |

### Local Development Workflow

```bash
# Terminal 1: Convex dev server (connects to dev database)
npx convex dev

# Terminal 2: Vite dev server
npm run dev

# Make changes, test locally
# Changes only affect development database
```

### Deploying to Production

```bash
# 1. Commit your changes
git add .
git commit -m "feat: my feature"

# 2. Push to main
git push origin main

# 3. GitHub Action automatically:
#    - Runs lint check (no dynamic imports)
#    - Deploys Convex to production
#    - Triggers Vercel rebuild
```

### Comparing Environments

```bash
# Check development data
npx convex data orders

# Check production data
npx convex data orders --prod
```

---

## Best Practices (Current Setup)

Since you're using a shared database, follow these practices:

### 1. Use Clear Naming Conventions

Mark test data clearly:
- Test customers: "TEST - Customer Name"
- Test orders: Add "TEST" in notes field
- Easy to identify and delete later

### 2. Regular Cleanup

Clean test data periodically:
```bash
npx convex dashboard
# Run: orders/deleteAll:deleteAllOrders
```

### 3. Backup Before Major Changes

Export your database before risky operations:
```bash
npx convex export --output backup-$(date +%Y%m%d).zip
```

### 4. Document Real vs Test Data

Keep track of what's real:
- Real recipes/products: Document in a README
- Test orders: Delete frequently
- Real customers: Back up before cleanup

---

## Database Management

### Export Database

```bash
npx convex export --output production-backup.zip
```

### Import Database

```bash
npx convex import production-backup.zip
```

### Clear All Orders & Customers

```bash
npx convex dashboard
# Functions → orders/deleteAll:deleteAllOrders
```

This deletes:
- ✅ All orders
- ✅ All order items
- ✅ All customers
- ✅ Kitchen inventory
- ✅ Production records

This preserves:
- ✅ Recipes
- ✅ Packaging
- ✅ Products
- ✅ Ingredients
- ✅ Materials
- ✅ Tags

---

## Environment Switching Scripts

The environment switcher scripts were created for future use when you have separate deployments. Currently, both "production" and "testing" point to the same database.

```bash
# These currently do the same thing
npm run env:prod
npm run env:testing
```

They're ready for when you create a separate testing project!

---

## When to Create Separate Testing Environment

Create a separate testing Convex project when:

1. **You have real customers** using the system
2. **Real orders** are being processed
3. **Production data** must never be deleted
4. **Testing could disrupt** real operations

Until then, the shared database is fine for development.

---

## Deployment Names Explained

**Current (Single Deployment):**
```
CONVEX_DEPLOYMENT=dev:exciting-fennec-671
└─ One database for everything
```

**Future (Separate Projects):**
```
Production Project:
CONVEX_DEPLOYMENT=dev:exciting-fennec-671
└─ Real customer data

Testing Project:
CONVEX_DEPLOYMENT=dev:testing-fennec-999
└─ Test data only
```

**Future (Convex Pro):**
```
CONVEX_DEPLOYMENT=prod:exciting-fennec-671  # Production
CONVEX_DEPLOYMENT=dev:exciting-fennec-671   # Testing
```

---

## Common Scenarios

### Scenario 1: Testing New Feature

```bash
# 1. Develop feature normally
npx convex dev
npm run dev

# 2. Test with sample data
# Create test orders/customers in UI

# 3. When done, clean up
npx convex dashboard
# Run: orders/deleteAll:deleteAllOrders
```

### Scenario 2: Database Got Messy

```bash
# 1. Export current state (backup)
npx convex export --output backup.zip

# 2. Clear orders/customers
npx convex dashboard
# Run: orders/deleteAll:deleteAllOrders

# 3. Continue with clean database
```

### Scenario 3: Need to Restore Data

```bash
# If you have a backup
npx convex import --replace backup.zip

# Warning: This replaces ALL data
```

---

## Summary

**Current Reality:**
- ✅ One database for everything
- ✅ Delete test data when needed
- ✅ Perfect for development phase

**Future Options:**
- 🔄 Separate Convex project (free, true isolation)
- 💰 Convex Pro (paid, multiple deployments)
- 📦 Current setup works until you have real users

**Next Steps:**
1. Continue developing with current setup
2. Use `orders/deleteAll:deleteAllOrders` to clean data
3. When you launch to real users, create separate testing project

---

## See Also

- [ENVIRONMENTS.md](ENVIRONMENTS.md) - Environment configuration details
- [CLAUDE.md](../CLAUDE.md) - Project overview
- [Convex Docs](https://docs.convex.dev) - Official documentation

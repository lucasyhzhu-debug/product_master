# Testing Guide

## Overview

**IMPORTANT:** Convex's free tier provides a **single dev deployment** per project. This means production and testing share the same database. For true isolation, you would need a separate Convex project or upgrade to Convex Pro.

This guide explains best practices for testing while using a shared database.

---

## Current Setup

You have **one Convex deployment**:
- **Deployment:** `dev:exciting-fennec-671`
- **Database:** Single shared database
- **Usage:** Both development and production use the same data

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

## Future: Separate Testing Environment

When you're ready to deploy to real production users, you have these options:

### Option 1: Separate Convex Project (Free)

Create a second Convex project for testing:

1. Go to [convex.dev](https://convex.dev)
2. Create a new project called "product-master-testing"
3. Update `.env.local.testing`:
   ```bash
   VITE_CONVEX_URL=https://new-testing-deployment.convex.cloud
   CONVEX_DEPLOYMENT=dev:new-testing-deployment
   ```
4. Now you have true isolation:
   - Production: `exciting-fennec-671`
   - Testing: `new-testing-deployment`

### Option 2: Upgrade to Convex Pro

Convex Pro supports multiple deployments within a single project:
- `prod` deployment for production users
- `dev` deployment for development/testing
- Costs money but provides seamless environment switching

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

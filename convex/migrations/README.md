# Inventory System Migration Guide

## Overview

This directory contains migration scripts for the Inventory Management System (Wave 1).

## Migration Status

**Branch:** `feature/inventory-management-system`

**Wave 1: Schema Foundation & Migration** - ✅ COMPLETE

## Tables Added

### 1. componentTypes
Unified component types for both production and packaging.

**Categories:**
- `production`: Kitchen-produced items (Big Ball, Mid Ball) - NOT tracked in inventory
- `direct_packaging`: Auto-included with products (boxes, stickers) - Tracked in inventory
- `indirect_packaging`: Sold as separate line items (brochures, bags) - Tracked in inventory

**Key Fields:**
- `code`: Unique code (e.g., "BIG_BALL", "LONG_BOX")
- `category`: Component category (see above)
- `trackInventory`: Boolean (false for production, true for packaging)
- `unitCostIdr`: Cost per unit
- `reorderPoint`: Alert threshold for inventory

**Indexes:**
- `by_code`: Lookup by code
- `by_category`: Filter by category
- `by_active`: Active components only
- `by_track_inventory`: Components that track inventory

### 2. storageLocations
Physical storage locations for inventory.

**Locations (seeded):**
- Kitchen (locationType: "kitchen")
- Office (locationType: "office", isDefault: true)
- Legato Goldfinch (locationType: "venue")

**Indexes:**
- `by_type`: Filter by location type
- `by_active`: Active locations
- `by_default`: Get default location

### 3. inventoryBatches
FIFO batch tracking with purchase history.

**Purpose:** Track each purchase/receipt as a separate batch for accurate FIFO consumption and cost tracking.

**Key Fields:**
- `componentTypeId`: Which component
- `locationId`: Where stored
- `purchaseDate`: When received (used for FIFO ordering)
- `quantityRemaining`: Current stock in this batch
- `quantityReserved`: Reserved for confirmed orders
- `unitCostIdr`: Actual cost per unit for this batch
- `status`: "active", "depleted", or "expired"

**Indexes:**
- `by_fifo`: FIFO ordering (componentTypeId, locationId, purchaseDate)
- `by_component`: All batches for a component
- `by_location`: All batches at a location
- `by_status`: Filter by status

### 4. componentStock
Aggregated stock view (computed from batches).

**Purpose:** Fast queries for stock levels without scanning all batches.

**Key Fields:**
- `totalStock`: Sum of quantityRemaining across all active batches
- `totalReserved`: Sum of quantityReserved across all active batches
- `weightedUnitCostIdr`: Weighted average cost across batches
- `latestSupplierName`: For quick reordering

**Indexes:**
- `by_component`: Stock for a component
- `by_location`: All stock at a location
- `by_component_location`: Specific component at specific location

### 5. componentTransactions
Audit log of all inventory movements.

**Transaction Types:**
- `receive`: New batch received
- `consume`: Used for order (FIFO deduction)
- `reserve`: Reserved for confirmed order
- `unreserve`: Released (order cancelled)
- `adjust`: Physical count adjustment
- `transfer_out` / `transfer_in`: Between locations
- `expire`: Batch expired

**Indexes:**
- `by_component`: All transactions for a component
- `by_location`: All transactions at a location
- `by_batch`: Transactions for a specific batch
- `by_order`: Transactions linked to an order

### 6. orderComponentReservations
Track reserved stock per order.

**Purpose:** Link orders to inventory reservations. When order is confirmed, reserve stock. When order is complete/cancelled, consume or release.

**Status Flow:**
- `reserved`: Stock reserved on order confirm
- `consumed`: Stock deducted on order complete
- `released`: Stock released on order cancel

**Indexes:**
- `by_order`: All reservations for an order
- `by_component`: Orders using this component
- `by_status`: Filter by status

---

## Migration Scripts

### migrateProductionUnitTypes

**Location:** `convex/migrations/inventorySetup.ts`

**Purpose:** Migrate existing `productionUnitTypes` → `componentTypes` with `category="production"`.

**Run From:** Convex Dashboard → Functions → `migrations/inventorySetup:migrateProductionUnitTypes`

**What It Does:**
1. Reads all records from `productionUnitTypes`
2. Creates matching `componentTypes` records with:
   - `category`: "production"
   - `trackInventory`: false (production is made to order)
   - `unit`: "pcs"
   - All other fields copied (code, name, gramsPerUnit, unitCostIdr, etc.)
3. Returns migration map: `{ oldId → newId }`

**Safety:**
- Idempotent: Skips if component with same `code` already exists
- Non-destructive: Does NOT delete `productionUnitTypes` (kept as backup)
- Rollback available: See `rollbackProductionMigration`

**After Migration:**
- Keep `productionUnitTypes` table for 1 week as backup
- Verify with: Query `componentTypes` with `by_category` index for `category="production"`

### rollbackProductionMigration

**Purpose:** Delete all migrated `componentTypes` if migration needs to be reversed.

**Warning:** Does NOT restore `productionUnitTypes`. Use database backup (`npx convex export`) for full rollback.

---

## Seed Scripts

### seedProductionComponents

**Location:** `convex/componentTypes/seed.ts`

**Purpose:** Seed initial production components (Big Ball, Mid Ball).

**Run From:** Convex Dashboard → Functions → `componentTypes/seed:seedProductionComponents`

**Data Seeded:**
```typescript
BIG_BALL:
  name: "Big Ball"
  category: "production"
  gramsPerUnit: 80
  unitCostIdr: 18231
  unit: "pcs"
  trackInventory: false
  color: "#93C572" (pistachio green)

MID_BALL:
  name: "Mid Ball"
  category: "production"
  gramsPerUnit: 45
  unitCostIdr: 11422
  unit: "pcs"
  trackInventory: false
  color: "#93C572" (pistachio green)
```

**Safety:** Idempotent (skips if already exists)

### seedStorageLocations

**Location:** `convex/componentTypes/seed.ts`

**Purpose:** Seed storage locations.

**Run From:** Convex Dashboard → Functions → `componentTypes/seed:seedStorageLocations`

**Data Seeded:**
```typescript
Kitchen:
  locationType: "kitchen"
  isDefault: false

Office:
  locationType: "office"
  isDefault: true  ← Default location

Legato Goldfinch:
  locationType: "venue"
  isDefault: false
```

**Safety:** Idempotent (skips if already exists)

### seedAll

**Convenience function** to run both seed functions at once.

**Run From:** Convex Dashboard → Functions → `componentTypes/seed:seedAll`

---

## Deployment Checklist

Before deploying to production:

- [ ] Backup production database: `npx convex export --deployment prod:decisive-wombat-7`
- [ ] Tag commit: `git tag pre-inventory-$(date +%Y%m%d)`
- [ ] Verify schema compiles: `npx convex dev --once`
- [ ] Verify type check passes: `npm run type-check`
- [ ] Deploy: `git push origin feature/inventory-management-system`
- [ ] Run migration: `migrations/inventorySetup:migrateProductionUnitTypes`
- [ ] Run seeds: `componentTypes/seed:seedAll`
- [ ] Verify tables exist in dashboard
- [ ] Keep `productionUnitTypes` table for 1 week as backup

## Rollback Plan

If deployment fails:

1. Revert commit: `git revert HEAD`
2. Redeploy: `git push origin feature/inventory-management-system`
3. Restore database: `npx convex import backup-2026-02-05.zip --replace`

---

## Next Steps (Wave 2)

After Wave 1 is deployed:

- [ ] Create `convex/componentTypes/queries.ts` (list, get, getByCode)
- [ ] Create `convex/componentTypes/mutations.ts` (create, update, delete)
- [ ] Create `convex/inventory/mutations.ts` (receiveStock, adjustStock, transferStock)
- [ ] Create `convex/inventory/fifo.ts` (FIFO consumption logic)
- [ ] Create `convex/inventory/queries.ts` (getLowStockAlerts, getInventoryReport)
- [ ] Create `convex/inventory/helpers.ts` (weighted average cost calculation)

See plan: `C:\Users\Irfan\.claude\plans\cozy-bubbling-hopper.md` (Wave 2 section)

---

## Verification Commands

```bash
# Start Convex dev server
npx convex dev

# Open dashboard
npx convex dashboard

# Run type check
npm run type-check

# Run build
npm run build
```

**In Dashboard → Functions Tab:**
```
# Run migration
migrations/inventorySetup:migrateProductionUnitTypes

# Run seeds
componentTypes/seed:seedAll

# Or run individually:
componentTypes/seed:seedProductionComponents
componentTypes/seed:seedStorageLocations
```

**In Dashboard → Data Tab:**
- Verify `componentTypes` table has 2 production components (BIG_BALL, MID_BALL)
- Verify `storageLocations` table has 3 locations (Kitchen, Office, Legato Goldfinch)
- Check indexes are created (22 new indexes total)

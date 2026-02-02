# Dual-Write System Audit Report

**Date:** 2026-02-02
**Branch:** refactor/remove-dual-write
**Status:** YELLOW - 60% Migration Ready

---

## Executive Summary

The Kitchen View maintains two parallel tracking systems:
- **OLD System:** `orderItems.ballsRemaining` (deprecated)
- **NEW System:** `orderItemProduction.unitsRemaining` + `orderItems.ballsFilled/packageStatus`

The codebase is in a **stable dual-write state** with clear deprecation markings. The main blocker for full migration is the **order completion logic** which still reads from the OLD system.

---

## Reference Summary

| Category | Count | Files |
|----------|-------|-------|
| Schema Definitions | 1 | `convex/schema.ts` |
| Backend Writes | 9 | `mutations.ts`, `ballDistribution.ts` |
| Backend Reads | 4 | `ballDistribution.ts`, `mutations.ts` |
| Frontend Usage | 5 | `useKitchenStats.ts`, `PackageStatusDisplay.tsx` |
| Documentation | 16 | Various docs |

**Total Active Code References:** 18

---

## OLD System (ballsRemaining) Usage

### Backend Writes (9 locations)

| File | Line | Operation | Notes |
|------|------|-----------|-------|
| `mutations.ts` | 257-259 | `createOrder` | Initialize on order creation |
| `mutations.ts` | 320 | `createOrder` | Copy to item |
| `mutations.ts` | 646 | `addItem` | Initialize for new item |
| `mutations.ts` | 666 | `addItem` | Insert to DB |
| `mutations.ts` | 778-788 | `updateItemQuantity` | Recalculate |
| `mutations.ts` | 848 | `completeOrder` | Zero all items (DEPRECATED) |
| `mutations.ts` | 888 | `revertToConfirmed` | Reset to productionUnits (DEPRECATED) |
| `ballDistribution.ts` | 205 | `addBallsToTray` | Decrement |
| `ballDistribution.ts` | 213 | `completeBalls` | Decrement |

### Backend Reads (4 locations)

| File | Line | Operation | Notes |
|------|------|-----------|-------|
| `ballDistribution.ts` | 188 | Read current value | For ball allocation |
| `ballDistribution.ts` | 273 | Completion check | **CRITICAL** - determines order complete |
| `mutations.ts` | 1005 | Backfill helper | Migration utility |
| `mutations.ts` | 1006 | Backfill helper | Calculate completion |

### Frontend Usage (5 locations)

| File | Line | Usage |
|------|------|-------|
| `useKitchenStats.ts` | 53 | Type interface |
| `useKitchenStats.ts` | 154 | Transform to snake_case |
| `PackageStatusDisplay.tsx` | 20 | Type interface |
| `PackageStatusDisplay.tsx` | 107 | Display calculation |

---

## NEW System Coverage

### Schema Definition

**orderItems table additions:**
- `packageStatus`: "empty" | "filling" | "filled" | "packed"
- `ballsFilled`: number

**orderItemProduction table:**
- `unitsRequired`: Total units needed
- `unitsCompleted`: Units already produced
- `unitsRemaining`: Units still needed

### Backend Support

| Helper | NEW System Usage | Status |
|--------|------------------|--------|
| `productionRecords.ts` | Full CRUD for `orderItemProduction` | Complete |
| `ballDistribution.ts` | Dual-write to `unitsCompleted/unitsRemaining` | Active |
| `statusTransitions.ts` | Uses `packageStatus` | Complete |

### Frontend Support

| Component | Fields Used | Status |
|-----------|-------------|--------|
| `ProductPackage.tsx` | `ballsFilled`, `packageStatus` | Complete |
| `PackageStatusDisplay.tsx` | `ballsFilled`, `packageStatus` | Complete |

---

## Critical Issue: Completion Logic

**Location:** `convex/orders/helpers/ballDistribution.ts` lines 264-274

```typescript
// Check if ALL items in the order have ballsRemaining = 0
const allComplete = itemsWithProductionData.every((item) => {
  const updatedValue = updatedBallsRemaining.get(item._id.toString());
  if (updatedValue !== undefined) {
    return updatedValue <= 0;
  }
  return (item.ballsRemaining ?? 0) <= 0;  // <-- READS OLD SYSTEM
});
```

**Impact:** Order completion is determined by OLD system, not NEW system.

**Required Fix:** Change to read from `orderItemProduction.unitsRemaining` instead.

---

## Migration Plan

### Phase A: Verification (COMPLETE)
- [x] Audit OLD system references
- [x] Verify NEW system coverage
- [x] Document discrepancies

### Phase B: Query Migration
- [ ] Update completion logic in `ballDistribution.ts`
- [ ] Update `KitchenView.tsx` to use NEW fields
- [ ] Update dashboard queries

### Phase C: Write Migration
- [ ] Remove OLD writes from `ballDistribution.ts`
- [ ] Remove deprecated writes from `completeOrder`
- [ ] Remove deprecated writes from `revertToConfirmed`

### Phase D: Cleanup
- [ ] Mark `ballsRemaining` deprecated in schema
- [ ] Update documentation
- [ ] Create migration guide

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Completion logic reads OLD | HIGH | Phase B fix |
| Data inconsistency | MEDIUM | Dual-write prevents |
| Frontend display breaks | LOW | Both fields available |

---

## Files Requiring Changes

### Phase B (Query Migration)
1. `convex/orders/helpers/ballDistribution.ts` - Completion logic
2. `src/pages/KitchenView.tsx` - UI reads (if any)

### Phase C (Write Migration)
1. `convex/orders/helpers/ballDistribution.ts` - Remove OLD writes
2. `convex/orders/mutations.ts` - Remove deprecated writes

### Phase D (Cleanup)
1. `convex/schema.ts` - Deprecation comment
2. `docs/SCHEMA.md` - Documentation
3. `docs/CHANGELOG.md` - Migration notes

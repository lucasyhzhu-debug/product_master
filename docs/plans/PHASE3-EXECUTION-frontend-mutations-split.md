# Phase 3: Frontend & Mutations Split - Execution Plan

**Branch:** refactor/phase3-frontend
**Date:** 2026-02-02
**Status:** IN PROGRESS
**CTO Approval:** Full autonomy granted

---

## Objectives

1. **Split mutations.ts** (1783 lines → 5 files <400 lines each)
2. **Extract usePendingBallStats() hook** (eliminate KitchenView duplication)
3. **Fix type safety** (replace Record<string, unknown>)
4. **Verify mobile responsive** (280px minimum)

---

## Current State Analysis

### mutations.ts Structure (1783 lines)
| Section | Lines | Functions | Target File |
|---------|-------|-----------|-------------|
| Order CRUD | ~500 | create, cancel, remove, completeOrder, revertToConfirmed | orderCrud.ts |
| Item CRUD | ~200 | addItem, removeItem, updateItemQuantity | itemCrud.ts |
| Status Updates | ~300 | updateStatus, updatePayment, updateShipping, updateDetails | statusUpdates.ts |
| Kitchen Operations | ~400 | addBallsToTray, fillPendingOrders, completeBalls, removeBallFromTray | kitchen.ts |
| Packaging | ~200 | markPackagePacked, unmarkPackagePacked, completePackaging, revertToPackaging | packaging.ts |
| Migrations | ~183 | backfillOrderItemProduction, migrateChannelCodes, backfillProductionRecords | migrations.ts |

### Type Safety Issues
- Line 352: `const updates: Record<string, unknown> = { status: args.status };`
- Line 454: `const patchData: Record<string, unknown> = {};`

### Frontend Duplication
- `src/pages/KitchenView.tsx` lines 84-100: Inline calculation of pending ball stats
- Should be extracted to `src/hooks/convex/usePendingBallStats.ts`

---

## Implementation Tasks

### Task 1: Create Mutations Directory Structure

**1.1 Create orderCrud.ts**
- Functions: create, cancel, remove, completeOrder, revertToConfirmed, updateOrderDiscount
- Dependencies: generateOrderNumber, calculateLineTotals, recalculateFinalTotal
- Helpers: logOrderEvent, isTerminalStatus, incrementChannelUsage, cancelOrderProductionRecords, etc.
- Estimated lines: ~380

**1.2 Create itemCrud.ts**
- Functions: addItem, removeItem, updateItemQuantity
- Dependencies: calculateLineTotals, recalculateFinalTotal
- Helpers: createProductionRecordsForItem, updateProductionRecordsForQuantityChange, deleteProductionRecordsForItem
- Estimated lines: ~200

**1.3 Create statusUpdates.ts**
- Functions: updateStatus, updatePayment, updateShipping, updateDetails
- Dependencies: None (pure patches)
- Helpers: incrementChannelUsage, decrementChannelUsage, incrementShippingAgencyUsage, decrementShippingAgencyUsage
- Estimated lines: ~250

**1.4 Create kitchen.ts**
- Functions: addBallsToTray, fillPendingOrders, completeBalls, removeBallFromTray
- Dependencies: distributeBallsToOrders helper
- Helper: getOrCreateTodayInventory (move from mutations.ts)
- Estimated lines: ~300

**1.5 Create packaging.ts**
- Functions: markPackagePacked, unmarkPackagePacked, markAllItemPackagesPacked, completePackaging, revertToPackaging
- Dependencies: None
- Helpers: logOrderEvent
- Estimated lines: ~380

**1.6 Create migrations.ts**
- Functions: backfillOrderItemProduction, migrateChannelCodes, backfillProductionRecords
- Dependencies: None
- Helpers: None
- Estimated lines: ~180

**1.7 Create index.ts (barrel export)**
```typescript
// Export all mutations from domain files
export * from "./orderCrud";
export * from "./itemCrud";
export * from "./statusUpdates";
export * from "./kitchen";
export * from "./packaging";
export * from "./migrations";
```

**1.8 Update convex/orders/mutations.ts**
Replace entire file with:
```typescript
// DEPRECATED: This file has been split into domain-specific files
// Import from convex/orders/mutations/* instead
//
// Migration guide:
// - Order CRUD: ./mutations/orderCrud
// - Item CRUD: ./mutations/itemCrud
// - Status Updates: ./mutations/statusUpdates
// - Kitchen Operations: ./mutations/kitchen
// - Packaging: ./mutations/packaging
// - Migrations: ./mutations/migrations
//
// All exports re-exported via ./mutations/index.ts

export * from "./mutations/index";
```

---

### Task 2: Fix Type Safety

**2.1 Create proper types for updates**
```typescript
// In statusUpdates.ts
interface OrderStatusUpdate {
  status: string;
  awaitingPaymentSince?: number;
}

interface OrderDetailsUpdate {
  dueDate?: number;
  notes?: string;
  deliveryType?: string;
  pickupLocation?: string;
  deliveryAddress?: string;
  contactWa?: string;
  contactIg?: string;
  channel?: string;
  soldBy?: string;
}
```

**2.2 Replace Record<string, unknown>**
- Line 352: Use `OrderStatusUpdate` type
- Line 454: Use `OrderDetailsUpdate` type

---

### Task 3: Extract usePendingBallStats Hook

**3.1 Create src/hooks/convex/usePendingBallStats.ts**
```typescript
import { useMemo } from 'react';
import type { OrderWithBalls } from './useOrders';

export interface PendingBallStats {
  originalCount: number;
  originalBalls: number;
  biteSizedCount: number;
  biteSizedBalls: number;
}

/**
 * Calculate pending order counts and total balls needed for each ball type.
 * Replaces inline calculation in KitchenView.tsx.
 */
export function usePendingBallStats(orders: OrderWithBalls[] | undefined): PendingBallStats {
  return useMemo(() => {
    if (!orders) {
      return { originalCount: 0, originalBalls: 0, biteSizedCount: 0, biteSizedBalls: 0 };
    }

    let originalCount = 0;
    let originalBalls = 0;
    let biteSizedCount = 0;
    let biteSizedBalls = 0;

    for (const order of orders) {
      // Original balls
      const originalItems = order.items?.filter(item => item.production_type === "original") ?? [];
      if (originalItems.length > 0) {
        originalCount++;
        for (const item of originalItems) {
          const totalRequired = (item.quantity ?? 0) * (item.production_units ?? 0);
          const needed = totalRequired - (item.balls_filled ?? 0);
          if (needed > 0) originalBalls += needed;
        }
      }

      // Bite-sized balls
      const biteSizedItems = order.items?.filter(item => item.production_type === "bite_sized") ?? [];
      if (biteSizedItems.length > 0) {
        biteSizedCount++;
        for (const item of biteSizedItems) {
          const totalRequired = (item.quantity ?? 0) * (item.production_units ?? 0);
          const needed = totalRequired - (item.balls_filled ?? 0);
          if (needed > 0) biteSizedBalls += needed;
        }
      }
    }

    return { originalCount, originalBalls, biteSizedCount, biteSizedBalls };
  }, [orders]);
}
```

**3.2 Update KitchenView.tsx**
- Import usePendingBallStats
- Replace lines 84-100 with hook call
- Remove duplicate logic for bite-sized (currently missing in file)

**3.3 Export from barrel**
Add to `src/hooks/convex/index.ts`:
```typescript
export { usePendingBallStats } from './usePendingBallStats';
export type { PendingBallStats } from './usePendingBallStats';
```

---

### Task 4: Verify Mobile Responsive

**4.1 Check KitchenView components at 280px**
- InventoryTray buttons
- OrderBox cards
- BallCompletionButtons
- KitchenDashboard stats

**4.2 Check OrderManager/OrderDetail at 280px**
- Order form fields
- Item rows
- Action buttons

**4.3 Document findings**
Create `docs/reports/mobile-responsiveness-2026-02-02.md` with:
- Components tested
- Issues found
- Fixes needed (if any)
- Screenshots (manual verification)

---

## File Size Estimates

| File | Estimated Lines | Actual | Status |
|------|----------------|--------|--------|
| orderCrud.ts | 380 | TBD | Pending |
| itemCrud.ts | 200 | TBD | Pending |
| statusUpdates.ts | 250 | TBD | Pending |
| kitchen.ts | 300 | TBD | Pending |
| packaging.ts | 380 | TBD | Pending |
| migrations.ts | 180 | TBD | Pending |
| **Total** | **1,690** | **1,783** | 93 lines overhead |

---

## Testing Checklist

- [ ] All existing tests pass
- [ ] No TypeScript errors
- [ ] Convex builds successfully
- [ ] Frontend compiles
- [ ] Kitchen View loads
- [ ] Order creation works
- [ ] Ball distribution works
- [ ] Package marking works
- [ ] Migrations accessible from dashboard

---

## Documentation Updates

- [ ] Update CHANGELOG.md with split details
- [ ] Update CODE_STYLE.md mutation organization section
- [ ] Update API_REFERENCE.md import paths
- [ ] Create migration guide for developers

---

## Success Criteria

✅ Each mutations file < 400 lines
✅ Zero `Record<string, unknown>` types
✅ usePendingBallStats hook extracted and used
✅ Mobile responsive at 280px (or issues documented)
✅ All tests passing
✅ TypeScript compiles clean
✅ Documentation complete

---

## Execution Order

1. Create mutations directory: `convex/orders/mutations/`
2. Create domain files in order: orderCrud, itemCrud, statusUpdates, kitchen, packaging, migrations
3. Create index.ts barrel export
4. Update mutations.ts to re-export
5. Fix type safety issues
6. Extract usePendingBallStats hook
7. Update KitchenView to use hook
8. Verify builds and tests
9. Check mobile responsive
10. Update documentation

---

## Decision Log

### Decision 1: Mutation File Organization
**Date:** 2026-02-02
**Context:** mutations.ts is 1783 lines, needs splitting
**Decision:** Use domain-driven split (CRUD, kitchen, packaging) vs layer split (mutations, helpers)
**Rationale:** Aligns with CODE_STYLE.md two-tier helper architecture, groups related operations
**Alternatives Considered:** Layer split (all mutations in one file, all helpers in another) - rejected for poor cohesion

### Decision 2: Hook Extraction Pattern
**Date:** 2026-02-02
**Context:** Duplicate ball stats calculation in KitchenView
**Decision:** Create usePendingBallStats hook with useMemo optimization
**Rationale:** Follows React hooks best practices, enables reuse, improves testability
**Alternatives Considered:** Keep inline - rejected due to duplication and future expansion needs

### Decision 3: Type Safety Approach
**Date:** 2026-02-02
**Context:** Record<string, unknown> used for flexible updates
**Decision:** Create explicit update interfaces for each mutation
**Rationale:** Type safety catches bugs at compile time, improves IDE autocomplete
**Alternatives Considered:** Keep Record - rejected for poor developer experience

---

## Next Steps (Post-Phase 3)

- [ ] Add integration tests for split mutations
- [ ] Create performance benchmarks
- [ ] Consider frontend component extraction (OrderBox, InventoryTray)
- [ ] Audit remaining type safety issues in hooks

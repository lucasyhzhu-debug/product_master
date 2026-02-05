# Staff Review: Kitchen Ball Filling Bug Investigation

**Date:** 2026-02-05
**Bug Report ID:** BUG-KITCHEN-001
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** CRITICAL BUG CONFIRMED

The kitchen page ball filling functionality is broken for new menu products due to a **filter mismatch between the OLD production system (`productionType` field) and the NEW production system (`orderItemProduction` records)**.

**Root Cause:** The ball distribution algorithm filters items using the deprecated `productionType` field but then attempts to apply balls using the new `orderItemProduction` records. When these two systems are out of sync (which happens for all new menu products with components), balls fail to be distributed.

---

## 2. Root Cause Analysis (RCA)

### 2.1 The Two Production Tracking Systems

| System | Source of Truth | When Created | Purpose |
|--------|-----------------|--------------|---------|
| **OLD (Deprecated)** | `orderItems.productionType` | Copied from `menuProducts.productionType` | Determines if item needs "big" or "mid" balls |
| **NEW (Current)** | `orderItemProduction` records | Created from `menuProductComponents` | Tracks actual production progress per ball type |

### 2.2 The Exact Bug Location

**File:** `convex/orders/helpers/ballDistribution.ts`
**Lines:** 201-204

```typescript
// Filter items by production type
const matchingItems = items.filter(
  (item) => item.productionType === productionTypeFilter
);
```

**What Happens:**
1. User fills "mid" balls (bite_sized)
2. Code sets `productionTypeFilter = "bite_sized"`
3. Filter checks: `item.productionType === "bite_sized"`
4. Items with `productionType === "original"` are **excluded**
5. Even if those items have MID_BALL production records, they receive NO balls

### 2.3 Why New Products Are Affected

**When creating a new menu product** (`convex/menuProducts/mutations.ts:123-124`):
```typescript
productionType: args.productionType ?? "original",  // DEFAULTS TO "original"
productionUnits: args.productionUnits ?? 1,
```

**When creating an order item** (`convex/orders/mutations/itemCrud.ts:73-77`):
```typescript
if (args.item.menuProductId) {
  const menuProduct = await ctx.db.get(args.item.menuProductId);
  if (menuProduct) {
    productionType = menuProduct.productionType;  // COPIED FROM MENU PRODUCT
    productionUnits = menuProduct.productionUnits;
  }
}
```

**When creating production records** (`convex/orders/mutations/itemCrud.ts:99-101`):
```typescript
// PRD-5: Create orderItemProduction records (new production tracking system)
if (args.item.menuProductId) {
  await createProductionRecordsForItem(ctx, itemId, args.item.menuProductId, args.item.quantity);
}
```

This creates records from `menuProductComponents`, which correctly tracks BIG_BALL and MID_BALL - but is **completely independent** from the `productionType` field.

### 2.4 Example Scenario

**Creating a Combo Product:**
- Admin creates "Pistachio Combo" with components: 1 BIG_BALL + 2 MID_BALL
- `menuProducts.productionType` defaults to `"original"` (line 123)

**When Customer Orders:**
- Order item created with `productionType = "original"` (copied from menu product)
- `orderItemProduction` records created:
  - Record 1: BIG_BALL, unitsRequired=1, unitsRemaining=1
  - Record 2: MID_BALL, unitsRequired=2, unitsRemaining=2

**When Kitchen Fills "Big" Balls:**
- Filter: `productionType === "original"` → MATCH
- Gets BIG_BALL production record, fills correctly

**When Kitchen Fills "Mid" Balls:**
- Filter: `productionType === "bite_sized"` → NO MATCH (item has "original")
- Item is SKIPPED
- MID_BALL production records **never updated**
- **Balls don't fill in UI**

---

## 3. Critical Issues (Must Fix)

| # | Issue | Category | Location | Severity |
|---|-------|----------|----------|----------|
| 1 | Filter uses OLD system but applies balls via NEW system | Logic | `ballDistribution.ts:202-204` | CRITICAL |
| 2 | Completion check also uses OLD system filter | Logic | `ballDistribution.ts:284` | HIGH |
| 3 | `productionType` defaults don't reflect actual ball composition | Data | `menuProducts/mutations.ts:123` | HIGH |

### Issue 1: Filter/Apply System Mismatch (CRITICAL)

**Problem:** The filter at line 202-204 excludes items that don't match `productionType`, but the actual ball application at line 213 uses production records which may contain balls of different types.

**Current Code:**
```typescript
// Line 181: Map ball type to OLD system filter
const productionTypeFilter = normalizedBallType === "big" ? "original" : "bite_sized";

// Lines 202-204: Filter by OLD system
const matchingItems = items.filter(
  (item) => item.productionType === productionTypeFilter
);

// Line 213: Apply using NEW system
const ballsNeeded = getItemBallsNeeded(item, productionUnitCode);
```

**The Fix:** Replace the filter to check for presence of matching production records instead of `productionType`:

```typescript
// FIX: Filter items that have production records of the requested type
const matchingItems = items.filter((item) => {
  const hasMatchingRecords = item.productionRecords.some(
    (r) => r.productionUnitCode === productionUnitCode && r.unitsRemaining > 0 && !r.isCancelled
  );
  return hasMatchingRecords;
});
```

### Issue 2: Completion Check Filter

**Problem:** Line 284 filters items by presence of `productionType` field:
```typescript
const itemsWithProductionData = items.filter((item) => item.productionType);
```

This excludes items that have production records but no `productionType` set.

**The Fix:** Filter by presence of production records instead:
```typescript
const itemsWithProductionData = items.filter((item) => item.productionRecords.length > 0);
```

### Issue 3: Default `productionType` Doesn't Match Components

**Problem:** When creating menu products with components, `productionType` defaults to `"original"` regardless of what ball types the components actually use.

**The Fix:** Either:
1. Remove the `productionType` field entirely (deprecate completely), or
2. Auto-derive `productionType` from components (e.g., if only MID_BALL components, set to "bite_sized")

---

## 4. Data Flow Diagram (Current vs Expected)

### Current (Broken) Flow:
```
User clicks "Fill Mid Balls"
    ↓
distributeBallsToOrders(ballType: "mid")
    ↓
productionTypeFilter = "bite_sized"
    ↓
Filter: item.productionType === "bite_sized"
    ↓
Items with productionType="original" EXCLUDED   ← BUG
    ↓
Items with MID_BALL records but productionType="original" get ZERO balls
```

### Expected (Fixed) Flow:
```
User clicks "Fill Mid Balls"
    ↓
distributeBallsToOrders(ballType: "mid")
    ↓
productionUnitCode = "MID_BALL"
    ↓
Filter: item.productionRecords.some(r => r.productionUnitCode === "MID_BALL" && r.unitsRemaining > 0)
    ↓
ALL items with MID_BALL records are included
    ↓
MID_BALL production records updated correctly
```

---

## 5. Impact Analysis

### Affected Orders
- ALL orders with new menu products that have `menuProductComponents`
- Specifically: combo packs or any product with mixed ball types
- Legacy products (ORIGINAL, BITE_SINGLE, etc.) may still work if `productionType` is correctly set

### Affected Users
- Kitchen staff cannot complete orders for new products
- Order completion workflow is blocked

### Business Impact
- **HIGH**: Production tracking is broken for new POS products
- Orders cannot be marked complete
- Kitchen view shows incorrect ball requirements

---

## 6. Verification Queries

To confirm the bug in production/development:

### Query 1: Find items with mismatched systems
```typescript
// Find items where productionType doesn't match production records
const items = await ctx.db.query("orderItems").collect();
for (const item of items) {
  const records = await ctx.db
    .query("orderItemProduction")
    .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
    .collect();

  const hasBigBall = records.some(r => r.productionUnitCode === "BIG_BALL");
  const hasMidBall = records.some(r => r.productionUnitCode === "MID_BALL");

  if (item.productionType === "original" && hasMidBall && !hasBigBall) {
    console.log("MISMATCH: Item has productionType=original but only MID_BALL records");
  }
  if (item.productionType === "bite_sized" && hasBigBall && !hasMidBall) {
    console.log("MISMATCH: Item has productionType=bite_sized but only BIG_BALL records");
  }
}
```

### Query 2: Find stuck production records
```typescript
// Find production records with unitsRemaining > 0 for orders in InProduction
const inProdOrders = await ctx.db
  .query("orders")
  .withIndex("by_status", (q) => q.eq("status", "InProduction"))
  .collect();

for (const order of inProdOrders) {
  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();

  for (const item of items) {
    const records = await ctx.db
      .query("orderItemProduction")
      .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
      .collect();

    const stuck = records.filter(r => r.unitsRemaining > 0 && !r.isCancelled);
    if (stuck.length > 0) {
      console.log(`Order ${order.orderNumber} has stuck records:`, stuck);
    }
  }
}
```

---

## 7. Recommended Fix Strategy

### Phase 1: Immediate Fix (Lines of Code: ~10)

**File:** `convex/orders/helpers/ballDistribution.ts`

1. **Replace line 202-204 filter:**
```typescript
// OLD (broken):
const matchingItems = items.filter(
  (item) => item.productionType === productionTypeFilter
);

// NEW (fixed):
const matchingItems = items.filter((item) => {
  return item.productionRecords.some(
    (r) => r.productionUnitCode === productionUnitCode &&
           r.unitsRemaining > 0 &&
           !r.isCancelled
  );
});
```

2. **Replace line 284 filter:**
```typescript
// OLD (broken):
const itemsWithProductionData = items.filter((item) => item.productionType);

// NEW (fixed):
const itemsWithProductionData = items.filter(
  (item) => item.productionRecords.length > 0
);
```

### Phase 2: Deprecation Cleanup (Optional)

1. Mark `orderItems.productionType` as deprecated in schema
2. Mark `orderItems.productionUnits` as deprecated in schema
3. Remove these fields from itemCrud.ts when creating items
4. Update any remaining code that reads these fields

---

## 8. Test Plan

### Manual Testing
1. Create a new menu product with components: 1 BIG_BALL + 2 MID_BALL
2. Create an order with this product (qty: 2)
3. Confirm order to move to production
4. Open Kitchen View
5. Add 2 big balls to tray → Verify 2 big balls fill the order
6. Add 4 mid balls to tray → Verify 4 mid balls fill the order
7. Verify order transitions to Packaging when all balls filled

### Automated Test Cases
```typescript
// Test: Items with MID_BALL records receive mid balls regardless of productionType
describe("distributeBallsToOrders", () => {
  it("should fill MID_BALL records even when productionType is 'original'", async () => {
    // Setup: Create item with productionType="original" but MID_BALL records
    // Action: Call distributeBallsToOrders(ctx, { ballType: "mid", count: 2 })
    // Assert: MID_BALL record unitsRemaining decreased by 2
  });
});
```

---

## 9. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Phase 1: Fix ballDistribution.ts | `convex-backend` | Backend mutation logic changes |
| Phase 2: Add tests | `code-auditor` | Verify fix doesn't break existing flows |
| Phase 3: Deprecation cleanup | `refactor-architect` | Cross-cutting schema and code changes |

---

## 10. Git Workflow

### Branch Strategy
- Feature branch: `fix/ball-filling-production-type-mismatch`
- Target: `main`

### Recommended Commits
1. `fix: use production records for ball distribution filtering`
2. `fix: use production records for completion check`
3. `test: add ball distribution tests for combo products`
4. `docs: update CHANGELOG with bug fix`

### Pre-Push Verification
- [ ] `npm run build` passes
- [ ] `npm run type-check` passes
- [ ] Manual test with combo product

---

## 11. Documentation Updates Required

| Document | Update |
|----------|--------|
| CHANGELOG.md | Add bug fix entry |
| SCHEMA.md | Add deprecation note for `orderItems.productionType` |
| CODE_STYLE.md | Update Ball Distribution System section |

---

## 12. Approval Conditions

**For Approval, the fix must:**
1. Pass all existing tests
2. Allow combo products (mixed ball types) to fill correctly
3. Not break existing "fixed" products (ORIGINAL, BITE_SINGLE, etc.)
4. Include at least one manual verification test

---

## 13. Timeline Estimate

| Task | Effort |
|------|--------|
| Fix ballDistribution.ts | 30 min |
| Manual testing | 30 min |
| Documentation updates | 15 min |
| Code review | 15 min |
| **Total** | ~1.5 hours |

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
*Investigation conducted with Opus 4.5 model*

# Tech Debt Analysis: Orders & Kitchen (V2 - Refined)

**Report Date:** 2026-02-02 (V2 published post-staff review)
**Analysis Level:** CTO-Level Implementation Plan
**Scope:** Orders module (backend + frontend kitchen)
**Total Issues:** 34 (6 Critical, 10 High, 10 Medium, 8 Low)
**Staff Review:** ✅ Completed (see `docs/reviews/staffreview-techdebt-orders-kitchen-2026-02-02.md`)

---

## Executive Summary

The orders and kitchen sections have accumulated technical debt due to rapid feature iteration and intentional dual-write migration patterns. This v2 plan addresses **critical gaps** identified in staff review:

✅ **Schema documentation** for missing `orderItemProduction` + `productionUnitTypes` tables
✅ **Helper architecture** aligned with CODE_STYLE.md two-tier system
✅ **Migration strategy** with backfill + verification + rollback procedures
✅ **Agent orchestration** with parallel execution tracks
✅ **Test framework** specification and patterns

**Key Findings:**
- **Dual-write system** (intentional tech debt, migration in progress per CODE_STYLE.md)
- **N+1 query patterns** with up to 6-12 database queries per request
- **Giant functions** (228 lines max) violating single responsibility principle
- **~70% untested** critical business logic in ball distribution
- **15+ duplicate patterns** for status filtering, item fetching, and ball calculations

---

## Missing Schema Documentation (Critical Gap from Staff Review)

### New Table: `orderItemProduction` (Production Tracking Records)

**Purpose:** Track production progress per order item per production type. Replaces deprecated `orderItems.ballsRemaining` field.

```typescript
orderItemProduction: defineTable({
  orderItemId: v.id("orderItems"),
  productionUnitTypeId: v.id("productionUnitTypes"),
  unitsRequired: v.number(),        // Total units needed
  unitsCompleted: v.number(),       // Units finished
  unitsRemaining: v.number(),       // Calculated: unitsRequired - unitsCompleted
  // Audit fields
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_order_item", ["orderItemId"])
  .index("by_production_type", ["productionUnitTypeId"])
  .index("by_completion", ["orderItemId", "unitsRemaining"]) // For completion checks
```

**Relationships:**
- `orderItemId` → `orderItems._id` (1:N - one item can have multiple production types)
- `productionUnitTypeId` → `productionUnitTypes._id` (N:1)

**Calculation Rules:**
```typescript
// Initial creation (when order item created)
unitsRequired = orderItem.productionUnits * orderItem.quantity
unitsCompleted = 0
unitsRemaining = unitsRequired

// After ball distribution
unitsCompleted += ballsDistributed
unitsRemaining = unitsRequired - unitsCompleted

// Completion check
isComplete = (unitsRemaining === 0)
```

### New Table: `productionUnitTypes` (Production Type Definitions)

**Purpose:** Define production unit types (big balls, mid balls, etc.) with metadata.

```typescript
productionUnitTypes: defineTable({
  code: v.string(),                 // "ORIGINAL", "BITE_SIZED"
  name: v.string(),                 // "Big Ball (Original)", "Mid Ball (Bite Sized)"
  displayName: v.string(),          // "Original", "Bite Sized"
  color: v.string(),                // "#93C572" (pistachio green)
  strokeColor: v.string(),          // "#7B3F00" (chocolate brown)
  isActive: v.boolean(),
  sortOrder: v.number(),            // Display order in UI
})
  .index("by_code", ["code"])
  .index("by_active", ["isActive", "sortOrder"])
```

**Seed Data:**
```typescript
// convex/productionUnitTypes/seedDefaults.ts
[
  {
    code: "ORIGINAL",
    name: "Big Ball (Original)",
    displayName: "Original",
    color: "#93C572",
    strokeColor: "#7B3F00",
    isActive: true,
    sortOrder: 1,
  },
  {
    code: "BITE_SIZED",
    name: "Mid Ball (Bite Sized)",
    displayName: "Bite Sized",
    color: "#93C572",
    strokeColor: "#7B3F00",
    isActive: true,
    sortOrder: 2,
  },
]
```

### Schema Flow Diagram (Added from Staff Review)

```
Order Creation Flow:
┌───────────┐
│   Order   │
│  Created  │
└─────┬─────┘
      │
      ▼
┌─────────────┐
│ OrderItems  │ (quantity, productionUnits, productionType)
│   Created   │
└─────┬───────┘
      │
      ▼ (for each item)
┌──────────────────────┐
│ OrderItemProduction  │
│   Records Created    │
├──────────────────────┤
│ unitsRequired =      │
│   productionUnits *  │
│   quantity           │
├──────────────────────┤
│ unitsCompleted = 0   │
│ unitsRemaining =     │
│   unitsRequired      │
└──────────────────────┘

Kitchen Production Flow:
┌──────────────┐
│ Inventory    │
│ Tray: +10    │
│ balls        │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ distributeBallsTo    │
│ Orders() mutation    │
├──────────────────────┤
│ 1. Fetch pending     │
│    orders sorted by  │
│    dueDate           │
│ 2. Allocate balls    │
│    to orderItem      │
│    Production        │
│ 3. UPDATE:           │
│    unitsCompleted += │
│    ballsAllocated    │
│    unitsRemaining -= │
│    ballsAllocated    │
│ 4. DEPRECATED:       │
│    ballsRemaining -= │
│    (dual-write)      │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Order Complete Check │
├──────────────────────┤
│ All production       │
│ records for order    │
│ have unitsRemaining  │
│ === 0 ?              │
│                      │
│ YES → Mark order     │
│       ProductionComplete
└──────────────────────┘
```

---

## Priority Implementation Roadmap (V2 with Agent Orchestration)

### Phase 1: Stabilize Data Consistency (Priority: CRITICAL)
**Duration:** 2 weeks
**Blocking:** Phases 2-4 depend on this
**Primary Agent:** `convex-backend`
**Secondary Agent:** `code-auditor` (verification only)

| Task | Impact | Files | Agent |
|------|--------|-------|-------|
| 1.1: Document schema (✅ done above) | Foundation for migration | `docs/SCHEMA.md` | Manual |
| 1.2: Create `productionUnitTypes` table + seed | Type definitions | `convex/schema.ts`, `convex/productionUnitTypes/seedDefaults.ts` | `convex-backend` |
| 1.3: Add indexes to `orderItemProduction` | Query performance | `convex/schema.ts` | `convex-backend` |
| 1.4: Create single `calculateBallsNeeded()` helper | 3 calculation sources → 1 | `convex/orders/helpers.ts` (PURE) | `convex-backend` |
| 1.5: Create backfill mutation | Migrate existing orders | `convex/orders/migrations/backfillProduction.ts` | `convex-backend` |
| 1.6: Create verification query | Compare OLD vs NEW | `convex/orders/migrations/verifyProduction.ts` | `convex-backend` |
| 1.7: Run backfill on dev environment | Data migration | Convex dashboard | Manual |
| 1.8: Verify backfill (100% match) | Data integrity | Convex dashboard | Manual |
| 1.9: Add unit tests for ball distribution | 339 untested lines → tested | `convex/orders/__tests__/ballDistribution.test.ts` | `convex-backend` |

**Rollback Plan:**
```bash
# If backfill fails or data mismatch > 1%
npx convex run orders/migrations:rollbackBackfill

# Revert schema changes
git revert <commit-hash>
npx convex deploy
```

### Phase 2: Reduce Query Complexity (Priority: HIGH)
**Duration:** 1 week
**Can run in parallel with:** Phase 3 (Frontend Refactor)
**Primary Agent:** `refactor-architect`

| Task | Impact | Files | Agent |
|------|--------|-------|-------|
| 2.1: Extract batch fetching pattern | Reusable helper | `convex/orders/helpers/batchFetching.ts` (CTX) | `refactor-architect` |
| 2.2: Refactor `getKitchenOrders` | 147 lines → 5 functions | `convex/orders/queries.ts` | `refactor-architect` |
| 2.3: Refactor `getKitchenStats` | 153 lines → 3 functions | `convex/orders/queries.ts` | `refactor-architect` |
| 2.4: Eliminate N+1 patterns | 6-12 queries → 2-3 | `convex/orders/queries.ts`, `convex/orders/helpers/ballDistribution.ts` | `refactor-architect` |
| 2.5: Extract `fetchOrdersByStatuses()` helper | 6 duplicated queries → 1 | `convex/orders/helpers/statusFetching.ts` (CTX) | `refactor-architect` |

**Helper Architecture (Aligned with CODE_STYLE.md):**

```
convex/orders/
├── helpers.ts                      # PURE functions (no ctx)
│   ├── calculateBallsNeeded()      # ✅ NEW - ball calculations
│   ├── calculateLineTotals()       # ✅ existing
│   └── recalculateFinalTotal()     # ✅ existing
│
└── helpers/                        # CTX-DEPENDENT functions
    ├── index.ts                    # Barrel export
    ├── batchFetching.ts            # ✅ NEW - batch query patterns
    ├── statusFetching.ts           # ✅ NEW - status queries
    ├── ballDistribution.ts         # ✅ existing - refactored
    ├── statusTransitions.ts        # ✅ existing
    ├── usageTracking.ts            # ✅ existing
    └── productionRecords.ts        # ✅ existing
```

**Rollback Plan:**
- Changes are backward-compatible (only extracts code)
- If issues arise, revert commits and redeploy
- No data migration needed

### Phase 3: Improve Architecture (Priority: HIGH)
**Duration:** 1 week
**Can run in parallel with:** Phase 2 (Query Refactor)
**Primary Agent:** `frontend-integrator`
**Secondary Agent:** `ui-component-builder` (responsive design)

| Task | Impact | Files | Agent |
|------|--------|-------|-------|
| 3.1: Audit existing state machine helpers | Avoid duplication | `convex/orders/helpers/statusTransitions.ts` | `code-auditor` |
| 3.2: Break up `create` mutation | 228 lines → 5 sub-operations | `convex/orders/mutations.ts` | `convex-backend` |
| 3.3: Extract `usePendingBallStats()` hook | Duplicated frontend logic | `src/hooks/usePendingBallStats.ts` | `frontend-integrator` |
| 3.4: Fix type safety (`Record<string, unknown>`) | Runtime type errors → compile-time | `convex/orders/mutations.ts` | `convex-backend` |
| 3.5: Verify mobile responsive design | 280px minimum width | `src/pages/KitchenView.tsx` | `ui-component-builder` |

**Type Safety Fix Example:**
```typescript
// BEFORE (unsafe)
export const create = mutation({
  args: {
    orderData: v.any(), // ❌ No type safety
  },
  handler: async (ctx, args) => {
    const data = args.orderData as Record<string, unknown>;
    // Runtime errors possible
  },
});

// AFTER (type-safe)
const OrderCreateArgs = v.object({
  customerId: v.id("customers"),
  items: v.array(v.object({
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
    unitPrice: v.number(),
  })),
  deliveryType: v.union(v.literal("Pickup"), v.literal("Delivery")),
  channel: v.optional(v.string()),
  soldBy: v.optional(v.string()),
});

export const create = mutation({
  args: OrderCreateArgs,
  handler: async (ctx, args) => {
    // ✅ Compile-time type safety
  },
});
```

**Rollback Plan:**
- Frontend changes can be reverted independently
- Backend type changes are backward-compatible
- Feature flag for new `usePendingBallStats()` hook

### Phase 4: Polish (Priority: MEDIUM)
**Duration:** 1 week
**Depends on:** Phases 1-3 completed
**Primary Agent:** `code-auditor` (read-only verification)
**Secondary Agent:** `convex-backend` (cleanup tasks)

| Task | Impact | Files | Agent |
|------|--------|-------|-------|
| 4.1: Standardize field naming | Developer friction | Schema + Frontend | `refactor-architect` |
| 4.2: Consolidate WhatsApp templates | 6 similar functions → 1 with params | `convex/orders/whatsapp.ts` | `convex-backend` |
| 4.3: Remove PRD comment drift | Unclear requirements | `convex/orders/queries.ts` | Manual |
| 4.4: Add missing indexes | Performance | `convex/schema.ts` | `convex-backend` |
| 4.5: Generate test coverage report | Verify >80% coverage | CI/CD | `code-auditor` |
| 4.6: Deprecate OLD system (feature flag off) | Remove dual-write | `convex/orders/helpers/ballDistribution.ts` | `convex-backend` |

**Required Indexes (Specific from Staff Review):**
```typescript
// convex/schema.ts
orderItemProduction: defineTable({ ... })
  .index("by_order_item", ["orderItemId"])
  .index("by_production_type", ["productionUnitTypeId"])
  .index("by_completion", ["orderItemId", "unitsRemaining"]) // ✅ NEW

orders: defineTable({ ... })
  // ✅ existing indexes ok

orderItems: defineTable({ ... })
  .index("by_order", ["orderId"])
  .index("by_production_type", ["orderId", "productionType"]) // ✅ NEW
```

**Rollback Plan:**
- Field naming changes require coordinated frontend + backend deploy
- WhatsApp template consolidation is backward-compatible
- Deprecating OLD system has feature flag for instant revert

---

## Test Framework Specification (Added from Staff Review)

### Framework: Vitest + Convex Test Helpers

**Setup:**
```json
// package.json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/ui": "^2.0.0",
    "convex-test": "^0.0.1"
  },
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

### Test Patterns

#### Pure Helper Tests (No Ctx)
```typescript
// convex/orders/__tests__/helpers.test.ts
import { describe, it, expect } from 'vitest';
import { calculateBallsNeeded } from '../helpers';

describe('calculateBallsNeeded', () => {
  it('should calculate balls for original type', () => {
    const result = calculateBallsNeeded(
      { productionType: 'original', productionUnits: 1, quantity: 5 },
      []
    );
    expect(result).toEqual({ bigBalls: 5, midBalls: 0 });
  });

  it('should calculate balls for bite_sized type', () => {
    const result = calculateBallsNeeded(
      { productionType: 'bite_sized', productionUnits: 3, quantity: 2 },
      []
    );
    expect(result).toEqual({ bigBalls: 0, midBalls: 6 });
  });

  it('should handle zero quantity', () => {
    const result = calculateBallsNeeded(
      { productionType: 'original', productionUnits: 1, quantity: 0 },
      []
    );
    expect(result).toEqual({ bigBalls: 0, midBalls: 0 });
  });
});
```

#### Ctx-Dependent Mutation Tests
```typescript
// convex/orders/__tests__/ballDistribution.test.ts
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { distributeBallsToOrders } from '../helpers/ballDistribution';

describe('distributeBallsToOrders', () => {
  it('should distribute balls to pending orders', async () => {
    const t = convexTest(schema);

    // Setup test data
    const customerId = await t.mutation.customers.create({
      name: 'Test Customer',
      createdBy: 'test',
    });

    const orderId = await t.mutation.orders.create({
      customerId,
      // ... order data
    });

    // Run mutation
    await distributeBallsToOrders(t.ctx, {
      productionType: 'original',
      ballCount: 5,
    });

    // Verify results
    const items = await t.query.orderItems.getByOrder({ orderId });
    expect(items[0].ballsFilled).toBe(5);
  });
});
```

**Test Coverage Targets:**
- **Phase 1:** Ball distribution logic >80%
- **Phase 2:** Query refactors >90% (easier with small functions)
- **Phase 3:** Frontend hooks >70%
- **Phase 4:** Overall project >80%

---

## Critical Issues Detail (V2 with Context)

### C1: Dual-Write System (Intentional Tech Debt - Migration In Progress)

**Status:** Documented in CODE_STYLE.md lines 261-269 as intentional migration pattern
**Timeline:** Deprecation planned in Phase 4 after all clients migrate to NEW system
**Current Risk:** Data inconsistency if writes are not atomic

**OLD System (Deprecated):**
```typescript
// orderItems fields (will be removed in Phase 4)
productionType: "original" | "bite_sized"
productionUnits: number
ballsRemaining: number      // ❌ DEPRECATED - no longer updated
ballsFilled: number
```

**NEW System (Current):**
```typescript
// orderItemProduction table
productionUnitTypeId: Id<"productionUnitTypes">
unitsRequired: number
unitsCompleted: number
unitsRemaining: number      // ✅ Source of truth
```

**Calculation Mismatch (Root Cause):**
| Location | Calculation | Status |
|----------|-------------|--------|
| `queries.ts:243` | `record.unitsRequired` | ✅ Correct (NEW system) |
| `mutations.ts:978` | `item.productionUnits * item.quantity` | ❌ Wrong (OLD system) |
| `productionRecords.ts:171` | `component.quantity * quantity` | ⚠️ Context-dependent |

**Phase 1 Fix:** Create single source of truth in `helpers.ts`:
```typescript
// convex/orders/helpers.ts (PURE)
export function calculateBallsNeeded(
  item: {
    productionType: string;
    productionUnits: number;
    quantity: number;
  }
): { bigBalls: number; midBalls: number } {
  const totalUnits = item.productionUnits * item.quantity;

  if (item.productionType === 'original') {
    return { bigBalls: totalUnits, midBalls: 0 };
  } else if (item.productionType === 'bite_sized') {
    return { bigBalls: 0, midBalls: totalUnits };
  }

  return { bigBalls: 0, midBalls: 0 };
}
```

**Migration Strategy (3 Steps):**

**Step 1: Backfill (Phase 1)**
```typescript
// convex/orders/migrations/backfillProduction.ts
export const backfillProductionRecords = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Get all orderItems without production records
    const allItems = await ctx.db.query("orderItems").collect();

    let created = 0;
    let skipped = 0;

    for (const item of allItems) {
      // Check if production records exist
      const existing = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Get production type ID
      const productionType = await ctx.db
        .query("productionUnitTypes")
        .withIndex("by_code", (q) =>
          q.eq("code", item.productionType === 'original' ? 'ORIGINAL' : 'BITE_SIZED')
        )
        .first();

      if (!productionType) continue;

      // Calculate units using pure helper
      const balls = calculateBallsNeeded(item);
      const unitsRequired = balls.bigBalls + balls.midBalls;
      const unitsCompleted = item.ballsFilled || 0;

      // Create production record
      await ctx.db.insert("orderItemProduction", {
        orderItemId: item._id,
        productionUnitTypeId: productionType._id,
        unitsRequired,
        unitsCompleted,
        unitsRemaining: unitsRequired - unitsCompleted,
        createdAt: Date.now(),
      });

      created++;
    }

    return { created, skipped };
  },
});
```

**Step 2: Verify (Phase 1)**
```typescript
// convex/orders/migrations/verifyProduction.ts
export const verifyProductionRecords = query({
  args: {},
  handler: async (ctx) => {
    const allItems = await ctx.db.query("orderItems").collect();

    let matched = 0;
    let mismatched = 0;
    const errors: string[] = [];

    for (const item of allItems) {
      // Get OLD system value
      const oldRemaining = item.ballsRemaining || 0;

      // Get NEW system value
      const productionRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();

      const newRemaining = productionRecords.reduce(
        (sum, record) => sum + record.unitsRemaining,
        0
      );

      // Compare
      if (oldRemaining === newRemaining) {
        matched++;
      } else {
        mismatched++;
        errors.push(
          `OrderItem ${item._id}: OLD=${oldRemaining}, NEW=${newRemaining}`
        );
      }
    }

    const matchRate = (matched / allItems.length) * 100;

    return {
      total: allItems.length,
      matched,
      mismatched,
      matchRate: `${matchRate.toFixed(2)}%`,
      errors: errors.slice(0, 10), // First 10 errors
    };
  },
});
```

**Step 3: Deprecate (Phase 4)**
```typescript
// Feature flag in convex/orders/helpers/ballDistribution.ts
const USE_OLD_SYSTEM = false; // ✅ Turn off in Phase 4

export async function distributeBallsToOrders(
  ctx: MutationCtx,
  args: { productionType: string; ballCount: number }
) {
  // ... distribution logic ...

  // NEW system (always)
  await ctx.db.patch(productionRecord._id, {
    unitsCompleted: newCompleted,
    unitsRemaining: newRemaining,
  });

  // OLD system (deprecated - remove in Phase 4)
  if (USE_OLD_SYSTEM) {
    await ctx.db.patch(item._id, {
      ballsRemaining: newRemaining, // Dual-write
      ballsFilled: newCompleted,
    });
  }
}
```

### C2: Status Filter Duplication (CRITICAL)

**Problem:** `getKitchenOrders` has 6 identical status queries (lines 161-189).

**Phase 2 Fix:** Extract to ctx-dependent helper:
```typescript
// convex/orders/helpers/statusFetching.ts (CTX)
import { QueryCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

export async function fetchOrdersByStatuses(
  ctx: QueryCtx,
  statuses: string[]
): Promise<Doc<"orders">[]> {
  const results: Doc<"orders">[] = [];

  for (const status of statuses) {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
    results.push(...orders);
  }

  return results;
}

// Usage in queries.ts
export const getKitchenOrders = query({
  args: {},
  handler: async (ctx) => {
    const orders = await fetchOrdersByStatuses(ctx, [
      "Draft",
      "Confirmed",
      "InProduction",
      "ProductionComplete",
      "Packaging",
      "WaitingShipment",
    ]);

    // ... rest of logic
  },
});
```

### C3: N+1 Query Pattern (CRITICAL)

**Problem:** `getKitchenOrders` performs 6 + N + N*M database queries.

**Phase 2 Fix:** Use batch fetch pattern from `getKitchenStats`:
```typescript
// convex/orders/helpers/batchFetching.ts (CTX)
import { QueryCtx, Id } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

export async function fetchOrdersWithItemsAndProduction(
  ctx: QueryCtx,
  orderIds: Id<"orders">[]
): Promise<Map<Id<"orders">, {
  items: Doc<"orderItems">[],
  production: Map<Id<"orderItems">, Doc<"orderItemProduction">[]>
}>> {
  // Batch fetch all items
  const allItems = await ctx.db
    .query("orderItems")
    .collect();

  // Batch fetch all production records
  const allProduction = await ctx.db
    .query("orderItemProduction")
    .collect();

  // Group in memory
  const itemsByOrder = new Map();
  for (const item of allItems) {
    if (!orderIds.includes(item.orderId)) continue;

    if (!itemsByOrder.has(item.orderId)) {
      itemsByOrder.set(item.orderId, {
        items: [],
        production: new Map(),
      });
    }

    itemsByOrder.get(item.orderId)!.items.push(item);
  }

  // Group production records
  for (const record of allProduction) {
    const item = allItems.find(i => i._id === record.orderItemId);
    if (!item || !orderIds.includes(item.orderId)) continue;

    const orderData = itemsByOrder.get(item.orderId);
    if (!orderData.production.has(record.orderItemId)) {
      orderData.production.set(record.orderItemId, []);
    }
    orderData.production.get(record.orderItemId)!.push(record);
  }

  return itemsByOrder;
}

// Usage in queries.ts
export const getKitchenOrders = query({
  args: {},
  handler: async (ctx) => {
    const orders = await fetchOrdersByStatuses(ctx, [...]);
    const orderIds = orders.map(o => o._id);

    // ✅ Single batch fetch replaces N+M queries
    const orderData = await fetchOrdersWithItemsAndProduction(ctx, orderIds);

    // Map to response
    return orders.map(order => ({
      ...order,
      items: orderData.get(order._id)?.items || [],
      production: orderData.get(order._id)?.production || new Map(),
    }));
  },
});
```

---

## Parallel Execution Plan

### Timeline (4 Weeks)

```
Week 1-2: Phase 1 (Data Consistency) - BLOCKING
├─ Task 1.1-1.4: Schema + helpers
├─ Task 1.5-1.6: Migration mutations
└─ Task 1.7-1.9: Backfill + verification + tests

Week 2-3: Phases 2 & 3 (Parallel Tracks)
├─ Track A: Phase 2 (Backend Queries)
│  ├─ Agent: refactor-architect
│  ├─ Task 2.1-2.5: Extract helpers, refactor queries
│  └─ No data changes (safe)
│
└─ Track B: Phase 3 (Frontend + Type Safety)
   ├─ Agent: frontend-integrator
   ├─ Task 3.1-3.5: Hooks, mutations, mobile
   └─ No backend query dependencies

Week 4: Phase 4 (Polish + Deprecation)
├─ Task 4.1-4.5: Cleanup, indexes, tests
└─ Task 4.6: Deprecate OLD system (feature flag)
```

### Agent Coordination

**Sequential Dependencies:**
- Phase 1 blocks Phases 2-4 (need stable schema)
- Phase 2 and 3 are independent (can run in parallel)
- Phase 4 waits for Phases 2-3 completion

**Communication Protocol:**
1. **convex-backend** (Phase 1) reports completion with verification results
2. **CTO orchestrator** approves schema + starts parallel tracks
3. **refactor-architect** (Phase 2) and **frontend-integrator** (Phase 3) work concurrently
4. **code-auditor** runs final verification before Phase 4
5. **convex-backend** completes Phase 4 deprecation

---

## Rollback Procedures (V2 Addition)

### Phase 1 Rollback (Data Migration)

**Trigger:** Verification shows < 99% match rate between OLD and NEW systems

```bash
# 1. Disable NEW system (feature flag)
# In convex/orders/helpers/ballDistribution.ts
USE_NEW_SYSTEM = false

# 2. Delete production records
npx convex run orders/migrations:rollbackBackfill

# 3. Revert schema changes
git revert <schema-commit-hash>
npx convex deploy

# 4. Verify OLD system still works
npx convex run orders/queries:getKitchenOrders
```

**Recovery Time:** < 5 minutes

### Phase 2 Rollback (Query Refactor)

**Trigger:** Performance regression or query errors

```bash
# 1. Revert commits
git revert <phase2-commit-hash>

# 2. Redeploy
npx convex deploy

# 3. No data changes - safe rollback
```

**Recovery Time:** < 2 minutes

### Phase 3 Rollback (Frontend Changes)

**Trigger:** UI bugs or render errors

```bash
# 1. Revert frontend commits
git revert <phase3-commit-hash>

# 2. Rebuild and redeploy
npm run build
# Deploy to Vercel

# 3. Backend unchanged - no coordination needed
```

**Recovery Time:** < 5 minutes (build + deploy)

### Phase 4 Rollback (OLD System Deprecation)

**Trigger:** Critical production issue after deprecating dual-write

```bash
# 1. Re-enable OLD system immediately
# In convex/orders/helpers/ballDistribution.ts
USE_OLD_SYSTEM = true

# 2. Redeploy backend (no code revert needed)
npx convex deploy

# 3. Verify dual-write working
npx convex run orders/queries:getKitchenStats
```

**Recovery Time:** < 1 minute (feature flag toggle)

---

## File Complexity Summary (V2 with Targets)

| File | Lines | Issues | Target | Recommendation |
|------|-------|--------|--------|----------------|
| `convex/orders/mutations.ts` | 1712 | Type safety, giant functions | < 1000 | Break into smaller files (Phase 3) |
| `convex/orders/queries.ts` | 839 | N+1, duplication, complexity | < 500 | Extract helpers (Phase 2) |
| `convex/orders/helpers/ballDistribution.ts` | 339 | Untested, dual-write, nesting | < 200 | Add tests, simplify (Phase 1) |
| `src/pages/KitchenView.tsx` | 488 | State explosion, duplication | < 300 | Extract hooks (Phase 3) |
| `src/pages/OrderDetail.tsx` | 673 | Unknown complexity | < 400 | Needs audit (Phase 3) |

---

## Success Metrics (V2)

### Phase 1 Success Criteria
- [ ] Schema documented in SCHEMA.md
- [ ] `productionUnitTypes` table created and seeded
- [ ] Backfill migration completes with 100% success rate
- [ ] Verification shows ≥ 99% match between OLD and NEW systems
- [ ] Ball distribution tests achieve > 80% coverage
- [ ] No performance regression (query times within 10% of baseline)

### Phase 2 Success Criteria
- [ ] All helpers aligned with CODE_STYLE.md two-tier system
- [ ] `getKitchenOrders` query time reduced by ≥ 50%
- [ ] `getKitchenStats` query time reduced by ≥ 30%
- [ ] Database queries per request reduced from 6-12 to < 3
- [ ] No duplicate status fetching code
- [ ] All extracted helpers have ≥ 90% test coverage

### Phase 3 Success Criteria
- [ ] `create` mutation broken into 5 sub-operations (< 50 lines each)
- [ ] All `Record<string, unknown>` types replaced with specific interfaces
- [ ] `usePendingBallStats()` hook eliminates 34 lines of duplication
- [ ] KitchenView.tsx passes 280px responsive design test
- [ ] All touch targets ≥ 44px on mobile
- [ ] Frontend hooks achieve > 70% test coverage

### Phase 4 Success Criteria
- [ ] WhatsApp templates consolidated (6 functions → 1 parameterized)
- [ ] All required indexes added (query performance validated)
- [ ] OLD system deprecated (feature flag off, dual-write removed)
- [ ] Overall project test coverage ≥ 80%
- [ ] Zero PRD comment drift
- [ ] Code complexity metrics: largest function < 100 lines, max nesting ≤ 3

### Business Impact Metrics
- [ ] Kitchen page load time < 1 second (down from ~2-3 seconds)
- [ ] Zero data inconsistency bugs reported
- [ ] Developer velocity: new order features take 50% less time to implement
- [ ] Bug rate in orders module reduced by ≥ 60%

---

## Next Steps (Immediate Actions)

### Week 1, Day 1 (Monday)
1. **CTO/Lead:** Review and approve v2 plan
2. **Principal Dev:** Validate schema documentation
3. **convex-backend agent:** Start Phase 1 Task 1.2 (create productionUnitTypes table)

### Week 1, Day 2-3
4. **convex-backend agent:** Complete Phase 1 Tasks 1.3-1.6 (schema + migrations)
5. **Manual:** Review migration code in PR

### Week 1, Day 4-5
6. **Manual:** Run backfill on dev environment (Task 1.7)
7. **Manual:** Verify backfill results (Task 1.8)
8. **convex-backend agent:** Add tests (Task 1.9)

### Week 2, Day 1
9. **CTO:** Approve Phase 1 completion
10. **Launch parallel tracks:** Assign refactor-architect (Phase 2) + frontend-integrator (Phase 3)

### Week 4, Day 5
11. **code-auditor agent:** Generate final verification report
12. **convex-backend agent:** Deprecate OLD system (Phase 4 Task 4.6)
13. **CTO:** Sign off on refactoring completion

---

## V2 Changes Summary

### ✅ Additions from Staff Review

1. **Schema Documentation** - Added `orderItemProduction` and `productionUnitTypes` tables with full specifications
2. **Helper Architecture Alignment** - Reorganized all helper proposals to match CODE_STYLE.md two-tier system
3. **Migration Strategy** - Added 3-step backfill → verify → deprecate plan with concrete mutations
4. **Rollback Procedures** - Detailed rollback plans for each phase with recovery time estimates
5. **Test Framework** - Specified Vitest + patterns for pure and ctx-dependent helpers
6. **Agent Orchestration** - Assigned specialist agents to each phase with parallel execution tracks
7. **Schema Flow Diagram** - Visualized order creation → production tracking → completion flow
8. **Type Safety Examples** - Concrete before/after code for fixing `Record<string, unknown>`
9. **Success Metrics** - Phase-by-phase criteria and business impact metrics
10. **Index Specifications** - Listed exact indexes with queries they optimize

### 🔄 Reframed Issues

- **Dual-Write System** - Now acknowledged as intentional tech debt with documented migration path
- **State Machine** - Audits existing helper instead of proposing duplicate
- **Frontend Duplication** - Complete hook implementation with proper types

### 📊 Execution Improvements

- **Parallel tracks** in Weeks 2-3 (backend queries + frontend refactor)
- **Feature flags** for safe rollback of each phase
- **Verification queries** to validate data consistency
- **Agent communication protocol** for handoffs

---

*V2 refined by Staff Engineer review*
*Validated against: CODE_STYLE.md, SCHEMA.md, CLAUDE.md*
*Ready for CTO approval and implementation*

# Phase 1: Test Infrastructure - Research

**Researched:** 2026-02-13
**Domain:** Backend integration testing with Convex + Vitest
**Confidence:** HIGH

## Summary

Phase 1 requires comprehensive test coverage for 4 critical business logic modules using `convex-test` (Convex's official testing library) and Vitest. The codebase already has a working test infrastructure with 8+ test files covering orders, inventory, recipes, and external integrations. The primary challenge is testing complex stateful workflows (ball distribution, FIFO inventory, order lifecycle) that involve multiple database mutations and auto-transitions.

Key findings: (1) convex-test provides full database isolation per test with schema-based validation, (2) existing test patterns in `tests/convex/*.test.ts` demonstrate fixture-based setup with helper functions, (3) the system has real production issues with ghost balls and inventory leaks that tests must prevent, (4) Vitest's AAA pattern and parallel execution align well with testing stateful workflows.

**Primary recommendation:** Use fixture-based test architecture with shared helpers (`tests/convex/helpers.ts`), one test file per module (`ballDistribution.test.ts`, `fifo.test.ts`, `orderLifecycle.test.ts`, `voucherHandling.test.ts`), comprehensive scenario coverage (20-25 tests per module), and zero mocking (full integration with real database operations via convex-test).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Known failure scenarios (test priority):** Tests MUST verify ghost balls are prevented (every produced ball traceable to order or holding state), inventory leaks prevented (reservations properly released), stock never goes negative, FIFO order maintained, ball allocation correctness (type/quantity/order), and order status transitions with proper rollback
- **Order lifecycle test depth:** Test cancellation at EVERY status stage with inventory/allocation rollback verification, test BOTH delivery paths (WaitingShipment→CompleteShipped AND WaitingPickup→PickedUp) as separate full chains, full integration with inventory (no mocking), test invalid transition rejection (no skipping, no backwards)
- **Ball distribution scenarios:** Cover simple (1 product, 1 ball type) and complex (3-4 products, mixed BIG_BALL + MID_BALL) orders, priority is deadline-based, test partial fills across batches, verify production pipeline traceability (produced→packaged→to-sticker→stickered→distributed), test balls produced with no pending orders scenario
- **Test data approach:** Use realistic Frollie product configurations, under 10 active products, 10-50 orders/day volume for concurrent scenarios, standard product structures (no tricky edge cases needed)

### Claude's Discretion
- Test framework patterns and fixture architecture
- Mocking strategy for Convex backend (convex-test)
- Test file organization and naming conventions
- Exact assertion patterns and error message verification
- Whether to use shared test helpers or keep tests self-contained
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^4.0.18 | Test runner and assertion library | Industry standard for Vite/TypeScript projects, 10-20x faster than Jest, native ESM support, already configured in project |
| convex-test | ^0.0.41 | Convex backend testing library | Official Convex testing solution, provides isolated database per test, schema validation, supports queries/mutations/actions |
| @testing-library/jest-dom | ^6.9.1 | Enhanced DOM assertions | Provides semantic matchers like `.toBeInTheDocument()`, improves test readability |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jsdom | ^27.4.0 | Browser environment simulation | Already configured for frontend tests, not needed for pure backend tests |
| @vitest/coverage-v8 | ^4.0.18 | Code coverage reporting | Optional for this phase (zero production changes), useful for verification |

### Installation
All dependencies already installed in `package.json`. No additional packages needed.

```bash
# Run tests
npm run test              # Single run
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

## Architecture Patterns

### Recommended Project Structure
```
tests/
├── convex/                      # Backend integration tests
│   ├── helpers.ts               # EXISTING: Shared fixtures (createCustomer, createMenuProduct, etc.)
│   ├── ballDistribution.test.ts # NEW: Ball distribution algorithm tests (~25 tests)
│   ├── fifo.test.ts            # NEW: FIFO inventory consumption tests (~20 tests)
│   ├── orderLifecycle.test.ts  # NEW: Order lifecycle integration tests (~30 tests)
│   ├── voucherHandling.test.ts # NEW: Voucher validation tests (~15 tests)
│   ├── orders.test.ts          # EXISTING: Basic order tests (12 tests) - keep as-is
│   └── inventory.test.ts       # EXISTING: Inventory tests (15 tests) - keep as-is
└── setup.ts                     # EXISTING: Global test setup
```

### Pattern 1: Fixture-Based Setup (convex-test)
**What:** Each test starts with isolated database, uses helper functions to create baseline data
**When to use:** All backend integration tests (prevents test pollution, ensures repeatability)
**Example:**
```typescript
// Source: https://docs.convex.dev/testing/convex-test
import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { createCustomer, createMenuProduct } from './helpers';

describe('Ball Distribution', () => {
  test('allocates balls to earliest deadline order first', async () => {
    const t = convexTest(schema);

    // Arrange: Create test data using helpers
    const customerId = await createCustomer(t);
    const menuProductId = await createMenuProduct(t, {
      code: 'BIG_BALL',
      productionUnits: 10
    });

    // Create two orders with different deadlines
    const earlyOrderId = await t.mutation(api.orders.mutations.create, {
      customerId,
      dueDate: Date.now() + 86400000, // tomorrow
      items: [{ menuProductId, quantity: 5, unitPrice: 25000, unitCost: 12000 }]
    });

    const lateOrderId = await t.mutation(api.orders.mutations.create, {
      customerId,
      dueDate: Date.now() + 172800000, // day after tomorrow
      items: [{ menuProductId, quantity: 5, unitPrice: 25000, unitCost: 12000 }]
    });

    // Act: Produce balls (insufficient for both orders)
    await t.mutation(api.orders.mutations.kitchen.addBallsToTray, {
      ballType: 'big',
      count: 30 // Only enough for early order (50 balls)
    });

    // Assert: Early order should be filled, late order should be empty
    const earlyOrder = await t.run(async (ctx) => ctx.db.get(earlyOrderId));
    const lateOrder = await t.run(async (ctx) => ctx.db.get(lateOrderId));

    expect(earlyOrder?.status).toBe('InProduction'); // Got balls
    expect(lateOrder?.status).toBe('Confirmed'); // Still waiting
  });
});
```

### Pattern 2: AAA (Arrange-Act-Assert) Structure
**What:** Each test clearly separates setup, execution, and verification phases
**When to use:** Every test (improves readability, makes failures easier to diagnose)
**Example:**
```typescript
test('FIFO consumes oldest batch first', async () => {
  const t = convexTest(schema);

  // ARRANGE: Create batches with different purchase dates
  const componentId = await createComponentType(t, { code: 'BOX' });
  const locationId = await createLocation(t);

  const oldBatchId = await createBatch(t, componentId, locationId, {
    quantity: 100,
    unitCost: 500,
    purchaseDate: Date.now() - 172800000 // 2 days ago
  });

  const newBatchId = await createBatch(t, componentId, locationId, {
    quantity: 50,
    unitCost: 600,
    purchaseDate: Date.now() // today
  });

  // ACT: Consume 75 units
  const result = await t.mutation(api.inventory.consumeStock, {
    componentTypeId: componentId,
    locationId,
    quantity: 75
  });

  // ASSERT: Old batch should be partially consumed, new batch untouched
  const oldBatch = await t.run(async (ctx) => ctx.db.get(oldBatchId));
  const newBatch = await t.run(async (ctx) => ctx.db.get(newBatchId));

  expect(oldBatch?.quantityRemaining).toBe(25); // 100 - 75 = 25
  expect(newBatch?.quantityRemaining).toBe(50); // Unchanged
  expect(result.totalCost).toBe(37500); // 75 * 500 (old batch cost)
});
```

### Pattern 3: Direct Database Access for Verification
**What:** Use `t.run(async (ctx) => ctx.db.get())` to inspect database state directly
**When to use:** When verifying side effects, checking intermediate state, or validating data consistency
**Example:**
```typescript
test('cancellation releases inventory reservations', async () => {
  const t = convexTest(schema);

  // Setup order with inventory
  const orderId = await createOrderWithInventory(t);

  // Get initial reservation count
  const initialReservations = await t.run(async (ctx) => {
    return await ctx.db
      .query('orderComponentReservations')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .collect();
  });
  expect(initialReservations.length).toBeGreaterThan(0);

  // Cancel order
  await t.mutation(api.orders.mutations.cancel, {
    orderId,
    reason: 'Test cancellation'
  });

  // Verify reservations are released
  const finalReservations = await t.run(async (ctx) => {
    return await ctx.db
      .query('orderComponentReservations')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .filter((q) => q.eq(q.field('status'), 'reserved'))
      .collect();
  });
  expect(finalReservations.length).toBe(0); // All released
});
```

### Pattern 4: Test Lifecycle Chains End-to-End
**What:** Test complete workflows from start to finish in a single test
**When to use:** Integration tests (order lifecycle, inventory flow), prevents missing edge cases in transitions
**Example:**
```typescript
test('complete order lifecycle: create → confirm → produce → ship', async () => {
  const t = convexTest(schema);

  // Create order (Draft)
  const orderId = await createBasicOrder(t);
  let order = await t.run(async (ctx) => ctx.db.get(orderId));
  expect(order?.status).toBe('Draft');

  // Transition to AwaitingPayment
  await t.mutation(api.orders.mutations.updateStatus, {
    orderId,
    status: 'AwaitingPayment'
  });
  order = await t.run(async (ctx) => ctx.db.get(orderId));
  expect(order?.status).toBe('AwaitingPayment');
  expect(order?.awaitingPaymentSince).toBeDefined();

  // Transition to Confirmed (reserves inventory)
  await t.mutation(api.orders.mutations.updateStatus, {
    orderId,
    status: 'Confirmed'
  });
  order = await t.run(async (ctx) => ctx.db.get(orderId));
  expect(order?.status).toBe('Confirmed');

  // Verify inventory reserved
  const reservations = await t.run(async (ctx) => {
    return await ctx.db
      .query('orderComponentReservations')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .collect();
  });
  expect(reservations.length).toBeGreaterThan(0);

  // Produce balls (auto-transition to InProduction)
  await t.mutation(api.orders.mutations.kitchen.addBallsToTray, {
    ballType: 'big',
    count: 50
  });
  order = await t.run(async (ctx) => ctx.db.get(orderId));
  expect(order?.status).toBe('InProduction');

  // Complete production (auto-transition to Packaging)
  await t.mutation(api.orders.mutations.kitchen.addBallsToTray, {
    ballType: 'big',
    count: 50 // Remaining balls
  });
  order = await t.run(async (ctx) => ctx.db.get(orderId));
  expect(order?.status).toBe('Packaging');

  // ... continue through Boxed → Labeled → WaitingShipment → CompleteShipped
});
```

### Anti-Patterns to Avoid
- **Mocking database operations:** convex-test provides real database, mocking defeats the purpose of integration tests
- **Testing implementation details:** Focus on behavior (status transitions, data consistency) not internal function calls
- **Sharing state between tests:** Each test should create its own data (convexTest gives isolated DB per test)
- **Overly complex helpers:** Helpers should be simple fixtures, not business logic (keep logic in Convex functions)
- **Missing cleanup verification:** Always verify side effects (inventory released, reservations cleared, events logged)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test database isolation | Custom DB reset/cleanup logic | `convexTest(schema)` | Creates fresh isolated database per test automatically, handles schema validation |
| Date/time mocking | Custom time travel functions | Vitest's `vi.setSystemTime()` | Built-in time manipulation, avoids inconsistent state |
| Async assertion helpers | Custom promise wrappers | Vitest's `expect.resolves` / `expect.rejects` | Type-safe, handles errors properly, clearer syntax |
| Test fixtures | Factory functions with complex logic | Simple helper functions returning IDs | Keep fixtures declarative, avoid hidden complexity |
| Error message matching | String includes checks | `toThrow()` / `toThrowError()` matchers | More robust, better error messages on failure |

**Key insight:** convex-test eliminates 90% of typical backend testing complexity (database setup, cleanup, isolation, schema validation). Don't recreate these solutions - use the library's built-in capabilities.

## Common Pitfalls

### Pitfall 1: Not Verifying Auto-Transitions
**What goes wrong:** Tests verify direct status updates but miss auto-transitions (e.g., Confirmed → InProduction when first ball is filled)
**Why it happens:** Auto-transitions are triggered by side effects (ball distribution, production completion) not explicit status updates
**How to avoid:** After every mutation that could trigger auto-transition, re-fetch the order and verify expected status
**Warning signs:** Production issues where orders get stuck in Confirmed despite having balls filled

**Example:**
```typescript
// BAD: Assumes status stays Confirmed
await t.mutation(api.orders.mutations.kitchen.addBallsToTray, {
  ballType: 'big',
  count: 10
});
// Missing: status check after ball distribution

// GOOD: Verifies auto-transition
await t.mutation(api.orders.mutations.kitchen.addBallsToTray, {
  ballType: 'big',
  count: 10
});
const order = await t.run(async (ctx) => ctx.db.get(orderId));
expect(order?.status).toBe('InProduction'); // Auto-transitioned
```

### Pitfall 2: Ghost Ball Detection Requires Production Records Check
**What goes wrong:** Tests verify ball counts match but don't verify traceability (balls produced but not linked to any order)
**Why it happens:** Ball distribution can succeed partially, leaving unallocated balls in "to-sticker" pile
**How to avoid:** After ball production, query `orderItemProduction` table and verify `unitsRemaining` sum matches total balls produced minus distributed
**Warning signs:** Kitchen staff reports "we have balls in the sticker pile but can't find the order"

**Example:**
```typescript
// Produce 100 balls, but only 60 get allocated to orders
await t.mutation(api.orders.mutations.kitchen.addBallsToTray, {
  ballType: 'big',
  count: 100
});

// CRITICAL: Verify no ghost balls
const allProduction = await t.run(async (ctx) => {
  return await ctx.db.query('orderItemProduction').collect();
});

const totalUnitsRemaining = allProduction.reduce((sum, p) =>
  p.isCancelled ? sum : sum + p.unitsRemaining, 0
);

// 40 balls should be traceable as "waiting allocation"
// NOT lost in limbo
expect(totalUnitsRemaining).toBe(40);
```

### Pitfall 3: FIFO Violations from Expired Batch Filtering
**What goes wrong:** Tests pass when consuming from unexpired batches, fail in production when old batches expire mid-consumption
**Why it happens:** FIFO logic filters out expired batches but tests don't include expiry scenarios
**How to avoid:** Create test scenarios with expired batches in the FIFO queue, verify they're skipped correctly
**Warning signs:** Waste increases (newer batches consumed before older ones expired)

**Example:**
```typescript
test('FIFO skips expired batch and consumes next oldest', async () => {
  const t = convexTest(schema);

  const componentId = await createComponentType(t);
  const locationId = await createLocation(t);

  // Create batches: old (expired), middle (active), new (active)
  await createBatch(t, componentId, locationId, {
    quantity: 100,
    purchaseDate: Date.now() - 172800000, // 2 days ago
    expiryDate: Date.now() - 86400000, // Expired yesterday
    status: 'expired'
  });

  const middleBatchId = await createBatch(t, componentId, locationId, {
    quantity: 50,
    purchaseDate: Date.now() - 86400000 // 1 day ago
  });

  // Consume should use middle batch, NOT expired batch
  await t.mutation(api.inventory.consumeStock, {
    componentTypeId: componentId,
    locationId,
    quantity: 30
  });

  const middleBatch = await t.run(async (ctx) => ctx.db.get(middleBatchId));
  expect(middleBatch?.quantityRemaining).toBe(20); // 50 - 30
});
```

### Pitfall 4: Incomplete Cancellation Rollback
**What goes wrong:** Tests verify order status changes to Cancelled but don't verify all side effects are reversed (inventory, reservations, production records)
**Why it happens:** Cancellation logic is complex (7+ different cleanup operations), easy to miss one
**How to avoid:** Create comprehensive rollback verification helper that checks all related tables
**Warning signs:** Inventory slowly leaks (reservations never released), production records left active after cancellation

**Example:**
```typescript
async function verifyOrderFullyCancelled(
  t: TestContext,
  orderId: Id<'orders'>
) {
  const order = await t.run(async (ctx) => ctx.db.get(orderId));
  expect(order?.status).toBe('Cancelled');

  // Verify inventory reservations released
  const reservations = await t.run(async (ctx) => {
    return await ctx.db
      .query('orderComponentReservations')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .filter((q) => q.eq(q.field('status'), 'reserved'))
      .collect();
  });
  expect(reservations.length).toBe(0);

  // Verify production records cancelled
  const items = await t.run(async (ctx) => {
    return await ctx.db
      .query('orderItems')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .collect();
  });

  for (const item of items) {
    const prodRecords = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', item._id))
        .filter((q) => q.eq(q.field('isCancelled'), false))
        .collect();
    });
    expect(prodRecords.length).toBe(0);
  }

  // Verify voucher usage released
  const voucherUsage = await t.run(async (ctx) => {
    return await ctx.db
      .query('voucherUsage')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .first();
  });
  expect(voucherUsage).toBeNull();

  // Verify cancellation event logged
  const events = await t.run(async (ctx) => {
    return await ctx.db
      .query('orderEvents')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .filter((q) => q.eq(q.field('eventType'), 'cancellation'))
      .collect();
  });
  expect(events.length).toBeGreaterThan(0);
}
```

### Pitfall 5: Not Testing Invalid Transitions
**What goes wrong:** Tests verify valid workflow but don't verify system rejects invalid transitions (skipping steps, going backwards)
**Why it happens:** Validation logic is defensive, tests often focus on happy path
**How to avoid:** Create negative test cases for each invalid transition using `expect().rejects.toThrow()`
**Warning signs:** Orders bypass critical steps (Draft → Boxed without inventory reservation)

**Example:**
```typescript
test('rejects skipping from Draft to Boxed', async () => {
  const t = convexTest(schema);

  const orderId = await createBasicOrder(t);

  // Should reject invalid transition
  await expect(
    t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'Boxed'
    })
  ).rejects.toThrow('Invalid status transition');
});

test('rejects backwards transition from Labeled to InProduction', async () => {
  const t = convexTest(schema);

  const orderId = await createOrderAtStatus(t, 'Labeled');

  await expect(
    t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'InProduction'
    })
  ).rejects.toThrow('Cannot go backwards');
});
```

## Code Examples

Verified patterns from existing codebase and official docs:

### Test Structure (from tests/convex/orders.test.ts)
```typescript
// Existing working pattern
import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { createCustomer, createDefaultStorageLocation } from './helpers';

describe('Order Number Generation', () => {
  test('generates order number in MMDD-NNN format', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        {
          productName: 'Test Product',
          quantity: 1,
          unitPrice: 10000,
          unitCost: 5000,
        },
      ],
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));

    expect(order?.orderNumber).toMatch(/^\d{4}-\d{3}$/);
  });
});
```

### Helper Functions (from tests/convex/helpers.ts)
```typescript
// Reusable fixture pattern
export async function createCustomer(
  t: TestContext,
  overrides: {
    name?: string;
    phone?: string;
    source?: string;
  } = {}
): Promise<Id<'customers'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('customers', {
      name: overrides.name ?? 'Test Customer',
      phone: overrides.phone ?? '+62812345678',
      source: overrides.source ?? 'Test',
      createdBy: 'test',
    });
  });
}
```

### Error Assertions (from Convex docs)
```typescript
// Source: https://docs.convex.dev/testing/convex-test
test('validates minimum order amount for voucher', async () => {
  const t = convexTest(schema);

  await expect(async () => {
    await t.mutation(api.orders.mutations.create, {
      customerId,
      voucherCode: 'MIN50K',
      items: [{ productName: 'Cheap', quantity: 1, unitPrice: 10000 }]
    });
  }).rejects.toThrowError('Minimum order of Rp 50,000 required');
});
```

### Direct Database Queries (from tests/convex/inventory.test.ts)
```typescript
// Verify state directly via database
const batches = await t.run(async (ctx) => {
  return await ctx.db
    .query('inventoryBatches')
    .withIndex('by_component_location', (q) =>
      q.eq('componentTypeId', compId).eq('locationId', locId)
    )
    .filter((q) => q.eq(q.field('status'), 'active'))
    .collect();
});

expect(batches.length).toBe(2);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for Vite projects | Vitest | 2023-2024 | 10-20x faster test execution, native ESM support, better TypeScript integration |
| Manual DB setup/teardown | convex-test isolation | 2024 (convex-test v0.0.x) | Each test gets clean database automatically, no cleanup code needed |
| Mocking database calls | Real database integration | With convex-test adoption | Tests catch real issues (race conditions, schema violations, index performance) |
| Test files far from source | Co-located tests | Modern best practice | Faster navigation, easier maintenance, clearer ownership |

**Deprecated/outdated:**
- **Jest with Vite:** Jest requires complex ESM transforms for Vite projects. Use Vitest (Vite-native).
- **Manual transaction rollback:** convex-test handles isolation. Don't write cleanup logic.
- **Testing library `screen` queries for backend:** Backend tests don't use React Testing Library patterns.

## Open Questions

1. **Coverage thresholds for Phase 1?**
   - What we know: vitest.config.ts has coverage setup but no thresholds defined
   - What's unclear: Whether to enforce minimums (80%? 90%?) or just measure baseline
   - Recommendation: Measure coverage but don't block on thresholds (phase goal is safety net, not metrics). Add thresholds later if needed.

2. **Test execution time budget?**
   - What we know: 4 files × 20-25 tests = ~90 tests, existing 12 tests run in <1s
   - What's unclear: Acceptable total runtime (5s? 10s? 30s?)
   - Recommendation: Aim for <10s total runtime (enables watch mode). Vitest runs parallel by default, should be fast.

3. **Should tests verify audit logs (orderEvents)?**
   - What we know: System logs transitions to `orderEvents` table, existing tests don't verify
   - What's unclear: Whether audit completeness is in scope for integration tests
   - Recommendation: Include audit verification in cancellation tests (ensures rollback logged), skip for other scenarios to keep tests focused.

## Sources

### Primary (HIGH confidence)
- Convex Testing Documentation - https://docs.convex.dev/testing/convex-test (testing patterns, convex-test API)
- Project codebase tests/convex/*.test.ts (existing working patterns, helper functions)
- vitest.config.ts (project configuration, coverage setup)
- package.json (dependency versions: vitest ^4.0.18, convex-test ^0.0.41)

### Secondary (MEDIUM confidence)
- [Vitest Best Practices and Coding Standards](https://www.projectrules.ai/rules/vitest) (AAA pattern, test organization)
- [Unit Testing with Vitest | CS4530, Spring 2026](https://neu-se.github.io/CS4530-Spring-2026/tutorials/week1-unit-testing) (TypeScript testing patterns)
- [React Testing Made Easy: A Complete Guide to Vitest with Vite](https://www.techedubyte.com/react-testing-vitest-vite-guide/) (Vitest performance characteristics)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, versions verified from package.json
- Architecture: HIGH - Existing test files demonstrate working patterns, convex-test docs are authoritative
- Pitfalls: HIGH - Based on user's reported production issues (ghost balls, inventory leaks) and codebase analysis
- Coverage estimates: MEDIUM - Extrapolated from existing test count (12 tests for basic orders) to complex scenarios

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (30 days - stable libraries, well-established patterns)

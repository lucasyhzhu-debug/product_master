# Frollie Recipe Master - Refactoring & Optimization Roadmap

**Created:** 2026-02-02
**Status:** Active
**Last Updated:** 2026-02-02

---

## Completed Work

### ✅ Project 1: Orders Mutations Refactoring
**Branch:** `refactor/orders-mutations-helpers` | **Status:** PR Ready

- Reduced `mutations.ts` from 2,010 → 1,405 lines (30%)
- Created two-tier helper architecture (pure vs ctx-dependent)
- Eliminated ~430 lines of duplicated ball distribution logic
- Documented architecture in CODE_STYLE.md

---

## Next Steps (Prioritized by Impact)

### 🔴 Priority 1: Dual-Write System Removal
**Impact:** HIGH | **Effort:** 1-2 days | **Risk:** Medium-High | **Depends On:** Project 1

**Problem:**
Kitchen View currently maintains two parallel tracking systems that must stay in sync:
- OLD: `orderItems.ballsRemaining` (deprecated)
- NEW: `orderItemProduction.unitsRemaining` + `orderItems.ballsFilled/packageStatus`

This creates:
- Double the database writes on every ball operation
- Risk of desync bugs
- Confusing codebase with deprecated fields still in use
- Technical debt that compounds over time

**Migration Plan:**
```
Phase A: Verification (2-4 hours)
├── Audit all queries reading from OLD system
├── Verify NEW system has complete data for all orders
├── Create data validation script comparing OLD vs NEW values
└── Document any discrepancies

Phase B: Query Migration (2-4 hours)
├── Update convex/orders/queries.ts to read from NEW system
├── Update src/pages/KitchenView.tsx to use NEW fields
├── Update any dashboard queries using ballsRemaining
└── Test all read paths work correctly

Phase C: Write Migration (2-4 hours)
├── Remove OLD system writes from distributeBallsToOrders()
├── Remove OLD system writes from other mutations
├── Update productionRecords helpers if needed
└── Test all write paths

Phase D: Cleanup (1-2 hours)
├── Mark ballsRemaining as @deprecated in schema
├── Update SCHEMA.md documentation
├── Consider data migration to remove old field values
└── Update CHANGELOG.md
```

**Files Affected:**
| File | Changes |
|------|---------|
| `convex/orders/helpers/ballDistribution.ts` | Remove OLD system writes |
| `convex/orders/queries.ts` | Switch reads to NEW system |
| `src/pages/KitchenView.tsx` | Use NEW system fields |
| `convex/schema.ts` | Deprecate ballsRemaining |

**Success Criteria:**
- [ ] All Kitchen View functionality works with NEW system only
- [ ] No references to `ballsRemaining` in active code paths
- [ ] Database writes reduced by ~50% for ball operations

---

### 🟠 Priority 2: Add Comprehensive Tests
**Impact:** MEDIUM-HIGH | **Effort:** 1 day | **Risk:** Very Low | **Depends On:** Project 1

**Problem:**
The refactored helpers have no automated tests. Any future changes risk breaking the complex ball distribution logic without immediate feedback.

**Test Coverage Plan:**
```
Unit Tests (Pure Helpers - helpers.ts)
├── calculateLineTotals() - various quantity/price combos
├── calculateOrderTotals() - multiple items, edge cases
├── recalculateFinalTotal() - percentage vs amount discounts
└── generateOrderNumber() - date formatting, sequence

Integration Tests (Ctx Helpers - helpers/*.ts)
├── distributeBallsToOrders()
│   ├── Single order, exact ball count
│   ├── Multiple orders, priority sorting
│   ├── Overflow handling
│   ├── Status transitions (Confirmed → InProduction → Packaging)
│   └── Dual-write sync verification
├── statusTransitions.ts
│   ├── isTerminalStatus() - all status values
│   ├── logOrderEvent() - audit trail creation
│   └── transitionToPackaging() - item completion
├── usageTracking.ts
│   ├── Increment creates record if missing
│   ├── Decrement doesn't go negative
│   └── Multiple increments accumulate
└── productionRecords.ts
    ├── Create records from menu product
    ├── Update for quantity change
    └── Cancel cascade
```

**Files to Create:**
| File | Test Count (Est.) |
|------|-------------------|
| `convex/orders/__tests__/helpers.test.ts` | 12 tests |
| `convex/orders/__tests__/ballDistribution.test.ts` | 15 tests |
| `convex/orders/__tests__/statusTransitions.test.ts` | 8 tests |
| `convex/orders/__tests__/usageTracking.test.ts` | 6 tests |
| `convex/orders/__tests__/productionRecords.test.ts` | 10 tests |

**Success Criteria:**
- [ ] 80%+ code coverage on helpers
- [ ] All edge cases for ball distribution covered
- [ ] Tests run in < 30 seconds
- [ ] CI pipeline includes test run

---

### 🟡 Priority 3: Refactor queries.ts
**Impact:** MEDIUM | **Effort:** 2-4 hours | **Risk:** Low | **Depends On:** None

**Problem:**
`convex/orders/queries.ts` has repeated patterns for:
- Fetching orders with items
- Enriching orders with customer data
- Filtering by status
- N+1 query patterns (fetching items per order in a loop)

**Refactoring Plan:**
```
Extract Query Helpers
├── getOrderWithItems(ctx, orderId) - single order enriched
├── getOrdersWithItems(ctx, orderIds) - batch enrichment
├── enrichOrderWithCustomer(ctx, order) - add customer data
└── getOrderItemsWithProduction(ctx, orderId) - already exists, reuse

Consolidate Query Patterns
├── Merge getById vs getByIdWithItems into single flexible query
├── Add pagination support for list queries
└── Optimize N+1 with batch fetching

Add Missing Indexes (if needed)
├── Review query analyzer in Convex dashboard
└── Add indexes for common filter patterns
```

**Files Affected:**
| File | Changes |
|------|---------|
| `convex/orders/queries.ts` | Refactor to use helpers |
| `convex/orders/helpers/queryHelpers.ts` | NEW: Query helper functions |
| `convex/orders/helpers/index.ts` | Add export |

**Success Criteria:**
- [ ] No N+1 queries in order list views
- [ ] Single source of truth for order enrichment
- [ ] Pagination available for order lists

---

### 🟢 Priority 4: Refactor Other Entity Mutations
**Impact:** MEDIUM | **Effort:** 1 day each | **Risk:** Low | **Depends On:** Project 1 (patterns)

**Problem:**
Other mutation files have similar patterns that could benefit from the same refactoring:

| File | Lines | Key Patterns to Extract |
|------|-------|-------------------------|
| `recipes/mutations.ts` | ~600 | Version creation, cost calculation, deep copy |
| `products/mutations.ts` | ~500 | COGS calculation, version pinning |
| `packaging/mutations.ts` | ~400 | Same as recipes |

**Approach:**
Apply the same two-tier helper architecture learned from orders:
1. Identify pure calculation functions → `helpers.ts`
2. Identify ctx-dependent operations → `helpers/*.ts`
3. Create thin mutation wrappers
4. Document patterns in CODE_STYLE.md

**Recommended Order:**
1. **recipes** - Most complex, establishes versioning patterns
2. **products** - Uses recipe patterns, adds COGS
3. **packaging** - Mirrors recipes, straightforward

**Success Criteria:**
- [ ] Each mutation file reduced by 20-30%
- [ ] Consistent helper architecture across entities
- [ ] Version creation pattern extracted and reusable

---

### 🔵 Priority 5: Performance Optimization
**Impact:** LOW-MEDIUM | **Effort:** Variable | **Risk:** Low | **Depends On:** All above

**Problem:**
Several performance opportunities identified during refactoring:

```
Ball Distribution N+1 Queries
├── Current: Fetches production records per item in a loop
├── Impact: Slow for orders with many items
└── Fix: Batch query with ctx.db.query().filter()

Order List Pagination
├── Current: Loads all orders into memory
├── Impact: Slow dashboard, memory pressure
└── Fix: Use Convex pagination API

Denormalized Count Updates
├── Current: Multiple patches per mutation
├── Impact: More database operations than needed
└── Fix: Batch patches where possible

Index Optimization
├── Current: Unknown index utilization
├── Impact: Potentially slow queries
└── Fix: Audit with Convex Query Analyzer
```

**Approach:**
1. Profile current performance with realistic data
2. Prioritize by user-facing impact
3. Implement fixes incrementally
4. Measure improvement

**Success Criteria:**
- [ ] Kitchen View loads in < 500ms
- [ ] Order list pagination working
- [ ] No queries scanning full tables

---

## Quick Reference: Effort Estimates

| Project | Effort | Impact | Risk | Dependencies |
|---------|--------|--------|------|--------------|
| 1. Orders Mutations ✅ | 4-6 hours | HIGH | Medium | None |
| 2. Dual-Write Removal | 1-2 days | HIGH | Medium-High | Project 1 |
| 3. Add Tests | 1 day | MEDIUM-HIGH | Very Low | Project 1 |
| 4. Refactor queries.ts | 2-4 hours | MEDIUM | Low | None |
| 5. Other Entity Mutations | 1 day each | MEDIUM | Low | Project 1 |
| 6. Performance | Variable | LOW-MEDIUM | Low | All above |

---

## Recommended Execution Order

```
Week 1:
├── Day 1-2: Dual-Write Removal (Priority 1)
└── Day 3-4: Add Tests (Priority 2)

Week 2:
├── Day 1: Refactor queries.ts (Priority 3)
├── Day 2-3: Refactor recipes/mutations.ts (Priority 4)
└── Day 4: Refactor products/mutations.ts (Priority 4)

Week 3:
├── Day 1: Refactor packaging/mutations.ts (Priority 4)
├── Day 2-3: Performance Optimization (Priority 5)
└── Day 4: Documentation & Cleanup
```

---

## Notes

- Always create feature branch per project
- Run `/document` after each project
- Get PR approval before merging
- Update this roadmap as work progresses

---

## Change Log

| Date | Change |
|------|--------|
| 2026-02-02 | Initial roadmap created after orders refactoring |

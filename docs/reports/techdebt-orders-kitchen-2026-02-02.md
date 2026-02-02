# Tech Debt Analysis: Orders & Kitchen Sections

**Report Date:** 2026-02-02
**Analysis Level:** CTO-Level (Comprehensive)
**Scope:** Orders module (backend + frontend kitchen)
**Total Issues:** 34 (6 Critical, 10 High, 10 Medium, 8 Low)

---

## Executive Summary

The orders and kitchen sections have accumulated significant technical debt due to rapid feature iteration and dual-write patterns. The codebase exhibits multiple architectural issues including bloated query functions, deep nesting in components, legacy system coexistence, and missing abstractions.

**Key Findings:**
- **Dual-write system** causing data inconsistency between OLD (orderItems fields) and NEW (orderItemProduction table) systems
- **N+1 query patterns** with up to 6-12 database queries per request
- **Giant functions** (228 lines max) violating single responsibility principle
- **~70% untested** critical business logic in ball distribution
- **15+ duplicate patterns** for status filtering, item fetching, and ball calculations

---

## Priority Implementation Roadmap

### Phase 1: Stabilize Data Consistency (Priority: CRITICAL)
**Estimated effort:** 1-2 weeks

| Task | Impact | Files |
|------|--------|-------|
| Deprecate OLD system, migrate to `orderItemProduction` only | Eliminates data inconsistency | `mutations.ts`, `ballDistribution.ts`, `queries.ts` |
| Create single `calculateBallsNeeded()` helper | 3 calculation sources → 1 | `convex/orders/helpers/ballCalculation.ts` |
| Extract `fetchOrdersByStatuses()` helper | 6 duplicated queries → 1 | `convex/orders/helpers/statusFetching.ts` |
| Add unit tests for ball distribution | 339 untested lines | `convex/orders/__tests__/ballDistribution.test.ts` |

### Phase 2: Reduce Query Complexity (Priority: HIGH)
**Estimated effort:** 1 week

| Task | Impact | Files |
|------|--------|-------|
| Refactor `getKitchenOrders` (147 lines → 5 functions) | Single responsibility | `queries.ts` |
| Refactor `getKitchenStats` (153 lines → 3 functions) | Maintainability | `queries.ts` |
| Eliminate N+1 patterns with batch fetching | 6-12 queries → 2-3 | `queries.ts`, `ballDistribution.ts` |
| Extract common `getOrderItems()` helper | 15+ duplications → 1 | `convex/orders/helpers/orderItems.ts` |

### Phase 3: Improve Architecture (Priority: HIGH)
**Estimated effort:** 1 week

| Task | Impact | Files |
|------|--------|-------|
| Centralize order state machine | Scattered transitions → 1 class | `convex/orders/helpers/orderStateMachine.ts` |
| Break up `create` mutation (228 lines) | 5 sub-operations extracted | `mutations.ts` |
| Create `usePendingBallStats()` hook | Duplicated frontend logic | `src/hooks/usePendingBallStats.ts` |
| Fix type safety (`Record<string, unknown>`) | Runtime type errors | `mutations.ts` |

### Phase 4: Polish (Priority: MEDIUM)
**Estimated effort:** 1 week

| Task | Impact | Files |
|------|--------|-------|
| Standardize field naming (snake_case vs camelCase) | Developer friction | Schema + Frontend |
| Consolidate WhatsApp templates | 6 similar functions | `whatsapp.ts` |
| Remove PRD comment drift | Unclear requirements | `queries.ts` |
| Add missing indexes for common queries | Performance | `schema.ts` |

---

## Critical Issues Detail

### C1: Dual-Write System Inconsistency (CRITICAL)

**Problem:** Orders maintain both OLD and NEW production tracking systems that calculate differently.

**OLD System (deprecated):**
```typescript
// orderItems fields
productionType: "original" | "bite_sized"
productionUnits: number
ballsRemaining: number
ballsFilled: number
```

**NEW System (current):**
```typescript
// orderItemProduction table
productionUnitTypeId: Id<"productionUnitTypes">
unitsRequired: number
unitsCompleted: number
unitsRemaining: number
```

**Calculation Mismatch:**
| Location | Calculation |
|----------|-------------|
| `queries.ts:243` | `record.unitsRequired` |
| `mutations.ts:978` | `item.productionUnits * item.quantity` |
| `productionRecords.ts:171` | `component.quantity * quantity` |

**Fix:** Create single source of truth helper:
```typescript
// convex/orders/helpers/ballCalculation.ts
export function calculateBallsNeeded(
  item: Doc<"orderItems">,
  productionRecords: Doc<"orderItemProduction">[]
): { bigBalls: number; midBalls: number } {
  // Single calculation logic
}
```

### C2: Status Filter Duplication (CRITICAL)

**Problem:** `getKitchenOrders` has 6 identical status queries (lines 161-189):

```typescript
// DUPLICATED 6 times
const draftOrders = await ctx.db
  .query("orders")
  .withIndex("by_status", (q) => q.eq("status", "Draft"))
  .collect();
```

**Fix:** Extract to helper:
```typescript
// convex/orders/helpers/statusFetching.ts
export async function fetchOrdersByStatuses(
  ctx: QueryCtx,
  statuses: string[]
): Promise<Doc<"orders">[]> {
  const results = [];
  for (const status of statuses) {
    results.push(...await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect());
  }
  return results;
}
```

### C3: N+1 Query Pattern (CRITICAL)

**Problem:** `getKitchenOrders` performs 6 + N + N*M database queries:

```typescript
// 6 status queries
const orders = [...confirmedOrders, ...inProductionOrders, ...];

// N queries for items
for (const order of orders) {
  const items = await ctx.db.query("orderItems")...  // N
  for (const item of items) {
    const records = await ctx.db.query("orderItemProduction")...  // N*M
  }
}
```

**Fix:** Use batch fetch pattern (already in `getKitchenStats`):
```typescript
const allOrderItems = await ctx.db.query("orderItems").collect();
const allProductionRecords = await ctx.db.query("orderItemProduction").collect();
// Then filter in memory
```

---

## High Priority Issues

### H1: Giant Query Functions

| Function | Lines | Responsibilities |
|----------|-------|------------------|
| `getKitchenOrders` | 147 | Status fetch, item fetch, production records, ball calc, sorting |
| `getKitchenStats` | 153 | Status fetch, grouping, stats calc, production tracking |
| `create` mutation | 228 | Customer handling, menu products, item creation, order creation, usage tracking |

**Fix:** Extract each responsibility to separate function.

### H3: Frontend Ball Calculation Duplication

**Problem:** `KitchenView.tsx` lines 83-119 has two identical useMemo blocks:

```typescript
const { pendingOriginalCount, pendingOriginalBalls } = useMemo(() => {
  // 17 lines for original
}, [pendingOrders]);

const { pendingBiteSizedCount, pendingBiteSizedBalls } = useMemo(() => {
  // 17 lines for bite_sized (exact copy)
}, [pendingOrders]);
```

**Fix:** Create unified hook:
```typescript
// src/hooks/usePendingBallStats.ts
export function usePendingBallStats(pendingOrders) {
  return useMemo(() => ({
    original: calculateStats('original'),
    biteSized: calculateStats('bite_sized'),
  }), [pendingOrders]);
}
```

### H5: Missing Production Record Tests

**Problem:** `ballDistribution.ts` (339 lines) has ZERO unit tests for:
- Core distribution algorithm
- Edge cases (cancelled items, negative remaining, invalid types)
- Dual-system updates

---

## File Complexity Summary

| File | Lines | Issues | Recommendation |
|------|-------|--------|----------------|
| `convex/orders/mutations.ts` | 1712 | Type safety, giant functions | Break into smaller files |
| `convex/orders/queries.ts` | 839 | N+1, duplication, complexity | Extract helpers |
| `convex/orders/ballDistribution.ts` | 339 | Untested, dual-write, nesting | Add tests, simplify |
| `src/pages/KitchenView.tsx` | 488 | State explosion, duplication | Extract hooks |
| `src/pages/OrderDetail.tsx` | 673 | Unknown complexity | Needs audit |

---

## Issue Matrix by Severity

### Critical (6 issues)
| ID | Issue | Impact |
|----|-------|--------|
| C1 | Dual-write system inconsistency | Wrong ball counts displayed |
| C2 | Status filter duplication (6x) | Maintenance burden |
| C3 | N+1 query pattern | Slow page loads, DB overload |
| C4 | Ball calculation disagreement | Data inconsistency |
| C5 | `Record<string, unknown>` types | Runtime errors |
| C6 | Complex state without validation | Hard to debug |

### High (10 issues)
| ID | Issue | Impact |
|----|-------|--------|
| H1 | `getKitchenStats` 153 lines | Single responsibility violation |
| H2 | Order item fetch duplication (15x) | Code rot |
| H3 | Frontend ball calc duplication | Re-renders, bugs |
| H4 | `create` mutation 228 lines | Unmaintainable |
| H5 | Missing production record tests | No safety net |
| H6 | Field naming mismatch | Developer friction |
| H7 | Over-fetching in queries | Performance |
| H8 | Business logic scattered | Unclear ownership |
| H9 | `getKitchenOrders` 147 lines | Complexity |
| H10 | Over-complex sorting | 35 lines for sort |

### Medium (10 issues)
| ID | Issue |
|----|-------|
| M1 | WhatsApp template repetition |
| M2 | Unsafe type assertions |
| M3 | Missing memoization |
| M4 | Field naming inconsistency |
| M5 | Deeply nested loops |
| M6 | Comment/PRD drift |
| M7 | Status validation scattered |
| M8 | Redundant early returns |
| M9 | Frontend state explosion |
| M10 | In-memory filtering inefficiency |

---

## Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Largest function | 228 lines | <100 | CRITICAL |
| Max nesting depth | 4 levels | 2-3 | HIGH |
| Code duplication | 15+ patterns | <5 | CRITICAL |
| Test coverage (estimated) | ~30% | >80% | CRITICAL |
| DB queries per request | 6-12 | <3 | CRITICAL |
| Files over 300 lines | 5 | <2 | HIGH |

---

## ROI of Refactoring

**Business Impact:**
- Order fulfillment is critical path - bugs here affect revenue
- Kitchen efficiency depends on accurate ball counts
- Faster feature development for high-velocity orders/kitchen features

**Technical Impact:**
- Reduced bug risk in production systems
- Improved team velocity (less context-switching)
- Better observability (clearer code is easier to debug)
- Foundation for future scaling

**Recommended Timeline:**
- Phase 1 (Critical): Week 1-2
- Phase 2 (High): Week 2-3
- Phase 3 (High): Week 3-4
- Phase 4 (Medium): Week 4

**Total Estimated Effort:** 4 weeks of focused refactoring

---

## Next Steps

1. **Immediate:** Create tracking issues for Phase 1 items
2. **This sprint:** Start deprecating OLD system
3. **Before next feature:** Add ball distribution tests
4. **Code review policy:** No new code in giant functions

---

*Generated by tech debt analysis agent*

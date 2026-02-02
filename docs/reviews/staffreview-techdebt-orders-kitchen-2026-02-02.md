# Staff Review: Tech Debt Report - Orders & Kitchen

**Review Date:** 2026-02-02
**Reviewed By:** Staff Engineer (Claude Sonnet 4.5)
**Report Under Review:** `docs/reports/techdebt-orders-kitchen-2026-02-02.md`
**Context:** CLAUDE.md, CODE_STYLE.md, SCHEMA.md

---

## Executive Summary

The techdebt report provides a comprehensive CTO-level analysis with 34 identified issues across 4 severity levels. However, the implementation plan has several **critical gaps** that could derail execution:

1. **Schema inconsistency**: References `orderItemProduction` table not documented in SCHEMA.md
2. **Helper architecture mismatch**: Proposed helper locations violate CODE_STYLE.md conventions
3. **Missing migration strategy**: No concrete plan for OLD → NEW system transition
4. **Incomplete agent orchestration**: No specialist agent assignments for parallel execution

**Recommendation:** Refine to v2 before implementation. See detailed findings below.

---

## Staff Developer Review (Implementation)

### ✅ Strengths

1. **Excellent issue categorization** - Clear severity levels with impact assessment
2. **Good code examples** - Concrete before/after patterns for fixes
3. **Metrics-driven** - Quantified tech debt with target values
4. **Business context** - Links technical issues to revenue impact

### ❌ Critical Issues

#### C1: Helper Architecture Violations

**Problem:** Report suggests creating helpers that violate CODE_STYLE.md two-tier system.

**Evidence:**
```typescript
// Report proposes (WRONG):
// convex/orders/helpers/ballCalculation.ts
export function calculateBallsNeeded(
  item: Doc<"orderItems">,
  productionRecords: Doc<"orderItemProduction">[]
): { bigBalls: number; midBalls: number }
```

**CODE_STYLE.md Convention:**
- **Pure functions (no ctx)** → `convex/orders/helpers.ts`
- **Ctx-dependent (needs db)** → `convex/orders/helpers/*.ts`

**Fix:** `calculateBallsNeeded()` is pure (no db access), so it belongs in `helpers.ts`, not a separate file.

**Impact:** Violating this convention causes:
- Import conflicts between flat file and directory
- Confusion about where to add new helpers
- Breaks established testing patterns

#### C2: Missing Schema Documentation

**Problem:** Report references `orderItemProduction` table extensively but this table is **NOT documented in SCHEMA.md**.

**Evidence from Report:**
```typescript
// Line 85-89: NEW System (current)
productionUnitTypeId: Id<"productionUnitTypes">  // ❌ Table not in schema
unitsRequired: number
unitsCompleted: number
unitsRemaining: number
```

**Missing Tables:**
1. `orderItemProduction` - Production tracking records
2. `productionUnitTypes` - Production unit type definitions

**Impact:** Cannot implement Phase 1 without schema definition. Developers will be blocked.

**Required Action:** Document complete schema in SCHEMA.md before v2 publication.

#### C3: Type Safety - No Concrete Fixes

**Problem:** Report flags `Record<string, unknown>` (C5) but provides no fix examples.

**Evidence:** "C5: `Record<string, unknown>` types → Runtime errors"

**Missing:**
- Which mutations have type safety issues?
- What are the correct types?
- How to migrate existing code?

**Recommended Fix:**
```typescript
// BEFORE (unsafe)
const data: Record<string, unknown> = { ... };

// AFTER (type-safe)
interface OrderCreateData {
  customerId: Id<"customers">;
  items: OrderItemInput[];
  deliveryType: "Pickup" | "Delivery";
}
const data: OrderCreateData = { ... };
```

#### C4: No Test Framework Specified

**Problem:** Report says "Add unit tests" (line 33) but doesn't specify:
- Test framework (Jest? Vitest? Convex test utils?)
- Test patterns for Convex mutations
- Mock strategy for ctx-dependent helpers

**Impact:** Different developers will use different test approaches, causing inconsistent test coverage.

### 🟡 Improvement Areas

#### I1: Batch Fetching Pattern Not Extracted

**Finding:** Report correctly identifies N+1 queries (C3) and notes `getKitchenStats` already uses batch fetching (line 156). However, it doesn't propose extracting this pattern into a reusable helper.

**Proposed Solution:**
```typescript
// convex/orders/helpers/batchFetching.ts
export async function fetchOrdersWithItems(
  ctx: QueryCtx,
  orderIds: Id<"orders">[]
): Promise<Map<Id<"orders">, Doc<"orderItems">[]>> {
  const allItems = await ctx.db.query("orderItems").collect();
  const itemsByOrder = new Map();
  for (const item of allItems) {
    if (!itemsByOrder.has(item.orderId)) {
      itemsByOrder.set(item.orderId, []);
    }
    itemsByOrder.get(item.orderId)!.push(item);
  }
  return itemsByOrder;
}
```

#### I2: Missing Index Specifications

**Problem:** Phase 4 mentions "Add missing indexes" (line 63) but doesn't specify which queries need optimization.

**Recommended Additions:**
```typescript
// convex/schema.ts
orderItemProduction: defineTable({ ... })
  .index("by_order_item", ["orderItemId"])
  .index("by_production_type", ["productionUnitTypeId"])
  .index("by_status", ["orderItemId", "unitsRemaining"]) // For completion checks
```

#### I3: Frontend Responsive Design Omitted

**Finding:** Report analyzes `KitchenView.tsx` (488 lines, line 218) but doesn't mention CODE_STYLE.md responsive design requirements:
- Minimum 280px width testing
- Mobile-first patterns (`flex-col sm:flex-row`)
- Touch-friendly buttons (min 44px)

**Impact:** Refactored components may break on mobile if not tested.

### 🔵 Refinements

#### R1: Dual-Write Acknowledged But Not Explained

**Context:** CODE_STYLE.md lines 261-269 already document the dual-write system as an **intentional migration pattern**.

**Report Treatment:** Lists as "CRITICAL" bug without acknowledging it's documented technical debt.

**Suggested Reframe:**
```markdown
### C1: Dual-Write System (Intentional Tech Debt - Migration In Progress)

**Status:** Documented in CODE_STYLE.md as migration pattern
**Timeline:** Deprecation planned after all clients migrate to NEW system
**Current Risk:** Data inconsistency if writes are not atomic
**Action:** Accelerate migration timeline with concrete backfill plan
```

#### R2: Frontend Hook Duplication Fix Incomplete

**Report Proposal (H3):**
```typescript
// src/hooks/usePendingBallStats.ts
export function usePendingBallStats(pendingOrders) {
  return useMemo(() => ({
    original: calculateStats('original'),
    biteSized: calculateStats('bite_sized'),
  }), [pendingOrders]);
}
```

**Issue:** `calculateStats()` function not defined. Incomplete example.

**Complete Solution:**
```typescript
export function usePendingBallStats(
  pendingOrders: Order[] | undefined
): {
  original: { count: number; balls: number };
  biteSized: { count: number; balls: number };
} {
  return useMemo(() => {
    if (!pendingOrders) return {
      original: { count: 0, balls: 0 },
      biteSized: { count: 0, balls: 0 },
    };

    const calculateStats = (type: string) => {
      // Implementation here
    };

    return {
      original: calculateStats('original'),
      biteSized: calculateStats('bite_sized'),
    };
  }, [pendingOrders]);
}
```

---

## Principal Developer Review (Architecture)

### ✅ Strong Architectural Insights

1. **Correct identification of SRP violations** - Giant functions (228 lines) flagged
2. **Good state machine proposal** - Centralizing order transitions (line 50)
3. **Appropriate ROI analysis** - Links refactoring to business velocity (lines 277-297)

### ❌ Critical Architectural Gaps

#### A1: State Machine Design Incomplete

**Report Proposal:**
```typescript
// convex/orders/helpers/orderStateMachine.ts
// Centralize order state machine
```

**Missing:**
- Is this pure logic or ctx-dependent?
- Does it need to call `logOrderEvent()` (ctx-dependent)?
- What's the interface?

**Architectural Decision:**
Based on CODE_STYLE.md lines 235-250, state transitions that log events are **ctx-dependent**:

```typescript
// convex/orders/helpers/statusTransitions.ts (ALREADY EXISTS)
export async function transitionOrderStatus(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  newStatus: string,
  metadata?: Record<string, unknown>
) {
  await ctx.db.patch(orderId, { status: newStatus });
  await logOrderEvent(ctx, orderId, `Status changed to ${newStatus}`, metadata);
}
```

**Conclusion:** The state machine helper **already exists** in the correct location. Report should audit existing helper instead of proposing duplicate.

#### A2: No Rollback Plan

**Issue:** Report proposes 4 phases over 4 weeks but doesn't specify rollback strategy if issues arise.

**Required for v2:**
1. **Feature flags** for dual-write deprecation
2. **Backfill verification** queries to compare OLD vs NEW data
3. **Emergency revert** procedure for each phase

#### A3: Agent Orchestration Missing

**Finding:** Report lists phases but doesn't recommend which specialist agents should handle each:

**Proposed Assignments:**
- **Phase 1 (Data Consistency):** `convex-backend` agent (schema + mutations)
- **Phase 2 (Query Complexity):** `refactor-architect` agent (extract helpers)
- **Phase 3 (Frontend):** `frontend-integrator` agent (hooks + components)
- **Phase 4 (Polish):** `code-auditor` agent (read-only verification)

**Parallel Execution:**
- Phase 2 and Phase 3 can run **in parallel** (backend queries + frontend hooks)
- Phase 1 is a blocker for Phase 2 (need stable data model first)

#### A4: Schema Flow Not Validated

**Issue:** Report discusses ball distribution logic but doesn't validate against SCHEMA.md data flows.

**Example:** Report line 94-97 shows three different ball calculation sources:
```typescript
| Location | Calculation |
| queries.ts:243 | record.unitsRequired |
| mutations.ts:978 | item.productionUnits * item.quantity |
| productionRecords.ts:171 | component.quantity * quantity |
```

**Schema Validation Needed:**
- Where does `unitsRequired` come from? (orderItemProduction table)
- What's the relationship between `productionUnits` and `unitsRequired`?
- Which is the source of truth?

**Missing Diagram:** Flow chart showing:
```
Order Created → OrderItems Created → Production Records Created
                                      ↓
                              unitsRequired = productionUnits * quantity
                                      ↓
                              Kitchen: unitsRemaining decrements
                                      ↓
                              Complete when all unitsRemaining === 0
```

---

## Consolidated Recommendations

### 🔴 Critical (Block v2 Publication)

| ID | Issue | Action | Owner |
|----|-------|--------|-------|
| **CR-1** | Missing schema documentation | Document `orderItemProduction` + `productionUnitTypes` in SCHEMA.md | Principal Dev |
| **CR-2** | Helper architecture violations | Realign helpers with CODE_STYLE.md two-tier system | Staff Dev |
| **CR-3** | No migration strategy | Add concrete backfill + verification plan | Principal Dev |
| **CR-4** | Missing rollback plan | Add phase-by-phase rollback procedures | Principal Dev |

### 🟡 High Priority (Include in v2)

| ID | Issue | Action |
|----|-------|--------|
| **HP-1** | Extract batch fetching pattern | Create reusable helper from `getKitchenStats` |
| **HP-2** | Specify test framework | Document Convex test patterns + tooling |
| **HP-3** | Add index specifications | List exact indexes needed with queries |
| **HP-4** | Agent orchestration | Assign specialist agents to each phase |
| **HP-5** | Parallel execution plan | Identify phases that can run concurrently |

### 🔵 Refinements (Nice to Have)

| ID | Issue | Action |
|----|-------|--------|
| **RF-1** | Reframe dual-write context | Acknowledge intentional tech debt |
| **RF-2** | Complete hook examples | Provide full implementation with types |
| **RF-3** | Add schema flow diagram | Visualize order → production record flow |
| **RF-4** | Mobile testing checklist | Add 280px responsive design verification |

---

## Recommended Specialist Agents

### Phase 1: Data Consistency (Weeks 1-2)

**Primary Agent:** `convex-backend`
**Tasks:**
- Document `orderItemProduction` schema
- Create migration mutations
- Write backfill verification queries
- Add unit tests for ball calculations

**Secondary Agent:** `code-auditor` (read-only)
**Tasks:**
- Verify existing dual-write locations
- Check for missed migration spots

### Phase 2: Query Optimization (Week 2-3)

**Primary Agent:** `refactor-architect`
**Tasks:**
- Extract batch fetching helper
- Refactor `getKitchenOrders` (147 lines → 5 functions)
- Refactor `getKitchenStats` (153 lines → 3 functions)
- Eliminate N+1 patterns

**Parallel Track:** `frontend-integrator`
**Tasks:**
- Extract `usePendingBallStats()` hook
- Refactor `KitchenView.tsx` component splits

### Phase 3: Architecture (Week 3-4)

**Primary Agent:** `convex-backend`
**Tasks:**
- Audit existing state machine helpers
- Break up `create` mutation (228 lines)
- Add type safety fixes

**Secondary Agent:** `ui-component-builder`
**Tasks:**
- Ensure responsive design compliance (280px)
- Touch-friendly button sizes

### Phase 4: Polish (Week 4)

**Primary Agent:** `code-auditor`
**Tasks:**
- Read-only verification of changes
- Generate test coverage report
- Validate index usage

**Secondary Agent:** `convex-backend`
**Tasks:**
- Add missing indexes
- Consolidate WhatsApp templates

---

## V2 Refinement Checklist

Before publishing refined v2 plan:

- [ ] **CR-1:** Add schema documentation for missing tables
- [ ] **CR-2:** Realign all helper proposals with CODE_STYLE.md
- [ ] **CR-3:** Add 3-step migration strategy (backfill → verify → deprecate)
- [ ] **CR-4:** Add rollback procedures for each phase
- [ ] **HP-1:** Extract batch fetching pattern specification
- [ ] **HP-2:** Specify test framework and patterns
- [ ] **HP-3:** List required indexes with queries
- [ ] **HP-4:** Assign agents to phases
- [ ] **HP-5:** Document parallel execution tracks
- [ ] **RF-1:** Reframe dual-write as intentional debt
- [ ] **RF-2:** Complete hook implementation examples
- [ ] **RF-3:** Add schema flow diagram
- [ ] **RF-4:** Add mobile testing requirements

---

## Success Metrics for V2

### Completeness
- ✅ All schema gaps documented
- ✅ All helpers aligned with conventions
- ✅ Migration strategy with verification steps
- ✅ Rollback plan for each phase

### Actionability
- ✅ Clear agent assignments
- ✅ Parallel execution paths identified
- ✅ Concrete code examples for all proposals
- ✅ Test patterns specified

### Risk Mitigation
- ✅ Rollback procedures documented
- ✅ Verification queries for each migration step
- ✅ Feature flags for gradual rollout
- ✅ No breaking changes to existing clients

---

## Next Steps

1. **Principal Dev:** Review schema gaps (CR-1) and document missing tables
2. **Staff Dev:** Validate helper architecture alignment (CR-2)
3. **CTO/Orchestrator:** Review agent assignments and approve parallel execution plan
4. **All:** Complete v2 refinement checklist before implementation

---

*Staff review completed by Claude Sonnet 4.5*
*Review methodology: CODE_STYLE.md + SCHEMA.md validation*
*Focus: Implementation patterns, architecture, agent orchestration*

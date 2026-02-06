# Staff Review: BOM System End-to-End Testing Guide

**Date:** 2026-02-06
**Plan:** `C:\Users\Irfan\.claude\plans\fluttering-mapping-blum.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

**Status:** INCOMPLETE - This is a testing guide, not an implementation plan

The document is structured as a manual testing guide rather than an implementation plan. It lacks:

- [ ] **Git Workflow section:** Present but empty ("Branch: TBD")
- [ ] **Implementation Waves:** Skeleton only, no agents/tasks assigned
- [ ] **Success Criteria:** Basic (type-check + build) but missing test-specific criteria

**Assessment:** This is intentional - the document is designed for manual QA testing, not for agent implementation. The Implementation Plan section (lines 268-299) is explicitly marked "To be filled based on test findings" - it's a placeholder for post-testing fixes.

---

## 1. Summary

**Overall Assessment:** REVISE - Restructure for Automation-First Approach

The BOM testing guide is comprehensive but inefficient. Approximately **65% of the test scenarios are testing backend logic** (mutations, queries, calculations) that CAN and SHOULD be tested with convex-test/Vitest. The current approach requires a human to click through the UI to verify backend correctness, which is:

1. Time-consuming (2-3 hours of manual testing)
2. Error-prone (manual verification of calculations)
3. Not repeatable (no CI protection against regressions)
4. Wasteful of engineer time for logic that can be unit-tested

**Recommendation:** Split the guide into two phases:
1. **Phase 1: Automated Backend Tests** (convex-test) - Run first, in CI
2. **Phase 2: Reduced Manual UI Tests** - Only what genuinely requires browser interaction

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Backend logic tested via manual UI | Testing Strategy | Sections 1-6 |
| 2 | No test files created for BOM system | Missing Artifacts | N/A |
| 3 | Cost calculations verified manually | Efficiency | Section 6 |

### Issue 1: Backend Logic Tested via Manual UI

**Problem:** The testing guide requires a human to navigate the UI to verify backend logic that has no UI dependencies. Examples:

- **Section 1.6** "Delete validation" - Testing mutation error handling
- **Section 5.2** "Order confirmation triggers stock reservation" - Testing mutation side effects
- **Section 5.5-5.6** "Boxing/labeling consumption" - Testing FIFO logic
- **Section 6.1** "COGS breakdown" - Testing cost calculations

**Impact:**
- Manual testing takes 2-3 hours vs. 30 seconds for automated tests
- No regression protection - tests must be repeated manually after every change
- Human error in calculation verification

**Recommendation:** Create automated test files that cover these scenarios. See Section 5 for specific automation mapping.

### Issue 2: No Test Files Created for BOM System

**Problem:** The BOM system (componentTypes, menuProductComponents, inventory) has zero test coverage. Compare:

| Module | Test File | Status |
|--------|-----------|--------|
| costCalculator | `convex/lib/__tests__/costCalculator.test.ts` | 24 tests |
| orderHelpers | `convex/orders/__tests__/orderHelpers.test.ts` | 25 tests |
| statusTransitions | `convex/orders/__tests__/statusTransitions.test.ts` | 12 tests |
| whatsappHelpers | `convex/orders/__tests__/whatsapp.test.ts` | 13 tests |
| **componentTypes** | None | **MISSING** |
| **inventory/fifo** | None | **MISSING** |
| **inventory/helpers** | None | **MISSING** |
| **menuProductComponents** | None | **MISSING** |

**Impact:** Any regression in BOM logic will only be caught during manual testing or production incidents.

**Recommendation:** Create test files for each module before running manual tests.

### Issue 3: Cost Calculations Verified Manually

**Problem:** Section 6.1 requires manual calculation verification:
> "Manually calculate: production cost + direct packaging cost = total COGS"
> "Compare with displayed `unitCost`"

The `convex/lib/costCalculator.ts` already has excellent test coverage. The BOM cost logic in menuProducts should be tested similarly.

**Recommendation:** Add `convex/menuProducts/__tests__/costCalculation.test.ts` to test COGS computation logic.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Create `convex/inventory/__tests__/` test suite | High | Medium |
| 2 | Create `convex/componentTypes/__tests__/mutations.test.ts` | High | Low |
| 3 | Add pure helper functions for calculation testing | High | Low |
| 4 | Reduce manual test list by 65% | High | Low |

### Improvement 1: Create Inventory Test Suite

Create `convex/inventory/__tests__/` with:

**File: `helpers.test.ts`**
```typescript
describe("calculateWeightedAvgCost", () => {
  it("should calculate weighted average from multiple batches");
  it("should return 0 for empty batches");
  it("should handle single batch");
});

describe("getAvailableQuantity", () => {
  it("should subtract reserved from remaining");
});

describe("isBatchExpired", () => {
  it("should return true for expired batches");
  it("should return false for non-expired");
  it("should return false if no expiry date");
});

describe("validateStockAdjustment", () => {
  it("should throw for negative stock");
  it("should throw if adjustment exceeds available");
  it("should pass for valid adjustments");
});
```

**File: `fifo.test.ts`**
Testing pure FIFO logic requires mocking ctx, but the consumption calculation logic can be extracted to pure functions:

```typescript
describe("FIFO consumption calculation", () => {
  it("should consume from oldest batch first");
  it("should skip expired batches");
  it("should throw for insufficient stock");
  it("should track total cost correctly");
});
```

### Improvement 2: Create ComponentTypes Mutation Tests

Many mutation validations in `convex/componentTypes/mutations.ts` are pure business rules:

```typescript
describe("componentTypes create validation", () => {
  it("should reject duplicate codes");
  it("should require gramsPerUnit for production components");
  it("should require trackInventory=true for packaging");
  it("should reject trackInventory=true for production");
  it("should auto-generate sortOrder");
  it("should default consumptionStage based on category");
});

describe("componentTypes delete validation", () => {
  it("should reject delete if used in menuProductComponents");
  it("should reject delete if has inventory batches");
  it("should reject delete if has stock records");
  it("should allow delete for unused components");
});
```

### Improvement 3: Extract Pure Functions for Testing

Currently, some logic is embedded in mutation handlers. Consider extracting to pure functions for easier testing:

**Current (in mutation):**
```typescript
// componentTypes/mutations.ts line 79-82
const consumptionStage = args.consumptionStage ??
  (args.category === "direct_packaging" ? "boxing" :
   args.category === "indirect_packaging" ? "none" :
   "none");
```

**Proposed (pure function):**
```typescript
// componentTypes/helpers.ts
export function getDefaultConsumptionStage(
  category: "production" | "direct_packaging" | "indirect_packaging"
): "boxing" | "labeling" | "none" {
  switch (category) {
    case "direct_packaging": return "boxing";
    case "indirect_packaging": return "none";
    case "production": return "none";
  }
}
```

This pattern already exists in `convex/orders/helpers.ts` (pure) vs `convex/orders/helpers/*.ts` (ctx-dependent).

---

## 4. Refinements (Minor Suggestions)

- **Section 1.2-1.4:** Combine "create component" tests into one parameterized section
- **Section 3.2-3.3:** "Receive stock" and "Transfer stock" could share setup
- **Section 5:** Add explicit data cleanup between order tests to prevent interference
- **Known Issues section:** Consider moving to a separate tracking document

---

## 5. Automation vs Manual Test Mapping

### AUTOMATED (convex-test / Vitest) - Backend Logic

These scenarios test backend mutations/queries with no UI dependency:

| Section | Scenario | Test Location | Priority |
|---------|----------|---------------|----------|
| **1. Component Types** |||
| 1.2-1.4 | Create component validation | `componentTypes/__tests__/mutations.test.ts` | P1 |
| 1.5 | Edit component | Same | P2 |
| 1.6 | Delete validation (dependency check) | Same | P1 |
| **2. Menu Products** |||
| 2.2 | COGS calculation from BOM | `menuProducts/__tests__/costCalculation.test.ts` | P1 |
| 2.4 | Component quantity changes update COGS | Same | P1 |
| 2.6 | Fixed product protection (isFixed) | `menuProducts/__tests__/mutations.test.ts` | P2 |
| **3. Inventory** |||
| 3.2 | Receive stock (batch creation) | `inventory/__tests__/mutations.test.ts` | P1 |
| 3.3 | Transfer stock (batch split) | Same | P1 |
| 3.4 | Low stock calculation | `inventory/__tests__/helpers.test.ts` | P2 |
| 3.5 | Batch management (FIFO order) | `inventory/__tests__/fifo.test.ts` | P1 |
| **4. Storage Locations** |||
| 4.2 | Delete location with stock (error) | `storageLocations/__tests__/mutations.test.ts` | P2 |
| **5. Order Flow** |||
| 5.2 | Stock reservation on confirmation | `orders/__tests__/inventoryIntegration.test.ts` | P1 |
| 5.3 | Production records auto-creation | Same | P1 |
| 5.5 | Boxing consumption (FIFO) | Same | P1 |
| 5.6 | Labeling consumption (FIFO) | Same | P1 |
| 5.7 | Cancellation releases stock | Same | P1 |
| **6. Cost Calculation** |||
| 6.1 | COGS breakdown math | `menuProducts/__tests__/costCalculation.test.ts` | P1 |
| 6.3 | Margin calculation | Same | P2 |

**Estimated Test Count:** ~45 new tests
**Estimated Implementation Time:** 4-6 hours

### MANUAL (Browser Testing) - UI Interaction Required

These scenarios REQUIRE human interaction because they test:
- Visual rendering / layout
- User flow / navigation
- Real-time updates
- Multi-step UI workflows
- Form behavior

| Section | Scenario | Reason for Manual |
|---------|----------|-------------------|
| **1. Component Types** ||
| 1.1 | View existing components (tabs, counts) | Visual layout, tab UI |
| 1.7 | Quick create from Inventory page | Cross-page navigation flow |
| **2. Menu Products** ||
| 2.1 | View POS grid (slot layout) | Visual grid layout |
| 2.3 | Packaging-only product (auto-detect) | Multi-step form interaction |
| 2.5 | POS slot swap confirmation dialog | Dialog interaction |
| 2.7 | Toggle active/inactive visual state | Visual feedback |
| **3. Inventory** ||
| 3.1 | View inventory report (tabs, stat cards) | Visual layout |
| **4. Storage Locations** ||
| 4.1 | View locations (layout check) | Visual layout |
| **5. Order Flow** ||
| 5.4 | Kitchen production flow (tray system) | Complex multi-step UI flow |

**Reduced Manual Test Count:** ~11 scenarios (down from ~35)
**Estimated Manual Time:** 30-45 minutes (down from 2-3 hours)

---

## 6. Phase/Wave Accuracy

### Current Structure Assessment

| Phase | Assessment | Notes |
|-------|------------|-------|
| Pre-Test Checklist | Good | Correct dev environment setup |
| Test Scenarios 1-6 | Needs Restructure | Mix of automatable and manual |
| Post-Test Cleanup | Good | Proper cleanup steps |
| Known Issues | Good | Useful context for testers |
| Implementation Plan | Incomplete | Expected - to be filled post-test |

### Recommended Restructure

```
Phase 1: Automated Tests (CI/Local)
  - Create test files
  - Run: npm run test
  - Expected: All pass

Phase 2: Manual UI Tests (Browser)
  - Only 11 scenarios that require UI
  - 30-45 minutes

Phase 3: Fix Issues Found
  - Implementation plan section populated
  - Standard wave structure (backend -> frontend -> verify)
```

---

## 7. Specialist Agent Recommendations

If implementing the automated tests, assign to:

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Create `inventory/__tests__/` | `convex-backend` | Pure backend test files |
| Create `componentTypes/__tests__/` | `convex-backend` | Backend mutation tests |
| Create `menuProducts/__tests__/` | `convex-backend` | Cost calculation tests |
| Extract pure helpers | `refactor-architect` | Refactoring for testability |
| Review test coverage | `code-auditor` | Verification pass |

---

## 8. Git Workflow Assessment

### Current Plan State

| Assessment | Status |
|------------|--------|
| Feature branch specified | Partial: `feature/bom-improvements` |
| Branch naming convention | Correct |
| Merge strategy documented | No |

### Recommended Commits for Test Implementation

If automated tests are added:

1. `test: add inventory helpers unit tests`
2. `test: add componentTypes mutation tests`
3. `test: add FIFO consumption tests`
4. `test: add order inventory integration tests`
5. `test: add menuProduct cost calculation tests`

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| After test implementation | `docs/TESTING_GUIDE.md` - Add BOM test section |
| After manual testing | This plan - Improvement Notes table |
| After fixes implemented | `docs/CHANGELOG.md` |

---

## 10. Edge Cases to Address

The automated tests should cover:

- [ ] Component with zero cost (unitCostIdr = 0)
- [ ] Empty BOM (menu product with no components)
- [ ] Multiple batches with same purchase date (FIFO tie-breaker)
- [ ] Expired batch interleaved with active batches
- [ ] Stock exactly equal to reservation (edge case for available = 0)
- [ ] Order cancellation after partial consumption
- [ ] Component deletion when only soft-linked (no direct FK)
- [ ] Transfer that depletes source batch completely

---

## 11. Approval Conditions

**For Testing to Proceed with Current Manual Approach:**
- Accept ~3 hours of manual testing time
- Accept no regression protection

**For Recommended Automation-First Approach:**
1. Create automated test files first (4-6 hours one-time investment)
2. Run automated tests in CI
3. Reduce manual tests to ~11 UI-only scenarios (~45 minutes)
4. Have repeatable regression protection going forward

**Recommended Path:** Automation-first. The 4-6 hour investment pays back after 2 testing cycles.

---

## 12. Proposed Automated Test File Structure

```
convex/
+-- inventory/
|   +-- __tests__/
|       +-- helpers.test.ts        # calculateWeightedAvgCost, getAvailableQuantity, etc.
|       +-- fifo.test.ts           # FIFO consumption logic (may need ctx mocking)
|       +-- mutations.test.ts      # receive, transfer, consume mutations
|
+-- componentTypes/
|   +-- __tests__/
|       +-- mutations.test.ts      # CRUD validation, dependency checks
|       +-- helpers.test.ts        # (if pure helpers extracted)
|
+-- menuProductComponents/
|   +-- __tests__/
|       +-- mutations.test.ts      # CRUD, setComponents, summary caching
|
+-- menuProducts/
|   +-- __tests__/
|       +-- costCalculation.test.ts  # COGS computation from BOM
|       +-- mutations.test.ts        # Fixed product protection
|
+-- orders/
|   +-- __tests__/
|       +-- inventoryIntegration.test.ts  # Reserve, consume, release on status changes
```

---

## 13. Testing Patterns from Existing Codebase

The existing test files demonstrate clear patterns to follow:

### Pattern 1: Pure Function Tests (costCalculator.test.ts)

```typescript
import { describe, it, expect } from "vitest";
import { functionName } from "../module";

describe("functionName", () => {
  it("should handle standard case", () => {
    const result = functionName(input);
    expect(result).toBe(expected);
  });

  it("should handle edge case", () => {
    // ...
  });
});
```

### Pattern 2: Mock Convex Types (statusTransitions.test.ts)

```typescript
const createMockOrder = (status: string): Doc<"orders"> => {
  return {
    _id: "test-id" as any,
    _creationTime: Date.now(),
    // ... required fields
  } as Doc<"orders">;
};
```

### Pattern 3: Hook Testing with Mocks (useConvexHooks.test.tsx)

```typescript
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => vi.fn()),
}));
```

Apply these patterns to the new BOM test files for consistency.

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

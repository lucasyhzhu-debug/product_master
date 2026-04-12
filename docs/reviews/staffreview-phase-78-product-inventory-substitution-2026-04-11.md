# Staff Review: Phase 78 — Product Inventory Substitution

**Date:** 2026-04-11
**Plans:** `.planning/phases/78-product-inventory-substitution/78-01-PLAN.md`, `78-02-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** Approve (with minor fixes)

Both plans are well-structured with detailed code blocks, concrete acceptance criteria, and proper threat modeling. The 2-wave split (backend → frontend) is correct. The `resolveSubstitutionPlan` pure helper approach is elegant and testable. Three issues found: one critical (duplicate stock query in fulfillFromInventory), one important improvement (concurrent substitution race condition), and several refinements.

---

## 2. Critical Issues (Must Fix)

Issues that would cause implementation failure or serious bugs.

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Double stock query in fulfillFromInventory creates stale-read deductions | Logic | Plan 01, Task 2 |
| 2 | ProductForm dropdown exclusion logic uses wrong ID comparison | Logic | Plan 02, Task 1 |

**Details:**

### Issue 1: Double stock query in fulfillFromInventory

The existing `fulfillFromInventory` mutation queries `productInventory` once in step 3 (availability check) and again in step 4 (deduction). Plan 01 Task 2 replaces step 3 with a loop that stores `directStockRow` and `substituteStockRow` in `itemPlans[]`, then reuses them in step 4 for deduction. This is correct and actually eliminates the double-query.

However, the plan's step 4 code does:
```typescript
const prevQty = directStockRow?.quantity ?? 0;
```
This references the stale `directStockRow` from step 3. **If two order items share the same substitute product** (e.g., Dubai Triple and Nutella Triple both substitute from Dubai Single), the second item will read stale `substituteStockRow` quantity, not the quantity after the first item's deduction.

**Impact:** Over-deduction from the same substitute source across two items in the same order. E.g., if Dubai Single has 6 units and both Dubai Triple and Nutella Triple each need 3 substitute units, the code would deduct 3+3=6 (correct total) but `remaining` in the deductions response would show 3 for both instead of 3 then 0.

**Recommendation:** After deducting substitute stock for one item, update the cached quantity in `substituteStockRow` (or track a running balance). Since Convex mutations are single-threaded within a transaction, this is about correct bookkeeping within the loop, not a race condition:
```typescript
// After deducting substitute:
if (substituteStockRow) {
  substituteStockRow.quantity = subNewQty; // Update cached value for next iteration
}
```

### Issue 2: ProductForm dropdown exclusion uses stale product identity

Plan 02 Task 1 builds `eligibleSubstitutionProducts` from `rawMenuProducts` (a Convex query). The exclusion filter does:
```typescript
if (currentId && p._id === currentId) return false;
```

Where `currentId` comes from `product?._id`. The `product` prop in ProductForm is of type `PosProduct`, which has `_id: string`. The `rawMenuProducts` from `useQuery` returns Convex `Doc<"menuProducts">` where `_id` is `Id<"menuProducts">`. In TypeScript, `===` comparison between `string` and `Id<"menuProducts">` works at runtime (both are strings) but the self-exclusion might fail if `product._id` was cast differently in the transform.

**Impact:** Low — the backend validation would still catch self-reference. But UI should prevent it.

**Recommendation:** Ensure the comparison uses consistent types. The plan already casts `p._id as string` in the dropdown `value`, so the filter should be fine. Document the type coercion explicitly: `if (currentId && String(p._id) === String(currentId)) return false;`

---

## 3. Improvements (Recommended)

Changes that would significantly improve the implementation.

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Concurrent order fulfillment sharing same substitute pool | High | Low |
| 2 | Low-stock threshold check for substitute product in processGofoodSales | Medium | Low |

**Details:**

### Improvement 1: Same substitute pool deducted by concurrent orders

CONTEXT.md acknowledges this edge case as deferred: "Concurrent deduction from same substitute pool across multiple order items." The plan correctly does not address cross-order concurrency (Convex handles mutation serialization at the document level).

However, **within a single `fulfillFromInventory` call**, if multiple order items in the same order use the same substitute product, the second item reads stale data. This is the same as Critical Issue 1 above — fixing that fixes this.

### Improvement 2: Low-stock check for substitute product in processGofoodSales

The existing `processGofoodSales` checks `previousQuantity > globalThreshold && newQuantity <= globalThreshold` for low-stock alerts. Plan 01 Task 2 adds substitution deduction but does NOT include a low-stock check on the substitute product. If Dubai Single drops below threshold via GoFood substitute deduction, no alert fires.

**Recommendation:** Add the same low-stock check after the substitute deduction:
```typescript
if (subPrevQty > globalThreshold && subNewQty <= globalThreshold) {
  lowStockAlerts++;
}
```

---

## 4. Refinements (Minor Suggestions)

- Plan 02 Task 1 has two competing code blocks for the toast — a `.map()` version and a "Simpler version" with `for...of`. The executor may be confused about which to use. Clean up to show only the final version (the `for...of` one).
- Plan 01 Task 1 `resolveSubstitutionPlan` takes `Doc<"menuProducts">` as full document parameter. Consider narrowing to a `Pick<Doc<"menuProducts">, "fulfillFromProductId" | "fulfillMultiplier">` to make the helper more unit-testable without mocking the entire document. The tests already work around this with `as any`.
- The `SubstitutionPlan` interface has `sourceProduct: Doc<"menuProducts"> | null` — this leaks the full document into the return type. The caller already has the source product. Consider returning just `sourceProductId: Id<"menuProducts"> | null` or omitting it entirely (caller already has it).

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `productNameMap` pattern | `fulfillFromInventory` line 261 | Already used — plan extends it correctly |
| `menuProductCache` pattern | `fulfillFromInventory` line 243 | Already used — plan extends it correctly |
| Low-stock threshold check | `processGofoodSales` line 738 | Reuse pattern for substitute product alert |
| `by_product_location` index | `convex/schema.ts` | Already exists — no new indexes needed |

### Potential Duplication Risks
- The `resolveSubstitutionPlan` is imported into both `mutations.ts` and `queries.ts` — correct (shared pure helper, no duplication).
- The `substitute stock lookup` pattern (query by_product_location for source product) appears in Task 2 for both `fulfillFromInventory` and `processGofoodSales`. This is necessary duplication — both mutations need independent lookups in different contexts.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1 (Plan 01) | Good | Schema + helper + validation + mutations + tests — correct sequencing |
| Wave 2 (Plan 02) | Good | Frontend depends on Plan 01 backend — correct dependency |

**Ordering Issues:**
- Plan 01 Task 3 (tests) depends on Tasks 1 and 2 completing first — sequential within wave is correct.

**Missing Phases:**
- None. Two plans cover the full scope per CONTEXT.md.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Plan 01 (backend) | `convex-backend` | Schema, mutations, queries, pure helpers |
| Plan 02 (frontend) | `react-ui-builder` | ProductForm UI, AvailabilityPanel, toast |
| Verification | `code-auditor` | Type check + pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ⚠️ Not specified in plans (phase branch exists: `gsd/phase-78-product-inventory-substitution`) |
| Branch naming convention | ✅ Correct (matches project pattern) |
| Merge strategy documented | ❌ Not documented in plans |

### Commit Strategy
| Plan | Expected Commits | Commit Type | Notes |
|------|------------------|-------------|-------|
| 01 Task 1 | 1 | feat | Schema + helper + validation — atomic |
| 01 Task 2 | 1 | feat | Mutation + query updates — atomic |
| 01 Task 3 | 1 | test | Test file — atomic |
| 02 Task 1 | 1 | feat | Hook types + ProductForm — atomic |
| 02 Task 2 | 1 | feat | Panel + toast + build verify — atomic |

### Pre-Push Verification
- [x] Plan includes `npm run build` check (Plan 02 Task 2)
- [x] Plan includes `npx tsc --noEmit` verification (multiple tasks)
- [x] Plan includes test execution (`npx vitest ... --run`)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ❌ Missing (standard git revert — low risk for optional fields) |
| Deployment order | ✅ Correct (schema + backend first, then frontend) |
| Data backup needed | No (adding optional fields — no data loss risk) |
| Migration safety | ✅ Safe (optional fields, no existing data affected) |

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Plan 02 | docs/CHANGELOG.md — Phase 78 entry |
| Plan 02 | docs/SCHEMA.md — menuProducts.fulfillFromProductId, menuProducts.fulfillMultiplier |

Plan 02 includes both in `files_modified`, `verification`, and `success_criteria`. ✅

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-04-11 - Product Inventory Substitution (Phase 78)

**Triple products can now be fulfilled from single product inventory**

- Added `fulfillFromProductId` and `fulfillMultiplier` optional fields to menuProducts schema
- `resolveSubstitutionPlan()` pure helper computes direct vs substitute units
- `fulfillFromInventory` draws direct stock first, falls back to substitute for shortfall
- `processGofoodSales` applies same substitution logic for GoFood auto-deduction
- `getStockForOrder` returns enriched availability with substitution breakdown
- ProductForm: "Inventory Fulfillment" section for admin to configure source product and multiplier
- AvailabilityPanel: Split sub-rows showing direct stock vs substitute source
- FulfillFromInventoryButton: Enhanced toast with per-source deduction breakdown
- Validation: blocks self-reference, forward/reverse chains, multiplier < 2, inactive targets

**Files Modified:**
- convex/schema.ts, convex/productInventory/substitution.ts (new)
- convex/menuProducts/mutations.ts, convex/productInventory/mutations.ts, convex/productInventory/queries.ts
- src/hooks/convex/useMenuProducts.ts, src/components/menuProducts/ProductForm.tsx
- src/components/inventory/InventoryAvailabilityPanel.tsx, src/components/inventory/FulfillFromInventoryButton.tsx
- tests/convex/productSubstitution.test.ts (new)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Adequate

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | resolveSubstitutionPlan pure function | Unit (vitest) | Planned (6 cases) |
| Backend | menuProducts update validation | Integration (convex-test) | Planned (8 cases) |
| Frontend | ProductForm section rendering | Manual | Planned |
| Frontend | AvailabilityPanel sub-rows | Manual | Planned |
| Frontend | Toast deduction breakdown | Manual | Planned |

### Missing Test Coverage (Should Add)
| # | Missing Test | Why It Matters | Suggested Approach |
|---|-------------|----------------|-------------------|
| 1 | fulfillFromInventory integration test (order with substitution) | Core business logic — must verify end-to-end deduction | convex-test: create order with substitution-configured product, call fulfillFromInventory, verify both stock rows deducted |
| 2 | getStockForOrder integration test (returns substitution data) | Verifies query enrichment for UI rendering | convex-test: set up product with low direct stock + substitution config, call getStockForOrder, verify hasSubstitution + substituteNeeded fields |

The original CONTEXT.md and VALIDATION.md reference these integration tests. Plan 01 Task 3 only includes pure function tests and validation tests — the integration tests for fulfillFromInventory and getStockForOrder are described in the VALIDATION.md but NOT implemented in Task 3.

**Recommendation:** Add integration test cases to Plan 01 Task 3 for `fulfillFromInventory` and `getStockForOrder` with substitution scenarios.

### Regression Risk
- Existing `fulfillFromInventory` behavior for non-substitution products must be unchanged — verify via existing tests
- `processGofoodSales` has no existing tests — consider adding a basic regression test

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [x] Zero direct stock, all from substitute — covered in pure function tests
- [x] Negative direct stock (existing) — covered in pure function tests
- [x] Product with substitution config but inactive substitute product — covered in validation
- [x] Same substitute source used by multiple items in one order — **NOT handled** (Critical Issue 1)
- [ ] Substitute product stock becomes zero mid-deduction (within same fulfillFromInventory call) — related to Critical Issue 1
- [x] GoFood sale with substitution allows negative stock — covered in plan
- [x] Clearing substitution config — covered in validation tests

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical Issue 1**: Fix stale cached substitute stock when multiple items share the same substitute product in `fulfillFromInventory`
2. **Missing integration tests**: Add fulfillFromInventory and getStockForOrder integration tests to Plan 01 Task 3

**Recommended before implementation:**
1. Add low-stock threshold check for substitute product in `processGofoodSales`
2. Remove the duplicate/competing toast code block in Plan 02 Task 2 — keep only the `for...of` version

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

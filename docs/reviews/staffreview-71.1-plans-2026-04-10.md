# Staff Review: Phase 71.1 Product Inventory Substitution Plans

**Date:** 2026-04-10
**Plans:**
- `71.1-01-PLAN.md` (Backend: schema + helper + tests + validation + mutations + queries)
- `71.1-02-PLAN.md` (Frontend: hooks + ProductForm + AvailabilityPanel + FulfillButton + verification)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

```
PLAN VALIDATION CHECKLIST (71.1-01-PLAN.md)
============================================
[x] Git Workflow section exists? Branch + checkpoints specified
[x] Implementation Waves section? Sequential, agent assigned, files listed
[x] Documentation Updates section? CHANGELOG deferred to Plan 02
[x] Success Criteria section? Type check + build + 8 specific items

PLAN VALIDATION CHECKLIST (71.1-02-PLAN.md)
============================================
[x] Git Workflow section exists? Branch + checkpoints specified
[x] Implementation Waves section? Parallel Wave 2 + Sequential Wave 3
[x] Documentation Updates section? CHANGELOG, SCHEMA, CLAUDE.md
[x] Success Criteria section? Type check + build + vitest + 4 UI criteria
```

Both plans pass mandatory structure validation.

---

## 1. Summary

**Overall Assessment:** Revise (minor)

Both plans are well-structured, detailed, and closely mirror the PRD code. The prior staff review's 4 critical issues (typed api.* tests, reverse chain validation, _id not id in dropdown, PosProduct/AvailableProduct interfaces) are all correctly addressed in the updated PRD and propagated into these plans. There are 2 new critical issues (one logic bug in processGofoodSales low-stock check, one missing hook call that will cause a runtime crash), 3 improvements, and 4 refinements.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Plan | Location |
|---|-------|----------|------|----------|
| 1 | processGofoodSales low-stock check uses wrong baseline variable | Logic | 01 | Task 2, Step 4 (PRD Task 7) |
| 2 | ProductForm `availableProducts` variable not in scope | Logic | 02 | Task 1, Step 4 |

**Details:**

### Issue 1: processGofoodSales low-stock check compares wrong variable

In the PRD Task 7 code that Plan 01 Task 2 Step 4 references, the low-stock alert check after substitute deduction is:

```typescript
if (subStockAfter && previousQuantity > globalThreshold && (subStockAfter.quantity ?? 0) <= globalThreshold) {
  lowStockAlerts++;
}
```

`previousQuantity` is the **direct product's** previous stock (set at line ~705: `const previousQuantity = existing?.quantity ?? 0;`). But the intent is to check whether the **substitute product** crossed the low-stock threshold. This should compare the substitute product's previous quantity (`subPrev`, computed earlier in the shortfall block) against the threshold.

**As written:** A low-stock alert fires when the *direct triple's* stock was above threshold and the *substitute single's* stock drops below threshold. This means if a triple had 0 stock (already below threshold), no alert fires for the substitute even if it legitimately crosses the threshold.

**Recommendation:** Replace `previousQuantity` with `subPrev` in the condition. However, `subPrev` is scoped inside the `if (shortfall > 0)` block. The fix is to hoist `subPrev` or move the low-stock check inside the shortfall block:

```typescript
// Inside the `if (shortfall > 0)` block, after insert transaction:
if (subPrev > globalThreshold && subNew <= globalThreshold) {
  lowStockAlerts++;
}
```

### Issue 2: ProductForm uses `availableProducts` but never calls `useAvailableProducts()`

Plan 02 Task 1 Step 4 builds `eligibleSubstituteSources` from:
```typescript
const allRaw = [
  ...(posProducts ?? []),
  ...(availableProducts ?? []),
];
```

But `ProductForm.tsx` (line 80-81) only has:
```typescript
const { data: posProducts } = usePosProducts();
const { data: packagingPosProducts } = usePackagingPosProducts();
```

There is no `useAvailableProducts()` call. The `availableProducts` variable does not exist in the component scope. This will cause a TypeScript compilation error (`Cannot find name 'availableProducts'`), and even if suppressed, `undefined` spread would yield no available-but-unslotted products in the dropdown.

Products without a POS slot (like Dubai Triple, if not assigned to slot 1-4) would be invisible in the substitution dropdown, making the feature non-functional for the primary use case.

**Recommendation:** Add to ProductForm, after line 81:
```typescript
const { data: availableProducts } = useAvailableProducts();
```

And add `useAvailableProducts` to the import from `@/hooks/convex` (line 30-37). Note: `AvailableProduct` type is already imported but the hook is not.

---

## 3. Prior Staff Review Criticals -- Verification

| # | Original Critical | Status in Plans | Verdict |
|---|-------------------|-----------------|---------|
| 1 | Test invocation uses string-based `t.mutation("path" as any, ...)` | Plan 01 Task 1 explicitly specifies `api.productInventory.mutations.fulfillFromInventory` pattern. PRD Task 3 code uses typed `api.*` imports. | Fixed |
| 2 | Chain validation incomplete -- missing reverse direction | Plan 01 Task 2 Step 1c includes reverse chain query (`ctx.db.query("menuProducts").filter(q => q.eq(q.field("fulfillFromProductId"), id))`). Test for it included. | Fixed |
| 3 | Frontend dropdown uses `p.id` (number) instead of `p._id` (string) | Plan 02 Task 1 Step 4-5 uses `p._id` throughout. Acceptance criteria explicitly states "Dropdown uses p._id (Convex string ID), NOT p.id (number)". | Fixed |
| 4 | PosProduct/AvailableProduct missing fulfillFromProductId fields | Plan 02 Task 1 Steps 1b-1e add both fields to both interfaces and both transform maps. | Fixed |

All 4 prior criticals are correctly applied.

---

## 4. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add processGofoodSales integration test | Medium | Medium |
| 2 | Deduplicate eligible products list | Low | Low |
| 3 | Add concurrent substitution pool comment | Low | Low |

**Details:**

### Improvement 1: Add processGofoodSales substitution test

Plan 01 success criteria line 366 acknowledges: "processGofoodSales handles substitution (code review -- no dedicated test in this plan)." The prior staff review (Improvement #3) also flagged this. GoFood auto-deduction is a separate code path from `fulfillFromInventory` and includes its own substitution logic (allow-negative behavior, different transaction logging). Without a test, the Critical #1 bug above would slip through.

**Recommendation:** Add at least 1 integration test to `productSubstitution.test.ts`:
- Create a product with substitution config, create an outlet with linked location, set stock, call `processGofoodSales` via `api.productInventory.mutations.processGofoodSales` (this is an `internalMutation` -- use `t.mutation` with the internal API), verify single stock deducted correctly.

This also verifies the low-stock alert fix from Critical #1.

### Improvement 2: Deduplicate eligible products list in ProductForm

Plan 02 Task 1 Step 4 merges `posProducts` and `availableProducts` arrays:
```typescript
const allRaw = [...(posProducts ?? []), ...(availableProducts ?? [])];
```

The `listPosProducts` query returns all products with `posSlot` defined (excluding packaging). The `listAvailableProducts` query returns products WITHOUT `posSlot` AND without `packagingPosSlot`. These sets are mutually exclusive for food products, so no duplicates are expected in practice. However, if a product has `packagingPosSlot` but no `posSlot` and is food-type, it would appear in neither list -- an edge case worth a comment.

A cleaner approach would be to use `useMenuProducts(true)` (active-only) which returns ALL active products, then filter. But this would require adding `fulfillFromProductId` to the `MenuProduct` interface (which uses `transformMenuProduct` that drops it). The current approach is acceptable with a comment.

### Improvement 3: Concurrent substitution pool consumption comment

If an order has both "Dubai Triple x2" AND "Dubai Single x3", both draw from Dubai Single stock. The deduction plans are computed independently in `fulfillFromInventory` -- the triple's plan sees 50 singles available, then the single's plan also sees 50 available. During deduction (step 4), they're applied sequentially so the final stock is correct. But the *availability check* (step 3) could pass when it should fail: e.g., 50 singles, order for 20 triples (needs 60 singles) + 5 singles (needs 5) -- each passes independently but together need 65.

**Recommendation:** Add a comment in the Plan 01 Task 2 Step 2 code noting this edge case. In practice, ordering singles AND triples on the same order is rare, and the deduction step handles it correctly (it would go negative but Convex mutations are transactional, so no partial deduction). Still worth documenting.

---

## 5. Refinements (Minor Suggestions)

- **Plan 01 Task 1:** The `verify` block pipes through `grep` which may hide actual test failures. Consider `npx vitest tests/convex/productSubstitution.test.ts --run` without pipe for clearer output in the summary.

- **Plan 02 Task 1 Step 3:** The `'fulfillFromProductId' in product` check is defensive but unnecessary since Plan 02 Task 1 Step 1b/1c adds the field to both `PosProduct` and `AvailableProduct` interfaces. After the types are updated, a direct `product.fulfillFromProductId` access is cleaner.

- **Plan 02 Task 2:** The nested `<table>` inside `<td>` for sub-rows works but is semantically unusual HTML. Consider using multiple `<tr>` elements with indent styling via padding-left for accessibility. Not blocking -- the existing approach is functional.

- **Plan 02 Task 2:** The `(item as any).directAvailable` cast in AvailabilityPanel is fragile. Since the query return type is inferred by Convex, consider defining a local discriminated union type or at minimum typing the cast more precisely (e.g., `(item as { directAvailable?: number }).directAvailable`).

---

## 6. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How Plans Use It |
|---------------|----------|------------------|
| `resolveSubstitutionPlan()` | `convex/productInventory/substitution.ts` (new) | Shared by fulfillFromInventory, getStockForOrder, processGofoodSales |
| `hasSubstitution()` | Same file | Type guard shared by all consumers |
| `menuProductCache` pattern | `fulfillFromInventory` lines 243-248 | Reused for substitution product lookup |
| `usePosProducts` / `useAvailableProducts` | `src/hooks/convex/useMenuProducts.ts` | Used for dropdown population |

### Potential Duplication Risks
- The stock-lookup-and-plan-resolution pattern (query productInventory, query substitute productInventory, call resolveSubstitutionPlan) appears 3 times: in `fulfillFromInventory`, `getStockForOrder`, and `processGofoodSales`. The prior staff review suggested a shared `getStockWithSubstitution()` helper. This is acceptable for v1 but should be tracked as tech debt.

- The `processGofoodSales` substitution code (PRD Task 7) computes `directUsed` and `shortfall` manually when `plan` is null (GoFood allow-negative case) rather than reusing a helper. This is intentional since the GoFood path has different semantics (never blocks), but adds cognitive overhead.

---

## 7. Phase/Wave Accuracy

| Plan | Wave | Assessment | Notes |
|------|------|------------|-------|
| 01 | Wave 1: Backend (Sequential) | Good | Task 1 (schema+helper+tests) then Task 2 (validation+mutations+queries) -- correct dependency order |
| 02 | Wave 2: Frontend (Parallel) | Good | Task 1 (hook+form) and Task 2 (panel+button) touch different files, can run in parallel |
| 02 | Wave 3: Verification | Good | Standard build gate |

**Ordering Issues:** None. Plan 02 correctly declares `depends_on: ["71.1-01"]`.

**Missing Steps:** None significant. The schema change is additive (optional fields), so `npx convex dev` auto-regenerates types on the running dev server. Plan 01 Task 1 verify step runs `npx tsc --noEmit` which validates the generated types exist.

---

## 8. Specialist Agent Recommendations

| Plan/Task | Recommended Agent | Rationale |
|-----------|-------------------|-----------|
| Plan 01 Tasks 1-2 | `convex-backend` | Schema, mutations, queries, pure helpers, tests |
| Plan 02 Task 1 | `react-ui-builder` | React hooks, form components, state management |
| Plan 02 Task 2 | `react-ui-builder` | React component updates, toast UI |
| Plan 02 Wave 3 | `code-auditor` | Type check + build verification |

Matches both plans' agent assignments.

---

## 9. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes -- `gsd/phase-70-data-accuracy-foundation` (current branch) |
| Branch naming convention | Acceptable -- using parent phase branch rather than dedicated feature branch |
| Merge strategy documented | Implicit (merge to main after completion) |

### Commit Strategy
| Plan | Task | Expected Commits | Notes |
|------|------|------------------|-------|
| 01 | Task 1 | 1 | Schema + helper + tests (atomic) |
| 01 | Task 2 | 1 | Validation + mutations + query (atomic) |
| 02 | Task 1 | 1 | Hook types + ProductForm (atomic) |
| 02 | Task 2 | 1 | Panel + button + verification (atomic) |

### Pre-Push Verification
- [x] Plan 01 includes `npx tsc --noEmit` check
- [x] Plan 02 includes `npx tsc --noEmit` + `npx vitest --run` + `npm run build`
- [x] Plan 02 includes full test suite verification

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Not documented (safe -- additive optional fields only) |
| Deployment order | Correct (schema first, backend, then frontend) |
| Data backup needed | No |
| Migration safety | Safe (both new fields are optional, no data migration) |

---

## 10. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| After Plan 02 | `docs/CHANGELOG.md` -- Phase 71.1 entry |
| After Plan 02 | `docs/SCHEMA.md` -- Document fulfillFromProductId and fulfillMultiplier |
| After Plan 02 | `CLAUDE.md` -- Add substitution to Key Business Rules |

All 3 are listed in Plan 02's Documentation Updates section.

---

## 11. Testing Plan Assessment

**Overall Testing Verdict:** Sufficient (with noted gap)

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | `resolveSubstitutionPlan` pure helper (7 cases) | Vitest unit | Planned |
| Backend | `fulfillFromInventory` with substitution (4 cases) | convex-test integration | Planned |
| Backend | `getStockForOrder` with substitution (1 case) | convex-test integration | Planned |
| Backend | Validation: self-ref, forward chain, reverse chain, multiplier < 2 (4 cases) | convex-test integration | Planned |
| Backend | `processGofoodSales` with substitution | convex-test integration | NOT Planned |
| Frontend | ProductForm, AvailabilityPanel, FulfillButton | Manual | Acceptable |

### Missing Test Coverage
| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `processGofoodSales` substitution | Separate code path with allow-negative semantics + Critical #1 bug | convex-test: create product with sub config, call internal mutation, verify stock deducted correctly from substitute |

### Regression Risk
- `fulfillFromInventory` is heavily used -- existing orders without substitution must continue working. The non-substitution path (else branch in deductionPlans) preserves existing behavior. Low risk.
- `getStockForOrder` return type gains new fields but preserves `isSufficient` and `quantityAvailable`. `FulfillFromInventoryButton` line 113 uses `item.isSufficient` which is preserved. Low risk.

---

## 12. Edge Cases

- [x] Direct stock sufficient -- no substitution triggered (test: "all from direct stock")
- [x] Mixed direct + substitute (test: "partial direct + substitute")
- [x] All from substitute -- 0 direct stock (test: "no direct stock -- all from substitute")
- [x] Insufficient even with substitution (test: "insufficient -- throws error")
- [x] Negative direct stock treated as 0 (test: "negative direct stock")
- [x] Self-reference blocked (test: "blocks self-reference")
- [x] Forward chain blocked (test: "blocks chain")
- [x] Reverse chain blocked (test: "blocks reverse chain")
- [x] Multiplier < 2 blocked (test: "blocks multiplier < 2")
- [ ] **Multiple items consuming same substitute pool** (documented in Improvement #3)
- [ ] **Substitute product deactivated after config saved** -- fulfillFromInventory would still resolve (hasSubstitution passes since it checks multiplier >= 2, not isActive). Consider an isActive check at deduction time, or document as acceptable (admin responsibility).
- [ ] **Substitute product deleted** -- `ctx.db.get(menuProduct.fulfillFromProductId)` returns null, `sourceProduct?.name` becomes "Unknown". Deduction would fail trying to look up stock. Consider a null check with clear error: "Substitution source product no longer exists."

---

## 13. Approval Conditions

**For Approval, address:**
1. Fix processGofoodSales low-stock alert baseline variable (Critical #1)
2. Add `useAvailableProducts()` hook call to ProductForm (Critical #2)

**Recommended before implementation:**
1. Add at least 1 processGofoodSales substitution integration test
2. Add null guard for deleted substitute product in fulfillFromInventory and processGofoodSales

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

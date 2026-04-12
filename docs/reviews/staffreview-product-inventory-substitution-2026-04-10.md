# Staff Review: Product Inventory Substitution

**Date:** 2026-04-10
**Plan:** `docs/superpowers/plans/2026-04-10-product-inventory-substitution.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** Revise (minor)

Strong plan with clear problem definition, well-structured tasks, and good test coverage for a focused feature. The design decisions are sound (direct-first, one-level chains, per-product config). Three critical issues need fixing before implementation: test invocation pattern mismatch, incomplete chain validation, and a frontend ID type mismatch in the ProductForm dropdown. Several improvements would strengthen the implementation.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Test mutation invocation uses wrong pattern | Testing | Task 3 |
| 2 | Chain validation is incomplete — blocks only one direction | Logic | Task 4 |
| 3 | Frontend dropdown uses `p.id` (number) but needs `p._id` (string) | Logic | Task 8 |
| 4 | `AvailableProduct` interface missing `fulfillFromProductId` field | Types | Task 8 |

**Details:**

### Issue 1: Test mutation invocation uses wrong pattern

The plan uses string-based mutation paths:
```typescript
t.mutation("productInventory/mutations:fulfillFromInventory" as any, ...)
```

The project's existing tests use the typed API import pattern:
```typescript
import { api } from '../../convex/_generated/api';
t.mutation(api.productInventory.mutations.fulfillFromInventory, ...)
```

The `fulfillFromInventory` mutation also requires auth (`requireRole`), which means the test needs a valid session. The test creates a session correctly, but the `@ts-expect-error` hack will make the tests fragile and inconsistent with the rest of the test suite.

**Recommendation:** Use `api.productInventory.mutations.fulfillFromInventory` with typed args. Import `api` from `../../convex/_generated/api`. Same for the query tests.

### Issue 2: Chain validation is incomplete

Task 4 validates that the *target* product doesn't have `fulfillFromProductId` set (can't chain forward). But it doesn't validate the reverse: if Product A already points to Product B as a source, Product B should not be allowed to set *its own* `fulfillFromProductId` — because that would break Product A's substitution (Product A's source now itself has a substitute, creating an implicit chain).

**Recommendation:** Add a reverse check: query all menuProducts to see if ANY product has `fulfillFromProductId === id` (the product being edited). If so, and the user is trying to set `fulfillFromProductId` on this product, block it with: "This product is used as a substitution source by {Product Name} — configure substitution on that product first."

### Issue 3: Frontend dropdown uses wrong ID type

In Task 8 Step 5, the `eligibleSubstituteSources` list uses `allProducts` which returns `MenuProduct` objects with `id` as a `number` (from `transformMenuProduct`: `id: product._id as unknown as number`). But `fulfillFromProductId` needs a Convex `Id<"menuProducts">` string.

The dropdown's `value`/`onValueChange` use `String(p.id)` which converts a number to a string like `"123"`, not the actual Convex ID string like `"k17abc...def"`.

**Recommendation:** Use the raw Convex data (from `useQuery(api.menuProducts.queries.list)` directly) for the dropdown, OR pass the `_id` field through `AvailableProduct`/`PosProduct` types (which already have `_id: string`). The `eligibleSubstituteSources` should use `p._id` not `p.id`.

### Issue 4: AvailableProduct/PosProduct missing new fields

`AvailableProduct` (line 171) and `PosProduct` (line 116) interfaces don't include `fulfillFromProductId` or `fulfillMultiplier`. The ProductForm's edit initialization tries to read `product.fulfillFromProductId` but this field won't exist on the type.

**Recommendation:** Add `fulfillFromProductId?: string` and `fulfillMultiplier?: number` to both `PosProduct` and `AvailableProduct` interfaces, and include them in the transform functions (`usePosProducts`, `useAvailableProducts`).

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Extract shared stock-lookup helper | Medium | Low |
| 2 | Add `getStockForOrder` backward compat guard | Medium | Low |
| 3 | Add test for processGofoodSales substitution | Medium | Medium |
| 4 | Handle concurrent deductions in substitution plan | Medium | Low |

**Details:**

### Improvement 1: Extract shared stock-lookup helper

Both `fulfillFromInventory` and `getStockForOrder` now have identical patterns for looking up direct stock + substitute stock + resolving the plan. Extract a shared `getStockWithSubstitution(ctx, menuProductId, locationId)` helper into `substitution.ts` that returns `{ directAvailable, substituteAvailable, plan, sourceProduct }`.

### Improvement 2: Backward compatibility guard on getStockForOrder

The `getStockForOrder` return type changes (new fields: `directAvailable`, `directSufficient`, `substitution`). The existing `InventoryAvailabilityPanel` and `FulfillFromInventoryButton` both consume this query. The plan updates the panel (Task 9) but the `FulfillFromInventoryButton` also uses `availability.every((item) => item.isSufficient)` at line 113 — this still works since `isSufficient` is preserved, but verify `quantityAvailable` is also preserved for backward compat (it is — the plan includes it as a backward compat field, good).

### Improvement 3: Test for processGofoodSales substitution

Task 7 modifies `processGofoodSales` but no tests cover it. Add at least one integration test: GoFood sells a triple, only singles in stock, verify singles are deducted and correct transactions are logged.

### Improvement 4: Concurrent substitution deductions

If an order has 2 Dubai Triples AND 3 Dubai Singles, both drawing from Dubai Single stock, the deduction plans are computed independently. The plan's check phase reads substitute stock once per item but doesn't account for multiple items consuming from the same substitute pool. In practice this is unlikely (you wouldn't order singles AND triples on the same order from inventory), but worth a comment.

**Recommendation:** Add a comment noting this edge case, or accumulate substitute demand across all items before checking availability.

---

## 4. Refinements (Minor Suggestions)

- Task 2: `hasSubstitution` return type uses a complex intersection — consider simplifying to just a boolean guard with separate field access.
- Task 5: The `DeductionPlan` interface is defined inline inside the mutation handler. Move it to `substitution.ts` alongside `SubstitutionPlan`.
- Task 9: The nested `<table>` inside `<td>` for sub-rows works but is semantically unusual. Consider using `<tr>` with indent styling instead for better accessibility.
- Task 10: Toast `duration: 8000` is quite long. Consider 6000 (matching existing pattern at line 129).

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `resolveSubstitutionPlan()` | New in Task 2 | Good — shared by mutations + queries |
| `productInventory.queries.getStockForOrder` | `convex/productInventory/queries.ts` | Modified in-place, preserves return shape |
| `useMenuProducts` hook (list all) | `src/hooks/convex/useMenuProducts.ts` | Used for dropdown population |

### Potential Duplication Risks
- Stock lookup pattern (query productInventory by_product_location) is repeated 4+ times across the modified mutation. Consider a small `getStockAtLocation(ctx, productId, locationId)` helper.
- The substitution resolution logic in `processGofoodSales` (Task 7) is manual/inline rather than reusing `resolveSubstitutionPlan` — it should call the shared helper.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Backend | Good | Sequential ordering correct — schema first, then helper, tests, mutations |
| Wave 2: Frontend | Needs Adjustment | Task 8 depends on backend type changes propagating to `_generated/api` |
| Wave 3: Verification | Good | Standard gate |

**Ordering Issues:**
- Wave 1 is marked SEQUENTIAL which is correct — each task builds on the previous.
- Wave 2 is marked PARALLEL which is fine — Tasks 8/9/10 touch different files.

**Missing Phases:**
- No task for running `npx convex dev` or `npx convex codegen` to regenerate types after schema change. Task 1 adds schema fields but Wave 2 frontend code needs the updated `_generated/` types.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Tasks 1-7 | `convex-backend` | Schema, mutations, queries, pure helpers |
| Tasks 8-10 | `react-ui-builder` | React components, hooks, UI patterns |
| Task 11 | `code-auditor` | Verification gate |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes (`feature/71.1-product-inventory-substitution`) |
| Branch naming convention | ✅ Correct |
| Merge strategy documented | ⚠️ Implicit (not explicit merge-to-main step) |

### Commit Strategy
| Task | Expected Commits | Commit Type | Notes |
|------|------------------|-------------|-------|
| Task 1 | 1 | feat | Schema change — atomic ✅ |
| Task 2 | 1 | feat | Pure helper — atomic ✅ |
| Task 3 | 1 | test | Tests — atomic ✅ |
| Task 4 | 1 | feat | Validation — atomic ✅ |
| Task 5 | 1 | feat | Core mutation — atomic ✅ |
| Task 6 | 1 | feat | Query — atomic ✅ |
| Task 7 | 1 | feat | GoFood mutation — atomic ✅ |
| Task 8 | 1 | feat | Hook + form — atomic ✅ |
| Task 9 | 1 | feat | Panel UI — atomic ✅ |
| Task 10 | 1 | feat | Toast UI — atomic ✅ |
| Task 11 | 1 | chore | Verification — atomic ✅ |

### Pre-Push Verification
- [x] Plan includes `npm run build` check (Task 11)
- [x] Plan includes `npm run type-check` verification (Task 11)
- [x] Plan includes local testing before push (Task 11)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ⚠️ Not documented (schema change is additive/optional, safe to revert) |
| Deployment order | ✅ Correct (schema first, backend, then frontend) |
| Data backup needed | No (additive optional fields only) |
| Migration safety | ✅ Safe (both new fields are optional, no data migration needed) |

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| After all tasks | `docs/CHANGELOG.md` — Phase 71.1 entry |
| After Task 1 | `docs/SCHEMA.md` — New fields on menuProducts |
| After Task 10 | `CLAUDE.md` — Add substitution to business rules |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-04-10 - Phase 71.1: Product Inventory Substitution

**Allows triple products to be fulfilled from single product inventory stock.**

- Added `fulfillFromProductId` and `fulfillMultiplier` optional fields to `menuProducts` schema
- `fulfillFromInventory` mutation resolves substitution: uses direct stock first, falls back to N singles
- `getStockForOrder` query returns split availability (direct + substitute breakdown)
- `processGofoodSales` auto-deduction supports substitution
- ProductForm: "Inventory Fulfillment" config section with dropdown + multiplier
- InventoryAvailabilityPanel: Split sub-rows showing direct vs substitute stock
- Fulfillment toast: Shows per-source deduction breakdown
- Chain validation: One-level substitution only, no circular references

**Files Modified:**
- convex/schema.ts, convex/menuProducts/mutations.ts
- convex/productInventory/mutations.ts, queries.ts, substitution.ts (new)
- src/hooks/convex/useMenuProducts.ts
- src/components/menuProducts/ProductForm.tsx
- src/components/inventory/InventoryAvailabilityPanel.tsx
- src/components/inventory/FulfillFromInventoryButton.tsx
- tests/convex/productSubstitution.test.ts (new)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Insufficient (minor gaps)

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | `resolveSubstitutionPlan` pure helper | Vitest unit | ✅ Planned (7 cases) |
| Backend | `fulfillFromInventory` with substitution | convex-test integration | ✅ Planned (4 cases) |
| Backend | `getStockForOrder` with substitution | convex-test integration | ✅ Planned (1 case) |
| Backend | `processGofoodSales` with substitution | convex-test integration | ❌ Missing |
| Backend | Chain validation in `update` mutation | convex-test integration | ❌ Missing |
| Frontend | ProductForm substitution section | N/A | ❌ Missing (acceptable — manual test) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `processGofoodSales` substitution | GoFood auto-deduction is a separate code path | convex-test: create product with sub config, call internal mutation, verify single stock deducted |
| 2 | Chain validation rejection | Validation logic is new and security-relevant | convex-test: try to set fulfillFromProductId on a product that's already a substitution source, expect error |
| 3 | Self-reference rejection | Edge case in validation | convex-test: try to set fulfillFromProductId to self, expect error |

### Test Execution Checkpoints
1. After Task 3: `npx vitest tests/convex/productSubstitution.test.ts --run` (pure helper tests pass, integration tests fail)
2. After Task 5: Integration tests for fulfillFromInventory pass
3. After Task 6: getStockForOrder tests pass
4. After Task 11: Full `npm run test && npm run build`

### Regression Risk
- `fulfillFromInventory` is heavily used — existing orders with no substitution must continue working identically
- `getStockForOrder` return shape changes — `FulfillFromInventoryButton` line 113 uses `item.isSufficient` which is preserved

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [x] Direct stock sufficient — no substitution triggered (covered in tests)
- [x] Mixed: partial direct + partial substitute (covered)
- [x] All from substitute — 0 direct stock (covered)
- [x] Insufficient even with substitution (covered)
- [x] Negative direct stock treated as 0 (covered in pure helper test)
- [ ] **Multiple order items consuming same substitute pool** (e.g., 2 Dubai Triples + 3 Dubai Singles in one order — both draw from Dubai Single stock)
- [ ] **Substitute product is inactive** — validation at config time, but what if deactivated after config?
- [ ] **Substitute product deleted** — `fulfillFromProductId` points to deleted doc

---

## 12. Approval Conditions

**For Approval, address:**
1. Fix test invocation pattern to use typed `api.*` imports (Critical #1)
2. Add reverse chain validation — block setting substitution on a product used as source (Critical #2)
3. Fix frontend ID type mismatch — use `_id` not `id` in dropdown (Critical #3)
4. Add `fulfillFromProductId`/`fulfillMultiplier` to `PosProduct`/`AvailableProduct` interfaces (Critical #4)

**Recommended before implementation:**
1. Add `processGofoodSales` substitution test
2. Add chain/self-reference validation tests
3. Use `resolveSubstitutionPlan` in `processGofoodSales` instead of inline logic
4. Consider shared stock-lookup helper to reduce duplication

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

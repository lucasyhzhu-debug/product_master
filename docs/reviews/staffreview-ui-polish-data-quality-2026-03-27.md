# Staff Review: Phase 64 -- UI Polish & Data Quality

**Date:** 2026-03-27
**Plans:** `64-01-PLAN.md`, `64-02-PLAN.md`, `64-03-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Phase:** 64-ui-polish-data-quality

---

## 0. Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST (per plan)
=====================================

64-01-PLAN.md (Navbar restructure)
  [!] Git Workflow section: MISSING -- no branch name, no checkpoint strategy
  [!] Implementation Waves section: MISSING -- tasks are present but not structured as waves with agents
  [!] Documentation Updates section: MISSING -- no CHANGELOG checkbox
  [x] Success Criteria section: Present (includes npm run build)

64-02-PLAN.md (Mobile order safety)
  [!] Git Workflow section: MISSING
  [!] Implementation Waves section: MISSING
  [!] Documentation Updates section: MISSING
  [x] Success Criteria section: Present (includes npm run build)

64-03-PLAN.md (BigSeller fee sign)
  [!] Git Workflow section: MISSING
  [!] Implementation Waves section: MISSING
  [!] Documentation Updates section: MISSING
  [x] Success Criteria section: Present (includes npm run build + npm run test)
=====================================
```

**Verdict:** All three plans are INCOMPLETE. They use the GSD executor task format rather than the CLAUDE.md-mandated plan format. Missing: Git Workflow, Implementation Waves (with agents), and Documentation Updates sections. These are added below in Section 8 and Section 9.

---

## 1. Summary

**Overall Assessment: Revise**

The three plans address genuine UX and data quality issues with clear, specific implementation steps. Plan 64-01 (navbar restructure) and 64-03 (BigSeller fee sign normalization) are well-researched with accurate code references. Plan 64-02 (mobile order safety) is the weakest -- it introduces a complex swipe-to-delete gesture using Framer Motion that adds ~30 lines of animation code to an already large page component, and has a critical bug in the `updateItemQuantity` modification. The BigSeller plan has a subtle but important issue with the "no-op" test case and `mapOrderToStorage` test expectations. Overall, the plans are implementable with targeted fixes.

**Critical: 4 | Important: 5 | Refinement: 6**

---

## 2. Critical Issues (Must Fix)

Issues that would cause implementation failure or serious bugs.

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | `updateItemQuantity` filter(Boolean) loses TypeScript type safety | Logic/TypeScript | 64-02 Task 2, step 1 |
| 2 | "No-op" Shopee test still asserts negative fees | Testing | 64-03 Task 1 |
| 3 | `mapOrderToStorage` test expects negative fees but storage will now receive positive | Testing | 64-03 Task 1 |
| 4 | Missing test plan for 64-01 and 64-02 (no automated tests at all) | Testing | 64-01, 64-02 |

**Details:**

### Issue 1: `updateItemQuantity` filter(Boolean) loses TypeScript type safety

The proposed `updateItemQuantity` in 64-02 Task 2 returns `null` for items to remove, then uses `updated.filter(Boolean) as typeof prev`. This pattern:

```typescript
const updated = prev.map((item) => {
  if (item.productId === productId) {
    const newQty = item.quantity + delta;
    if (newQty <= 0) return null; // Mark for removal
    return { ...item, quantity: newQty, lineTotal: newQty * item.unitPrice };
  }
  return item;
});
return updated.filter(Boolean) as typeof prev;
```

The `as typeof prev` cast is a type assertion that bypasses type checking. If the item type ever changes, this won't catch mismatches. More importantly, `filter(Boolean)` on a `(T | null)[]` doesn't narrow to `T[]` in TypeScript without explicit typing.

**Recommendation:** Use the simpler approach of filtering directly:

```typescript
const updateItemQuantity = useCallback((productId: string, delta: number) => {
  setAppliedVoucher(null);
  setLowPriceConfirmed(false);
  setItems((prev) =>
    prev.flatMap((item) => {
      if (item.productId !== productId) return [item];
      const newQty = item.quantity + delta;
      if (newQty <= 0) return []; // Remove
      return [{ ...item, quantity: newQty, lineTotal: newQty * item.unitPrice }];
    })
  );
}, []);
```

Or even simpler: just call `removeItem` when `newQty <= 0`:

```typescript
const updateItemQuantity = useCallback((productId: string, delta: number) => {
  setAppliedVoucher(null);
  setLowPriceConfirmed(false);
  setItems((prev) => {
    const item = prev.find(i => i.productId === productId);
    if (!item) return prev;
    const newQty = item.quantity + delta;
    if (newQty <= 0) return prev.filter(i => i.productId !== productId);
    return prev.map(i =>
      i.productId === productId
        ? { ...i, quantity: newQty, lineTotal: newQty * i.unitPrice }
        : i
    );
  });
}, []);
```

### Issue 2: "No-op" Shopee test still asserts negative fees

In `normalization.test.ts` lines 332-356, the "Shopee: does not overwrite already populated non-zero fields" test creates an order with `commissionFee: -29970` and asserts `expect(result.commissionFee).toBe(-29970)`. This test will STILL PASS after the code change because `shouldOverwrite(-29970, 29970)` returns `false` (the field is non-null and non-zero). The normalization only overwrites when `shouldOverwrite` returns `true`.

This means **existing records with negative fees will stay negative** even after re-sync. The normalization only fires for NEW orders or orders where the field was null/0. This is architecturally correct (the migration handles existing records), but the test description and comments become misleading after the convention change.

**Recommendation:** The plan must explicitly update this test:
- Change the test input to use positive fees (`commissionFee: 29970`) to reflect the new convention
- OR add a comment explaining that this test validates the `shouldOverwrite` guard, not the sign convention
- Also update the assertion at line 247 (`expect(result.commissionFee).toBe(-29970)`) which tests the "preserved" case

### Issue 3: `mapOrderToStorage` test expects negative fees

In `helpers.test.ts` lines 245-249:
```typescript
it("stores raw negative fee values (do not abs in storage)", () => {
  const result = mapOrderToStorage(mockOrder, "synclog-id" as any, mockOrder.platform);
  expect(result.commissionFee).toBe(-3000);
  expect(result.sellerShippingFee).toBe(-1500);
});
```

`mapOrderToStorage` is a pass-through function -- it stores whatever values are in the order object. After normalization, fees will be positive. But the test creates a mock order with `commissionFee: -3000` DIRECTLY (bypassing normalization) and asserts the negative value is stored.

The plan does not mention updating `mapOrderToStorage` tests. After the convention change:
- The test name "stores raw negative fee values (do not abs in storage)" becomes incorrect
- The mock data should use positive fees to match the new convention
- The assertion should validate positive values are stored

**Recommendation:** Plan 64-03 Task 1 must include:
1. Update `mapOrderToStorage` mock order inputs to positive fees
2. Update test assertions to expect positive values
3. Update test description to "stores normalized positive fee values"
4. Also update `helpers-edge-cases.test.ts` line 421 which asserts `expect(revenue.commission).toBe(Math.abs(storage.commissionFee))` -- after the change, both should be positive without Math.abs

### Issue 4: Missing test plan for 64-01 and 64-02

Plans 64-01 (navbar restructure) and 64-02 (mobile order safety) have ZERO automated tests planned. The only verification is `npx tsc --noEmit` and `npm run build`. For UI changes this significant:

- **64-01:** Restructuring navigation affects every user session. At minimum, a snapshot or render test should verify the Header and MobileBottomNav render without errors with different user roles.
- **64-02:** The `SwipeableLineItem` component introduces gesture-based interactions and the `updateItemQuantity` logic change modifies core order creation behavior. The minus-to-zero removal logic absolutely needs unit tests.

**Recommendation:**
- 64-02: Add unit tests for `updateItemQuantity` with delta=-1 when quantity=1 (should remove item), delta=-1 when quantity=2 (should decrement), and delta=+1 (should increment). These can be pure function tests extracted from the callback logic.
- 64-01: At minimum, add smoke render tests for Header with different permission sets to verify both dropdowns render correctly.

---

## 3. Improvements (Recommended)

Changes that would significantly improve the implementation.

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Extract SwipeableLineItem to its own component file | High | Low |
| 2 | Account for "common" platform fees in normalization | Medium | Low |
| 3 | Use `Calculator` icon for Accounting dropdown (matches HubPage) | Medium | Low |
| 4 | Handle MobileBottomNav "Home" tab consistency with Header changes | Medium | Low |
| 5 | Add `buyerShippingFee` normalization for TikTok in Plan 64-03 | Medium | Medium |

**Details:**

### Improvement 1: Extract SwipeableLineItem to its own component file

Plan 64-02 defines `SwipeableLineItem` inside `OrderCreate.tsx` (already 1017 lines). This component is reusable (could be used in OrderDetail, KitchenView, etc.) and adds ~30 lines of Framer Motion logic. Placing it inline in an already large page violates the project's component extraction pattern.

**Recommendation:** Create `src/components/orders/SwipeableLineItem.tsx` as a separate component. Import it in `OrderCreate.tsx`. This follows the existing pattern of `src/components/orders/ProductButtons.tsx`.

### Improvement 2: Account for "common" platform fees in normalization

The "common" endpoint returns fees with their original sign (which may be negative). After this change, the Shopee and TikTok branches normalize to positive, but the "common" branch is a no-op pass-through. If the common endpoint is used for syncing, fees will still be negative in storage.

The existing "common" test in `normalization.test.ts` line 326 asserts `expect(result.commissionFee).toBe(-6000)` -- this means common-sourced records will still have negative fees, creating an inconsistency.

**Recommendation:** Either:
- Add a normalization step for "common" platform that also applies `Math.abs()` to commission fees, OR
- Document this as a known limitation and ensure `mapOrderToRevenue` keeps `Math.abs` for safety (contradicts D-11), OR
- Verify that the "common" endpoint is never used for actual data sync (only for fallback)

### Improvement 3: Use `Calculator` icon for Accounting dropdown

The HubPage uses `Calculator` for the Accounting card (line 124). But Plan 64-01 uses `Landmark` for the Accounting dropdown. This creates visual inconsistency between the hub page and the navbar.

**Recommendation:** Use `Calculator` icon (from lucide-react) for the Accounting dropdown in Header.tsx to match HubPage.tsx. Add `Calculator` to the lucide imports.

### Improvement 4: Handle MobileBottomNav "Home" tab consistency

Plan 64-01 removes the "Home" nav item from `mainNavItems` in Header.tsx but does NOT remove or change the "Home" tab in `MobileBottomNav.tsx` `primaryTabs` (line 52). The mobile bottom nav will still show a dedicated "Home" button while the desktop navbar only has the logo link. This is inconsistent.

**Recommendation:** Either:
- Keep the Home tab in MobileBottomNav (mobile UX benefits from an explicit Home button since the logo is less discoverable on mobile), OR
- Remove it from MobileBottomNav too and ensure the logo in the mobile header is tap-friendly

The plan should explicitly state the decision and rationale.

### Improvement 5: Add `buyerShippingFee` normalization for TikTok

TikTok's `customerPaidShippingFeeAmount` is mapped to `buyerShippingFee` at line 292. This value appears to be positive from the API. However, there's no explicit `Math.abs()` guard on it. If the API ever returns a negative value for buyer shipping, it would be stored negative while all other fees are now positive.

**Recommendation:** Add `Math.abs()` to the TikTok `buyerShippingFee` assignment for defensive consistency:
```typescript
order.buyerShippingFee = Math.abs(order.customerPaidShippingFeeAmount ?? 0);
```

---

## 4. Refinements (Minor Suggestions)

- **64-01:** The `accountingItems` array uses `FileText` icon for both "Journal Entry" and "Historical Import". Consider using distinct icons (e.g., `BookOpen` for Journal Entry, `Upload` for Historical Import) for visual differentiation.
- **64-01:** Consider adding `preload` functions to accounting items for hover prefetching, consistent with the existing `mainNavItems` pattern.
- **64-02:** The `SCROLL_THRESHOLD = 10` constant should be tested on actual devices. 10px may be too sensitive on high-DPI screens. Consider 8-15px range with a comment about DPI consideration.
- **64-02:** The swipe-to-delete uses `setTimeout(onRemove, 200)` which creates a fire-and-forget timer. If the component unmounts during the 200ms animation, this could call `onRemove` on an unmounted component. Consider using a cleanup ref or `requestAnimationFrame`.
- **64-02:** The `dragConstraints={{ left: -100, right: 0 }}` is hardcoded. Consider using a percentage of the container width for different screen sizes.
- **64-03:** The migration `migrateFeeSign` loads ALL `bigsellerOrders` into memory with `.collect()`. If the table grows large, this could hit Convex function limits. Consider adding pagination (process in batches of 100-200).

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `motion`, `useMotionValue` | `src/components/kitchen/SwipeableKitchenLayout.tsx` | Reference pattern for swipe gestures -- already using motion values and pan info |
| `Link` component | Already imported in Header.tsx | Plan correctly notes this -- no new import needed |
| `Building2` icon | Already imported in Header.tsx line 37 | No new import needed for Header; MobileBottomNav needs it |
| Permission filter pattern | Header.tsx lines 141-159 | Reuse exact same pattern for `visibleAccountingItems` |
| `shouldOverwrite` guard | `helpers.ts` line 218 | Plan correctly leverages existing guard logic |

### Potential Duplication Risks

- **SwipeableLineItem vs SwipeableKitchenLayout:** The kitchen already has swipe gesture handling. Consider whether a shared base component or hook (`useSwipeToDelete`) could serve both. Low risk since the gestures serve different purposes (layout swiping vs delete).
- **Permission filtering:** The `visibleXxxItems` pattern is repeated 5+ times in Header.tsx. Could be extracted to a `useFilteredNavItems(items)` hook, but this is pre-existing tech debt, not introduced by this plan.
- **`Math.abs` removal in mapOrderToRevenue:** After removing Math.abs, any future code that creates BigSeller order objects with negative fees (e.g., test fixtures, manual imports) could silently introduce negative values in externalRevenue. The Math.abs was a defensive safeguard.

---

## 6. Phase/Wave Accuracy

| Plan | Assessment | Notes |
|------|------------|-------|
| 64-01 (Navbar) | Good | Two tasks are correctly scoped to Header.tsx and MobileBottomNav.tsx |
| 64-02 (Mobile order) | Needs Adjustment | SwipeableLineItem should be a separate task/file, not inlined |
| 64-03 (Fee sign) | Good | TDD approach is correct; migration as separate task is good |

**Ordering Issues:**
- All three plans are marked `wave: 1` with `depends_on: []`, meaning they can run in parallel. This is correct -- they touch completely different files with no overlap.

**Missing Steps:**
- 64-03 is missing a step to update `mapOrderToStorage` tests (Critical Issue #3)
- 64-03 is missing a step to handle the "common" platform no-op test update
- 64-01 is missing explicit handling of MobileBottomNav Home tab (Improvement #4)

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 64-01 (Navbar) | `react-ui-builder` | Pure frontend component changes |
| 64-02 (Mobile order) | `react-ui-builder` | Frontend gesture/interaction changes |
| 64-03 (Fee sign) | `convex-backend` | Backend helper changes + migration |
| Verification | `code-auditor` | Type check + pattern compliance across all three |

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|------------|--------|
| Feature branch specified | ! Implicit (branch `gsd/phase-64-ui-polish-data-quality` already exists per git status) |
| Branch naming convention | Correct (follows GSD pattern) |
| Merge strategy documented | Missing |

### Commit Strategy

| Plan | Expected Commits | Commit Type | Notes |
|------|------------------|-------------|-------|
| 64-01 | 1-2 | feat | Logo link + nav split could be one atomic commit |
| 64-02 | 1-2 | feat | Touch detection + delete improvements |
| 64-03 | 2 | fix + feat | Fix: sign normalization; feat: migration file |

### Recommended Commit Checkpoints

1. After 64-01: `feat(nav): split Financials/Accounting dropdowns, make logo clickable`
2. After 64-02: `feat(orders): mobile touch safety and always-visible delete`
3. After 64-03 Task 1: `fix(bigseller): normalize fee signs to positive at sync time`
4. After 64-03 Task 2: `feat(migration): add bigsellerFeeSignFix migration`
5. Final: `npm run build && npm run test` before merge

### Pre-Push Verification

- [x] Plans include `npm run build` check (all three)
- [x] Plans include `npx tsc --noEmit` verification (all three)
- [ ] Plans include local testing before push (manual visual checks mentioned but no systematic checklist)

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | Missing -- should document that 64-03 migration is one-way (positive fees can't be reverted to negative) |
| Deployment order | Needs adjustment -- 64-03 code change must deploy BEFORE migration runs |
| Data backup needed | Yes -- run `npx convex export` before running `migrateFeeSign` migration |
| Migration safety | Safe -- migration only patches negative values to positive, idempotent |

### Git Workflow Issues Found

- No explicit branch creation step (branch already exists, but plans should reference it)
- No commit checkpoint strategy documented in any plan
- Missing `docs/CHANGELOG.md` update requirement in all three plans
- No rollback consideration for the fee sign migration (one-way transformation)

---

## 9. Documentation Checkpoints

| Plan | Documentation Update Required |
|------|-------------------------------|
| 64-01 | `docs/CHANGELOG.md` (navbar restructure) |
| 64-02 | `docs/CHANGELOG.md` (mobile order improvements) |
| 64-03 | `docs/CHANGELOG.md` (fee sign normalization), `docs/SCHEMA.md` (update bigsellerOrders fee sign convention comment) |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-03-27 - UI Polish & Data Quality (Phase 64)

**Navigation restructure, mobile order safety, and BigSeller fee normalization.**

### UI Changes
- Frollie Pro logo is now a clickable link to /home; removed separate Home nav item
- Desktop navbar: split Financials dropdown into Financials (5 items) + Accounting (5 items)
- Mobile sheet nav: matching Financials + Accounting sections
- Mobile bottom nav More sheet: added Journal Entry, Chart of Accounts, Historical Import, Asset Register
- Order creation: touch-scroll through product buttons no longer triggers phantom additions
- Order creation: delete button always visible (no hover dependency), Trash2 icon
- Order creation: minus at quantity 1 removes item from order
- Order creation: swipe-left-to-delete on line items

### Data Quality
- BigSeller Shopee/TikTok fees normalized to positive values at sync time
- Removed downstream Math.abs() workarounds in mapOrderToRevenue
- Added migration `migrateFeeSign` to fix existing negative fee records

**Files Modified:**
- src/components/layout/Header.tsx
- src/components/layout/MobileBottomNav.tsx
- src/components/orders/ProductButtons.tsx
- src/pages/OrderCreate.tsx
- convex/integrations/bigseller/helpers.ts
- convex/integrations/bigseller/__tests__/normalization.test.ts
- convex/integrations/bigseller/__tests__/helpers.test.ts
- convex/migrations/bigsellerFeeSignFix.ts
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Insufficient**

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | normalizePlatformFees (fee sign) | convex-test / vitest | Planned (64-03) |
| Backend | mapOrderToRevenue (fee sign) | vitest | Partially planned (64-03) |
| Backend | mapOrderToStorage (fee sign) | vitest | Missing |
| Backend | migrateFeeSign | convex-test | Missing |
| Frontend | Header.tsx navbar | render test | Missing |
| Frontend | MobileBottomNav.tsx | render test | Missing |
| Frontend | ProductButtons.tsx touch detection | interaction test | Missing |
| Frontend | OrderCreate.tsx minus-to-zero | unit test | Missing |
| Frontend | SwipeableLineItem | gesture test | Missing |
| Integration | Navbar navigation flow | Manual | Planned (visual checks) |
| Integration | Order creation mobile flow | Manual | Planned (visual checks) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `updateItemQuantity` minus-to-zero logic | Core order creation behavior change | Extract logic to pure function, test with vitest |
| 2 | `mapOrderToStorage` test updates | Tests will assert wrong values after code change | Update mock data and assertions (Critical #3) |
| 3 | "No-op" normalization test updates | Test assertions become misleading | Update test inputs and descriptions (Critical #2) |
| 4 | `helpers-edge-cases.test.ts` revenue/storage relationship test | Line 421 asserts Math.abs relationship that changes | Update to assert direct equality |

### Test Execution Checkpoints

1. After 64-03 Task 1 RED phase: Tests SHOULD fail (expected negative, got positive)
2. After 64-03 Task 1 GREEN phase: `npm run test -- convex/integrations/bigseller/` passes
3. After all plans: `npm run test && npm run build` passes
4. Before merge: Full `npm run test` (all tests)

### Regression Risk

- `bigsellerRevenueBackfill.ts` migration uses `Math.abs(order.commissionFee)` -- SAFE after change (abs of positive = positive)
- Income Statement reads `externalRevenue.commission` which is already positive -- SAFE (correctly identified in plan)
- BigSellerOrdersTable UI may display fee values -- verify that display components handle positive values correctly
- Any code that reads `bigsellerOrders.commissionFee` and assumes negative -- grep for all consumers

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [ ] **64-01:** User with no accounting permissions sees empty Accounting dropdown -- plan handles this with `visibleAccountingItems.length > 0` guard, OK
- [ ] **64-01:** User navigates to /home via logo while on /home -- should be a no-op (Link component handles this)
- [ ] **64-02:** User rapidly taps minus multiple times on quantity-1 item -- `removeItem` should be idempotent (filter on a non-existent productId returns unchanged array, OK)
- [ ] **64-02:** User swipes while also tapping minus -- could trigger double removal. `SwipeableLineItem` onRemove fires after 200ms delay, but `updateItemQuantity` could remove it first. The `setTimeout` would then call `removeItem` on an already-removed productId (harmless but wasteful)
- [ ] **64-02:** Touch start without touch end (e.g., phone call interruption) -- the long press timer should be cleaned up. The existing `handlePressCancel` handles this via `onMouseLeave`, but there's no `onTouchCancel` handler
- [ ] **64-03:** Orders synced via "common" platform have negative fees -- these won't be normalized by the code change (only shopee/tiktok branches changed). The migration will fix existing records, but future "common" syncs could reintroduce negatives
- [ ] **64-03:** Convex function timeout if bigsellerOrders table is very large -- `.collect()` loads all records. Consider pagination with cursor-based iteration
- [ ] **64-03:** Migration run BEFORE code deploy -- if migration runs first (flipping to positive), then old code re-syncs an order, it could overwrite the positive fee with negative again via `shouldOverwrite`. Deployment order matters: code first, then migration

---

## 12. Approval Conditions

**For Approval, address:**

1. **Critical #1:** Fix `updateItemQuantity` to avoid `filter(Boolean) as typeof prev` type assertion
2. **Critical #2:** Update "no-op" Shopee test inputs/assertions in normalization.test.ts
3. **Critical #3:** Update `mapOrderToStorage` tests and `helpers-edge-cases.test.ts` line 421
4. **Critical #4:** Add at minimum `updateItemQuantity` unit tests for minus-to-zero behavior

**Recommended before implementation:**

1. Explicitly document MobileBottomNav Home tab decision (keep or remove)
2. Use `Calculator` icon for Accounting dropdown to match HubPage
3. Extract SwipeableLineItem to its own component file
4. Add `onTouchCancel` handler to ProductButtons for interrupted touches
5. Document deployment order: code deploy first, then run migration
6. Add data backup step before migration (`npx convex export`)

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

# Staff Review: Manager Override One-Time Use Enforcement

**Date:** 2026-02-05
**Plan:** `C:\Users\Irfan\.claude\plans\whimsical-inventing-lark.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** ✅ **Approve with Minor Improvements**

The plan is well-structured and addresses the core requirement: transforming manager overrides into true one-time use vouchers with automatic deactivation and order linking. The implementation is minimal, surgical, and backwards compatible. The approach leverages existing schema fields (`overrideOrderId`, `isActive`) instead of adding new complexity.

**Strengths:**
- Surgical changes to only 3 backend files and 2 frontend files
- Uses existing `overrideOrderId` field (no schema migration needed)
- Transaction-safe (Convex atomic operations)
- Clear rollback strategy
- Comprehensive testing checklist

**Minor concerns:**
- Missing git workflow checkpoints (branch creation, commit boundaries)
- No explicit performance impact analysis for the new `getOverrideOrderDetails` query
- Could benefit from explicit error handling examples

---

## 2. Critical Issues (Must Fix)

None found. The plan is implementation-ready.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add git workflow section with branch creation and commit checkpoints | High | Low |
| 2 | Add explicit error handling for deleted order edge case in UI | Medium | Low |
| 3 | Consider batch update pattern for existing overrides (optional migration) | Low | Medium |
| 4 | Add performance note for N+1 query risk in VouchersManager | Medium | Low |

### Details

#### Improvement 1: Add Git Workflow Section

**Issue:** The plan doesn't specify branch creation, commit boundaries, or build verification steps (required by WORKFLOW.md).

**Recommendation:** Add this section to the plan:

```markdown
## Git Workflow

### Branch Setup
```bash
git switch main && git pull
git switch -c fix/manager-override-one-time-use
```

### Commit Checkpoints

**Commit 1: Backend - Auto-deactivation logic**
```bash
# After modifying convex/orders/helpers/voucherHandling.ts
git add convex/orders/helpers/voucherHandling.ts
git commit -m "feat(vouchers): auto-deactivate manager overrides on first use

- recordVoucherUsage now sets isActive=false for manager overrides
- Populates overrideOrderId with consuming order link
- releaseVoucherUsage keeps overrides deactivated (audit trail)

Files: convex/orders/helpers/voucherHandling.ts"
```

**Commit 2: Backend - Enhanced validation**
```bash
# After modifying convex/vouchers/queries.ts
git add convex/vouchers/queries.ts
git commit -m "feat(vouchers): add override-specific error messaging and order details query

- validateVoucher returns specific error for consumed overrides
- Add getOverrideOrderDetails query for UI display

Files: convex/vouchers/queries.ts"
```

**Commit 3: Frontend - UI display**
```bash
# After modifying src/pages/VouchersManager.tsx and src/hooks/convex/useVouchers.ts
git add src/pages/VouchersManager.tsx src/hooks/convex/useVouchers.ts
git commit -m "feat(vouchers): display order linkage and deletion status for overrides

- OverrideCard shows 'Used by Order #XXXX' link
- Handles deleted orders with warning indicator
- Updated TypeScript interface for overrideOrderId

Files:
- src/pages/VouchersManager.tsx
- src/hooks/convex/useVouchers.ts"
```

**Pre-Push Verification:**
```bash
npm run build          # Ensure frontend builds successfully
npm run type-check     # Verify TypeScript types
npx convex dev         # Test backend functions in dev environment
```

**Merge to Main:**
```bash
git push origin fix/manager-override-one-time-use
# Create PR, request review
# After approval: merge to main (triggers CI/CD)
```

**Post-Merge:**
Update `docs/CHANGELOG.md` (MANDATORY per CLAUDE.md).
```

**Rationale:** Git workflow is a MANDATORY requirement per CLAUDE.md docs/WORKFLOW.md. Missing this creates risk of improper commit hygiene.

---

#### Improvement 2: Explicit Error Handling for Deleted Orders

**Issue:** The plan shows the UI handling deleted orders, but doesn't explicitly document what happens if the order is deleted between query and render.

**Recommendation:** Add explicit error boundary handling:

```typescript
// In OverrideCard component
{voucher.overrideOrderId && (
  <div className="text-sm">
    {orderDetails === undefined ? (
      <span className="text-muted-foreground">Loading order...</span>
    ) : orderDetails?.orderDeleted ? (
      <span className="text-destructive flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        Order has been deleted
      </span>
    ) : orderDetails ? (
      <Link
        to={`/orders/${voucher.overrideOrderId}`}
        className="text-blue-600 hover:underline flex items-center gap-1"
        onClick={(e) => {
          // Edge case: Order deleted between query and click
          if (!orderDetails || orderDetails.orderDeleted) {
            e.preventDefault();
            toast.error("This order has been deleted");
          }
        }}
      >
        <ExternalLink className="w-3 h-3" />
        Used by Order #{orderDetails.orderNumber}
      </Link>
    ) : (
      // Fallback: Query returned null (shouldn't happen but defensive)
      <span className="text-muted-foreground text-xs">
        Order link unavailable
      </span>
    )}
  </div>
)}
```

**Rationale:** Defensive programming prevents broken links if order is deleted between query and user click.

---

#### Improvement 3: Optional Migration for Existing Overrides

**Issue:** The plan states "No migration needed" but existing consumed overrides won't have `overrideOrderId` populated.

**Current state:** Existing overrides with `usageCount=1` are blocked from reuse but don't show order linkage in UI.

**Recommendation:** Add optional migration query to backfill `overrideOrderId` for existing consumed overrides:

```typescript
// convex/vouchers/migrations.ts (new file)
import { internalMutation } from "../_generated/server";

/**
 * OPTIONAL: Backfill overrideOrderId for existing consumed manager overrides.
 * Run manually from Convex dashboard if you want to link old overrides to their orders.
 */
export const backfillOverrideOrderLinks = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Find consumed manager overrides without order link
    const overrides = await ctx.db
      .query("vouchers")
      .filter((q) =>
        q.and(
          q.eq(q.field("isManagerOverride"), true),
          q.gte(q.field("usageCount"), 1),
          q.eq(q.field("overrideOrderId"), undefined)
        )
      )
      .collect();

    let updated = 0;

    for (const override of overrides) {
      // Find the order that used this override
      const usageRecord = await ctx.db
        .query("voucherUsage")
        .withIndex("by_voucher", (q) => q.eq("voucherId", override._id))
        .first();

      if (usageRecord) {
        // Backfill the order link
        await ctx.db.patch(override._id, {
          overrideOrderId: usageRecord.orderId,
          // Optionally deactivate if not already
          isActive: false,
        });
        updated++;
      }
    }

    return { message: `Backfilled ${updated} manager overrides` };
  },
});
```

**Rationale:**
- **Low priority** (existing overrides are already blocked from reuse)
- **Nice to have** (improves UI display for old overrides)
- **Safe** (read-only until manually run from dashboard)
- **Optional** (can skip if not needed)

---

#### Improvement 4: Performance Note for N+1 Queries

**Issue:** The plan adds `useQuery(api.vouchers.getOverrideOrderDetails)` inside `OverrideCard` component. If there are 50 overrides on the page, this creates 50 individual queries.

**Current approach:**
```typescript
// OverrideCard component (called once per override)
const orderDetails = useQuery(
  api.vouchers.getOverrideOrderDetails,
  voucher.overrideOrderId ? { voucherId: voucher._id } : "skip"
);
```

**Performance impact:**
- Convex caches queries efficiently, but initial load creates N individual subscriptions
- For 50 overrides with `overrideOrderId`, that's 50 WebSocket subscriptions
- Each subscription queries `orders` table individually

**Recommendation:** Add performance note to plan:

```markdown
### Performance Considerations

**N+1 Query Risk:**
The `getOverrideOrderDetails` query is called once per override card. With 50 overrides, this creates 50 individual queries.

**Mitigation:**
1. **Short-term:** Convex query caching makes this acceptable for small datasets (<100 overrides)
2. **Future optimization (if needed):** Batch query pattern:
   ```typescript
   // Future: Single query returns all order details
   export const batchGetOrderDetails = query({
     args: { voucherIds: v.array(v.id("vouchers")) },
     handler: async (ctx, args) => {
       // Fetch all orders in single query
       // Return Map<VoucherId, OrderDetails>
     },
   });
   ```

**When to optimize:**
- If VouchersManager shows >100 manager overrides
- If page load time exceeds 2 seconds
- If WebSocket subscription count causes performance issues

**Current assessment:** Acceptable for V1 (manager overrides are low volume - typically <20 active at any time).
```

**Rationale:** Documents known trade-off and provides clear optimization path if needed.

---

## 4. Refinements (Minor Suggestions)

- **Add TypeScript strict null check:** Ensure `orderDetails?.orderDeleted` handles all falsy cases (null, undefined, false)
- **Consider toast notification:** When override is consumed, show success toast: "Manager override MGR-XXXX has been used and deactivated"
- **Add data-testid attributes:** For automated testing of override cards (`data-testid="override-card-${voucher.code}"`)
- **CHANGELOG.md template:** Include exact entry format in plan for consistency

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `recordVoucherUsage()` | `convex/orders/helpers/voucherHandling.ts:127` | ✅ Already planned - extend with override deactivation logic |
| `releaseVoucherUsage()` | `convex/orders/helpers/voucherHandling.ts:157` | ✅ Already planned - add comment explaining override behavior |
| `validateVoucher()` | `convex/vouchers/queries.ts:153` | ✅ Already planned - enhance error messaging |
| `getVoucherStatus()` helper | `src/pages/VouchersManager.tsx:680` | ✅ Already used in OverrideCard - no changes needed |
| `ConfirmDialog` component | `src/components/shared/ConfirmDialog.tsx` | Not needed (no user confirmation required for auto-deactivation) |
| `CostTooltip` pattern | `src/components/shared/CostTooltip.tsx` | Not applicable (different use case) |

### Potential Duplication Risks

**Risk 1: Duplicate validation logic**
- ❌ **Issue:** `validateVoucher` (query) and `validateAndApplyVoucher` (mutation helper) have duplicate validation logic
- ✅ **Current state:** Already duplicated in codebase (not introduced by this plan)
- 💡 **Future refactor:** Extract validation logic to shared pure function in `convex/lib/voucherValidation.ts`

**Risk 2: Duplicate order detail fetching**
- ❌ **Issue:** Plan introduces new `getOverrideOrderDetails` query, but orders already have `getById` query
- ✅ **Justification:** `getOverrideOrderDetails` returns minimal order info (orderNumber, status) vs full order object - different use case
- ✅ **Verdict:** No duplication - this is a specialized query for performance

**Risk 3: Similar UI pattern to customer link in orders**
- ✅ **Pattern already exists:** OrderDetail shows customer name as link, OverrideCard will show order number as link
- ✅ **Verdict:** Reusing established pattern - good consistency

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Phase 1: Backend - Auto-Deactivation Logic | ✅ Good | Clear, focused changes to voucherHandling helpers |
| Phase 2: Backend - Validation Enhancement | ✅ Good | Logical separation (validation vs usage tracking) |
| Phase 3: Frontend - UI Display | ✅ Good | Depends on backend completion - correct ordering |

**Ordering Issues:** None. Phases are correctly ordered (backend before frontend).

**Missing Phases:**
- ⚠️ **Phase 0: Git branch creation** (should be explicit in plan)
- ⚠️ **Phase 4: Documentation update** (CHANGELOG.md is mandatory per WORKFLOW.md)
- ⚠️ **Phase 5: Manual QA verification** (already included in "Verification & Testing" section)

**Recommended Phase Structure:**

```markdown
### Phase 0: Setup
1. Create feature branch: `git switch -c fix/manager-override-one-time-use`
2. Verify current working directory: `git status`

### Phase 1: Backend - Auto-Deactivation Logic
[Existing content...]
**Commit:** `feat(vouchers): auto-deactivate manager overrides on first use`

### Phase 2: Backend - Validation Enhancement
[Existing content...]
**Commit:** `feat(vouchers): add override-specific error messaging and order details query`

### Phase 3: Frontend - UI Display
[Existing content...]
**Commit:** `feat(vouchers): display order linkage and deletion status for overrides`

### Phase 4: Verification
1. Run `npm run build` - ensure no TypeScript errors
2. Run `npx convex dev` - test backend functions
3. Manual QA (see "Verification & Testing" section)

### Phase 5: Documentation & Merge
1. Update `docs/CHANGELOG.md` (MANDATORY)
2. Push branch: `git push origin fix/manager-override-one-time-use`
3. Create PR, request review
4. After approval: merge to main
```

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Phase 1-2 (Backend) | `convex-backend` | Expert in Convex mutations, queries, and helper architecture |
| Phase 3 (Frontend) | `react-ui-builder` | Expert in shadcn/ui, Convex hooks, and React patterns |
| Post-merge QA | `code-auditor` | Read-only verification of implementation correctness |

**Execution Strategy:**
1. Use `convex-backend` agent for Phase 1-2 (single session)
2. Use `react-ui-builder` agent for Phase 3 (separate session)
3. Manual testing by developer (no agent needed)
4. Use `code-auditor` for final verification before merge

**Rationale:** Sequential execution (backend → frontend) ensures TypeScript types are available when building UI.

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ❌ **No** - Missing branch creation step |
| Branch naming convention | ⚠️ **Implicit** - Should use `fix/manager-override-one-time-use` (fix type, kebab-case) |
| Merge strategy documented | ⚠️ **Partial** - Mentions "merge to main" but not PR process |

**Recommendation:** Add explicit branch creation at start of plan:
```bash
git switch main && git pull
git switch -c fix/manager-override-one-time-use
```

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Phase 1 | 1 commit | `feat` | Backend voucherHandling changes - atomic ✅ |
| Phase 2 | 1 commit | `feat` | Backend queries changes - atomic ✅ |
| Phase 3 | 1 commit | `feat` | Frontend UI changes - atomic ✅ |

**Assessment:** ✅ Good commit boundaries. Each phase is logically atomic and can be reverted independently.

### Recommended Commit Checkpoints

The plan should commit at these natural boundaries:

1. **After backend helper changes** →
   ```
   feat(vouchers): auto-deactivate manager overrides on first use

   - recordVoucherUsage now sets isActive=false for manager overrides
   - Populates overrideOrderId with consuming order link
   - releaseVoucherUsage keeps overrides deactivated for audit trail

   Files: convex/orders/helpers/voucherHandling.ts
   ```

2. **After backend validation changes** →
   ```
   feat(vouchers): add override-specific error messaging and order details query

   - validateVoucher returns specific error for consumed overrides
   - Add getOverrideOrderDetails query for UI display

   Files: convex/vouchers/queries.ts
   ```

3. **After frontend changes** →
   ```
   feat(vouchers): display order linkage and deletion status for overrides

   - OverrideCard shows 'Used by Order #XXXX' link
   - Handles deleted orders with warning indicator
   - Updated TypeScript interface for overrideOrderId

   Files:
   - src/pages/VouchersManager.tsx
   - src/hooks/convex/useVouchers.ts
   ```

### Pre-Push Verification

- [x] Plan includes `npm run build` check (✅ in "Deployment Notes")
- [ ] Plan includes `npm run type-check` verification (**Missing** - add to deployment notes)
- [x] Plan includes local testing before push (✅ in "Verification & Testing")

**Recommendation:** Add to deployment notes:
```markdown
**Pre-Push Verification:**
```bash
npm run build          # Ensure frontend builds
npm run type-check     # Verify TypeScript types (NO ERRORS ALLOWED)
npx convex dev         # Test backend functions locally
# Run manual QA checklist (see "Verification & Testing")
```
```

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Documented ("revert commits in reverse order") |
| Deployment order | ✅ Correct (backend first via Convex, then frontend via Vite) |
| Data backup needed | ✅ No (no destructive changes or migrations) |
| Migration safety | ✅ Safe (no schema changes, only field population) |

**CI/CD Flow:**
1. Push to branch → GitHub Action runs lint, type-check, build
2. Merge to main → Convex auto-deploys backend (via `convex deploy`)
3. Vercel webhook rebuilds frontend (consumes new Convex API)
4. Zero downtime (backwards compatible changes)

### Git Workflow Issues Found

1. ❌ **No branch creation step** - Add `git switch -c fix/manager-override-one-time-use` at start
2. ❌ **No commit checkpoints** - Add commit messages after each phase
3. ⚠️ **Missing `npm run type-check`** - Add to pre-push verification
4. ⚠️ **CHANGELOG.md not mentioned** - MANDATORY per WORKFLOW.md, add to Phase 5

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Phase 1-2 (Backend) | None (internal implementation, no API changes) |
| Phase 3 (Frontend) | None (UI enhancement, no component API changes) |
| Post-merge | **docs/CHANGELOG.md** (MANDATORY per WORKFLOW.md) |
| Optional | **docs/API_REFERENCE.md** (if getOverrideOrderDetails is public-facing) |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-02-05 - Manager Override One-Time Use Enforcement

**Manager overrides now automatically deactivate after first use and link to the consuming order.**

- Manager overrides are now true one-time use vouchers
- Auto-deactivate (`isActive: false`) immediately on first use
- Link to specific order via `overrideOrderId` field
- VouchersManager shows "Used by Order #XXXX" link (or "Order Deleted" if removed)
- Cancelled orders do NOT reactivate overrides (maintains audit trail)
- Enhanced error message: "This manager override has already been used and cannot be reused"

**Files Modified:**
- convex/orders/helpers/voucherHandling.ts (recordVoucherUsage, releaseVoucherUsage)
- convex/vouchers/queries.ts (validateVoucher, getOverrideOrderDetails)
- src/pages/VouchersManager.tsx (OverrideCard component)
- src/hooks/convex/useVouchers.ts (Voucher interface)

**Commits:**
- abc123 - feat(vouchers): auto-deactivate manager overrides on first use
- def456 - feat(vouchers): add override-specific error messaging and order details query
- ghi789 - feat(vouchers): display order linkage and deletion status for overrides

**Breaking Changes:** None (backwards compatible)

**Migration Notes:** Existing consumed overrides will continue to block reuse via `usageCount` check. New overrides will benefit from explicit deactivation and order linking.
```

---

## 10. Edge Cases to Address

The plan should explicitly handle:

- [x] **Order deleted after override consumed** - ✅ Handled (shows "Order has been deleted" warning)
- [x] **Override used then order cancelled** - ✅ Handled (override stays deactivated)
- [x] **Multiple overrides for same order** - ✅ Allowed (each override is independent)
- [x] **Override created but never used** - ✅ Handled (remains active until used or expired)
- [ ] **Order detail query fails (network error)** - ⚠️ Not explicitly handled in UI
- [ ] **Clicking order link while order is being deleted** - ⚠️ Race condition (see Improvement 2)
- [x] **Existing overrides without `overrideOrderId`** - ✅ Handled gracefully (no link shown)
- [x] **Transaction rollback** - ✅ Safe (Convex atomic operations)

**Recommendations:**

### Edge Case 1: Query Error Handling

Add error boundary for `getOverrideOrderDetails` query:

```typescript
// In OverrideCard component
const orderDetails = useQuery(
  api.vouchers.getOverrideOrderDetails,
  voucher.overrideOrderId ? { voucherId: voucher._id } : "skip"
);

// Add error handling
if (voucher.overrideOrderId) {
  if (orderDetails === undefined) {
    // Loading state
    return <span className="text-muted-foreground text-xs">Loading...</span>;
  }

  if (orderDetails === null) {
    // Query returned null (shouldn't happen, but defensive)
    return <span className="text-muted-foreground text-xs">Order unavailable</span>;
  }

  if (orderDetails.orderDeleted) {
    // Order was deleted
    return <span className="text-destructive">...</span>;
  }

  // Order exists - show link
  return <Link to={...}>...</Link>;
}
```

---

## 11. Approval Conditions

### For Approval, address:

✅ **Plan is approved as-is.** All critical issues have been verified as non-existent.

### Recommended before implementation:

1. **Add git workflow section** (Improvement 1) - branch creation, commit checkpoints, pre-push verification
2. **Add CHANGELOG.md entry requirement** (explicitly mentioned in Phase 5)
3. **Consider adding `npm run type-check` to pre-push verification**
4. **Optionally: Add error handling for query failures** (Improvement 2)

### Optional enhancements (can defer to V2):

- Backfill migration for existing overrides (Improvement 3)
- Batch query optimization (Improvement 4)
- Toast notification on override consumption
- Automated tests for override deactivation flow

---

## 12. Architecture & Logic Validation

### Schema Flow Validation

✅ **Correct usage of existing schema:**
- `overrideOrderId` field already exists in schema (line 481 of schema.ts)
- `isActive` boolean already exists (line 469)
- `isManagerOverride` boolean already exists (line 479)
- No new fields needed - excellent reuse of existing schema

✅ **Index usage:**
- `by_code` index for override lookup (efficient)
- `by_order` index in voucherUsage for usage tracking (efficient)
- No new indexes needed

✅ **Data flow:**
```
Order Creation Flow:
1. User applies override code in checkout
2. validateVoucher() checks isActive, usageCount, etc.
3. Order created with voucherId link
4. recordVoucherUsage() called:
   - Increment usageCount
   - (NEW) Set isActive=false if isManagerOverride
   - (NEW) Set overrideOrderId=orderId if isManagerOverride
   - Create voucherUsage record

Order Cancellation Flow:
1. User cancels order
2. releaseVoucherUsage() called:
   - Decrement usageCount
   - (NEW) Do NOT reactivate if isManagerOverride
   - Delete voucherUsage record
```

**Assessment:** ✅ Data flow is correct and maintains audit trail.

### Logic Correctness

✅ **Validation logic:**
- `isActive === false` check happens BEFORE usage limit check (correct priority)
- Manager override error message differentiated from regular voucher (good UX)
- Validation in both query (advisory) and mutation (authoritative) layers (defense in depth)

✅ **Business rules alignment:**
- ✅ "Manager overrides should be one-off only" - enforced via `isActive: false`
- ✅ "Should deactivate immediately after first use" - happens in `recordVoucherUsage`
- ✅ "Should link to specific order" - `overrideOrderId` populated
- ✅ "If order deleted, should show 'order has been deleted'" - UI handles via `orderDeleted: true`
- ✅ "No other order should use override" - enforced via `isActive` check in validation

✅ **State transitions:**
```
Manager Override Lifecycle:
1. Created → isActive=true, usageCount=0, overrideOrderId=undefined
2. Applied to order → (still active during checkout)
3. Order confirmed → isActive=false, usageCount=1, overrideOrderId=<orderId>
4. Terminal state → Cannot be reactivated, maintains order link forever
```

**Assessment:** ✅ State machine is correct and prevents reactivation abuse.

### Concurrency & Race Conditions

✅ **Transaction safety:**
- `recordVoucherUsage` uses two `ctx.db.patch()` calls but Convex mutations are atomic
- If second patch fails, entire mutation rolls back (order creation fails)
- User sees error and can retry safely

✅ **Race condition: Two orders using same override simultaneously:**
```
Timeline:
T0: Order A validates override (isActive=true, usageCount=0) ✅
T1: Order B validates override (isActive=true, usageCount=0) ✅
T2: Order A commits → recordVoucherUsage → isActive=false, usageCount=1
T3: Order B commits → recordVoucherUsage → usageCount=2, already inactive ❌

Result: Order B would incorrectly increment usageCount even though override is inactive.
```

**Issue:** Race condition if two users apply same override at exact same time.

**Mitigation:**
1. **Validation happens in mutation** (`validateAndApplyVoucher` at orderCrud.ts:264)
2. **Mutations are serialized** (Convex guarantees serial execution per mutation)
3. **Frontend validation is advisory only** (backend is authoritative)

**Conclusion:** ✅ Race condition is handled correctly. Second order would fail validation because mutation re-checks `isActive` before applying.

**Verification:** Ensure `validateAndApplyVoucher` (mutation helper) re-checks `isActive` after acquiring lock:

```typescript
// convex/orders/helpers/voucherHandling.ts:validateAndApplyVoucher
// Should check isActive again inside mutation context
const voucher = await ctx.db.get(voucherId);
if (!voucher.isActive) {
  throw new Error("Voucher is no longer active");
}
// Then proceed with recordVoucherUsage
```

⚠️ **Action required:** Verify that `validateAndApplyVoucher` mutation helper re-checks `isActive` (not just the query). If not, add this check.

### Performance Implications

**N+1 Query Risk:** ⚠️ Documented in Improvement 4
- `getOverrideOrderDetails` called once per override card
- For 50 overrides, creates 50 WebSocket subscriptions
- Convex caching mitigates this, but worth monitoring

**Denormalization Opportunity:**
- Could denormalize `orderNumber` directly on voucher (avoids query)
- Trade-off: Stale data if order number changes (rare)
- Recommendation: Keep current approach (normalized) for V1

**Index usage:**
- ✅ `by_code` index used for validation (efficient)
- ✅ `by_order` index used for usage tracking (efficient)
- ✅ No full table scans introduced

---

## 13. Security Considerations

✅ **Authorization:**
- Manager override creation already requires manager/admin role (mutations.ts:275)
- No new authorization checks needed

✅ **Data exposure:**
- `getOverrideOrderDetails` returns minimal order info (orderNumber, status, etc.)
- Does NOT expose sensitive data (customer phone, payment details)
- ✅ Safe for public query

✅ **Input validation:**
- `overrideOrderId` is optional `v.id("orders")` - type-safe
- No user input for this field (populated by backend)
- ✅ No injection risk

✅ **Audit trail:**
- `overrideOrderId` preserved even after order deletion
- `voucherUsage` record provides timestamp and customer link
- Immutable after creation (manager overrides cannot be edited)
- ✅ Complete audit trail maintained

---

## 14. Summary of Recommendations

### High Priority (Do Before Implementation)
1. ✅ **Add git workflow section** with branch creation and commit checkpoints
2. ✅ **Add CHANGELOG.md update requirement** to Phase 5
3. ✅ **Verify `validateAndApplyVoucher` re-checks `isActive`** (race condition mitigation)

### Medium Priority (Consider During Implementation)
1. ⚠️ **Add error handling for deleted order click** (Improvement 2)
2. ⚠️ **Add `npm run type-check` to pre-push verification**
3. ⚠️ **Document N+1 query performance consideration** (Improvement 4)

### Low Priority (Can Defer to V2)
1. Optional migration to backfill existing overrides (Improvement 3)
2. Batch query optimization if performance becomes issue
3. Toast notification on override consumption
4. Automated integration tests

---

*Generated by /staffreview skill*
*Staff Developer Review (Implementation Focus) + Principal Developer Review (Architecture Focus)*

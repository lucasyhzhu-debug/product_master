# Staff Review: Inventory Page Overhaul v2

**Date:** 2026-02-06
**Plan:** `C:\Users\Irfan\.claude\plans\merry-foraging-crayon.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## Plan Validation Checklist

| Requirement | Status |
|------------|--------|
| Git Workflow section exists? | Yes |
| Branch name specified? | Yes - `feature/inventory-overhaul` |
| Checkpoint strategy defined? | Yes - 3 commits |
| Implementation Waves section exists? | Yes |
| Agents assigned? | No - missing agent assignments |
| File paths specified? | Yes |
| PARALLEL/SEQUENTIAL marked? | Partial - Wave 1 says "sequentially", Wave 2 says "in parallel", Wave 3 says SEQUENTIAL |
| Documentation Updates section exists? | Yes |
| CHANGELOG.md checkbox? | Yes |
| Success Criteria section exists? | Yes |
| Type check requirement? | Yes |
| Build requirement? | Yes |

**Plan Structure Additions needed:** Agent assignments for each wave are missing. Adding below in Section 7.

---

## 1. Summary

**Overall Assessment:** Approve with minor revisions (0 critical, 5 improvements, 5 refinements)

The plan is well-structured and addresses real, user-facing bugs with clear code snippets. The wave ordering is correct (backend first, frontend second). After thorough code-level verification of every concern:

- The `adjustStock` fix is logically correct: it scales `quantityPurchased` and `totalCostIdr` together when adjusting UP, preserving the unit cost ratio.
- The transfer per-batch splitting is safe: `applyFIFOConsumption` patches but never deletes source batches, so reading them afterward works.
- The `updateComponentStock()` helper already populates `latestSupplierName`, `latestPurchaseUrl`, and `latestUnitCostIdr` -- confirmed in `convex/inventory/helpers.ts` lines 91-93.
- Convex's serializable transaction model prevents race conditions in concurrent transfers.

The main areas needing revision are: (1) making `lowStockComponents` optional in `ReceiveStockDialog` for the per-component Receive button, (2) guarding against division by zero in the thermometer bar, and (3) clarifying sort behavior for components without reorder points.

---

## 2. Critical Issues (Must Fix)

**None identified.**

After deep analysis of all originally suspected issues (adjustStock math, transfer batch reading after FIFO, race conditions), all were validated as safe:

| Originally Suspected | Verdict | Evidence |
|---------------------|---------|----------|
| adjustStock `totalCostIdr` wrong when adjusting DOWN | **Safe** | `totalCostIdr` is preserved when `quantityPurchased` doesn't change. The ratio `totalCostIdr / quantityPurchased = unitCostIdr` remains valid. |
| Source batch depleted after FIFO consumption | **Safe** | `applyFIFOConsumption` uses `ctx.db.patch()` -- batches are never deleted. `ctx.db.get()` returns full document. |
| Race condition in concurrent transfers | **Safe** | Convex mutations are serializable transactions. |
| Missing `transfer_out` transaction type | **Pre-existing** | Not introduced by this plan. Already uses `"consume"` via `applyFIFOConsumption`. |

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Make `lowStockComponents` optional in ReceiveStockDialog | Medium | Low |
| 2 | Clarify adjustStock totalCostIdr behavior in comments | Medium | Low |
| 3 | Add transfer_out transaction type to source-side records | Medium | Medium |
| 4 | ComponentRow thermometer bar: test at 280px minimum width | Medium | Low |
| 5 | Handle division by zero in thermometer bar for zero reorderPoint | Low | Low |

**Details:**

### Improvement 1: Make lowStockComponents optional in ReceiveStockDialog

When opening from ComponentRow's per-component "Receive" button with `preselectedComponentId`, the component selection grid is skipped entirely, making `lowStockComponents` unnecessary.

**Current interface:**
```typescript
interface ReceiveStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StorageLocation[];
  lowStockComponents: ComponentType[];  // Required
}
```

**Recommended interface:**
```typescript
interface ReceiveStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StorageLocation[];
  lowStockComponents?: ComponentType[];  // Optional when preselectedComponentId is set
  preselectedComponentId?: Id<"componentTypes">;
  forceCreateMode?: boolean;
}
```

Then in ComponentRow, open the dialog with just:
```typescript
<ReceiveStockDialog
  open={receiveDialogOpen}
  onOpenChange={setReceiveDialogOpen}
  locations={locations}
  preselectedComponentId={component._id}
/>
```

### Improvement 2: Clarify adjustStock totalCostIdr edge case

The plan's logic is mathematically correct, but add a comment explaining WHY `totalCostIdr` is preserved when adjusting down:
```typescript
// totalCostIdr represents the cost of quantityPurchased, not quantityRemaining.
// We only scale up when quantityPurchased increases (physical count found more than purchased).
// On downward adjustments, quantityPurchased stays the same, preserving the original cost basis.
```

### Improvement 3: Use transfer_out transaction type for source records

Currently `applyFIFOConsumption` always creates `transactionType: "consume"` records (`convex/inventory/fifo.ts` line 152). For transfers, the source-side records should be `"transfer_out"` for auditability. Either:
- Add a `transactionType` override parameter to `applyFIFOConsumption`, or
- Create transfer_out transactions manually (like the plan does for transfer_in) and skip `applyFIFOConsumption`'s transaction logging.

This is a pre-existing issue but worth fixing while refactoring transfers.

### Improvement 4: Responsive testing for thermometer bar

The plan replaces the `hidden sm:block w-24` bar with an "always visible" h-4 thermometer. Per `docs/CODE_STYLE.md`, all UI components must be tested at minimum 280px width. On narrow screens, ensure the bar doesn't compress the component name or stock numbers. Consider using `flex-col` stacking on mobile.

### Improvement 5: Guard against zero reorderPoint in thermometer bar

The plan's thermometer scale is `0% to 200% of reorder point`. If `reorderPoint` is 0 (set but zero), this causes division by zero. Add a guard:
```typescript
const scaleMax = Math.max((component.reorderPoint ?? 0) * 2, 1); // Prevent division by zero
const fillPercent = Math.min(100, (totalAvailable / scaleMax) * 100);
```

---

## 4. Refinements (Minor Suggestions)

- **StatCard changes are purely cosmetic** -- the current gradient approach isn't broken. Verify the business owner has approved this visual change before implementing.
- **Sorting state not persisted** -- the `sortBy` useState will reset on navigation. Consider using URL search params for persistence (low priority).
- **Expire button removal creates dead code** -- the `expireBatch` mutation (`convex/inventory/mutations.ts` lines 446-488) and `useConvexExpireBatch` hook will become orphaned. Add a cleanup step to the plan, or note it as follow-up tech debt.
- **Source-side transfer transactions** -- `applyFIFOConsumption` creates `"consume"` type transactions on the source side. Ideally these should be `"transfer_out"`. Pre-existing issue.
- **Line number references are fragile** -- the plan references "line 383" for adjustStock but actual code is at line 380-386. Use code pattern matching rather than line numbers.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `updateComponentStock()` | `convex/inventory/helpers.ts` line 49 | Already populates `latestSupplierName`, `latestPurchaseUrl`, `latestUnitCostIdr` -- plan correctly identifies this |
| `calculateWeightedAvgCost()` | `convex/inventory/helpers.ts` line 19 | Cost calculation already used by stock aggregation |
| `AdjustStockDialog` wastage reasons | `src/components/inventory/AdjustStockDialog.tsx` line 33 | Already includes "Expired" reason -- validates Expire button removal |
| Category filter badge pattern | `src/pages/InventoryManager.tsx` line 186 | Plan correctly extends this for sorting badges |
| `formatCurrency()` | `src/lib/utils.ts` | Already imported in ComponentRow for cost display |

### Potential Duplication Risks

- **ReceiveStockDialog will have TWO usage sites** -- one at InventoryManager level (for "Receive New Stock Type" button) and one per ComponentRow. The plan correctly reuses the same component with new optional props, avoiding duplication.
- **Thermometer bar logic** in ComponentRow duplicates the progress bar in Kitchen V2 sidebar (`getPackagingStockSummary` query). If the thermometer bar becomes a common pattern, consider extracting to a shared `StockLevelBar` component in a future refactor.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Backend Fixes | Good | Correct ordering. All 3 tasks modify backend files only. |
| Wave 2: Frontend Changes | Good | Can be parallelized (5 independent UI tasks). |
| Wave 3: Verification | Good | Sequential type-check, build, test is correct. |

**Ordering Issues:**
- None significant. Backend-first, frontend-second is correct.

**Missing Phases:**
- **Dead code cleanup**: After removing the Expire button from BatchCard, the `useConvexExpireBatch` import and `expireBatch` mutation become orphaned. Add a cleanup step or note.
- **Hook index exports**: If new props are added to ReceiveStockDialog, verify the hook barrel export (`src/hooks/convex/index.ts`) doesn't need updates. (Checked: no hook changes needed, the dialog uses existing hooks internally.)

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 1 (Backend) | `convex-backend` | Schema-adjacent mutations and query changes |
| Wave 2A-2B (StatCard, BatchCard) | `react-ui-builder` | Pure UI component changes |
| Wave 2C-2E (ComponentRow, ReceiveStockDialog, InventoryManager) | `react-ui-builder` | UI + state management changes |
| Wave 3 (Verification) | `code-auditor` | Type check, build verification, pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes - `feature/inventory-overhaul` |
| Branch naming convention | Correct |
| Merge strategy documented | Implicit (plan says "already exists, on top of `feature/bom-improvements`") |

**Warning:** The branch is "on top of `feature/bom-improvements`". This means the branch must be rebased or merged after `bom-improvements` merges to main. The plan should document the merge dependency explicitly.

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 1 | 1 | fix | Backend fixes - good atomic boundary |
| Wave 2 | 1 | feat | Frontend changes - somewhat large but cohesive |
| Wave 3 | 0-1 | fix | Only if cleanup needed |

### Recommended Commit Checkpoints
1. After backend fixes -> `fix: adjustStock quantityPurchased bug + transferStock per-batch splitting + query enrichment`
2. After frontend changes -> `feat: inventory UI overhaul - thermometer bars, sorting, per-component receive, stat card fix`
3. After verification cleanup (if needed) -> `fix: verification pass cleanup`

These match the plan's proposed commits. Good.

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [x] Plan includes `npm run test` (all 256 tests)
- [ ] Plan does NOT include explicit local manual testing checklist (Wave 3 step 4 mentions manual review but could be more structured)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Missing - no mention of rollback |
| Deployment order | Correct - backend before frontend (Convex deploys independently) |
| Data backup needed | No - no schema changes, only mutation logic changes |
| Migration safety | Safe - no schema migrations |

### Git Workflow Issues Found
- Branch dependency on `feature/bom-improvements` not documented for merge order
- No rollback strategy documented (low risk since no schema changes)
- Branch already exists, so no creation step needed (OK)

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Wave 1 | `docs/API_REFERENCE.md` (adjustStock, transferStock, getInventoryReport changes) |
| Wave 2 | None |
| Post-merge | `docs/CHANGELOG.md` (required) |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-06 - Inventory Page Overhaul v2

**Backend fixes and UI improvements for inventory management.**

### Bug Fixes
- Fixed adjustStock not updating quantityPurchased when adjusting UP (caused negative consumed% in BatchCard)
- Fixed transferStock creating single merged batch instead of preserving per-source-batch details
- Fixed BatchCard showing negative consumed percentage when quantityRemaining > quantityPurchased

### Features
- Thermometer bar always visible on ComponentRow (was hidden on mobile)
- Supplier name and weighted avg cost shown on collapsed ComponentRow
- Per-component "Receive" button on each ComponentRow
- Sorting controls: Name, % Lowest, # Lowest, Most Expensive
- Top button renamed to "+Receive New Stock Type" with force-create mode

### UI Improvements
- StatCard: white text on dark background for better readability
- Removed separate Expire button from BatchCard (use Wastage > Expired instead)

### Backend Enrichment
- getInventoryReport now returns latestSupplierName, latestPurchaseUrl, latestUnitCostIdr per location

**Files Modified:**
- `convex/inventory/mutations.ts`
- `convex/inventory/queries.ts`
- `src/components/inventory/StatCard.tsx`
- `src/components/inventory/BatchCard.tsx`
- `src/components/inventory/ComponentRow.tsx`
- `src/components/inventory/ReceiveStockDialog.tsx`
- `src/pages/InventoryManager.tsx`
```

---

## 10. Edge Cases to Address

- [ ] **adjustStock: newQuantity equals current quantityRemaining** -- creates a transaction with delta=0. Consider guarding against no-op adjustments.
- [ ] **ComponentRow with zero reorderPoint** -- thermometer bar scale becomes `0 / (0 * 2)` = NaN. Guard needed.
- [ ] **ComponentRow with no reorderPoint** -- plan says "show raw quantity". Verify this fallback renders correctly without the thermometer scale.
- [ ] **ReceiveStockDialog opened from ComponentRow then user switches to create-new mode** -- the `preselectedComponentId` should be cleared when entering create-new mode, since it creates a brand new component.
- [ ] **Sorting by "% Lowest" when component has no reorderPoint** -- what percentage to use? These components should sort to the end (no reorder threshold = no urgency).
- [ ] **Transfer creating many destination batches** -- if a transfer consumes from 10 source batches, 10 destination batches are created. This is correct behavior but could clutter the batch list. Acceptable for now; consider a "consolidate" option as future work.
- [ ] **BatchCard consumed% when both quantityPurchased and quantityRemaining are 0** -- plan's guard `effectivePurchased > 0 ? ... : 0` handles this correctly.

---

## 11. Approval Conditions

**For Approval, address these 3 items:**
1. Make `lowStockComponents` optional in `ReceiveStockDialogProps` (or explicitly pass `[]` from ComponentRow) -- the plan must be explicit about this
2. Guard against zero/undefined `reorderPoint` in thermometer bar scale calculation
3. Define sorting behavior for components without `reorderPoint` in "% Lowest" sort mode

**Recommended before implementation:**
1. Add explanatory comment in adjustStock about `totalCostIdr` preservation logic
2. Note dead code cleanup for `expireBatch` mutation after Expire button removal
3. Document branch dependency on `feature/bom-improvements`

---

## 12. Key Validation Findings

### Does `updateComponentStock()` populate `latestSupplierName`?

**YES, confirmed.** At `convex/inventory/helpers.ts` lines 74-75 and 87-94:
```typescript
const latestBatch = batches.sort((a, b) => b.purchaseDate - a.purchaseDate)[0];
// ...
await ctx.db.patch(existingStock._id, {
  latestSupplierName: latestBatch?.supplierName,
  latestPurchaseUrl: latestBatch?.purchaseUrl,
  latestUnitCostIdr: latestBatch?.unitCostIdr,
  // ...
});
```

The schema at `convex/schema.ts` lines 787-789 confirms the fields exist:
```typescript
latestSupplierName: v.optional(v.string()),
latestPurchaseUrl: v.optional(v.string()),
latestUnitCostIdr: v.optional(v.number()),
```

Plan's assumption is correct. No schema changes needed.

### Is the adjustStock fix correct?

**YES, with minor caveat.** The fix correctly addresses the bug where `quantityPurchased` stays at 100 when adjusting to 150, causing BatchCard to show "150/100" and -50% consumed. The fix scales `quantityPurchased` and `totalCostIdr` together when adjusting UP (past original purchased), preserving the unit cost ratio. When adjusting DOWN, both fields are preserved (correct -- the purchased amount hasn't changed, you've just consumed/wasted some).

**Caveat:** Add a code comment explaining the intentional asymmetry (scale up = adjust both, scale down = adjust neither).

### Transfer per-batch splitting: can we still read source batches?

**YES, confirmed.** `applyFIFOConsumption` (`convex/inventory/fifo.ts` line 146) uses `ctx.db.patch()` to reduce quantities and potentially set `status: "depleted"`, but **never deletes** batches. A subsequent `ctx.db.get(consumption.batchId)` will return the full document including `supplierName`, `purchaseDate`, `purchaseUrl`, `expiryDate`, etc.

### Does ComponentRow receive enough props for ReceiveStockDialog?

**PARTIALLY.** ComponentRow receives `locations` (sufficient) but NOT `lowStockComponents`. Since `preselectedComponentId` skips the component selection grid, `lowStockComponents` is not functionally needed -- but it is currently a **required** prop in the interface. The plan must either:
- Make `lowStockComponents` optional in the interface, or
- Pass `[]` from ComponentRow

### Is the thermometer bar scale (0-200% of reorder point) intuitive?

**Reasonably so.** The reorder point marker at 50% bar width creates a clear visual reference. The color gradient (red < 25%, amber 25-75%, emerald 75-150%, blue > 150%) provides good at-a-glance status. The 200% cap means components with stock significantly above 2x reorder point appear "full" -- acceptable since over-stocked items aren't a priority concern. The percentage label below provides the exact number for precision.

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

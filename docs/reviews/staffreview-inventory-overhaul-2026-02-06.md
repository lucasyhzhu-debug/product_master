# Staff Review: Inventory Page Overhaul Plan

**Plan:** `docs/plans/inventory-overhaul-plan.md`
**Reviewer:** Staff + Principal Developer Review
**Date:** 2026-02-06
**Verdict:** APPROVE WITH IMPROVEMENTS

---

## Summary

A well-scoped, frontend-only implementation plan to add transfer, wastage/adjustment, archive/restore, and terracotta theming to the Inventory Manager page. The plan correctly identifies all backend mutations as already existing, hooks as wired up, and schema as ready. The wave structure is logical and the risk assessment is honest. There are zero critical issues, but several improvements would make implementation smoother and more robust.

**Critical Issues: 0**
**Improvements: 8**
**Observations: 3**

---

## Staff Developer Review

### 1. Pattern Compliance

#### [IMPROVEMENT-1] Missing `createdBy` token pattern -- existing tech debt, but plan should acknowledge it

The plan describes calling `useConvexTransferStock()`, `useConvexAdjustStock()`, and `useConvexExpireBatch()`, which all require a `createdBy: string` argument. The existing `ReceiveStockDialog` and `ComponentTypeDialog` use the hardcoded placeholder `"current-user"` (with a TODO comment). The plan should explicitly state whether the new dialogs will:
- (a) Inherit the same `"current-user"` placeholder (consistent with existing code, ships faster), or
- (b) Wire up the `useAuth()` hook to pass the real user (correct, but scope creep)

**Recommendation:** Use `"current-user"` for now (matching existing pattern in `ReceiveStockDialog.tsx:176`, `ComponentTypeDialog.tsx:86`), but add a tech debt item to the documentation updates section.

#### [IMPROVEMENT-2] DropdownMenu component already exists -- plan says "kebab menu" but doesn't reference it

The plan mentions adding a "kebab menu (three-dot)" to `ComponentRow` but doesn't reference the existing `DropdownMenu` component at `src/components/ui/dropdown-menu.tsx`, which is already used in `OrderManager.tsx`. The implementer should use `DropdownMenu` / `DropdownMenuContent` / `DropdownMenuItem` from the existing UI primitives rather than building a custom menu.

**Files to reference:** `src/components/ui/dropdown-menu.tsx`, `src/pages/OrderManager.tsx` (lines 12-16 for imports, lines 185-214 for usage pattern).

#### [IMPROVEMENT-3] Barrel export update is mentioned but should also list new dialog files

Wave 5 mentions updating `src/components/inventory/index.ts`, but the barrel export update should also include:
- `TransferStockDialog` (from Wave 2)
- `AdjustStockDialog` (from Wave 3)

These should be added to the barrel in their respective waves, not deferred to Wave 5.

### 2. Code Reuse Assessment

#### [OBSERVATION-1] ConfirmDialog reuse -- correctly identified

The plan correctly identifies using `ConfirmDialog` from `src/components/shared/ConfirmDialog.tsx` for the archive confirmation. This component supports both `default` and `destructive` variants with a `loading` prop, which is sufficient for the expire and archive actions.

#### [IMPROVEMENT-4] TransferStockDialog location selection pattern -- should reuse ReceiveStockDialog's button grid pattern

The plan describes "To Location (button grid)" for the TransferStockDialog. This is consistent with `ReceiveStockDialog` (lines 400-419) which uses a `Button` grid for location selection. Good. However, the plan should explicitly note the existing pattern to copy from to avoid reimplementation.

### 3. Wave Execution Ordering

#### [OBSERVATION-2] Wave parallelism labels are slightly misleading

- Wave 1 says `[PARALLEL]` but the two tasks are in the same file (`InventoryManager.tsx`) and depend on `StatCard.tsx`. These should be marked `[SEQUENTIAL]` or acknowledge they are parallel agents working on different files.
- Wave 2 and Wave 3 are correctly labeled `[SEQUENTIAL after Wave 1]` and `[PARALLEL with Wave 2]` respectively. Wave 3 can genuinely run in parallel with Wave 2 since they touch different files.
- Wave 4 depends on Wave 1 for the theme changes but also touches `InventoryManager.tsx` which Wave 1 modifies. This sequential dependency is correctly identified.

### 4. Testing Strategy

#### [IMPROVEMENT-5] No testing wave details beyond build/type-check

Wave 6 lists `npm run test` but the plan doesn't describe any new tests. Given that this is purely frontend UI work, at minimum the plan should:
- Verify existing inventory tests still pass (regression)
- Consider whether the `AdjustStockDialog` wastage calculation (`newQuantity = batch.quantityRemaining - wasteQty`) should have a unit test

The backend mutations are already tested, so the main risk is in the frontend calculation logic within dialogs.

### 5. Git Workflow Compliance

The plan correctly specifies:
- Branch: `feature/inventory-overhaul`
- Commits after each wave
- CHANGELOG.md update

However, the plan mentions the branch was created from `feature/bom-improvements`, not from `main`. Per the project's git workflow rules ("NO direct commits to main"), this is acceptable for feature branches, but the plan should note that `feature/bom-improvements` must be merged to `main` first, OR this branch will need to be rebased onto `main` before merging.

---

## Principal Developer Review

### 6. Schema Flow Validation

#### [PASS] All mutations verified as existing

I verified the following mutation signatures against the actual code:

| Mutation | Plan Claims | Actual (verified) | Match |
|----------|------------|-------------------|-------|
| `transferStock` | `componentTypeId, fromLocationId, toLocationId, quantity, referenceNote?, createdBy` | `componentTypeId: v.id("componentTypes"), fromLocationId: v.id("storageLocations"), toLocationId: v.id("storageLocations"), quantity: v.number(), referenceNote: v.optional(v.string()), createdBy: v.string()` | YES |
| `adjustStock` | `batchId, newQuantity, reason, createdBy` | `batchId: v.id("inventoryBatches"), newQuantity: v.number(), reason: v.string(), createdBy: v.string()` | YES |
| `expireBatch` | `batchId` (implied) | `batchId: v.id("inventoryBatches"), reason: v.optional(v.string()), createdBy: v.string()` | PARTIAL -- plan omits `reason` and `createdBy` args |
| `deleteBatch` | `batchId` (implied) | `batchId: v.id("inventoryBatches")` | YES |
| `componentTypes.update` | `id, isActive` | `id: v.id("componentTypes"), isActive: v.optional(v.boolean()), ...others` | YES |

#### [IMPROVEMENT-6] `expireBatch` requires `createdBy` and accepts `reason` -- plan Wave 5 must account for this

The plan says "Expire button -> calls expireBatch with confirm" but doesn't detail the args. The actual `expireBatch` mutation requires `createdBy: v.string()` and accepts `reason: v.optional(v.string())`. The implementer must pass both. This is not critical but should be noted in the plan.

### 7. Logic Correctness

#### [PASS] Wastage calculation is sound

The plan specifies: `newQuantity = batch.quantityRemaining - wasteQty`. The `adjustStock` mutation validates:
- `newQuantity >= 0` (line 370)
- `newQuantity >= batch.quantityReserved` (line 374-378)

This means if a batch has reserved stock, you cannot waste more than `quantityRemaining - quantityReserved`. The plan's `AdjustStockDialog` should enforce `maxWasteQty = batch.quantityRemaining - batch.quantityReserved` (i.e., `batch.available`), not `batch.quantityRemaining`. This is a subtle but important validation gap.

#### [IMPROVEMENT-7] AdjustStockDialog max wastage must account for reserved stock

In the plan's AdjustStockDialog spec:
- Current: "Enter waste quantity" with no explicit max
- Should be: "Enter waste quantity, max = batch.available (quantityRemaining - quantityReserved)"

Similarly for Count Correction mode:
- The new actual count must be >= `batch.quantityReserved`
- The plan should add validation: "minimum count = reserved units"

The backend will reject invalid values, but showing the constraint in the UI is better UX.

### 8. Architecture Fit

#### [PASS] Active/Legacy query approach

The plan initially suggests passing `activeComponentsOnly: !showLegacy` but then self-corrects to: "Actually: Use a single query with `activeComponentsOnly: false` and split client-side into two lists." This is the correct approach because:
1. It avoids two separate queries that could cause flicker
2. It allows smooth toggle animation
3. The existing `filteredMatrix` useMemo already handles client-side filtering

The `getInventoryReport` query (verified at `convex/inventory/queries.ts:231`) accepts `activeComponentsOnly: v.optional(v.boolean())` and filters on `c.isActive`. When `activeComponentsOnly` is falsy/undefined, it returns all components. The plan should note that passing `false` or `undefined` will both work (both are falsy in the `if (args.activeComponentsOnly)` check).

### 9. Edge Cases

#### [IMPROVEMENT-8] Transfer to same location -- plan mentions validation but implementation must verify UI prevents it

The plan says "Validation: from !== to" for the TransferStockDialog. This is correct -- the backend `transferStock` does NOT validate this (it would create a transfer_out and transfer_in at the same location, which is wasteful but not destructive). The UI must prevent this by either:
- Filtering out the source location from the destination button grid, OR
- Disabling the source location button with a visual indicator

The plan should specify which approach to use. Filtering is simpler and recommended.

#### [OBSERVATION-3] Batch `_id` type in BatchCard

The `BatchCard` component currently types `_id` as `string` (line 12 of BatchCard.tsx). For the new action buttons (Adjust, Expire), the mutation hooks need `Id<"inventoryBatches">`. Since Convex IDs are typed strings that are compatible with `string`, this works at runtime, but the plan could note that a type cleanup of `BatchCardProps` to use `Id<"inventoryBatches">` would be beneficial.

### 10. Performance Implications

#### [PASS] No performance concerns

- The single query approach for active/legacy avoids double queries
- `useMemo` for `filteredMatrix` is already in place
- Batch queries are conditional (`expanded && selectedLocationForBatches ? ... : "skip"`) -- no unnecessary loads
- New dialogs are rendered on-demand (dialog open state), so no wasted renders

### 11. Security Considerations

#### [PASS] No security concerns for frontend-only changes

- Backend mutations already enforce business rules (reservation protection, quantity validation)
- No new backend endpoints needed
- `componentTypes.update` does not require auth token (matches existing pattern -- no `requireRole` call in the mutation). This is pre-existing and not introduced by this plan.
- The `createdBy` field is a display string, not a security control

---

## Mandatory Section Checklist

| Section | Present | Notes |
|---------|---------|-------|
| Git Workflow | YES | Branch + checkpoints specified |
| Implementation Waves | YES | 6 waves with clear dependencies |
| Documentation Updates | YES | CHANGELOG noted, schema/API correctly excluded |
| Success Criteria | YES | 10 specific criteria listed |

**All 4 mandatory sections present.**

---

## Summary of Findings

### Improvements (8)

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | Low | Pattern | Plan should acknowledge `createdBy` placeholder pattern |
| 2 | Low | Reuse | Reference existing `DropdownMenu` component for kebab menu |
| 3 | Low | Structure | Add new dialog components to barrel export in their own waves |
| 4 | Low | Reuse | Reference `ReceiveStockDialog` location button grid pattern |
| 5 | Medium | Testing | Add detail on regression testing and potential unit tests for calculations |
| 6 | Low | Accuracy | Note `expireBatch` requires `createdBy` and accepts `reason` in Wave 5 spec |
| 7 | Medium | Logic | AdjustStockDialog max wastage must account for reserved stock (`batch.available`, not `batch.quantityRemaining`) |
| 8 | Low | Edge Case | TransferStockDialog should filter out source location from destination grid |

### Observations (3)

| # | Area | Finding |
|---|------|---------|
| 1 | Reuse | `ConfirmDialog` correctly identified for archive/expire actions |
| 2 | Waves | Parallelism labels in Wave 1 slightly misleading but not blocking |
| 3 | Types | `BatchCard._id` typed as `string` instead of `Id<"inventoryBatches">` -- pre-existing, minor cleanup opportunity |

---

## Verdict: APPROVE WITH IMPROVEMENTS

The plan is well-structured, accurately reflects the codebase state, and has a sensible execution order. The most important improvement to incorporate before implementation is **IMPROVEMENT-7** (reserved stock validation in AdjustStockDialog), as this affects data integrity. All other improvements are low-severity polish items that can be addressed during implementation.

**Recommended action:** Update the plan with IMPROVEMENT-7 (add max waste validation) and IMPROVEMENT-6 (note expireBatch args), then proceed with Wave 1.

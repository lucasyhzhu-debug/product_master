# Staff Review: Kitchen Production Page — Complete Redesign (V3)

**Date:** 2026-02-10
**Plan:** `C:\Users\Irfan\.claude\plans\vivid-swinging-feigenbaum.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation

```
PLAN VALIDATION CHECKLIST
=========================

[x] Git Workflow section exists?
  -> Branch: feature/kitchen-redesign-v3
  -> Checkpoints: 10 items with 2 PAUSE points and 2 TEST GATEs

[x] Implementation Waves section exists?
  -> Agents assigned? Yes (schema-architect, convex-backend, react-ui-builder, code-auditor, tdd-test-architect)
  -> File paths specified? Yes (detailed per task)
  -> PARALLEL/SEQUENTIAL marked? Yes

[x] Documentation Updates section exists?
  -> CHANGELOG.md checkbox? Yes
  -> Also: SCHEMA.md, API_REFERENCE.md, ROADMAP.md

[x] Success Criteria section exists?
  -> Type check requirement? Yes
  -> Build requirement? Yes
  -> 127 tests requirement? Yes
  -> Feature-specific criteria? 20+ detailed checkboxes

=========================
```

**Plan structure validated.**

---

## 1. Summary

**Overall Assessment:** Approve (with 2 Critical fixes + 3 Improvements)

This is an exceptionally thorough plan — CTO-reviewed, TDD-reviewed, design-specified, with 127 gated tests across 9 files. The architecture cleanly separates batch production counts from per-order packing, the FIFO integration reuses existing infrastructure, and the wave sequencing is realistic. Two issues need fixing before implementation: (1) the existing per-order FIFO consumption path doesn't resolve per-product `consumptionStage` overrides — the new batch helper must not inherit this bug, and (2) the `productionCounts` table's "carry-over forever" design will cause operational confusion without a reset mechanism. Three improvements would significantly strengthen the plan.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Per-product `consumptionStage` override not resolved in existing FIFO path | Logic | Wave 3e (consumePackagingBatch) |
| 2 | `productionCounts` never resets — unbounded accumulation | Schema/Business Logic | Wave 3a schema + 3c queries |

**Details:**

### Issue 1: Per-product consumptionStage override not resolved in existing code

The plan correctly specifies that `consumePackagingBatch()` must resolve `menuProductComponents.consumptionStage ?? componentTypes.consumptionStage` (see 3e). However, the **existing** `consumeMaterialsByStageInternal()` at `convex/orders/mutations/inventoryIntegration.ts:333` only checks `componentType.consumptionStage !== stage` — it does NOT look up the per-product override from `menuProductComponents`. This means the existing per-order consumption path has been ignoring overrides all along.

The new `consumePackagingBatch()` helper will correctly resolve overrides. But the two systems will now behave differently:
- Old per-order path: ignores `menuProductComponents.consumptionStage`
- New batch path: respects `menuProductComponents.consumptionStage`

This creates inconsistency and could cause double-consumption or missed consumption when the same product is processed through both paths.

**Recommendation:** Add a task to Wave 3e (or a follow-up) that also fixes `consumeMaterialsByStageInternal()` to resolve the effective consumption stage via `menuProductComponents` rather than only `componentTypes`. Alternatively, document this as known tech debt with a tracking issue. The new batch path MUST correctly resolve overrides regardless — just flag the inconsistency.

### Issue 2: productionCounts never resets — unbounded accumulation

The plan states: "No date field — running totals that carry over." and "Counts carry over (no daily reset)" (Decision #13). While this simplifies implementation, it creates real operational problems:

1. **Dashboard confusion**: After 30 days, `boxed: 1547, stickered: 1520, packed: 1498` — the absolute numbers are meaningless without context. "How many did we box today?" requires the production log aggregation, not the counts table.
2. **availableForStickering/Packing becomes a tiny difference of large numbers**: `boxed: 1547 - stickered: 1520 = 27 available` is correct but fragile — any corruption in either number shows as a wildly wrong availability.
3. **No correction mechanism**: If counts drift due to any bug, there's no way to "reset to known-good" without manually patching the DB.
4. **Memory of the plan says this is intentional**, but the `getDailySummary` query in 3k already answers "how many today?" via the log — making the running counts less useful than a daily-resettable counter would be.

**Recommendation:** Add an optional `lastResetAt` timestamp + `resetCounts()` admin mutation to `productionCounts`. The default behavior stays as carry-over, but managers can reset to zero when starting a new production cycle or after a physical inventory count. This costs 1 field + 1 mutation and removes a significant operational risk. The availability derivation (`stickered - packed`) remains correct either way.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add `locationId` to batch consumption helpers | High | Low |
| 2 | Specify auth roles for new kitchen mutations | Medium | Low |
| 3 | Add explicit "what happens to old kitchen mutations?" cleanup | Medium | Low |

**Details:**

### Improvement 1: Add locationId to batch consumption

The plan's `consumePackagingBatch(ctx, { menuProductId, quantity, stage })` helper doesn't specify which `storageLocations` to consume from. The existing FIFO system requires a `locationId` parameter (`consumeFromFIFO(ctx, componentTypeId, locationId, quantity)`).

The existing `consumeMaterialsByStageInternal` gets `locationId` from `orderComponentReservations`. The new batch helper has no reservation to reference — it needs to resolve a default location (e.g., `getDefaultLocation(ctx)` already exists at line 120 of `inventoryIntegration.ts`).

**Recommendation:** Add `locationId?: Id<"storageLocations">` as optional parameter to `consumePackagingBatch()`, defaulting to the result of `getDefaultLocation(ctx)`. Document that batch consumption always uses the default (Office) location. This matches the existing pattern.

### Improvement 2: Specify auth roles for new kitchen mutations

The plan specifies `{ token, menuProductId, quantity }` for `boxProducts` etc., but doesn't explicitly state which roles can call them. Looking at the existing code:
- `addBallsToTray` has NO auth check at all
- Kitchen view checks `hasPermission('canEditKitchen')` on the frontend

For the new mutations that modify inventory (FIFO consumption, production counts), backend auth is important.

**Recommendation:** Add `requireRole(ctx, args.token, ["kitchen", "manager", "admin"])` to all 4 new mutations (boxProducts, stickerProducts, togglePackOrderLineItem, markOrderReady). Add `requireRole(ctx, args.token, ["manager", "admin"])` to `productionTargets.upsert()`. This matches the plan's note "kitchen sees, manager edits" for targets.

### Improvement 3: Specify cleanup of old kitchen mutations

The plan rewrites `KitchenViewV2.tsx` and adds 4 new mutations to `kitchen.ts`. But the existing mutations in that file (`addBallsToTray`, `fillPendingOrders`, `removeBallFromTray`) and in `packaging.ts` (`markPackagePacked`, `completePackaging`, etc.) are not explicitly deprecated or removed.

Will the new `boxProducts` mutation coexist with `addBallsToTray`? The ball tray system (`kitchenInventory` table) is used by the existing V2 UI but the new design uses `productionCounts` instead. If both exist, there are two parallel inventory tracking systems.

**Recommendation:** Add a note to Wave 3 or Wave 4 specifying:
- `addBallsToTray`, `fillPendingOrders`, `removeBallFromTray` are **kept** (still used for ball tray input in Page 1)
- `fillPackage`, `unfillPackage`, `markPackagePacked`, `unmarkPackagePacked`, `completePackaging` in `packaging.ts` are **deprecated** (replaced by `togglePackOrderLineItem` + `markOrderReady`)
- `revertToPackaging` is either kept or replaced

This prevents confusion during implementation about which mutations to import in the new UI.

---

## 4. Refinements (Minor Suggestions)

- **Rename `consumePackagingBatch` to `consumeBatchMaterials`** — "packaging" is ambiguous when the function also handles production-stage components like balls. "Batch" clarifies it's non-order-tied consumption.
- **Consider a compound index on `productionLog`**: `by_menu_product_timestamp: ["menuProductId", "timestamp"]` — the `getDailySummary` query filters by date AND groups by product. Without this index, it does a full table scan + filter.
- **`productionCounts.getAvailable` for uncreated product returns `{ boxed:0, ... }`** — the test spec says this (test row "getAvailable for new product"), but the plan doesn't explicitly say the query should handle missing records. Add a note that `getAll()` should create missing records or return defaults.
- **The `kitchenInventory` table field `originalBallCount`/`biteSizedBallCount` naming** — Wave 1-2 rename labels but don't rename the DB fields. This is fine (field semantics change documented), but a comment in schema.ts would help future developers.
- **Wave 4b says "predefined increment buttons `[+5] [+10] [+20] [+50]`" for production log** — the plan says "Circular SVG gauge (120px diameter)" which is a non-trivial SVG component. Consider using a simpler radial progress (CSS `conic-gradient`) to reduce scope if the SVG implementation takes too long.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `consumeFromFIFO()` | `convex/inventory/fifo.ts` | Core FIFO logic for batch consumption |
| `applyFIFOConsumption()` | `convex/inventory/fifo.ts` | Apply FIFO + create `componentTransactions` |
| `updateComponentStock()` | `convex/inventory/helpers.ts` | Update aggregated stock after consumption |
| `getDefaultLocation()` | `convex/orders/mutations/inventoryIntegration.ts:120` | Resolve default storage location |
| `calculatePackageStatus()` | `convex/orders/helpers.ts` | Pure helper for package status |
| `logAutoTransition()` | `convex/orders/helpers/statusTransitions.ts` | Audit log for status changes |
| `logOrderEvent()` | `convex/orders/helpers/statusTransitions.ts` | General order event logging |
| `BatchConfirmDialog.tsx` | `src/components/kitchen/BatchConfirmDialog.tsx` | Reuse for batch stickering dialog |
| `BallTrayCounter.tsx` | `src/components/kitchen/BallTrayCounter.tsx` | Reuse pattern for production log buttons |
| `LoadingCards` | `src/components/shared/` | Loading states |

### Potential Duplication Risks
- **`consumePackagingBatch()` vs `consumeMaterialsByStageInternal()`**: Both consume materials by stage. The new helper adds batch (non-order) mode. Consider whether they should share a common core or remain separate. The plan's approach (separate helper) is correct since the batch path has fundamentally different inputs (menuProductId vs orderId).
- **Ball tray input (Production Log page) reuses `addBallsToTray` existing mutation** — the plan doesn't explicitly state this but it's the natural choice. The new `boxProducts` mutation is for assembly, not ball production tracking.
- **Status transitions in `markOrderReady()`** — must use existing `logOrderEvent()` and follow the same pattern as `completePackaging()` which already does `Packaging -> WaitingShipment/WaitingPickup`.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 0: Refactoring | Good | Clean dependency ordering (0a first, then 0b+0c parallel). Low risk. |
| Wave 1: Ball fix | Good | Migration strategy with dual-mapping is solid. Sequential execution correct. |
| Wave 2: Frontend labels | Good | Parallelizable. Straightforward rename. |
| Wave 3: Schema + Mutations + Tests | Good (with caveats) | Test-driven gating is excellent. 5 internal gates enforce quality. See ordering issue below. |
| Wave 4: Frontend UI | Needs Adjustment | Sequential is correct but 9 tasks is very large for one agent. Consider parallel where possible. |
| Wave 5: Verification | Good | Standard verification + docs. |

**Ordering Issues:**
- **Wave 3f-3i (mutations) running IN PARALLEL with GATE C (writing tests)** is risky. If mutations are written before tests, there's no TDD benefit. If tests are written first, mutations can reference the test expectations. The plan says "IN PARALLEL" but TDD means tests-first. **Suggestion:** Write test shells (describe blocks + test names + setup) first, then implement mutations to make them pass. This is already somewhat implied but worth making explicit.

**Missing Phases:**
- No explicit **data migration plan** for existing orders when the new `productionCounts` table is deployed. Existing orders have `orderItems.packageStatus` and `packedPackageIndices` data. The new system uses `productionCounts.packed` instead. If any existing orders are mid-production, they'll have inconsistent state. Consider a migration task in Wave 3 that initializes `productionCounts` from existing `orderItems` data.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 0 | `react-ui-builder` | Frontend-only refactoring, type extraction |
| Wave 1 | `convex-backend` | Backend mutations + migration |
| Wave 2 | `react-ui-builder` | Frontend label updates |
| Wave 3a | `schema-architect` | Schema design requires index planning |
| Wave 3 GATE A | `tdd-test-architect` | Test specification writing |
| Wave 3b-3k | `convex-backend` | Core backend implementation |
| Wave 3 GATE C | `tdd-test-architect` | Test implementation |
| Wave 4a-4i | `react-ui-builder` | Full frontend implementation |
| Wave 5a-5c | `code-auditor` | Type check, build, manual QA |
| Wave 5d | `react-ui-builder` | Documentation updates |

**Note:** Wave 4 has 9 sequential tasks for `react-ui-builder`. Tasks 4a (swipe container) and 4i (CSS variables) could run before 4b-4e (panels), reducing the critical path. Task 4h (hooks) should also be early — panels depend on it.

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes: `feature/kitchen-redesign-v3` |
| Branch naming convention | Correct (`feature/` prefix) |
| Merge strategy documented | Implicit (follows CLAUDE.md) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 0 | 1 | refactor | Atomic: ball type extraction |
| Wave 1 | 1 | fix | Atomic: normalization fix |
| Wave 2 | 1 | refactor | Atomic: label rename |
| Wave 3 | 1 | feat | Large but cohesive: schema + mutations + tests |
| Wave 4 | 1 | feat | Large: full UI rewrite |
| Wave 5 | 1 | docs | Documentation updates |

### Recommended Commit Checkpoints
Already excellent — the plan has 10 checkpoints with 2 PAUSE points. The commit messages follow conventional commit style.

### Pre-Push Verification
- [x] Plan includes `npm run build` check (Wave 5a)
- [x] Plan includes `npm run type-check` (Wave 5a)
- [x] Plan includes test gates (TEST GATE 1 + TEST GATE 2)
- [x] Plan includes local testing before push (Wave 5b-5c)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Not documented but achievable via `git revert` on feature branch |
| Deployment order | Correct: backend (schema + mutations) before frontend |
| Data backup needed | Yes — migration 1a swaps `orderItemProduction` codes |
| Migration safety | Documented with two options (A: dual-mapping, B: brief maintenance) |

### Git Workflow Issues Found
- None significant. The 2-PAUSE strategy with `/compact` is smart for large plans.

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Wave 3a | `docs/SCHEMA.md` — 3 new tables |
| Wave 3 (mutations) | `docs/API_REFERENCE.md` — 4 new mutations + 6 new queries |
| Wave 5d | `docs/CHANGELOG.md` — complete kitchen V3 entry |
| Wave 5d | `docs/ROADMAP.md` — mark kitchen redesign complete |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-XX - Kitchen Production V3: Complete Redesign

**Complete kitchen production workflow redesign with batch processing, audit logging, and brand-themed mobile UI.**

### Breaking Changes
- `kitchenInventory.originalBallCount` now maps to Original (45g), `biteSizedBallCount` now maps to Jumbo (80g)
- "Bite-Sized" label renamed to "Jumbo" throughout UI

### New Features
- 4-tab swipeable kitchen interface (Production Log, Boxing, Stickering, Packing)
- Batch boxing/stickering with predefined increment buttons
- Per-order packing checklist with toggle rows
- Production targets with auto-calculation from confirmed orders + manager override
- Full production audit log (`productionLog` table)
- `consumptionStage` FIFO integration for batch operations
- Brand-derived station color palette (sage, amber, brown, terracotta)

### New Tables
- `productionTargets` — daily production goals per unit type
- `productionCounts` — running production tallies per menu product
- `productionLog` — audit trail for all production actions

### New Backend
- `boxProducts()`, `stickerProducts()`, `togglePackOrderLineItem()`, `markOrderReady()`
- `consumePackagingBatch()` helper for batch FIFO consumption
- Production summary, packing orders, and log queries

### Bug Fixes
- Ball type normalization: "original" → BIG_BALL (80g), "bite_sized" → MID_BALL (45g)
- Added "jumbo" alias for BIG_BALL
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Adequate

This is one of the most thorough test plans I've reviewed. 127 tests across 9 files with wave-gated execution is significantly above average.

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | Ball normalization (8) | convex-test | Planned |
| Backend | Ball distribution logic (15) | convex-test | Planned |
| Backend | Production targets CRUD (8) | convex-test | Planned |
| Backend | Production counts queries (12) | convex-test | Planned |
| Backend | Boxing mutation (22) | convex-test | Planned |
| Backend | Stickering mutation (20) | convex-test | Planned |
| Backend | Packing mutations (26) | convex-test | Planned |
| Backend | Production log queries (16) | convex-test | Planned |
| Frontend | Components | Manual | Planned (Wave 5b-5c) |
| Integration | Full production flow | Manual | Planned (Wave 5c) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `consumePackagingBatch()` unit tests | New helper is the bridge between batch operations and FIFO. If it has a bug, all 3 consumption stages break. | Add 5-8 tests to a `consumePackagingBatch.test.ts` covering: happy path, per-product override resolution, empty BOM, mixed stages, insufficient stock. Currently tested indirectly through boxing/stickering tests — but a direct test is safer. |
| 2 | Concurrent mutation safety | Two kitchen staff boxing the same product simultaneously could double-deduct. | At minimum, add a test showing two sequential `boxProducts()` calls both succeed with correct counts. Convex handles serialization, but verify the read-modify-write pattern is safe. |

### Test Execution Checkpoints
1. After Wave 1: `npm run test -- ballNormalization.test.ts` (8/8)
2. After Wave 3 (sub-gates A through E): Progressive test gates within the wave
3. After Wave 3: `npm run test` (127/127)
4. Before merge: `npm run test && npm run build`

### Regression Risk
- **Existing `ballDistribution.ts` tests** (`convex/orders/__tests__/statusTransitions.test.ts`) — may need updates if the normalization in `distributeBallsToOrders` changes behavior
- **Existing packaging mutations** (`packaging.ts`) — not deleted but no longer called by new UI. Existing tests should still pass.
- **Order status transition tests** — the new `markOrderReady()` adds a new path to `WaitingShipment/WaitingPickup`. Existing transition tests should be verified.

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [x] Negative quantity undo (documented: boxing/stickering accept negative, validates against downstream counts)
- [x] Zero quantity (documented: test cases for zero quantity edge case)
- [x] FIFO exhaustion mid-batch (documented: "blocks if insufficient packaging")
- [ ] **Order cancelled mid-packing**: If order is cancelled after some line items are packed, `productionCounts.packed` must be decremented. The plan doesn't address cancellation of partially-packed orders.
- [ ] **Product deactivated mid-production**: If `menuProducts.isActive` is set to false while `productionCounts` has outstanding inventory, the boxing/stickering panels should still show it (filter by "has non-zero counts" not just "isActive").
- [ ] **Empty orders**: An order with only packaging products (no food items) — `markOrderReady()` should handle orders with zero production line items.
- [x] Per-product override (documented: `menuProductComponents.consumptionStage ?? componentTypes.consumptionStage`)
- [x] Carry-over persistence (documented: no daily reset)

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical #1**: Ensure `consumePackagingBatch()` resolves per-product `consumptionStage` override (plan already specifies this — verify existing code inconsistency is documented or fixed)
2. **Critical #2**: Add `resetCounts()` admin mutation + `lastResetAt` field to `productionCounts`, OR explicitly document why carry-over-forever is acceptable and what the correction mechanism is

**Recommended before implementation:**
1. Add `locationId` parameter to `consumePackagingBatch()` signature
2. Specify auth roles for all new mutations
3. Document which existing mutations are deprecated vs. kept

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

# Staff Review: Kitchen Production Page - Mobile-First Redesign + Ball Type Fix

**Date:** 2026-02-09
**Plan:** `C:\Users\Irfan\.claude\plans\vivid-swinging-feigenbaum.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST
=========================

[x] Git Workflow section exists?
  -> Branch name specified: feature/kitchen-mobile-redesign
  -> Checkpoint strategy defined: 4 checkpoints (one per wave)

[x] Implementation Waves section exists?
  -> Agents NOT assigned (generic tasks, no agent names)
  -> File paths specified: Yes, with line numbers
  -> PARALLEL/SEQUENTIAL marked: Yes

[x] Documentation Updates section exists?
  -> CHANGELOG.md checkbox: Yes

[x] Success Criteria section exists?
  -> Type check requirement: Yes
  -> Build requirement: Yes

=========================
```

**Status:** Plan structure validated. Minor gap: Wave tasks don't assign specific agents (convex-backend, react-ui-builder, etc.) per the CLAUDE.md template.

---

## 1. Summary

**Overall Assessment:** Revise

The plan is well-researched with thorough problem diagnosis and a sound strategy for the ball type data fix (remapping normalization layer without schema migration). However, it has **3 critical gaps**: (1) it misses 3 frontend files that contain hardcoded ball type references (`FlyingBall.tsx`, `ProductPackage.tsx`, `BallCompletionButtons.tsx` ball sizes), (2) the ball type normalization swap is logically backwards in one key area, creating a data corruption risk for existing orders, and (3) the testing plan is essentially absent. The UI redesign portion is well-conceived for mobile-first but could be more specific about desktop breakpoint behavior.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Missing frontend files with `ballType` references | Completeness | Wave 2 |
| 2 | Normalization swap creates data corruption risk for in-flight orders | Logic | Wave 1, Task 1a |
| 3 | No testing plan at all | Testing | Wave 4 |
| 4 | `componentTypes/seed.ts` not listed for update | Completeness | Wave 1 |

**Details:**

### Issue 1: Missing frontend files with `ballType` references

The plan lists 8 files in Wave 2 but **misses 3 files** that contain hardcoded `'original' | 'bite_sized'` ball type unions and display logic:

| Missed File | What needs changing |
|-------------|---------------------|
| `src/components/orders/FlyingBall.tsx:11-12,19` | `BALL_SIZES = { original: 24, bite_sized: 16 }` - sizes need swapping. Ball type union in interface. |
| `src/components/orders/ProductPackage.tsx:21,42-43,46` | `ballType: 'original' | 'bite_sized'` prop. Ball sizes `{ original: 20, bite_sized: 14 }`. `BallIcon` function type param. |
| `src/components/orders/BallCompletionButtons.tsx:69` | Label `'Bite-sized'` must become `'Jumbo'`. Ball sizes in `BallIcon` (line 38: `type === 'original' ? size : size * 0.7`). |

**Recommendation:** Add these 3 files to Wave 2. The ball size SVG dimensions need swapping (original should render smaller since it's now the 45g ball, bite_sized/jumbo should render larger since it's 80g).

### Issue 2: Normalization swap creates data corruption risk

The plan says in Wave 1a:
> Update `ballDistribution.ts` normalization: `"original"` -> `MID_BALL` (45g), `"bite_sized"` -> `BIG_BALL` (80g)

**The problem:** Existing `orderItemProduction` records already have `productionUnitCode: "BIG_BALL"` for orders created with `productionType: "original"`. If we swap the normalization layer, the `distributeBallsToOrders()` function will now try to match `"original"` type orders to `MID_BALL` production records, but those orders already have `BIG_BALL` records.

This means:
- **In-flight orders** (Confirmed/InProduction/Packaging) will stop receiving balls because the ball type won't match their production records
- The distribution algorithm filters by `productionUnitCode` (line 199 in ballDistribution.ts), so swapping the normalization means existing orders get orphaned

**Recommendation:** The plan needs a migration step that runs BEFORE the normalization swap:
1. Query all non-terminal orders
2. For each order's `orderItemProduction` records, swap `BIG_BALL` -> `MID_BALL` where the order item has `productionType: "original"` (and vice versa for `bite_sized`)
3. THEN apply the normalization swap

Alternatively, keep the normalization as-is and only change display labels (simpler but less correct long-term). The plan should explicitly address which approach and why.

### Issue 3: No testing plan

Wave 4 "Verification" only includes `npm run type-check`, `npm run build`, `npm run test`, and manual visual tests. There are:
- **Zero new tests planned** for the normalization swap (critical business logic)
- **Zero tests** for the new UI components (`BallInventoryBar`, `KanbanSection`)
- **No regression tests** identified for the ball distribution algorithm change
- **No existing tests** in `tests/` directory related to kitchen or ball functionality

**Recommendation:** At minimum, add:
1. **Backend unit test** (convex-test): Test `distributeBallsToOrders()` with the new normalization mapping. Verify `"original"` type orders receive `MID_BALL` balls correctly.
2. **Backend unit test**: Test `addBallsToTray({ ballType: "original" })` increments the correct field, and `addBallsToTray({ ballType: "jumbo" })` increments the other.
3. **Manual test checklist**: Create a step-by-step QA plan for the kitchen flow (add balls -> fill orders -> mark boxed -> sticker -> ship).

### Issue 4: `componentTypes/seed.ts` not listed

The `componentTypes/seed.ts` file (lines 24-48) has hardcoded `BIG_BALL` -> "Big Ball" (80g) and `MID_BALL` -> "Mid Ball" (45g) names. If the plan updates `productionUnitTypes/mutations.ts` seed names (1f), it should also update the componentTypes seed for consistency.

**Recommendation:** Add `convex/componentTypes/seed.ts` to Wave 1 with task to rename "Big Ball" -> "Jumbo Ball" and "Mid Ball" -> "Original Ball" in the seed data.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Assign specific agents to each wave task | Medium | Low |
| 2 | Add desktop layout specification for Wave 3 | Medium | Low |
| 3 | Consider keeping `KanbanColumn` for desktop, `KanbanSection` for mobile | Medium | Medium |
| 4 | Add commit message templates per checkpoint | Low | Low |

**Details:**

### Improvement 1: Assign specific agents per CLAUDE.md template

The plan's wave tables have `#` and `Task` and `Files` columns but are missing the `Agent` column required by CLAUDE.md planning template. Each task should specify `convex-backend` or `react-ui-builder` or `code-auditor`.

### Improvement 2: Desktop layout specification

The plan says "On larger screens (md+): Ball inventory stays as top bar. Kanban sections can optionally display cards in a 2-col grid within each section." This is vague. Consider:
- **md (768px):** 2-column card grid within each section
- **lg (1024px):** 3-column card grid, or revert to original 3-column kanban layout
- **xl (1280px):** Same as lg, potentially with materials sidebar

### Improvement 3: Consider responsive component strategy

Rather than creating new `KanbanSection` to replace `KanbanColumn`, consider making `KanbanColumn` responsive. On mobile it renders as a full-width section; on desktop it renders as a column. This avoids maintaining two similar components and reduces the risk of divergent behavior.

### Improvement 4: Commit message templates

Add suggested commit messages at each checkpoint:
1. `fix: correct ball type normalization mapping (original=45g, jumbo=80g)`
2. `refactor: rename bite-sized ball labels to jumbo across frontend`
3. `feat: mobile-first kitchen production layout with ball inventory bar`
4. `docs: update changelog and schema docs for kitchen redesign`

---

## 4. Refinements (Minor Suggestions)

- The `DailySummaryWidget` is not mentioned in the redesign - should it remain, move, or be removed on mobile?
- The `PackagingStockItem` sidebar content is mentioned as "moves to collapsible section at bottom or removed from mobile" - pick one and be specific
- Wave 3e says remove "Each package needs: N balls" from PackageCounter - this is useful context for kitchen staff. Consider keeping it but smaller (`text-xs`) rather than removing entirely
- The type scale table could include a note about the 280px minimum width requirement from CODE_STYLE.md

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `cn()` utility | `src/lib/utils.ts` | Already referenced in plan |
| `BallTrayCounter` component | `src/components/kitchen/BallTrayCounter.tsx` | Refactor for `BallInventoryBar` rather than creating from scratch |
| `KanbanColumn` component | `src/components/kitchen/KanbanColumn.tsx` | Make responsive rather than creating new `KanbanSection` |
| `Collapsible` from shadcn/ui | `src/components/ui/collapsible.tsx` | Use for collapsible sections in `BallInventoryBar` |
| `ChevronDown`/`ChevronUp` | lucide-react | Already referenced |

### Potential Duplication Risks
- Creating `BallInventoryBar.tsx` when `BallTrayCounter.tsx` already has most of the logic. Consider composing `BallInventoryBar` from two `BallTrayCounter` instances with a wrapper, rather than rewriting the ball display logic.
- Creating `KanbanSection.tsx` that is essentially `KanbanColumn.tsx` with different CSS. Consider making the existing component responsive.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Backend ball type fix | Needs Adjustment | Missing migration step for in-flight orders. Missing `componentTypes/seed.ts`. |
| Wave 2: Frontend labels | Needs Adjustment | Missing 3 files (`FlyingBall`, `ProductPackage`, `BallCompletionButtons` ball sizes). |
| Wave 3: Mobile UI redesign | Good | Well-structured. Desktop spec could be more precise. |
| Wave 4: Verification | Needs Adjustment | No actual test writing planned. Only build verification. |

**Ordering Issues:**
- Wave 1 should include a data migration sub-step (1h) that runs AFTER the seed updates but BEFORE deploying the normalization swap to production.

**Missing Phases:**
- Add a **Wave 1.5: Data Migration** step between Wave 1 and Wave 2 to handle existing in-flight order production records.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 1: Backend ball fix | `convex-backend` | Schema-adjacent changes, mutations, queries |
| Wave 2: Frontend labels | `react-ui-builder` | UI component text/prop changes |
| Wave 3: Mobile redesign | `react-ui-builder` | New components, layout rewrite |
| Wave 4: Verification | `code-auditor` + Bash | Type checking + pattern compliance |
| Testing (new) | `tdd-test-architect` | Write backend integration tests for normalization |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes: `feature/kitchen-mobile-redesign` |
| Branch naming convention | Correct |
| Merge strategy documented | No (implicit via CLAUDE.md) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 1 | 1 | fix | Backend ball type normalization fix |
| Wave 2 | 1 | refactor | Frontend label rename |
| Wave 3 | 1-2 | feat | New mobile layout |
| Wave 4 | 1 | docs | Documentation updates |

### Recommended Commit Checkpoints
1. After Wave 1: `fix: correct ball type normalization (original=45g MID_BALL, bite_sized=80g BIG_BALL)`
2. After Wave 2: `refactor: rename bite-sized ball labels to jumbo across kitchen and order components`
3. After Wave 3: `feat: mobile-first kitchen production layout with sticky ball inventory bar`
4. After Wave 4: `docs: update CHANGELOG, SCHEMA, and API_REFERENCE for kitchen redesign`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [ ] Plan does NOT include local testing before push (no manual test plan)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Missing - should document that reverting the branch revert the normalization |
| Deployment order | Needs adjustment - migration must run before normalization swap goes live |
| Data backup needed | Yes - `kitchenInventory` and `orderItemProduction` should be backed up before migration |
| Migration safety | Review needed - in-flight order production records at risk |

### Git Workflow Issues Found
- No explicit `git switch -c feature/kitchen-mobile-redesign` step at the start
- No rollback strategy documented
- Missing deployment order consideration (migration before code swap)

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Wave 1 | `docs/SCHEMA.md` - update kitchenInventory field semantics |
| Wave 1 | `docs/API_REFERENCE.md` - document `"jumbo"` ball type alias |
| Wave 4 | `docs/CHANGELOG.md` - full entry |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-09 - Kitchen Mobile Redesign + Ball Type Fix

**Mobile-first kitchen production page and corrected ball type data model.**

### Ball Type Fix
- Fixed ball type normalization: "Original" now correctly maps to 45g ball (MID_BALL), "Jumbo" maps to 80g ball (BIG_BALL)
- Renamed "Bite-Sized Balls" to "Jumbo Balls" across all UI components
- Added "jumbo" as accepted ball type alias in kitchen mutations
- Updated production unit type and menu product seed data

### Kitchen UI Redesign
- Redesigned kitchen page for mobile-first (phone is primary device)
- Replaced 3-column kanban with full-width stacked sections
- Added sticky ball inventory bar (visible on all screen sizes)
- Streamlined typography with consistent type scale
- All touch targets minimum 44x44px

**Files Modified:**
- `convex/orders/helpers/ballDistribution.ts` - Normalization mapping
- `convex/orders/mutations/kitchen.ts` - Ball type unions
- `convex/orders/queries.ts` - Kitchen stats calculation
- `src/pages/KitchenViewV2.tsx` - Main layout rewrite
- `src/components/kitchen/*` - All kitchen components redesigned
- `src/components/orders/*` - Ball type label updates
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | Ball normalization mapping | convex-test | **Missing** |
| Backend | addBallsToTray / removeBallFromTray | convex-test | **Missing** |
| Backend | calculateOldSystemBallStats swap | convex-test | **Missing** |
| Frontend | BallInventoryBar rendering | Vitest + RTL | **Missing** |
| Frontend | KanbanSection rendering | Vitest + RTL | **Missing** |
| Integration | Full kitchen flow (add balls -> fill -> box -> sticker -> ship) | Manual | **Missing** |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Ball type normalization mapping | Core business logic change - wrong mapping means orders get wrong ball type | convex-test: create order with "original" type, verify it generates MID_BALL production records |
| 2 | Kitchen tray mutation with "jumbo" alias | New API parameter must work correctly | convex-test: call addBallsToTray({ ballType: "jumbo" }), verify biteSizedBallCount increments |
| 3 | `calculateOldSystemBallStats` swap | Incorrect stats means kitchen displays wrong ball demand | convex-test: create order items with both types, verify correct big/mid ball counts |
| 4 | Manual kitchen flow regression | No automated E2E tests exist for kitchen | Write a manual test checklist (add balls, fill packages, transition through statuses) |

### Test Execution Checkpoints
1. After Wave 1 backend: `npm run test` (existing tests + new normalization tests)
2. After Wave 3 frontend: `npm run test` (all tests pass with new components)
3. Before merge: `npm run test && npm run build`

### Regression Risk
- `convex/orders/helpers/ballDistribution.ts` is used by both `completeBalls` and `addBallsToTray` mutations. Changing the normalization affects ALL ball distribution operations.
- `calculateOldSystemBallStats` is used in `getKitchenOrders` query. Swapping the mapping changes what every kitchen view client sees.
- Existing `orderItemProduction` records reference `BIG_BALL`/`MID_BALL` codes. The migration must handle these or distribution breaks.

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] **In-flight orders with existing production records** - Orders currently in Confirmed/InProduction/Packaging that have `productionUnitCode: "BIG_BALL"` for `productionType: "original"` items. After the swap, ball distribution won't match them.
- [ ] **Kitchen inventory carryover** - If `kitchenInventory` has balls from yesterday (unlikely since it resets daily, but edge case), the count semantics change mid-day.
- [ ] **Empty kitchen inventory state** - First load after deployment, no `kitchenInventory` record exists yet. The `getOrCreateTodayInventory` function must work with the new ball type mapping.
- [ ] **Concurrent kitchen users** - Multiple phones adding balls simultaneously. Convex handles this transactionally, but verify no race conditions in the new code.
- [ ] **V1 KitchenView still used?** - If V1 (`KitchenView.tsx`) is still accessible, it must be updated. If deprecated, consider removing it to reduce maintenance.

---

## 12. Approval Conditions

**For Approval, address:**
1. Add missing frontend files to Wave 2 (`FlyingBall.tsx`, `ProductPackage.tsx`, `BallCompletionButtons.tsx` ball sizes)
2. Add data migration step for in-flight order production records (or document why it's not needed)
3. Add at least 2-3 backend tests for the normalization swap
4. Add `componentTypes/seed.ts` to Wave 1

**Recommended before implementation:**
1. Assign specific agents (convex-backend, react-ui-builder) to each wave task
2. Add commit message templates per checkpoint
3. Specify desktop breakpoint behavior in Wave 3
4. Add manual test checklist for kitchen flow regression

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

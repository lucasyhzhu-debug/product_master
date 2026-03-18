# Staff Review: Phase 63 -- Interactive Visual Expense Tutorials

**Date:** 2026-03-17
**Plans:** `.planning/phases/63-interactive-visual-expense-tutorials/63-01-PLAN.md`, `63-02-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST
=========================

[x] Git Workflow section exists?
  -> Branch name specified: feature/63-interactive-visual-expense-tutorials
  -> Checkpoint strategy defined: Plan 01 autonomous, Plan 02 has Task 3 human checkpoint

[x] Implementation Waves section exists?
  -> Agents assigned? No (autonomous execution, not multi-agent)
  -> File paths specified? Yes, per task
  -> PARALLEL/SEQUENTIAL marked? Yes

[x] Documentation Updates section exists?
  -> CHANGELOG.md checkbox? Yes (Plan 02 Task 2)

[x] Success Criteria section exists?
  -> Type check requirement? Yes
  -> Build requirement? Yes (Plan 02)

=========================
```

Plan structure validated. All 4 mandatory sections present in both plans.

---

## 1. Summary

**Overall Assessment:** Approve

These are exceptionally well-prepared plans. The research document is thorough, pitfalls are pre-identified, existing codebase patterns are referenced with file locations, and the locked decisions are clearly separated from implementation discretion. The 2-plan split (generic engine first, then workflow content + integration) is sound. The only notable concerns are around testing coverage (frontend component tests are absent) and a minor ARIA semantics issue. The plans are ready for implementation with the issues noted below addressed.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | No unit tests for WalkthroughPlayer or MockElements components | Testing | Plan 01, both tasks |
| 2 | `getBreadcrumb` hardcodes workflow IDs, breaking generic reusability | Logic/Architecture | Plan 01 Task 2 |

**Details:**

### Issue 1: No unit tests for WalkthroughPlayer or MockElements components

Plan 01 creates 2 significant new modules (11 mock element primitives and the WalkthroughPlayer engine) with zero test coverage. The only verification is `npm run type-check`. Plan 02 updates existing `helpGuides.test.ts` but adds no component-level tests for the new walkthrough infrastructure.

At minimum, the WalkthroughPlayer needs tests for:
- Renders correct number of tabs from workflows array
- Tab switching resets activeStep to 0
- Step click updates activeStep (free navigation)
- ArrowLeft/ArrowRight keyboard navigation with clamping at boundaries
- Renders tip/warning CalloutBox when step has those fields

MockElements could reasonably be deferred (visual-only components), but the WalkthroughPlayer has stateful logic that should be tested.

**Recommendation:** Add a `src/components/help/__tests__/WalkthroughPlayer.test.tsx` file with at least 5 tests covering the state management logic. Use `@testing-library/react` with `render` + `fireEvent`. This is the kind of component where a missed keyboard handler or state reset bug would be caught instantly by tests but require manual testing otherwise.

### Issue 2: `getBreadcrumb` hardcodes workflow IDs, breaking generic reusability

The `getBreadcrumb` helper inside `WalkthroughPlayer.tsx` has a `switch` statement matching `"submit"`, `"approve"`, `"reimburse"`. This embeds expense-specific knowledge into what is otherwise a fully generic, reusable component. The plan's own objective calls it a "generic reusable walkthrough engine."

```typescript
// This is expense-specific logic inside a generic component:
function getBreadcrumb(workflowId: string, step: number): string {
  switch (workflowId) {
    case "submit": return step === 0 ? "Financials > Expenses" : "...";
    case "approve": return "...";
    case "reimburse": return "...";
    default: return "";
  }
}
```

When a future Kitchen or Orders walkthrough is added, this function would need modification inside the "generic" player.

**Recommendation:** Move breadcrumb into the data model. Either:
- (a) Add `breadcrumb: string` or `breadcrumbs: string[]` to `WalkthroughStep` so each step declares its own breadcrumb, or
- (b) Add `getBreadcrumb: (step: number) => string` to `WalkthroughWorkflow` so the caller provides the mapping.

Option (b) is cleanest -- the workflow data in `ExpenseGuide.tsx` would include its own breadcrumb function, and `WalkthroughPlayer` stays truly generic with zero domain knowledge.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | ARIA role="listitem" on buttons is incorrect semantics | Medium | Low |
| 2 | Test assertion fragility in Plan 02 Task 2 "expense" search test | Medium | Low |
| 3 | Missing `npm run build` in Plan 01 success criteria | Low | Low |
| 4 | Deep link breakage for existing bookmarks not addressed | Medium | Low |

**Details:**

### Improvement 1: ARIA role="listitem" on buttons is incorrect semantics

Plan 01 Task 2 specifies the desktop step sidebar as `role="list"` with each step being a `<button>` with `role="listitem"`. This is semantically incorrect -- `role="listitem"` is for static content items, not interactive elements. A `<button>` inside a `role="list"` should not also have `role="listitem"` as it creates conflicting semantics.

**Recommendation:** Use either:
- `<nav aria-label="Steps">` with `<button>` elements (simplest, most correct), or
- `role="tablist"` with `role="tab"` if treating steps as sub-tabs (but this conflicts with the workflow tabs already using tablist).

The cleanest approach is a simple `<nav>` wrapper with buttons. Keep `aria-current="step"` on the active step button.

### Improvement 2: Test assertion fragility in Plan 02 "expense" search test

The updated test at line ~64-76 changes to `expect(results.length).toBeGreaterThan(3)`. After the section changes, the search for "expense" will match:
- 1 guide title ("Expenses & Reimbursement")
- 1 section title ("Expense Analytics")
- 2 FAQ questions containing "expense" ("submit an expense", "Who can approve expenses?")

That is exactly 4 results, making `toBeGreaterThan(3)` pass by only 1. If a FAQ question is reworded in the future, this test breaks silently.

**Recommendation:** Be explicit: `expect(results.length).toBe(4)` or at least add a comment explaining the exact expected count. Better yet, assert the specific types: `expect(results.filter(r => r.type === "guide")).toHaveLength(1)`, `expect(results.filter(r => r.type === "section")).toHaveLength(1)`, etc.

### Improvement 3: Missing `npm run build` in Plan 01 success criteria

Plan 01 only specifies `npm run type-check` as its verification gate. While Plan 02 runs `npm run build`, the foundation components in Plan 01 should also pass build to catch JSX runtime issues, unused import warnings, and tree-shaking problems early.

**Recommendation:** Add `npm run build` to Plan 01's verification section alongside `npm run type-check`.

### Improvement 4: Deep link breakage for existing bookmarks not addressed

Users who bookmarked `/help/expenses#submitting`, `#approving`, or `#reimbursement` will get a broken scroll target. The plan changes anchors to `#walkthrough` but does not mention backward compatibility.

**Recommendation:** Either (a) add hidden anchor elements `<div id="submitting" />`, `<div id="approving" />`, `<div id="reimbursement" />` that scroll to the walkthrough section, or (b) document this as an intentional breaking change in the CHANGELOG entry. Given this is an internal app, option (b) is likely sufficient.

---

## 4. Refinements (Minor Suggestions)

- Plan 01 Task 1: Consider making `MockRow` accept a `cols` prop (default 2) for flexibility, since the Reimburse workflow might benefit from 3-column layouts in future.
- Plan 02 Task 1: The `SubmitExpenseMock` step 1 packs 6 form fields into one view. On mobile mock panels, this may look cramped. Consider responsive stacking within the mock itself.
- Plan 02 Task 2 documentation updates: Updating 5 doc files in a single task risks creating a very large commit. Consider splitting docs into a separate commit for cleaner git history.
- The `HIGHLIGHT_CLASSES` constant includes `dark:border-indigo-400` which is identical to the light mode `border-indigo-400`. This is harmless but redundant -- could simplify to just `border-indigo-400` without the `dark:` prefix for the border (only the shadow differs).
- Plan 02 Task 1: Consider adding `aria-label` to MockFrame's title bar for screen reader context (e.g., `aria-label="Mock application showing: ${breadcrumb}"`).

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `cn()` utility | `src/lib/utils.ts` | Conditional class merging in all mock elements |
| `CalloutBox` | `src/components/help/CalloutBox.tsx` | Tip/warning rendering in WalkthroughPlayer annotations |
| `GuideSection` | `src/components/help/GuideSection.tsx` | Wrapper for the walkthrough section in ExpenseGuide |
| `GuideLayout` | `src/components/help/GuideLayout.tsx` | MobileTabs pattern (horizontal scroll pills) as reference |
| AnimatePresence pattern | `src/components/k3martCockpit/OutletCardGrid.tsx` | Reference for mode="wait" crossfade implementation |
| `FaqAccordion` | `src/components/help/FaqAccordion.tsx` | Unchanged, used for migrated FAQ items |

### Potential Duplication Risks
- The mobile pill bar in WalkthroughPlayer is very similar to the `MobileTabs` pattern in `GuideLayout.tsx`. Not a concern since the data models differ (sections vs steps), but worth noting for potential extraction into a shared `PillBar` component in the future.
- `MockButton` variants (primary/ghost/destructive) are styled similarly to shadcn Button variants. This is intentional per locked decisions (decoupled mocks), not accidental duplication.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Plan 01 Wave 1 (Foundation) | Good | Types before components, components before barrel -- correct order |
| Plan 01 Wave 2 (Verification) | Good | Type-check only; see Improvement 3 about adding build |
| Plan 02 Wave 1 (Mock Workflows) | Good | 3 mocks + barrel update, correctly depends on Plan 01 |
| Plan 02 Wave 2 (Integration + Docs) | Needs Adjustment | Bundles too much: ExpenseGuide rewrite + registry + tests + 5 doc files in one task |
| Plan 02 Wave 3 (Verification) | Good | Human visual checkpoint is appropriate |

**Ordering Issues:**
- None -- Plan 01 -> Plan 02 dependency is correct. Within each plan, task ordering is sound.

**Missing Phases:**
- Consider adding a small verification step between Plan 02 Task 1 and Task 2 to run `npm run type-check` on the mock components before proceeding to integration. The plan does have `<verify>` tags per task, which addresses this.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Plan 01 (Foundation) | `react-ui-builder` | Pure frontend component creation |
| Plan 02 Task 1 (Mock workflows) | `react-ui-builder` | More frontend components |
| Plan 02 Task 2 (Integration) | `react-ui-builder` | ExpenseGuide JSX rewrite + registry updates |
| Plan 02 Task 2 (Docs) | `react-ui-builder` or manual | Documentation updates are straightforward |
| Plan 02 Task 3 (Visual) | Human | Manual visual verification |
| Post-implementation | `code-auditor` | Verify type-check, build, test suite, pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes: `feature/63-interactive-visual-expense-tutorials` |
| Branch naming convention | Correct (follows `feature/{name}` pattern) |
| Merge strategy documented | Implicit (merge after visual verification in Plan 02 Task 3) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Plan 01 Task 1 | 1 | feat | Types + MockElements (atomic) |
| Plan 01 Task 2 | 1 | feat | WalkthroughPlayer + barrels (atomic) |
| Plan 02 Task 1 | 1 | feat | 3 mock workflow components (atomic) |
| Plan 02 Task 2 | 1-2 | feat + docs | Integration + docs (could split docs) |

### Recommended Commit Checkpoints
1. After Plan 01 Task 1: `feat(63-01): add walkthrough types and 11 mock element primitives`
2. After Plan 01 Task 2: `feat(63-01): add WalkthroughPlayer engine and barrel exports`
3. After Plan 02 Task 1: `feat(63-02): add Submit, Approve, Reimburse mock components`
4. After Plan 02 Task 2 code: `feat(63-02): integrate WalkthroughPlayer into ExpenseGuide`
5. After Plan 02 Task 2 docs: `docs(63): update help center spec, brand ref, code style, CLAUDE.md, CHANGELOG`

### Pre-Push Verification
- [x] Plan includes `npm run type-check` (Plan 01)
- [x] Plan includes `npm run build` verification (Plan 02)
- [x] Plan includes test run (Plan 02: `npm run test`)
- [ ] Plan does NOT include `npm run build` in Plan 01 (see Improvement 3)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Not documented, but safe (frontend-only, no schema changes) |
| Deployment order | N/A (no backend changes) |
| Data backup needed | No |
| Migration safety | N/A |

### Git Workflow Issues Found
- Plan 01 is marked `autonomous: true` with `Checkpoints: None`. This means no human review between Plan 01 and Plan 02. Acceptable given Plan 01 is purely types and visual components with no side effects.

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Plan 02 Task 2 | docs/superpowers/specs/2026-03-16-help-center-design.md |
| Plan 02 Task 2 | docs/UI_BRAND_REFERENCE.md |
| Plan 02 Task 2 | docs/CODE_STYLE.md |
| Plan 02 Task 2 | CLAUDE.md |
| Plan 02 Task 2 | docs/CHANGELOG.md |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-03-17 -- Phase 63: Interactive Visual Expense Tutorials

**Replace text-heavy expense guide sections with click-through visual walkthroughs.**

- Added generic `WalkthroughPlayer` component (tabs, step list, mock viewport, keyboard nav, AnimatePresence crossfade)
- Added 11 mock UI primitives (`MockFrame`, `MockInput`, `MockSelect`, `MockButton`, `MockTable`, etc.) with indigo highlight styling
- Added 3 workflow-specific mock components: Submit (4 steps), Approve (3 steps), Reimburse (6 steps)
- Consolidated ExpenseGuide from 8 sections to 6 (submit/approve/reimburse merged into Interactive Walkthroughs)
- Migrated 2 FAQ items to Submission group, guide read time reduced 15 -> 10 minutes
- Full ARIA accessibility: tablist, aria-selected, aria-current=step, aria-live=polite

**Files Added:**
- `src/components/help/walkthrough/types.ts`
- `src/components/help/walkthrough/MockElements.tsx`
- `src/components/help/walkthrough/SubmitMocks.tsx`
- `src/components/help/walkthrough/ApproveMocks.tsx`
- `src/components/help/walkthrough/ReimburseMocks.tsx`
- `src/components/help/walkthrough/index.ts`
- `src/components/help/WalkthroughPlayer.tsx`

**Files Modified:**
- `src/components/help/index.ts`
- `src/pages/guides/ExpenseGuide.tsx`
- `src/lib/helpGuides.ts`
- `src/lib/__tests__/helpGuides.test.ts`
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Insufficient

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | N/A (frontend-only phase) | N/A | N/A |
| Frontend (helpGuides) | Registry section count, search results, anchors | Vitest unit | Planned (update existing) |
| Frontend (WalkthroughPlayer) | Component rendering, state, interaction | Vitest + RTL | Missing |
| Frontend (MockElements) | 11 primitives render correctly | Vitest + RTL | Missing |
| Integration | Visual rendering, responsive, dark mode | Manual (Task 3) | Planned |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | WalkthroughPlayer tab switching resets step to 0 | State management bug would break UX | Vitest + RTL: render with 2 workflows, click tab, assert step resets |
| 2 | WalkthroughPlayer keyboard nav clamps at boundaries | Off-by-one bug on ArrowLeft at step 0 or ArrowRight at max | Vitest + RTL: fireEvent.keyDown, assert step stays clamped |
| 3 | WalkthroughPlayer renders tip/warning CalloutBox | Conditional rendering logic | Vitest + RTL: render with step that has tip, assert CalloutBox appears |
| 4 | MockInput/MockSelect/MockButton highlight toggle | `cn()` conditional class application | Vitest + RTL: render with highlighted=true, assert HIGHLIGHT_CLASSES classes present |

### Test Execution Checkpoints
1. After Plan 01: `npm run type-check` (planned) -- should also run `npm run build`
2. After Plan 02 Task 1: `npm run type-check` (planned)
3. After Plan 02 Task 2: `npm run test && npm run build` (planned)
4. Before merge: Full `npm run test && npm run build` (planned)

### Regression Risk
- `src/lib/__tests__/helpGuides.test.ts` -- 4 tests require updates (plan addresses this)
- No other existing tests should be affected (no backend changes, no shared component modifications)
- ExpenseGuide import structure changes could affect tree-shaking; build verification catches this

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] WalkthroughPlayer with empty `workflows` array (should render nothing or fallback)
- [ ] WalkthroughPlayer with a workflow that has zero steps (should handle gracefully)
- [ ] `defaultWorkflow` prop pointing to a non-existent workflow ID (should fallback to first)
- [ ] Mobile mock panels with long content overflowing the viewport width
- [ ] AnimatePresence key collision if two workflows share the same step count and user clicks between them at step 0 (composite key `${workflowId}-0` handles this -- confirmed correct)
- [ ] Keyboard navigation when WalkthroughPlayer container is not focused (should not intercept page-level arrow keys)

---

## 12. Approval Conditions

**For Approval, address:**
1. Critical Issue 1: Add at least 3-5 unit tests for WalkthroughPlayer state management logic
2. Critical Issue 2: Move `getBreadcrumb` logic out of the generic WalkthroughPlayer into the workflow data model

**Recommended before implementation:**
1. Improvement 1: Fix ARIA `role="listitem"` on interactive buttons
2. Improvement 3: Add `npm run build` to Plan 01 verification
3. Improvement 4: Document deep link breakage in CHANGELOG or add redirect anchors

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

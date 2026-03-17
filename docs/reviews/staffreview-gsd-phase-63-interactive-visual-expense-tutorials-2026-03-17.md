# Triple Review: Phase 63 -- Interactive Visual Expense Tutorials (Post-Implementation)

**Date:** 2026-03-17
**Branch:** `gsd/phase-63-interactive-visual-expense-tutorials`
**Base:** `origin/main` (7f888d3)
**Head:** `72e5ed4`
**Reviewers:** requirements-reviewer, code-quality-reviewer, staffreview

---

## 1. Summary

Phase 63 is a frontend-only phase that replaces 3 text-heavy expense guide sections with interactive click-through walkthroughs. The implementation is clean, well-structured, and follows the plan closely. All 10 VWT requirements are implemented. Tests pass (8 WalkthroughPlayer + 14 helpGuides), type-check clean, build succeeds. The prior staffreview's two critical issues (missing tests, hardcoded getBreadcrumb) were both resolved. Five documentation files updated.

**Verdict:** Approve with minor fixes recommended.

---

## 2. Critical Issues (0)

None. No bugs, missing auth, plan violations, or incorrect calculations found.

---

## 3. Important Issues (2)

### I1. Hardcoded highlight classes in ApproveMocks and ReimburseMocks (Code Quality)

**Flagged by:** code-quality-reviewer

`ApproveMocks.tsx` and `ReimburseMocks.tsx` hardcode `border-2 border-indigo-400 shadow-[...]` directly in JSX class strings instead of using the `HIGHLIGHT_CLASSES` constant from `MockElements.tsx`. This creates:

1. **Inconsistency** -- The hardcoded shadows are incomplete (missing `0_0_12px` blur and dark mode variant).
   - `HIGHLIGHT_CLASSES`: `shadow-[0_0_0_4px_rgba(99,102,241,0.15),0_0_12px_rgba(99,102,241,0.08)] dark:shadow-[...]`
   - `ApproveMocks:49`: `shadow-[0_0_0_4px_rgba(99,102,241,0.15)]` only
   - `ApproveMocks:22`: No shadow at all
   - `ReimburseMocks:29,36,96,127`: `shadow-[0_0_0_4px_rgba(99,102,241,0.15)]` only
2. **Maintenance risk** -- If highlight styling changes, these hardcoded values will diverge.
3. **Violates plan instruction** -- Plan 02 states "use the existing `HIGHLIGHT_CLASSES` constant for highlight styling."

**Locations:**
- `src/components/help/walkthrough/ApproveMocks.tsx` lines 22, 49
- `src/components/help/walkthrough/ReimburseMocks.tsx` lines 29, 36, 96, 127

**Fix:** Import `HIGHLIGHT_CLASSES` from `./MockElements` and use `cn()` to merge with other classes. For elements that need both structural classes and highlight, use `cn("rounded-lg border p-4", HIGHLIGHT_CLASSES)`.

### I2. Incomplete ARIA tab pattern -- missing tabpanel, aria-controls, aria-labelledby (Code Quality + Accessibility)

**Flagged by:** requirements-reviewer, code-quality-reviewer

The WalkthroughPlayer uses `role="tablist"` and `role="tab"` with `aria-selected` on the workflow tabs, but does not implement the full ARIA tabs pattern:
- No `role="tabpanel"` on the content area
- No `aria-controls` on tab buttons linking to the panel
- No `aria-labelledby` on the panel linking back to its tab
- No `id` attributes on tabs or panels for the linkage

While the current implementation works visually, incomplete ARIA tab patterns can confuse screen readers that expect the full contract. Given VWT-09 explicitly requires ARIA attributes, this is worth completing.

**Location:** `src/components/help/WalkthroughPlayer.tsx` lines 58-78 (tabs) and 129-148 (content area)

**Fix:** Add `id={`tab-${w.id}`}` and `aria-controls={`panel-${activeWorkflowId}`}` to each tab button. Add `id={`panel-${activeWorkflowId}`}`, `role="tabpanel"`, and `aria-labelledby={`tab-${activeWorkflowId}`}` to the content container.

---

## 4. Minor Issues (3)

### M1. Dual aria-live="polite" regions may cause screen reader verbosity

**Flagged by:** code-quality-reviewer

Both the mock panel viewport (line 131) and annotation area (line 152) have `aria-live="polite"`. When a step changes, both regions update simultaneously, causing screen readers to announce both changes. This could be noisy.

**Recommendation:** Keep `aria-live="polite"` only on the annotation area (which contains the meaningful text) and remove it from the mock panel viewport (which is primarily visual).

### M2. WalkthroughPlayer returns null before the early return guard

**Flagged by:** code-quality-reviewer

Line 53: `if (!activeWorkflow || workflows.length === 0) return null;` -- This early return is after the `useEffect` hook, which is correct for hook ordering. However, if `workflows` is empty, the `useEffect` still registers a keyboard handler on a component that renders nothing. Harmless but wasteful.

**Recommendation:** No code change needed; this is a minor inefficiency that does not affect behavior.

### M3. VWT-09 requirement text references "list/listitem" but implementation uses correct nav+buttons

**Flagged by:** requirements-reviewer

REQUIREMENTS.md VWT-09 text says "ARIA attributes (tablist/tab, list/listitem, aria-current=step, aria-live=polite)" but the implementation correctly uses `<nav aria-label="Steps">` with plain buttons -- which was the fix recommended in the prior staffreview. The requirement text was not updated to reflect the corrected approach, though it is marked `[x]` complete.

**Recommendation:** Update VWT-09 requirement text to say "nav/buttons" instead of "list/listitem" so documentation stays accurate.

---

## 5. Nitpicks (3)

### N1. SubmitMocks imports MockRow but other mocks could benefit from it too

ApproveMocks uses raw `grid grid-cols-2 gap-2` (line 54) instead of `MockRow`. Consistency would improve if all grid layouts used the MockRow primitive.

### N2. ReimburseMocks uses raw `<input type="checkbox">` instead of a mock element

Line 62-66 in ReimburseMocks.tsx uses a real HTML checkbox. While this works since it is `readOnly`, it introduces a real interactive element inside what should be purely mock UI. Consider a styled div mimicking a checkbox for consistency.

### N3. Double `---` separator in UI_BRAND_REFERENCE.md

The diff shows two consecutive `---` separators where the old footer was removed and the new section was added. Harmless but looks odd in rendered markdown.

---

## 6. Plan Compliance Assessment

| Requirement | Status | Notes |
|-------------|--------|-------|
| VWT-01 | Complete | WalkthroughPlayer with tablist, free nav, tab switch resets step |
| VWT-02 | Complete | 11 mock primitives with HIGHLIGHT_CLASSES |
| VWT-03 | Complete | Submit 4 steps with form, receipt, action buttons |
| VWT-04 | Complete | Approve 3 steps with queue table, badges, actions |
| VWT-05 | Complete | Reimburse 6 steps through success checkmark |
| VWT-06 | Complete | 8 sections reduced to 6 |
| VWT-07 | Complete | 6 sections, readTimeMinutes=10, anchors to walkthrough |
| VWT-08 | Complete | 5 doc files updated |
| VWT-09 | Complete | AnimatePresence 150ms, keyboard nav, ARIA (nav+buttons, not list/listitem) |
| VWT-10 | Complete | Mobile pill bar, full-width mock, annotation below |

### Prior Review Issues Resolved
- Critical 1 (missing tests): Resolved -- 8 WalkthroughPlayer tests added
- Critical 2 (hardcoded getBreadcrumb): Resolved -- getBreadcrumb on workflow data model
- Improvement 1 (ARIA listitem): Resolved -- uses nav+buttons
- Improvement 2 (test fragility): Resolved -- explicit assertions
- Improvement 3 (build in Plan 01): Resolved (build runs in Plan 02)
- Improvement 4 (deep link breakage): Resolved -- hidden redirect anchors added

### Deleted Constants Verified
- SUBMITTING_FAQ: Deleted, 2 items migrated to FULL_FAQ Submission group
- DOA_NODES, DOA_EDGES: Deleted (were for approval workflow diagram)
- BATCH_NODES, BATCH_EDGES: Deleted (were for batch workflow diagram)
- No orphaned references found in codebase

---

## 7. Test Coverage Assessment

| Test File | Tests | Status |
|-----------|-------|--------|
| WalkthroughPlayer.test.tsx | 8 | All pass |
| helpGuides.test.ts | 14 | All pass |

**Coverage gaps:**
- No tests for MockElements primitives (visual-only, acceptable)
- No tests for SubmitMocks/ApproveMocks/ReimburseMocks (pure render components, acceptable)
- WalkthroughPlayer tests use mobile pills for navigation (JSDOM does not apply CSS media queries, so desktop sidebar buttons are also in DOM -- tests work but test via pills)

---

## 8. Consensus Issues (2+ reviewers)

| Issue | Reviewers | Resolution |
|-------|-----------|------------|
| I1. Hardcoded highlight classes | code-quality, staffreview | Use HIGHLIGHT_CLASSES constant |
| I2. Incomplete ARIA tab pattern | requirements, code-quality | Add tabpanel/aria-controls/aria-labelledby |

---

*Generated by /triple-review skill*
*requirements-reviewer + code-quality-reviewer + staffreview*

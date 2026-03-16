# Staff Review: Phase 55 — Help Center Infrastructure

**Date:** 2026-03-16
**Plans:** `.planning/phases/55-help-center-infrastructure/55-01-PLAN.md`, `55-02-PLAN.md`, `55-03-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST (across all 3 plans)
===============================================

[x] Git Workflow section exists?
  -> Branch name: feature/help-center-infrastructure  OK
  -> Checkpoint strategy: Plan 01/02 autonomous, Plan 03 human-verify  OK

[x] Implementation Waves section exists?
  -> Agents assigned  OK
  -> File paths specified  OK
  -> PARALLEL/SEQUENTIAL marked  OK

[x] Documentation Updates section exists?
  -> CHANGELOG.md checkbox  OK

[x] Success Criteria section exists?
  -> Type check requirement  OK
  -> Build requirement  OK

===============================================
```

Plan structure validated. All 4 mandatory sections are present in all 3 plans.

---

## 1. Summary

**Overall Assessment:** Revise

The plans are well-structured with clear separation of concerns (registry + simple components, complex components, integration). The architecture decision to keep Help Center entirely frontend with no Convex backend is correct for static documentation content. However, there are several issues that need attention: dark mode styling violates the project's CSS variable token convention documented in CODE_STYLE.md, the `isActive` check for `/help` will incorrectly match `/help/:guideId` routes, the testing plan is completely absent across all 3 plans, and one plan has a dependency ordering issue between 55-01 and 55-02 that claims they can run in parallel but 55-02 modifies the barrel export created by 55-01.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | No tests planned for any of the 3 plans | Testing | All plans |
| 2 | CalloutBox dark mode uses raw Tailwind `dark:` classes instead of CSS variable tokens | Pattern Violation | Plan 01, Task 2 |
| 3 | RoleTag dark mode uses raw Tailwind `dark:` classes instead of CSS variable tokens | Pattern Violation | Plan 01, Task 2 |
| 4 | `isActive('/help')` will match both `/help` and `/help/:guideId` routes | Logic Bug | Plan 03, Task 2 (Header) |
| 5 | Plan 55-02 barrel export update conflicts with Plan 55-01 barrel creation | Dependency | Plan 02, Task 2 |

**Details:**

### Issue 1: No tests planned across all 3 plans

**Testing Verdict: Missing**

All 3 plans have verification limited to `npx tsc --noEmit` and `npm run build`. There are zero unit tests, zero component tests, and zero integration tests planned for:
- `searchGuides()` function (pure logic — trivially testable)
- `HELP_GUIDES` registry integrity (correct statuses, section counts)
- Individual component rendering (RoleTag, CalloutBox, StepCard, GuideSection, FaqAccordion)
- WorkflowDiagram SVG rendering
- GuideLayout intersection observer behavior
- GuideRouter component lookup logic
- HelpCenter search functionality

The `searchGuides()` function is a pure function with no dependencies — it is the ideal candidate for unit testing. Not testing it is a missed opportunity that the project's testing standards require.

**Recommendation:** Add at minimum:
1. Unit tests for `searchGuides()` with edge cases (empty query, no matches, partial match, case-insensitive)
2. Unit tests for `HELP_GUIDES` registry validation (all live guides have components, all coming-soon have empty sections)
3. Component render tests for at least RoleTag, CalloutBox, and FaqAccordion (small, testable)
4. Component test for GuideRouter (renders component when found, shows not-found when missing)

### Issue 2: CalloutBox dark mode violates CSS variable token convention

Plan 01 specifies:
```
tip: border-green-500, bg-green-50 dark:bg-green-950, icon text-green-600
warning: border-amber-500, bg-amber-50 dark:bg-amber-950, icon text-amber-600
important: border-orange-500, bg-orange-50 dark:bg-orange-950, icon text-orange-600
```

Per `docs/CODE_STYLE.md` section "Dark Mode — Use CSS Variable Tokens, Not Raw Tailwind Colors":
> **Do not use raw Tailwind color classes for semantic backgrounds** — use the CSS variable tokens instead.

The callout types map directly to existing semantic tokens:
- `tip` (green) -> `--color-status-success` / `--color-status-success-bg`
- `warning` (amber) -> `--color-status-warning` / `--color-status-warning-bg`
- `important` (orange) -> No exact match, but should define a new CSS variable token or use `--color-status-warning` with differentiation

**Recommendation:** Use `var(--color-status-success-bg)` for tip, `var(--color-status-warning-bg)` for warning. For `important` (orange), either add a new `--color-status-important` token pair to `index.css` or accept that orange is close enough to warning and map it. Do NOT use `dark:bg-*` inline classes.

### Issue 3: RoleTag dark mode uses raw Tailwind dark: classes

Same pattern violation as Issue 2. The plan specifies:
```
"all" = gray bg + gray text, "manager" = blue bg + blue text, "admin" = orange bg + orange text
```
With explicit `dark:bg-gray-800 dark:text-gray-300`.

**Recommendation:** The Header already has role color tokens (`--color-role-admin`, `--color-role-manager`, etc.) in `index.css`. Consider whether the RoleTag component should use those same tokens, or define help-specific role tokens. At minimum, do NOT use inline `dark:` classes.

### Issue 4: `isActive('/help')` will match `/help/:guideId`

The existing `isActive` function in Header.tsx is:
```typescript
const isActive = (path: string) =>
  location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
```

This means `isActive('/help')` will return `true` for both `/help` AND `/help/expenses`, which is actually the correct behavior for a nav item — the Help link should appear active when viewing any help page. However, the plan should explicitly acknowledge this behavior is intentional. If it is NOT intended (i.e., Help should only highlight on the landing page), then the `isActive` check needs to be an exact match: `location.pathname === '/help'`.

**Recommendation:** Add a comment in the plan clarifying that `startsWith('/help')` matching is the desired behavior. If not, use exact match.

**Update: On reflection, this is actually correct behavior — the Help link should be highlighted on all help pages. Downgrading this to an Improvement (explicitly document the intent).**

### Issue 5: Plan 55-02 barrel export update conflicts with Plan 55-01 creation

Plan 55-01 (wave 1) creates `src/components/help/index.ts` with 5 exports.
Plan 55-02 (wave 1, `depends_on: []`) creates WorkflowDiagram and GuideLayout, then appends to the barrel.

Both plans are wave 1 with no dependency declared. If they run in parallel, Plan 55-02 will try to update a barrel file that Plan 55-01 is still creating or may not have created yet.

**Recommendation:** Plan 55-02 must declare `depends_on: [55-01]` or move the barrel update to Plan 55-02 entirely and have Plan 55-01 skip barrel creation. Looking at the frontmatter, Plan 55-02 indeed says `depends_on: []` — this should be `depends_on: [55-01]`.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Use CSS variable tokens for dark mode throughout all help components | High | Low |
| 2 | Explicitly document isActive('/help') prefix-match behavior | Medium | Low |
| 3 | Add error boundary around WorkflowDiagram SVG rendering | Medium | Low |
| 4 | searchGuides should handle undefined/empty POPULAR_QUESTIONS gracefully | Medium | Low |
| 5 | WorkflowDiagram hardcoded SVG colors won't respect dark mode | Medium | Medium |
| 6 | GuideLayout mobile tabs: add aria attributes for accessibility | Medium | Low |
| 7 | HubPage visible() uses `() => true` — inconsistent with other cards | Low | Low |

**Details:**

### Improvement 1: CSS variable tokens for all help components

The CalloutBox and RoleTag issues (Critical #2 and #3) are specific examples, but the broader concern applies to all components. StepCard's number circle uses `bg-primary` (good — that's a token). But WorkflowDiagram uses hardcoded hex fills (#dbeafe, #1d4ed8, etc.) that won't adapt to dark mode at all.

**Recommendation:** For WorkflowDiagram, either:
- Accept that SVG colors are static (document this limitation)
- Or define the color palette as CSS variables and reference them via `var()` in the SVG fills

### Improvement 2: isActive behavior documentation

The plan should note that `isActive('/help')` will highlight on `/help/expenses` too. This is correct UX but should be explicitly stated so implementers don't accidentally "fix" it later.

### Improvement 3: Error boundary for WorkflowDiagram

If nodes/edges arrays are empty or malformed (e.g., edge references a non-existent node ID), the SVG rendering could produce invisible/broken output with no user-visible error. A guard clause at render time would improve robustness.

**Recommendation:** Add validation: if `nodes.length === 0`, render nothing or a placeholder. If an edge references a non-existent node, skip it with a console.warn in dev.

### Improvement 4: searchGuides edge cases

The plan defines `searchGuides` to search guide titles, section titles, and FAQ question text. But it only references `POPULAR_QUESTIONS` for FAQ text. If a guide's component eventually includes its own FAQ accordion content, those won't be searchable. This is fine for v1 but should be documented as a known limitation.

### Improvement 5: WorkflowDiagram hardcoded colors

The plan specifies hex values for SVG node fills:
```
gray: fill="#e5e7eb", blue: fill="#dbeafe", etc.
```

These won't adapt in dark mode. On a dark background, light fills will look washed out but still readable. On the other hand, SVG with CSS variable fills adds complexity.

**Recommendation:** Accept static colors for v1 but add a comment noting this is a known limitation. Alternatively, use `currentColor` patterns or CSS variables in the SVG for future dark mode support.

### Improvement 6: GuideLayout mobile tabs accessibility

The plan describes mobile tabs as a `<nav>` with overflow-x-auto, but doesn't mention `role="tablist"`, `role="tab"`, or `aria-selected` attributes. These are important for screen readers.

### Improvement 7: HubPage visible() signature inconsistency

The existing HUB_AREAS entries use `visible: (hp) => hp("canAccessOrders")` — the function receives `hasPermission`. The plan proposes:
```typescript
visible: () => true,  // All authenticated roles
```

This changes the signature from `(hp: ...) => boolean` to `() => boolean`, which works in TypeScript (unused param is OK) but is inconsistent. Using `visible: (_hp) => true` or `visible: () => true` are both fine but should match the established pattern.

---

## 4. Refinements (Minor Suggestions)

- Plan 01 specifies `Warehouse` icon for inventory guide but the design spec mentions it without importing it. Ensure `Warehouse` is imported from `lucide-react` in `helpGuides.ts`.
- The `SearchResult` type in Plan 01 should be exported from `helpGuides.ts` so `HelpCenter.tsx` can type its state properly.
- GuideLayout: `scroll-margin-top: 80px` is hardcoded. Consider extracting to a CSS variable (`--header-height`) shared with the Header's actual height for maintainability.
- Plan 03, Task 2: The HubPage "Help & Training" card should probably be placed before the "Admin" card (not after) since Help is accessible to all roles, while Admin is restricted. Placing it after Admin means less-privileged users who can't see the Admin card will still see Help — but the visual ordering should reflect importance/breadth.
- WorkflowDiagram: Consider adding `font-family: "system-ui, sans-serif"` to SVG text elements explicitly so they match the app's font, rather than inheriting browser SVG defaults.
- The `component` field in the expenses guide entry is `undefined` with a comment `// component: ExpenseGuide — set in Phase 56`. This means the GuideRouter will show "Guide not found" for `/help/expenses` until Phase 56 runs. Plan 03 Task 3 step 9 acknowledges this, which is good. However, this creates a brief window where the "NEW" badge on the landing page card is misleading. Consider changing status to "coming-soon" in Phase 55 and flipping to "live" in Phase 56.
- FaqAccordion: The plan uses `${groupIndex}-${itemIndex}` for Accordion value keys. These should be stable strings. If groups/items are reordered, keys change and accordion state resets. Consider using the question text hash or a stable identifier.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `cn()` utility | `src/lib/utils.ts` | Use for conditional class merging in all components |
| `ProtectedRoute` | `src/components/auth/ProtectedRoute.tsx` | Auth-only gate (no permission/role) — already planned |
| `Accordion` (shadcn) | `src/components/ui/accordion.tsx` | Used by FaqAccordion — already planned |
| CSS variable tokens | `src/index.css` | Should be used for dark mode colors (see Issues) |
| `ROLE_COLORS` | `src/components/layout/Header.tsx` | Role color mapping — could inform RoleTag colors |
| `lazyWithPreload` | `src/lib/lazyWithPreload.ts` | NOT used — plan correctly uses eager imports |
| `RouteLoadingFallback` | `src/components/shared/RouteLoadingFallback.tsx` | Not needed for eager imports |
| Framer Motion `motion` | Already in Header.tsx, other pages | Used for animations — already planned |

### Potential Duplication Risks

- **RoleTag vs Header ROLE_COLORS:** RoleTag creates a new role-to-color mapping. Header already has `ROLE_COLORS`. These serve different purposes (RoleTag is "all"/"manager"/"admin" for guide audience, Header is "admin"/"manager"/"order_staff"/"kitchen" for user roles), but the color tokens could overlap. No action needed — just awareness.
- **CalloutBox vs inline callouts:** No existing callout component exists. This is a new pattern. No duplication risk.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Plan 55-01 (Registry + 5 components) | Good | Clear scope, well-defined interfaces |
| Plan 55-02 (WorkflowDiagram + GuideLayout) | Needs Adjustment | `depends_on` should include 55-01 (barrel export conflict) |
| Plan 55-03 (Landing page + integration) | Good | Correct dependency on 55-01 and 55-02 |

**Ordering Issues:**
- Plan 55-02 `depends_on: []` should be `depends_on: [55-01]` because it modifies the barrel export that 55-01 creates.

**Missing Phases:**
- No test plan phase. Should add a 55-04 or incorporate testing into each plan's wave 2.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Plan 55-01 | `react-ui-builder` | Registry file + 5 UI components |
| Plan 55-02 | `react-ui-builder` | Complex UI components (SVG, Intersection Observer) |
| Plan 55-03 | `react-ui-builder` | Page creation + routing + nav integration |
| Testing | `code-auditor` | Should write and verify tests |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes: `feature/help-center-infrastructure` |
| Branch naming convention | Correct |
| Merge strategy documented | Implicit (phase merge after human verify in Plan 03) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Plan 55-01 | 1-2 | feat | Registry + components as one atomic commit |
| Plan 55-02 | 1 | feat | WorkflowDiagram + GuideLayout |
| Plan 55-03 | 1-2 | feat | Pages + nav integration |

### Recommended Commit Checkpoints
1. After Plan 55-01: `feat: add help guide registry and 5 reusable help components`
2. After Plan 55-02: `feat: add WorkflowDiagram and GuideLayout components`
3. After Plan 55-03: `feat: add Help Center landing page, guide router, and nav integration`
4. After tests: `test: add tests for help center components and search`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [ ] Plan includes test execution (MISSING — no `npm run test` step)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Not documented (low risk — frontend only, no schema) |
| Deployment order | Correct — frontend only, no backend dependency |
| Data backup needed | No — no database changes |
| Migration safety | N/A — no schema changes |

### Git Workflow Issues Found
- No `npm run test` verification step before push
- No explicit commit message templates in the plans

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| After all 3 plans | `docs/CHANGELOG.md` (planned) |
| After all 3 plans | `CLAUDE.md` Quick File Finder table — add Help Center row |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-03-16 — Help Center Infrastructure (v1.8 Phase 55)

**In-app Help Center with guide registry, reusable components, landing page, and navigation integration.**

- Added `/help` landing page with search, guide card grid, and popular questions
- Added `/help/:guideId` guide router with "guide not found" fallback
- Created 7 reusable help components: RoleTag, CalloutBox, StepCard, GuideSection, FaqAccordion, WorkflowDiagram, GuideLayout
- Created guide registry (`src/lib/helpGuides.ts`) with 6 entries (1 live, 5 coming-soon)
- Added Help link to Header nav (desktop + mobile) for all authenticated roles
- Added "Help & Training" card to HubPage

**Files Added:**
- `src/lib/helpGuides.ts`
- `src/components/help/` (7 components + barrel export)
- `src/pages/HelpCenter.tsx`
- `src/pages/guides/GuideRouter.tsx`

**Files Modified:**
- `src/App.tsx` (routes)
- `src/components/layout/Header.tsx` (nav link)
- `src/pages/HubPage.tsx` (area card)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Missing**

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | N/A | N/A | N/A (no backend) |
| Frontend: searchGuides | Pure search function | Vitest | Missing |
| Frontend: Components | RoleTag, CalloutBox, etc. | Vitest + RTL | Missing |
| Frontend: GuideRouter | Component lookup logic | Vitest + RTL | Missing |
| Integration | Full page render | Manual only | Plan 03 Task 3 human-verify |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `searchGuides()` unit tests | Core search logic — edge cases (empty, no match, case) | Vitest with known input/output |
| 2 | `HELP_GUIDES` registry validation | Ensure data integrity of guide definitions | Vitest: live guides have component defined, coming-soon have empty sections |
| 3 | RoleTag render tests | 3 role variants render correct text/classes | Vitest + RTL |
| 4 | CalloutBox render tests | 3 callout types render correct icon/colors | Vitest + RTL |
| 5 | FaqAccordion render tests | Groups and items render correctly | Vitest + RTL |
| 6 | GuideRouter render tests | Renders component for valid ID, shows not-found for invalid | Vitest + RTL with router mock |

### Test Execution Checkpoints
1. After Plan 55-01: `npm run test` (searchGuides + component tests)
2. After Plan 55-02: `npm run test` (WorkflowDiagram + GuideLayout tests)
3. Before merge: Full `npm run test && npm run build`

### Regression Risk
- Modifying `App.tsx` routes — existing route tests (if any) should still pass
- Modifying `Header.tsx` — any header rendering tests should still pass
- Modifying `HubPage.tsx` — any hub page tests should still pass

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [ ] `searchGuides("")` returns empty array (not all guides)
- [ ] `searchGuides` with special regex characters in query (e.g., `"P&L"` — the `&` is fine for `String.includes` but document this)
- [ ] GuideRouter with `guideId` that exists but has status `"coming-soon"` — plan says it checks `g.status === 'live' && g.component`, which is correct
- [ ] WorkflowDiagram with 0 nodes — should render nothing or empty SVG, not crash
- [ ] WorkflowDiagram with edge referencing non-existent node ID — should not crash
- [ ] GuideLayout with 0 sections — sidebar should gracefully show empty state
- [ ] IntersectionObserver not available (very old browsers) — fallback to first section active
- [ ] Mobile tabs scroll: what happens with only 1 section? Scroll container should still work
- [ ] Search dropdown: clicking outside should dismiss (blur handler exists but needs `relatedTarget` check or mousedown timing)
- [ ] Ctrl+K when search already has text — should select all text for easy replacement

---

## 12. Approval Conditions

**For Approval, address:**
1. **(Critical)** Add testing plan — at minimum unit tests for `searchGuides()` and component render tests for 3+ help components
2. **(Critical)** Replace raw `dark:bg-*` Tailwind classes with CSS variable tokens per CODE_STYLE.md convention in CalloutBox and RoleTag
3. **(Critical)** Fix Plan 55-02 `depends_on` to include `55-01` (barrel export dependency)

**Recommended before implementation:**
1. Add error guards in WorkflowDiagram for empty/malformed input
2. Add `aria-` attributes to GuideLayout mobile tabs for accessibility
3. Consider marking expenses guide as `"coming-soon"` in Phase 55 and flipping to `"live"` in Phase 56 to avoid misleading NEW badge on a non-functional guide
4. Update CLAUDE.md Quick File Finder table with Help Center entries

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

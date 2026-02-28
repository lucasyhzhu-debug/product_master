# Staff Review: Phase 29-02 — Consignment Frontend (Hook + Components + Tab)

**Date:** 2026-02-28
**Plan:** `.planning/phases/29-consignment-settlements/29-02-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation

```
PLAN VALIDATION CHECKLIST
═════════════════════════

✅ Git Workflow section exists?
  → Branch name specified? Yes (feature/phase-29-consignment-settlements)
  → Checkpoint strategy defined? Yes (after hook, after components, human verify)

✅ Implementation Waves section exists?
  → Agents assigned? Yes
  → File paths specified? Yes
  → PARALLEL/SEQUENTIAL marked? Yes

✅ Documentation Updates section exists?
  → CHANGELOG.md checkbox? Yes

✅ Success Criteria section exists?
  → Type check requirement? Yes
  → Build requirement? Yes

═════════════════════════
```

**Plan structure validated.** Proceeding to review.

---

## 1. Summary

**Overall Assessment:** Revise (minor)

The frontend plan is well-structured with clean component decomposition, proper hook patterns, and a thorough human verification checklist (13 steps). However, there are critical gaps: (1) the plan uses `toast.success()` in some descriptions instead of the project's `actionToast()` pattern, (2) frontend components have zero automated tests despite being form-heavy with financial calculations, (3) the plan doesn't address the CSS variable token pattern from CODE_STYLE.md (uses raw `text-amber-600 dark:text-amber-400` instead of `var(--color-status-warning)`), and (4) date string → epoch conversion needs explicit handling for timezone consistency.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Uses `toast.success()` instead of `actionToast()` | Pattern Violation | Task 2 (component actions) |
| 2 | No automated frontend tests for financial form components | Testing | Missing entirely |
| 3 | Uses raw Tailwind colors instead of CSS variable tokens | Pattern Violation | Task 2c, 2d, 2e (amber/green colors) |
| 4 | Date string → epoch conversion unspecified — timezone risk | Logic | Task 2b (SettlementFormDialog) |

**Details:**

### Issue 1: `toast.success()` violates project convention — use `actionToast()`

CODE_STYLE.md explicitly states: "Never use `toast.success()` — use `actionToast()` instead." The plan mentions "toast feedback" generically in Task 2a and 2b. The executor will likely default to `toast.success()` unless the plan explicitly specifies `actionToast()`.

**Recommendation:** In Task 2a (OutletFormDialog) and 2b (SettlementFormDialog), explicitly specify:
```typescript
// On successful create/update:
actionToast("Outlet created", event);
// NOT: toast.success("Outlet created");
```
Also: thread `React.MouseEvent` through the submit handler so `actionToast` can position near the button.

### Issue 2: No automated frontend tests for form components

The plan has zero frontend test files. The human verification checkpoint (Task 3) covers the happy path but:
- Settlement math preview is rendered client-side — if the `revShareAmount` calculation has a JS floating-point issue, the human checker might not catch it with round numbers
- Form validation (required fields, number ranges) is untested
- The `useConsignmentSettlements("skip")` conditional query pattern could fail if the hook implementation doesn't match

Given this is a financial feature, at minimum the settlement math rendering should have a test.

**Recommendation:** Add a test file `src/components/salesAnalytics/__tests__/SettlementFormDialog.test.tsx` with:
1. Test: live math preview shows correct amounts for known inputs
2. Test: form disallows submission with empty required fields
3. Test: date conversion produces expected epoch values

If full React Testing Library is too heavy, at minimum extract the math preview logic to a testable function and test it (mirrors the backend `computeSettlementMath` approach).

### Issue 3: Raw Tailwind colors instead of CSS variable tokens

CODE_STYLE.md says: "Do not use raw Tailwind color classes for semantic backgrounds — use the CSS variable tokens instead."

The plan specifies:
- `text-amber-600 dark:text-amber-400` for outstanding amounts
- `text-green-600 dark:text-green-400` for paid amounts
- `bg-muted` (this one is fine — it's a token)

The project has `--color-status-warning` (amber) and `--color-status-success` (green) tokens.

**Recommendation:** Replace in plan:
```
// Instead of:
text-amber-600 dark:text-amber-400
// Use:
text-[var(--color-status-warning)]

// Instead of:
text-green-600 dark:text-green-400
// Use:
text-[var(--color-status-success)]
```

### Issue 4: Date string → epoch conversion needs timezone specification

The plan says "Convert date strings to epoch ms on submit (Date.parse or new Date().getTime())" but doesn't specify timezone handling. `new Date("2026-03-15")` is parsed as UTC midnight, while the user in Jakarta (UTC+7) expects it to mean local midnight. This could cause settlement periods to be off by one day.

**Recommendation:** Explicitly use local timezone conversion:
```typescript
// Convert date input "2026-03-15" to local midnight epoch:
const epochMs = new Date(dateString + "T00:00:00").getTime();
// This uses local timezone, which is correct for Indonesian admin users
```

Add this as a utility or inline comment in the SettlementFormDialog.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add empty state design for ConsignmentTab | Medium | Low |
| 2 | Add confirm dialog for Mark as Paid action | Medium | Low |
| 3 | Add confirm dialog for Delete Settlement action | Medium | Low |
| 4 | Add responsive breakpoint handling for outlet grid | Medium | Low |
| 5 | Add number input formatting for IDR currency | Medium | Medium |

**Details:**

### Improvement 1: Empty state for ConsignmentTab

The plan doesn't specify what the Consignment tab looks like when there are zero outlets. The existing project uses `EmptyState` component (`src/components/shared/EmptyState.tsx`) for this pattern. An empty Consignment tab should show "No consignment outlets yet" with a prominent "Add Outlet" CTA.

**Recommendation:** In ConsignmentTab, add:
```tsx
if (outlets.data?.length === 0) {
  return <EmptyState title="No consignment outlets" action="Add Outlet" onAction={...} />;
}
```

### Improvement 2: Confirm dialog for Mark as Paid

Mark as Paid is a one-way action (settlement locks permanently). The plan doesn't include a confirmation step. The project uses `ConfirmDialog` from `src/components/shared/ConfirmDialog.tsx` for destructive actions.

**Recommendation:** Wrap the markAsPaid call in a ConfirmDialog:
```tsx
<ConfirmDialog
  title="Mark as Paid?"
  description="This will lock the settlement and cannot be undone."
  onConfirm={handleMarkPaid}
/>
```

### Improvement 3: Confirm dialog for Delete Settlement

Same pattern — deleting a settlement removes the linked externalRevenue record. This is destructive and should have confirmation.

### Improvement 4: Responsive handling at 280px minimum

CODE_STYLE.md requires testing at 280px minimum width. The plan uses `grid grid-cols-1 md:grid-cols-2 gap-4` for outlets which is correct, but the OutletCard's 2x2 stats grid (`grid grid-cols-2`) may overflow at 280px if labels are long. Consider using `grid grid-cols-1 sm:grid-cols-2` for the stats grid.

### Improvement 5: Currency input formatting

Users enter revenue in IDR (e.g., 5,000,000). A plain `<input type="number">` shows "5000000" which is hard to read. Consider adding `formatCurrency()` as a display preview or using an `onBlur` formatting pattern (established in GrabFood price editing per Phase 27.1-02).

---

## 4. Refinements (Minor Suggestions)

- The SettlementTimeline vertical line pattern (`border-l-2 border-muted`) should be `border-border` or `border-muted-foreground/20` for better dark mode contrast
- Consider adding a "total settlements" count in the outlet card header for quick scanning
- The `useConsignmentOutlets` hook returns `{ data, isLoading }` — consider also returning `error` for error boundary support
- OutletFormDialog should validate `revSharePercent` is between 0-100 on the frontend (backend should also validate, but good UX to catch early)
- The plan creates 5 separate component files — verify `src/components/salesAnalytics/` directory exists or create it

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `useProtectedMutation` | `src/hooks/convex/useProtectedMutation.ts` | Correctly used in plan |
| `formatCurrency()` | `src/lib/utils.ts` | Correctly referenced for IDR formatting |
| `EmptyState` | `src/components/shared/EmptyState.tsx` | Use for empty outlet list (not in plan) |
| `ConfirmDialog` | `src/components/shared/ConfirmDialog.tsx` | Use for Mark as Paid and Delete (not in plan) |
| `actionToast` | `src/lib/actionToast.ts` | Must use instead of `toast.success()` |
| `LoadingState` | `src/components/shared/LoadingState.tsx` | Use for loading states |
| shadcn Badge | `src/components/ui/badge.tsx` | For status badges (pending/paid, type badges) |
| shadcn Select | `src/components/ui/select.tsx` | For outlet type selector |

### Potential Duplication Risks
- The `computeSettlementMath` is reimplemented client-side in SettlementFormDialog (inline calculation). Consider importing the same logic from a shared location, or just accept the duplication since it's 2 lines of arithmetic.
- The OutletCard running totals computation (useMemo reduce) mirrors the backend `getOutletsWithTotals` query. The backend already returns these totals — the frontend shouldn't recompute them. Verify the OutletCard receives pre-computed totals from the query, not raw settlement arrays.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Hook creation | Good | Standalone, correct as first step |
| Wave 2: Components + wiring | Good | Depends on hook — correct ordering |
| Wave 3: Verification | Good | type-check + build + human verify |

**Ordering Issues:**
- None — the wave structure is correct.

**Missing Phases:**
- Consider adding a "Wave 0.5: Verify backend is available" step — if Plan 01 had any issues, the hooks will fail to type-check against missing API endpoints.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Hook creation | `react-ui-builder` | Frontend hook pattern |
| Components + wiring | `react-ui-builder` | UI component creation |
| Human verification | Human | Manual testing |
| Code quality | `code-auditor` | Post-build verification |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes (same branch as Plan 01) |
| Branch naming convention | ✅ Correct |
| Merge strategy documented | ✅ Implicit |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Hook creation | 1 | feat | useConsignment.ts + barrel export |
| Components | 1-2 | feat | 5 component files + SalesAnalytics wiring |
| Tests (if added) | 1 | test | Frontend test file |

### Recommended Commit Checkpoints
1. After hook: `feat(consignment): add useConsignment hook with 9 query/mutation hooks`
2. After components: `feat(consignment): add ConsignmentTab with outlet cards and settlement timeline`
3. After SalesAnalytics wiring: `feat(salesAnalytics): wire Consignment tab into Sales Analytics page`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [x] Plan includes human verification (Task 3)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Additive-only — can revert by removing tab |
| Deployment order | ✅ After Plan 01 (backend must exist first) |
| Data backup needed | No |
| Migration safety | N/A (no schema changes) |

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Tab wiring | `docs/CHANGELOG.md` |

### CHANGELOG.md Entry (Draft)
(Combined with Plan 01 entry — no separate entry needed)

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Insufficient

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Frontend | Hook API correctness | Type check | Planned (via `npm run type-check`) |
| Frontend | Component rendering | Manual (13 steps) | Planned (Task 3) |
| Frontend | Settlement math preview | Automated unit | **Missing** |
| Frontend | Form validation | Automated unit | **Missing** |
| Frontend | Date conversion | Automated unit | **Missing** |
| Frontend | Empty states | Manual | Partially covered (step 6 mentions "empty state") |
| Frontend | Dark mode | Manual | Planned (step 13) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Settlement math preview with decimal rev share | Financial display must be exact — floating point can cause Rp 499,999.99999 | Extract to function, test with known values |
| 2 | Date input → epoch conversion | Off-by-one-day bugs are common with timezone issues | Unit test: `"2026-03-15"` → expected epoch in WIB |
| 3 | Form required field validation | Empty name/type/revenue should prevent submission | Render test or extract validation logic |
| 4 | Conditional query "skip" pattern | `useConsignmentSettlements(null)` must not fire a query | Hook test with mock |

### Test Execution Checkpoints
1. After hook creation: `npm run type-check` (hooks compile)
2. After components: `npm run type-check && npm run build` (everything compiles)
3. After human verify: Manual confirmation of all 13 steps
4. Before merge: Full `npm run test && npm run build`

### Regression Risk
- `src/pages/SalesAnalytics.tsx` is modified (tab added) — existing tabs (Overview, Mappings, Settings) should still function
- `src/hooks/convex/index.ts` barrel export modified — ensure no circular imports

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] **Empty outlet list** — show EmptyState with "Add Outlet" CTA
- [ ] **Outlet with zero settlements** — expanded card shows empty timeline with "No settlements yet" message
- [ ] **Very long outlet name** — text truncation or wrapping in card header
- [ ] **Rev share percent display precision** — 10% vs 10.5% vs 10.123% — how many decimals?
- [ ] **Settlement with zero revenue** — live math preview should handle gracefully (all zeros)
- [ ] **Rapid double-click on Mark as Paid** — disable button after first click (optimistic UI or loading state)
- [ ] **Multiple browser tabs** — Convex real-time ensures both tabs see the update; verify no stale state in form dialogs
- [ ] **Mobile viewport (280px)** — outlet cards and settlement timeline must not overflow

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical #1:** Replace `toast.success()` with `actionToast()` in plan instructions
2. **Critical #2:** Add at least settlement math preview test (extract + test function)
3. **Critical #3:** Use CSS variable tokens instead of raw Tailwind colors
4. **Critical #4:** Specify timezone-aware date conversion approach

**Recommended before implementation:**
1. Add confirm dialogs for Mark as Paid and Delete Settlement
2. Add empty state for zero outlets
3. Add responsive testing note for 280px minimum
4. Validate `revSharePercent` input (0-100 range) in frontend

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

# Staff Review: Phase 58 -- Invoice Form, Print View & Order Integration

**Date:** 2026-03-17
**Plans:** `58-01-PLAN.md`, `58-02-PLAN.md`, `58-03-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST
=========================

58-01-PLAN.md:
[x] Git Workflow section exists? Branch name specified? Checkpoints defined?
[x] Implementation Waves section exists? Agents/files assigned? PARALLEL/SEQUENTIAL marked?
[x] Documentation Updates section exists? CHANGELOG.md checkbox?
[x] Success Criteria section exists? Type check + build requirement?

58-02-PLAN.md:
[x] Git Workflow section exists? Branch name specified? Checkpoints defined?
[x] Implementation Waves section exists? Agents/files assigned? PARALLEL/SEQUENTIAL marked?
[x] Documentation Updates section exists? CHANGELOG.md checkbox?
[x] Success Criteria section exists? Type check + build requirement?

58-03-PLAN.md:
[x] Git Workflow section exists? Branch name specified? Checkpoints defined?
[x] Implementation Waves section exists? Agents/files assigned? PARALLEL/SEQUENTIAL marked?
[x] Documentation Updates section exists? CHANGELOG.md checkbox?
[x] Success Criteria section exists? Type check + build requirement?

=========================
```

Plan structure validated. All 3 plans have all 4 mandatory sections.

---

## 1. Summary

**Overall Assessment:** Revise

These plans are well-structured, thorough, and demonstrate deep knowledge of the codebase. The dependency chain (58-01 -> 58-02/58-03) is clean and the cross-phase prerequisite checks for Phase 57 artifacts are a good practice. However, there are several issues: (1) the `InvoicePrintData` interface duplicates schema fields and will diverge from the actual query return type, (2) the `bg-blue-50`/`bg-amber-50` hardcoded colors violate the project's dark mode CSS variable convention documented in CODE_STYLE.md, (3) there is zero automated test coverage planned across all 3 plans, and (4) the auto-save debounce logic has a subtle correctness issue where `setSaveStatus("saving")` fires immediately on keypress rather than when the actual save begins. All issues are addressable without restructuring the plans.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | No automated tests planned for any of the 3 plans | Testing | All plans |
| 2 | `InvoicePrintData` duplicates schema type instead of deriving from query return type | Type Safety | 58-01 Task 2, 58-02 Task 1 |
| 3 | Dark mode breakage: hardcoded `bg-blue-50`/`bg-amber-50` violates CSS variable token convention | Pattern Violation | 58-01 Task 1 |

**Details:**

### Issue 1: No Automated Tests Planned

All 3 plans have verification sections that consist only of `npm run type-check` and `npm run build`. There are zero unit tests, component tests, or integration tests planned for any of the 5 new files created:

- `formatIndonesianDate` -- a pure function with clear input/output, trivially testable
- `InvoiceFieldInput` -- a component with 3 visual states and source transition logic
- `InvoicePrintView` -- a component rendering 9 sections with conditional elements
- `InvoiceForm` -- complex auto-save debounce logic, field source state machine, field name mapping
- `InvoiceSidebarCard` -- 3-state conditional rendering with cancelled order edge cases

At minimum, `formatIndonesianDate` should have unit tests (known input -> expected output) and the auto-save debounce logic should have tests verifying: (a) initial load does NOT trigger save, (b) field change triggers save after 2 seconds, (c) rapid changes only trigger one save, (d) unmount clears timer.

**Testing Verdict: Missing**

**Recommendation:** Add a test task to Plan 01 for `formatIndonesianDate` unit tests, and add a test task to Plan 02 for InvoiceForm debounce/auto-save logic tests. At minimum:
- `src/lib/__tests__/dateUtils.test.ts` -- extend existing file (if any) with `formatIndonesianDate` tests
- `src/components/invoice/__tests__/InvoiceForm.test.tsx` -- debounce timer, field-name mapping, initial-load guard

### Issue 2: InvoicePrintData Duplicates Schema Type

Plan 58-01 Task 2 defines a standalone `InvoicePrintData` interface with 25+ fields that duplicates the invoice schema. The actual runtime data comes from `useInvoicesByOrder` / `useInvoice` which return Convex document types with `sellerLogoUrl` (resolved from `sellerLogoStorageId`). Maintaining a separate interface means:

- Fields can silently drift from the schema (e.g., if a field is added to `invoices` schema, `InvoicePrintData` must be manually updated)
- The field `sellerLogoUrl` only exists on the query return type (it's resolved from `sellerLogoStorageId`), so the interface cannot be trivially derived from `Doc<"invoices">`
- Plan 58-02 Task 1 (InvoiceForm) must map between `Invoice` (from hook) and `InvoicePrintData` (for print view), creating an unnecessary transformation layer

**Recommendation:** Instead of a standalone interface, derive `InvoicePrintData` from the query return type:
```typescript
import type { Invoice } from '@/hooks/convex/useInvoice';
export type InvoicePrintData = Pick<Invoice, 'invoiceNumber' | 'generatedAt' | 'sellerName' | ...>;
// Or simply use Invoice directly as InvoicePrintView props
```
If the print view truly needs a different shape (e.g., for standalone use without Convex), keep the interface but add a JSDoc comment linking it to the schema and a TODO to keep in sync.

### Issue 3: Dark Mode Breakage with Hardcoded Colors

The `InvoiceFieldInput` component uses hardcoded Tailwind colors:
```typescript
const SOURCE_BG: Record<FieldSource, string> = {
  auto: "bg-blue-50 border-blue-200",
  "needs-input": "bg-amber-50 border-amber-200",
  edited: "bg-white border-gray-200",
};
```

`docs/CODE_STYLE.md` explicitly states: **"Do not use raw Tailwind color classes for semantic backgrounds -- use the CSS variable tokens instead."** The guide shows `--color-status-info-bg` / `--color-status-warning-bg` as the correct approach with dark mode support.

In dark mode, `bg-blue-50` renders as a light blue background on dark text -- nearly unreadable. The project has dark mode support via `.dark` CSS variable overrides in `src/index.css`.

**Recommendation:** Use CSS variable tokens:
```typescript
const SOURCE_BG: Record<FieldSource, string> = {
  auto: "bg-[var(--color-status-info-bg)] border-[var(--color-status-info)]/30",
  "needs-input": "bg-[var(--color-status-warning-bg)] border-[var(--color-status-warning)]/30",
  edited: "bg-background border-border",
};
```

Alternatively, since invoices are "primarily desktop" and may intentionally be light-only for print fidelity, document this as an explicit exception with a `/* Invoice form is light-mode only for print fidelity */` comment.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Auto-save debounce shows "Saving..." too early | Medium | Low |
| 2 | Missing `orderId` validation in InvoicePage before casting | Medium | Low |
| 3 | StrictMode double-render guard for createDraft in InvoicePage | Medium | Low |
| 4 | Plan 03 RESEARCH.md code example still shows `useAuth()` inside InvoiceSidebarCard | Low | Low |
| 5 | Missing barrel export for invoice components | Low | Low |

**Details:**

### Improvement 1: Auto-Save "Saving..." Shows Too Early

Plan 58-02 Task 1 describes the debounce pattern as:
> On field change, clear existing timer, set new 2-second timeout

But the RESEARCH.md pattern shows `setSaveStatus("saving")` being called BEFORE the setTimeout fires:
```typescript
function scheduleAutoSave(updates) {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  setSaveStatus("saving"); // <-- fires immediately on keypress
  saveTimerRef.current = setTimeout(async () => {
    await updateDraft.mutate(...);
    setSaveStatus("saved");
  }, 2000);
}
```

This means the "Saving..." indicator appears the instant the user types, not when the actual save begins. The user sees "Saving..." for 2+ seconds of typing, which is misleading -- nothing is actually being saved yet.

**Recommendation:** Set status to `"saving"` INSIDE the setTimeout callback, just before calling `mutate()`. Alternatively, use a third state like `"pending"` for the debounce wait and `"saving"` for the actual mutation call.

### Improvement 2: Missing orderId Validation in InvoicePage

Plan 58-02 Task 2 casts `orderIdParam` directly:
```typescript
const orderId = orderIdParam as Id<"orders"> | undefined;
```

This is an unsafe cast. If the URL param is a malformed string (not a valid Convex ID), it will pass type checks but fail at runtime when passed to `useInvoicesByOrder`. The existing OrderDetail.tsx pattern handles this correctly.

**Recommendation:** Add validation or at least a guard:
```typescript
if (!orderIdParam) return <ErrorState message="Missing order ID" />;
const orderId = orderIdParam as Id<"orders">;
```

### Improvement 3: StrictMode Double-Call Guard Needs More Detail

Plan 58-02 describes auto-creating a draft with a `useEffect` and `creatingRef` guard. This is the right approach, but the plan should be explicit about the pattern to avoid a common React 18 StrictMode trap:

```typescript
const creatingRef = useRef(false);
useEffect(() => {
  if (!draft && !creatingRef.current && invoices !== undefined && invoices.length === 0) {
    creatingRef.current = true;
    createDraft.mutate({ orderId }).catch(() => {
      creatingRef.current = false; // Reset on failure to allow retry
    });
  }
}, [draft, invoices, orderId]);
```

The plan mentions the guard but does not mention the failure reset. If `createDraft` fails, the user would be stuck with no draft and no way to retry.

### Improvement 4: RESEARCH.md Auth Pattern Contradiction

The RESEARCH.md code example for `InvoiceSidebarCard` shows `useAuth()` being called inside the component and an `isManagerOrAdmin` check. Plan 58-03 Task 1 correctly overrides this with a bold warning: "Do NOT follow the RESEARCH.md code example for auth handling." However, having a contradictory code example in RESEARCH.md creates a risk that a less careful implementer follows the example instead of the plan text.

**Recommendation:** This is already addressed in the plan. No action needed -- just noting the contradiction exists.

### Improvement 5: Missing Barrel Export for Invoice Components

The plans create 4 components in `src/components/invoice/` but don't mention creating an `index.ts` barrel export. The project convention (see `src/components/orders/`, `src/components/shared/`) uses barrel exports for component directories.

**Recommendation:** Add `src/components/invoice/index.ts` to Plan 01 or Plan 03's file list:
```typescript
export { InvoiceFieldInput } from './InvoiceFieldInput';
export type { FieldSource } from './InvoiceFieldInput';
export { InvoicePrintView } from './InvoicePrintView';
export type { InvoicePrintData } from './InvoicePrintView';
export { InvoiceForm } from './InvoiceForm';
export { InvoiceSidebarCard } from './InvoiceSidebarCard';
```

---

## 4. Refinements (Minor Suggestions)

- **Brand bar height inconsistency:** Plan 58-01 specifies `h-1` (4px) for the brand bar, but CONTEXT.md says "thin 4px bar" and RESEARCH.md CSS example uses `height: 4px`. Tailwind's `h-1` = 0.25rem = 4px at default settings, so this is correct but could cause confusion. Consider using `h-px` (1px) or explicit `style={{ height: '4px' }}` for clarity.

- **Print view container class:** Plan 58-02 uses `<div className="invoice-print-area">` for the print view wrapper but `<div className="border rounded-lg shadow-sm mx-auto max-w-[210mm] bg-white">` for preview. The preview wrapper should also include the `invoice-print-area` class so the shared `@media print` CSS applies correctly if someone prints from preview mode.

- **"Saved N min ago" timer:** Plan 58-02 mentions using `setInterval` for transitioning save status text. This creates a memory leak risk if not cleaned up. Ensure the interval is cleared on unmount alongside the debounce timer.

- **Accessibility:** None of the 3 plans mention `aria-label` attributes on the invoice form sections, print button, or status badges. The invoice form is complex enough that screen reader users would benefit from aria landmarks on the 9 sections.

- **Page title:** Plan 58-02 should use `useDocumentTitle` (already used in OrderDetail.tsx) to set the browser tab title to "Invoice - [Order Number]" or "Invoice - Draft" for better multi-tab workflow.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `formatCurrency` | `src/lib/utils.ts` | Already referenced in plans -- correct |
| `formatDateTimeId` | `src/lib/dateUtils.ts` | Used in InvoiceSidebarCard for draft updated date |
| `ConfirmDialog` | `src/components/shared/ConfirmDialog.tsx` | Used for discard draft and finalize confirmation |
| `LoadingCards` | `src/components/shared/` | Used for loading states in InvoicePage |
| `PageHeader` | `src/components/layout/` | Used for InvoicePage header |
| `lazyWithPreload` | `src/lib/lazyWithPreload.ts` | Used for lazy-loading InvoicePage |
| `createMutationHook` | `src/hooks/convex/createMutationHook.ts` | Already used by invoice hooks in Phase 57 |
| `isManagerOrAdmin` pattern | `src/pages/OrderDetail.tsx` line 99 | Reused for conditional rendering of InvoiceSidebarCard |
| CSS variable tokens | `src/index.css` | Should be used for field source colors (see Critical Issue 3) |

### Potential Duplication Risks
- `InvoicePrintData` interface vs `Doc<"invoices">` + resolved `sellerLogoUrl` (see Critical Issue 2)
- The `INVOICEABLE_STATUSES` set in InvoiceSidebarCard could be shared with backend if order status gating is ever needed server-side. Currently fine as frontend-only.

---

## 6. Phase/Wave Accuracy

| Plan | Wave | Assessment | Notes |
|------|------|------------|-------|
| 58-01 Wave 1 | Foundation Components | Good | Sequential is correct -- Task 2 imports from Task 1's output |
| 58-01 Wave 2 | Verification | Good | Type-check + build |
| 58-02 Wave 1 | Core Form | Good | Sequential, Task 2 depends on Task 1's InvoiceForm |
| 58-02 Wave 2 | Verification | Good | Type-check + build |
| 58-03 Wave 1 | Integration | Good | Sequential, Task 2 modifies OrderDetail after Task 1 creates component |
| 58-03 Wave 2 | Visual verification | Good | Human checkpoint is appropriate for UI-heavy feature |

**Ordering Issues:**
- Plan 02 and Plan 03 both depend on Plan 01, and both are Wave 2. They could theoretically run in PARALLEL since they modify different files. Plan 02 creates `InvoiceForm.tsx`, `InvoicePage.tsx`, modifies `App.tsx`. Plan 03 creates `InvoiceSidebarCard.tsx`, modifies `OrderDetail.tsx`. No overlapping files. However, the human verification in Plan 03 Task 3 tests the full flow (including InvoicePage from Plan 02), so Plan 03's verification depends on Plan 02. The current sequencing (02 then 03) is fine.

**Missing Phases:**
- No test plan phase (see Critical Issue 1)

---

## 7. Specialist Agent Recommendations

| Phase/Plan | Recommended Agent | Rationale |
|------------|-------------------|-----------|
| 58-01 (Foundation components) | `react-ui-builder` | Pure frontend component creation |
| 58-02 (InvoiceForm + InvoicePage) | `react-ui-builder` | Complex form + page routing |
| 58-03 Task 1-2 (InvoiceSidebarCard + OrderDetail) | `react-ui-builder` | Component + page integration |
| 58-03 Task 3 (Visual verification) | `cto-orchestrator` | Cross-cutting verification, human checkpoint |
| Post-implementation | `code-auditor` | Type check + pattern compliance + dark mode check |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes -- `feature/58-invoice-form-print-view-order-integration` |
| Branch naming convention | Correct -- follows `feature/{slug}` pattern |
| Merge strategy documented | Implicit (merge after review, per CLAUDE.md) |

### Commit Strategy
| Plan | Expected Commits | Commit Type | Notes |
|------|------------------|-------------|-------|
| 58-01 | 2 | feat | Task 1 (helper + input component), Task 2 (print view + CSS) |
| 58-02 | 2 | feat | Task 1 (InvoiceForm), Task 2 (InvoicePage + routes) |
| 58-03 | 2 | feat | Task 1 (InvoiceSidebarCard), Task 2 (OrderDetail integration) |

### Recommended Commit Checkpoints
1. After Plan 01: `feat(invoice): add Indonesian date formatter, field input, and print view components`
2. After Plan 02: `feat(invoice): add WYSIWYG invoice form with auto-save and invoice page routing`
3. After Plan 03: `feat(invoice): add invoice sidebar card to order detail`
4. After tests: `test(invoice): add formatIndonesianDate and auto-save tests`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [ ] Plan includes `npm run test` before push (MISSING)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Missing -- no mention of rollback |
| Deployment order | Correct -- frontend-only, no schema changes needed |
| Data backup needed | No -- no schema modifications |
| Migration safety | Safe -- no backend changes |

### Git Workflow Issues Found
- All 3 plans list "Checkpoints: None (autonomous plan)" -- commits should still be made at natural boundaries
- No mention of running `npm run test` before push (per pre-push verification)

---

## 9. Documentation Checkpoints

| Plan | Documentation Update Required |
|------|-------------------------------|
| 58-01 | CHANGELOG.md (after merge) |
| 58-02 | CHANGELOG.md (after merge) |
| 58-03 | CHANGELOG.md, CLAUDE.md Quick File Finder (add invoice entries) |

Plan 58-03 correctly identifies the need to update CLAUDE.md Quick File Finder with invoice entries.

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-03-17 - Invoice Generation

**WYSIWYG invoice form with print view and Order Detail integration**

- Add `formatIndonesianDate` helper for full Indonesian date formatting
- Add InvoiceFieldInput with color-coded field source tracking (auto/needs-input/edited)
- Add InvoicePrintView with 9-section invoice layout
- Add global @media print CSS for clean invoice printing
- Add InvoiceForm with WYSIWYG layout, auto-save debounce, and field source transitions
- Add InvoicePage with 3 modes: form, preview, and finalized print view
- Add 2 invoice routes in App.tsx with canAccessInvoices permission guard
- Add InvoiceSidebarCard to Order Detail right sidebar (manager/admin only)
- InvoiceSidebarCard shows 3 states: no invoice, draft saved, finalized
- Cancelled orders: view existing invoices (no new invoice creation)

**Files Modified:**
- src/lib/dateUtils.ts
- src/index.css
- src/App.tsx
- src/pages/InvoicePage.tsx
- src/pages/OrderDetail.tsx
- src/components/invoice/InvoiceFieldInput.tsx
- src/components/invoice/InvoicePrintView.tsx
- src/components/invoice/InvoiceForm.tsx
- src/components/invoice/InvoiceSidebarCard.tsx
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | N/A (frontend-only phase) | N/A | N/A |
| Frontend - formatIndonesianDate | Date formatting | Unit test | Missing |
| Frontend - InvoiceFieldInput | Color states, source transitions | Component test | Missing |
| Frontend - InvoiceForm | Auto-save debounce, field mapping | Component test | Missing |
| Frontend - InvoiceSidebarCard | 3 states, cancelled order edge cases | Component test | Missing |
| Frontend - InvoicePage | Mode switching (form/preview/print) | Component test | Missing |
| Integration | Full invoice workflow | Manual | Planned (Plan 03 Task 3) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `formatIndonesianDate` unit tests | Pure function, easy to test, date formatting bugs are subtle | Vitest with known dates: `new Date(2026, 2, 16)` -> "Senin, 16 Maret 2026" |
| 2 | InvoiceForm auto-save debounce | Complex timer logic, initial-load guard is a critical correctness requirement | Vitest with fake timers (`vi.useFakeTimers()`), verify timer fires/cancels correctly |
| 3 | InvoiceForm field name mapping | Backend mutation expects EXACT field names | Snapshot test or mock of `useUpdateInvoiceDraft` verifying args |
| 4 | InvoiceSidebarCard state rendering | 3 states + 2 cancelled order edge cases | Render tests with mock invoice data in each state |

### Test Execution Checkpoints
1. After Plan 01 implementation: `npm run test` (existing tests + new dateUtils tests)
2. After Plan 02 implementation: `npm run test` (existing + new form tests)
3. Before merge: Full `npm run test && npm run build` verification

### Regression Risk
- OrderDetail.tsx is modified -- existing Order Detail functionality should be smoke-tested
- `src/index.css` is modified -- global `@media print` could affect other pages that happen to print (verify no unintended `display: none` on non-invoice pages)
- `src/lib/dateUtils.ts` is extended -- existing tests for this file (if any) should still pass

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [ ] **Order with no customer record** -- InvoiceForm auto-fill for buyer fields when `customerId` resolves to null
- [ ] **Invoice with zero items** -- Should the items table render an empty state or should this be blocked at createDraft?
- [ ] **Logo image fails to load** -- InvoicePrintView should handle broken logo URL gracefully (alt text, hidden broken image icon)
- [ ] **Draft created but order status regresses** -- If an order has a draft invoice but is later cancelled, InvoiceSidebarCard handles this (shows view-only), but what about the form route? Navigating to `/orders/:orderId/invoice` for a cancelled order with a draft should NOT allow editing.
- [ ] **Browser print dialog cancelled** -- After `window.print()`, the user remains on the print view page, which is correct but should be documented.
- [ ] **Very long product names** -- Items table cells should handle text wrapping/truncation for products with long names + variants.
- [ ] **formatIndonesianDate with invalid input** -- What happens if `date` is NaN or an invalid Date? The plan should guard against this.
- [ ] **Multiple users editing same draft simultaneously** -- Convex reactivity means both users see real-time updates, but the last-write-wins behavior for debounced auto-save could cause field value flickering.

---

## 12. Approval Conditions

**For Approval, address:**
1. Add automated tests for `formatIndonesianDate` (unit) and InvoiceForm auto-save logic (Critical Issue 1)
2. Either derive `InvoicePrintData` from the query return type or document it as a deliberate snapshot interface with sync notes (Critical Issue 2)
3. Replace hardcoded `bg-blue-50`/`bg-amber-50` with CSS variable tokens or explicitly document as light-only exception (Critical Issue 3)

**Recommended before implementation:**
1. Fix auto-save "Saving..." timing to show during actual save, not during debounce wait (Improvement 1)
2. Add `orderId` validation guard in InvoicePage (Improvement 2)
3. Add failure reset to `creatingRef` guard (Improvement 3)
4. Add barrel export `src/components/invoice/index.ts` (Improvement 5)

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*

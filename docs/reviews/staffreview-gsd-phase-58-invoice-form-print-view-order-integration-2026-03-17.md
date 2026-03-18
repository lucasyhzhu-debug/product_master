# Staff Review (Implementation): Phase 58 -- Invoice Form, Print View & Order Integration

**Date:** 2026-03-17
**Branch:** `gsd/phase-58-invoice-form-print-view-order-integration`
**Base:** `origin/main` (d0bf8f5)
**Head:** 687ab75
**Reviewers:** Requirements Reviewer, Code Quality Reviewer, Staff/Principal Engineer Reviewer (Triple Review)

---

## 0. Summary

**Overall Assessment:** Approve with Minor Issues

Phase 58 delivers a well-structured frontend-only invoice generation workflow. The implementation correctly addresses all 3 prior staff review critical issues: (1) automated tests were added for `formatIndonesianDate` and auto-save debounce, (2) `InvoicePrintData` is now derived from `Pick<Doc<"invoices">, ...>`, and (3) CSS custom property tokens replace hardcoded Tailwind colors. The code is clean, follows project conventions, and the prior review's improvements (saving status timing, orderId validation, creatingRef failure reset, barrel exports, aria-labels) are all implemented correctly.

**Files Changed (TypeScript/CSS only):**
- `src/lib/dateUtils.ts` -- +4 LOC (formatIndonesianDate)
- `src/lib/__tests__/formatIndonesianDate.test.ts` -- 24 LOC (4 unit tests)
- `src/components/invoice/InvoiceFieldInput.tsx` -- 80 LOC
- `src/components/invoice/InvoicePrintView.tsx` -- 241 LOC
- `src/components/invoice/InvoiceForm.tsx` -- 480 LOC
- `src/components/invoice/InvoiceSidebarCard.tsx` -- 301 LOC
- `src/components/invoice/__tests__/InvoiceForm.test.ts` -- 172 LOC (5 debounce tests)
- `src/components/invoice/index.ts` -- 8 LOC (barrel)
- `src/pages/InvoicePage.tsx` -- 458 LOC
- `src/pages/OrderDetail.tsx` -- +9 LOC (sidebar card integration)
- `src/App.tsx` -- +23 LOC (routes + lazy import)
- `src/index.css` -- +62 LOC (CSS tokens + print styles)

---

## 1. Critical Issues (Must Fix Before Merge)

None.

---

## 2. Important Issues (Should Fix Before Merge)

| # | Issue | Category | Files |
|---|-------|----------|-------|
| 1 | `sellerLogoUrl` unsafe cast in `toInvoicePrintData` | Type Safety | `src/pages/InvoicePage.tsx:70-73` |
| 2 | `useAutoSave` has `invoiceId` and `saveFn` in its `useCallback` deps but `invoiceId` is a string that changes on draft recreation | Correctness | `src/components/invoice/InvoiceForm.tsx:90` |

### Issue 1: sellerLogoUrl unsafe cast in toInvoicePrintData

In `InvoicePage.tsx` lines 70-73:
```typescript
sellerLogoUrl: (inv as Record<string, unknown>).sellerLogoUrl as
  | string
  | null
  | undefined,
```

The `Invoice` type is `NonNullable<ReturnType<typeof useInvoice>>` which comes from the `getById` query that spreads `{ ...invoice, sellerLogoUrl }`. The returned type DOES include `sellerLogoUrl` as part of the object. However, the `Invoice` type alias is derived from the hook's return type, and TypeScript may or may not infer `sellerLogoUrl` depending on how Convex types flow.

The `as Record<string, unknown>` cast is fragile -- it bypasses type safety. A cleaner approach: either extend the `Invoice` type in `useInvoice.ts` to explicitly include `sellerLogoUrl`, or use a type assertion directly on the field (`'sellerLogoUrl' in inv ? inv.sellerLogoUrl : undefined`).

**Recommendation:** Add `sellerLogoUrl` to the `Invoice` type export or use a type guard instead of `as Record<string, unknown>`.

### Issue 2: useAutoSave dependency array includes invoiceId

The `scheduleChange` callback in `useAutoSave` has `[invoiceId, onStatusChange, saveFn]` in its deps. If the user discards a draft and creates a new one, `invoiceId` changes, creating a new `scheduleChange` function. This is technically correct (new draft = new save target) but the `changedFieldsRef` accumulation from the old draft's pending changes would be lost silently. Since `changedFieldsRef` is cleared inside the timeout and timeouts are cleaned up on unmount, this is low risk in practice because the component remounts with new invoice data.

**Recommendation:** Minor -- document this behavior or add a comment explaining that draft recreation causes component remount which naturally resets state.

---

## 3. Minor Issues

| # | Issue | Category | Files |
|---|-------|----------|-------|
| 1 | Due date input uses plain text input instead of `type="date"` | UX | `src/components/invoice/InvoiceForm.tsx:354-359` |
| 2 | `InvoicePrintView` has duplicate `invoice-print-area` class with outer wrapper | Clarity | `src/components/invoice/InvoicePrintView.tsx:56`, `src/pages/InvoicePage.tsx:308,344` |
| 3 | Missing `key` prop stability for items table (using array index) | React Pattern | `src/components/invoice/InvoiceForm.tsx:384`, `src/components/invoice/InvoicePrintView.tsx:150` |
| 4 | `ConfirmDialog` `onConfirm` expects sync handler but receives async | Type Compat | `src/pages/InvoicePage.tsx:355`, `src/components/invoice/InvoiceSidebarCard.tsx:145` |

### Issue 1: Due date uses plain text input

The due date field (`InvoiceForm.tsx:354-359`) uses the generic `InvoiceFieldInput` which renders a text `<Input>`. The plan specified "dueDate (needs-input, use date input)" but the implementation uses a plain text field with placeholder "YYYY-MM-DD". While this works functionally (the date string is parsed to epoch ms), a native `<input type="date">` would provide a date picker UX.

### Issue 2: Duplicate invoice-print-area class

`InvoicePrintView` itself applies `className="invoice-print-area ..."` on its root div (line 56), AND the wrapper in `InvoicePage` also applies `className="invoice-print-area"` (lines 308, 344). The `@media print` CSS targets `.invoice-print-area` for removing shadows/borders. Having it on both the inner and outer elements is redundant but not harmful. Consider removing it from one location for clarity.

### Issue 3: Array index as key

Both `InvoiceForm` and `InvoicePrintView` use `key={idx}` for items table rows. Since items are read-only snapshots that never reorder, this is acceptable but not ideal. If items were ever to support reordering, stable keys would be needed.

### Issue 4: Async onConfirm with sync interface

`ConfirmDialog.onConfirm` is typed as `() => void` but `handleDiscard` and `handleFinalize` are async functions returning `Promise<void>`. TypeScript allows this silently (void return type accepts Promise), but the dialog's loading state management relies on the caller managing `loading` prop externally, which is done correctly. No actual bug, just a type-level observation.

---

## 4. Nitpick

| # | Issue | Category |
|---|-------|----------|
| 1 | `useCallback` wrapping `stableSaveFn` with empty deps array | Style |
| 2 | Unused `Plus` icon import in `InvoicePage.tsx` | Dead Import |
| 3 | Section numbering comment mismatch | Documentation |

### Nitpick 1: stableSaveFn pattern

`InvoiceForm.tsx:141-143` creates a stable save function by wrapping a ref in `useCallback([], [])`. This is a known React pattern for stable callbacks but looks unusual. A brief comment explaining why the ref + callback pattern is used would aid readability.

### Nitpick 2: Plus icon imported but used only in print view

`InvoicePage.tsx:9` imports `Plus` from lucide-react but only uses it in the "New Invoice" button in print view mode. This is fine -- it IS used, so not actually dead. (False alarm on closer inspection.)

### Nitpick 3: Section numbering

`InvoiceForm.tsx` comments refer to "Section 7: Signature Area" and "Section 8: Notes" and "Section 9: Footer Preview" but the form only has 9 sections total matching the print view. The form's Section 6 is "Payment Info" but the plan calls it "Payment info". Minor comment alignment.

---

## 5. Plan Fidelity Assessment

| Requirement | Status | Notes |
|-------------|--------|-------|
| INV-01: Manager/admin generate invoice from Order Detail | PASS | InvoiceSidebarCard gated by `isManagerOrAdmin && orderId` |
| INV-02: Auto-fill from order + customer + settings | PASS | `createDraft` backend handles; form initializes from loaded draft |
| INV-03: Field color coding (blue/yellow/white) | PASS | CSS custom property tokens, not raw Tailwind |
| INV-04: Draft auto-save with 2s debounce | PASS | `useAutoSave` hook with timer-based tests |
| INV-05: Draft persists across navigation/refresh | PASS | Backend storage + `useInvoicesByOrder` reactive query |
| INV-06: Preview mode without finalizing | PASS | `?preview` query param, InvoicePrintView in bordered card |
| INV-07: Finalize assigns INV-YYMM-NNN | PASS | `useFinalizeInvoice` mutation, navigates to print view |
| INV-08: Finalize snapshots data | PASS | Backend concern (Phase 57), not this phase |
| INV-09: Customer record updated on finalize | PASS | Backend concern (Phase 57) |
| INV-10: Multiple finalized invoices per order | PASS | Expandable older invoices in sidebar card |
| INV-11: Order Detail sidebar 3 states | PASS | No invoice / Draft / Finalized states |
| IPRNT-01: Print view via window.print() | PASS | Print button in print view mode |
| IPRNT-02: @media print hides chrome | PASS | Global CSS in index.css |
| IPRNT-03: Indonesian date format | PASS | `formatIndonesianDate` with tests |
| IPRNT-04: 9-section invoice layout | PASS | All 9 sections with aria-labels |

### Prior Staff Review Issues Resolution

| Prior Issue | Resolution |
|-------------|-----------|
| Critical 1: No automated tests | RESOLVED -- 4 formatIndonesianDate tests + 5 debounce tests |
| Critical 2: InvoicePrintData duplicates schema | RESOLVED -- uses `Pick<Doc<"invoices">, ...>` |
| Critical 3: Dark mode breakage | RESOLVED -- CSS custom property tokens in `:root` |
| Improvement 1: "Saving..." too early | RESOLVED -- status set inside timeout callback |
| Improvement 2: orderId validation | RESOLVED -- guard before cast |
| Improvement 3: creatingRef failure reset | RESOLVED -- `.catch(() => { creatingRef.current = false })` |
| Improvement 4: RESEARCH.md auth contradiction | RESOLVED -- component does NOT import useAuth |
| Improvement 5: Barrel export | RESOLVED -- `src/components/invoice/index.ts` created |
| Refinement: aria-label attributes | RESOLVED -- all sections have aria-labels |
| Refinement: useDocumentTitle | RESOLVED -- uses existing hook |
| Refinement: setInterval cleanup | RESOLVED -- cleanup in useEffect return |

---

## 6. Architectural Assessment

### Strengths
- Clean separation: InvoiceFieldInput (atom) -> InvoiceForm (organism) -> InvoicePage (page)
- `useAutoSave` hook extraction enables isolated testing without rendering
- `InvoicePrintData` derived from `Doc<"invoices">` prevents type drift
- CSS custom property tokens follow CODE_STYLE.md guidance
- All hooks called before conditional returns (React hooks rules)
- Barrel export follows project convention

### Risks
- `InvoicePage` at 458 LOC is on the larger side but within acceptable range given 3 modes
- The `toInvoicePrintData` mapping function could become a maintenance burden if schema fields change -- but Pick<> type derivation provides compile-time safety
- No protection against navigating to invoice form for a Cancelled order (sidebar card blocks this path, but direct URL access is not guarded in InvoicePage)

---

*Generated by /triple-review (requirements + code-quality + staffreview)*

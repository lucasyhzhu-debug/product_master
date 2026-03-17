# Staff Review: Expense Photo Review UX Fix

**Date:** 2026-03-17
**Branch:** `fix/expense-photo-review-ux`
**Base:** `origin/main` (41742e5)
**Head:** bb991df
**Reviewer:** Staff/Principal Engineer Agent

---

## Summary

This branch addresses three confirmed UX gaps in the expense system plus adds a fourth bonus feature (shared-receipt grouping in the approval queue). The changes are well-scoped, the debug investigation file is thorough, and the implementation is clean. The total diff is +577/-47 lines across 9 files -- appropriate for the scope.

**Changes reviewed:**

1. **Duplicate receipt flow** -- Hard error on submit replaced with early detection via `checkReceiptHash` query + confirmation flow (`sharedReceiptAcknowledged` flag). FRAUD-02 still blocks unacknowledged duplicates.
2. **Receipt photo viewer** -- New `ReceiptViewer` component with lightbox dialog. Backend queries (`getById`, `listPendingForApproval`) now resolve `receiptFileId` to `receiptUrl` via `ctx.storage.getUrl()`.
3. **Void vs Reject clarity** -- Dialog descriptions rewritten with clear guidance on when to use each. Void button gains a tooltip.
4. **Shared-receipt grouping** -- Approval queue groups expenses with matching receipt hashes under a sky-blue bordered card with a single shared receipt viewer.

---

## Critical Issues

**None.** No blocking issues found. The implementation is sound and backward-compatible.

---

## Improvements

### IMP-1: `Promise.all` for storage URL resolution in `listPendingForApproval` (Medium)

**File:** `convex/expenses/queries.ts` lines 205-214

The query now calls `ctx.storage.getUrl()` for every pending expense with a receipt. For a queue with, say, 30 pending expenses each with receipts, this is 30 sequential-within-Promise.all storage lookups. In Convex, `ctx.storage.getUrl()` is a fast internal operation (not a network call), so this is acceptable today. However, if the queue grows significantly, this could become a measurable cost on the query's reactive recalculation.

**Risk:** Low. Convex `ctx.storage.getUrl` is an internal lookup, not an external HTTP call. The pending queue is typically under 20 items. No action needed now, but worth noting for future reference.

### IMP-2: `sharedReceiptAcknowledged` flag cannot be revoked by approver (Medium)

**File:** `convex/expenses/mutations.ts`

Once the submitter sets `sharedReceiptAcknowledged: true`, there is no mechanism for an approver to dispute or revoke this flag. The approver sees the "Shared Receipt" badge and can reject the expense, but the flag persists on the document even after rejection.

**Recommendation:** This is fine for the current workflow -- rejection already sends it back for correction. If a submitter re-submits with the same hash after rejection, they would need to re-acknowledge. However, consider adding a note to the rejection dialog when `sharedReceiptAcknowledged` is true, so the approver can explicitly mention if the receipt sharing seems fraudulent.

### IMP-3: Grouping logic only groups expenses in the pending queue (Low)

**File:** `src/pages/ExpenseApproval.tsx` lines 68-117

The shared-receipt grouping is client-side, computed in a `useMemo` over the pending array. This means:
- Only expenses **currently pending** are grouped. If one of two shared-receipt expenses was already approved, the remaining one appears as a single card with just the "Shared Receipt" badge.
- The grouping does not consider expenses outside the pending queue (e.g., already approved or in draft).

This is acceptable behavior -- the approver sees the badge and can investigate. But worth documenting that the grouping is ephemeral and only reflects the current queue state.

---

## Refinements

### REF-1: Dark mode hardcoded colors in shared-receipt components

**Files:** `src/components/expenses/FraudFlags.tsx` line 71, `src/pages/ExpenseApproval.tsx` lines 301, 330, etc.

The "Shared Receipt" badge and group border use raw Tailwind sky colors (`text-sky-600`, `border-sky-300`, `bg-sky-50`, `dark:bg-sky-900/20`, `dark:text-sky-400`). Per `docs/CODE_STYLE.md` "Dark Mode" section, the project convention is to use CSS variable tokens (`--color-status-*`) instead of raw Tailwind color classes for semantic backgrounds.

However, the existing `StatusBadge.tsx` and `ExpenseCard.tsx` in the same expense module already use raw sky colors (confirmed by grep). So this is consistent with the local pattern, even though it deviates from the broader project standard.

**Recommendation:** Accept as-is for consistency with the expense module. If a semantic token is added for "info/linked" status later, update all sky-colored badges together.

### REF-2: PDF detection heuristic in ReceiptViewer

**File:** `src/components/expenses/ReceiptViewer.tsx` line 54

```typescript
const isPdf = receiptUrl.toLowerCase().includes(".pdf");
```

Convex storage URLs are typically of the form `https://xxx.convex.cloud/api/storage/xxx` without file extensions. The `.pdf` check will almost never match for Convex-stored files. The comment acknowledges this ("Convex storage URLs may not have extension"). In practice, all receipts uploaded via the expense system are photos (the `ReceiptUpload` component accepts images only).

**Recommendation:** Low risk. The code gracefully falls back to the `<img>` tag, which is correct for the expected input. If PDF support becomes a real requirement, the MIME type should be stored alongside `receiptFileId` in the schema and passed as a prop.

### REF-3: `onKeyDown` type cast in ReceiptViewer

**File:** `src/components/expenses/ReceiptViewer.tsx` line 64

```typescript
onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleOpen(e as unknown as React.MouseEvent); }}
```

The `as unknown as React.MouseEvent` double-cast is a code smell. `handleOpen` only uses the event for `e.stopPropagation()`, which both `KeyboardEvent` and `MouseEvent` share. A cleaner approach would be to have `handleOpen` accept `React.SyntheticEvent` instead of `React.MouseEvent`, or extract `stopPropagation` + `setOpen(true)` into a separate handler.

### REF-4: Missing `rejectionCount` in `SharedReceiptExpenseItem`

**File:** `src/pages/ExpenseApproval.tsx` lines 383-388

The `SharedReceiptExpenseItem` component passes `FraudFlags` without `rejectionCount` and does not call `useRejectionChain`. The main `ExpenseApprovalCard` does. This means rejection history badges are missing inside grouped items.

This appears intentional (the grouped items are a compact view), but it means an approver could miss rejection history on a shared-receipt expense. Consider adding the `useRejectionChain` hook call to `SharedReceiptExpenseItem` for completeness, or document this as a deliberate simplification.

### REF-5: `checkReceiptHash` query does not filter by status

**File:** `convex/expenses/queries.ts` lines 285-299

The `checkReceiptHash` query uses the `by_receipt_hash` index, which returns the **first** expense with that hash regardless of status. This means:
- If a voided expense had this hash, the query would still return it as a "duplicate," causing a false warning.
- If a draft (not yet submitted) by the same user has the hash, it would be caught (unless `excludeExpenseId` is passed).

The `excludeExpenseId` parameter handles the "editing own draft" case. But voided/rejected expenses with the same hash will trigger the warning unnecessarily.

**Recommendation:** Consider filtering by non-terminal statuses (`status !== "voided"`) in the query handler, or document this as acceptable (the warning is soft and can be acknowledged).

---

## Verdict

**APPROVE with minor suggestions.** This is a well-executed UX fix. The scope is appropriate, the backend changes are minimal and backward-compatible, the new schema field is optional (no migration needed), and the frontend additions follow existing patterns. The fraud control (FRAUD-02) is properly preserved -- the hard block still fires for unacknowledged duplicates.

Key strengths:
- Debug investigation file (`expense-photo-review-ux.md`) is exemplary -- clear symptoms, evidence, root cause, and fix plan.
- `checkReceiptHash` as a separate query (not embedded in mutations) is the right architectural choice -- enables reactive early detection without coupling to the submit flow.
- Schema change is backward-compatible: `sharedReceiptAcknowledged: v.optional(v.boolean())` requires no migration.
- Shared-receipt grouping is a smart bonus feature that meaningfully improves the approver experience.
- All security controls are maintained: FRAUD-02 still blocks unacknowledged duplicates, the approver sees the "Shared Receipt" flag, and the flag cannot be set without the submitter explicitly confirming.

Suggested post-merge:
1. Update `docs/CHANGELOG.md` (required per git workflow rules).
2. Consider adding a test for `checkReceiptHash` in `convex/expenses/__tests__/` to cover the `excludeExpenseId` edge case and voided-expense false positive (REF-5).
3. Add the `rejectionCount` to `SharedReceiptExpenseItem` (REF-4) if time permits.

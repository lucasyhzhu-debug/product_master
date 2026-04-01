# Staff Review: fix-component-units
Date: 2026-04-01
Branch: `claude/fix-component-units-OOvlA`

## Summary

This branch adds two capabilities to the kitchen shift system:
1. **ShiftHistoryList** -- Displays component gram production and waste data in shift history cards (read-only display).
2. **ShiftEditDialog** -- Allows managers to edit component produced grams and component waste entries when editing a past shift record.

The backend (Phase 69) already supports `componentProduced` and `componentWaste` fields on `kitchenShiftRecords`, and the `updateShiftRecord` mutation already accepts and validates these fields. This branch is purely frontend.

**Verdict: Solid, focused implementation with one important missed opportunity and a few minor issues.**

---

## Critical Issues

None. The implementation is functionally correct and safe to merge.

---

## Improvements

### 1. Missed Code Reuse -- ComponentProductionSection Not Used in ShiftEditDialog (Important)

`EndOfShiftForm` delegates all component production/waste UI to the reusable `ComponentProductionSection` component. `ShiftEditDialog` instead duplicates ~120 lines of near-identical JSX (produced inputs, waste accordion, waste entry rows, add-waste buttons). The two implementations are structurally identical:
- Same input layout (component name + number input + "g" suffix)
- Same waste accordion pattern (chevron toggle, reason select, grams input, remove button)
- Same add-waste pill buttons

**The `ComponentProductionSection` API already supports this use case.** Its props accept `produced: Record<string, number>`, `waste: ComponentWasteEntry[]`, and callback handlers. The only adaptation needed in `ShiftEditDialog` would be converting the `componentProducedRows` array state into a `Record<string, number>` (trivial).

**Risk:** Future changes to the component production UI (e.g., adding unit labels, validation indicators, or new waste reasons) will need to be applied in two places.

**Recommendation:** Refactor `ShiftEditDialog` to use `ComponentProductionSection` instead of duplicating the UI. Convert state from `ComponentProducedRow[]` to `Record<string, number>` to match the existing API.

### 2. No Validation of Component Waste vs Produced in ShiftEditDialog (Important)

`EndOfShiftForm.validate()` checks that component waste grams do not exceed component produced grams before allowing submission. The backend (`updateShiftRecord` mutation) also validates this and will throw a `ConvexError`.

`ShiftEditDialog` has NO client-side validation for component waste exceeding component produced. It only validates product-level inventory deltas. While the backend will catch the error and display it via `toast.error`, the UX is degraded -- the user goes through "Review Changes" confirmation only to get an error toast after clicking "Confirm Edit".

**Recommendation:** Add a `computeComponentDeltas()` or validate component waste in `handleReviewChanges()` before showing the confirmation dialog, consistent with what `EndOfShiftForm` does.

### 3. Confirmation Dialog Does Not Show Component Changes (Moderate)

The "Review Changes" confirmation dialog (`showConfirm` state) computes and displays `InventoryDelta[]` for product-level changes. Component production/waste changes are submitted silently with no review step. This is inconsistent -- the whole point of the two-step review is to let managers see what they are changing before committing.

**Recommendation:** Add a component delta summary below the product delta summary. Even a simple "Component changes: Dough: 500g -> 300g" would suffice.

---

## Refinements

### 4. State Not Reset When `record` Prop Changes (Minor)

`ShiftEditDialog` initializes state with `useState(() => ...)` initializers that read from `record`. If the parent re-opens the dialog with a different `record` (unlikely in current UX but possible), the state will be stale because React `useState` initializers only run on mount.

The parent currently unmounts the dialog by setting `editRecord` to `null`, so in practice this is safe. But it is fragile -- if the parent is refactored to keep the dialog mounted, this becomes a bug.

**Recommendation:** No action needed now, but consider adding a `key={record._id}` to force remount:
```tsx
<ShiftEditDialog key={editRecord._id} record={editRecord} ... />
```

### 5. Type Interfaces Duplicated Across Files (Nitpick)

`ComponentProducedEntry` and `ComponentWasteEntry` are defined in `ShiftHistoryList.tsx` (exported), and structurally identical interfaces `ComponentProducedRow`/`ComponentWasteRow` are defined in `ShiftEditDialog.tsx` (private). The only difference is `reason` is typed as `string` in the history list vs `WasteReason` in the edit dialog.

A shared type file would be cleaner, but this is a minor concern for two interfaces in closely related files.

### 6. `as unknown as ShiftRecord[]` Cast in ShiftHistoryList (Pre-existing, Nitpick)

Line 194: `history as unknown as ShiftRecord[]` is a double cast that bypasses type checking. This pre-dates this branch but the new `componentProduced`/`componentWaste` fields on `ShiftRecord` could silently diverge from the backend query return type. The proper fix would be to use the Convex-generated return type directly or define a shared type that stays synchronized.

### 7. Missing `editNote` Display in History for Component-Only Edits (Nitpick)

`editNote` is already displayed in the history card (pre-existing). No issue here, just confirming it works for component edits too since the backend stores `editNote` regardless of what was edited.

---

## Architecture Assessment

- **Backend compatibility:** The frontend changes align perfectly with the existing `updateShiftRecord` mutation args (Phase 69 fields are already accepted).
- **Pattern consistency:** The edit dialog follows the same state management pattern as the existing product-level editing (array of rows, inline handlers, map/filter for submission).
- **No regressions:** The `componentProduced` and `componentWaste` fields are optional throughout, so records without components render exactly as before.
- **Query data flow:** The backend `enrichRecord()` already passes through component data, so no backend changes are needed.

---

## Missing Pieces

1. **No way to ADD new components during edit** -- If the original shift record had zero components (submitted before Phase 69 or with no component data), the edit dialog shows nothing because `componentProducedRows.length > 0` gates the entire section. This means managers cannot retroactively add component data to old records. This may be intentional (edit-only, not augment) but should be a conscious product decision.

2. **Component changes not included in `computeDeltas()`** -- The delta computation only handles product-level inventory. Components do not currently affect any inventory table (they are informational/tracking only), so this is correct behavior. But if component production ever drives inventory (e.g., ingredient deduction for component prep), this will need updating.

---

## Final Verdict

**Approve with suggestions.** The implementation is correct, safe, and well-structured. The most impactful improvement would be reusing `ComponentProductionSection` to avoid the 120-line duplication. The missing client-side validation for component waste is a minor UX gap (backend catches it). Neither issue blocks merging.

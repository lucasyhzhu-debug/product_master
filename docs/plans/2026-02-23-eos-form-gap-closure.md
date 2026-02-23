# EoS Form Gap Closure — Design

**Date:** 2026-02-23
**Status:** Approved
**Files:** `src/components/kitchen/EndOfShiftForm.tsx`, `src/components/kitchen/ShiftReviewModal.tsx`

---

## Problem

Three gaps remain in the End-of-Shift form after Phase 21 UAT-r2:

1. Waste entries for disabled-component products (e.g. Jumbo when Jumbo is toggled off) still appear in the waste section and are submitted.
2. Mutation errors on "Confirm & Submit" fire a Sonner toast instead of an inline error on the review screen.
3. No live over/under feedback while entering produced quantities — staff have to advance to the review screen to see deltas.

---

## Fix 1 — Waste filtered by enabled components

**Scope:** `EndOfShiftForm.tsx`

`wasteEntries` state is not filtered when `enabledComponents` changes. A Jumbo waste entry added before disabling Jumbo persists in state, renders in the waste section, and is submitted.

**Solution:** Compute `visibleWasteEntries` the same way `visibleItems` is computed — filter out entries whose product's ball types are all outside `enabledComponents`:

```ts
const visibleWasteEntries = wasteEntries.filter((entry) => {
  if (!enabledComponents || !productBallTypes) return true;
  const ballTypes = productBallTypes[entry.menuProductId] ?? [];
  if (ballTypes.length === 0) return true;
  return ballTypes.some((bt) => enabledComponents.includes(bt));
});
```

Use `visibleWasteEntries` everywhere `wasteEntries` is rendered and in `buildWasteList()`. The source `wasteEntries` state is not mutated — if Jumbo is re-enabled, those entries reappear correctly.

---

## Fix 2 — Inline error on review screen

**Scope:** `EndOfShiftForm.tsx`, `ShiftReviewModal.tsx`

**Problem:** `handleConfirm` catches mutation errors and calls `toast.error(msg)`. The toast is easy to miss and feels disconnected from the review screen.

**Solution:**

- Add `confirmError: string | null` state to `EndOfShiftForm`, initialised to `null`
- Clear on entering review step (`setStep("review")` call)
- On catch in `handleConfirm`, set `confirmError` instead of calling toast
- Pass `confirmError` as prop to `ShiftReviewModal`
- `ShiftReviewModal` renders an amber error block above the action buttons when `error` is set:
  ```tsx
  {error && (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
      {error}
    </div>
  )}
  ```
- Remove `import { toast } from "sonner"` from `EndOfShiftForm` (no toasts needed for this path)

---

## Fix 3 — Per-product inline delta on input step

**Scope:** `EndOfShiftForm.tsx`

**Row layout (approved):**

```
[Product name — flex-1]      target: 113   [  100  ]   -13 under
                                 ↑ muted      ↑ input    ↑ delta
```

**Behaviour:**
- Delta only renders when `getProducedQty(id) > 0`
- Delta = `produced - target`
- Colour: amber = under target (`delta < 0`), emerald = on target or over (`delta >= 0`)
- Text: `-13 under` / `+7 over` / `✓ on target`

**Implementation:**

Move `target: X` out of the `<Label>` sub-line and into the right-hand cluster. The warning flag (mixed ball types) stays under the product name in the label.

```tsx
<div key={item.menuProductId} className="flex items-center gap-2">
  {/* Product name + optional warning — left */}
  <Label htmlFor={`produced-${item.menuProductId}`} className="flex-1 text-sm font-normal min-w-0">
    <span className="block truncate">{item.name}</span>
    {isFlagged && (
      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-0.5">
        <AlertTriangle className="h-3 w-3" />
        Mixed ball types — one type disabled
      </span>
    )}
  </Label>

  {/* target label */}
  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
    target: {item.quantity}
  </span>

  {/* input */}
  <Input
    id={`produced-${item.menuProductId}`}
    type="number"
    min={0}
    value={getProducedQty(item.menuProductId) || ""}
    placeholder="0"
    onChange={(e) => setProducedQty(item.menuProductId, Number(e.target.value))}
    className="w-20 text-right tabular-nums shrink-0"
  />

  {/* live delta — only when value entered */}
  {getProducedQty(item.menuProductId) > 0 && (() => {
    const qty = getProducedQty(item.menuProductId);
    const delta = qty - item.quantity;
    const isOver = delta >= 0;
    return (
      <span className={`text-xs font-medium tabular-nums w-20 text-right shrink-0 ${
        isOver ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
      }`}>
        {delta === 0 ? "✓ on target" : isOver ? `+${delta} over` : `${delta} under`}
      </span>
    );
  })()}
</div>
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/kitchen/EndOfShiftForm.tsx` | Fix 1 (waste filter), Fix 2 (confirmError state), Fix 3 (per-product delta layout) |
| `src/components/kitchen/ShiftReviewModal.tsx` | Fix 2 (inline error prop + render) |

---

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Waste section hides entries for disabled-component products
- [ ] Disabled-product waste entries excluded from `buildWasteList()` / submission
- [ ] Mutation error on review screen shows inline amber box, no toast
- [ ] Per-product row: `target: X` inline next to input, `+/-N over/under` delta to right of input
- [ ] Delta only visible when quantity > 0

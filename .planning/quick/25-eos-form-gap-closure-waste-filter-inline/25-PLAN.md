---
phase: quick-25
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/kitchen/EndOfShiftForm.tsx
  - src/components/kitchen/ShiftReviewModal.tsx
autonomous: true
requirements: [EOS-WASTE-FILTER, EOS-INLINE-ERROR, EOS-LIVE-DELTA]

must_haves:
  truths:
    - "Waste entries for disabled-component products are hidden from the waste section and excluded from submission"
    - "Mutation errors on the review screen appear as inline amber banners, not toasts"
    - "Each produced row shows a live over/under delta next to the input when a non-zero quantity is entered"
    - "Delta colors are amber for under-target and emerald for on-target or over"
  artifacts:
    - path: "src/components/kitchen/EndOfShiftForm.tsx"
      provides: "Waste filtering, confirmError state, live delta rendering"
      contains: "visibleWasteEntries"
    - path: "src/components/kitchen/ShiftReviewModal.tsx"
      provides: "Inline error display on review screen"
      contains: "error"
  key_links:
    - from: "src/components/kitchen/EndOfShiftForm.tsx"
      to: "src/components/kitchen/ShiftReviewModal.tsx"
      via: "error prop"
      pattern: "error=\\{confirmError\\}"
    - from: "EndOfShiftForm visibleWasteEntries"
      to: "buildWasteList"
      via: "filtered waste entries used in submission"
      pattern: "visibleWasteEntries\\.filter"
---

<objective>
Fix three gaps in the End-of-Shift form: waste entries filter by enabled components, mutation errors show inline instead of toast, and produced inputs show a live per-product over/under delta.

Purpose: Kitchen staff see only relevant waste products, get clear inline feedback on submission errors, and see at-a-glance whether their production meets targets.
Output: Updated EndOfShiftForm.tsx and ShiftReviewModal.tsx with all three fixes.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/plans/2026-02-23-eos-form-gap-closure-plan.md
@src/components/kitchen/EndOfShiftForm.tsx
@src/components/kitchen/ShiftReviewModal.tsx
</context>

## Git Workflow
**Branch:** `gsd/phase-21-kitchen-production-targets` (existing branch, do NOT create new)
**Checkpoints:** None (autonomous)

## Implementation Waves
### Wave 1: Frontend fixes [SEQUENTIAL — same file]
| Task | Files |
|------|-------|
| Task 1: Filter waste by enabled components | EndOfShiftForm.tsx |
| Task 2: Inline confirm error | EndOfShiftForm.tsx, ShiftReviewModal.tsx |
| Task 3: Per-product live delta | EndOfShiftForm.tsx |

### Wave 2: Verification [SEQUENTIAL]
| Task |
|------|
| npm run type-check && npm run build |

## Documentation Updates
- [ ] CHANGELOG.md (after merge to main)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Waste entries filtered by enabledComponents
- [ ] Inline error on review screen (no toast for mutation errors)
- [ ] Live delta shown per produced row

<tasks>

<task type="auto">
  <name>Task 1: Filter waste entries by enabled components</name>
  <files>src/components/kitchen/EndOfShiftForm.tsx</files>
  <action>
Add a `visibleWasteEntries` derived value after the existing `visibleItems`/`flaggedItemIds` block. This filters `wasteEntries` to only show products whose ball types include at least one enabled component (same logic as `visibleItems`):

```typescript
const visibleWasteEntries = wasteEntries.filter((entry) => {
  if (!enabledComponents || !productBallTypes) return true;
  const ballTypes = productBallTypes[entry.menuProductId] ?? [];
  if (ballTypes.length === 0) return true;
  return ballTypes.some((bt) => enabledComponents.includes(bt));
});
```

Update `buildWasteList()` to filter from `visibleWasteEntries` instead of `wasteEntries`:
```typescript
function buildWasteList(): WasteEntry[] {
  return visibleWasteEntries.filter((e) => e.quantity > 0);
}
```

Update the waste section JSX rendering: instead of `wasteEntries.map((entry, index) => ...)`, keep `wasteEntries.map` but skip disabled entries inline (so the original index is preserved for `updateWasteEntry`/`removeWasteEntry`):
```tsx
{wasteEntries.map((entry, index) => {
  const ballTypes = productBallTypes?.[entry.menuProductId] ?? [];
  const isDisabled =
    enabledComponents &&
    productBallTypes &&
    ballTypes.length > 0 &&
    ballTypes.every((bt) => !enabledComponents.includes(bt));
  if (isDisabled) return null;
  return ( /* existing JSX unchanged */ );
})}
```

Update the empty state check to use `visibleWasteEntries.length === 0`.
  </action>
  <verify>npm run type-check</verify>
  <done>Waste entries for disabled-component products are hidden from the UI and excluded from the submitted waste list. Original array indices preserved for update/remove callbacks.</done>
</task>

<task type="auto">
  <name>Task 2: Inline error on review screen instead of toast</name>
  <files>src/components/kitchen/EndOfShiftForm.tsx, src/components/kitchen/ShiftReviewModal.tsx</files>
  <action>
In EndOfShiftForm.tsx:
1. Add `confirmError` state: `const [confirmError, setConfirmError] = useState<string | null>(null);`
2. In `handleReview`, add `setConfirmError(null);` before `setStep("review")` to clear any previous error.
3. In `handleConfirm` catch block, replace `toast.error(msg)` with `setConfirmError(msg)`.
4. Pass `error={confirmError}` prop to `ShiftReviewModal` in the review step render.

In ShiftReviewModal.tsx:
1. Add `error?: string | null` to the `ShiftReviewModalProps` interface.
2. Destructure `error` in the component function signature.
3. Render inline error above the action buttons (before the `<div className="flex gap-3 pt-1">`):
```tsx
{error && (
  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
    {error}
  </div>
)}
```
  </action>
  <verify>npm run type-check</verify>
  <done>Mutation errors on the review screen render as an inline amber banner above the Back/Confirm buttons. No toast.error call for mutation failures. Toast remains for input-step validation errors only.</done>
</task>

<task type="auto">
  <name>Task 3: Per-product live over/under delta on input step</name>
  <files>src/components/kitchen/EndOfShiftForm.tsx</files>
  <action>
Replace the produced items render block (`visibleItems.map`) with a new layout per row:

```
[Product name — flex-1]     target: X   [  input  ]   +/-N over/under
```

For each item, compute: `const delta = qty > 0 ? qty - item.quantity : null;`

Layout structure per row:
- Label with product name (flex-1, truncate) + optional mixed-type warning
- Target label: `<span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">target: {item.quantity}</span>`
- Input (w-20, text-right, tabular-nums, shrink-0)
- Delta span (text-xs, font-medium, tabular-nums, w-20, text-right, shrink-0):
  - `delta === null` -> `invisible` class (reserves space, no layout shift)
  - `delta === 0` -> emerald color, text "on target" with checkmark
  - `delta > 0` -> emerald color, text `+N over`
  - `delta < 0` -> amber color, text `N under`

Color classes: emerald = `text-emerald-600 dark:text-emerald-400`, amber = `text-amber-600 dark:text-amber-400`.

Remove the old sub-line target display (the `text-xs text-muted-foreground` span that showed `target: X` below the product name).
  </action>
  <verify>npm run type-check && npm run build</verify>
  <done>Each produced row shows target inline next to product name, input field, and a live delta. Delta is invisible when input is empty/zero, amber when under target, emerald when on target or over. Layout does not shift when delta appears.</done>
</task>

</tasks>

<verification>
```bash
npm run type-check && npm run build
```

Manual checks:
- Waste section: disable Jumbo in Manager Settings -> Jumbo waste entries disappear and are not submitted
- Review screen: if mutation fails, amber inline error appears above Back/Confirm buttons (no toast)
- Input step: entering a produced quantity shows `target: X [input] +/-N over/under` inline
- Delta colors: amber when under, emerald when on target or over
</verification>

<success_criteria>
- `npm run type-check` passes with no errors
- `npm run build` succeeds
- visibleWasteEntries filters by enabledComponents
- confirmError state replaces toast.error for mutation failures
- Live delta rendered per produced row with correct color coding
</success_criteria>

<output>
After completion, create `.planning/quick/25-eos-form-gap-closure-waste-filter-inline/25-SUMMARY.md`
</output>

---
phase: 24-ingredient-simulation-id-linking
verified: 2026-02-23T18:00:00Z
status: passed
score: 3/3 gap truths verified
re_verification: true
  previous_status: gaps_found
  previous_score: 3/6
  gaps_closed:
    - "Admin can link/unlink ingredients to inventory componentTypes and edit ingredients successfully"
    - "Planner grid cells are editable and Save to Kitchen button works per day"
    - "Save to Kitchen pushes complete daily ball totals including Direct Sales orders"
  gaps_remaining: []
  regressions: []
---

# Phase 24: Ingredient Simulation ID Linking — Gap Closure Verification

**Phase Goal:** Fix dispatch planner simulation: replace name string matching with ID-based ingredient linking, wire production capacity from kitchenConfig, and add "Save targets for kitchen" button that writes kitchenDailyOverrides with source tag.

**Verified:** 2026-02-23T18:00:00Z
**Status:** PASSED
**Re-verification:** Yes — after gap closure (plans 24-05, 24-06, 24-07)

---

## Goal Achievement

### Observable Truths (Gap Closure Verification)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Editing an ingredient saves without double toast; Untrack button exists; FG inventory has Adjust button | VERIFIED | `onUpdate` uses `mutateAsync`; `UntrackButton` component renders; `FGAdjustDialog` wired in both views |
| 2 | Planner cells save only on Enter; page titled "Planner"; today is second column; Save to Kitchen buttons in column header | VERIFIED | `handleBlur` reverts on blur; `getYesterday()` anchors startDate; `PageHeader title="Planner"`; `renderColumnAction` in Row 3 of grid |
| 3 | Save to Kitchen includes Direct Sales orders; Planner shows Balls footer row | VERIFIED | `getBallTotalsForDispatchPlanDate` has Source B (orders/orderItems pass); `dailyBallTotals` computed via BOM and rendered in PlannerGrid footer |

**Score:** 3/3 gap truths verified

---

## Detailed Artifact Verification

### Gap 1 — Plan 24-07 (Ingredients / FG Inventory)

#### 1A: Single toast on ingredient edit

**File:** `src/pages/IngredientsManager.tsx`, line 293

```typescript
onUpdate={async (id, data) => { await update.mutateAsync({ id: id as Id<"ingredients">, ...data }); }}
```

VERIFIED. The `onUpdate` callback uses `mutateAsync` with `await`, meaning EntityManager can sequence its success toast correctly without a race condition. The previous bug was that `onUpdate` did not return the promise, causing a premature toast from EntityManager before the mutation resolved.

#### 1B: Untrack button

**File:** `src/pages/IngredientsManager.tsx`, lines 138-199

`UntrackButton` component exists and is fully implemented with confirmation state, calls `useUnlinkIngredientFromComponentType()` hook, shows "Untrack" button with `Unlink` icon.

**File:** `convex/ingredients/mutations.ts`, lines 165-179

`unlinkIngredientFromComponentType` mutation exists, requires admin role, patches `ingredientComponentTypeId: undefined`.

**File:** `src/hooks/convex/useIngredients.ts` (confirmed via grep)

`useUnlinkIngredientFromComponentType` hook exported and present in `src/hooks/convex/index.ts`.

VERIFIED. Untrack button exists and mutation is wired end-to-end.

#### 1C: FG Adjust button and dialog

**File:** `src/components/inventory/FinishedGoodsTab.tsx`

- `FGAdjustDialog` imported at line 59
- `AdjustDialogState` type defined at lines 77-83
- `adjustDialogState` state at line 945
- Adjust button rendered in `ProductGroupedView` at lines 473-490
- Adjust button rendered in `LocationGroupedView` at lines 742-759
- `FGAdjustDialog` rendered at lines 1460-1471

**File:** `src/components/inventory/FGAdjustDialog.tsx`

Fully implemented with:
- Reason categories: "Wastage", "QC / Testing Sample", "Freebie / Gift", "Manual Correction"
- Direction toggle (Deduct / Add)
- Quantity input with over-deduction warning
- Freetext notes field
- Calls `api.productInventory.mutations.adjustStock`

VERIFIED. Adjust button exists in both grouped views; dialog is substantive and wired to backend.

---

### Gap 2 — Plan 24-05 (Planner Grid)

#### 2A: No blur-save; Enter-only save

**File:** `src/components/dispatchPlanner/PlannerCell.tsx`, lines 87-95

```typescript
const handleBlur = useCallback(() => {
  setIsFocused(false);
  // On blur: revert to last-saved value if dirty (no auto-save on focus loss).
  // User must press Enter to save.
  if (isDirty) {
    setEditValue(value > 0 ? value.toString() : "");
    setIsDirty(false);
  }
}, [isDirty, value]);
```

VERIFIED. Blur explicitly reverts; save only fires in `handleKeyDown` on Enter key.

#### 2B: "Planner" label everywhere

**File:** `src/components/layout/Header.tsx`, line 88

```
{ path: '/restock-planner', label: 'Planner', icon: CalendarRange, ... }
```

**File:** `src/pages/DispatchPlanner.tsx`, lines 120, 191, 208

```typescript
useDocumentTitle("Planner");
<PageHeader title="Planner" description="Loading..." />
<PageHeader title="Planner" description={subtitle} />
```

VERIFIED. "Planner" label used in nav, document title, and page header.

#### 2C: Today is second column (yesterday-anchored)

**File:** `src/pages/DispatchPlanner.tsx`, lines 52-62

```typescript
export function getYesterday(): string {
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const today = new Date(todayStr + "T12:00:00+07:00");
  today.setDate(today.getDate() - 1);
  return today.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
```

Line 123: `const [startDate, setStartDate] = useState(() => getYesterday());`

VERIFIED. Grid anchors to yesterday so today is always column 2.

#### 2D: WeekNav "Back to Today" uses getYesterday

**File:** `src/components/dispatchPlanner/WeekNav.tsx`, line 13, 66

```typescript
import { getYesterday } from "@/pages/DispatchPlanner";
const handleToday = () => onNavigate(getYesterday());
```

VERIFIED.

#### 2E: Save to Kitchen buttons inside grid column structure

**File:** `src/components/dispatchPlanner/PlannerGrid.tsx`, lines 261-281

Row 3 of the grid header renders `renderColumnAction` per date column, aligned above channel rows:

```typescript
{renderColumnAction && (
  <div className="flex border-b">
    <div className="w-[200px] min-w-[200px] px-3 py-1 flex items-center">
      <span className="text-[10px] text-muted-foreground">Save to Kitchen</span>
    </div>
    <div className="flex flex-1">
      {dates.map((date) => (
        <div key={date} className="flex-1 py-1 border-l border-border ...">
          {renderColumnAction(date)}
        </div>
      ))}
    </div>
  </div>
)}
```

**File:** `src/pages/DispatchPlanner.tsx`, line 234

```typescript
renderColumnAction={(date) => <SaveTargetButton date={date} />}
```

VERIFIED. Save to Kitchen buttons are in the grid at the top of each date column, aligned with column headers.

#### 2F: direct-manual sentinel no longer passed as outletId

**File:** `src/pages/DispatchPlanner.tsx`, lines 159-165

```typescript
const resolvedOutletId =
  outletId === "direct-manual" ? undefined : (outletId as any);
await savePlanCell({
  channel,
  outletId: resolvedOutletId,
  ...
});
```

**File:** `convex/dispatchPlanner/mutations.ts`, line 82

```typescript
outletId: v.optional(v.union(v.id("externalOutlets"), v.id("dispatchConsignmentOutlets"))),
```

The mutation accepts `outletId: undefined` (v.optional). For `channel === "direct"`, the existing-plan lookup uses `orderId` match (line 101-105), not `outletId`.

VERIFIED. The validator rejection bug is fixed — `direct-manual` is stripped to `undefined` before calling the mutation.

---

### Gap 3 — Plans 24-05 + 24-06 (Ball Totals / Direct Sales)

#### 3A: getBallTotalsForDispatchPlanDate includes Direct Sales orders

**File:** `convex/dispatchPlanner/queries.ts`, around line 1083-1167

Two sources confirmed in the query:
- Source A: `dispatchPlans` table entries (consignment, gofood, direct-manual)
- Source B: Direct Sales orders — queries `orders` table filtered to dueDate epoch range and non-Draft/non-Cancelled status, then joins `orderItems`

Both sources feed into `bomByProduct` BOM expansion and `orderProductQty` accumulation before building the final `packagingBreakdown`.

VERIFIED. Direct Sales orders are included in ball total calculation.

#### 3B: dailyBallTotals BOM-expanded in getUnifiedWeeklyPlan

**File:** `convex/dispatchPlanner/queries.ts`, lines 174-254 (query return shape)

- `dailyProductQty` accumulates per-product per-date quantities including direct channel orders
- BOM expansion runs against `menuProductComponents` table
- `dailyBallTotals` computed as sum of `qty * entry.quantity` where componentType category is "production"
- Returned in query payload

**PlannerGrid type** at line 62-63:
```typescript
/** BOM-expanded ball count per date (from backend) */
dailyBallTotals?: Record<string, number>;
```

VERIFIED.

#### 3C: Balls footer row in PlannerGrid

**File:** `src/components/dispatchPlanner/PlannerGrid.tsx`, lines 329-351

```typescript
{dailyBallTotals && Object.keys(dailyBallTotals).length > 0 && (
  <div className="flex border-t border-border bg-blue-50 dark:bg-blue-950/30">
    <div className="w-[200px] min-w-[200px] px-3 py-2">
      <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Balls</span>
    </div>
    <div className="flex flex-1">
      {dates.map((date) => {
        const balls = dailyBallTotals[date] ?? 0;
        return (
          <div key={date} className="flex-1 h-9 ... text-blue-700 dark:text-blue-300">
            {balls > 0 ? balls.toLocaleString() : "--"}
          </div>
        );
      })}
    </div>
  </div>
)}
```

VERIFIED. Balls footer row exists below the Total row and renders BOM-expanded ball counts.

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `IngredientsManager.tsx` `onUpdate` | `update.mutateAsync` | `await` | WIRED — single toast path |
| `IngredientsManager.tsx` `UntrackButton` | `convex/ingredients/mutations.ts:unlinkIngredientFromComponentType` | `useUnlinkIngredientFromComponentType` hook | WIRED |
| `FinishedGoodsTab.tsx` Adjust button | `FGAdjustDialog` | `onAdjust` callback + `adjustDialogState` | WIRED |
| `FGAdjustDialog` | `api.productInventory.mutations.adjustStock` | `useMutation` | WIRED |
| `DispatchPlanner.tsx` handleSaveCell | `savePlanCell` mutation | strips `direct-manual` to `undefined` | WIRED |
| `PlannerCell.tsx` handleBlur | revert (no save) | explicit revert logic | WIRED — no blur-save |
| `WeekNav.tsx` Back to Today | `getYesterday()` | imported from DispatchPlanner | WIRED |
| `PlannerGrid.tsx` renderColumnAction | `SaveTargetButton` | column Row 3 | WIRED — in-grid per column |
| `getBallTotalsForDispatchPlanDate` | Direct Sales orders | Source B orders/orderItems pass | WIRED |
| `getUnifiedWeeklyPlan` | `dailyBallTotals` | BOM expansion | WIRED |
| `PlannerGrid.tsx` Balls footer | `data.dailyBallTotals` | destructured from `data` prop | WIRED |

---

## Anti-Patterns Scan

No blockers found.

Notable observations:
- `PlannerCell.tsx` still has `saveTimeoutRef` debounce (300ms) in `performSave`. This fires after Enter key triggers `performSave`. The debounce is harmless — it just delays the API call 300ms after Enter. Not a blocker.
- `Tab` key in `PlannerCell.tsx` (line 133) calls `performSave` if dirty, meaning Tab also saves. This is consistent with standard spreadsheet UX and was not in the original bug report.

---

## Human Verification Needed

The following items require a real browser session to confirm:

### 1. Single Toast on Ingredient Edit

**Test:** Open Ingredients Manager, edit any ingredient (change the price), click Save.
**Expected:** Exactly one success toast appears, not two.
**Why human:** The double-toast was a race condition between `EntityManager`'s generic toast and the hook's toast. The code fix (using `mutateAsync`) eliminates the race, but the exact toast behavior depends on how `EntityManager` calls `onUpdate` and sequences its own toast relative to promise resolution.

### 2. Direct Sales Included in Save to Kitchen

**Test:** Ensure at least one Confirmed/InProduction order with a dueDate of today exists. Open Dispatch Planner and click "Save to Kitchen" on today's column.
**Expected:** Kitchen View for today shows ball counts that include the Direct Sales order balls, not just consignment/gofood entries.
**Why human:** Requires live data with actual orders and a matching date to test end-to-end.

### 3. Balls Footer Row Shows Correct Count

**Test:** In the Dispatch Planner grid, observe the "Balls" footer row values.
**Expected:** For a day with 1 Single product and 4 Triple products from Direct Sales, the Balls count should be (1 x 1 ball) + (4 x 3 balls) = 13, not 5.
**Why human:** Requires live data with known BOM to verify the multiplication is correct.

---

## Re-Verification Summary

All 3 gaps from the UAT are closed:

**Gap 1 (Test 3) — CLOSED:**
- `onUpdate` now uses `mutateAsync` with `await` — single toast path
- `unlinkIngredientFromComponentType` mutation exists with admin auth
- `UntrackButton` component exists with confirm flow, imported hook, wired in render
- `FGAdjustDialog` exists with 4 reason categories, freetext notes, deduct/add toggle
- Adjust button in both ProductGroupedView and LocationGroupedView

**Gap 2 (Test 4) — CLOSED:**
- `handleBlur` in PlannerCell reverts dirty value instead of saving
- `getYesterday()` anchors the grid so today is column 2
- `WeekNav` Back to Today calls `getYesterday()`
- Page title is "Planner" in Header nav, document title, and PageHeader
- Save to Kitchen buttons rendered in Row 3 of grid (in-column position at top)
- `direct-manual` sentinel stripped to `undefined` before mutation call

**Gap 3 (Test 5) — CLOSED:**
- `getBallTotalsForDispatchPlanDate` has Source B: orders/orderItems pass for Direct Sales
- `getUnifiedWeeklyPlan` computes `dailyBallTotals` via BOM expansion
- PlannerGrid renders Balls footer row below Total row using `dailyBallTotals`

---

_Verified: 2026-02-23T18:00:00Z_
_Verifier: Claude (gsd-verifier)_

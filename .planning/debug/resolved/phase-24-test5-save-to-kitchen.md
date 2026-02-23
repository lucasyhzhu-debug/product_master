---
status: resolved
trigger: "Phase 24 UAT Test 5 — Save to Kitchen data incomplete (3 sub-issues)"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: All three issues confirmed. Root causes identified for each.
test: Static code tracing — no runtime execution needed.
expecting: N/A — investigation complete.
next_action: Deliver structured diagnosis to implementer.

## Symptoms

expected:
  1. "Save to Kitchen" pushes ball totals from ALL sources for that date (dispatch plan cells + Direct Sales orders).
  2. The Total row in the Planner grid shows the correct product count including triples counted as 3 units (balls).
  3. A separate "Balls" row shows the actual ball production count needed for the kitchen.

actual:
  1. "Save to Kitchen" only reads from the `dispatchPlans` table. Direct Sales orders (from the `orders`/`orderItems` tables) are not included. The ball totals sent to kitchen are always partial.
  2. The Total row shows the raw product count (e.g., 706). For a triple that is 3 balls in 1 box, it counts 1 — not 3. There is no separate Balls row.
  3. No Balls total row exists in the grid at all.

errors: No runtime errors. Silent data loss — the kitchen receives fewer targets than needed.
reproduction: "Save to Kitchen" for any date that has confirmed Direct Sales orders (dueDate matches the target date).
started: Phase 24 implementation (new feature, was not working from day 1).

## Eliminated

- hypothesis: getBallTotalsForDispatchPlanDate uses wrong index or wrong date comparison
  evidence: Index `by_date` on dispatchPlans is used correctly; date is passed as YYYY-MM-DD string.
  timestamp: 2026-02-23

- hypothesis: Direct Sales orders are not loaded in the grid at all
  evidence: assembleDirectChannel() in queries.ts (lines 228–388) correctly reads from `orders` and `orderItems` tables and adds to `dailyTotals["direct"]`. They ARE shown in the grid. The gap is only in getBallTotalsForDispatchPlanDate which does NOT read orders.
  timestamp: 2026-02-23

- hypothesis: dailyTotals already contains ball counts (BOM-expanded)
  evidence: dailyTotals is a flat product-count map: `Record<string, Record<string, number>>` keyed `[date][channelKey] = qty`. Qty is raw product quantity, not ball-expanded. grandTotals in PlannerGrid (line 144-151) sums these directly.
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: convex/dispatchPlanner/queries.ts lines 1020–1075 (getBallTotalsForDispatchPlanDate)
  found: |
    Query ONLY reads from `dispatchPlans` table (line 1023):
      const dayPlans = await ctx.db
        .query("dispatchPlans")
        .withIndex("by_date", (q) => q.eq("date", args.date))
        .collect();
    Direct Sales orders live in `orders`/`orderItems` tables.
    Direct Sales rows shown in the grid are assembled from `orders` in assembleDirectChannel().
    Order-derived quantities are written to `dailyTotals["direct"]` in the main query
    but are NEVER written to `dispatchPlans` — they remain only in the `orders` table.
    Therefore getBallTotalsForDispatchPlanDate will always return 0 for the Direct channel.
  implication: Save to Kitchen silently omits all Direct Sales order volume.

- timestamp: 2026-02-23
  checked: convex/dispatchPlanner/queries.ts assembleDirectChannel() lines 259–343 and 346–388
  found: |
    Two distinct sub-sources for the "direct" channel:
    A) Real confirmed orders (from `orders` table, dueDate in range, not Draft/Cancelled).
       Quantities added to dailyTotals[dueDateStr]["direct"] at line 329.
    B) Manual "Planned (Manual)" entries (from `dispatchPlans` table, channel="direct", no orderId).
       Quantities added to dailyTotals[date]["direct"] at line 369.
    getBallTotalsForDispatchPlanDate only captures source B (dispatchPlans).
    Source A (real orders) is invisible to it.
  implication: The split data model (orders vs dispatchPlans) means the save function
    must explicitly aggregate both. It currently does not.

- timestamp: 2026-02-23
  checked: src/components/dispatchPlanner/PlannerGrid.tsx lines 143–151 (grandTotals computation)
  found: |
    grandTotals[date] = sum of dailyTotals[date][channelKey] for all channels.
    dailyTotals contains product count (not ball count). e.g., 1 Triple = 1 product unit.
    The BOM for a Triple has quantity=3 for MID_BALL (confirmed by migrations/bomBackfill.ts line 50:
      { nameContains: "Original - Triple", bomCode: "MID_BALL", quantity: 3 }
    and menuProductComponents/mutations.ts line 217:
      - BITE_TRIPLE: 3 MID_BALL
    ).
    The grandTotals computation does NOT multiply by BOM ball counts.
    Total row in PlannerGrid footer (lines 277–299) renders grandTotals[date] directly.
  implication: Total row shows product boxes/units, not balls produced.
    For 500 singles + 200 triples: shows 700, should show 500 + 600 = 1100 balls.

- timestamp: 2026-02-23
  checked: src/components/dispatchPlanner/PlannerGrid.tsx lines 277–299 (Total row JSX)
  found: |
    Single "Total" row rendered at the footer. No "Balls" sub-row exists.
    The row sums grandTotals[date] which is product count.
    There is no BOM traversal anywhere in PlannerGrid.tsx — the component has no
    access to componentTypes or menuProductComponents data.
  implication: A Balls row would require either: (a) the backend query to return
    dailyBallTotals in addition to dailyTotals, or (b) the frontend to receive
    BOM data and compute ball counts client-side.

- timestamp: 2026-02-23
  checked: convex/dispatchPlanner/queries.ts getBallTotalsForDispatchPlanDate (lines 1048–1065)
  found: |
    Ball counting IS correctly implemented for dispatchPlans entries:
      for (const plan of dayPlans) {
        const bom = bomByProduct.get(mpId) ?? [];
        for (const entry of bom) {
          const ct = componentTypeMap.get(entry.componentTypeId as string);
          if (!ct || ct.category !== "production") continue;
          const qty = plan.plannedQty * entry.quantity;  // Correctly multiplies by BOM quantity
          if (ct.code === "BIG_BALL") bigBalls += qty;
          else if (ct.code === "MID_BALL") midBalls += qty;
        }
      }
    This logic is correct and handles triples (quantity=3) properly.
    It just only runs on dispatchPlans rows, not on order-derived rows.
  implication: The ball-expansion logic already exists and is correct. It just needs
    to be applied to the additional data source (Direct Sales orders).

## Resolution

root_cause:
  Issue 1 (Save to Kitchen missing Direct Sales):
    getBallTotalsForDispatchPlanDate only queries the `dispatchPlans` table.
    Direct Sales orders live in the `orders`/`orderItems` tables and are NEVER written
    to `dispatchPlans`. The query returns 0 for the entire Direct Sales channel.

  Issue 2 (Total row shows product count, not ball count):
    dailyTotals in getUnifiedWeeklyPlan stores raw product quantity per channel.
    No BOM traversal is performed when assembling dailyTotals, so a Triple (3 balls)
    is counted as 1 unit. PlannerGrid renders grandTotals (sum of dailyTotals) directly.

  Issue 3 (No Balls total row):
    PlannerGrid has only one footer row ("Total"), showing product count.
    There is no second row showing balls. No BOM data is passed into PlannerGrid at all.

fix: Not applied (diagnosis-only mode). See "Suggested Fix Direction" below.

verification: N/A

files_changed: []

---

## ROOT CAUSE FOUND

### Issue 1: Save to Kitchen omits Direct Sales orders

**Root cause:** `getBallTotalsForDispatchPlanDate` (convex/dispatchPlanner/queries.ts, line 1020)
queries only the `dispatchPlans` table. Direct Sales orders are sourced from the `orders` +
`orderItems` tables and are never written into `dispatchPlans`. They are invisible to this query.

**Evidence:**
- `getBallTotalsForDispatchPlanDate` line 1023: `ctx.db.query("dispatchPlans").withIndex("by_date", ...)` — single table scan, no orders join.
- `assembleDirectChannel()` line 259: reads real orders from `orders` table, adds to `dailyTotals["direct"]` at line 329. These are never mirrored into `dispatchPlans`.
- `assembleDirectChannel()` lines 346–388: manual "Planned (Manual)" rows DO write to `dispatchPlans` (via `savePlanCell` mutation). These are the only Direct channel entries `getBallTotalsForDispatchPlanDate` can see.

**Missing data source:**
The query must also read Direct Sales from `orders`/`orderItems` for the given date:
- Query `orders` where `dueDate` falls on the target date AND status is not Draft/Cancelled.
- For each order, query its `orderItems` (non-cancelled).
- Group by `menuProductId`, sum `quantity`.
- Run the same BOM ball-expansion loop that already exists (lines 1053–1065) on these order-derived quantities.

**Files involved:**
- `convex/dispatchPlanner/queries.ts`: `getBallTotalsForDispatchPlanDate` handler needs to additionally aggregate orders.

---

### Issue 2: Total row counts products not balls

**Root cause:** `dailyTotals` in `getUnifiedWeeklyPlan` accumulates raw product quantity (1 Triple = 1),
not ball count. The four channel assembler functions (`assembleDirectChannel`, `assembleGofoodChannel`,
`assembleK3martChannel`, `assembleConsignmentChannel`) all increment `dailyTotals[date][channelKey]`
by `qty` (product units). No BOM multiplication is applied.

`PlannerGrid` computes `grandTotals` by summing `dailyTotals` values (lines 143–151) and renders
them directly in the footer Total row (lines 277–299).

**Evidence:**
- `assembleDirectChannel` line 329: `dailyTotals[dueDateStr]["direct"] += qty` — qty is item.quantity (product count).
- `PlannerGrid` lines 143–151: `totals[date] = Object.values(dayTotals).reduce((sum, v) => sum + v, 0)` — plain sum.
- No BOM data is loaded or available in PlannerGrid.tsx at all.
- BOM for a Triple: `menuProductComponents/mutations.ts` line 217 and `migrations/bomBackfill.ts` line 50 both confirm BITE_TRIPLE = 3 MID_BALL.

**Implication:** For 500 singles + 200 triples the Total row shows 700, kitchen needs 1100 balls.

---

### Issue 3: No Balls total row in the Planner grid

**Root cause:** `PlannerGrid.tsx` has a single footer row showing product count. No second row
exists for ball totals. The component receives `UnifiedWeeklyPlanData` which does not include
a `dailyBallTotals` field — the backend never computes it.

**Evidence:**
- `PlannerGrid.tsx` lines 277–299: one `<div>` footer row labeled "Total".
- `UnifiedWeeklyPlanData` interface (PlannerGrid.tsx lines 55–61): no `dailyBallTotals` field.
- `getUnifiedWeeklyPlan` return type (queries.ts lines 116–122): `dailyTotals` only, no ball totals.

**Suggested fix direction:**
Two viable approaches:
  A) Backend-augmented: Add `dailyBallTotals: Record<string, number>` to the `getUnifiedWeeklyPlan`
     return value. Compute it by running BOM traversal for each product/quantity pair in each
     channel during assembly. Pass it into `PlannerGrid` and render a second "Balls" footer row.
     This is the cleaner approach — keeps computation in Convex where BOM data lives.
  B) Frontend-computed: Pass BOM data (`menuProductComponents` + `componentTypes`) into the
     frontend, compute ball counts in PlannerGrid. This adds extra query overhead and complexity.
  Recommendation: Approach A. The backend already does BOM traversal in `getBallTotalsForDispatchPlanDate`
  (lines 1033–1065). That logic can be adapted into the assembly phase of `getUnifiedWeeklyPlan`.

---

## Files That Need Changes

| File | Issue | What to Change |
|------|-------|----------------|
| `convex/dispatchPlanner/queries.ts` | Issue 1 | `getBallTotalsForDispatchPlanDate`: add a second pass that reads confirmed orders for the date, groups by menuProductId, and applies the same BOM ball-expansion loop. Merge with existing dispatchPlans results. |
| `convex/dispatchPlanner/queries.ts` | Issues 2 & 3 | `getUnifiedWeeklyPlan`: compute `dailyBallTotals: Record<string, number>` during channel assembly by running BOM expansion on each product quantity. Add to return type. |
| `src/components/dispatchPlanner/PlannerGrid.tsx` | Issue 3 | Add `dailyBallTotals` to `UnifiedWeeklyPlanData` interface. Add a second footer row "Balls" below "Total" that renders `dailyBallTotals[date]`. |

No changes needed to `DispatchPlanner.tsx` (page) for issues 2/3, unless the
`SaveTargetButton` tooltip display is also wanted to reflect the correct totals
(currently it does show bigBalls + midBalls from getBallTotalsForDispatchPlanDate,
which is correct once Issue 1 is fixed).

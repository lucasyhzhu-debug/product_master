---
phase: quick-12
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/orders/KanbanCard.tsx
  - src/components/orders/KanbanColumn.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Complete column cards show customer name, order number, creator, net price paid, items list, and expedited flag"
    - "Complete column cards do NOT show any due date or overdue badge"
    - "Non-complete column cards are unchanged (still show date/overdue)"
  artifacts:
    - path: "src/components/orders/KanbanCard.tsx"
      provides: "Card component with optional simplified prop"
    - path: "src/components/orders/KanbanColumn.tsx"
      provides: "Passes simplified=true to KanbanCard when isCompleteColumn"
  key_links:
    - from: "src/components/orders/KanbanColumn.tsx"
      to: "src/components/orders/KanbanCard.tsx"
      via: "simplified prop"
      pattern: "simplified=\\{isCompleteColumn\\}"
---

<objective>
Simplify the Complete column's Kanban cards to remove the overdue/due-date badge row and retain only: customer name, order number, creator, net price paid, items list, and expedited flag.

Purpose: Completed orders are done — the due date and overdue warning are irrelevant noise. The simplified view lets staff scan the archive column faster.
Output: KanbanCard supports a `simplified` boolean prop; KanbanColumn passes it for the complete column only.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add simplified prop to KanbanCard — suppress date/overdue badge row</name>
  <files>src/components/orders/KanbanCard.tsx</files>
  <action>
Add an optional `simplified?: boolean` prop to `KanbanCardProps`. When `simplified` is true:
- Skip the entire "Due date + status badges" block (the section guarded by `(dueDateStr || isExpedited || isCancelled)`).
- Specifically: do NOT render the date badge, the overdue suffix, or the "Cancelled" badge in this row.
- The EXPEDITED badge must still appear when `simplified` is true. Move it into the header row (alongside customer name) rather than the date row, so expedited orders remain visually distinguished. Render it as a small inline badge next to the customer name: `{isExpedited && <Badge ...>EXPEDITED</Badge>}`.
- Keep all other content unchanged: customer name, order number dot creator, price/discount block, and items list.

Changes in detail:
1. Add `simplified?: boolean` to `KanbanCardProps` interface.
2. Destructure `simplified = false` in component params.
3. Replace the date/status badges block:
   ```tsx
   {/* Due date + status badges — hidden in simplified mode */}
   {!simplified && (dueDateStr || isExpedited || isCancelled) && (
     <div className="flex items-center gap-1.5">
       {/* existing content unchanged */}
     </div>
   )}
   ```
4. In the header row (customer name / price), add expedited badge next to customer name when `simplified && isExpedited`:
   ```tsx
   <p className="font-semibold text-sm truncate">{order.customerName}</p>
   {simplified && isExpedited && (
     <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] flex-shrink-0">
       EXPEDITED
     </Badge>
   )}
   ```
   Wrap customer name + badge in a flex row: `<div className="flex items-center gap-1.5 min-w-0">`.

Do NOT change anything else in the component. No new imports needed.
  </action>
  <verify>npm run type-check</verify>
  <done>KanbanCard accepts `simplified` prop; when true, date row is gone but expedited badge still shows in header; when false, behavior is identical to before.</done>
</task>

<task type="auto">
  <name>Task 2: Pass simplified=true from KanbanColumn for complete column</name>
  <files>src/components/orders/KanbanColumn.tsx</files>
  <action>
In `KanbanColumn`, pass `simplified={isCompleteColumn}` to every `KanbanCard` rendered in the card list.

Change the render call from:
```tsx
<KanbanCard
  key={order._id}
  order={order}
  onCardClick={onCardClick}
/>
```
To:
```tsx
<KanbanCard
  key={order._id}
  order={order}
  onCardClick={onCardClick}
  simplified={isCompleteColumn}
/>
```

No other changes needed. The `isCompleteColumn` variable is already computed at line 37.

After the change, run `npm run type-check` to confirm types are satisfied.
  </action>
  <verify>npm run type-check && npm run build</verify>
  <done>Complete column cards render without date/overdue row; all other columns unchanged; build passes.</done>
</task>

</tasks>

<verification>
1. `npm run type-check` passes — no TypeScript errors on new prop.
2. `npm run build` passes — no build errors.
3. In the running app, open Orders page: Complete column cards show name + order# + creator + price + items + EXPEDITED flag (if applicable) with NO date badge.
4. Any other column (e.g., Awaiting Payment) still shows date badges and overdue styling.
</verification>

<success_criteria>
- `npm run type-check` passes
- `npm run build` succeeds
- Complete column cards: no due date, no overdue badge, no Cancelled badge visible (still hidden by show-cancelled toggle)
- Expedited orders in Complete column: amber EXPEDITED badge visible in header row
- All other columns: unchanged behavior
</success_criteria>

<output>
After completion, create `.planning/quick/12-simplify-completed-orders-display-remove/12-SUMMARY.md`
</output>

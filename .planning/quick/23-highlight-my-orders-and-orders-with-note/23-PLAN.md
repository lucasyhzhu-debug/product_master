---
phase: 23-highlight-my-orders-and-orders-with-note
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/orders/queries.ts
  - src/components/orders/KanbanCard.tsx
  - src/components/orders/KanbanColumn.tsx
  - src/components/orders/KanbanBoard.tsx
  - src/pages/OrderManager.tsx
autonomous: true
requirements: [HIGHLIGHT-01, HIGHLIGHT-02, HIGHLIGHT-03]

must_haves:
  truths:
    - "Orders created by the current user have a colored border/outline on the kanban board"
    - "User's own orders are sorted to the top of each kanban column"
    - "Orders with notes show the note text on the card"
    - "Orders with notes have a different (less prominent) colored outline"
    - "Orders that are both 'mine' AND have notes show both highlights combined"
    - "A legend toggle area with checkboxes controls which highlights are visible"
  artifacts:
    - path: "convex/orders/queries.ts"
      provides: "listForKanban returns notes and createdByUserId fields"
      contains: "notes.*order.notes"
    - path: "src/components/orders/KanbanCard.tsx"
      provides: "Card border styling for mine/notes highlights, notes display"
      contains: "isMine"
    - path: "src/components/orders/KanbanColumn.tsx"
      provides: "Sort user's orders to top, pass highlight props"
      contains: "isMine"
    - path: "src/pages/OrderManager.tsx"
      provides: "Legend toggle checkboxes for highlight controls, currentUserId passed down"
      contains: "highlightMine"
  key_links:
    - from: "src/pages/OrderManager.tsx"
      to: "src/contexts/AuthContext.tsx"
      via: "useAuth() to get current user.userId"
      pattern: "useAuth.*userId"
    - from: "src/components/orders/KanbanCard.tsx"
      to: "convex/orders/queries.ts"
      via: "notes and createdByUserId fields from listForKanban"
      pattern: "notes.*createdByUserId"
---

<objective>
Add visual highlighting and sorting for "my orders" and "orders with notes" on the Order Manager kanban board.

Purpose: Help order staff quickly identify their own orders and orders requiring attention (those with special notes) in a busy kanban board.
Output: Enhanced kanban board with colored outlines, note display, sorting, and toggle controls.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@convex/orders/queries.ts (listForKanban query - must add notes + createdByUserId to return shape)
@src/components/orders/KanbanCard.tsx (card component - add border highlights + notes display)
@src/components/orders/KanbanColumn.tsx (column component - add sorting + pass highlight state)
@src/components/orders/KanbanBoard.tsx (board component - pass through currentUserId + highlight state)
@src/pages/OrderManager.tsx (page - add legend toggles, get currentUserId from useAuth)
@src/contexts/AuthContext.tsx (useAuth hook - provides user.userId)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add notes and createdByUserId to listForKanban query return shape</name>
  <files>convex/orders/queries.ts</files>
  <action>
In the `listForKanban` query handler, add two fields to the return object inside the `enriched` map (around line 1196-1231):

1. Add `notes: order.notes` to the returned object (after `creatorName`)
2. Add `createdByUserId: order.createdByUserId` to the returned object (after `notes`)

Also update the TypeScript result type annotation (the Record value type around line 1122-1150) to include:
- `notes?: string;`
- `createdByUserId?: string;` (use string, not Id<"users">, since the lean shape uses string for _id)

This is a minimal backend change - just exposing two existing fields that are already on the orders table.
  </action>
  <verify>Run `npm run type-check` to confirm no type errors. The query already works; we are just adding two more fields to the return shape.</verify>
  <done>listForKanban query returns `notes` and `createdByUserId` for each order card.</done>
</task>

<task type="auto">
  <name>Task 2: Add highlight styling, notes display, sorting, and legend toggles to kanban UI</name>
  <files>
    src/components/orders/KanbanCard.tsx
    src/components/orders/KanbanColumn.tsx
    src/components/orders/KanbanBoard.tsx
    src/pages/OrderManager.tsx
  </files>
  <action>
**KanbanCard.tsx changes:**

1. Extend the `KanbanOrder` interface to add:
   - `notes?: string;`
   - `createdByUserId?: string;`

2. Extend `KanbanCardProps` to add:
   - `isMine?: boolean;` (pre-computed by parent)
   - `highlightMine?: boolean;` (toggle state)
   - `highlightNotes?: boolean;` (toggle state)

3. In the component body, compute highlight classes:
   - `hasMineHighlight = highlightMine && isMine`
   - `hasNotesHighlight = highlightNotes && !!order.notes`
   - Build border class string:
     - If both: `ring-2 ring-blue-400 border-l-4 border-l-amber-400` (blue ring for mine + amber left border for notes)
     - If mine only: `ring-2 ring-blue-400` (blue ring)
     - If notes only: `ring-1 ring-amber-300` (subtle amber ring)
     - Otherwise: no extra classes
   - Apply these classes to the `<Card>` element alongside existing conditional classes (cancelled, expedited). Note: expedited border-amber-400 should take precedence over notes highlight when both are present.

4. Add notes display: After the items section (before closing `</CardContent>`), if `order.notes` exists and is non-empty, render:
   ```
   <p className="text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 line-clamp-2">
     {order.notes}
   </p>
   ```

**KanbanColumn.tsx changes:**

1. Extend `KanbanColumnProps` to add:
   - `currentUserId?: string;`
   - `highlightMine?: boolean;`
   - `highlightNotes?: boolean;`

2. After the existing `visibleOrders` useMemo, add a new `sortedOrders` useMemo that:
   - Takes `visibleOrders` as input
   - If `highlightMine && currentUserId`: sorts user's orders to the top within each column (stable sort - mine first, then original order preserved)
   - Use: `[...visibleOrders].sort((a, b) => { const aIsMine = a.createdByUserId === currentUserId ? 0 : 1; const bIsMine = b.createdByUserId === currentUserId ? 0 : 1; return aIsMine - bIsMine; })`
   - If not highlighting mine: return `visibleOrders` unchanged
   - Dependencies: `[visibleOrders, highlightMine, currentUserId]`

3. Use `sortedOrders` instead of `visibleOrders` in the card rendering loop. Keep `visibleOrders.length` for the count badge (count should not change).

4. Pass `isMine`, `highlightMine`, `highlightNotes` to each `<KanbanCard>`:
   - `isMine={!!currentUserId && order.createdByUserId === currentUserId}`
   - `highlightMine={highlightMine}`
   - `highlightNotes={highlightNotes}`

**KanbanBoard.tsx changes:**

1. Extend `KanbanBoardProps` to add:
   - `currentUserId?: string;`
   - `highlightMine?: boolean;`
   - `highlightNotes?: boolean;`

2. Pass these three props through to each `<KanbanColumn>`.

**OrderManager.tsx changes:**

1. Import `useAuth` from `@/contexts/AuthContext` and `Checkbox` from `@/components/ui/checkbox` (or use a simple `<label><input type="checkbox" />` if Checkbox component is not available - check `src/components/ui/checkbox.tsx` first).

2. Add state:
   - `const { user } = useAuth();`
   - `const [highlightMine, setHighlightMine] = useState(true);` (default ON)
   - `const [highlightNotes, setHighlightNotes] = useState(true);` (default ON)

3. Add a legend toggle row between the page header and the KanbanBoard. Place it inside the existing `px-4 sm:px-6 lg:px-8` div, after the header flex container, before the closing `</div>`:
   ```tsx
   <div className="flex items-center gap-4 text-xs text-muted-foreground">
     <label className="flex items-center gap-1.5 cursor-pointer">
       <input
         type="checkbox"
         checked={highlightMine}
         onChange={(e) => setHighlightMine(e.target.checked)}
         className="rounded border-gray-300"
       />
       <span className="inline-block w-3 h-3 rounded ring-2 ring-blue-400 bg-white" />
       My orders
     </label>
     <label className="flex items-center gap-1.5 cursor-pointer">
       <input
         type="checkbox"
         checked={highlightNotes}
         onChange={(e) => setHighlightNotes(e.target.checked)}
         className="rounded border-gray-300"
       />
       <span className="inline-block w-3 h-3 rounded ring-1 ring-amber-300 bg-white" />
       Orders with notes
     </label>
   </div>
   ```

4. Pass props to `<KanbanBoard>`:
   - `currentUserId={user?.userId}`
   - `highlightMine={highlightMine}`
   - `highlightNotes={highlightNotes}`

Important notes:
- All hooks (useAuth, useState) must be called before any conditional returns per React hooks rules.
- The `user.userId` from AuthContext is an `Id<"users">` which is a string at runtime, matching the `createdByUserId` string from the kanban query.
- Do NOT modify the backend sorting in listForKanban - sorting by "mine" is purely client-side in KanbanColumn.
  </action>
  <verify>
1. `npm run type-check` passes with no errors.
2. `npm run build` succeeds.
  </verify>
  <done>
- Orders created by current user show blue ring-2 outline when "My orders" toggle is checked
- Orders with notes show amber ring-1 outline when "Orders with notes" toggle is checked
- Orders that are both mine AND have notes show blue ring-2 + amber left border
- Notes text appears on cards in amber-styled text below items
- User's orders sort to top of each column when "My orders" highlight is active
- Legend area with two checkboxes (both defaulting to checked) controls highlights
- Build passes with no type errors
  </done>
</task>

</tasks>

<verification>
1. `npm run type-check` -- no TypeScript errors
2. `npm run build` -- production build succeeds
3. Visual check: kanban board shows colored outlines on cards matching current user
4. Visual check: orders with notes display the note text and have amber outline
5. Visual check: toggling checkboxes on/off controls highlight visibility
6. Visual check: user's orders appear at top of each column when highlight is active
</verification>

<success_criteria>
- listForKanban returns notes and createdByUserId for all order cards
- Current user's orders have a blue ring outline (when toggle is on)
- Orders with notes have an amber ring outline (when toggle is on)
- Orders with both conditions show combined highlights
- Notes text is visible on cards in a compact amber-styled box
- User's orders sort to top of each kanban column
- Two checkbox toggles in a legend control the highlight features
- Both toggles default to ON
- npm run build passes
</success_criteria>

<output>
After completion, create `.planning/quick/23-highlight-my-orders-and-orders-with-note/23-01-SUMMARY.md`
</output>

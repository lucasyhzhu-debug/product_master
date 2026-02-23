---
status: resolved
trigger: "Phase 24 UAT Test 4 — Planner grid issues (6 issues)"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: All 6 issues fully diagnosed
test: Static code trace complete
expecting: n/a — root causes confirmed
next_action: Hand off findings to implementer

## Symptoms

expected: Planner cells save successfully; save only on explicit button; page labeled "Planner"; today is always second column; arrows shift +/-7 days same-day-aligned; Save to Kitchen buttons align with grid columns at top
actual:
  1. Editing any cell gives "Failed to save plan" error
  2. Cells auto-save on blur instead of requiring explicit button click
  3. Nav/header shows "Restock" (label) and "Restock Planner" (page title/header), not "Planner"
  4. Grid always starts from Monday, not yesterday-relative to today
  5. Arrow navigation shifts +/-7 days but always snaps to Monday (same issue as #4)
  6. Save to Kitchen buttons render below the grid as a horizontal list, not aligned above each day column
errors: "Failed to save plan" toast (catches mutation validation error)
reproduction: Open /restock-planner, edit any cell in the Direct "Planned (Manual)" row or Consignment row, lose focus
started: Phase 24 implementation (feature/ingredient-simulation-id-linking branch)

## Eliminated

- hypothesis: Auth/token issue causes the save failure
  evidence: useProtectedMutation correctly injects token; mutation auth uses requireRole which would throw "Unauthorized" not a validator error
  timestamp: 2026-02-23

- hypothesis: GoFood cells fail on save
  evidence: GoFood outlet.id IS a valid externalOutlets ID; the mutation validator accepts it; GoFood saves should succeed
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: convex/dispatchPlanner/mutations.ts savePlanCell args validator
  found: outletId is typed as v.optional(v.union(v.id("externalOutlets"), v.id("dispatchConsignmentOutlets")))
  implication: Only valid Convex IDs for those two tables are accepted; plain strings like "direct-manual" will fail validator

- timestamp: 2026-02-23
  checked: convex/dispatchPlanner/queries.ts assembleDirectChannel — manual outlet construction
  found: section.outlets.push({ id: "direct-manual", name: "Planned (Manual)", type: "outlet", ... }) — a hardcoded string ID
  implication: When a cell in the "Planned (Manual)" row is edited, outletId="direct-manual" is passed to savePlanCell, which fails Convex validator since "direct-manual" is not a valid Convex document ID

- timestamp: 2026-02-23
  checked: DispatchPlanner.tsx handleSaveCell (lines 164-180)
  found: Calls savePlanCell({ channel, outletId: outletId as any, menuProductId, date, plannedQty }) — passes outlet.id directly as outletId with no special handling for the "direct-manual" case
  implication: For direct-manual cells, this always sends an invalid outletId to the backend

- timestamp: 2026-02-23
  checked: convex/dispatchPlanner/mutations.ts savePlanCell handler logic (lines 100-112)
  found: For direct channel, lookup uses p.orderId === args.orderId — but handleSaveCell never passes orderId at all; orderId arg is always undefined
  implication: Even if the validator issue were fixed, direct-manual plan upsert cannot match existing records because orderId is not threaded through. For direct-manual saves, the correct lookup is by outletId=null + channel="direct" + date + menuProductId

- timestamp: 2026-02-23
  checked: src/components/dispatchPlanner/PlannerCell.tsx handleBlur (lines 86-91)
  found: onBlur fires performSave(editValue) if isDirty — no "pending" state held, save triggers on any focus loss
  implication: Issue 2 confirmed — every blur from a dirty cell triggers savePlanCell immediately; there is no "batch save" or explicit Save button mechanism

- timestamp: 2026-02-23
  checked: src/components/layout/Header.tsx mainNavItems (line 88)
  found: { path: '/restock-planner', label: 'Restock', icon: CalendarRange, ... }
  implication: Issue 3 — nav label is "Restock", needs to be "Planner"

- timestamp: 2026-02-23
  checked: src/pages/DispatchPlanner.tsx useDocumentTitle and PageHeader (lines 128, 211-213)
  found: useDocumentTitle("Restock Planner"); PageHeader title="Restock Planner" (both in loading state and main render)
  implication: Issue 3 — page title and header both say "Restock Planner", needs to be "Planner"

- timestamp: 2026-02-23
  checked: src/pages/DispatchPlanner.tsx getCurrentMonday() (lines 49-70), useState initializer (line 131)
  found: startDate is initialized to getCurrentMonday() — always the Monday of the current week; the 7-day window is always Mon-Sun
  implication: Issue 4 — grid always starts Monday. Requirement is "today = second column" i.e. startDate should be (today - 1 day) regardless of day of week

- timestamp: 2026-02-23
  checked: src/components/dispatchPlanner/WeekNav.tsx handlePrev/handleNext (lines 84-85)
  found: handlePrev = shiftDate(startDate, -7); handleNext = shiftDate(startDate, +7) — pure 7-day shifts
  implication: Issue 5 — once Issue 4 is fixed (startDate = yesterday), +/-7 shifts will keep the same alignment automatically; WeekNav itself is correct

- timestamp: 2026-02-23
  checked: src/pages/DispatchPlanner.tsx Save to Kitchen row (lines 241-251)
  found: Rendered as a flex row BELOW the PlannerGrid, with a "Save to Kitchen:" label and per-date buttons in a flex-wrap container; each button shows day abbreviation above it
  implication: Issue 6 — buttons are outside and below the grid. Requirement is buttons at TOP of each date column, aligned with the column grid. Needs to be inside PlannerGrid as a header row, or the grid needs to accept a "per-column action" slot

## Resolution

root_cause: |
  ISSUE 1 (Critical Bug — "Failed to save plan"):
  Two-part bug in the direct channel "Planned (Manual)" row save path:
  (a) The query returns outlet.id = "direct-manual" (a hardcoded plain string) for the manual direct row.
      When a cell is edited, handleSaveCell passes outletId="direct-manual" to savePlanCell.
      Convex validator rejects it because it is not a valid Id<"externalOutlets"> or Id<"dispatchConsignmentOutlets">.
  (b) Even if outletId were omitted/null, handleSaveCell never passes orderId, so the direct-channel
      lookup branch (p.orderId === args.orderId) in the mutation would match nothing (both undefined).

  Root fix: handleSaveCell must detect channel="direct" with outletId="direct-manual" and pass
  outletId=undefined + orderId=undefined (for manual direct rows). The mutation handler's direct-channel
  branch must also handle the case where orderId is undefined (manual plans match by outletId===undefined + menuProductId).

  ISSUE 2 (UX behavior gap — auto-save on blur):
  PlannerCell.tsx calls onSave() inside handleBlur when isDirty is true (line 89).
  There is no mechanism to defer saves until an explicit user action.
  Fix: Remove onBlur save trigger from PlannerCell. Instead accumulate dirty cells in a
  parent-level Map<"outletId|productId|date", qty> state and expose a "Save All" button.
  Alternatively, keep per-cell save but triggered only by Enter key (remove blur save).

  ISSUE 3 (Cosmetic — wrong page name):
  Two locations to change:
  - src/components/layout/Header.tsx line 88: label: 'Restock' → label: 'Planner'
  - src/pages/DispatchPlanner.tsx lines 128, 195, 211: "Restock Planner" → "Planner"
  (Document title and both PageHeader title props)

  ISSUE 4 (Feature gap — date column alignment):
  getCurrentMonday() always returns the Monday of the current week as startDate.
  The grid then shows Mon-Sun with today somewhere in the middle.
  Required: startDate = today - 1 day (yesterday), so the window is always [yesterday, +6 days],
  making today always the second column.
  Fix: Replace getCurrentMonday() with a getYesterday() helper (Jakarta timezone).
  The isCurrentWeek logic in WeekNav also needs to update its comparison target accordingly.

  ISSUE 5 (Derived from Issue 4 — arrow navigation day alignment):
  WeekNav handlePrev/handleNext shift by exactly 7 days, which correctly preserves any
  starting day-of-week. Once Issue 4 sets startDate to yesterday, +/-7 shifts will keep
  "yesterday" alignment automatically. No change needed to WeekNav.tsx itself.
  The "Back to Today" button calls getCurrentMonday() internally — that also needs to
  call getYesterday() instead.

  ISSUE 6 (Layout gap — Save to Kitchen button placement):
  The Save to Kitchen buttons are rendered after </PlannerGrid> as a separate flex row
  (DispatchPlanner.tsx lines 241-251). They are not column-aligned with the grid.
  Fix options:
  Option A (simpler): Pass a renderColumnAction prop to PlannerGrid and render
  a new "actions" header row inside the grid's date column loop.
  Option B (current structure): Keep buttons outside but use a CSS grid layout
  that mirrors the grid column widths (first column = 200px label, remaining = flex-1 per date).
  Option A is cleaner and guarantees alignment.

fix: Not yet applied (diagnose-only mode)
verification: n/a
files_changed: []

## Files Involved

| File | Issue | What needs to change |
|------|-------|----------------------|
| `src/pages/DispatchPlanner.tsx` | 1, 2, 3, 4, 6 | Issue 1: detect "direct-manual" outletId and pass outletId=undefined; Issue 2: remove blur-save, add explicit Save button; Issue 3: rename "Restock Planner" → "Planner"; Issue 4: replace getCurrentMonday() with getYesterday(); Issue 6: move Save to Kitchen into grid column headers |
| `src/components/dispatchPlanner/PlannerCell.tsx` | 2 | Remove onBlur → performSave; keep only Enter key save |
| `src/components/dispatchPlanner/PlannerGrid.tsx` | 6 | Accept per-column action slot and render it in column header row |
| `src/components/dispatchPlanner/WeekNav.tsx` | 4 | "Back to Today" button should call getYesterday() not getCurrentMonday() |
| `src/components/layout/Header.tsx` | 3 | Change label: 'Restock' → label: 'Planner' (line 88) |
| `convex/dispatchPlanner/mutations.ts` | 1 | savePlanCell direct-channel branch: handle orderId=undefined + outletId=undefined for manual direct plans |
| `convex/dispatchPlanner/queries.ts` | 1 | assembleDirectChannel: the "direct-manual" sentinel ID should not be passed as outletId to the mutation; the outlet entry itself is fine as display-only |

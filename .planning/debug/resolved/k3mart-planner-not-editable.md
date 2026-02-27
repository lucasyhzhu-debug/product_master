---
status: resolved
trigger: "K3Mart section in the Restock Planner page shows all '--' values and cannot be edited"
created: 2026-02-26T10:00:00Z
updated: 2026-02-26T10:25:00Z
---

## Current Focus

hypothesis: CONFIRMED - K3Mart channel was hardcoded as read-only
test: Build passes, K3Mart cells now use dispatchPlans table for editable future cells
expecting: K3Mart rows will show editable inputs for future days
next_action: Archive session

## Symptoms

expected: K3Mart rows in the Restock Planner should have editable input fields for each day, allowing the user to plan K3Mart stock levels
actual: All K3Mart cells show "--" and cannot be edited. K3Mart (5) with 5 locations and each product under each location shows "--" for every day column
errors: No error messages visible - it just shows "--" for all values
reproduction: Open the Restock Planner page (/restock-planner route), scroll to K3Mart section
started: By design - K3Mart was built as read-only from the start, pulling only from k3martDispatchPlans table (K3Mart Cockpit)

## Eliminated

(none - root cause found on first hypothesis)

## Evidence

- timestamp: 2026-02-26T10:05:00Z
  checked: src/App.tsx route configuration
  found: Route /restock-planner renders DispatchPlanner component (not RestockPlanner)
  implication: User is actually looking at the Dispatch Planner, not the old RestockPlanner

- timestamp: 2026-02-26T10:08:00Z
  checked: convex/dispatchPlanner/queries.ts line 189
  found: `isEditable: channelKey !== "k3mart"` - K3Mart explicitly set to NOT editable
  implication: This is the channel-level flag that prevents editing

- timestamp: 2026-02-26T10:09:00Z
  checked: convex/dispatchPlanner/queries.ts line 624
  found: `isReadOnly: true` hardcoded for ALL K3Mart cells (past AND future)
  implication: Even future cells cannot be edited

- timestamp: 2026-02-26T10:10:00Z
  checked: PlannerCell.tsx lines 139-153
  found: When isReadOnly=true, renders `{value > 0 ? value : "--"}` (static div, not input)
  implication: Zero-value read-only cells display "--", which matches the user's report

- timestamp: 2026-02-26T10:12:00Z
  checked: GoFood channel assembler (assembleGofoodChannel) lines 424-563
  found: GoFood uses dispatchPlans table for editable future cells, with past days read-only showing actual sales
  implication: K3Mart should follow the same pattern

- timestamp: 2026-02-26T10:13:00Z
  checked: savePlanCell mutation (mutations.ts lines 77-136)
  found: Mutation already supports any channel value - matches by outletId + menuProductId
  implication: No mutation changes needed - just need to pass channel="k3mart"

- timestamp: 2026-02-26T10:20:00Z
  checked: npm run build
  found: Build passes with all changes
  implication: Fix is type-safe and compiles correctly

## Resolution

root_cause: K3Mart channel was hardcoded as read-only in the Dispatch Planner backend query (convex/dispatchPlanner/queries.ts). Two places enforced this: (1) isEditable was set to false for k3mart channel, (2) isReadOnly was hardcoded to true for every K3Mart cell. The assembleK3martChannel function only pulled from k3martDispatchPlans table (populated by K3Mart Cockpit) and did not read/write the dispatchPlans table that other editable channels use.

fix: Three changes to convex/dispatchPlanner/queries.ts:
  1. Changed isEditable from `channelKey !== "k3mart"` to `true` for all channels
  2. Passed allDispatchPlans to assembleK3martChannel (was previously omitted)
  3. Rewrote assembleK3martChannel to follow GoFood pattern:
     - Past days: read-only, shows data from k3martDispatchPlans or dispatchPlans
     - Future days: editable via dispatchPlans table, with k3martDispatchPlans as fallback baseline
     - savePlanCell mutation already supports k3mart channel (no mutation changes needed)

verification: npm run build passes. Type check passes.

files_changed:
  - convex/dispatchPlanner/queries.ts

# Phase 4: Quick Fixes -- Bugs - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix two known production bugs: (1) the stock shortage override dialog needs proper UX with confirmation and audit trail, and (2) all TODO comments in production code must be resolved or converted to tracked backlog issues. No new features -- just fixing what's broken and cleaning up open markers.

</domain>

<decisions>
## Implementation Decisions

### Shortage Dialog Design
- Show items + impact summary (e.g., "Order cannot be fully packaged. 2 of 5 packaging items have insufficient stock")
- Each short item shows: item name, needed qty, available qty, deficit
- All dialog text in English (replace current Indonesian "Stok kemasan tidak cukup" messaging)
- Fix the bug where shortage details don't display (current filter uses `line.includes('need ')` which doesn't match Indonesian error text)
- Keep amber/caution visual tone (not red/danger) -- current styling is appropriate
- Override requires a reason: manager must type a short reason before override button is enabled

### Override Behavior
- All order-access roles can override (order_staff, manager, admin) -- expanded from current manager+admin restriction
- Override logged with full audit trail: who overrode, when, reason entered, which items were short
- Log visible in two places: (1) order detail page as an event, (2) indicator on order card/row with tooltip showing override details
- After override, inventory left as-is -- no auto-adjustment, someone must manually restock or adjust later

### TODO Resolution Strategy
- **K3MartCockpit TODOs (7):** Convert to tracked backlog issues -- these reference unbuilt features (dispatch plans, stock movements, bump approval)
- **Cost invalidation TODOs (2):** Actually implement the background job schedulers for ingredients and materials cost invalidation
- **OrderDetail production query TODO (1):** Actually implement the dedicated query to fetch orderItemProduction records (currently returns [])
- Backlog issues tracked in location of Claude's choosing (based on existing planning structure)

### Claude's Discretion
- Exact override reason input UI (text field, textarea, dropdown of common reasons)
- Override indicator design on order cards (badge, icon, subtle marker)
- Cost invalidation scheduler implementation details (frequency, scope)
- Backlog issue tracking location and format

</decisions>

<specifics>
## Specific Ideas

- The error catching in OrderDetail.tsx checks for Indonesian text "Stok kemasan tidak cukup" but the detail filter uses English "need " -- this mismatch is likely the core bug
- K3MartCockpit.tsx is a newer page with many placeholder stubs -- TODOs here are expected and represent future feature work, not bugs
- The two backend cost invalidation TODOs (`ingredients/mutations.ts:96`, `materials/mutations.ts:95`) have the scheduler code already commented out -- just needs to be implemented

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 04-bugs*
*Context gathered: 2026-02-13*

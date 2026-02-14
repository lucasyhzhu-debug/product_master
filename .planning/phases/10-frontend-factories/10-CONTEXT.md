# Phase 10: Frontend Factories - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Create generic hook and UI component factories for simple CRUD entities, reducing frontend boilerplate by ~2,300 lines. Assumes Phase 9 (UI Brand Consolidation) has established the brand reference and page layout patterns that factories must follow. All UI work uses the `/frontend-design` skill.

</domain>

<decisions>
## Implementation Decisions

### EntityManager Interaction
- Create/edit flow: dialog/modal — form opens in overlay, stays in context of the list
- Delete confirmation: two-step — confirm dialog first ("Are you sure?"), then undo toast after deletion
- List display: toggle between table view and card grid — persist user preference (localStorage)
- Bulk actions: checkbox column for multi-select, bulk action bar appears when items selected

### Factory Migration Scope
- Entities for factory migration: Ingredients, Materials, Tags, Customers, StorageLocations (5 entities)
- Vouchers excluded — too much special logic (codes, usage tracking, expiry) for generic factory
- Hook factory: explicit configuration pattern — pass table name, mutation names, toast messages (not schema-driven magic)

### Claude's Discretion
- Column configuration approach for EntityManager (config array vs render prop)
- Migration strategy (prove on 1-2 entities first vs all at once)

</decisions>

<specifics>
## Specific Ideas

- Both confirm dialog AND undo toast for destructive actions (belt and suspenders approach)
- Toggle between table and card views with persisted user preference
- Factories must follow brand reference established in Phase 9

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-frontend-factories*
*Context gathered: 2026-02-14*

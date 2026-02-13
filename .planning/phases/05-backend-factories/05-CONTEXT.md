# Phase 5: Backend Factories - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish `convex-helpers` auth wrappers and common query helper functions for **simple entities only** (ingredients, materials, tags, customers, storageLocations, shipping). Complex entities (orders, inventory, kitchen, recipes, packaging, products, vouchers) migrate in a follow-up Phase 5.1.

Both backend wrappers AND frontend hooks are updated together for the 6 simple entities.

</domain>

<decisions>
## Implementation Decisions

### Rollout strategy
- Simple entities first: ingredients, materials, tags, customers, storageLocations, shipping (6 entities)
- Complex entities (orders, inventory, kitchen, recipes, packaging, products, vouchers) get a separate Phase 5.1
- Both mutation wrappers and query helpers are built and applied in this phase
- Frontend hooks for the 6 simple entities are also updated (backend + frontend together)

### Auth wrapper design
- Single factory with auth modes: `required`, `optional`, `none` — covers protected mutations, optional-auth queries, and public mutations (login)
- Per-mutation role declaration: each mutation specifies its own allowed roles (e.g., `{ roles: ['admin'] }`)
- Generic "Unauthorized" error message on auth failure — no role details revealed
- No backend logging of auth failures — just throw ConvexError (Convex already logs function errors)

### Auth contract migration
- Move from token-in-args to Convex sessionId context-based auth using convex-helpers session management
- Client stores sessionId, wrapper validates it from context — no more `token: v.string()` in mutation args
- Token field completely removed from mutation args for migrated entities (clean break, no backward compat)
- Frontend hooks updated to remove token passing for the 6 simple entities
- Backend and frontend must deploy together for migrated entities

### Query helper scope
- Full scope: CRUD + filtered lists + cursor pagination + text search
- Helpers: `list()`, `getById()`, `getByField()`, `listByFilter()`, `search()`, paginated variants
- Default page size: 25 items (with per-query override support)
- `protectedQuery` wrapper added — queries can also enforce auth via session context
- Text search helper for searching across specified fields (e.g., ingredient name, customer phone)

### Claude's Discretion
- Exact convex-helpers API usage and session management implementation
- Query helper internal architecture (composition patterns, type inference approach)
- File organization for the new lib modules
- How to handle the sessionId provider on the frontend (ConvexProvider integration)

</decisions>

<specifics>
## Specific Ideas

- Auth context should use the convex-helpers sessionId approach — closest to the existing PIN login + session token pattern
- Clean break on token removal — no optional backward compatibility period
- Query helpers should be rich enough to avoid custom queries for simple entities entirely

</specifics>

<deferred>
## Deferred Ideas

- Phase 5.1: Migrate complex entities (orders, inventory, kitchen, recipes, packaging, products, vouchers) to the factory pattern
- Complex entities may need specialized wrappers beyond the generic factory (e.g., order mutations with inventory side effects)

</deferred>

---

*Phase: 05-backend-factories*
*Context gathered: 2026-02-13*

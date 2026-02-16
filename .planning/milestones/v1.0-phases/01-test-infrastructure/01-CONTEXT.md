# Phase 1: Test Infrastructure - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Comprehensive test coverage for 4 critical business logic modules (ball distribution, FIFO inventory, order lifecycle, voucher handling) providing a safety net for all subsequent refactoring phases. Zero production code changes — additive test files only.

</domain>

<decisions>
## Implementation Decisions

### Known failure scenarios (test priority)
- **Ghost balls (orphaned production):** Kitchen produces balls that never get linked to a specific order — balls end up in "to-sticker" or "stickered" stage with no traceability. Tests MUST verify that every produced ball is traceable to either an order or an unallocated holding state.
- **Inventory leaks:** Stock gets reserved but never consumed or released, slowly locking up available inventory. Reservation leaks are a real production issue.
- **Stock going negative:** System allows consuming more inventory than what's actually in stock.
- **Wrong batch order (FIFO violation):** Newer batches consumed before older ones, causing waste.
- **Ball allocation errors:** Balls allocated to wrong orders, wrong quantities, or wrong types (BIG_BALL vs MID_BALL).
- **Order status issues:** Orders getting stuck, skipping transitions, and cancellation not properly rolling back inventory/allocations — all have occurred in production.

### Order lifecycle test depth
- Test cancellation at EVERY status stage, not just key points — verify proper rollback of inventory reservations and ball allocations at each stage
- Test BOTH delivery paths as separate full chains: WaitingShipment -> CompleteShipped AND WaitingPickup -> PickedUp
- Full integration with inventory: order creation -> inventory reservation -> production -> consumption -> and rollback on cancel (not mocked)
- Test invalid transition rejection: verify system rejects skipping steps (Draft -> Boxed) and going backwards (Labeled -> InProduction)

### Ball distribution scenarios
- Orders vary widely: some are simple (1 product, 1 ball type), others are complex (3-4 products, mixed BIG_BALL + MID_BALL)
- Priority is deadline-based: orders with earlier delivery dates get balls first
- Test partial fills: orders often get filled across multiple production batches (e.g., needs 100 balls, gets 60 now, 40 later)
- Production pipeline stages: balls produced -> packaged -> to-sticker -> stickered -> distributed. Tests should verify traceability at every stage.
- Test the scenario where balls are produced with no pending orders — they should sit in holding (to-sticker or stickered), not become orphaned

### Test data approach
- Use realistic Frollie product configurations — actual ball counts, packaging combos, pricing
- Under 10 active products in catalog — tests can cover most product types
- 10-50 orders/day typical volume — concurrent allocation scenarios matter
- Products are fairly standard in structure (different flavors/sizes, no unusual configs) — no special "tricky product" test cases needed

### Claude's Discretion
- Test framework patterns and fixture architecture
- Mocking strategy for Convex backend (convex-test)
- Test file organization and naming conventions
- Exact assertion patterns and error message verification
- Whether to use shared test helpers or keep tests self-contained

</decisions>

<specifics>
## Specific Ideas

- Ghost balls in the sticker pile are the most frustrating production issue — "40 allocated balls in the 'to sticker' pile and I have no idea where they are and we can't undo them"
- The full production pipeline (produced -> packaged -> to-sticker -> stickered -> distributed) should be traceable end-to-end
- Tests should prevent the recurring theme: operations that partially complete and leave the system in an inconsistent state (partial reservations, partial allocations, partial rollbacks)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-test-infrastructure*
*Context gathered: 2026-02-13*

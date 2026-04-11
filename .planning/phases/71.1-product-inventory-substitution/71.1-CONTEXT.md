# Phase 71.1: Product Inventory Substitution — Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/plans/2026-04-10-product-inventory-substitution.md)

<domain>
## Phase Boundary

Allow triple products (Dubai Triple, Nutella Triple) to be fulfilled from single product inventory when direct triple stock is insufficient. Adds `fulfillFromProductId` + `fulfillMultiplier` to menuProducts schema. Modifies fulfillFromInventory, getStockForOrder, and processGofoodSales. UI config on ProductForm, split sub-rows in availability panel, enhanced fulfillment summary.

</domain>

<decisions>
## Implementation Decisions

### Schema
- Add `fulfillFromProductId: v.optional(v.id("menuProducts"))` to menuProducts
- Add `fulfillMultiplier: v.optional(v.number())` to menuProducts
- Both fields optional, no index needed (low cardinality, queried rarely)

### Drawdown Logic
- Direct triple stock consumed FIRST, then fall back to singles for remainder
- `resolveSubstitutionPlan()` pure helper shared by mutations + queries
- Transaction logging: one transaction per source product (reflects physical stock movement)
- GoFood auto-deduction: same substitution, negative stock still allowed

### Validation
- Both fields must be set together or both omitted
- `fulfillMultiplier` must be integer >= 2
- Cannot reference self
- No forward chains: target must not itself have fulfillFromProductId
- No reverse chains: product used as source by another cannot get its own fulfillFromProductId
- Target must be active

### UI — ProductForm
- Collapsible "Inventory Fulfillment" section on food products only
- "Fulfill from" dropdown + "Units per product" number input
- Dropdown filters: exclude self, exclude products with existing substitution, food products only
- Preview text: "1 Triple will draw 3x Single from inventory when direct stock is insufficient"

### UI — InventoryAvailabilityPanel
- Split sub-rows for substitution products: direct stock row + substitute source row + overall verdict
- Non-substitution products: unchanged single row

### UI — FulfillFromInventoryButton
- Fulfillment success toast shows per-source deduction breakdown (direct vs substituted)
- Duration: 6000ms (matching existing pattern)

### Flows NOT Affected
- addStock — direct per product (no redirect)
- adjustStock, transferStock, bulkStockCount — direct per product
- Packaging BOM / componentStock — already correct
- Kitchen production tracking — unchanged
- Order creation / pricing — unchanged

### Claude's Discretion
- Internal structure of substitution.ts helper
- Exact styling of sub-rows (follow existing table patterns)
- Error message wording for validation failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec & Plan
- `docs/superpowers/specs/2026-04-10-product-inventory-substitution-design.md` — Full design spec with brainstorm decisions
- `docs/superpowers/plans/2026-04-10-product-inventory-substitution.md` — Detailed implementation plan with code
- `docs/reviews/staffreview-product-inventory-substitution-2026-04-10.md` — Staff review with 4 criticals (all fixed in plan)

### Backend (must read before modifying)
- `convex/schema.ts:93-129` — menuProducts table definition
- `convex/productInventory/mutations.ts:210-368` — fulfillFromInventory mutation
- `convex/productInventory/mutations.ts:635-745` — processGofoodSales mutation
- `convex/productInventory/queries.ts:310-363` — getStockForOrder query
- `convex/menuProducts/mutations.ts:218-343` — update mutation (add validation here)

### Frontend (must read before modifying)
- `src/components/menuProducts/ProductForm.tsx` — Product edit form (add section here)
- `src/components/inventory/InventoryAvailabilityPanel.tsx` — Stock check table (add sub-rows)
- `src/components/inventory/FulfillFromInventoryButton.tsx` — Fulfillment flow (enhance toast)
- `src/hooks/convex/useMenuProducts.ts` — Hook interfaces (add fields to PosProduct, AvailableProduct)

### Test patterns
- `tests/convex/inventory.test.ts` — Existing inventory test setup helpers
- `tests/convex/ballDistribution.test.ts` — Example of typed api.* test invocation pattern

</canonical_refs>

<specifics>
## Specific Ideas

- Products: Dubai Single/Triple, Nutella Single/Triple (and future variants)
- Multiplier is always 3 for current products but schema supports any integer >= 2
- Bite Double/Triple removed from menu (seed code stale) — not relevant to this phase
- Staff review found ID type mismatch: dropdown must use `_id` (Convex string) not `id` (number)

</specifics>

<deferred>
## Deferred Ideas

- Multi-level substitution chains (explicitly blocked by design)
- Auto-redirect addStock from triple to singles (decided against — triples CAN exist in stock)
- Concurrent deduction from same substitute pool across multiple order items (acknowledged edge case, deferred)

</deferred>

---

*Phase: 71.1-product-inventory-substitution*
*Context gathered: 2026-04-10 via PRD Express Path*

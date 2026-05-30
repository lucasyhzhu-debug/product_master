# Phase 67: Inventory Drift & Daily Stock Update - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix stock count drift by introducing a daily manual stock count workflow for finished goods (product inventory). The core insight: production data is accurate (controlled internally), K3Mart POS data is accurate (API-driven), but other location sales (GrabFood, Grab, direct POS at Legato, cafe walk-ins) are untracked — so the system can't auto-calculate correct stock. Daily manual count becomes the source of truth for non-automated locations.

This phase focuses on **product inventory only** (finished goods/menu products). Packaging component refresh is deferred to a future phase.

</domain>

<decisions>
## Implementation Decisions

### Stock Drift Model
- **D-01:** Daily manual count is the primary correction mechanism for locations with untracked sales channels. The system does NOT pretend to track sales it can't see.
- **D-02:** Production additions to kitchen location remain automated (accurate, controlled internally).
- **D-03:** K3Mart stock tracking remains automated via API (POS-driven, accurate).
- **D-04:** Other locations (Crystal, Goldfinch, Legato, cafes): stock drifts because of untracked POS sales (GrabFood, Grab, direct walk-ins). Daily count fixes this.
- **D-05:** This phase addresses **product inventory only** (`productInventory` table). Packaging component inventory (`componentStock`, `inventoryBatches`) is deferred — packaging currently tracks production deductions accurately, and a one-time refresh can happen later.

### Daily Stock Update UX
- **D-06:** New stock count screen accessible from inventory area. All roles can count at any time — no role or time restrictions.
- **D-07:** Layout: Location selector dropdown at top → product grid below showing all products at that location. Each row: product name, system count (read-only), input field for actual count. Submit all changes at once.
- **D-08:** On submit, system calculates delta (entered - system) for each product and records adjustments for any row where count changed.

### Adjustment Recording
- **D-09:** New transaction type `"stock_count"` in `productInventoryTransactions` to distinguish daily counts from other stock changes (add, remove, transfer, etc.).
- **D-10:** Each adjustment records: who counted, when, previous quantity, new quantity, delta, and an optional note. Note is optional to keep daily workflow fast.
- **D-11:** No approval needed — staff counts are trusted. Audit trail via transactions is sufficient.

### Claude's Discretion
- Where in the navigation the stock count screen lives (button on existing inventory page, or separate page)
- Whether to show a "last counted" timestamp per product-location
- Whether to highlight rows where system count vs entered count differs significantly (e.g., >50% delta)
- Mobile responsiveness approach for the count grid (staff may count from phones)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Inventory System
- `convex/schema.ts` lines 972-1000 — `productInventory` and `productInventoryTransactions` table definitions
- `convex/productInventory/mutations.ts` — `addStock`, `removeStock`, `transferStock` mutations with audit logging pattern
- `convex/productInventory/queries.ts` — `getStockOverview` query (joins menuProduct + location)
- `convex/productInventory/depotAutoSeed.ts` — Auto-seeding for depot locations

### Packaging Inventory (reference only — deferred)
- `convex/schema.ts` lines 838-920 — `inventoryBatches`, `componentStock`, `inventoryTransactions`
- `convex/inventory/fifo.ts` — FIFO batch logic

### Frontend
- `src/pages/InventoryManager.tsx` — Current inventory management page
- `src/components/inventory/FinishedGoodsTab.tsx` — Finished goods display
- `src/hooks/convex/useInventory.ts` — Inventory hooks
- `src/pages/LocationsManager.tsx` — Storage locations management

### Storage Locations
- `convex/storageLocations/` — Location CRUD (Office, Kitchen, Crystal, Goldfinch, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `productInventory/mutations.ts` addStock/removeStock pattern — audit logging to `productInventoryTransactions` already works
- `getStockOverview` query — already joins menuProduct + location data, returns enriched rows with product names
- `storageLocations` — existing location selector patterns across the app
- Select/Input components from shadcn/ui — dropdown + input grid

### Established Patterns
- All stock mutations log to `productInventoryTransactions` with `transactionType`, `previousQuantity`, `newQuantity`, `delta`
- Location filtering via `by_location` index on `productInventory`
- `productInventory` uses upsert pattern: find existing row by product+location, then patch or insert

### Integration Points
- New stock count mutation writes to `productInventory` (update quantity) + `productInventoryTransactions` (audit log)
- Stock count screen needs `storageLocations` query for location dropdown
- Stock count screen needs `productInventory` filtered by location for the grid
- Existing `InventoryManager.tsx` or `FinishedGoodsTab.tsx` could host a "Count Stock" button

</code_context>

<specifics>
## Specific Ideas

- The root cause of drift is **untracked sales channels** (GrabFood, Grab, direct POS at Legato, cafe walk-ins) — NOT a bug in the stock tracking logic. The system is correct about what it tracks; it just can't see all sales.
- Production → kitchen additions are accurate. K3Mart is accurate (API). Everything else needs manual counts.
- The bulk set screen design should be reusable for a future packaging component refresh (same pattern: pick location, see grid, enter counts).
- Staff counts from phones — the grid needs to be mobile-friendly (likely a simple list with large tap targets for input fields).

</specifics>

<deferred>
## Deferred Ideas

- **Packaging component one-time refresh**: Same bulk count pattern but for `componentStock`/`inventoryBatches`. Deferred from this phase — packaging deductions from production are accurate, just need a baseline reset.
- **Usage bar / consumption gauge**: Visual alternative to exact counts. Could layer on top of daily counts in a future iteration.

</deferred>

---

*Phase: 67-inventory-drift-daily-stock-update*
*Context gathered: 2026-03-28*

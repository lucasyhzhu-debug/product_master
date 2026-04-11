# Product Inventory Substitution Design

**Date:** 2026-04-10
**Phase:** 70.2 (inserted after 70.1)
**Status:** Draft

## Problem

The kitchen only produces "single" products (e.g., Dubai Single, Nutella Single). When a customer orders a "triple" (at a special triple price), staff physically takes 3 singles and gives them to the customer. The packaging BOM has already been updated so triples use 3x single packaging components.

However, the **product inventory** tracks finished goods per menu product. Since triples are never produced, the inventory shows 0 triples and 200 singles. When staff tries to fulfill a triple order from inventory, the system throws "insufficient stock" because it checks the triple's stock row directly — it doesn't know that 3 singles can substitute.

This affects multiple product lines: Dubai Single/Triple, Nutella Single/Triple, and potentially future flavor variants.

## Design Decisions (from brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Substitution scope | Drawdown only — `addStock` for triples still creates direct triple stock |
| 2 | UI configuration | Field on MenuProducts edit page ("Fulfill from" dropdown + multiplier) |
| 3 | Mixed stock deduction | Use direct triple stock first, fall back to singles for remainder |
| 4 | Availability display | Split sub-rows: direct stock row + substitution source row |
| 5 | Transaction logging | One transaction per source product (reflects physical stock movement) |
| 6 | Chain depth | One level only — a substitution source cannot itself have a substitution |

## Schema Changes

### `menuProducts` table — add 2 optional fields

```typescript
// convex/schema.ts — menuProducts table
fulfillFromProductId: v.optional(v.id("menuProducts")),  // substitute source
fulfillMultiplier: v.optional(v.number()),                // how many source units per 1 of this product
```

**Validation rules:**
- Both fields must be set together or both omitted
- `fulfillMultiplier` must be a positive integer >= 2
- `fulfillFromProductId` cannot point to self
- `fulfillFromProductId` target must not itself have `fulfillFromProductId` set (no chains)
- `fulfillFromProductId` target must be an active menu product

**Example data:**

| Product | fulfillFromProductId | fulfillMultiplier |
|---------|---------------------|-------------------|
| Dubai Single | — | — |
| Dubai Triple | → Dubai Single | 3 |
| Nutella Single | — | — |
| Nutella Triple | → Nutella Single | 3 |

## Backend Changes

### 1. `fulfillFromInventory` mutation (`convex/productInventory/mutations.ts`)

**Current behavior:** For each order item, checks `productInventory` for exact `menuProductId` at location. Throws if insufficient.

**New behavior:**

```
For each order item:
  1. Look up the menuProduct
  2. If menuProduct.fulfillFromProductId is set:
     a. Check direct stock for this product
     b. Calculate shortfall = needed - directAvailable
     c. If shortfall > 0:
        - substituteNeeded = shortfall * fulfillMultiplier
        - Check substitute product stock
        - If substitute stock < substituteNeeded → add to shortages
     d. Build deduction plan: { direct: min(needed, directAvailable), fromSubstitute: shortfall }
  3. If no substitution configured:
     a. Current behavior (direct check only)

Deduction phase (if no shortages):
  For items with substitution:
    - Deduct direct stock (if any used)
    - Deduct substitute stock (substituteNeeded units)
    - Log separate transactions for each:
      * Direct: type "drawdown", menuProductId = triple
      * Substitute: type "drawdown", menuProductId = single,
        reason = "Substitution for N× {Triple Name} (Order {orderNumber})"
        orderId = order._id
```

### 2. `getStockForOrder` query (`convex/productInventory/queries.ts`)

**Current behavior:** Returns flat list of `{ productName, quantityNeeded, quantityAvailable, isSufficient }`.

**New behavior:** For products with substitution, return enriched data:

```typescript
{
  orderItemId,
  menuProductId,
  productName: "Dubai Triple",
  quantityNeeded: 3,
  // Direct stock info
  directAvailable: 2,
  directSufficient: false,
  // Substitution info (only present if configured)
  substitution: {
    sourceProductId,
    sourceProductName: "Dubai Single",
    multiplier: 3,
    sourceNeeded: 3,        // shortfall (1) * multiplier (3)
    sourceAvailable: 50,
    sourceSufficient: true,
  },
  // Overall
  isSufficient: true,       // direct + substitute covers need
}
```

### 3. `processGofoodSales` internal mutation (`convex/productInventory/mutations.ts`)

Same substitution resolution. When GoFood sells a triple, deduct from single stock if no direct triple stock exists. Negative stock is still allowed (GoFood never blocks).

### 4. Validation mutation for saving substitution config

Add validation to the menuProducts update mutation:
- Cannot set `fulfillFromProductId` to self
- Target product must not itself have `fulfillFromProductId` set
- Both fields required together
- `fulfillMultiplier` >= 2 and integer

## Frontend Changes

### 1. MenuProducts Edit Page — Substitution Config

Add a collapsible "Inventory Fulfillment" section to the product edit form:

- **"Fulfill from" dropdown** — lists active food-type menu products, excluding:
  - The current product (no self-reference)
  - Products that already have `fulfillFromProductId` set (no chains)
- **"Units per product" number input** — defaults to empty, min 2, integer only
- Both fields show/hide together — selecting a product enables the multiplier, clearing either clears both
- Helper text: "When this product is ordered, inventory will be drawn from the selected product instead. E.g., 1 Triple = 3 Singles."

### 2. Inventory Availability Panel (`InventoryAvailabilityPanel.tsx`)

Replace the flat row with split sub-rows for substitution products:

```
Product              | Need | Available | Status
─────────────────────|──────|───────────|────────
Dubai Single         |   2  |    50     |   OK
Dubai Triple         |   3  |     —     |   —
  Direct stock       |      |     2     |  Short 1
  └ via 3× Dubai Single |   |    50     |  OK (uses 3)
                     |      |           |  Overall: OK
Nutella Single       |   1  |    30     |   OK
```

- Direct stock row shows quantity available and shortage
- Substitution row shows source product name, multiplier, source available
- Overall status: green check if direct + substitute covers need
- If no substitution configured, shows single row as today

### 3. Fulfillment Summary in Order Modal

After successful fulfillment, the deductions summary should show:

```
Fulfilled from Office:
  Dubai Single      ×2  (direct)         → 48 remaining
  Dubai Triple      ×2  (direct)         → 0 remaining
  Dubai Triple      ×1  (via 3× Dubai Single) → 47 remaining
  Nutella Single    ×1  (direct)         → 29 remaining
```

Each line clearly states whether it was direct or substituted, and from which product.

## Flows NOT Affected

- **addStock** — adding triple stock goes to triple's own inventory row (no redirect)
- **adjustStock** — manager adjustments are direct per product
- **transferStock** — transfers are direct per product
- **bulkStockCount** — physical counts are direct per product
- **Packaging BOM / componentStock** — already correct, uses 3x single packaging
- **Kitchen production tracking** — kitchen produces singles, unchanged
- **Order creation / pricing** — customer orders a triple at triple price, unchanged

## Success Criteria

1. Staff can fulfill an order containing Dubai Triple when only Dubai Singles are in stock
2. Availability panel shows split sub-rows with direct vs substitution breakdown
3. Fulfillment summary in order modal shows exactly what was deducted and from where
4. Direct triple stock (if any) is consumed first before falling back to singles
5. GoFood auto-deduction resolves substitution correctly
6. Circular substitution chains are blocked at save time
7. `npm run build` passes, `npm run type-check` passes

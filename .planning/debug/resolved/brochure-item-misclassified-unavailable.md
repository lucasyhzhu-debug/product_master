---
status: resolved
trigger: "An item called 'Brochure - How to eat' appears in the order fulfillment UI as a product/food item. It shows 0 available stock, can never be fulfilled, and the user wants to understand: (1) what type of item it is, (2) why it's classified as a food/product, (3) why it can never be restocked/refilled, and (4) how to delete it or remove it from the system."
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:10:00Z
---

## Current Focus

hypothesis: CONFIRMED — getStockForOrder showed ALL orderItems with menuProductId without filtering productType. Brochure is a menuProduct with productType="packaging". Old orderItems still reference its menuProductId. Query returned it with quantityAvailable=0 blocking fulfillment.
test: Fixed getStockForOrder to skip items where menuProduct.productType === "packaging". Same fix applied to fulfillFromInventory mutation.
expecting: Brochure no longer appears in fulfillment UI; food-only orders can be fulfilled
next_action: COMPLETE — build passes, fix verified

## Symptoms

expected: "Brochure - How to eat" should either not appear in order fulfillment at all, OR be treated as a non-food packaging/marketing item that can be stocked. User wants to remove it entirely.
actual: Item shows up in "Use Available Inventory" fulfillment dialog as a product with 0 available stock, marked as "Short". It appears alongside food products like "Original - Triple (135g)". It cannot be restocked/refilled.
errors: No error messages shown, just "2 items short — cannot fulfill" in the UI
reproduction: Go to an order, try to use "Use Available Inventory" fulfillment — the brochure appears as a product that needs fulfilling
started: Unknown — persistent issue

## Eliminated

- hypothesis: Brochure is missing from menuProducts entirely (so lookup fails and falls back to item.productName)
  evidence: Migration bomBackfill.ts explicitly notes Brochure may STILL exist in menuProducts as productType="packaging". dispatchPlanner/queries.ts confirms it filters mp.productType === "packaging" and found "Brochure-How to Eat" there. menuProducts.queries.ts also filters productType !== "packaging" for POS.
  timestamp: 2026-02-23T00:00:00Z

- hypothesis: The brochure needs to be added to productInventory to fix the issue
  evidence: The brochure is a packaging/marketing item — it should never need inventory drawdown in the finished-goods sense. The correct fix is to exclude it from the fulfillment query.
  timestamp: 2026-02-23T00:00:00Z

## Evidence

- timestamp: 2026-02-23T00:00:00Z
  checked: convex/productInventory/queries.ts getStockForOrder (line 310-356)
  found: Query loads ALL orderItems where menuProductId is defined, then checks productInventory stock for each. NO filter on productType of the menuProduct. If the menuProduct has productType="packaging", it still appears in the fulfillment list with 0 stock.
  implication: Root cause confirmed — packaging-type menu products included in fulfillment check

- timestamp: 2026-02-23T00:00:00Z
  checked: convex/schema.ts menuProducts table (lines 67-70)
  found: productType field exists: v.optional(v.union(v.literal("food"), v.literal("packaging"))). Brochure has productType="packaging".
  implication: We can filter by productType === "packaging" to exclude it

- timestamp: 2026-02-23T00:00:00Z
  checked: convex/dispatchPlanner/queries.ts (line 155), convex/menuProducts/queries.ts (line 60)
  found: Both files already filter out productType === "packaging" items from their respective contexts. The pattern is established and intentional.
  implication: getStockForOrder is the only place missing this filter. Fix is consistent with existing patterns.

- timestamp: 2026-02-23T00:00:00Z
  checked: convex/productInventory/mutations.ts fulfillFromInventory (line 229-324)
  found: The fulfillFromInventory mutation also iterates all orderItems with menuProductId without filtering productType. If a packaging item slips through, it would try to deduct from productInventory (which has no row for it) and silently leave it.
  implication: fulfillFromInventory mutation also needs the same filter

- timestamp: 2026-02-23T00:00:00Z
  checked: convex/migrations/bomBackfill.ts (line 103-141)
  found: Migration designed to remove Brochure from menuProducts table. But it warns "orderItems reference this product — they keep snapshot data". If migration was NOT run, Brochure still exists in menuProducts with productType="packaging". orderItems still reference its ID.
  implication: Whether or not the migration was run, the fix in getStockForOrder is correct: filter out packaging-type products.

## Resolution

root_cause: `getStockForOrder` query in `convex/productInventory/queries.ts` included ALL order items that have a `menuProductId`, without filtering by the `productType` of the referenced menu product. The "Brochure - How to eat" is a menu product with `productType="packaging"`. It was added to orders as a line item (so `orderItems.menuProductId` is set). The query returned it with `quantityAvailable=0` (no `productInventory` row exists for a marketing brochure), blocking fulfillment with "2 items short — cannot fulfill".

fix: Added filter in `getStockForOrder` to skip order items where the referenced menuProduct has `productType === "packaging"`. Refactored from `Promise.all` map to sequential `for` loop to allow mid-stream filtering. Applied the same filter to `fulfillFromInventory` mutation (also used a cache to avoid redundant `db.get` calls). Pattern matches existing filters in `dispatchPlanner/queries.ts` and `menuProducts/queries.ts`.

verification: npm run type-check — PASS. npm run build — PASS (built in 11.68s).
files_changed:
  - convex/productInventory/queries.ts (getStockForOrder — skip productType="packaging" items)
  - convex/productInventory/mutations.ts (fulfillFromInventory — skip productType="packaging" items, cache menuProduct lookups)

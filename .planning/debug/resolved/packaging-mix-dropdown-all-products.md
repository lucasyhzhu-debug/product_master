---
status: resolved
trigger: "Default Packaging Mix product dropdown shows ALL menu products instead of only POS food products + currently-ordered products"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: confirmed — see Resolution
test: complete
expecting: n/a
next_action: implement filter in ManagerTargetSettings

## Symptoms

expected: Dropdown shows only POS food products (posSlot defined, productType="food") plus menu products referenced in active orders
actual: Dropdown shows every active menu product including "Brochure - How to eat", "Original", "Bite Sized Single/Double/Triple" etc
errors: none — purely a data-filtering problem
reproduction: Open Kitchen Manager Settings -> Default Packaging Mix -> click "Add product"
started: always (no filtering was ever applied)

## Eliminated

- hypothesis: problem is in backend query (list returns wrong data)
  evidence: api.menuProducts.queries.list with activeOnly:true is correct — it returns all active products by design; the filtering gap is purely in the frontend
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: ManagerTargetSettings.tsx line 149
  found: useQuery(api.menuProducts.queries.list, { activeOnly: true }) — returns every active menu product with no type or POS-slot filtering
  implication: the root cause — no filter is applied before passing to PackagingMixEditor

- timestamp: 2026-02-23
  checked: convex/schema.ts menuProducts table (lines 54-85)
  found: two relevant discriminating fields:
    1. posSlot (optional number) — set only for products assigned to food POS slots 1-4
    2. productType (optional union "food" | "packaging") — "food" = has >= 1 production component, "packaging" = only packaging components; undefined = neither
  implication: products like "Brochure" and non-ball items have no posSlot AND productType != "food"; filtering by productType === "food" OR posSlot !== undefined covers POS food products

- timestamp: 2026-02-23
  checked: convex/menuProducts/queries.ts listPosProducts (lines 50-65)
  found: existing query already does exactly the right filter: .filter(p => p.posSlot !== undefined && p.productType !== "packaging") — returns only food-POS-assigned products sorted by slot
  implication: api.menuProducts.queries.listPosProducts can be used directly instead of the current list call, OR safeMenuProducts can be filtered in the component

- timestamp: 2026-02-23
  checked: convex/orders/queries.ts
  found: getKitchenOrders returns orders that are kitchen-visible (isKitchenVisible flag); no dedicated query exists for "distinct menu products in active orders". The list query supports array-of-statuses filtering. Active production statuses include: Confirmed, InProduction, BeingPrepared, PaymentReceived and their legacy equivalents.
  implication: to also include products from active orders we need either (a) a new backend query or (b) client-side derivation from getKitchenOrders results which are already loaded in the parent KitchenViewV2 page

## Resolution

root_cause: |
  ManagerTargetSettings.tsx line 149 fetches ALL active menu products via
  api.menuProducts.queries.list and passes every one to PackagingMixEditor
  with no type or POS-slot filter. The menuProducts table has two fields that
  distinguish POS food products from non-food items:
    - productType: "food" (has >= 1 production component like a ball)
    - posSlot: defined (assigned to food POS slot 1-4)
  Products like "Brochure - How to eat" have productType=undefined/null and
  posSlot=undefined, so they appear alongside real food products.

fix: |
  Two-part frontend-only fix, no schema or backend changes needed:

  PART 1 — Replace the list query with the existing listPosProducts query:
    Change line 149 in ManagerTargetSettings.tsx from:
      const menuProducts = useQuery(api.menuProducts.queries.list, { activeOnly: true });
    to:
      const menuProducts = useQuery(api.menuProducts.queries.listPosProducts);

    listPosProducts already filters: posSlot !== undefined && productType !== "packaging"
    This gives exactly the food POS products sorted by slot. No new backend code needed.

  PART 2 — Merge in active-order products (products ordered but not yet on POS):
    The parent KitchenViewV2 already fetches kitchen orders via getKitchenOrders.
    Pass the distinct set of menuProductIds from those orders down to
    ManagerTargetSettings as a prop (activeOrderMenuProductIds: Id<"menuProducts">[]).
    In ManagerTargetSettings, run a second query to fetch those specific products
    (or derive them from already-fetched data) and union with the POS food list,
    deduplicating by _id.

    Alternatively (simpler, good enough for v1): filter safeMenuProducts in the
    component itself using productType === "food" which catches all ball-containing
    products regardless of POS slot assignment:
      const safeMenuProducts = (menuProducts ?? [])
        .filter(mp => mp.productType === "food")
        .map(mp => ({ _id: String(mp._id), name: mp.name }));
    This keeps the existing list query and adds a single .filter() call.
    Items in active orders that happen to have productType="food" are already included.

  RECOMMENDED APPROACH (cleanest):
    Use listPosProducts for the default POS food set (slot-ordered, already filtered).
    Then additionally load active-order products: add a new lightweight backend query
    api.menuProducts.queries.listFoodProducts (productType === "food") or reuse
    productType filter client-side. The simplest production-safe fix is the
    client-side filter approach (Part 2 simpler option) — one line change.

verification: pending implementation
files_changed: []

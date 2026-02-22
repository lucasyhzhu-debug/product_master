---
phase: quick-20
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/schema.ts
  - convex/vouchers/mutations.ts
  - convex/vouchers/queries.ts
  - convex/orders/helpers/voucherHandling.ts
  - convex/orders/mutations/orderCrud.ts
  - src/hooks/convex/useVouchers.ts
  - src/components/orders/VoucherInput.tsx
  - src/pages/VouchersManager.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Admin can create a voucher with a fixed Rp discount linked to a specific menu product"
    - "Item-linked vouchers appear in the VouchersManager list with the product name shown"
    - "Applying an item-linked voucher to an order discounts only order items matching that menu product, not the whole order"
    - "VoucherInput shows 'Rp X off [product name]' when a linked voucher is validated or applied"
    - "Orders with zero matching items still accept the voucher but the discount is Rp 0"
    - "Non-item-linked vouchers behave exactly as before"
  artifacts:
    - path: "convex/schema.ts"
      provides: "applicableMenuProductId optional field on vouchers table"
      contains: "applicableMenuProductId"
    - path: "convex/vouchers/mutations.ts"
      provides: "create/update accept applicableMenuProductId"
      exports: ["create", "update"]
    - path: "convex/vouchers/queries.ts"
      provides: "validateVoucher handles item-linked type, listActiveForCombobox includes applicableMenuProductId"
      exports: ["validateVoucher", "listActiveForCombobox"]
    - path: "convex/orders/helpers/voucherHandling.ts"
      provides: "validateAndApplyVoucher handles item-linked discount from order items"
    - path: "convex/orders/mutations/orderCrud.ts"
      provides: "order creation applies item-level discount to matching orderItems before computing totals"
    - path: "src/pages/VouchersManager.tsx"
      provides: "form product selector for item-linked vouchers, card shows linked product"
  key_links:
    - from: "src/pages/VouchersManager.tsx"
      to: "convex/vouchers/mutations.ts (create/update)"
      via: "useCreateVoucher/useUpdateVoucher hooks with applicableMenuProductId"
      pattern: "applicableMenuProductId"
    - from: "convex/orders/mutations/orderCrud.ts"
      to: "convex/orders/helpers/voucherHandling.ts"
      via: "validateAndApplyVoucher called with itemsToCreate for item-level discount calculation"
      pattern: "validateAndApplyVoucher"
    - from: "src/components/orders/VoucherInput.tsx"
      to: "convex/vouchers/queries.ts (validateVoucher)"
      via: "useVoucherValidation hook — result includes linkedProductName for item-linked type"
      pattern: "linkedProductName"
---

<objective>
Add an item-linked voucher type that applies a fixed Rp discount to specific products by menuProductId. When applied to an order, only order items whose menuProductId matches the voucher's applicableMenuProductId receive the discount amount subtracted from their discountAmount. The discount is item-level, not order-level.

Purpose: Allow promotional discounts targeted at a single product SKU (e.g., "Rp 5,000 off every Big Pack ordered") without discounting the entire order.
Output: Schema field, backend validation logic, order creation integration, VouchersManager form product picker, VoucherInput display updates.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/20-add-item-linked-voucher-type-with-direct/20-PLAN.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + backend — add applicableMenuProductId to vouchers and update validation logic</name>
  <files>
    convex/schema.ts
    convex/vouchers/mutations.ts
    convex/vouchers/queries.ts
    convex/orders/helpers/voucherHandling.ts
    convex/orders/mutations/orderCrud.ts
  </files>
  <action>
**convex/schema.ts** — Add `applicableMenuProductId: v.optional(v.id("menuProducts"))` to the `vouchers` table definition, immediately after the `maximumDiscount` field (line ~783). No index needed.

**convex/vouchers/mutations.ts** — `create` mutation: add `applicableMenuProductId: v.optional(v.id("menuProducts"))` to args. Validate: if `applicableMenuProductId` is set, `discountType` must be `"amount"` (throw `"Item-linked vouchers must use fixed amount discount type"`). Pass `applicableMenuProductId: data.applicableMenuProductId` into `ctx.db.insert`. `update` mutation: add same optional arg, same validation, include in patch when defined.

**convex/vouchers/queries.ts** —
- `ValidatedVoucherResult` interface: add `linkedProductName?: string` to the nested `voucher` object.
- `validateVoucher` query: add no new args (order-level total is sufficient for validation; item-matching happens at creation). In the `return` block add `linkedProductName: voucher.applicableMenuProductId ? (await ctx.db.get(voucher.applicableMenuProductId))?.name ?? "Unknown product" : undefined`. Also add `applicableMenuProductId: voucher.applicableMenuProductId` to the returned voucher object.
- `listActiveForCombobox` query: include `applicableMenuProductId` in the returned map fields so the dropdown can show the linked product info.

**convex/orders/helpers/voucherHandling.ts** —
- `AppliedVoucherInfo` interface: add `applicableMenuProductId?: Id<"menuProducts">` field.
- `validateAndApplyVoucher` signature: add `orderItems: Array<{ menuProductId?: Id<"menuProducts">; quantity: number; unitPrice: number; discountAmount: number }>` as 4th param (after customerId). For item-linked vouchers (where `voucher.applicableMenuProductId` is set):
  - Sum quantity of all items where `item.menuProductId === voucher.applicableMenuProductId`.
  - `calculatedDiscount = voucher.discountValue * matchingQty` (Rp per unit × units).
  - Ensure `calculatedDiscount <= orderTotal` (cap as before).
- Return `applicableMenuProductId: voucher.applicableMenuProductId ?? undefined` in the returned object.

**convex/orders/mutations/orderCrud.ts** —
- Where `validateAndApplyVoucher` is called (two call sites: order create ~line 260 and order update ~line 802): pass `itemsToCreate` (or equivalent items array) as the 4th argument. The items array must already be built before `validateAndApplyVoucher` is called — verify call order in both sites and reorder if needed.
- After `voucherInfo` is set and `voucherInfo.applicableMenuProductId` is defined: mutate `itemsToCreate` so that each item with matching `menuProductId` has `discountAmount += voucher.discountValue` (per unit — meaning `discountAmount` for that item increases by `discountValue`, and `lineTotal` must be recalculated: `lineTotal = quantity * unitPrice - newDiscountAmount`). Recalculate `totalAmount` from updated `itemsToCreate`. Set `voucherDiscountValue` to `voucherInfo.voucherDiscountValue` (the total calculated discount). The order-level `finalTotal = totalAmount` (no additional order-level discount when voucher is item-linked). Note: `lowPriceConfirmed` check should use updated `finalTotal`.
- For the order update call site: if the existing order had an item-linked voucher being re-applied, the same item-level adjustment applies. Ensure items used in the update path are the updated items.
  </action>
  <verify>Run `npm run type-check` — must pass with 0 errors. Then run `npm run build` — must compile clean.</verify>
  <done>Schema has `applicableMenuProductId` on vouchers. Mutations accept and persist it. validateVoucher returns linkedProductName. validateAndApplyVoucher correctly computes item-level discount. Order creation applies discountAmount per matching item.</done>
</task>

<task type="auto">
  <name>Task 2: Frontend — VouchersManager product picker + VoucherInput item-linked display + hook types</name>
  <files>
    src/hooks/convex/useVouchers.ts
    src/components/orders/VoucherInput.tsx
    src/pages/VouchersManager.tsx
  </files>
  <action>
**src/hooks/convex/useVouchers.ts** —
- Add `applicableMenuProductId?: Id<"menuProducts">` to `VoucherCreateInput` and `VoucherUpdateInput` interfaces.
- Update the `vouchersApi` type cast to include `applicableMenuProductId` in queries: `listActiveForCombobox` returned type should include `applicableMenuProductId?: string`.
- `AppliedVoucher` interface (exported from `VoucherInput.tsx` — check for re-export) does NOT need to change; `calculatedDiscount` is always the numeric discount already computed by backend.

**src/components/orders/VoucherInput.tsx** —
- `AppliedVoucher` interface: add `linkedProductName?: string`.
- Update `handleApply`: when `validationResult.voucher.linkedProductName` is defined, include it in the `AppliedVoucher` passed to `onApplyVoucher`.
- Applied state display: after the voucher name div, if `appliedVoucher.linkedProductName`, show `<div className="text-xs text-green-600">Applies to: {appliedVoucher.linkedProductName}</div>`.
- Validation success message: if `validationResult.voucher.linkedProductName`, show `"Rp {discountValue} off per {linkedProductName}"` instead of the generic message. Use `formatCurrency(validationResult.voucher.discountValue)` for the per-unit amount.
- Dropdown item display: if `voucher.applicableMenuProductId`, show a small `<span className="text-xs text-muted-foreground ml-1">(per item)</span>` next to the badge — the returned combobox items now include `applicableMenuProductId`, so check its presence.

**src/pages/VouchersManager.tsx** —
- Import `useMenuProducts` from `@/hooks/convex/useMenuProducts` (already returns `{ data: MenuProduct[] }` — check the exact return shape and use accordingly, typically `useMenuProducts(true)` for active only).
- `VoucherFormState`: add `applicableMenuProductId: string` (empty string = not linked).
- `initialFormState`: add `applicableMenuProductId: ""`.
- `openEditDialog`: populate `applicableMenuProductId: voucher.applicableMenuProductId ?? ""`.
- `handleCreate` / `handleUpdate`: pass `applicableMenuProductId: form.applicableMenuProductId || undefined` to `createVoucher`/`updateVoucher`.
- `VoucherForm` component:
  - Accept `menuProducts: Array<{ _id: string; name: string; code: string }>` prop.
  - After the Discount Type/Value grid, add a new section: `<Label>Linked Product (optional)</Label>` with a `<Select>` for `applicableMenuProductId`. Options: `<SelectItem value="">No product link (applies to whole order)</SelectItem>` plus one per active menu product. Only show this section when `discountType === "amount"` (item-linking only makes sense for fixed Rp discount). When a product is selected, show helper text: `"Rp {discountValue || '...'} will be deducted from each unit of this product in the order"`.
  - When `discountType` changes to `"percentage"`, auto-reset `applicableMenuProductId` to `""`.
- `VoucherCard`: in the stats section, if `voucher.applicableMenuProductId`, show `<div className="flex items-center gap-1"><Package className="w-3 h-3" />Item: {productName}</div>`. Resolve the name: pass a `menuProductsMap: Map<string, string>` prop from parent, or look up inline via a separate `useQuery`. Simplest: pass `menuProducts` list from parent to `VoucherCard`, look up by id. In `VouchersManager` render, pass `menuProducts` (active menu products list, loaded at top of component before conditional returns per React hooks rules) to each `VoucherCard`. Import `Package` icon from `lucide-react`.
- `formatDiscountValue`: for item-linked vouchers, append `"/item"` — check `voucher.applicableMenuProductId` is set, if so return `"${formatCurrency(voucher.discountValue)}/item"`.

All hooks called before any conditional returns (React hooks rule). `useMenuProducts(true)` called unconditionally at top of `VouchersManager`.
  </action>
  <verify>Run `npm run type-check` — 0 errors. Run `npm run build` — clean. Manually open VouchersManager: Create Voucher dialog shows "Linked Product" select when discount type is "amount". Existing percentage vouchers show no product selector.</verify>
  <done>VouchersManager form has product picker for amount-type vouchers. VoucherCard shows linked product name. VoucherInput applied/validation state shows "Rp X off per [Product]" for item-linked vouchers. All type checks pass.</done>
</task>

</tasks>

<verification>
1. `npm run type-check` passes with 0 errors
2. `npm run build` succeeds
3. In VouchersManager: create a voucher with type=amount, select a menu product — saved and shown in card with "/item" label
4. In VouchersManager: create a voucher with type=percentage — no product selector appears
5. In OrderCreate POS: apply an item-linked voucher — validation shows "Rp X off per [product]"; applied state shows linked product name; order total only reflects discount for matching items
</verification>

<success_criteria>
- `npm run type-check` and `npm run build` both pass
- Item-linked voucher persists `applicableMenuProductId` in Convex
- Order with matching items: `voucherDiscountValue = discountValue * matchingQty`; each matching item's `discountAmount` increases by `discountValue` per unit
- Order with zero matching items: `voucherDiscountValue = 0`; no item discountAmount changed
- Existing percentage and flat-amount vouchers (no `applicableMenuProductId`) work identically to before
</success_criteria>

<output>
After completion, create `.planning/quick/20-add-item-linked-voucher-type-with-direct/20-SUMMARY.md` using the summary template.
</output>

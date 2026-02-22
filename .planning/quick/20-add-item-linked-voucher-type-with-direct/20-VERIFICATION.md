---
phase: quick-20
verified: 2026-02-22T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Quick Task 20: Item-Linked Voucher Type Verification Report

**Task Goal:** Add item-linked voucher type with direct price discount (Rp) for specific products to voucher management system
**Verified:** 2026-02-22
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                        | Status     | Evidence                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Admin can create a voucher with a fixed Rp discount linked to a specific menu product        | ✓ VERIFIED | `mutations.ts` accepts `applicableMenuProductId`, validates `discountType === "amount"`, inserts field. Form in VouchersManager shows product picker when `discountType === "amount"` and passes value through `handleCreate`. |
| 2   | Item-linked vouchers appear in the VouchersManager list with the product name shown          | ✓ VERIFIED | `VoucherCard` renders `<Package>` icon + `menuProductsMap.get(voucher.applicableMenuProductId)` when field is set. `menuProductsMap` built from `useConvexMenuProducts(true)` at top of component. `formatDiscountValue` appends `/item` suffix for item-linked vouchers. |
| 3   | Applying an item-linked voucher to an order discounts only order items matching that menu product, not the whole order | ✓ VERIFIED | `validateAndApplyVoucher` computes `matchingQty` by filtering `orderItems` on `menuProductId === voucher.applicableMenuProductId`, sets `calculatedDiscount = discountValue * matchingQty`. In `orderCrud.ts` create path (lines 273–292), matching items get `discountAmount += perUnitDiscount * quantity` and `lineTotal` recalculated; `totalAmount` rebuilt from updated items; `finalTotal = totalAmount` (no additional order-level reduction). |
| 4   | VoucherInput shows "Rp X off [product name]" when a linked voucher is validated or applied  | ✓ VERIFIED | Validation message: `linkedProductName ? \`${formatCurrency(discountValue)} off per ${linkedProductName}\` : …` (lines 341–342). Applied state: `{appliedVoucher.linkedProductName && <div>Applies to: {linkedProductName}</div>}` (lines 189–193). `handleApply` passes `linkedProductName` from `validationResult.voucher` into `AppliedVoucher` (line 142). |
| 5   | Orders with zero matching items still accept the voucher but the discount is Rp 0            | ✓ VERIFIED | `matchingQty = 0` when no items match → `calculatedDiscount = discountValue * 0 = 0`. No guard prevents applying the voucher in this case. Minimum order amount check uses `orderTotal`, not item match count. |
| 6   | Non-item-linked vouchers behave exactly as before                                            | ✓ VERIFIED | `validateAndApplyVoucher` branches on `voucher.applicableMenuProductId !== undefined` first; else falls through to original percentage/amount logic. Order create path only applies item-level adjustments `if (voucherInfo.applicableMenuProductId && voucherInfo.discountValuePerUnit)`. All existing voucher flows unchanged. |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact                                             | Expected                                                          | Status     | Details                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`                                   | `applicableMenuProductId` optional field on vouchers table        | ✓ VERIFIED | Line 780: `applicableMenuProductId: v.optional(v.id("menuProducts"))` present after `maximumDiscount` field.      |
| `convex/vouchers/mutations.ts`                       | `create`/`update` accept `applicableMenuProductId`               | ✓ VERIFIED | Both mutations include the arg (lines 49, 142), validate item-linked constraint, and persist the field.           |
| `convex/vouchers/queries.ts`                         | `validateVoucher` returns `linkedProductName`; `listActiveForCombobox` includes `applicableMenuProductId` | ✓ VERIFIED | `ValidatedVoucherResult` interface has `linkedProductName?` and `applicableMenuProductId?`. `validateVoucher` resolves product name via `ctx.db.get`. `listActiveForCombobox` maps `applicableMenuProductId` in return. |
| `convex/orders/helpers/voucherHandling.ts`           | `validateAndApplyVoucher` handles item-linked discount            | ✓ VERIFIED | Fourth param `orderItems` added. Item-linked branch (lines 99–104) computes `matchingQty * discountValue`. Returns `applicableMenuProductId` and `discountValuePerUnit`. |
| `convex/orders/mutations/orderCrud.ts`               | Order creation applies item-level discount to matching items      | ✓ VERIFIED | `validateAndApplyVoucher` called with `itemsToCreate` (line 267). Post-call block (lines 273–292) mutates items with per-unit discount and rebuilds `totalAmount`. Update path passes `orderItemsForVoucher` (lines 835–847). |
| `src/pages/VouchersManager.tsx`                      | Form product selector for item-linked vouchers; card shows linked product | ✓ VERIFIED | Form section (lines 985–1013): conditional on `discountType === "amount"`, renders `<Select>` with menu products. Card (lines 692–697): shows `<Package>` icon + product name. `discountType` change to `"percentage"` resets `applicableMenuProductId` to `""` (line 943). |

---

### Key Link Verification

| From                                    | To                                               | Via                                                    | Status     | Details                                                                                                                |
| --------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/pages/VouchersManager.tsx`         | `convex/vouchers/mutations.ts` (create/update)  | `useCreateVoucher`/`useUpdateVoucher` with `applicableMenuProductId` | ✓ WIRED | Lines 310–312 and 359–361: `applicableMenuProductId` cast to `Id<"menuProducts">` and passed. Hook types in `useVouchers.ts` (lines 55, 71) include the field. |
| `convex/orders/mutations/orderCrud.ts`  | `convex/orders/helpers/voucherHandling.ts`       | `validateAndApplyVoucher` called with `itemsToCreate`  | ✓ WIRED    | Line 267: `validateAndApplyVoucher(ctx, args.voucherCode, totalAmount, customerId, itemsToCreate)`. Result used to mutate items (lines 273–292). |
| `src/components/orders/VoucherInput.tsx` | `convex/vouchers/queries.ts` (validateVoucher) | `useVoucherValidation` — result includes `linkedProductName` | ✓ WIRED | Line 142: `linkedProductName: voucher.linkedProductName` passed into `onApplyVoucher`. Lines 341–342: `linkedProductName` used in validation message display. |

---

### Requirements Coverage

No `requirements:` array declared in plan frontmatter (empty `[]`). No REQUIREMENTS.md IDs to cross-reference.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `convex/orders/mutations/orderCrud.ts` | 856 | Comment: "On update, we apply at order-level since item records aren't rebuilt here" | Info | Order update path applies item-linked voucher discount as a flat order-level deduction (`totalAmount - voucherDiscountValue`) rather than per-item discount injection. This is a known accepted limitation documented in the code. Does not break the create path which is the primary flow. |

No blocker or warning anti-patterns detected.

---

### Human Verification Required

#### 1. VouchersManager: Create item-linked voucher end-to-end

**Test:** Log in as admin. Open VouchersManager. Click "Create Voucher". Set discount type to "Fixed Amount". Verify "Linked Product" selector appears. Select a menu product. Save. Verify the card shows the product name with Package icon and "/item" suffix on discount value.

**Expected:** Voucher card shows e.g. "Rp 5,000/item" and "Item: [Product Name]" in the stats row.

**Why human:** UI rendering, selector state transitions, and card display cannot be verified programmatically.

#### 2. OrderCreate POS: Apply item-linked voucher — matching items present

**Test:** Create an order with 2 units of the linked product. Enter the item-linked voucher code. Observe validation message. Click Apply. Observe applied state. Confirm order.

**Expected:** Validation shows "Rp X off per [Product Name]". Applied state shows "Applies to: [Product Name]". Order total reflects `discountValue * 2` reduction. Individual item `discountAmount` increased by `discountValue` per unit.

**Why human:** Order line-item discount rendering and total calculation correctness requires live data with a real voucher and order.

#### 3. OrderCreate POS: Apply item-linked voucher — zero matching items

**Test:** Create an order containing only products that do NOT match the linked product. Enter the item-linked voucher code and apply.

**Expected:** Voucher applies with Rp 0 discount. Order total unchanged. No error thrown.

**Why human:** Edge case requiring a real order with specific item composition.

#### 4. VouchersManager: Percentage voucher — no product selector shown

**Test:** Create Voucher dialog with discount type "Percentage". Verify "Linked Product" section is absent.

**Expected:** Product selector section does not render. Existing percentage vouchers remain unaffected.

**Why human:** Conditional rendering verification requires UI interaction.

---

### Gaps Summary

No gaps found. All six observable truths are fully verified with substantive, wired implementations. The one noted item (order update path applies item-linked discount at order-level rather than per-item) is an accepted design trade-off explicitly documented in the code, not a bug — the create path (primary flow) correctly handles per-item discounts.

---

_Verified: 2026-02-22T00:00:00Z_
_Verifier: Claude (gsd-verifier)_

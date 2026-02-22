---
phase: quick-17
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/schema.ts
  - convex/customers/mutations.ts
  - convex/orders/mutations/orderCrud.ts
  - src/components/orders/CustomerSearch.tsx
  - src/pages/OrderCreate.tsx
autonomous: true
requirements: [ADDR-01, ADDR-02, ADDR-03, ADDR-04, ADDR-05, ADDR-06]

must_haves:
  truths:
    - "Selecting an existing customer pre-populates the delivery address field with their defaultAddress"
    - "Selecting an existing customer pre-populates the phone/WhatsApp field (already works)"
    - "Order address can be changed independently without affecting the customer record"
    - "On save/submit, if address differs from customer defaultAddress, user sees option to update customer default"
    - "New customers get their delivery address saved as defaultAddress on order creation"
    - "Each customer has at most 1 defaultAddress (latest used)"
  artifacts:
    - path: "convex/schema.ts"
      provides: "defaultAddress field on customers table"
      contains: "defaultAddress"
    - path: "convex/customers/mutations.ts"
      provides: "defaultAddress in create/update mutation args"
      contains: "defaultAddress"
    - path: "convex/orders/mutations/orderCrud.ts"
      provides: "Auto-save defaultAddress for new customers; optional customer address update on updateDraft"
      contains: "defaultAddress"
    - path: "src/pages/OrderCreate.tsx"
      provides: "Address pre-populate on customer select and address sync UI on save"
      contains: "defaultAddress"
  key_links:
    - from: "src/components/orders/CustomerSearch.tsx"
      to: "src/pages/OrderCreate.tsx"
      via: "onCustomerSelect callback now passes defaultAddress"
      pattern: "onCustomerSelect.*defaultAddress"
    - from: "src/pages/OrderCreate.tsx"
      to: "convex/orders/mutations/orderCrud.ts"
      via: "updateDraftMutation with updateCustomerAddress flag"
      pattern: "updateCustomerAddress"
---

<objective>
Add customer address sync to the order creation flow. When selecting an existing customer, pre-populate the delivery address with their saved default address. On order save/submit, if the delivery address differs from the customer's default, offer to update it. New customers automatically get their address saved.

Purpose: Reduce repetitive address entry for repeat customers while preserving per-order address flexibility.
Output: Updated schema, mutations, and OrderCreate UI with address sync behavior.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@convex/schema.ts (customers table definition around line 284)
@convex/customers/mutations.ts (create/update mutations)
@convex/customers/queries.ts (get/search queries - defaultAddress auto-returned)
@convex/orders/mutations/orderCrud.ts (createDraft, updateDraft mutations)
@src/components/orders/CustomerSearch.tsx (customer selection component)
@src/pages/OrderCreate.tsx (order creation page with address field)
</context>

## Git Workflow
**Branch:** `feature/quick-17-customer-address-sync`
**Checkpoints:** None (autonomous)

## Implementation Waves
### Wave 1: Backend + Frontend [SEQUENTIAL]
| Agent | Task | Files |
|-------|------|-------|
| executor | Task 1: Backend schema + mutations | convex/schema.ts, convex/customers/mutations.ts, convex/orders/mutations/orderCrud.ts |
| executor | Task 2: Frontend address pre-populate + sync | src/components/orders/CustomerSearch.tsx, src/pages/OrderCreate.tsx |

### Wave 2: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| Bash | npm run build |

## Documentation Updates
- [ ] CHANGELOG.md

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Selecting existing customer fills delivery address with their defaultAddress
- [ ] Address can be changed per-order without auto-updating customer
- [ ] Save/submit shows update prompt when address differs from customer default
- [ ] New customer creation saves delivery address as defaultAddress

<tasks>

<task type="auto">
  <name>Task 1: Backend - Add defaultAddress to customers schema and mutations</name>
  <files>convex/schema.ts, convex/customers/mutations.ts, convex/orders/mutations/orderCrud.ts</files>
  <action>
1. **convex/schema.ts** - Add `defaultAddress: v.optional(v.string())` to the `customers` table definition (after `notes` field, before `createdBy`).

2. **convex/customers/mutations.ts** - Add `defaultAddress: v.optional(v.string())` to the `args` of both `create` and `update` mutations. In `create`, include `defaultAddress` in the `ctx.db.insert` call. In `update`, add `if (updates.defaultAddress !== undefined) patchData.defaultAddress = updates.defaultAddress;` to the patch block.

3. **convex/orders/mutations/orderCrud.ts** - Three changes:

   a. In `createDraft` handler, when creating a new customer via `args.newCustomer` (around line 669), the `ctx.db.insert("customers", ...)` call does NOT have address info yet (address is set later via updateDraft). No change needed here -- address will be synced on updateDraft/submit.

   b. In `updateDraft` mutation args, add: `updateCustomerAddress: v.optional(v.boolean())`. In the handler, after building the patch and before applying it, if `args.updateCustomerAddress === true` and `args.deliveryAddress` is provided, update the customer's defaultAddress:
   ```
   if (args.updateCustomerAddress && args.deliveryAddress !== undefined) {
     const custId = (patch.customerId as Id<"customers"> | undefined) ?? order.customerId;
     await ctx.db.patch(custId, { defaultAddress: args.deliveryAddress });
   }
   ```

   c. In the `create` mutation (line 89), when creating a new customer via `args.newCustomer`, also save `defaultAddress` from `args.deliveryAddress` if provided. Add to the `ctx.db.insert("customers", ...)` call: `defaultAddress: args.deliveryAddress || undefined`.
  </action>
  <verify>Run `npx tsc --noEmit` (or `npm run type-check`) to confirm no type errors in modified files.</verify>
  <done>customers table has defaultAddress field; create/update mutations accept it; updateDraft can optionally sync address back to customer; new customer creation in order.create saves deliveryAddress as defaultAddress.</done>
</task>

<task type="auto">
  <name>Task 2: Frontend - Pre-populate address on customer select and address sync prompt</name>
  <files>src/components/orders/CustomerSearch.tsx, src/pages/OrderCreate.tsx</files>
  <action>
1. **src/components/orders/CustomerSearch.tsx** - Update the `CustomerSearchProps` interface to pass `defaultAddress`:
   - Change `onCustomerSelect` signature to: `(customerId: Id<"customers">, name: string, phone?: string, defaultAddress?: string) => void`
   - In `handleSelect`, pass `customer.defaultAddress` as the 4th argument to `onCustomerSelect`. The customer objects from `useConvexCustomerSearch` already include all fields from the DB (via `ctx.db.get`).
   - In the "selected" display state, optionally show a small address indicator if `selected.defaultAddress` exists (e.g., a small MapPin icon + truncated address text under the phone).

2. **src/pages/OrderCreate.tsx** - Four changes:

   a. **State**: Add `customerDefaultAddress` state: `const [customerDefaultAddress, setCustomerDefaultAddress] = useState<string>('')`

   b. **handleCustomerSelect** (around line 196): Accept `defaultAddress?: string` as 4th param. Store it in `customerDefaultAddress` state. If not in edit mode (no `editDraftId`) and `defaultAddress` exists, pre-populate: `setDeliveryAddress(defaultAddress)`.

   c. **Address sync detection**: Add a computed boolean:
   ```typescript
   const addressDiffersFromCustomer = customerDefaultAddress !== ''
     && deliveryAddress.trim() !== ''
     && deliveryAddress.trim() !== customerDefaultAddress.trim();
   ```
   For NEW customers (no prior defaultAddress), also consider address changed if `deliveryAddress` is non-empty and `isNewCustomer` was true (customer was just created without an address).

   d. **Address sync UI**: In the delivery address section of the form (find the Textarea for delivery address), add a checkbox/toggle below the address field that appears when `addressDiffersFromCustomer` is true OR when `customerDefaultAddress === ''` and `deliveryAddress` is non-empty (first address for existing customer):
   ```tsx
   {(addressDiffersFromCustomer || (customerDefaultAddress === '' && deliveryAddress.trim() !== '' && customerId)) && (
     <label className="flex items-center gap-2 text-xs text-muted-foreground mt-2 cursor-pointer">
       <input
         type="checkbox"
         checked={updateCustomerAddress}
         onChange={(e) => setUpdateCustomerAddress(e.target.checked)}
         className="rounded border-gray-300"
       />
       Save as customer's default address
     </label>
   )}
   ```
   Add state: `const [updateCustomerAddress, setUpdateCustomerAddress] = useState(true)` (default checked).
   Reset `updateCustomerAddress` to `true` when customer changes.

   e. **Pass to mutations**: In `handleSaveDraft` and `executeSubmit`, when calling `updateDraftMutation`, pass `updateCustomerAddress: updateCustomerAddress && (addressDiffersFromCustomer || (customerDefaultAddress === '' && deliveryAddress.trim() !== ''))` so the backend knows to sync.

   f. **Edit mode**: When loading an existing draft (the `useEffect` around line 106), also fetch the customer's current defaultAddress. Use a separate query: `const customerData = useQuery(api.customers.queries.get, customerId ? { id: customerId } : 'skip');` and set `customerDefaultAddress` from it when it loads. Place this query near the other queries (line ~160). Guard with a ref to avoid overwriting user edits.
  </action>
  <verify>Run `npm run build` to confirm no type or build errors. Manually verify: create new order, select existing customer -> address field pre-fills. Change address -> "Save as default" checkbox appears. Submit -> customer's defaultAddress updated in DB.</verify>
  <done>Selecting an existing customer pre-populates delivery address; changing address shows sync checkbox (default checked); save/submit updates customer defaultAddress when checkbox is checked; new customers get address saved automatically; edit mode correctly loads customer's current defaultAddress for comparison.</done>
</task>

<task type="auto">
  <name>Task 3: Build verification and edge case handling</name>
  <files>src/pages/OrderCreate.tsx</files>
  <action>
1. Run `npm run build` and fix any type errors.
2. Run `npm run test` to ensure no regressions.
3. Edge cases to verify in code:
   - Customer with no defaultAddress selected: address field stays empty, no sync checkbox shown until address is typed.
   - Customer with defaultAddress selected: address pre-fills, if unchanged no sync checkbox (or checkbox hidden since no diff).
   - Edit mode: address already loaded from order, customer defaultAddress loaded for comparison. If user changes address, sync checkbox appears.
   - Quick address buttons (QuickAddressButtons component): still work, and trigger address diff detection.
   - `handleCustomerSelect` resets `updateCustomerAddress` to true for fresh selection.
  </action>
  <verify>`npm run build` passes with exit code 0. `npm run test` passes.</verify>
  <done>Build and tests pass. All edge cases handled in code.</done>
</task>

</tasks>

<verification>
- `npm run type-check` passes
- `npm run build` succeeds
- `npm run test` passes (no regressions)
</verification>

<success_criteria>
- Selecting an existing customer with a defaultAddress pre-populates the delivery address field
- Order address can be changed without auto-updating the customer record
- A "Save as customer's default address" checkbox appears when address differs or is new
- Save/submit with checkbox checked updates the customer's defaultAddress in the DB
- New customers created through order flow get their delivery address saved as defaultAddress
- Build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/17-customer-address-sync-pre-populate-addre/17-SUMMARY.md`
</output>

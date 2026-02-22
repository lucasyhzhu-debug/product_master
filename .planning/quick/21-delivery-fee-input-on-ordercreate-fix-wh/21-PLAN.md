---
phase: quick-21
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/pages/OrderCreate.tsx
  - convex/orders/whatsapp.ts
autonomous: true
requirements: [QUICK-21]

must_haves:
  truths:
    - "OrderCreate Order Summary shows a Delivery Fee row between voucher rows and Total"
    - "Order total in OrderCreate includes deliveryFee (subtotal - discount + fee)"
    - "Submitting an order with deliveryFee > 0 persists the fee via updateDeliveryFee"
    - "WhatsApp payment_request template shows ongkir line BEFORE the Total line"
    - "WhatsApp receipt template shows ongkir line BEFORE the Total line"
  artifacts:
    - path: "src/pages/OrderCreate.tsx"
      provides: "deliveryFee state + input row in Order Summary + updated total calc + executeSubmit persistence"
    - path: "convex/orders/whatsapp.ts"
      provides: "corrected delivery fee line position in generatePaymentRequest and generateReceipt"
  key_links:
    - from: "src/pages/OrderCreate.tsx"
      to: "api.orders.mutations.index.updateDeliveryFee"
      via: "useMutation call in executeSubmit when deliveryFee > 0 and draftOrderId exists"
      pattern: "updateDeliveryFee.*orderId.*deliveryFee"
    - from: "convex/orders/whatsapp.ts generatePaymentRequest"
      to: "WhatsApp message output"
      via: "template string construction"
      pattern: "deliveryFeeLine.*Total"
---

<objective>
Two targeted fixes to delivery fee handling:
1. Add a delivery fee input row to the OrderCreate Order Summary card so fees can be set at creation time.
2. Fix the delivery fee line position in the two hardcoded WhatsApp template functions so ongkir appears before Total, not after.

Purpose: Delivery fees set at order creation time currently have no input field; fees were also rendered after the total line in WhatsApp messages, which looks confusing to customers.
Output: Updated OrderCreate.tsx with deliveryFee state + row + persistence, and corrected whatsapp.ts template strings.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/pages/OrderCreate.tsx
@convex/orders/whatsapp.ts
@src/components/orders/OrderItems.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add deliveryFee input to OrderCreate Order Summary</name>
  <files>src/pages/OrderCreate.tsx</files>
  <action>
Make the following changes to src/pages/OrderCreate.tsx:

1. ADD `deliveryFee` state after the `notes` state declaration (around line 89):
   ```typescript
   const [deliveryFee, setDeliveryFee] = useState(0);
   ```

2. ADD `updateDeliveryFeeMutation` after the existing mutation declarations (around line 182):
   ```typescript
   const updateDeliveryFeeMutation = useMutation(api.orders.mutations.index.updateDeliveryFee);
   ```

3. UPDATE `total` calculation (line 202). Change:
   ```typescript
   const total = subtotal - totalDiscountValue;
   ```
   To:
   ```typescript
   const total = subtotal - totalDiscountValue + deliveryFee;
   ```

4. ADD the delivery fee row in the Order Summary card (section starting ~line 815). Insert this block AFTER the voucher/discount rows and BEFORE the `<div className="flex justify-between items-center mb-4">` Total row:
   ```tsx
   {/* Delivery Fee row */}
   <div className="flex justify-between items-center text-sm mb-2">
     <span className="text-muted-foreground">🚚 Delivery Fee</span>
     <input
       type="number"
       min={0}
       value={deliveryFee || ''}
       onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
       placeholder="0"
       className="h-7 w-28 text-xs text-right rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring"
     />
   </div>
   ```
   Place this row inside the existing conditional that shows subtotal/voucher rows (inside the `{totalDiscountValue > 0 && appliedVoucher && (...)}` block), AND also add an always-visible version outside that block. Simplest approach: add the delivery fee row unconditionally just above the Total row (before the `<div className="flex justify-between items-center mb-4">` line).

5. UPDATE `executeSubmit` — after the `updateDraftMutation` call inside the `if (draftOrderId)` branch, add delivery fee persistence:
   ```typescript
   // Persist delivery fee if set
   if (deliveryFee > 0) {
     await updateDeliveryFeeMutation({ orderId: draftOrderId, deliveryFee });
   }
   ```
   Add this BEFORE the `updateOrderStatus.mutate` call.

6. Also add delivery fee persistence in `handleSaveDraft`, after the `updateDraftMutation` call:
   ```typescript
   if (deliveryFee > 0) {
     await updateDeliveryFeeMutation({ orderId: draftOrderId, deliveryFee });
   }
   ```

7. In the `useEffect` that pre-fills draft data (around line 110), load existing deliveryFee from order:
   ```typescript
   if (existingOrder.deliveryFee) {
     setDeliveryFee(existingOrder.deliveryFee);
   }
   ```
   Add after the `setNotes(existingOrder.notes ?? '');` line.
  </action>
  <verify>npm run type-check passes with no new errors in OrderCreate.tsx</verify>
  <done>
    - deliveryFee state initialises to 0
    - Order Summary shows "🚚 Delivery Fee" input row above Total
    - Total value = subtotal - discount + deliveryFee (visible change when fee is typed)
    - executeSubmit calls updateDeliveryFeeMutation when fee > 0 and draftOrderId exists
    - handleSaveDraft also persists fee
    - Edit mode pre-fills fee from existingOrder.deliveryFee
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix deliveryFeeLine position in WhatsApp hardcoded templates</name>
  <files>convex/orders/whatsapp.ts</files>
  <action>
Two functions need the delivery fee line moved BEFORE the Total line. These are surgical string changes only — do not touch generateProductionStarted or generateShippingConfirmation.

**Fix 1 — generatePaymentRequest (around line 288-308):**

Current return string has:
```
*Total: ${finalTotalFormatted}*${discountNote ? `\n${discountNote}` : ""}
${deliveryFeeLine}
```

Change to:
```
${deliveryFeeLine}*Total: ${finalTotalFormatted}*${discountNote ? `\n${discountNote}` : ""}
```

Note: `deliveryFeeLine` already ends with `\n` when non-empty (defined as `\`🚚 Ongkir: ${formatCurrency(order.deliveryFee)}\n\``), so it naturally flows into the Total line. When empty string, nothing changes.

**Fix 2 — generateReceipt (around line 438-447):**

Current return has:
```
*Total: ${finalTotalFormatted}*${discountNote ? `\n${discountNote}` : ""}${deliveryFeeLine}
```

The `deliveryFeeLine` in generateReceipt starts with `\n` (defined as `\`\n🚚 Ongkir: ${formatCurrency(order.deliveryFee)}\``).

Change to put deliveryFeeLine between items separator and Total:
```
${deliveryFeeLine ? deliveryFeeLine + '\n' : ''}*Total: ${finalTotalFormatted}*${discountNote ? `\n${discountNote}` : ""}
```

Or simpler — redefine deliveryFeeLine locally within the return string construction so it appears before Total. The cleanest fix: in the return template literal, move `${deliveryFeeLine}` to appear on the line before `*Total:*`.

Exact change in generateReceipt return:
```
----------------
${deliveryFeeLine ? deliveryFeeLine.trimStart() + '\n' : ''}*Total: ${finalTotalFormatted}*${discountNote ? `\n${discountNote}` : ""}

${paymentInfo}
```
(Remove the trailing `${deliveryFeeLine}` that was appended after discountNote.)
  </action>
  <verify>npm run type-check passes; visually confirm by reading the updated function bodies to ensure deliveryFeeLine text comes before *Total:* in both template strings.</verify>
  <done>
    - In generatePaymentRequest: deliveryFeeLine renders before "*Total: ..." line
    - In generateReceipt: deliveryFeeLine renders before "*Total: ..." line
    - When deliveryFee is 0 / not set, deliveryFeeLine is empty string and output is unchanged
    - generateProductionStarted and generateShippingConfirmation are untouched
  </done>
</task>

<task type="auto">
  <name>Task 3: Build verification</name>
  <files></files>
  <action>
Run the build to confirm no TypeScript or compilation errors:
```bash
npm run build
```
Fix any type errors that surface. Common issues to watch for:
- `existingOrder.deliveryFee` may need a type guard (`existingOrder.deliveryFee ?? 0`)
- The `updateDeliveryFeeMutation` args must match the Convex validator exactly (`{ orderId: Id<"orders">, deliveryFee: number }`)
  </action>
  <verify>npm run build exits with code 0 (no errors)</verify>
  <done>Build passes clean. Both files compile without TypeScript errors.</done>
</task>

</tasks>

<verification>
1. In OrderCreate Order Summary, a "🚚 Delivery Fee" numeric input is visible above the Total row
2. Typing 15000 in the fee input changes Total from e.g. Rp 150,000 to Rp 165,000
3. Submitting the order results in the fee being stored (verify by opening order detail and seeing delivery fee displayed)
4. In whatsapp.ts, the ongkir line for generatePaymentRequest appears ABOVE the Total line in the template string
5. In whatsapp.ts, the ongkir line for generateReceipt appears ABOVE the Total line in the template string
6. npm run build passes
</verification>

<success_criteria>
- [ ] deliveryFee state in OrderCreate, default 0
- [ ] Delivery Fee input row visible in Order Summary above Total
- [ ] total = subtotal - discount + deliveryFee
- [ ] executeSubmit persists fee via updateDeliveryFeeMutation when fee > 0
- [ ] handleSaveDraft also persists fee
- [ ] Edit mode pre-fills deliveryFee from existingOrder
- [ ] generatePaymentRequest: ongkir before Total
- [ ] generateReceipt: ongkir before Total
- [ ] npm run build passes
</success_criteria>

<output>
After completion, create `.planning/quick/21-delivery-fee-input-on-ordercreate-fix-wh/21-SUMMARY.md`
</output>

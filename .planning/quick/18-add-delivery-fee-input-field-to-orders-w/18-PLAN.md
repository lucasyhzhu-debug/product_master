---
phase: quick-18
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/schema.ts
  - convex/orders/mutations/orderCrud.ts
  - convex/orders/mutations/index.ts
  - convex/orders/whatsapp.ts
  - src/lib/types.ts
  - src/lib/transforms.ts
  - src/hooks/convex/useOrders.ts
  - src/components/orders/OrderItems.tsx
  - src/pages/OrderDetail.tsx
autonomous: true
requirements:
  - QUICK-18
must_haves:
  truths:
    - "Order detail page shows a delivery fee input field below order sub-totals"
    - "Entering a delivery fee updates the final total to include it (products total - discounts + delivery fee)"
    - "WhatsApp messages show delivery fee as a separate line item when set"
    - "Delivery fee is stored on the order and persisted across page refreshes"
    - "Orders with no delivery fee behave exactly as before (zero delivery fee = no change)"
  artifacts:
    - path: "convex/schema.ts"
      provides: "deliveryFee optional field on orders table"
      contains: "deliveryFee"
    - path: "convex/orders/mutations/orderCrud.ts"
      provides: "updateDeliveryFee mutation"
      exports: ["updateDeliveryFee"]
    - path: "src/components/orders/OrderItems.tsx"
      provides: "Delivery fee line item display + inline edit input"
      min_lines: 130
    - path: "src/pages/OrderDetail.tsx"
      provides: "Delivery fee prop wired to OrderItems"
  key_links:
    - from: "src/components/orders/OrderItems.tsx"
      to: "convex/orders/mutations/orderCrud.ts"
      via: "useMutation(api.orders.mutations.index.updateDeliveryFee)"
      pattern: "updateDeliveryFee"
    - from: "convex/orders/mutations/orderCrud.ts"
      to: "convex/schema.ts"
      via: "ctx.db.patch with deliveryFee field"
      pattern: "deliveryFee"
    - from: "convex/orders/whatsapp.ts"
      to: "orders.deliveryFee"
      via: "order.deliveryFee in buildTemplateVariables and hardcoded templates"
      pattern: "deliveryFee"
---

<objective>
Add a manually-entered delivery fee field to orders that displays as a line item below order sub-totals, is included in the final order total, and appears in WhatsApp messages sent to customers.

Purpose: Staff manually quote GoSend delivery prices and need to record them on the order so customers see the full cost breakdown in receipts and payment requests.
Output: deliveryFee field on orders schema, updateDeliveryFee mutation, inline edit input in OrderItems component, WhatsApp template variable integration.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./convex/schema.ts
@./convex/orders/mutations/orderCrud.ts
@./convex/orders/mutations/index.ts
@./convex/orders/whatsapp.ts
@./src/lib/types.ts
@./src/lib/transforms.ts
@./src/hooks/convex/useOrders.ts
@./src/components/orders/OrderItems.tsx
@./src/pages/OrderDetail.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + Backend — deliveryFee field and updateDeliveryFee mutation</name>
  <files>
    convex/schema.ts
    convex/orders/mutations/orderCrud.ts
    convex/orders/mutations/index.ts
  </files>
  <action>
**convex/schema.ts** — Add `deliveryFee: v.optional(v.number())` to the `orders` table definition. Place it after the `finalTotal` field (line ~351), with a comment: `// Manually entered GoSend delivery fee. Separate from product costs. Included in finalTotal.`

**convex/orders/mutations/orderCrud.ts** — Add a new exported mutation `updateDeliveryFee` at the end of the file (before the closing of the file, after `copyFromCancelled`):

```typescript
/**
 * Set or clear the delivery fee on an order.
 * deliveryFee is separate from product costs and is added on top of finalTotal.
 * Can be set on any non-terminal order status.
 */
export const updateDeliveryFee = mutation({
  args: {
    orderId: v.id("orders"),
    deliveryFee: v.number(), // Pass 0 to clear
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (["Cancelled", "Complete"].includes(order.status)) {
      throw new Error("Cannot update delivery fee on completed or cancelled orders");
    }

    // finalTotal = (totalAmount - discounts - voucherDiscount) + deliveryFee
    // Recalculate: start from existing finalTotal logic then add deliveryFee
    // The existing finalTotal already accounts for discounts; we need to strip
    // the old deliveryFee from it and add the new one.
    const oldDeliveryFee = order.deliveryFee ?? 0;
    const newFinalTotal = (order.finalTotal - oldDeliveryFee) + args.deliveryFee;

    await ctx.db.patch(args.orderId, {
      deliveryFee: args.deliveryFee === 0 ? undefined : args.deliveryFee,
      finalTotal: newFinalTotal,
    });

    return args.orderId;
  },
});
```

**convex/orders/mutations/index.ts** — Export `updateDeliveryFee` from `./orderCrud` in the "Order CRUD" export block.
  </action>
  <verify>
    Run `npm run type-check` — no TypeScript errors. Confirm `updateDeliveryFee` appears in `convex/_generated/api.d.ts` after `npx convex dev` regenerates types.
  </verify>
  <done>
    Schema has `deliveryFee: v.optional(v.number())` on orders table. `updateDeliveryFee` mutation is callable via `api.orders.mutations.index.updateDeliveryFee`. finalTotal recalculation strips old fee and adds new fee atomically.
  </done>
</task>

<task type="auto">
  <name>Task 2: WhatsApp + Types/Transforms/Hook — delivery fee in messages and frontend plumbing</name>
  <files>
    convex/orders/whatsapp.ts
    src/lib/types.ts
    src/lib/transforms.ts
    src/hooks/convex/useOrders.ts
  </files>
  <action>
**convex/orders/whatsapp.ts** — In `buildTemplateVariables`, add a `{delivery_fee}` variable. After the `finalTotalFormatted` line, compute:

```typescript
const deliveryFeeFormatted = order.deliveryFee && order.deliveryFee > 0
  ? formatCurrency(order.deliveryFee)
  : "";
```

Add to the returned object: `"{delivery_fee}": deliveryFeeFormatted`

Also update the hardcoded `generatePaymentRequest` and `generateReceipt` functions to show delivery fee as a separate line item when set. In `generatePaymentRequest`, change the total block to:

```
*Subtotal: {subtotalFormatted}*
{deliveryFeeLine}{discountNote ? `\n${discountNote}` : ""}
*Total yang harus dibayar: ${finalTotalFormatted}*
```

Where `deliveryFeeLine` is:
```typescript
const subtotal = order.totalAmount;
const subtotalFormatted = formatCurrency(subtotal);
const deliveryFeeLine = order.deliveryFee && order.deliveryFee > 0
  ? `🚚 Ongkir: ${formatCurrency(order.deliveryFee)}\n`
  : "";
```

Apply same pattern in `generateReceipt` — add delivery fee as a line between `Order Total` and `Final Total`:
```
*Total: {finalTotalFormatted}*
...
🚚 Ongkir: {deliveryFeeFormatted}    ← only if deliveryFee > 0
```

Note: `OrderWithItems` type is imported from `./types` — check `convex/orders/types.ts` to see if `deliveryFee` needs to be added there. If `OrderWithItems` extends the Convex DB document type directly, it should pick up `deliveryFee` automatically from schema. If it's manually typed, add `deliveryFee?: number`.

**src/lib/types.ts** — Add `delivery_fee: number | null;` to the `OrderDetail` interface, after `final_total`.

**src/lib/transforms.ts** — In `transformToOrderDetail`, add:
```typescript
delivery_fee: order.deliveryFee ?? null,
```
in the returned object (after `final_total`). Also add `deliveryFee?: number` to `ConvexOrderDetail` interface and `ConvexOrderBase` if it's missing.

**src/hooks/convex/useOrders.ts** — Add `useConvexUpdateOrderDeliveryFee` hook after `useConvexUpdateOrderShipping`:

```typescript
export function useConvexUpdateOrderDeliveryFee() {
  const mutation = useMutation(api.orders.mutations.index.updateDeliveryFee);

  const execute = async (data: { orderId: Id<"orders">; deliveryFee: number }) => {
    try {
      await mutation(data);
      toast.success("Delivery fee updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update delivery fee"));
      throw error;
    }
  };

  return { mutate: execute };
}
```

Also export `useConvexUpdateOrderDeliveryFee` from `src/hooks/convex/index.ts` if it exists.
  </action>
  <verify>
    Run `npm run type-check` — no TypeScript errors. Confirm `delivery_fee` appears in `OrderDetail` type and is passed through `transformToOrderDetail`.
  </verify>
  <done>
    `delivery_fee` field flows from schema → transform → OrderDetail type. `useConvexUpdateOrderDeliveryFee` hook is usable. WhatsApp templates show `🚚 Ongkir: Rp X` line when delivery fee is set.
  </done>
</task>

<task type="auto">
  <name>Task 3: Frontend UI — delivery fee display and inline edit in OrderItems + OrderDetail</name>
  <files>
    src/components/orders/OrderItems.tsx
    src/pages/OrderDetail.tsx
  </files>
  <action>
**src/components/orders/OrderItems.tsx** — Add `deliveryFee` and `onDeliveryFeeChange` props:

```typescript
interface OrderItemsProps {
  items: OrderItem[];
  totalAmount: number;
  totalDiscount?: number;
  voucherCode?: string | null;
  voucherDiscountValue?: number | null;
  finalTotal?: number | null;
  // New: delivery fee props
  deliveryFee?: number | null;
  orderId?: Id<"orders">;  // needed to save delivery fee
  canEditDeliveryFee?: boolean;  // show edit input only on non-terminal orders
}
```

Add imports at top: `import { useState } from 'react'`, `import { Input } from '@/components/ui/input'`, `import { Button } from '@/components/ui/button'`, `import { useMutation } from 'convex/react'`, `import { api } from '../../../convex/_generated/api'`, `import type { Id } from '../../../convex/_generated/dataModel'`, `import { toast } from 'sonner'`.

Inside the component, add delivery fee editing state:
```typescript
const [editingFee, setEditingFee] = useState(false);
const [feeInput, setFeeInput] = useState("");
const updateDeliveryFee = useMutation(api.orders.mutations.index.updateDeliveryFee);
```

Update `displayTotal` to account for delivery fee:
```typescript
const deliveryFeeAmount = deliveryFee ?? 0;
const displayTotal = finalTotal ?? (totalAmount - (voucherDiscountValue ?? 0) + deliveryFeeAmount);
```

In the totals section, after discounts/voucher lines and before the Final Total separator, add the delivery fee section:

```tsx
{/* Delivery Fee line — always show when canEditDeliveryFee, show value when set */}
{(canEditDeliveryFee || (deliveryFee && deliveryFee > 0)) && (
  <div className="flex justify-between items-center text-sm">
    <span className="text-muted-foreground flex items-center gap-1">
      🚚 Delivery Fee
    </span>
    <div className="flex items-center gap-1">
      {editingFee ? (
        <>
          <Input
            type="number"
            className="h-6 w-28 text-xs text-right"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            placeholder="0"
            min={0}
            autoFocus
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={async () => {
              if (!orderId) return;
              try {
                const fee = parseFloat(feeInput) || 0;
                await updateDeliveryFee({ orderId, deliveryFee: fee });
                setEditingFee(false);
              } catch {
                toast.error("Failed to save delivery fee");
              }
            }}
          >Save</Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setEditingFee(false)}
          >Cancel</Button>
        </>
      ) : (
        <>
          <span>
            {deliveryFee && deliveryFee > 0 ? formatCurrency(deliveryFee) : "—"}
          </span>
          {canEditDeliveryFee && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setFeeInput(deliveryFee ? String(deliveryFee) : "");
                setEditingFee(true);
              }}
            >Edit</Button>
          )}
        </>
      )}
    </div>
  </div>
)}
```

Place this block AFTER the voucher line and BEFORE the `<Separator />` that precedes the Final Total. The Final Total label should remain "Final Total" when a delivery fee is set (it already includes it via `displayTotal`).

**src/pages/OrderDetail.tsx** — Import `useConvexUpdateOrderDeliveryFee` (or use `useMutation` directly — prefer the hook pattern). Pass `deliveryFee` and `canEditDeliveryFee` to `<OrderItems>`:

```tsx
<OrderItems
  items={order.items}
  totalAmount={order.total_amount}
  totalDiscount={order.total_discount}
  voucherCode={order.voucher_code}
  voucherDiscountValue={order.voucher_discount_value}
  finalTotal={order.final_total}
  deliveryFee={order.delivery_fee}
  orderId={orderId}
  canEditDeliveryFee={!['Cancelled', 'Complete'].includes(order.status)}
/>
```

Since `OrderItems` now uses `useMutation` internally (direct pattern), the `orderId` prop is sufficient — no separate handler needed in OrderDetail.
  </action>
  <verify>
    Run `npm run build` — must pass with zero errors. Manually verify in browser:
    1. Open any non-complete, non-cancelled order in OrderDetail
    2. The "🚚 Delivery Fee" line appears in the Items card with an "Edit" button
    3. Click Edit, enter 25000, click Save — the line updates to "Rp 25.000" and Final Total increases by 25.000
    4. Click Edit again and set to 0 — fee clears (shows "—")
    5. Refresh page — the delivery fee persists
  </verify>
  <done>
    OrderItems card shows delivery fee row below discounts/vouchers. Edit button opens inline number input. Save calls `updateDeliveryFee` mutation. Final Total reflects product costs - discounts + delivery fee. The row is hidden on Cancelled/Complete orders (read-only mode shows value if set, no edit button).
  </done>
</task>

</tasks>

<verification>
- `npm run type-check` passes
- `npm run build` passes (tsc + vite)
- Schema has `deliveryFee: v.optional(v.number())` on orders table
- `updateDeliveryFee` mutation exported from `convex/orders/mutations/index.ts`
- `OrderDetail.delivery_fee` field in `src/lib/types.ts`
- `OrderItems` renders delivery fee line item with edit capability
- WhatsApp templates include delivery fee line when fee > 0
</verification>

<success_criteria>
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes
- [ ] Setting delivery fee on an order updates `finalTotal = (totalAmount - discounts) + deliveryFee`
- [ ] Delivery fee displays as a separate line item in the Items card on OrderDetail
- [ ] Edit/Save inline flow works without page refresh
- [ ] Delivery fee persists after page refresh
- [ ] WhatsApp payment_request and receipt templates show `🚚 Ongkir: Rp X` when fee is set
- [ ] Orders with no delivery fee are unaffected (finalTotal unchanged)
</success_criteria>

## Git Workflow
**Branch:** `feature/quick-18-delivery-fee`

Create branch before starting:
```bash
git switch main && git pull
git switch -c feature/quick-18-delivery-fee
```

## Documentation Updates
- [ ] `docs/CHANGELOG.md` — Add entry for delivery fee feature

<output>
After completion, create `.planning/quick/18-add-delivery-fee-input-field-to-orders-w/18-SUMMARY.md` using the summary template.
</output>
